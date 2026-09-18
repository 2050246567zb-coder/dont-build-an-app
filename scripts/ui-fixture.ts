// Deterministic browser fixture. This does not connect to or create a model session.
import {mkdir,writeFile,appendFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {startServer} from '../src/server.ts';
import {Game} from '../src/game.ts';
import type {HostAdapter} from '../src/adapters/types.ts';
const dir=resolve(process.argv[2]||join('.galgame','ui-fixture-'+Date.now()));await mkdir(dir,{recursive:true});const log=join(dir,'host.jsonl');await appendFile(log,'');
const thread='11111111-1111-1111-1111-111111111111';let ordinal=Math.max(0,...(await readFile(log,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line).ordinal||0)),count=0;
const replyDelay=Math.min(30000,Math.max(1200,Number(process.env.GALGAME_FIXTURE_DELAY_MS)||1200));
const themePreview=process.env.GALGAME_FIXTURE_THEMES==='1';
const segment=(id:string,speaker:string,text:string,advance:string,emotion='neutral',document_id:string|null=null)=>({segment_id:id,speaker,text,advance,emotion,asset_id:null,document_id});
const adapter:HostAdapter={threadId:thread,capabilities:async()=>[{name:'send_message_to_thread',namespace:'codex_app',inputSchema:{}}],readThread:async()=>({thread:{id:thread,title:'离线界面测试 · 不连接模型',status:{type:'idle'}}}),close(){},openOriginal:async()=>({fixture:true}),send:async(text)=>{
  count++;await appendFile(log,JSON.stringify({timestamp:new Date().toISOString(),type:'response_item',ordinal:++ordinal,payload:{id:`fco_test_${count}`,type:'function_call_output',name:'send_message_to_thread',namespace:'codex_app',output:`<codex_delegation><source_thread_id>${thread}</source_thread_id><input>${text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</input></codex_delegation>`}})+'\n');
  setTimeout(()=>void response(),replyDelay);return {threadId:thread};}};
const app=await startServer({dataDir:dir,port:4318,adapter,rolloutPath:log,hostLabel:'离线界面测试（无模型）'});
const game=new Game(app.store,thread,dir,'离线界面测试 · 不连接模型');game.start();
count=app.store.submissions(thread).length;
async function commit(scene:any){const staged=game.stage(scene);await appendFile(log,JSON.stringify({timestamp:new Date().toISOString(),type:'response_item',ordinal:++ordinal,payload:{id:`msg_fixture_${ordinal}`,type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:staged.finalText}]}})+'\n');await app.poll();}
async function response(){
  if(themePreview&&count===1)await commit({schema_version:'1.0',turn_id:'jobs_theme_demo',stage:'design',segments:[{...segment('jobs_question','jobs','先别急着加功能。这个东西，你最想让人用完之后记住什么？只留下一件事。','reply','thinking'),choices:['用起来轻松有趣。','更快做出清晰的方案。'],progress:{value:35,nodes:[{id:'audience',label:'确定了核心人群：独立开发者',at:20},{id:'core',label:'确定了核心体验：对话式创作',at:35}]}}]});
  else if(count===(themePreview?2:1))await commit({schema_version:'1.0',turn_id:'handoff_demo',stage:'experience',segments:[segment('jobs_a','jobs','好，先把最重要的那件事做好。那些听起来很诱人的功能，你也舍得先放下。这件事聊清楚了。','click','approval'),segment('jobs_b','jobs','接下来请我们的用户代表：小黑和你聊一聊。','click'),segment('black_a','xiaohei','你们刚才聊的我看到了。听起来挺顺，可我不会捧着说明书用啊。','click','skeptical'),segment('black_b','xiaohei','我写了一大段，手滑关了窗口。再打开，文字还在吗？别让我白打。','reply','angry')]});
  else await commit({schema_version:'1.0',turn_id:'delivery_demo',stage:'delivery',design_closed:false,delivery_kind:'draft',segments:[segment('black_end','xiaohei','行，草稿能接着写，这个问题解决了。我觉得没啥好问的了，就这样吧。我帮你叫你的 AI 给你总结一下方案。','click','approval'),segment('system_end','system','这是一份用于界面检查的示例草案。它没有经过真实产品审查，不是你的正式方案。','complete','approval','demo_doc')],documents:[{id:'demo_doc',title:'界面验收示例文档',markdown:'# 界面验收示例文档\n\n这是离线夹具生成的演示数据，没有连接模型，也不冒充真实用户审查。\n\n## 目标\n检验文档阅读与下载内容一致，只有用户主动选择开始开发才发送指令。\n\n## 验收\n- 姓名和角色顺序正确。\n- 提问完成之前不能输入。\n- 刷新恢复草稿和播放位置。\n- 删除网页存档不会改变原宿主的消息。\n\n## 实施任务\n此文档仅用于测试，不应启动真实开发。'}]});
}
if(!game.get()?.turns.length&&process.env.GALGAME_FIXTURE_PROGRESS==='1'){
  for(const [speaker,stage] of [['system','screening'],['jobs','design'],['xiaohei','experience']])await commit({schema_version:'1.0',turn_id:`meter_${speaker}`,stage,segments:[0,35,100].map(value=>({...segment(`meter_${speaker}_${value}`,speaker,`离线视觉检查：${value}% 进度。填充应从底部上升；节点只是已确认事项的标记。`,value===100?'reply':'click'),progress:{value,nodes:value?[{id:'visual_demo',label:'演示节点，不代表实际产品结论',at:35}]:[]}}))});
}
if(!game.get()?.turns.length&&process.env.GALGAME_FIXTURE_STORY==='1'){for(const scene of (await import('./story-fixture-scenes.ts')).storyFixtureScenes)await commit(scene);}
if(!game.get()?.turns.length)await commit({schema_version:'1.0',turn_id:'welcome_demo',stage:'screening',segments:[segment('hello','system','这是离线界面测试，没有连接任何模型。你可以发送一条测试文字，检查乔布斯与小黑的交接。','reply')]});
await writeFile(resolve('.galgame','ui-fixture-runtime.json'),await (await import('node:fs/promises')).readFile(join(dir,'runtime.json')));
process.on('SIGINT',()=>void app.close().then(()=>process.exit()));
