import {z} from 'zod';
import {createHash} from 'node:crypto';

export const speakerNames={system:'AI',jobs:'乔布斯',xiaohei:'小黑',user:'你说'} as const;
export const emotions=['neutral','thinking','skeptical','angry','approval','surprised'] as const;
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const sceneSchema=z.object({
  schema_version:z.literal('1.0'),turn_id:id,
  stage:z.enum(['screening','design','experience','delivery']),
  design_closed:z.boolean().default(false),
  delivery_kind:z.enum(['ready','draft']).default('ready'),
  segments:z.array(z.object({
    segment_id:id,speaker:z.enum(['system','jobs','xiaohei']),
    text:z.string().min(1).max(6000),emotion:z.enum(emotions).catch('neutral'),
    asset_id:id.nullable().default(null),advance:z.enum(['click','reply','complete']),
    document_id:id.nullable().default(null),
  }).strict()).min(1).max(24),
  documents:z.array(z.object({id,title:z.string().min(1).max(120),markdown:z.string().min(100).max(200000)}).strict()).max(3).default([]),
  assets:z.array(z.object({id,speaker:z.enum(['system','jobs','xiaohei']),mime:z.enum(['image/png','image/jpeg','image/webp']),data_base64:z.string().max(7000000)}).strict()).max(6).default([]),
}).strict().superRefine((scene,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  const ids=scene.segments.map(s=>s.segment_id);
  if(new Set(ids).size!==ids.length)fail('片段 ID 不得重复');
  if(new Set(scene.assets.map(a=>a.id)).size!==scene.assets.length || new Set(scene.documents.map(d=>d.id)).size!==scene.documents.length)fail('资源 ID 不得重复');
  for(const [i,s] of scene.segments.entries()){
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
export type Scene=z.infer<typeof sceneSchema>;
export const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function normalizeFinal(text:string){return text.replace(/\r\n/g,'\n').replace(/\s*<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>\s*$/,'').trim();}
export function renderScene(scene:Scene,assetPaths:Record<string,string>,docPaths:Record<string,string>):string{
  const body=scene.segments.map(s=>[
    s.asset_id?`![${speakerNames[s.speaker]}](<${assetPaths[s.asset_id].replaceAll('\\','/')}>)`:null,
    `${speakerNames[s.speaker]}：${s.text}`,
    s.document_id?`[${scene.documents.find(d=>d.id===s.document_id)!.title.replace(/[\\[\]]/g,'\\$&')}](<${docPaths[s.document_id].replaceAll('\\','/')}>)`:null,
  ].filter(Boolean).join('\n\n')).join('\n\n');
  return `${body}\n\n<!-- galgame:${scene.turn_id} -->`;
}
