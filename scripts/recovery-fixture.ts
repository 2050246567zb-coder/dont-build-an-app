// A deterministic interrupted conversation; no Agent or model request is made.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {startServer} from '../src/server.ts';
import {Game} from '../src/game.ts';
import type {HostMessage} from '../src/adapters/rollout.ts';
const dir=resolve(process.argv[2]||'.galgame/recovery-fixture-'+Date.now()),threadId='11111111-1111-1111-1111-111111111111',messages:HostMessage[]=[];
await mkdir(dir,{recursive:true});let game:Game;
function message(role:'user'|'assistant',text:string,submissionId?:string){messages.push({id:'m_'+messages.length,role,text,submissionId,ordinal:messages.length+1,timestamp:new Date().toISOString(),phase:role==='assistant'?'final_answer':'',kind:'native'});}
const app=await startServer({dataDir:dir,port:0,quiet:true,hostLabel:'中断恢复演示（无模型）',adapter:{name:'recovery-fixture',threadId,capabilities:async()=>[{name:'send_message_to_thread',namespace:'fixture',inputSchema:{}}],reader:{async poll(fn){messages.forEach(fn);}},readThread:async()=>({thread:{id:threadId,title:'原窗口打断后的续聊测试',status:{type:'idle'}}}),close(){},async send(text,id){
  message('user',text,id);await app.poll();
  const result=game.stage({schema_version:'1.0',turn_id:'resume_'+messages.length,stage:'design',segments:[{segment_id:'jobs',speaker:'jobs',text:'好，接着你刚才改过的想法说。先别往上加功能，你自己最想省掉哪一步？',advance:'reply',emotion:'skeptical'}]});message('assistant',result.finalText);await app.poll();return {threadId};
}}});
game=new Game(app.store,threadId,dir,'原窗口打断后的续聊测试');game.start();game.preferences({speed:0,imageMode:'builtin'});
game.stage({schema_version:'1.0',turn_id:'interrupted_scene',stage:'design',segments:[{segment_id:'old',speaker:'jobs',text:'这段未发布的台词不该挡住后续。',advance:'reply'}]});
message('user','等一下，我想先做给自己用。');message('assistant','可以，那我们先按**自用工具**继续。\n\n先看看你每天最费时间的那一步，不必再设计团队协作。');await app.poll();game.position('m_1');
await writeFile(join(dir,'entry.json'),JSON.stringify({url:app.url},null,2));console.log(JSON.stringify({url:app.url,fixture:'no-model'}));
process.once('SIGINT',()=>void app.close().then(()=>process.exit()));
