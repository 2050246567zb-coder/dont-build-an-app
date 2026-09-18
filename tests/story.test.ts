import test from 'node:test';
// Progress is factual chapter metadata and must survive the same publication path.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {Game} from '../src/game.ts';
import {sceneSchema,normalizeFinal} from '../src/story.ts';
import {portrait} from '../src/portraits.ts';
const thread='11111111-1111-1111-1111-111111111111';
const segment=(speaker='jobs',advance='reply',id='s1')=>({segment_id:id,speaker,text:'这一点你准备怎么解决？',emotion:'skeptical',asset_id:null,advance,document_id:null});
const scene=(segments=[segment()]):any=>({schema_version:'1.0',turn_id:'turn1',stage:'design',segments,documents:[],assets:[]});
function fixture(){const dir=mkdtempSync(join(tmpdir(),'galgame-story-')),store=new Store(join(dir,'db')),game=new Game(store,thread,dir,'测试存档');game.start();return {dir,store,game,close:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};}
function final(store:Store,text:string,id='msg_final',ordinal=2){store.addMessage(thread,{id,text,role:'assistant',timestamp:new Date().toISOString(),phase:'final_answer',kind:'native',ordinal});}

test('two suggested answers are mirrored in the original final and committed timeline; old scenes remain valid',()=>{
  const f=fixture();try{
    const input=scene([{...segment(),choices:['温和地提醒我。','直接把我点醒。']} as any]);
    const result=f.game.stage(input);assert.match(result.finalText,/1\. 温和地提醒我。/);assert.match(result.finalText,/2\. 直接把我点醒。/);
    final(f.store,result.finalText);f.game.reconcile();assert.deepEqual(f.game.timeline()[0].choices,input.segments[0].choices);
    assert.doesNotThrow(()=>sceneSchema.parse(scene()));
    input.segments[0].choices=['相同','相同'];assert.throws(()=>sceneSchema.parse(input));
    input.segments[0].choices=['只有一项'];assert.throws(()=>sceneSchema.parse(input));
    assert.throws(()=>sceneSchema.parse(scene([{...segment('jobs','click'),choices:['甲','乙']} as any,segment('xiaohei','reply','s2')])));
  }finally{f.close();}
});
test('a handoff preserves both speakers and waits only after the last segment',()=>{
  const f=fixture();try{const input=scene([segment('jobs','click','j1'),segment('xiaohei','reply','x1')]),result=f.game.stage(input);
    assert.deepEqual(f.game.timeline(),[]);final(f.store,result.finalText);f.game.reconcile();
    assert.deepEqual(f.game.timeline().map(s=>[s.speaker,s.advance]),[['jobs','click'],['xiaohei','reply']]);
    assert.throws(()=>sceneSchema.parse(scene([segment('jobs','reply','j1'),segment('xiaohei','reply','x1')])));
    assert.throws(()=>sceneSchema.parse(scene([segment('jobs','click')])));
  }finally{f.close();}
});
test('tool staging cannot substitute for final; changed words or missing speaker cause mismatch',()=>{
  const f=fixture();try{const result=f.game.stage(scene());assert.equal(f.game.state().pending[0].status,'staged');
    final(f.store,result.finalText.replace('乔布斯：','小黑：'));f.game.reconcile();assert.equal(f.game.state().pending[0].status,'mismatch');
    assert.equal(f.game.timeline()[0].advance,'error');
    assert.equal(normalizeFinal('a\r\n\r\n<oai-mem-citation>x</oai-mem-citation>'),'a');
  }finally{f.close();}
});
test('complete requires a system speaker, real document and closed design or explicitly marked draft',()=>{
  const input=scene([{...segment('system','complete'),document_id:'doc'}]);input.stage='delivery';
  assert.throws(()=>sceneSchema.parse(input));input.documents=[{id:'doc',title:'方案',markdown:'# 设计方案\n'+ '明确的产品内容。'.repeat(30)}];
  assert.throws(()=>sceneSchema.parse(input));input.delivery_kind='draft';assert.doesNotThrow(()=>sceneSchema.parse(input));
  input.delivery_kind='ready';input.design_closed=true;assert.doesNotThrow(()=>sceneSchema.parse(input));
});
test('assets cannot cross characters; fallback rejects executable formats and invalid image bytes',()=>{
  const input=scene();input.segments[0].asset_id='img';input.assets=[{id:'img',speaker:'xiaohei',mime:'image/png',data_base64:'AAAA'}];assert.throws(()=>sceneSchema.parse(input));
  input.assets[0].speaker='jobs';const f=fixture();try{assert.throws(()=>f.game.stage(input),/内置/);f.game.preferences({speed:30,imageMode:'generated'});assert.throws(()=>f.game.stage(input),/图片/);}finally{f.close();}
  assert.equal(portrait('jobs','approval'),'jobs-approval.png');assert.notEqual(portrait('xiaohei','angry'),portrait('xiaohei','approval'));assert.throws(()=>portrait('../secret','neutral'));
  assert.equal(portrait('jobs','../../secret'),'jobs-neutral.png');assert.equal(portrait('system','approval'),'system-approval.png');assert.equal(portrait('system','skeptical'),'system-neutral.png');
});
test('document bytes match both saved file and returned markdown; deletion never touches host mirror and cannot resurrect',()=>{
  const f=fixture();try{const input=scene([{...segment('system','complete'),document_id:'doc'}]);input.stage='delivery';input.design_closed=true;input.documents=[{id:'doc',title:'方案',markdown:'# 产品方案\n'+ '这是已确定的实现内容。'.repeat(30)}];
    const result=f.game.stage(input);assert.throws(()=>f.game.resource('turn1','doc','document'),/尚未/);final(f.store,result.finalText);f.game.reconcile();
    const doc=f.game.resource('turn1','doc','document');assert.equal(doc.bytes.toString(),input.documents[0].markdown);assert.ok(existsSync(doc.path!));
    const cachePath=f.game.get()!.turns[0].docPaths.doc;
    const hostBefore=f.store.messages(thread);f.game.delete();assert.equal(existsSync(cachePath),false);assert.equal(existsSync(doc.path!),true);assert.deepEqual(f.store.messages(thread),hostBefore);f.game.reconcile();assert.equal(f.game.get()?.deleted,true);assert.throws(()=>f.game.start(),/已删除/);assert.throws(()=>f.game.resource('turn1','doc','document'));
  }finally{f.close();}
});
test('play position and preferences survive reopen; a second tab cannot submit or steal a fresh lease',()=>{
  const f=fixture();try{const result=f.game.stage(scene());final(f.store,result.finalText);f.game.reconcile();const id=f.game.timeline()[0].id;f.game.position(id);f.game.preferences({speed:0,imageMode:'builtin'});
    const reopened=new Game(f.store,thread,f.dir,'same');assert.equal(reopened.get()?.position,id);assert.equal(reopened.prefs().speed,0);
    assert.equal(reopened.lease('viewer_111').owned,true);assert.equal(reopened.lease('viewer_222').owned,false);
    assert.throws(()=>reopened.canSend({viewerId:'viewer_222',gameSessionId:reopened.get()?.id,replyTo:id}),/标签页/);
    assert.equal(reopened.lease('viewer_222',true).owned,true);assert.doesNotThrow(()=>reopened.canSend({viewerId:'viewer_222',gameSessionId:reopened.get()?.id,replyTo:id}));
    assert.throws(()=>reopened.canSend({viewerId:'viewer_222',gameSessionId:reopened.get()?.id,replyTo:'old'}),/问题/);
  }finally{f.close();}
});

