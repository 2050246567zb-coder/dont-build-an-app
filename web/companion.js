// Local character feedback only: no chat submissions or runtime image generation.
// Decode first, then fade the complete character surface (PNG or Live2D).
const portraitStates=new WeakMap();
export async function changePortrait(surface,image,src,alt,beforeSwap=()=>{},isCurrent=()=>true){
  let state=portraitStates.get(surface);
  if(!state){state={revision:0,animation:null};portraitStates.set(surface,state);}
  const revision=++state.revision,next=new Image();next.src=src;
  try{await next.decode();}catch(error){if(revision===state.revision){state.animation?.cancel();surface.style.opacity='1';}throw error;}
  if(revision!==state.revision||!isCurrent())return false;
  const opacity=getComputedStyle(surface).opacity;state.animation?.cancel();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,same=image.src===next.src;
  const ease=getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim()||'cubic-bezier(0.23, 1, 0.32, 1)';
  const animate=async(from,to,duration)=>{
    surface.style.opacity=to;
    const animation=surface.animate([{opacity:from},{opacity:to}],{duration,easing:ease});state.animation=animation;
    try{await animation.finished;}catch{}
    if(state.animation===animation)state.animation=null;
  };
  if(!reduced&&!same)await animate(opacity,'0',120);
  if(revision!==state.revision||!isCurrent()){if(!state.animation)surface.style.opacity='1';return false;}
  beforeSwap();image.src=next.src;image.alt=alt;
  if(!reduced&&!same)await animate('0','1',160);else surface.style.opacity='1';
  return true;
}
const faces = new Map(['approval', 'surprised'].map(emotion => {
  const image = new Image();
  image.src = `/art/system-${emotion}.png`;
  const ready = image.decode().then(() => image.src).catch(() => null);
  return [emotion, ready];
}));

export function prefersLive2d(){try{return localStorage.getItem('spirit-live2d')!=='off';}catch{return true;}}
export function setLive2dPreference(value){try{localStorage.setItem('spirit-live2d',value?'on':'off');}catch{}window.dispatchEvent(new Event('spirit-preference'));}
let runtimePromise;
document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('pose-paused',document.hidden));
function runtime(){
  return runtimePromise??=fetch('/live2d/status').then(r=>r.json()).then(async status=>{
    if(!status.available)return null;
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/live2d/core.js';script.onload=resolve;script.onerror=()=>reject(Error('Live2D Core unavailable'));document.head.append(script);});
    return import('/live2d/runtime.js');
  }).catch(()=>null);
}

export function bindCompanion({floating, body, image, button, enabled = true}) {
  let active = enabled, reacting = false, count = 0, revision = 0, restoreTimer;
  let originalSrc = '', originalAlt = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let live2d=null,attempted=false;
  function useLive2d(){return live2d&&prefersLive2d();}
  async function enhance(){
    if(attempted||!active||!prefersLive2d())return;
    attempted=true;body.dataset.renderer='loading';
    try{
      const module=await runtime();if(!module){body.dataset.renderer='image';return;}
      live2d=await module.createSpirit({body,image,button,onFailure(){live2d=null;body.dataset.renderer='image';floating.classList.toggle('is-floating',active);}});
      reset();live2d.setEnabled(active&&prefersLive2d());body.dataset.renderer=prefersLive2d()?'live2d':'image';
      floating.classList.toggle('is-floating',active&&!useLive2d());
    }catch{body.dataset.renderer='image';}
  }

  function reset(restoreImage=true) {
    revision++;
    clearTimeout(restoreTimer);
    delete body.dataset.reaction;
    body.classList.remove('pointer-reaction');
    if (reacting && restoreImage)void changePortrait(body,image,originalSrc,originalAlt).catch(()=>{});
    reacting = false;
    live2d?.reset();
  }

  function setEnabled(value) {
    reset();
    active = value;
    button.hidden = !value;
    live2d?.setEnabled(value&&prefersLive2d());
    floating.classList.toggle('is-floating', value&&!useLive2d());
    if(value)void enhance();
  }

  button.addEventListener('click', async event => {
    if (!active) return;
    if(useLive2d()){live2d.poke(event.detail>0);return;}
    // Keep the original story portrait, even when a second poke interrupts the first.
    if (!reacting) {
      originalSrc = image.getAttribute('src');
      originalAlt = image.alt;
    }
    reacting = true;
    const request = ++revision;
    const emotion = count++ % 2 === 0 ? 'approval' : 'surprised';
    clearTimeout(restoreTimer);
    body.dataset.reaction = emotion;
    body.classList.toggle('pointer-reaction', event.detail > 0 && !reduce.matches);
    restoreTimer = setTimeout(reset, 1200);
    const src = await faces.get(emotion);
    // A slow image must never overwrite a newer poke or the next speaking character.
    if (!src || request !== revision || !active) return;
    void changePortrait(body,image,src,emotion === 'approval' ? '系统精灵开心地眯起眼睛' : '系统精灵惊讶地张开小嘴').catch(()=>{});
  });

  document.addEventListener('visibilitychange', () => {
    floating.classList.toggle('motion-paused', document.hidden);
    if (document.hidden) reset();
  });
  reduce.addEventListener('change', () => {
    if (reduce.matches) body.classList.remove('pointer-reaction');
  });
  window.addEventListener('spirit-preference',()=>{setEnabled(active);body.dataset.renderer=useLive2d()?'live2d':'image';});
  setEnabled(enabled);
  return {reset, setEnabled};
}
