import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {live2dAsset,live2dAvailable} from '../src/live2d.ts';
test('optional Live2D files fail closed without leaking source files',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'galgame-live2d-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  assert.equal(await live2dAvailable(dir),false);
  await writeFile(join(dir,'core.js'),'/* fixture */');await writeFile(join(dir,'source.psd'),'private artwork');
  assert.equal((await live2dAsset(dir,'core.js'))?.mime,'text/javascript; charset=utf-8');
  for(const file of ['../package.json','source.psd','shaders/../core.js','%2e%2e/core.js','CORE-LICENSE.md'])assert.equal(await live2dAsset(dir,file),null);
  assert.equal(await live2dAvailable(dir),false,'A partial install is unavailable');
});