test('plain replies preserve original content and allow explicit recovery only at the latest leased entry',()=>{
  const f=fixture();try{
    final(f.store,'这是打断之后的普通回复。');f.game.reconcile();
    const entry=f.game.timeline().at(-1)!;assert.equal(entry.raw,'这是打断之后的普通回复。');
    f.game.lease('viewer_111');const input={viewerId:'viewer_111',gameSessionId:f.game.get()!.id,replyTo:entry.id,recover:true};
    assert.doesNotThrow(()=>f.game.canSend(input));
    assert.throws(()=>f.game.canSend({...input,recover:false}),/问题/);
    assert.throws(()=>f.game.canSend({...input,viewerId:'viewer_222'}),/标签页/);
    final(f.store,'原窗口又补了一句。','next',3);
    assert.throws(()=>f.game.canSend(input),/问题/);
  }finally{f.close();}
});

test('a user interruption retires unpublished scenes and a later matching final cannot revive them',()=>{
  const f=fixture();try{
    const previous=f.game.stage(scene());
    f.store.addMessage(thread,{id:'interrupt',role:'user',text:'等一下，我改主意了。',ordinal:1,timestamp:new Date().toISOString(),phase:'',kind:'native'});
    final(f.store,previous.finalText,'late',2);f.game.reconcile();
    assert.equal(f.game.get()!.turns[0].status,'interrupted');
    assert.equal(f.game.timeline().at(-1)!.advance,'error');assert.deepEqual(f.game.state().pending,[]);
    const next=f.game.stage({...scene(),turn_id:'after_interruption'});final(f.store,next.finalText,'new',3);f.game.reconcile();
    assert.equal(f.game.timeline().at(-1)!.speaker,'jobs');assert.deepEqual(f.game.state().pending,[]);
  }finally{f.close();}
});

