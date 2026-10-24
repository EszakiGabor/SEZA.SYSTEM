/* Bailong v2.0 — deterministic consequence-based obstacle sequences.
   Independent of Canvas and DOM so it can be verified in Node or browser. */
(function(root){
'use strict';
const BASE={W:405,H:720,x:110,speed:2.6,gravity:.34,jump:-6.4,head:12,body:9,
  bodyLag:4,bodyStep:15,bodyCount:3,ow:78,spacing:232,margin:4};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function rng(seed){let v=(seed|0) || 1;return ()=>((v=(v*16807)%2147483647)/2147483647);}
const patterns=[
 {name:'REST',values:[0]},
 {name:'HIGH_LOW',values:[-1,1]},
 {name:'LOW_HIGH',values:[1,-1]},
 {name:'HIGH_LOW_HIGH',values:[-1,1,-1]},
 {name:'REWARD_DETOUR',values:[0,-1,0]},
 {name:'NARROW_AFTER_REST',values:[0,1,-1,0]}
];
/** Programmed challenge grammar. Output records pattern source for debug/testing. */
function draft({seed=7,n=18,gap=[210,190],tier=0,spacing=BASE.spacing,ampScale=1,H=BASE.H}={}){
 const random=rng(seed);const obs=[];let idx=0,previous=0;
 const catalog=tier===0?[0,1,2,4]:tier===1?[0,1,2,3,4]:[0,1,2,3,4,5];
 while(idx<n){
  let p=patterns[catalog[Math.floor(random()*catalog.length)]];
  if(idx===0)p=patterns[0];
  for(const v of p.values){if(idx>=n)break;
   // Band placement is varied but never a pure unbounded random walk.
   let direction=v;
   if(v!==0&&previous===v&&random()<.62)direction=-v;
   const difficulty=tier===0?68:tier===1?77:tier===2?86:92;
   const bias=(random()-.5)*18;
   const center=clamp(Math.round(H/2+direction*difficulty*ampScale+bias),200,H-200);
   const h=Math.round(gap[0]+(gap[1]-gap[0])*idx/Math.max(1,n-1));
   obs.push({x:520+idx*spacing,gy:idx===0?H/2:center,gap:h,
     kind:p.name,side:direction,ordinal:idx});
   previous=direction;idx++;
  }
 }
 return obs;
}
function overlaps(p,q,r,x,y,w,h){const ax=Math.max(x,Math.min(p,x+w))-p;
 const ay=Math.max(y,Math.min(q,y+h))-q;return ax*ax+ay*ay<r*r;}
/** Check frame-by-frame collision including the head and three trailing sections. */
function checkCollision(state,obs,frame,opt){
 const dist=frame*opt.speed;
 const trail=state.hist;
 const pts=[[opt.x,state.y,opt.head]];
 for(let i=1;i<=opt.bodyCount;i++)pts.push([opt.x-i*opt.bodyStep,trail[Math.min(trail.length-1,i*opt.bodyLag-1)],opt.body]);
 for(const o of obs){const sx=o.x-dist;if(sx>opt.x+40||sx+opt.ow<opt.x-65)continue;
  const t=o.gy-o.gap/2,b=o.gy+o.gap/2,x=sx+8,w=opt.ow-16;
  for(const [px,py,r] of pts){
    if(t>0&&overlaps(px,py,r,x,0,w,t))return true;
    if(b<opt.H&&overlaps(px,py,r,x,b,w,opt.H-b))return true;
  }
 }
 return false;
}
/** Beam-search approximate reachability proof.
    Inputs can tap at least every 7 frames; tested every frame, including whole-pillar overlap.
    Returns a sample tap script if solvable. Solver is conservative/quantized, not a human-skill guarantee. */
function verify(obs,opts={}){
 const opt={...BASE,...opts};if(!obs.length)return {reachable:true,steps:0,taps:[]};
 // Simulate until all of the tail has left the final pillar.
 const end=Math.ceil((obs[obs.length-1].x+opt.ow-opt.x+opt.bodyCount*opt.bodyStep)/opt.speed)+6;
 let states=[{y:opt.H/2,vy:opt.jump,cd:0,hist:Array(12).fill(opt.H/2),taps:[],score:0}];
 const maxStates=opts.maxStates||84;
 for(let frame=1;frame<=end;frame++){
  const pool=new Map();
  const dist=frame*opt.speed;
  let next=obs.find(o=>o.x+opt.ow>dist+opt.x-48);
  if(!next)next=obs[obs.length-1];
  const timeToEntry=(next.x-dist-opt.x)/opt.speed;
  for(const st of states){
   // The tap branch exists only if sufficient frames elapsed since the last tap.
   const acts=st.cd>=7?[0,1]:[0];
   for(const tap of acts){
    let vy=(tap?opt.jump:st.vy)+opt.gravity;
    vy=clamp(vy,-7,7.8);
    let y=clamp(st.y+vy,18,opt.H-50);
    if(y===18&&vy<0)vy=0;
    if(y===opt.H-50&&vy>0)vy=0;
    const hist=[y,...st.hist.slice(0,11)];
    const newState={y,vy,cd:tap?0:Math.min(10,st.cd+1),hist,
      taps:tap?[...st.taps,frame]:st.taps,score:0};
    if(checkCollision(newState,obs,frame,opt))continue;
    if(opts.debug){newState.parent=st;newState.frame=frame;}
    // Look ahead: align with current transit until tail clears, then with the next gap.
    const target=next.gy;
    const predicted=y+vy*clamp(timeToEntry*.45,0,20)+opt.gravity*Math.pow(clamp(timeToEntry*.45,0,20),2)/2;
    const error=Math.abs(predicted-target);
    newState.score=error*.78+Math.abs(vy)*.9+newState.taps.length*.007;
    // Diverse states by height / velocity / cooldown. Stable order ensures determinism.
    const key=`${Math.round(y/8)}:${Math.round(vy/1.4)}:${Math.floor(newState.cd/4)}`;
    const old=pool.get(key);
    if(!old||newState.score<old.score)pool.set(key,newState);
   }
  }
  if(!pool.size)return {reachable:false,steps:frame,reason:'no collision-free trajectory'};
  states=Array.from(pool.values()).sort((a,b)=>a.score-b.score).slice(0,maxStates);
 }
 states.sort((a,b)=>a.taps.length-b.taps.length);
 let debugTrace; if(opts.debug){debugTrace=[];let st=states[0];while(st&&st.frame){debugTrace.push({f:st.frame,y:st.y,vy:st.vy,tap:st.taps[st.taps.length-1]===st.frame});st=st.parent}debugTrace.reverse()}
 return {reachable:true,steps:end,taps:states[0].taps,finalY:Math.round(states[0].y),...(opts.debug?{debugTrace}:{})};
}
/** Generator retries reducing excursion amplitude, never accepting an unverified track. */
function generate(cfg={}){
 const options={...BASE,...cfg};
 for(const scale of [1,.9,.8,.7,.55,.35,0]){
  const obs=draft({...cfg,H:options.H,spacing:options.spacing,ampScale:scale});
  const result=verify(obs,{...options,maxStates:90});
  if(result.reachable)return {obs,proof:{...result,scale,seed:cfg.seed}};
 }
 throw new Error('Bailong generator could not verify a safe path');
}
const API={BASE,patterns,draft,verify,generate,checkCollision};
root.BailongChallenge=API;
if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
