import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localDebugOrigin,probeWorkBuddy} from '../scripts/probe-workbuddy.mjs';

test('WorkBuddy probe only accepts an explicit local debug origin',()=>{
  assert.equal(localDebugOrigin('http://127.0.0.1:9229'),'http://127.0.0.1:9229');
  for(const value of ['https://127.0.0.1:9229','http://example.com:9229','http://127.0.0.1:9229/json','http://secret@127.0.0.1:9229','http://127.0.0.1:9229/?token=a'])assert.throws(()=>localDebugOrigin(value));
});

test('reachable desktop and debug endpoints never certify WorkBuddy sync',async()=>{
  const calls:string[]=[];
  const result=await probeWorkBuddy({env:{CODEBUDDY_SESSION_ID:'11111111-1111-4111-8111-111111111111',GALGAME_WORKBUDDY_CDP:'http://127.0.0.1:9229'},fetchImpl:async(url:string,options:any)=>{
    calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.method,undefined);
    return new Response(JSON.stringify(url.endsWith('/json/version')?{Browser:'Chrome/test','Protocol-Version':'1.3'}:{ok:true,app:'workbuddy-desktop',version:'5.5.6',platform:'win32'}));
  }});
  assert.equal(result.debug.reachable,true);assert.equal(result.currentTask.verified,false);
  assert.equal(result.compatibility,'not-verified');assert.ok(Object.values(result.tests).every(x=>x===false));
  assert.ok(calls.every(x=>x.endsWith('/workbuddy/probe')||x.endsWith('/json/version')));
});

test('wrong application and absent host binding are not accepted',async()=>{
  const result=await probeWorkBuddy({env:{CODEX_THREAD_ID:'11111111-1111-4111-8111-111111111111'},fetchImpl:async()=>new Response(JSON.stringify({ok:true,app:'another-app',version:'1'}))});
  assert.deepEqual(result.desktop,[]);assert.equal(result.currentTask.sessionId,null);assert.equal(result.debug.configured,false);
});
