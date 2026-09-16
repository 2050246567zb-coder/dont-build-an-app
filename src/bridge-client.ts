import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
export async function bridgeClient(runtimePath:string){
  const runtime=JSON.parse(await readFile(runtimePath,'utf8')),url=new URL(runtime.url);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('只允许本机桥接服务');
  if(process.env.CODEX_THREAD_ID && process.env.CODEX_THREAD_ID!==runtime.threadId)throw Error('该运行实例属于另一个原任务');
  const token=new URLSearchParams(url.hash.slice(1)).get('token');
  const request=async(path:string,method='GET',body?:unknown)=>{
    const response=await fetch(url.origin+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const value=await response.json() as any;if(!response.ok)throw Error(value.error||'桥接请求失败');return value;
  };
  const state=await request('/api/state?after=2147483647');if(state.thread.id!==runtime.threadId)throw Error('运行实例身份不一致');
  return request;
}
export async function readSceneFile(path:string){
  const data=JSON.parse(await readFile(path,'utf8'));
  for(const a of data.assets??[]){if(a.file_path){a.data_base64=(await readFile(resolve(dirname(path),a.file_path))).toString('base64');delete a.file_path;}}
  for(const d of data.documents??[]){if(d.file_path){d.markdown=await readFile(resolve(dirname(path),d.file_path),'utf8');delete d.file_path;}}
  return data;
}
