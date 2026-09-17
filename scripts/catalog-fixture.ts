// Two deterministic local hosts. This exercises UI routing, not real Agent compatibility.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {startServer} from '../src/server.ts';
import {Game} from '../src/game.ts';
import {registerSave} from '../src/catalog.ts';
import type {HostMessage} from '../src/adapters/rollout.ts';

const root=resolve(process.argv[2]||'.galgame/catalog-fixture-'+Date.now()),registryDir=join(root,'catalog');
await mkdir(root,{recursive:true});
const apps=[];
for(const name of ['Codex','WorkBuddy']){
  const dir=join(root,name),threadId='11111111-1111-1111-1111-111111111111',messages:HostMessage[]=[];
  let game:Game;
  const commit=(text:string)=>{
    const staged=game.stage({schema_version:'1.0',turn_id:'turn_'+messages.length,stage:'screening',segments:[{segment_id:'reply',speaker:'system',text,advance:'reply'}]});
    messages.push({id:'final_'+messages.length,role:'assistant',text:staged.finalText,timestamp:new Date().toISOString(),phase:'final_answer',ordinal:messages.length+1,kind:'native'});
  };
  const app=await startServer({dataDir:dir,registryDir,port:0,quiet:true,hostLabel:name+' 演示（无模型）',adapter:{name:name.toLowerCase()+'-fixture',threadId,reader:{async poll(fn){messages.forEach(fn);}},capabilities:async()=>[{name:'send_message_to_thread',namespace:'fixture',inputSchema:{}}],readThread:async()=>({thread:{id:threadId,title:name+' · 统一存档演示',status:{type:'idle'}}}),close(){},async send(text,submissionId){messages.push({id:'user_'+messages.length,role:'user',text,timestamp:new Date().toISOString(),phase:'',ordinal:messages.length+1,kind:'native',submissionId});commit(`${name} 演示收到啦。这条消息只进了我的存档，另一个存档不会收到。`);return {threadId:threadId};}}});
  game=new Game(app.store,threadId,dir,name+' · 统一存档演示');game.start();game.preferences({speed:0,imageMode:'builtin'});
  commit(`这里是 ${name} 的离线演示存档，没有连接模型。写一点草稿，再去另一个存档转转吧。`);await app.poll();apps.push(app);
}
await registerSave(registryDir,{adapter:'offline-fixture',threadId:'offline',hostLabel:'断线演示（无模型）'},'http://127.0.0.1:1/#token='+'0'.repeat(64),{id:'offline',title:'暂时断开的创意',updatedAt:new Date().toISOString()});
await writeFile(join(root,'entry.json'),JSON.stringify({url:apps[0].url,targets:apps.map(a=>a.url)},null,2));
console.log(JSON.stringify({url:apps[0].url,runtime:join(root,'entry.json'),fixture:'no-model'}));
process.once('SIGINT',()=>void Promise.all(apps.map(a=>a.close())).then(()=>process.exit()));