test('mismatch stops warning after a new valid turn; a final before interruption remains committed',()=>{
  const f=fixture();try{
    f.game.stage(scene());final(f.store,'普通回复。','plain',1);f.game.reconcile();assert.equal(f.game.state().pending[0].status,'mismatch');
    f.store.addMessage(thread,{id:'user_resume',role:'user',text:'继续。',ordinal:2,timestamp:new Date().toISOString(),phase:'',kind:'native'});
    const next=f.game.stage({...scene(),turn_id:'resumed'});final(f.store,next.finalText,'resumed_final',3);
    f.store.addMessage(thread,{id:'user_after',role:'user',text:'说到这里我想补充。',ordinal:4,timestamp:new Date().toISOString(),phase:'',kind:'native'});f.game.reconcile();
    assert.equal(f.game.get()!.turns[1].status,'committed');assert.deepEqual(f.game.state().pending,[]);
    assert.equal(f.game.timeline().find(s=>s.hostId==='plain')!.raw,'普通回复。');
  }finally{f.close();}
});

 test('chapter milestones survive publication and reject invalid positions',()=>{
  const f=fixture();try{
    const input=scene();input.segments[0].progress={value:35,nodes:[{id:'audience',label:'确定了核心人群',at:35}]};
    const result=f.game.stage(input);assert.match(result.finalText,/确定了核心人群/);final(f.store,result.finalText);f.game.reconcile();
    assert.deepEqual(f.game.timeline()[0].progress,input.segments[0].progress);
    input.segments[0].progress.nodes[0].at=36;assert.throws(()=>sceneSchema.parse(input));
    input.segments[0].progress={value:101,nodes:[]};assert.throws(()=>sceneSchema.parse(input));
    input.segments[0].progress={value:50,nodes:[{id:'a',label:'a',at:20},{id:'a',label:'b',at:30}]};assert.throws(()=>sceneSchema.parse(input));
  }finally{f.close();}
});

