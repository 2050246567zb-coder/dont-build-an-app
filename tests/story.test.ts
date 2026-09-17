import test from 'node:test';
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
