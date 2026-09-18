import {randomUUID} from 'node:crypto';
import {WorkBuddyCdp} from './workbuddy-cdp.ts';
import type {HistoryReader,HostAdapter} from './types.ts';
import type {HostMessage} from './rollout.ts';

type Invoke=(method:'get'|'requests'|'sendPrompt',threadId:string,...args:unknown[])=>Promise<any>;
function textBlocks(message:any):string {
  return (message?.content??[]).filter((b:any)=>b.type==='text'&&typeof b.text==='string').map((b:any)=>b.text).join('\n');
}

/** WorkBuddy 5.5.6 retains commentary, tools, reasoning and terminal text in one
 * assistant message. Only the completed terminal text run is a final reply.
 * Use the persisted fork request identity: optimistic client IDs can change
 * when the desktop reloads its history.
 */
export function workBuddyMessages(request:any):HostMessage[]{
  const id=request?.identity?.forkRequestId || request?.conversationRequestId;
  if(typeof id!=='string' || !id || !Number.isFinite(request?.timestamp))return [];
  const timestamp=new Date(request.timestamp).toISOString(),ordinal=request.timestamp*2;
  const user=textBlocks(request.userMessage),out:HostMessage[]=[];
  if(user)out.push({id:`wb-${id}-u`,role:'user',text:user,timestamp,ordinal,phase:'user',kind:'native',submissionId:request.clientRequestId||request.id});
  if(request.state!=='completed')return out;
  const content=request.assistantMessage?.content;
  if(!Array.isArray(content))return out;
  const final:any[]=[];
  for(let i=content.length-1;i>=0;i--){if(content[i].type!=='text')break;final.unshift(content[i]);}
  const text=textBlocks({content:final});
  if(text)out.push({id:`wb-${id}-a`,role:'assistant',text,timestamp,ordinal:ordinal+1,phase:'final',kind:'native'});
  return out;
}

export class WorkBuddyHistory implements HistoryReader {
  constructor(private invoke:Invoke,readonly threadId:string){}
  async poll(onMessage:(message:HostMessage)=>void):Promise<void>{
    const requests=new Map<string,any>();let before:string|undefined;
    for(let count=0;count<50;count++){
      const page=await this.invoke('requests',this.threadId,{byteLength:1_000_000,...before?{beforeRequestId:before}:{}});
      if(!page || !Array.isArray(page.items) || typeof page.hasOlder!=='boolean')throw Error('WorkBuddy 历史格式不兼容');
      for(const r of page.items){if(typeof r.id!=='string')throw Error('WorkBuddy 缺少消息标识');requests.set(r.id,r);}
      if(!page.hasOlder){
        for(const r of [...requests.values()].sort((a,b)=>a.timestamp-b.timestamp))for(const m of workBuddyMessages(r))onMessage(m);
        return;
      }
      const next=page.items[0]?.id;
      if(!next || next===before)throw Error('WorkBuddy 历史仍在加载或分页不完整，请稍后重试');
      before=next;
    }
    throw Error('WorkBuddy 历史超过本次完整读取上限，未把不完整记录当作同步成功');
  }
}

export class WorkBuddyAdapter implements HostAdapter {
  readonly name='workbuddy-desktop-cdp';
  readonly label='WorkBuddy 原任务（实验）';
  readonly reader:WorkBuddyHistory;
  private cdp:WorkBuddyCdp;
  constructor(readonly threadId:string,origin:string){
    if(!/^[a-f0-9-]{36}$/i.test(threadId))throw Error('需要当前 WorkBuddy 原任务标识');
    this.cdp=new WorkBuddyCdp(origin);
    this.reader=new WorkBuddyHistory(this.cdp.invoke.bind(this.cdp),threadId);
  }
  async capabilities(){await this.readThread();return [{name:'send_message_to_thread',namespace:'workbuddy',inputSchema:{}}];}
  async readThread(){
    const value=await this.cdp.invoke('get',this.threadId);
    const info=value?.info;
    if(info?.id!==this.threadId || info.transport!=='local' || info.origin!=='desktop' || info.kind!=='task')throw Error('WorkBuddy 原任务身份不匹配，或不是本地桌面任务');
    return {thread:{id:info.id,title:info.title,status:{type:info.state==='idle'?'idle':'inProgress',hostState:info.state}}};
  }
  async send(text:string,submissionId=randomUUID()){
    const host=await this.readThread().catch(error=>{throw Object.assign(error,{notSent:true});});
    if(host.thread.status.type!=='idle')throw Object.assign(Error('WorkBuddy 原任务正在运行，请等待当前回复完成'),{notSent:true});
    const result=await this.cdp.invoke('sendPrompt',this.threadId,[{type:'text',text}],{clientRequestId:submissionId,clientTimestamp:Date.now(),emitUserMessage:true});
    if(result?.error || result?.errorCode || result?.success===false)throw Error(String(result.message || result.errorCode || 'WorkBuddy 拒绝发送'));
    return {threadId:this.threadId,clientRequestId:submissionId,acknowledged:true};
  }
  close(){this.cdp.close();}
}
