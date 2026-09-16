import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {sha} from './story.ts';
export async function registerSave(dir:string|undefined,threadId:string,url:string,save:any){
  if(!dir)return;await mkdir(dir,{recursive:true});await writeFile(join(dir,sha(threadId)+'.json'),JSON.stringify({id:sha(threadId),url,title:save?.title,updatedAt:save?.updatedAt,deleted:save?.deleted??false,hasSave:!!save}),{mode:0o600});
}
export async function listSaves(dir:string|undefined,currentId:string,currentSave:any,currentConnected:boolean){
  if(!dir)return {saves:currentSave&&!currentSave.deleted?[{id:currentSave.id,title:currentSave.title,updatedAt:currentSave.updatedAt,current:true,connected:currentConnected}]:[]};
  let files:string[]=[];try{files=await readdir(dir);}catch{return {saves:[]};}
  const saves=await Promise.all(files.filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(async f=>{
    try{const record=JSON.parse(await readFile(join(dir,f),'utf8'));if(record.deleted||!record.hasSave)return null;
      const url=new URL(record.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')return null;
      let connected=false;try{const response=await fetch(url.origin+'/api/health',{headers:{Authorization:`Bearer ${new URLSearchParams(url.hash.slice(1)).get('token')}`},signal:AbortSignal.timeout(700)});const result=await response.json() as any;connected=response.ok&&result.connected&&!result.deleted;}catch{}
      const current=record.id===sha(currentId);return {...record,id:current?currentSave?.id:record.id,current,connected};
    }catch{return null;}
  }));return {saves:saves.filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
}
