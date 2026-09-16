import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CodexPipe } from './adapters/codex-pipe.ts';
import { findRollout, RolloutReader } from './adapters/rollout.ts';
import { Store } from './store.ts';
import type { HostAdapter } from './adapters/types.ts';
import { evidence } from './evidence.ts';
import { visibleCodexUserText } from './adapters/codex-text.ts';

const webRoot = fileURLToPath(new URL('../web/',import.meta.url));
type ServerOptions = { dataDir:string;port:number; adapter?:HostAdapter;rolloutPath?:string;quiet?:boolean;pollMs?:number;heartbeatMs?:number };

function json(response: http.ServerResponse, code: number, value: unknown) {
  response.writeHead(code, { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store' });
  response.end(JSON.stringify(value));
}
async function body(request: http.IncomingMessage): Promise<any> {
  const chunks:Buffer[]=[];let size=0;
  for await (const chunk of request) { size+=chunk.length;if(size>100_000)throw Object.assign(new Error('Request too large'),{statusCode:413});chunks.push(chunk); }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');}
  catch{throw Object.assign(new Error('Invalid JSON body'),{statusCode:400});}
}
function authorized(request: http.IncomingMessage, token: string): boolean {
  const actual = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual,expected);
}

export async function startServer(options: ServerOptions) {
  const threadId = options.adapter?.threadId ?? process.env.CODEX_THREAD_ID;
  const pipePath = process.env.CODEX_APP_TOOLS_PIPE_PATH;
  const codexHome = process.env.CODEX_HOME;
  if (!threadId || (!options.adapter && (!pipePath || !codexHome))) throw new Error('必须从现有 Codex 桌面会话启动；不会创建新会话。');
  const adapter = options.adapter ?? new CodexPipe(pipePath!,threadId);
  const {host,reader,store}=await (async()=>{
    try{
      const capabilities = await adapter.capabilities();
      if (!capabilities.some(t=>t.name==='send_message_to_thread')) throw new Error('当前宿主缺少原会话发送能力');
      const host = await adapter.readThread();
      if (host.thread?.id !== threadId) throw new Error('原会话身份校验失败');
      const reader = new RolloutReader(options.rolloutPath ?? await findRollout(codexHome!,threadId));
      return {host,reader,store:new Store(join(options.dataDir,'state.sqlite'))};
    }catch(error){adapter.close();throw error;}
  })();
  const token = randomBytes(32).toString('hex');
  let connected = true, hostStatus = host.thread.status, lastError: string | null = null;
  let hostPoll = false, submitting = false,closing=false;
  let activePoll:Promise<void>|undefined;
  const poll = async () => {
    if(closing)return;
    if(activePoll)return activePoll;
    activePoll=(async()=>{await reader.poll(message => store.addMessage(threadId,message));store.reconcile(threadId);})().finally(()=>{activePoll=undefined;});
    return activePoll;
  };
  try{await poll();}catch(error){adapter.close();store.close();throw error;}
  const state = (after = 0) => ({
    adapter:'codex-desktop-app-tools', compatibility:'experimental', thread:{id:threadId,title:host.thread.title},
    connected, hostStatus, lastError, messages:store.messages(threadId,after).map(message => ({
      ...message,
      displayText:message.role==='user' && message.kind==='native' ? visibleCodexUserText(message.text) : message.text,
    })), submissions:store.submissions(threadId),
    draft:store.get(`draft:${threadId}`,''), serverTime:new Date().toISOString(),
    latestMessageId:store.messages(threadId).at(-1)?.id ?? null,
    draftBaseMessageId:store.get(`draft-base:${threadId}`,null),
  });
  const server = http.createServer(async (request,response) => {
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      const origin = `http://127.0.0.1:${port}`;
      if (request.headers.host !== `127.0.0.1:${port}` || (request.headers.origin && request.headers.origin !== origin)) return json(response,403,{error:'Origin not allowed'});
      const url = new URL(request.url ?? '/',origin);
      response.setHeader('X-Content-Type-Options','nosniff');
      response.setHeader('Referrer-Policy','no-referrer');
      if (url.pathname === '/' || url.pathname === '/verifier') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});
        return response.end(await readFile(join(webRoot,'verifier.html')));
      }
      if (['/verifier.js','/verifier.css'].includes(url.pathname)) {
        response.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});
        return response.end(await readFile(join(webRoot,url.pathname.slice(1))));
      }
      if (!authorized(request,token)) return json(response,401,{error:'需要从原 Agent 提供的启动链接进入'});
      if(request.method==='POST' && url.pathname==='/api/shutdown'){
        json(response,200,{stopping:true});setImmediate(()=>void close());return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        await poll();
        return json(response,200,state(Number(url.searchParams.get('after')) || 0));
      }
      if(request.method==='GET' && url.pathname==='/api/evidence'){
        response.setHeader('Content-Disposition','attachment; filename="galgame-sync-evidence.json"');
        return json(response,200,evidence(store,threadId));
      }
      if (request.method === 'POST' && url.pathname === '/api/messages') {
        const input = await body(request);
        if (typeof input.id !== 'string' || !/^[\w-]{8,100}$/.test(input.id) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20_000) return json(response,400,{error:'消息格式无效或过长'});
        const existing = store.submission(input.id);
        if (existing) return existing.text === input.text && existing.thread_id === threadId ? json(response,200,existing) : json(response,409,{error:'同一消息标识不能用于不同内容'});
        await poll();
        if(input.baseMessageId !== (store.messages(threadId).at(-1)?.id ?? null)) return json(response,409,{error:'原会话已有新消息，请先阅读最新消息再发送草稿'});
        if (submitting || store.submissions(threadId).some(s=>['submitting','accepted','unknown'].includes(s.status))) return json(response,409,{error:'上一条消息尚在确认，请先核对原会话'});
        if (!connected) return json(response,409,{error:'当前与原 Agent 断开，草稿仍保留'});
        submitting = true;
        store.beginSubmission(input.id,threadId,input.text);
        try {
          const result = await adapter.send(input.text);
          if(result.threadId !== threadId) throw new Error('Host acknowledgement has a different conversation identity');
          store.hostResult(input.id,result);
          store.setSubmission(input.id,'accepted');
          await poll();
          return json(response,202,{submission:store.submission(input.id),hostResult:result});
        } catch(error: any) {
          store.setSubmission(input.id,'unknown',error.message);
          return json(response,502,{error:'发送结果待核对，不会自动重发',id:input.id});
        } finally { submitting = false; }
      }
      if (request.method === 'PUT' && url.pathname === '/api/draft') {
        const input = await body(request);
        if (typeof input.text !== 'string' || input.text.length > 20_000) return json(response,400,{error:'Invalid draft'});
        store.put(`draft:${threadId}`,input.text);
        store.put(`draft-base:${threadId}`,typeof input.baseMessageId==='string'?input.baseMessageId:null);
        return json(response,200,{saved:true});
      }
      if (request.method === 'POST' && url.pathname === '/api/reconnect') {
        if(submitting || hostPoll)return json(response,409,{error:'正在提交或核对，请稍后再重连'});
        adapter.close();
        try{
          const result = await adapter.readThread();
          connected = result.thread?.id === threadId;
          if(!connected)throw new Error('Conversation identity mismatch');
          hostStatus=result.thread.status;lastError=null;
          await poll();
          return json(response,200,{connected});
        }catch(error:any){connected=false;lastError=error.message;throw error;}
      }
      return json(response,404,{error:'Not found'});
    } catch(error: any) { if (!response.headersSent) json(response,error.statusCode ?? 500,{error:error.message}); else response.end(); }
  });
  try{await new Promise<void>((resolveListen,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',()=>resolveListen());});}
  catch(error){adapter.close();store.close();throw error;}
  const address = server.address() as {port:number};
  const url = `http://127.0.0.1:${address.port}/#token=${token}`;
  try{
    await mkdir(options.dataDir,{recursive:true});
    await writeFile(join(options.dataDir,'runtime.json'),JSON.stringify({url,threadId,pid:process.pid,port:address.port},null,2),{mode:0o600});
  }catch(error){server.close();adapter.close();store.close();throw error;}
  const interval = setInterval(()=>{ void poll().catch(error=>{lastError=error.message;}); },options.pollMs ?? 1000);
  const heartbeat = setInterval(async()=>{
    if(hostPoll || closing || submitting)return; hostPoll=true;
    try{const result=await adapter.readThread();connected=result.thread?.id===threadId;if(!connected)throw new Error('Conversation identity mismatch');hostStatus=result.thread.status;lastError=null;}
    catch(error:any){connected=false;lastError=error.message;}
    finally{hostPoll=false;}
  },options.heartbeatMs ?? 5000);
  if(!options.quiet)console.log(JSON.stringify({url,threadId,compatibility:'experimental',message:'原会话身份已核对；完整同步验收仍需实际验证。'}));
  const close=async()=>{if(closing)return;closing=true;clearInterval(interval);clearInterval(heartbeat);await new Promise<void>(done=>server.close(()=>done()));adapter.close();await activePoll;store.close();};
  return {server,store,url,close,poll};
}
