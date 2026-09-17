import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import type {Store} from './store.ts';
import {sceneSchema,renderScene,normalizeFinal,sha,type Scene} from './story.ts';
import {visibleCodexUserText} from './adapters/codex-text.ts';
import type {RecoverySubmission} from './recovery.ts';

type Staged={scene:Scene;canonical:string;hash:string;baseOrdinal:number;status:'staged'|'committed'|'mismatch'|'interrupted';hostId?:string;assetPaths:Record<string,string>;docPaths:Record<string,string>;publishedDocPaths?:Record<string,string>};
type Save={id:string;title:string;createdAt:string;updatedAt:string;anchor:number;started:boolean;deleted:boolean;position:string|null;turns:Staged[]};
type Entry={id:string;hostId:string;speaker:string;text:string;emotion:string;advance:string;stage:string|null;raw?:string;turnId?:string;segment_id?:string;asset_id?:string|null;document_id?:string|null;deliveryKind?:string};
export class Game {
  private key:string;
  constructor(readonly store:Store,readonly threadId:string,readonly dataDir:string,readonly title:string,private displayUserText:(text:string)=>string=visibleCodexUserText){this.key=`game:${threadId}`;}
  get():Save|null{return this.store.get(this.key,null);}
  private put(save:Save){save.updatedAt=new Date().toISOString();this.store.put(this.key,save);}
  start(){let save=this.get();if(save?.deleted)throw Error('存档已删除，请回原任务重新启动网页模式');if(!save){save={id:randomUUID(),title:this.title,createdAt:new Date().toISOString(),updatedAt:'',anchor:this.store.messages(this.threadId).at(-1)?.ordinal??0,started:true,deleted:false,position:null,turns:[]};this.put(save);}return save;}
  reactivate(){const save=this.get();if(save?.deleted)this.store.put(this.key,null);return {ready:true};}
  prefs(){return this.store.get('game-preferences',{speed:30,imageMode:'builtin'});}
  preferences(value:any){if(!Number.isFinite(value.speed)||value.speed<0||value.speed>120||!['builtin','generated'].includes(value.imageMode))throw Error('设置无效');this.store.put('game-preferences',{speed:value.speed,imageMode:value.imageMode});return this.prefs();}
  private folder(save:Save){const root=resolve(this.dataDir,'games'),path=resolve(root,save.id);if(!/^[a-f0-9-]{36}$/.test(save.id)||!path.startsWith(root+sep))throw Error('Invalid owned game path');return path;}
  stage(raw:unknown){
    this.reconcile();
    const scene=sceneSchema.parse(raw),save=this.start();
    const same=save.turns.find(t=>t.scene.turn_id===scene.turn_id);
    if(same){if(JSON.stringify(same.scene)!==JSON.stringify(scene))throw Error('同一回合 ID 的内容不得改变；修正须使用新 ID');return {turnId:scene.turn_id,status:same.status,finalText:same.canonical};}
    if(save.turns.some(t=>t.status==='staged'))throw Error('前一回合仍等待正式正文，不能跳过');
    if(this.prefs().imageMode==='builtin'&&scene.assets.length)throw Error('用户选择内置立绘，本轮不接收生成配图');
    const folder=this.folder(save);mkdirSync(folder,{recursive:true});
    const assetPaths:Record<string,string>={},docPaths:Record<string,string>={};
    for(const a of scene.assets){
      const bytes=Buffer.from(a.data_base64,'base64');
      const valid=a.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):a.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(!valid||bytes.length>5_000_000)throw Error('图片内容或大小无效，只接受 PNG/JPEG/WebP');
      const path=join(folder,sha(bytes)+({ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[a.mime]));writeFileSync(path,bytes);assetPaths[a.id]=path;
    }
    for(const d of scene.documents){const path=join(folder,`${sha(d.markdown)}.md`);writeFileSync(path,d.markdown,'utf8');docPaths[d.id]=path;}
    // Files linked from the original Agent become shared deliverables, not disposable web cache.
    const published=resolve(this.dataDir,'published');mkdirSync(published,{recursive:true});
    const publishedAssets:Record<string,string>={},publishedDocPaths:Record<string,string>={};
    for(const [id,path] of Object.entries(assetPaths)){const bytes=readFileSync(path),extension=path.slice(path.lastIndexOf('.'));publishedAssets[id]=join(published,sha(bytes)+extension);writeFileSync(publishedAssets[id],bytes);}
    for(const d of scene.documents){publishedDocPaths[d.id]=join(published,sha(d.markdown)+'.md');writeFileSync(publishedDocPaths[d.id],d.markdown,'utf8');}
    const canonical=renderScene(scene,publishedAssets,publishedDocPaths);
    save.turns.push({scene,canonical,hash:sha(canonical),baseOrdinal:this.store.messages(this.threadId).at(-1)?.ordinal??0,status:'staged',assetPaths,docPaths,publishedDocPaths});this.put(save);
    return {turnId:scene.turn_id,status:'staged',finalText:canonical,instruction:'将 finalText 原样作为同一原会话的最终回复。工具结果不能代替正式回复。'};
  }
  reconcile(){
    const save=this.get();if(!save||save.deleted)return;
    let changed=false;
    for(const turn of save.turns.filter(t=>t.status==='staged')){
      const following=this.store.messages(this.threadId).filter(m=>m.ordinal>turn.baseOrdinal);
      const interrupted=following.find(m=>m.role==='user');
      // A later user turn is a boundary: an old scene cannot claim a later matching reply.
      const finals=following.filter(m=>m.role==='assistant'&&(!interrupted||m.ordinal<interrupted.ordinal));
      const match=finals.find(m=>normalizeFinal(m.text)===normalizeFinal(turn.canonical));
      if(match){turn.status='committed';turn.hostId=match.id;changed=true;}
      else if(finals.length){turn.status='mismatch';turn.hostId=finals.at(-1)!.id;changed=true;}
      else if(interrupted){turn.status='interrupted';changed=true;}
    }
    if(changed)this.put(save);
  }
  timeline():Entry[]{
    const save=this.get();if(!save||save.deleted)return [];
    const submissions=new Map(this.store.submissions(this.threadId).filter(s=>s.status==='confirmed').map(s=>[s.host_id,s]));
    return this.store.messages(this.threadId).filter(m=>m.ordinal>save.anchor).flatMap<Entry>(m=>{
      if(m.role==='user'){
        const submission=submissions.get(m.id);
        const recovery=submission?this.store.get<RecoverySubmission|null>(`recovery:${submission.id}`,null):null;
        const text=recovery&&recovery.wireText===submission.text?recovery.text:m.kind==='native'?this.displayUserText(m.text):m.text;
        return [{id:m.id,hostId:m.id,speaker:'user',text,emotion:'neutral',advance:'click',stage:null}];
      }
      const turn=save.turns.find(t=>t.hostId===m.id&&t.status==='committed');
      if(turn)return turn.scene.segments.map(s=>({...s,id:`${turn.scene.turn_id}:${s.segment_id}`,hostId:m.id,turnId:turn.scene.turn_id,stage:turn.scene.stage,deliveryKind:turn.scene.delivery_kind}));
      return [{id:m.id,hostId:m.id,speaker:'system',text:'刚才在原窗口聊的内容，我留在这里了。点「查看原回复」就能看到。你可以直接接着回答，也可以点「恢复角色对话」，从刚才的进度继续。',raw:m.text,emotion:'neutral',advance:'error',stage:null}];
    });
  }
  state(){const save=this.get(),timeline=this.timeline(),last=timeline.at(-1);return {save:save&&!save.deleted?{id:save.id,title:save.title,createdAt:save.createdAt,updatedAt:save.updatedAt,position:save.position}:null,deleted:save?.deleted??false,prefs:this.prefs(),timeline,recoverySupported:true,pending:save?.turns.filter(t=>t.status==='staged'||t.status==='mismatch'&&t.hostId===last?.hostId).map(t=>({turnId:t.scene.turn_id,status:t.status}))??[],lease:this.store.get(`lease:${this.threadId}`,null)};}
  position(id:string|null){const save=this.get();if(!save||save.deleted)throw Error('存档不存在');if(id!==null&&!this.timeline().some((s:any)=>s.id===id))throw Error('播放位置不属于本存档');save.position=id;this.put(save);}
  lease(clientId:string,force=false){
    if(!/^[a-zA-Z0-9_-]{8,100}$/.test(clientId))throw Error('Invalid viewer');
    const key=`lease:${this.threadId}`,current=this.store.get<any>(key,null);
    if(current&&current.clientId!==clientId&&Date.now()-current.at<15000&&!force)return {owned:false};
    this.store.put(key,{clientId,at:Date.now()});return {owned:true};
  }
  canSend(input:any){const save=this.get(),lease=this.store.get<any>(`lease:${this.threadId}`,null);if(!save||save.deleted||input.gameSessionId!==save.id)throw Error('网页存档已失效');if(lease?.clientId!==input.viewerId||Date.now()-lease.at>=15000)throw Error('另一个标签页正在操作；请先接管此会话');const last:any=this.timeline().at(-1);if(last&&(!['reply','complete'].includes(last.advance)&&!(last.advance==='error'&&input.recover===true)||last.id!==input.replyTo))throw Error('当前问题已改变，请阅读最新对话');if(input.recover===true&&last?.advance!=='error')throw Error('当前对话不需要格式恢复，请读取最新进度');if(!last&&input.replyTo!==null)throw Error('问题标识无效');}
  resource(turnId:string,id:string,kind:'image'|'document'){
    const save=this.get();const turn=save&&!save.deleted?save.turns.find(t=>t.scene.turn_id===turnId&&t.status==='committed'):undefined;
    if(!turn)throw Error('资源尚未由原会话确认或存档已删除');
    const asset=turn.scene.assets.find(a=>a.id===id),doc=turn.scene.documents.find(d=>d.id===id);
    if(kind==='image'&&asset)return {bytes:readFileSync(turn.assetPaths[id]),mime:asset.mime};
    if(kind==='document'&&doc)return {bytes:readFileSync(turn.docPaths[id]),mime:'text/markdown; charset=utf-8',title:doc.title,path:turn.publishedDocPaths?.[id]??turn.docPaths[id],hash:sha(doc.markdown)};
    throw Error('资源不存在');
  }
  delete(){const save=this.get();if(save&&!save.deleted){const folder=this.folder(save);rmSync(folder,{recursive:true,force:true});save.deleted=true;save.turns=[];save.position=null;this.store.put(`draft:${this.threadId}`,'');this.store.put(`draft-base:${this.threadId}`,null);this.put(save);}return {deleted:true,originalConversationUntouched:true};}
}
