// Presentation only. Speaker comes from the committed story, never a new model call.
const root=document.documentElement,reduce=matchMedia('(prefers-reduced-motion: reduce)');
const themes={
  system:{background:'background.png',panel:'dialogue-frame.png',label:'MIDNIGHT ATELIER',caption:'MIDNIGHT CONVERSATIONS'},
  jobs:{background:'jobs-background.png',panel:'jobs-panel.png',label:'THE DESIGN STUDIO',caption:'FOCUS ON WHAT MATTERS'},
  xiaohei:{background:'xiaohei-background.png',panel:'xiaohei-panel.png',label:'THE REAL WORLD',caption:'LET ME TRY IT'},
};
const backdrop=document.createElement('div');backdrop.className='scene-backdrop';backdrop.setAttribute('aria-hidden','true');
document.getElementById('app').prepend(backdrop);
const layers=new Map();
for(const [role,theme] of Object.entries(themes)){
  const image=new Image();image.alt='';image.src=`/art/${theme.background}`;image.dataset.scene=role;image.decoding='async';
  image.classList.toggle('active',role==='system');backdrop.append(image);layers.set(role,image);
  image.decode().then(()=>image.classList.add('ready')).catch(()=>{});
  const panel=new Image();panel.src=`/art/${theme.panel}`;
}
let theme='system';
const themeMotions=new WeakMap();
export function setSceneTheme(role){
  if(!Object.hasOwn(themes,role)||role===theme)return;
  theme=role;
  root.dataset.theme=role;
  for(const [name,image] of layers)image.classList.toggle('active',name===role);
  // Animate live surfaces, not a document snapshot: typing and quick clicks stay live.
  for(const element of document.querySelectorAll('header,.stage-top,.dialogue,.quick-menu,#reply-panel,#delivery,dialog[open],#status-banner,#toast')){
    const previous=themeMotions.get(element),opacity=previous?.playState==='running'?getComputedStyle(element).opacity:'.25';previous?.cancel();
    if(reduce.matches||!element.getClientRects().length||element.hidden)continue;
    themeMotions.set(element,element.animate([{opacity},{opacity:1}],{duration:320,easing:'cubic-bezier(.16,1,.3,1)'}));
  }
}

// Animate panels on entry, including native top-layer dialogs. No input lock or delay.
const motions=new WeakMap();
function enter(element){
  motions.get(element)?.cancel();
  if(reduce.matches||!element.getClientRects().length)return;
  const animation=element.animate([{opacity:0,translate:'0 12px'},{opacity:1,translate:'0 0'}],
    {duration:320,easing:'cubic-bezier(.16,1,.3,1)'});
  motions.set(element,animation);
}
const entries=new MutationObserver(records=>{
  for(const element of new Set(records.map(record=>record.target))){
    if(element.matches('dialog')?element.open:!element.hidden)enter(element);
  }
});
if(!CSS.supports('transition-behavior','allow-discrete')){
  for(const element of document.querySelectorAll('dialog,#reply-panel,#delivery,#reply-reopen,#status-banner,#toast')){
    entries.observe(element,{attributes:true,attributeFilter:['hidden','open']});
  }
}
reduce.addEventListener('change',()=>{if(reduce.matches)for(const animation of document.getAnimations())animation.cancel();});
