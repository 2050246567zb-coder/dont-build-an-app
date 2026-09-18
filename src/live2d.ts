import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
// Explicit names only: this route never exposes Editor files, PSDs, logs, or arbitrary paths.
const shaderNames=['vertshadersrcsetupmask.vert','vertshadersrcmasked.vert','vertshadersrccopy.vert','vertshadersrcblend.vert','vertshadersrc.vert','fragshadersrcsetupmask.frag','fragshadersrcpremultipliedalphablend.frag','fragshadersrcpremultipliedalpha.frag','fragshadersrcmaskpremultipliedalpha.frag','fragshadersrcmaskinvertedpremultipliedalpha.frag','fragshadersrccopy.frag','fragshadersrccolorblend.frag','fragshadersrcalphablend.frag'];
const files=new Set(['core.js','runtime.js','spirit.model3.json','spirit.moc3','texture_00.png',...shaderNames.map(s=>'shaders/'+s)]);
export async function live2dAsset(root:string,file:string){
  if(!files.has(file))return null;
  try{return {bytes:await readFile(join(root,file)),mime:file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':file.endsWith('.moc3')?'application/octet-stream':'text/plain; charset=utf-8'};}catch(error:any){if(error.code==='ENOENT')return null;throw error;}
}
export async function live2dAvailable(root:string){
  const results=await Promise.all([...files].map(file=>live2dAsset(root,file)));
  return results.every(Boolean);
}
