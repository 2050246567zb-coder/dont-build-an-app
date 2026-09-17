import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const require=createRequire(resolve(process.argv[2]||'tmp/live2d/autolive2d','package.json'));
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const {initializeCanvas,writePsdBuffer}=require('ag-psd');
import {mkdir, writeFile} from 'node:fs/promises';
initializeCanvas(createCanvas);
const out=resolve(process.argv[3]||'tmp/live2d/source');
await mkdir(out,{recursive:true});
const atlas=await loadImage(resolve(here,'system-spirit/atlas.png'));
const specs=[
 ['Body',[0,0,560,512],[100,110,840,768]],
 ['EyeLOpen',[650,140,285,280],[382,485,100,98]],
 ['EyeROpen',[1140,140,285,280],[536,513,100,98]],
 ['EyeLClosed',[100,680,330,180],[387,514,94,51]],
 ['EyeRClosed',[100,680,330,180],[540,542,94,51]],
 ['MouthSmile',[640,680,280,170],[466,569,90,55]],
 ['MouthOpen',[1200,680,180,200],[488,570,43,48]],
];
const layers=[];
for(const [name,src,dest] of specs){
 const canvas=createCanvas(1024,1024);canvas.getContext('2d').drawImage(atlas,...src,...dest);
 layers.push({name,canvas});
 await writeFile(`${out}/${name}.png`,canvas.toBuffer('image/png'));
}
// All source layers are visible for Cubism import; the rig controls closed eyes and open mouth opacity.
await writeFile(`${out}/system-spirit.psd`,writePsdBuffer({width:1024,height:1024,children:layers}));
const merged=createCanvas(1024,1024),ctx=merged.getContext('2d');
for(const l of layers)if(!/Closed|MouthOpen/.test(l.name))ctx.drawImage(l.canvas,0,0);
await writeFile(`${out}/neutral-preview.png`,merged.toBuffer('image/png'));
console.log('Wrote 7 image layers and layered PSD.');
