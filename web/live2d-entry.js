// Bundled against an explicitly supplied official Cubism Web SDK for this local trial.
import {CubismFramework} from '@cubism/live2dcubismframework';
import {CubismUserModel} from '@cubism/model/cubismusermodel';
import {CubismMatrix44} from '@cubism/math/cubismmatrix44';
import {CubismShaderManager_WebGL} from '@cubism/rendering/cubismshader_webgl';

let started=false;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const base='/live2d/';
async function resource(file,type='arrayBuffer') {
  const r=await fetch(base+file,{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error(`Live2D resource ${file}: ${r.status}`);
  return r[type]();
}
export async function createSpirit({body,image,button,onFailure}) {
  if(!started){CubismFramework.startUp();CubismFramework.initialize();started=true;}
  const canvas=document.createElement('canvas');canvas.className='live2d-canvas';canvas.setAttribute('aria-hidden','true');
  canvas.width=canvas.height=512;
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true});
  if(!gl)throw Error('WebGL unavailable');
  const user=new CubismUserModel(),textures=[];
  let disposed=false,frame=0,active=false,visible=false,last=0,time=0,count=0,reactionUntil=0,reaction='',gazeX=0,gazeY=0,targetX=0,targetY=0,nextBlink=3.4,blinkAt=-10,restoreTimer,tilt=0,lift=0,reactionMotion=true;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  try{
    const setting=await resource('spirit.model3.json','json');
    user.loadModel(await resource(setting.FileReferences.Moc),true);
    if(!user.getModel())throw Error('Invalid Cubism model');
    user.createRenderer(512,512);
    const renderer=user.getRenderer();renderer.startUp(gl);renderer.setIsPremultipliedAlpha(true);
    for(const [i,file]of setting.FileReferences.Textures.entries()) {
      const tex=gl.createTexture();textures.push(tex);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      // ImageBitmap alpha conversion is specified at decode time, not through UNPACK flags.
      const premultiplied=await createImageBitmap(await resource(file,'blob'),{premultiplyAlpha:'premultiply'});
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,premultiplied);premultiplied.close();
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      renderer.bindTexture(i,tex);
    }
    renderer.loadShaders(base+'shaders/');
    const shader=CubismShaderManager_WebGL.getInstance().getShader(gl),deadline=performance.now()+12000;
    // SDK 5-r.5 exposes the completion field, but no awaitable loader; keep this dependency pinned.
    while(!shader._isShaderLoaded){if(performance.now()>deadline)throw Error('Cubism shader initialization timed out');await new Promise(r=>setTimeout(r,40));}
  }catch(error){for(const tex of textures)gl.deleteTexture(tex);user.release();throw error;}
  body.insertBefore(canvas,button);
  const model=user.getModel(),renderer=user.getRenderer(),ids=CubismFramework.getIdManager();
  const parameters=new Map(['ParamEyeBallX','ParamEyeBallY','ParamEyeLOpen','ParamEyeROpen','ParamMouthOpenY','ParamBreath'].map(id=>[id,ids.getId(id)]));
  const set=(id,value)=>model.setParameterValueById(parameters.get(id),value);
  function draw(now){
    frame=0;if(disposed||!active||!visible||document.hidden)return;
    const dt=Math.min((now-(last||now))/1000,.05);last=now;time+=dt;
    if(reaction&&time>=reactionUntil)reaction='';
    const src=image.getAttribute('src')||'';
    const emotion=reaction||(src.includes('thinking')?'thinking':src.includes('approval')?'approval':src.includes('surprised')?'surprised':'neutral');
    const still=reduced.matches, follow=!still&&fine.matches;
    const ease=1-Math.exp(-dt*10);gazeX+=( (follow?targetX:0)-gazeX)*ease;gazeY+=((follow?targetY:0)-gazeY)*ease;
    if(!still&&time>=nextBlink){blinkAt=time;nextBlink=time+3.6+Math.random()*1.7;}
    const age=time-blinkAt;
    let openness=still?1:age<.1?1-age/.1:age<.16?0:age<.32?(age-.16)/.16:1;
    if(emotion==='approval')openness=0;
    else if(emotion==='thinking')openness*=.7;
    set('ParamEyeBallX',gazeX);set('ParamEyeBallY',gazeY);set('ParamEyeLOpen',openness);set('ParamEyeROpen',openness);
    set('ParamMouthOpenY',emotion==='surprised'?1:0);set('ParamBreath',still?0:(Math.sin(time*1.4)+1)/2);
    model.update();
    // CSS entrance transforms must not resize the WebGL drawing buffer every frame.
    const box={width:body.clientWidth,height:body.clientHeight},dpr=Math.min(devicePixelRatio||1,1.5);
    const w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const projection=new CubismMatrix44();projection.scale(Math.min(1,h/w),Math.min(1,w/h));
    const arr=projection.getArray();
    if(!still){const targetTilt=reactionMotion?(reaction==='approval'?-.055:reaction==='surprised'?.045:0):0,amount=1-Math.exp(-dt*14);tilt+=(targetTilt-tilt)*amount;lift+=((reaction&&reactionMotion?7:0)-lift)*amount;const sx=arr[0],sy=arr[5];arr[0]=Math.cos(tilt)*sx;arr[1]=Math.sin(tilt)*sy;arr[4]=-Math.sin(tilt)*sx;arr[5]=Math.cos(tilt)*sy;arr[13]=(Math.sin(time*Math.PI/3)*4+lift)*2/box.height;}else{tilt=lift=0;}
    projection.multiplyByMatrix(user.getModelMatrix());renderer.setMvpMatrix(projection);
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    renderer.setRenderState(null,[0,0,w,h]);renderer.drawModel(base+'shaders/');
    body.dataset.live2dEmotion=emotion;
    // Exposed on the DOM only for inspecting the real renderer in the local trial.
    canvas.dataset.gaze=`${gazeX.toFixed(3)},${gazeY.toFixed(3)}`;canvas.dataset.eyeOpen=openness.toFixed(3);
    if(!still)frame=requestAnimationFrame(t=>{try{draw(t);}catch(e){fail(e);}});
  }
  function wake(){if(!frame&&!disposed&&active&&visible&&!document.hidden){last=0;frame=requestAnimationFrame(t=>{try{draw(t);}catch(e){fail(e);}});}}
  function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
  function pointer(event){if(!active||!visible||!fine.matches||reduced.matches)return;const box=body.getBoundingClientRect();targetX=clamp((event.clientX-box.left-box.width/2)/(box.width/2),-1,1);targetY=clamp((box.top+box.height/2-event.clientY)/(box.height/2),-1,1);}
  function reset(){clearTimeout(restoreTimer);reaction='';targetX=targetY=0;wake();}
  function visibility(){if(document.hidden){stop();reaction='';targetX=targetY=0;}else wake();}
  function preference(){stop();gazeX=gazeY=targetX=targetY=0;wake();}
  function fail(error){dispose();onFailure(error);}
  function lost(event){event.preventDefault();fail(Error('WebGL context lost'));}
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();else stop();});observer.observe(body);
  const resize=new ResizeObserver(()=>wake());resize.observe(body);
  const portrait=new MutationObserver(()=>wake());portrait.observe(image,{attributes:true,attributeFilter:['src']});
  document.addEventListener('pointermove',pointer,{passive:true});document.addEventListener('visibilitychange',visibility);
  reduced.addEventListener('change',preference);canvas.addEventListener('webglcontextlost',lost);
  function dispose(){if(disposed)return;disposed=true;clearTimeout(restoreTimer);stop();observer.disconnect();resize.disconnect();portrait.disconnect();document.removeEventListener('pointermove',pointer);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',preference);canvas.removeEventListener('webglcontextlost',lost);body.classList.remove('live2d-ready');delete body.dataset.live2dEmotion;canvas.remove();for(const tex of textures)gl.deleteTexture(tex);user.release();}
  return {
    setEnabled(value){active=value;body.classList.toggle('live2d-ready',value);if(value)wake();else{stop();reset();}},
    poke(animate=true){if(!active)return;reactionMotion=animate;clearTimeout(restoreTimer);reaction=count++%2===0?'approval':'surprised';reactionUntil=time+1.2;wake();restoreTimer=setTimeout(()=>{reaction='';wake();},1200);},
    reset,dispose,
  };
}
