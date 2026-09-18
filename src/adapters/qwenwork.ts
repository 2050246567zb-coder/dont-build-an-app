import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {homedir} from 'node:os';
import type {HistoryReader,HostAdapter} from './types.ts';
import type {HostMessage} from './rollout.ts';

export function qwenPaths(env:NodeJS.ProcessEnv=process.env){
  const home=env.GALGAME_QWEN_HOME||join(homedir(),'.qwenworkcn');
  const data=env.GALGAME_QWEN_DATABASE||(process.platform==='win32'&&env.APPDATA?join(env.APPDATA,'QwenWorkCN','data','agents.db'):undefined);
  if(!data)throw Error('此平台的千问办公消息库路径尚未验证，请设置 GALGAME_QWEN_DATABASE。');
  return {config:join(home,'mcp-adaptor.config'),database:data};
}
export function qwenOrigin(value:string){
  const u=new URL(value);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('千问连接器必须是仅限 127.0.0.1 的本机地址');
  return u.origin;
}
const receipt=/\n\n<!-- galgame-receipt:([a-f0-9-]{36}) -->$/i;
export function qwenMessage(row:any):HostMessage|undefined{
  const parts=JSON.parse(row.parts),meta=JSON.parse(row.metadata||'{}');
  if(!Array.isArray(parts)||!['user','assistant'].includes(row.role)||typeof row.message_id!=='string'||!Number.isSafeInteger(row.sequence)||!Number.isFinite(row.created_at))throw Error('千问办公消息库格式不兼容');
  let text:string;
  if(row.role==='assistant'){
    // The connector's task summary merges commentary and truncates at 2000 chars.
    // Only the host's explicit completed finalTextId is a final reply.
    if(meta.status!=='completed'||typeof meta.finalTextId!=='string')return;
    const final=parts.find(p=>p.type==='text'&&p.id===meta.finalTextId);
    if(typeof final?.text!=='string')throw Error('千问办公正式回复尚未完整写入');
    text=final.text;
  }else text=parts.filter(p=>p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n');
  const match=row.role==='user'?receipt.exec(text):null;
  if(match)text=text.slice(0,match.index);
  if(!text)return;
  return {id:`qw-${row.message_id}`,role:row.role,text,ordinal:row.sequence,timestamp:new Date(row.created_at*1000).toISOString(),phase:row.role==='user'?'user':'final',kind:'native',...(match?{submissionId:match[1]}:{})};
}
export class QwenWorkAdapter implements HostAdapter,HistoryReader{
  readonly name='qwenwork-local-connector';
  readonly label='千问办公原任务（实验）';
  readonly reader=this;
  private db:DatabaseSync;
  private requestId=0;
  constructor(readonly threadId:string,private paths=qwenPaths()){
    if(!/^[a-zA-Z0-9_-]{8,80}$/.test(threadId))throw Error('缺少有效的千问办公原任务 ID');
    this.db=new DatabaseSync(paths.database,{readOnly:true});
    this.db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1500;');
  }
  async rpc(method:string,params:any){
    // Re-read the app's own local token after restart; never copy it to web UI/logs.
    const c=JSON.parse(await readFile(this.paths.config,'utf8')),origin=qwenOrigin(c.url);
    const key=c.headers?.['x-api-key'];
    if(typeof key!=='string'||!key)throw Error('千问本机连接器未提供授权信息');
    const r=await fetch(origin,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({jsonrpc:'2.0',id:++this.requestId,method,params}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error(`千问本机连接器 HTTP ${r.status}`);
    const result=await r.json() as any;
    if(result.error||result.result?.isError)throw Error('千问本机连接器拒绝请求；请检查连接器是否启用');
    return result.result;
  }
  async tool(name:string,args:any){
    const r=await this.rpc('tools/call',{name,arguments:args});
    const data=r.structuredContent||JSON.parse(r.content.find((c:any)=>c.type==='text').text);
    if(data.ok!==true)throw Error(data.error||'千问任务接口未返回成功结果');
    return name==='qw_action'?data:data.data;
  }
  async capabilities(){
    const r=await this.rpc('tools/list',{});
    if(!['qw_query','qw_action'].every(name=>r.tools?.some((t:any)=>t.name===name)))throw Error('千问办公连接器缺少任务查询/发送工具');
    return [{name:'send_message_to_thread',namespace:'qwenwork',inputSchema:{}}];
  }
  async readThread(){
    const local=this.db.prepare('SELECT id,name FROM chats WHERE id=? AND deleted_at IS NULL').get(this.threadId) as any;
    if(!local)throw Error('千问办公本机消息库不存在此原任务');
    const d=await this.tool('qw_query',{key:`qwenwork.tasks.${this.threadId}`,params:{limit:1}});
    if(d.chatId!==this.threadId)throw Error('千问办公原任务身份不匹配');
    return {thread:{id:local.id,title:local.name,status:{type:d.status==='running'||d.pendingRequest?'inProgress':'idle',hostState:d.status}}};
  }
  async poll(emit:(m:HostMessage)=>void){
    // Scope all queries to the bound chat. Never modify the host database.
    const subs=this.db.prepare('SELECT id FROM sub_chats WHERE chat_id=?').all(this.threadId);
    if(subs.length!==1)throw Error('千问任务含多个执行线程，当前适配未验证这种历史结构');
    const rows=this.db.prepare('SELECT message_id,sequence,role,parts,metadata,created_at FROM messages WHERE chat_id=? ORDER BY sequence').all(this.threadId);
    const messages=rows.map(qwenMessage).filter((m):m is HostMessage=>!!m);
    for(const m of messages)emit(m);
  }
  async send(text:string,submissionId?:string){
    if(!submissionId||!/^[a-f0-9-]{36}$/i.test(submissionId))throw Object.assign(Error('发送需要唯一的网页提交标识'),{notSent:true});
    const host=await this.readThread().catch(e=>{throw Object.assign(e,{notSent:true});});
    if(host.thread.status.type!=='idle')throw Object.assign(Error('千问原任务正在运行或等待确认，请先在原窗口处理'),{notSent:true});
    // Host API has no client request ID. Attach one explicit transport receipt;
    // never confirm by text similarity or resend an uncertain request.
    const result=await this.tool('qw_action',{key:`qwenwork.tasks.${this.threadId}`,action:'execute',params:{operation:'send_message',message:`${text}\n\n<!-- galgame-receipt:${submissionId} -->`}});
    if(result.key!==`qwenwork.tasks.${this.threadId}`)throw Error('千问发送回执的原任务不一致');
    return {threadId:this.threadId,acknowledged:true};
  }
  close(){this.db.close();}
}
