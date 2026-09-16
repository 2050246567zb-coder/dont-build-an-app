import {bridgeClient,readSceneFile} from './bridge-client.ts';
import {resolve} from 'node:path';
const runtime=process.argv[2],file=process.argv[3];
try{
  if(!runtime||!file)throw Error('用法: node dist/publish.js <runtime.json> <scene.json|--context>');
  const api=await bridgeClient(resolve(runtime));
  if(file==='--context'){const state=await api('/api/game');console.log(JSON.stringify({save:state.save,prefs:state.prefs,connected:state.connected,pending:state.pending},null,2));}
  else console.log(JSON.stringify(await api('/api/game/stage','POST',await readSceneFile(resolve(file))),null,2));
}catch(e:any){console.error(e.message);process.exitCode=1;}
