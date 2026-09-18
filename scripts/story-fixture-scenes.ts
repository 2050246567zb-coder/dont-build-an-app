import {sceneSchema} from '../src/story.ts';
// Offline presentation data only. Never publish this fixture into a real host task.
const line=(id:string,speaker:string,text:string,extra:Record<string,unknown>={})=>({segment_id:id,speaker,text,emotion:'neutral',advance:'click',...extra});
const scene=(turn_id:string,stage:string,segments:any[],extra:Record<string,unknown>={})=>({schema_version:'1.0',turn_id,stage,segments,...extra});
export const storyFixtureScenes=[
  scene('prologue_demo','screening',[
    {segment_id:'intro',script_id:'intro'},
    line('question','system','这是离线演出预览。正式游戏里，这里会问：你想做点什么？',{advance:'reply'})
  ]),
  scene('portal_demo','design',[
    line('system_pass','system','我明白了，你想让创作这件事变得有趣。这是离线演示中的产品回应。'),
    {segment_id:'portal',script_id:'to_jobs'},
    line('jobs_question','jobs','这颗球说你有个想法。先别告诉我能加多少东西。人为什么会想要它？',{advance:'reply'})
  ]),
  scene('black_demo','experience',[
    line('jobs_answer','jobs','这次对了。你知道自己想保留什么了。把那一点做好。',{emotion:'approval',progress:{value:100,nodes:[{id:'demo_core',at:100,label:'演示节点：核心体验已澄清'}]}}),
    {segment_id:'handoff',script_id:'to_xiaohei'},
    line('black_q','xiaohei','先说好，我可不会因为你认识那颗球就客气。我打了一大段字，关了窗口回来，还在不在？',{advance:'reply',emotion:'skeptical'})
  ]),
  scene('ending_demo','delivery',[
    line('black_end','xiaohei','行，那我不用白打了。走，那颗球好像还给你留了点东西。',{emotion:'approval'}),
    {segment_id:'finale',script_id:'finale',document_id:'demo_doc'}
  ],{design_closed:true,delivery_kind:'ready',documents:[{id:'demo_doc',title:'剧情演示文档 · 不用于开发',markdown:'# 剧情演示文档\n\n这是本地离线 UI 夹具，不是用户的实际产品方案。没有连接模型，没有完成真实产品审查，不代表任何已有创意已经过关。\n\n## 演示范围\n召唤、传送、点赞、眨眼、小黑相遇、草地祝贺和可点击文档道具。\n\n## 交付边界\n此示例只检查页面是否可阅读和下载。不要执行开发。真实文档仍须按 Skill 决策闭合要求生成，确认产品范围、核心体验、异常处理、验收标准和首个可执行任务。'}]})
].map(input=>sceneSchema.parse(input));
