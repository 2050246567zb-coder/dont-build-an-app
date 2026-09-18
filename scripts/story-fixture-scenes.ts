// Offline presentation data only. Never publish this fixture into a real host task.
const line=(id:string,speaker:string,text:string,extra:Record<string,unknown>={})=>({segment_id:id,speaker,text,emotion:'neutral',advance:'click',...extra});
const scene=(turn_id:string,stage:string,segments:any[],extra:Record<string,unknown>={})=>({schema_version:'1.0',turn_id,stage,segments,...extra});
export const storyFixtureScenes=[
  scene('prologue_demo','screening',[
    line('summon','system','喂，听得见吗？……好，没召唤错人。恭喜，你解锁了「天才设计师系统」。',{cue:'summon'}),
    line('intro','system','先别找一键成功的按钮，我没装。你带来想法，我陪你把它想清楚，再去见两位不太好糊弄的朋友。'),
    line('question','system','这是离线演出预览。正式游戏里，这里会问：你想做点什么？',{advance:'reply'})
  ]),
  scene('portal_demo','design',[
    line('system_pass','system','我明白了，你想让创作这件事变得有趣。走，带你见个老朋友，他夸人可不太勤快。'),
    line('portal','system','站稳。第一次传送可能有点晃——别把刚才那个想法落下。',{cue:'portal'}),
    line('jobs_question','jobs','这颗球说你有个想法。先别告诉我能加多少东西。人为什么会想要它？',{advance:'reply'})
  ]),
  scene('black_demo','experience',[
    line('thumb','jobs','这次对了。你知道自己想保留什么了。把那一点做好。',{cue:'thumbsup',emotion:'approval',progress:{value:100,nodes:[{id:'demo_core',at:100,label:'演示节点：核心体验已澄清'}]}}),
    line('invite','jobs','接下来请我们的用户代表，小黑。他可不会关心我们聊得有多漂亮。'),
    line('blink','narrator','眼前的光暗了一瞬。再睁开眼，工作室已经不见了。',{cue:'blink'}),
    line('player_a','player','你是谁啊，怎么这么眼熟？'),
    line('black_a','xiaohei','我刚刚好像正要干什么坏事……一眨眼，手机就塞我手里了。有个球形的家伙让我跟你聊聊。',{emotion:'surprised'}),
    line('player_b','player','我好像知道怎么回事了。那，你怎么看？'),
    line('black_q','xiaohei','先说好，我可不会因为你认识那颗球就客气。我打了一大段字，关了窗口回来，还在不在？',{advance:'reply',emotion:'skeptical'})
  ]),
  scene('ending_demo','delivery',[
    line('black_end','xiaohei','行，那我不用白打了。走，那颗球好像还给你留了点东西。',{emotion:'approval'}),
    line('meadow','narrator','风从草地上吹过。三个人看向你，笑着鼓起掌。',{cue:'meadow',scene:'meadow'}),
    line('jobs_congrats','jobs','恭喜。现在你知道什么该做，什么不该做。守住它。',{scene:'meadow',emotion:'approval'}),
    line('black_congrats','xiaohei','恭喜啊。做出来我还是会挑刺的——不过这回，我有点想用了。',{scene:'meadow',emotion:'approval'}),
    line('spirit_congrats','system','恭喜你，把一个念头变成了一份可以动手做的方案。',{scene:'meadow',emotion:'approval'}),
    line('together','ensemble','恭喜你！',{scene:'meadow'}),
    line('reward','system','收好，你的最终道具——设计文档。点开能读，也可以下载。这里是离线演示，不代表真实产品已完成审查。',{scene:'meadow',cue:'reward',advance:'complete',document_id:'demo_doc'})
  ],{design_closed:true,delivery_kind:'ready',documents:[{id:'demo_doc',title:'剧情演示文档 · 不用于开发',markdown:'# 剧情演示文档\n\n这是本地离线 UI 夹具，不是用户的实际产品方案。没有连接模型，没有完成真实产品审查，不代表任何已有创意已经过关。\n\n## 演示范围\n召唤、传送、点赞、眨眼、小黑相遇、草地祝贺和可点击文档道具。\n\n## 交付边界\n此示例只检查页面是否可阅读和下载。不要执行开发。真实文档仍须按 Skill 决策闭合要求生成，确认产品范围、核心体验、异常处理、验收标准和首个可执行任务。'}]})
];
