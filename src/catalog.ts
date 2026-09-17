import {mkdir,writeFile,readFile,readdir,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha} from './story.ts';

export type SaveOwner={adapter:string;threadId:string;hostLabel:string};
type SaveSummary={id:string;title:string;updatedAt:string;deleted?:boolean};
type RecordFile={version?:number;id:string;adapter?:string;threadId?:string;hostLabel?:string;url:string;title?:string;updatedAt?:string;saveId?:string;deleted:boolean;hasSave:boolean};
export const catalogId=(owner:Pick<SaveOwner,'adapter'|'threadId'>)=>sha(`${owner.adapter}\0${owner.threadId}`);
export function localEndpoint(value:string){
  const url=new URL(value),token=new URLSearchParams(url.hash.slice(1)).get('token');
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||!token||!/^[a-f0-9]{64}$/.test(token))throw Error('无效的本机存档地址');
  return {origin:url.origin,token};
}
export async function registerSave(dir:string|undefined,owner:SaveOwner,url:string,save:SaveSummary|null){
  if(!dir)return;
  localEndpoint(url);
  await mkdir(dir,{recursive:true});
  const id=catalogId(owner),file=join(dir,id+'.json'),temp=join(dir,`${id}.${randomUUID()}.tmp`);
  const record:RecordFile={version:2,id,...owner,url,title:save?.title,updatedAt:save?.updatedAt,saveId:save?.id,deleted:save?.deleted??false,hasSave:!!save};
  try{
    await writeFile(temp,JSON.stringify(record),{mode:0o600});
    // Windows can briefly deny replacement while another process reads/replaces the index.
    for(let attempt=0;;attempt++)try{await rename(temp,file);break;}catch(error:any){
      if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=7)throw error;
      await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));
    }
  }finally{await rm(temp,{force:true});}
}
async function readRecord(dir:string,id:string):Promise<RecordFile>{
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('无效的存档标识');
  const record=JSON.parse(await readFile(join(dir,id+'.json'),'utf8')) as RecordFile;
  if(record.id!==id)throw Error('存档索引身份不一致');
  localEndpoint(record.url);
  if(record.version===2&&(!record.adapter||!record.threadId||catalogId({adapter:record.adapter,threadId:record.threadId})!==id))throw Error('存档来源不一致');
  return record;
}
async function localJson(record:RecordFile,path:string){
  const {origin,token}=localEndpoint(record.url);
  const response=await fetch(origin+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(1200),redirect:'error'});
  if(!response.ok)throw Error('原任务服务不可用');
  return await response.json() as any;
}
// Old bridges have no identity in /health. Read their bound state once; never infer a host from a title.
async function inspect(record:RecordFile){
  let health=await localJson(record,'/api/health');
  if(!health.adapter||!health.threadId){
    const state=await localJson(record,'/api/state?after=2147483647');
    const game=await localJson(record,'/api/game');
    health={...health,adapter:state.adapter,threadId:state.thread?.id,hostLabel:game.hostLabel,save:game.save,deleted:game.deleted};
  }
  if(typeof health.adapter!=='string'||typeof health.threadId!=='string')throw Error('原任务身份无法核对');
  if(record.version===2?health.adapter!==record.adapter||health.threadId!==record.threadId:sha(health.threadId)!==record.id)throw Error('原任务身份已改变，拒绝切换');
  return health;
}
export async function resolveSave(dir:string|undefined,id:string){
  if(!dir)throw Error('共享存档未启用');
  const record=await readRecord(dir,id);
  if(record.deleted||!record.hasSave)throw Error('网页存档已删除或尚未建立');
  const health=await inspect(record);
  if(health.deleted||!health.save)throw Error('网页存档已删除或尚未建立');
  return {record,health,...localEndpoint(record.url)};
}
export async function listSaves(dir:string|undefined,owner:SaveOwner,currentSave:SaveSummary|null,currentConnected:boolean){
  let files:string[]=[];if(dir)try{files=await readdir(dir);}catch{}
  const records=(await Promise.all(files.filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(async f=>{try{return await readRecord(dir!,f.slice(0,-5));}catch{return null;}}))).filter((r):r is RecordFile=>!!r);
  // A v2 record supersedes the old unnamespaced record, including deletion tombstones.
  const upgraded=new Set(records.filter(r=>r.version===2).map(r=>sha(r.threadId!)));
  const saves=await Promise.all(records.filter(r=>!r.deleted&&r.hasSave&&(r.version===2||!upgraded.has(r.id))).map(async record=>{
    let health:any;try{health=await inspect(record);}catch{}
    if(health&&(health.deleted||!health.save))return null;
    const current=record.version===2?record.id===catalogId(owner):health?.adapter===owner.adapter&&health?.threadId===owner.threadId;
    const save=health?.save;
    return {id:record.id,saveId:save?.id??record.saveId,title:save?.title??record.title??'未命名创意',updatedAt:save?.updatedAt??record.updatedAt??'',adapter:health?.adapter??record.adapter??'unknown',hostLabel:health?.hostLabel??record.hostLabel??'原 Agent（旧版存档）',current,available:!!health,connected:!!health?.connected};
  }));
  const visible=saves.filter((s):s is NonNullable<typeof s>=>!!s);
  if(currentSave&&!currentSave.deleted&&!visible.some(s=>s.current))visible.push({id:catalogId(owner),saveId:currentSave.id,title:currentSave.title,updatedAt:currentSave.updatedAt,...owner,current:true,available:true,connected:currentConnected});
  return {saves:visible.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),scope:'local-user'};
}

// Only browser operations, never arbitrary URLs, publication, shutdown or recursive proxying.
export function allowedSessionRequest(method:string,path:string){
  const pathname=path.split('?')[0];
  const routes:Record<string,string[]>={GET:['/api/game','/api/game/document'],POST:['/api/game/start','/api/game/lease','/api/messages','/api/reconnect','/api/open-host'],PUT:['/api/game/settings','/api/game/position','/api/draft'],DELETE:['/api/game/save']};
  return routes[method]?.includes(pathname)||(method==='GET'&&/^\/api\/game\/resource\/(image|document)\/[\w-]+\/[\w-]+$/.test(pathname));
}
