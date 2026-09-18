import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
export function assertRuntimeTask(runtime:{threadId:string;adapter?:string},env:NodeJS.ProcessEnv=process.env){
  const host=env.GALGAME_HOST || (env.QODERWORK_SOURCE_CHAT_ID?'qwenwork':env.CODEBUDDY_SESSION_ID?'workbuddy':env.CODEX_THREAD_ID?'codex':null);
  if(!host)return; // Explicit per-task MCP config can carry only the runtime file.
  if(!['codex','workbuddy','qwenwork'].includes(host))throw Error('未知的原任务宿主');
  const current=host==='qwenwork'?env.QODERWORK_SOURCE_CHAT_ID:host==='workbuddy'?env.CODEBUDDY_SESSION_ID:env.CODEX_THREAD_ID;
  const expected=host==='qwenwork'?'qwenwork-local-connector':host==='workbuddy'?'workbuddy-desktop-cdp':'codex-desktop-app-tools';
  if(!current || current!==runtime.threadId || runtime.adapter && runtime.adapter!==expected)throw Error('该运行实例属于另一个原任务');
}
export async function bridgeClient(runtimePath:string){
  const runtime=JSON.parse(await readFile(runtimePath,'utf8')),url=new URL(runtime.url);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('只允许本机桥接服务');
  assertRuntimeTask(runtime);
  const token=new URLSearchParams(url.hash.slice(1)).get('token');
  const request=async(path:string,method='GET',body?:unknown)=>{
    const response=await fetch(url.origin+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const value=await response.json() as any;if(!response.ok)throw Error(value.error||'桥接请求失败');return value;
  };
  const state=await request('/api/state?after=2147483647');if(state.thread.id!==runtime.threadId || runtime.adapter && state.adapter!==runtime.adapter)throw Error('运行实例身份不一致');
  return request;
}
export async function readSceneFile(path:string){
  const data=JSON.parse(await readFile(path,'utf8'));
  for(const a of data.assets??[]){if(a.file_path){a.data_base64=(await readFile(resolve(dirname(path),a.file_path))).toString('base64');delete a.file_path;}}
  for(const d of data.documents??[]){if(d.file_path){d.markdown=await readFile(resolve(dirname(path),d.file_path),'utf8');delete d.file_path;}}
  return data;
}