test('story cues mirror fictional dialogue without turning it into a user reply',async()=>{
 const {storyFixtureScenes}=await import('../scripts/story-fixture-scenes.ts');
 const f=fixture();try{
   const handoff=storyFixtureScenes[2];const result=f.game.stage(handoff);assert.match(result.finalText,/你（剧情）：你是谁啊/);final(f.store,result.finalText);f.game.reconcile();
   assert.equal(f.game.timeline().filter(s=>s.speaker==='user').length,0);assert.equal(f.game.timeline().find(s=>s.cue==='thumbsup')?.speaker,'jobs');
   assert.equal(f.game.timeline().find(s=>s.cue==='blink')?.speaker,'narrator');
   const bad=structuredClone(handoff);bad.segments[3].advance='reply';assert.throws(()=>sceneSchema.parse(bad));
   for(const item of storyFixtureScenes)assert.doesNotThrow(()=>sceneSchema.parse(item));
   const draft=structuredClone(storyFixtureScenes[3]);draft.design_closed=false;draft.delivery_kind='draft';assert.throws(()=>sceneSchema.parse(draft));
 }finally{f.close();}
});

test('fixed opening is expanded once for both native final and persisted webpage; product text stays dynamic',()=>{
  const f=fixture();try{
    const question={...segment('system','reply','real_question'),text:'你说给夜班护士用，交班时最容易漏掉哪件事？'};
    const input={...scene(),stage:'screening',segments:[{segment_id:'welcome',script_id:'intro'},question]};
    const result=f.game.stage(input);
    assert.match(result.finalText,/开发者，听得见吗/);
    assert.ok(result.finalText.includes(question.text));
    assert.equal(f.game.timeline().length,0);
    assert.equal(f.game.stage(input).finalText,result.finalText);
    final(f.store,result.finalText);f.game.reconcile();
    const timeline=f.game.timeline();assert.equal(timeline.length,3);
    assert.equal(timeline.at(-1)?.text,question.text);
    const restored=new Game(f.store,thread,f.dir,'恢复');
    assert.deepEqual(restored.timeline(),timeline);
    assert.ok(timeline.every(s=>result.finalText.includes(s.text)));
  }finally{f.close();}
});

test('fixed bridges reject rewritten roles/text, wrong chapters and repeated scripts',()=>{
  const opening={...scene(),stage:'screening',segments:[{segment_id:'intro',script_id:'intro'},{segment_id:'ask',script_id:'ask_idea'}]};
  assert.equal(sceneSchema.parse(opening).segments.at(-1)?.advance,'reply');
  for(const altered of [
    {...opening,stage:'design'},
    {...opening,segments:[{...opening.segments[0],text:'AI 自行改写'},opening.segments[1]]},
    {...opening,segments:[{...opening.segments[0],speaker:'jobs'},opening.segments[1]]},
    {...opening,segments:[opening.segments[0],{...opening.segments[0],segment_id:'again'},opening.segments[1]]},
    {...opening,segments:[{segment_id:'unknown',script_id:'not_a_script'},opening.segments[1]]},
  ])assert.throws(()=>sceneSchema.parse(altered));
});

test('meadow congratulations are product-independent, while the answer and delivered document remain specific',()=>{
  function ending(title:string,answer:string){return {...scene(),stage:'delivery',design_closed:true,delivery_kind:'ready',segments:[{...segment('xiaohei','click','last_answer'),text:answer},{segment_id:'celebration',script_id:'finale',document_id:'doc'}],documents:[{id:'doc',title,markdown:'# 方案\n'+answer.repeat(35)}]};}
  const a=sceneSchema.parse(ending('护士交班助手','交班时能找回漏项，那我放心了。'));
  const b=sceneSchema.parse(ending('离线菜谱','没网也能找菜谱，那我放心了。'));
  assert.notEqual(a.segments[0].text,b.segments[0].text);
  assert.deepEqual(a.segments.slice(1,-1),b.segments.slice(1,-1));
  assert.ok(a.segments.at(-1)?.text.includes('护士交班助手'));
  assert.ok(b.segments.at(-1)?.text.includes('离线菜谱'));
  assert.equal(a.segments.at(-1)?.document_id,'doc');
  for(const patch of [{design_closed:false},{delivery_kind:'draft'},{documents:[]}])assert.throws(()=>sceneSchema.parse({...ending('方案','回答'),...patch}));
});
