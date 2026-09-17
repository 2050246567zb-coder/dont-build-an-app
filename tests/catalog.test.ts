import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startServer} from '../src/server.ts';
import {catalogId,registerSave,listSaves} from '../src/catalog.ts';
import {sha} from '../src/story.ts';
import {sharedHome} from '../src/paths.ts';
import type {HostMessage} from '../src/adapters/rollout.ts';

const thread='11111111-1111-1111-1111-111111111111';
async function pair(t:any){
  const dir=await mkdtemp(join(tmpdir(),'galgame-catalog-')),registryDir=join(dir,'catalog');
  const apps:Awaited<ReturnType<typeof startServer>>[]=[];
  t.after(async()=>{for(const app of apps)await app.close();await rm(dir,{recursive:true,force:true});});
  async function launch(name:string){
    const messages:HostMessage[]=[],sent:string[]=[];
    const app=await startServer({dataDir:join(dir,name),registryDir,port:0,quiet:true,pollMs:60000,heartbeatMs:60000,adapter:{name,label:name,threadId:thread,reader:{async poll(fn){messages.forEach(fn);}},capabilities:async()=>[{name:'send_message_to_thread',namespace:'fixture',inputSchema:{}}],readThread:async()=>({thread:{id:thread,title:name,status:{type:'idle'}}}),close(){},async send(text,submissionId){sent.push(text);messages.push({id:'user-'+sent.length,text,role:'user',ordinal:messages.length+1,phase:'',kind:'native',timestamp:new Date().toISOString(),submissionId});return {threadId:thread};}}});
    apps.push(app);const url=new URL(app.url),token=url.hash.slice(7);
    const request=(path:string,method='GET',data?:unknown)=>fetch(url.origin+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    const save=await (await request('/api/game/start','POST')).json() as any;
    return {app,request,url,token,messages,sent,save,id:catalogId({adapter:name,threadId:thread}),name};
  }
  return {dir,registryDir,launch,a:await launch('codex-fixture'),b:await launch('workbuddy-fixture')};
}
test('one catalog discovers different installations and namespaces identical task IDs without exposing credentials',async t=>{
  const {a,b}=await pair(t);
  for(const host of [a,b]){
    const result=await (await host.request('/api/saves')).json() as any;
    assert.equal(result.saves.length,2);assert.notEqual(a.id,b.id);
    assert.deepEqual(new Set(result.saves.map((s:any)=>s.hostLabel)),new Set([a.name,b.name]));
    assert.equal(result.saves.filter((s:any)=>s.current).length,1);
    assert.ok(result.saves.every((s:any)=>s.connected&&s.available));
    assert.ok(!JSON.stringify(result).includes('token'));assert.ok(!JSON.stringify(result).includes('127.0.0.1'));
  }
});
test('same-origin switching routes draft, settings, message and idempotency only to the selected original task',async t=>{
  const {a,b}=await pair(t),prefix=`/api/sessions/${b.id}`;
  await a.request(prefix+'/api/draft','PUT',{text:'只属于 B',baseMessageId:null});
  await a.request(prefix+'/api/game/settings','PUT',{speed:0,imageMode:'builtin'});
  const payload={id:'catalog-message-1',text:'消息只发 B',baseMessageId:null};
  assert.equal((await a.request(prefix+'/api/messages','POST',payload)).status,202);
  assert.equal((await a.request(prefix+'/api/messages','POST',payload)).status,200);
  assert.deepEqual(a.sent,[]);assert.deepEqual(b.sent,['消息只发 B']);
  const read=await (await a.request(prefix+'/api/game')).json() as any;
  assert.equal(read.draft,'只属于 B');assert.equal(read.prefs.speed,0);assert.equal(read.save.id,b.save.save.id);
  const own=await (await a.request('/api/game')).json() as any;
  assert.equal(own.draft,'');assert.equal(own.prefs.speed,30);
  assert.equal((await fetch(a.url.origin+prefix+'/api/game')).status,401);
  assert.equal((await a.request(prefix+'/api/shutdown','POST')).status,404);
  assert.equal((await a.request(prefix+'/api/game/stage','POST',{})).status,404);
  assert.equal((await a.request('/api/sessions/'+('0'.repeat(64))+'/api/game')).status,502);
});
test('offline records persist, restart replaces endpoint without duplicates, and deletion never deletes native messages',async t=>{
  const {a,b,launch}=await pair(t);
  await b.request('/api/messages','POST',{id:'native-boundary-1',text:'保留原任务消息',baseMessageId:null});
  await b.app.close();
  let saves=(await (await a.request('/api/saves')).json() as any).saves;
  assert.equal(saves.length,2);assert.equal(saves.find((s:any)=>s.id===b.id).available,false);
  const restarted=await launch(b.name);assert.notEqual(restarted.app.url,b.app.url);
  saves=(await (await a.request('/api/saves')).json() as any).saves;
  assert.equal(saves.filter((s:any)=>s.id===b.id).length,1);assert.equal(saves.find((s:any)=>s.id===b.id).available,true);
  assert.equal((await a.request(`/api/sessions/${b.id}/api/game/save`,'DELETE')).status,200);
  assert.equal((await (await a.request('/api/saves')).json() as any).saves.length,1);
  assert.equal(restarted.app.store.messages(thread).length,1);
});
test('remote scene pictures and delivered document are read from the selected task',async t=>{
  const {a,b}=await pair(t),prefix=`/api/sessions/${b.id}`;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2l9sAAAAASUVORK5CYII=','base64');
  const markdown='# B 的产品文档\n\n'+ '这是只属于 B 的文档和验收内容。'.repeat(30);
  await b.request('/api/game/settings','PUT',{speed:30,imageMode:'generated'});
  const staged=await (await b.request('/api/game/stage','POST',{schema_version:'1.0',turn_id:'shared_delivery',stage:'delivery',design_closed:true,segments:[{segment_id:'bye',speaker:'xiaohei',text:'行，我说完了。',advance:'click',asset_id:'portrait'},{segment_id:'doc',speaker:'system',text:'文档准备好了。',advance:'complete',document_id:'plan'}],assets:[{id:'portrait',speaker:'xiaohei',mime:'image/png',data_base64:png.toString('base64')}],documents:[{id:'plan',title:'B 的文档',markdown}]})).json() as any;
  assert.ok(staged.finalText);
  b.messages.push({id:'formal',role:'assistant',text:staged.finalText,ordinal:1,kind:'native',phase:'final_answer',timestamp:new Date().toISOString()});await b.app.poll();
  const doc=await (await a.request(prefix+'/api/game/document?turn=shared_delivery&id=plan')).json() as any;
  assert.equal(doc.markdown,markdown);
  const image=await a.request(prefix+'/api/game/resource/image/shared_delivery/portrait');
  assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  assert.equal((await (await a.request('/api/game')).json() as any).timeline.length,0);
});
test('stale or tampered endpoint cannot redirect a message to a different host task',async t=>{
  const {a,b,registryDir}=await pair(t),file=join(registryDir,b.id+'.json');
  const record=JSON.parse(await readFile(file,'utf8'));record.url=a.app.url;await writeFile(file,JSON.stringify(record));
  assert.equal((await a.request(`/api/sessions/${b.id}/api/messages`,'POST',{id:'must-not-send',text:'不可串话',baseMessageId:null})).status,502);
  assert.equal(a.sent.length+b.sent.length,0);
  record.url='https://example.com/#token='+b.token;await writeFile(file,JSON.stringify(record));
  assert.equal((await (await a.request('/api/saves')).json() as any).saves.length,1);
});
test('legacy index is deduplicated by an upgraded registration and its deletion tombstone',async t=>{
  const {a,registryDir}=await pair(t);
  await writeFile(join(registryDir,sha(thread)+'.json'),JSON.stringify({id:sha(thread),url:a.app.url,title:'旧索引',updatedAt:new Date().toISOString(),hasSave:true,deleted:false}));
  assert.equal((await (await a.request('/api/saves')).json() as any).saves.length,2);
  await a.request('/api/game/save','DELETE');
  const result=await (await a.request('/api/saves')).json() as any;
  assert.equal(result.saves.length,1);assert.ok(!result.saves.some((s:any)=>s.title==='旧索引'));
});
test('atomic catalog writes remain valid with concurrent installations; corrupt index cannot hide valid saves',async t=>{
  const {a,registryDir}=await pair(t),owner={adapter:a.name,threadId:thread,hostLabel:a.name};
  await Promise.all(Array.from({length:10},()=>registerSave(registryDir,owner,a.app.url,a.save.save)));
  await writeFile(join(registryDir,'a'.repeat(64)+'.json'),'{broken');
  const result=await listSaves(registryDir,owner,a.save.save,true);assert.equal(result.saves.length,2);
  assert.ok(!(await readdir(registryDir)).some(f=>f.endsWith('.tmp')));
});
test('shared data location is independent of agent and checkout; explicit isolation is preserved',()=>{
  const a=sharedHome({LOCALAPPDATA:'C:/LocalData',CODEX_HOME:'C:/codex-a'},'win32','C:/User');
  const b=sharedHome({LOCALAPPDATA:'C:/LocalData',CODEBUDDY_SESSION_ID:thread},'win32','C:/User');
  assert.equal(a,b);assert.notEqual(sharedHome({GALGAME_HOME:'C:/PrivateDemo'},'win32','C:/User'),a);
});
