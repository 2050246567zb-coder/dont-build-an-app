import {z} from 'zod';
import {createHash} from 'node:crypto';
import {expandStoryScripts} from './story-scripts.ts';

export const speakerNames={system:'AI',jobs:'乔布斯',xiaohei:'小黑',narrator:'旁白',player:'你（剧情）',ensemble:'精灵、乔布斯和小黑',user:'你说'} as const;
export const emotions=['neutral','thinking','skeptical','angry','approval','surprised'] as const;
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const expandedSceneSchema=z.object({
  schema_version:z.literal('1.0'),turn_id:id,
  stage:z.enum(['screening','design','experience','delivery']),
  design_closed:z.boolean().default(false),
  delivery_kind:z.enum(['ready','draft']).default('ready'),
  segments:z.array(z.object({
    segment_id:id,speaker:z.enum(['system','jobs','xiaohei','narrator','player','ensemble']),
    cue:z.enum(['summon','portal','thumbsup','blink','meadow','reward']).optional(),
    scene:z.enum(['meadow']).optional(),
    text:z.string().min(1).max(6000),emotion:z.enum(emotions).catch('neutral'),
    asset_id:id.nullable().default(null),advance:z.enum(['click','reply','complete']),
    document_id:id.nullable().default(null),
    choices:z.array(z.string().trim().min(1).max(240)).length(2).optional(),
    progress:z.object({value:z.number().int().min(0).max(100),nodes:z.array(z.object({id,label:z.string().trim().min(1).max(100),at:z.number().int().min(0).max(100)}).strict()).max(24)}).strict().optional(),
  }).strict()).min(1).max(24),
  documents:z.array(z.object({id,title:z.string().min(1).max(120),markdown:z.string().min(100).max(200000)}).strict()).max(3).default([]),
  assets:z.array(z.object({id,speaker:z.enum(['system','jobs','xiaohei']),mime:z.enum(['image/png','image/jpeg','image/webp']),data_base64:z.string().max(7000000)}).strict()).max(6).default([]),
}).strict().superRefine((scene,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  const ids=scene.segments.map(s=>s.segment_id);
  if(new Set(ids).size!==ids.length)fail('片段 ID 不得重复');
  if(new Set(scene.assets.map(a=>a.id)).size!==scene.assets.length || new Set(scene.documents.map(d=>d.id)).size!==scene.documents.length)fail('资源 ID 不得重复');
  for(const [i,s] of scene.segments.entries()){
    if(['narrator','player','ensemble'].includes(s.speaker)&&(s.advance!=='click'||s.asset_id||s.document_id||s.choices||s.progress))fail('剧情旁白和玩家台词只能点击阅读，不得代替用户作决定');
    if((s.scene==='meadow'||s.cue==='meadow'||s.cue==='reward'||s.speaker==='ensemble')&&(scene.stage!=='delivery'||!scene.design_closed||scene.delivery_kind!=='ready'))fail('祝贺结局只在设计闭合并正式交付时播放');
    if((['meadow','reward'].includes(s.cue||'')||s.speaker==='ensemble')&&s.scene!=='meadow')fail('结局演出须绑定草地场景');
    if(s.cue==='reward'&&(s.speaker!=='system'||s.advance!=='complete'||!s.document_id))fail('道具必须关联正式交付文档');
    if(s.cue==='thumbsup'&&(s.speaker!=='jobs'||s.advance!=='click'))fail('点赞是乔布斯的交接动作');
    if(s.cue==='blink'&&(scene.stage!=='experience'||s.speaker!=='narrator'))fail('眨眼过场由进入体验阶段的旁白触发');
    if(s.cue==='portal'&&(scene.stage!=='design'||s.speaker!=='system'))fail('传送由精灵引入核心设计阶段');
    if(s.cue==='summon'&&s.speaker!=='system')fail('召唤只能用于系统精灵');
    if(s.progress){if(new Set(s.progress.nodes.map(n=>n.id)).size!==s.progress.nodes.length)fail('进度节点 ID 不得重复');if(s.progress.nodes.some(n=>n.at>s.progress!.value))fail('确认节点不能超过当前进度');}
    if(s.choices&&(s.advance!=='reply'||new Set(s.choices).size!==2))fail('两个备选回答须不同，且只可用于等待回答的片段');
    if(i<scene.segments.length-1 && s.advance!=='click')fail('只有最后一个片段可以等待回答或交付文档');
    if(s.asset_id){const asset=scene.assets.find(a=>a.id===s.asset_id);if(!asset || asset.speaker!==s.speaker)fail('配图必须存在且属于当前人物');}
    if(s.advance==='complete'){
      if(s.speaker!=='system' || !scene.documents.some(d=>d.id===s.document_id))fail('系统交付必须绑定完整文档');
      if(scene.delivery_kind==='ready' && !scene.design_closed)fail('设计尚未闭合，不能交付就绪方案');
      if(scene.stage!=='delivery')fail('完成片段必须属于交付阶段');
    }else if(s.document_id)fail('普通片段不能绑定交付文档');
  }
  if(scene.segments.at(-1)?.advance==='click')fail('一轮必须结束于等待用户回答或文档交付');
});
export const sceneSchema=z.preprocess((input,ctx)=>{
  try{return expandStoryScripts(input);}catch(error){ctx.addIssue({code:'custom',message:error instanceof Error?error.message:'固定桥段无法展开'});return z.NEVER;}
},expandedSceneSchema);
export type Scene=z.infer<typeof sceneSchema>;
export const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function normalizeFinal(text:string){return text.replace(/\r\n/g,'\n').replace(/\s*<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>\s*$/,'').trim();}
export function renderScene(scene:Scene,assetPaths:Record<string,string>,docPaths:Record<string,string>):string{
  const body=scene.segments.map(s=>[
    s.asset_id?`![${speakerNames[s.speaker]}](<${assetPaths[s.asset_id].replaceAll('\\','/')}>)`:null,
    `${speakerNames[s.speaker]}：${s.text}`,
    s.choices?`可选回答：\n${s.choices.map((choice,i)=>`${i+1}. ${choice}`).join('\n')}\n也可以写下你自己的回答。`:null,
    s.progress?`本章进度：${s.progress.value}%${s.progress.nodes.length?'\n'+s.progress.nodes.map(n=>`- ${n.at}%：${n.label}`).join('\n'):''}`:null,
    s.document_id?`[${scene.documents.find(d=>d.id===s.document_id)!.title.replace(/[\\[\]]/g,'\\$&')}](<${docPaths[s.document_id].replaceAll('\\','/')}>)`:null,
  ].filter(Boolean).join('\n\n')).join('\n\n');
  return `${body}\n\n<!-- galgame:${scene.turn_id} -->`;
}
