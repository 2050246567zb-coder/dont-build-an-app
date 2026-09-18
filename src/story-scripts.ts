// Product facts/questions stay in Agent-authored segments. These are theatrical lines only.
type Line={speaker:string;text:string;emotion?:string;cue?:string;scene?:string;advance?:string;document_id?:string};
const scripts:Record<string,{stage:string;lines:Line[]}>= {
  intro:{stage:'screening',lines:[
    {speaker:'system',cue:'summon',emotion:'approval',text:'开发者，听得见吗？……好，没召唤错人。恭喜你，解锁了『天才设计师系统』。'},
    {speaker:'system',text:'先别找一键成功的按钮，我没装。你带来一个想法，我陪你看看它值不值得做，再去见两位不太好糊弄的朋友。最后，咱们把它变成一份能动手做的方案。'},
  ]},
  ask_idea:{stage:'screening',lines:[
    {speaker:'system',advance:'reply',text:'那么，开发者，你想做点什么？是最近被什么事烦到了，还是脑子里冒出了个舍不得扔的点子？'},
  ]},
  to_jobs:{stage:'design',lines:[
    {speaker:'system',text:'开发者，走，带你见个老朋友。他夸人不太勤快，你可别指望我替你求情。'},
    {speaker:'system',cue:'portal',text:'站稳。第一次传送可能有点晃——别把刚才那个想法落下。'},
  ]},
  to_xiaohei:{stage:'experience',lines:[
    {speaker:'jobs',cue:'thumbsup',emotion:'approval',text:'好。核心已经清楚了。接下来，看看真正用它的人怎么说。'},
    {speaker:'jobs',text:'接下来请我们的用户代表，小黑。他不会关心我们聊得有多漂亮。让他试着挑挑毛病。'},
    {speaker:'narrator',cue:'blink',text:'眼前的光暗了一瞬。你眨了眨眼，第二次闭眼时，整个房间都安静了。再睁开，工作室已经不见了。'},
    {speaker:'player',text:'你是谁啊，怎么这么眼熟？'},
    {speaker:'xiaohei',emotion:'surprised',text:'我刚刚好像正要干什么坏事……一眨眼，手机就塞我手里了。有个球形的家伙让我跟你聊聊，说你想做个东西。'},
    {speaker:'player',text:'我好像知道怎么回事了。那，你怎么看？'},
  ]},
  finale:{stage:'delivery',lines:[
    {speaker:'narrator',cue:'meadow',scene:'meadow',text:'风从草地上吹过。乔布斯站在一旁，小黑把手机收进口袋。精灵的光也柔和下来。三个人看向你，笑着鼓起掌。'},
    {speaker:'jobs',scene:'meadow',emotion:'approval',text:'恭喜。现在你知道什么该做，什么不该做。守住那个核心，把它做出来。'},
    {speaker:'xiaohei',scene:'meadow',emotion:'approval',text:'恭喜啊。这一轮算你过关。等真做出来，我可还是会挑刺的。'},
    {speaker:'system',scene:'meadow',emotion:'approval',text:'恭喜，开发者。你的想法现在有了一份可以动手实施的方案。接下来，该让它去真实世界里试试了。'},
    {speaker:'ensemble',scene:'meadow',emotion:'approval',text:'恭喜你！'},
    {speaker:'system',scene:'meadow',cue:'reward',emotion:'approval',advance:'complete',text:''},
  ]},
};

/** Expand before validation/rendering so browser and native final share identical saved text. */
export function expandStoryScripts(input:unknown):unknown{
  if(!input||typeof input!=='object'||!Array.isArray((input as any).segments))return input;
  const scene=input as any,used=new Set<string>();
  return {...scene,segments:scene.segments.flatMap((part:any)=>{
    if(!part||typeof part!=='object'||!('script_id' in part))return [part];
    if(Object.keys(part).some(k=>!['segment_id','script_id','document_id'].includes(k)))throw Error('固定桥段仅接受 segment_id、script_id 和交付时的 document_id；不能改写台词或角色');
    if(typeof part.script_id!=='string'||!Object.hasOwn(scripts,part.script_id))throw Error('未知固定桥段');
    if(typeof part.segment_id!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(part.segment_id))throw Error('固定桥段的 segment_id 需为 1—60 个字母、数字、下划线或短横线');
    if(used.has(part.script_id))throw Error('同一轮不能重复播放同一个固定桥段');
    used.add(part.script_id);
    const script=scripts[part.script_id]!;
    if(scene.stage!==script.stage)throw Error('固定桥段与当前审查阶段不一致');
    if(part.script_id!=='finale'&&part.document_id!==undefined)throw Error('只有结局桥段可以绑定文档');
    const doc=part.script_id==='finale'&&Array.isArray(scene.documents)?scene.documents.find((d:any)=>d.id===part.document_id):null;
    if(part.script_id==='finale'&&(!doc||typeof doc.title!=='string'||!scene.design_closed||scene.delivery_kind==='draft'))throw Error('固定结局需要已闭合的正式方案和真实文档');
    return script.lines.map((line,i)=>({emotion:'neutral',asset_id:null,advance:'click',document_id:null,...line,segment_id:`${part.segment_id}_${i+1}`,
      ...(line.cue==='reward'?{document_id:part.document_id,text:`开发者，收好，你的最终道具——《${doc.title}》。它不是纪念品：点开能读，也可以下载后交给 AI 开工。想现在开始，就把它带回原来的 Agent。`}:{}),
    }));
  })};
}
