// Checks exported Cubism geometry with the real, locally prepared official Core.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'web/vendor/live2d');
const context=vm.createContext({console,Buffer,process,require:createRequire(import.meta.url),__dirname:root,setTimeout,clearTimeout});
vm.runInContext(await readFile(join(root,'core.js'),'utf8'),context);
const core=context.Live2DCubismCore,b=await readFile(join(root,'spirit.moc3'));
const bytes=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
assert.equal(core.Moc.prototype.hasMocConsistency(bytes),1,'Moc consistency');
const moc=core.Moc.fromArrayBuffer(bytes),model=core.Model.fromMoc(moc);
const defaults=[...model.parameters.defaultValues];
function pose(params){model.parameters.values.set(defaults);for(const [id,v]of Object.entries(params)){const i=model.parameters.ids.indexOf(id);assert.ok(i>=0,id);model.parameters.values[i]=v;}model.update();return Object.fromEntries(model.drawables.ids.map((id,i)=>[id,{opacity:model.drawables.opacities[i],positions:[...model.drawables.vertexPositions[i]]}]));}
const neutral=pose({}),left=pose({ParamEyeBallX:-1}),right=pose({ParamEyeBallX:1}),down=pose({ParamEyeBallY:-1}),up=pose({ParamEyeBallY:1}),closed=pose({ParamEyeLOpen:0,ParamEyeROpen:0}),open=pose({ParamMouthOpenY:1});
for(const side of ['L','R']){
 const id=`Eye${side}Open`;
 assert.ok(right[id].positions[0]-left[id].positions[0]>20,'Horizontal gaze moves geometry');
 assert.ok(up[id].positions[1]-down[id].positions[1]>12,'Vertical gaze moves geometry');
 assert.equal(neutral[id].opacity,1);assert.equal(closed[id].opacity,0);assert.equal(closed[`Eye${side}Closed`].opacity,1);
}
assert.deepEqual(left.Body,right.Body,'Gaze leaves body fixed');
assert.deepEqual(closed.MouthSmile,neutral.MouthSmile,'Blink leaves mouth fixed');
assert.equal(open.MouthOpen.opacity,1);assert.equal(open.MouthSmile.opacity,0);
assert.equal(neutral.MouthOpen.opacity,0);assert.equal(neutral.MouthSmile.opacity,1);
const diagonalBlink=pose({ParamEyeBallX:1,ParamEyeBallY:1,ParamEyeLOpen:0,ParamEyeROpen:0});
assert.equal(diagonalBlink.EyeLOpen.opacity,0);assert.equal(diagonalBlink.EyeLClosed.opacity,1);
console.log(JSON.stringify({passed:true,coreVersion:core.Version.csmGetVersion(),mocBytes:b.length,drawables:model.drawables.count,checks:['moc-consistency','gaze-x','gaze-y','blink','mouth','independence','combined-parameters']},null,2));
model.release();moc._release();
