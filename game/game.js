const cv=document.getElementById('c'),ctx=cv.getContext('2d'),W=405,H=720,DX0=110,SP=2.6;
// Gameplay config. Kept separate from the artwork: swap images freely, hitboxes and levels stay the same.
const HB={pillarX:4,pillarW:56,head:12,body:9,bodyStep:15,bodyLag:4,bodyCount:3,pickup:26};
const LEVELS=[
 {name:'Cloud Path',n:15,gap:[225,202],seed:7,hearts:2,clovers:1,note:'Learn the rhythm'},
 {name:'Wind Stair',n:20,gap:[207,182],seed:21,hearts:2,clovers:2,shanxiao:3,note:'Moving pillars begin'},
 {name:'Fox Mirage',n:23,gap:[195,172],seed:35,hearts:2,clovers:2,foxes:2,note:'First swinging hammers'},
 {name:'Bronze Bells',n:26,gap:[187,163],seed:49,hearts:2,clovers:2,shanxiao:3,foxes:2,note:'Time the pendulums'},
 {name:'Jade Corridor',n:29,gap:[181,158],seed:63,hearts:2,clovers:2,shanxiao:4,foxes:3,note:'Precision flight'},
 {name:'Storm Temple',n:32,gap:[176,153],seed:77,hearts:2,clovers:2,shanxiao:5,foxes:3,note:'Fast hammer swings'},
 {name:'Dragon Trial',n:35,gap:[172,149],seed:91,hearts:2,clovers:2,shanxiao:5,foxes:4,note:'Learn every obstacle'},
 {name:"Heaven's Gate",n:38,gap:[168,146],seed:105,hearts:3,clovers:2,shanxiao:6,foxes:4,note:'The final gauntlet'}
];
cv.width=W*2;cv.height=H*2;ctx.scale(2,2);ctx.imageSmoothingQuality='high';
const calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
let s=7;const rnd=()=>(s=s*16807%2147483647)/2147483647;
// Bailong v1.3: one standalone pillar sprite, rotated for the upper obstacle.
const ART={on:false,n:0,err:0,imgs:{}};
const heavenlyGateImg=new Image();
heavenlyGateImg.src='assets/heavenly_gate.webp';
const pillarImg=new Image();
pillarImg.onload=()=>{ART.on=true;ART.n=1};
pillarImg.onerror=()=>{ART.err=1};
pillarImg.src='assets/pillar.png';
// Character artwork extracted from the supplied transparent sprite sheet.
const bailongHead=new Image();
bailongHead.src='assets/bailong_head.png';

// v2.7 art sprites; rendering does not alter physics or hitboxes.
const bladeArt={};
for(const key of ['blade_disc','blade_mount_top','blade_receiver_bottom']){const img=new Image();img.src='assets/'+key+'.png';bladeArt[key]=img;}
function bladeSprite(key,x,y,w,h){const img=bladeArt[key];if(img.complete&&img.naturalWidth){ctx.drawImage(img,x,y,w,h);return true;}return false;}
// v3.3.3: dedicated launcher pillar replaces the lower pillar sprite only.
const spearAssets={};
for(const key of ['pillar_launcher','pillar_firing','spear_projectile']){const img=new Image();img.src='assets/'+key+'.png';spearAssets[key]=img;}
const trapArt={};
for(const key of ['enemy_hulijing','shan_idle','shan_alert','shan_hold','shan_raise','shan_throw','shan_rock']){
 const img=new Image();img.src='assets/'+key+'.png';trapArt[key]=img;
}
function sprite(key,x,y,w,h,flip=false){
 const img=trapArt[key];if(!img||!img.complete||!img.naturalWidth)return false;
 ctx.save();if(flip){ctx.translate(x+w,y);ctx.scale(-1,1);ctx.drawImage(img,0,0,w,h)}else ctx.drawImage(img,x,y,w,h);ctx.restore();return true;
}
let artMode=false,OW=92,SPC=232,MAXD=185;
// Geometry never depends on image loading: a failed image download cannot change a level.
function setMode(){artMode=ART.on;OW=92;SPC=232;MAXD=185}
// v2.5: deterministic obstacle cycles. Frame 0 and phase are identical on every retry.
const TRACK_CACHE=new Map();
let stageFrame=0, hammers=[],wheels=[],spears=[],fireTraps=[];
const obstacleFrame=()=>stageFrame;
function pillarShift(o,frame=stageFrame){
 if(!o.motion)return 0;
 return Math.sin(frame*o.motion.rate+o.motion.phase)*o.motion.amp;
}
function gapCenter(o,frame=stageFrame){return o.gy+pillarShift(o,frame)}
// The ceiling-mounted pendulum occupies the horizontal space BETWEEN pillars.
// Its art and collision geometry use the same pivot and end point.
function hammerAnchor(h,frame=stageFrame){
 return {x:h.x,y:17}; // top of the existing 9:16 playfield, not on a pillar
}
function hammerPos(h,frame=stageFrame){
 const anchor=hammerAnchor(h,frame);
 const a=Math.sin(frame*h.rate+h.phase)*h.swing;
 return {x:anchor.x+Math.sin(a)*h.length,y:anchor.y+Math.cos(a)*h.length,a,anchor};
}
function hammerCollision(h,pts){
 const pos=hammerPos(h),sx=pos.x-dist;
 // Hitbox follows the mace head, never the decorative chain.
 return pts.some(([px,py,r])=>((sx-px)/ (h.radius*1.3+r))**2+((pos.y-py)/(h.radius+r))**2<1);
}
// Ceiling-to-floor blade: fixed horizontal lane between pillar pairs.
// Position and hitbox share the same y coordinate.
function wheelPos(z,frame=stageFrame){
 const elapsed=Math.max(0,frame-z.startFrame);
 const cycle=elapsed%z.period;
 const fall=Math.min(1,Math.max(0,(cycle-z.wait)/z.fallFrames));
 const returnT=Math.min(1,Math.max(0,(cycle-z.wait-z.fallFrames-z.rest)/z.returnFrames));
 const y0=20,y1=H-25;
 const y=cycle<z.wait?y0:cycle<z.wait+z.fallFrames?y0+(y1-y0)*fall:cycle<z.wait+z.fallFrames+z.rest?y1:y1-(y1-y0)*returnT;
 return {x:z.x,y};
}
// Projectile spear launcher: mount is rigidly attached to the LOWER pillar.
// Projectile is a separate object that travels to the right, never stretches.
function spearPos(z,frame=stageFrame){
 const o=obs[z.pillarIndex],cy=gapCenter(o,frame);
 const pillarTop=cy+o.gap/2;
 return {x:o.x+OW-8,y:pillarTop+85};
}
function spearFlight(z,frame=stageFrame){
 const cycle=(frame+z.phase)%z.period;
 const warning=z.warning;
 const flying=cycle>=warning&&cycle<warning+z.flightFrames;
 return {flying,warning:cycle<warning&&cycle>warning-13,
  travel:flying?(cycle-warning)*z.speed:0};
}
function firePos(z,frame=stageFrame){
 const o=obs[z.pillarIndex],cy=gapCenter(o,frame);
 return {x:o.x+OW-3,y:cy+(z.side==='top'?-o.gap/2-20:o.gap/2+20)};
}

let trackProof=null,autoTapSet=null,autoFrame=0;
let stageCoins=0,stageMax=0,stageResults=Array(LEVELS.length).fill(null);
let obs,items,state='title',y,vy,dx,hist,dist,got,lives=3,hurtT=0,cloverT=0,lv=0,snap=[0,0,0],bannerT=0,flash=0,shx=[],rocks=[],foxes=[],floaters=[],t=0,bgx=0,parts=[],queue,drops,landed,fin,gateX,lock=0,dropT=0,endT=0;
const clouds=Array.from({length:26},()=>{const u=Math.random();return{x:Math.random()*(W+240),y:Math.random()*H,r:14+u*34,a:.3+u*.5,l:.25+u*.75}});
// Replay the generator's verified collision-free flight to anchor precision coins.
// Every coin lies within pickup reach of one complete, physically valid trajectory.
function proofFlight(proof,lastX){
 const taps=new Set(proof.taps),out=[];let py=H/2,pv=-6.4;
 const frames=Math.ceil((lastX-DX0)/SP)+8;
 for(let f=1;f<=frames;f++){
  if(taps.has(f))pv=-6.4;
  pv=Math.max(-7,Math.min(7.8,pv+.34));py+=pv;
  if(py<18){py=18;pv=0}if(py>H-50){py=H-50;pv=Math.min(pv,0)}
  out[f]=py;
 }
 return out;
}
function grade(coins,max){const pct=max?Math.round(coins*100/max):100;
 return {pct,label:pct===100?'PERFECT RUN!':pct>=75?'GREAT JOB!':pct>=50?'GOOD JOB!':'KEEP TRYING!'};
}
function build(i){
 const L=LEVELS[i],n=L.n;s=L.seed;items=[];
 // Existing levels and enemies are kept; only obstacle generation is now physics-verified.
 const generated=TRACK_CACHE.get(i)||BailongChallenge.generate({seed:L.seed,n,gap:L.gap,tier:i,
  W,H,x:DX0,speed:SP,gravity:.34,jump:-6.4,ow:OW,spacing:SPC,head:HB.head,body:HB.body,
  bodyLag:HB.bodyLag,bodyStep:HB.bodyStep,bodyCount:HB.bodyCount});
 TRACK_CACHE.set(i,generated);
 obs=generated.obs.map((o,k)=>({
  ...o,
  // First level is the static training course. Subsequent stages introduce
  // progressively more moving pillars, with a fixed predictable phase.
  motion:i>0 && k>3 && k% (i===1?5:i===2?4:3)===1
    ? {amp:i===1?13:i===2?18:Math.min(30,19+i*1.6),rate:.022+(k%3)*.003,phase:k*.7}
    : null
 }));trackProof=generated.proof;
 stageFrame=0;
 hammers=[];wheels=[];spears=[];fireTraps=[];
 if(i>=1){
  for(let k=5;k<n-2;k+=(i===1?8:i===2?7:i===3?6:i===4?5:4)){
   const o=obs[k],next=obs[k+1];
   // Between the right edge of pillar k and the left edge of pillar k+1.
   const middle=(o.x+OW+next.x)/2;
   hammers.push({pillarIndex:k,x:middle,length:i<3?270:i<5?292:312,
    radius:27,swing:i<3?.32:i<5?.43:.54,
    rate:.027+(k%3)*.004,phase:k*.67});
  }
 }
 if(i>=2)for(let k=7;k<n-2;k+=(i<5?10:7)){
  const o=obs[k],next=obs[k+1];
  // A blade is centered in the space BETWEEN consecutive pillar columns.
  wheels.push({pillarIndex:k,x:(o.x+OW+next.x)/2,r:25,period:i<5?195:158,
   wait:i<5?55:36,fallFrames:i<5?52:40,rest:22,returnFrames:i<5?66:60,
   startFrame:0,rate:.075,phase:k*.8,triggered:false});
 }
 if(i>=3)for(let k=9;k<n-2;k+=(i<6?10:7)){
  const o=obs[k];o.launcher=true;spears.push({pillarIndex:k,phase:(k*17)%110,period:155,warning:38,flightFrames:52,speed:9.2,length:76});
 }
 if(i>=5)for(let k=11;k<n-2;k+=10){
  const o=obs[k];fireTraps.push({pillarIndex:k,x:o.x+OW-3,side:k%2?'top':'bottom',phase:k*.7,rate:.026,length:94});
 }
 autoTapSet=new Set(trackProof.taps);autoFrame=0;
 // Healing/shield pickups remain independent from the precision coin challenge.
 const plan=Array(n).fill(0);
 const place=(cnt,ty)=>{for(let c=0;c<cnt;c++){let k=Math.max(1,Math.min(n-2,Math.round((c+.5)*n/cnt+(rnd()-.5)*2))),g=0;while(plan[k]&&g++<n)k=k%(n-2)+1;plan[k]=ty}};
 place(L.clovers,2);place(L.hearts,1);
 obs.forEach((o,k)=>{const ty=plan[k];if(ty){const iy=ty===2?(rnd()<.5?o.gy-o.gap/2+35:o.gy+o.gap/2-35):o.gy+(rnd()-.5)*o.gap*.43;items.push({x:o.x+OW/2,y:iy,ty,on:1})}});
 // 3 fixed precision coins per obstacle segment: entry, between pillars and exit.
 // A proven full-flight route exists; 12-19px offsets demand close control.
 const flight=proofFlight(trackProof,obs[n-1].x+OW+100);
 for(let k=0;k<n;k++){
  const o=obs[k];
  const xs=[o.x+OW*.5,o.x+OW+(SPC-OW)*.33,o.x+OW+(SPC-OW)*.75];
  for(let j=0;j<xs.length;j++){
   const x=xs[j],frame=Math.max(1,Math.round((x-DX0)/SP));
   const sign=((k*3+j+L.seed)%2)?1:-1;
   const offset=(i===0?9:i===1?12:i===2?15:Math.min(23,15+i))*sign;
   const cy=Math.max(22,Math.min(H-54,flight[frame]+offset));
   items.push({x,y:cy,ty:0,on:1,precision:true});
  }
 }
 stageCoins=0;stageMax=items.filter(it=>it.ty===0).length;
 // Shanxiao: mountain spirits standing between two pillars, spread along the level (never in the first 3 pillars)
 shx=[];const sc2=L.shanxiao||0,used={};
 for(let c=0;c<sc2;c++){let k=Math.max(3,Math.min(n-2,Math.round(3+(c+.5)*(n-5)/sc2+(rnd()-.5)*2))),g=0;while(used[k]&&g++<n)k=k>=n-2?3:k+1;used[k]=1;const x=obs[k].x+OW+(SPC-OW)/2;shx.push({x,pillarIndex:k,st:0,t:0})}
 // Huli Jing: the fox sits on a pillar cap (not next to a clover or a Shanxiao), later runs off ahead and marks one pickup in the next section as a trap
 foxes=[];const fc=L.foxes||0,fu={};
 for(let c=0;c<fc;c++){let k=Math.max(2,Math.min(n-6,Math.round(2+(c+.5)*(n-8)/fc+(rnd()-.5)*2))),g=0;
  const bad=q=>fu[q]||plan[q]==2||used[q]||used[q-1];
  while(bad(k)&&g++<n)k=k>=n-6?2:k+1;fu[k]=1;
  foxes.push({x:obs[k].x+(artMode?20:32),y:obs[k].gy+obs[k].gap/2-2,st:0,t:0,rx:0});
 }
 gateX=520+n*SPC+300;y=H/2;vy=0;dx=DX0;hist=Array(60).fill(y);dist=0;hurtT=0;cloverT=0;parts=[];queue=[];drops=[];landed=0;fin=0;dropT=0;endT=0;bannerT=100;rocks=[];floaters=[];
}
function startLevel(i,keep){lv=i;if(!keep)snap=got.slice();build(i)}
function reset(){setMode();got=[0,0,0];stageResults=Array(LEVELS.length).fill(null);lives=3;startLevel(0)}
function retry(){got=snap.slice();lives=3;startLevel(lv,1)}
reset();
function rects(o,sx){
 const cy=gapCenter(o),top=cy-o.gap/2,bot=cy+o.gap/2;
 // Simple independent pillars, no crossbar or invisible connector hitboxes.
 return [[sx+8,0,OW-16,top],[sx+8,bot,OW-16,H-bot]];
}
const cr=(p,q,r,x,y,w,h)=>{const a=Math.max(x,Math.min(p,x+w))-p,b=Math.max(y,Math.min(q,y+h))-q;return a*a+b*b<r*r};
const gl=()=>H+170-230*Math.min(1,fin/100);
function reveal(x,y){for(let i=0;i<16;i++)parts.push({x,y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,g:.03,l:40,m:40,c:'#c77dff',r:3});floaters.push({x,y:y-12,s:'Huli Jing!',l:70})}
function burst(x,y,ty,n=10){const c=['#ffd45a','#ff6a7c','#7dffa8'][ty];for(let i=0;i<n;i++)parts.push({x,y,vx:(Math.random()-.5)*4,vy:(Math.random()-.5)*4,g:.05,l:30,m:30,c,r:2.5})}
function die(){state='dead';lock=18;BailongSound.play('hit');burst(dx,y,0,6);burst(dx,y,1,6);for(let i=0;i<14;i++)parts.push({x:dx,y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,g:.05,l:40,m:40,c:'#8fc6ff',r:3})}
function ouch(){ // one life lost; 0 = ignored (invincible), 1 = game over, 2 = lost a life and keeps playing
 if(hurtT>0||cloverT>0)return 0;
 lives--;
 if(lives<=0){lives=0;die();return 1}
 hurtT=100;BailongSound.play('hit');burst(dx,y,1,14);return 2;
}
function hit(o){if(ouch()==2){y=gapCenter(o);vy=0;hist.fill(y)}}
function act(){
 if(state==='paused'){state='play';return}
 if(state==='title'){reset();state='play';vy=-6.4;BailongSound.play('flap')}
 else if(state==='play'){vy=mobileTouch?-7.3:-6.4;BailongSound.play('flap')}
 else if(state==='dead'&&lock<=0){retry();state='play';vy=-6.4;BailongSound.play('flap')}
 else if(state==='end'&&lock<=0){reset();state='play';vy=-6.4;BailongSound.play('flap')}
}
function togglePause(){
 if(state==='play'){state='paused';last=0;lag=0}
 else if(state==='paused'){state='play';last=0;lag=0}
}
// v3.3.14: immediate tap plus continuous controlled lift while finger is held.
// Mobile users can hold instead of having to tap repeatedly at high speed.
const mobileTouch=matchMedia('(pointer:coarse)').matches;
let touchHeld=false,touchLast=0,touchId=null;
const playArea=document.getElementById('stage');
playArea.addEventListener('pointerdown',e=>{
 if(e.target.closest('button'))return;
 if(e.pointerType==='mouse'&&e.button!==0)return;
 if(!document.getElementById('veil').classList.contains('hidden'))return;
 e.preventDefault();
 touchHeld=mobileTouch&&e.pointerType!=='mouse';touchId=e.pointerId;
 touchLast=performance.now();act();
},{passive:false});
function releaseTouch(e){if(touchId===null||e.pointerId===touchId){touchHeld=false;touchId=null}}
window.addEventListener('pointerup',releaseTouch);
window.addEventListener('pointercancel',releaseTouch);
window.addEventListener('blur',()=>{touchHeld=false;touchId=null});
document.addEventListener('keydown',e=>{
 if((e.code==='Space'||e.code==='ArrowUp')&&!e.repeat){e.preventDefault();act()}
 if((e.code==='KeyP'||e.code==='Escape')&&!e.repeat){e.preventDefault();togglePause()}
 if(e.code==='KeyM'&&!e.repeat){e.preventDefault();toggleSound()}
});
function toggleSound(){const state=BailongSound.setEnabled(!BailongSound.enabled);BailongUI.showNotice(state?'SOUND ON':'SOUND OFF',65)}
BailongUI.bind({main:act,pause:togglePause,sound:toggleSound});

function update(dt){
 if(state==='paused')return;
 if(state==='play'&&location.search.includes('autoplay=1')){autoFrame++;if(autoTapSet?.has(autoFrame))vy=-6.4}
 t+=dt;lock-=dt;bannerT-=dt;flash-=dt;bgx+=dt*(state=='play'?SP:.8);
 if(state=='title'){y=H/2+Math.sin(t/25)*14;hist.unshift(y);hist.length=60}
 else if(state=='play'){
  stageFrame+=dt;
  for(const z of wheels){if(!z.triggered && z.x-dist-dx<185){z.triggered=true;z.startFrame=stageFrame;}}
  vy+=.34*dt;vy=Math.max(-7,Math.min(7.8,vy));y+=vy*dt;hurtT-=dt;cloverT-=dt;
  if(y<18){y=18;vy=0}if(y>H-50){y=H-50;vy=Math.min(vy,0)}
  hist.unshift(y);hist.length=60;dist+=SP*dt;
  const pts=[[dx,y,HB.head],...Array.from({length:HB.bodyCount},(_,k)=>{const i=k+1;return[dx-i*HB.bodyStep,hist[i*HB.bodyLag],HB.body]})];
  for(const o of obs){const sx=o.x-dist;if(sx>dx+30||sx+OW<dx-60)continue;
   const rc=rects(o,sx);
   for(const[p,q,r]of pts)if(rc.some(R=>R[3]>0&&cr(p,q,r,R[0],R[1],R[2],R[3]))){hit(o);if(state!=='play')return;break}}
  for(const h of hammers){
   const hx=h.x-dist;
   if(hx>-h.length-40 && hx<W+h.length+40 && hammerCollision(h,pts)){
    if(ouch()===1)return;
   }
  }
  // All new hazards use their own simple, stable collision volumes.
  if(hurtT<=0&&cloverT<=0){
   for(const z of wheels){if(!z.triggered)continue;const pos=wheelPos(z),xx=pos.x-dist;if(Math.abs(xx-dx)>85)continue;
    if(pts.some(([px,py,r])=>(xx-px)**2+(pos.y-py)**2<(z.r+r-3)**2)){if(ouch()===1)return;break}
   }
   for(const z of spears){
    const shot=spearFlight(z);if(!shot.flying)continue;
    const pos=spearPos(z),xx=pos.x+shot.travel-dist;
    if(pts.some(([px,py,r])=>px+r>xx&&px-r<xx+z.length&&Math.abs(py-pos.y)<r+9)){
     if(ouch()===1)return;break;
    }
   }
   for(const z of fireTraps){const active=Math.sin(stageFrame*z.rate+z.phase)>.4;
    if(!active)continue;const pos=firePos(z),xx=pos.x-dist;
    if(pts.some(([px,py,r])=>px>xx&&px<xx+z.length+r&&Math.abs(py-pos.y)<r+11)){if(ouch()===1)return;break}
   }
  }
  for(const it of items){if(!it.on)continue;const sx=it.x-dist;if(Math.abs(sx-dx)<HB.pickup&&Math.abs(it.y-y)<HB.pickup){it.on=0;if(it.fake){reveal(sx,it.y);BailongSound.play('fox');if(ouch()==1)return;continue}got[it.ty]++;if(it.ty===0)stageCoins++;if(it.ty==1&&lives<3)lives++;if(it.ty==2)cloverT=240;BailongSound.play(['coin','heart','shield'][it.ty]);burst(sx,it.y,it.ty)}}
  for(const o of foxes){
   const sx=o.x-dist;
   if(o.st==0&&sx<W-30&&sx>dx+80){o.st=1;o.t=0}
   else if(o.st==1){o.t+=dt;if(o.t>=40){o.st=2;o.t=0;
    const el=items.filter(it=>it.on&&!it.fake&&it.ty!==0&&it.x>o.x+100&&it.x<o.x+100+4.2*SPC); // the next section; the player cannot tell which one is the trap
    if(el.length>=3)el[Math.floor(rnd()*el.length)].fake=true}}
   else if(o.st==2){o.rx+=5.5*dt;if(sx+o.rx>W+40)o.st=3}
  }
  for(const o of shx){
   const sx=o.x-dist;
   if(o.st==0&&sx<W-10&&sx>dx+120){o.st=1;o.t=0}
   else if(o.st==1){o.t+=dt;if(o.t>=55){o.st=2;o.t=0;const x0=sx-12,y0=H-84,T=75,g=.22;rocks.push({x:x0,y:y0,vx:(dx-x0)/T,vy:(y-y0)/T-.5*g*T,r:9,a:0})}}
   else if(o.st==2)o.t+=dt;
  }
  for(let i=rocks.length-1;i>=0;i--){
   const k=rocks[i];k.x+=k.vx*dt;k.y+=k.vy*dt;k.vy+=.22*dt;k.a+=dt;
   let h=false;for(const[p,q,r]of pts)if((k.x-p)**2+(k.y-q)**2<(k.r+r)**2){h=true;break}
   if(h){for(let j=0;j<9;j++)parts.push({x:k.x,y:k.y,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,g:.1,l:30,m:30,c:'#9aa3b5',r:3});rocks.splice(i,1);ouch();if(state!=='play')return}
   else if(k.x<-30||k.y>H+30||k.x>W+60)rocks.splice(i,1);
  }
  if(gateX-dist<=200){dist=gateX-200;fin=0;rocks=[];stageResults[lv]={coins:stageCoins,max:stageMax,...grade(stageCoins,stageMax)};if(stageResults[lv].pct===100)try{localStorage.setItem('bailong_perfect_stage_'+lv,'1')}catch(e){};if(lv<LEVELS.length-1){state='clear';BailongSound.play('win');BailongUI.showNotice('STAGE CLEAR');return}state='finale';BailongSound.play('win');
   const tot=got[0]+got[1]+got[2],sc=Math.min(1,40/Math.max(1,tot));for(let k=0;k<3;k++)for(let n=0;n<Math.ceil(got[k]*sc);n++)queue.push(k);
   for(let i=queue.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[queue[i],queue[j]]=[queue[j],queue[i]]}}
 }
 else if(state=='clear'){fin+=dt;dx+=(200-dx)*.03*dt;y+=(350+Math.sin(t/20)*8-y)*.04*dt;hist.unshift(y);hist.length=60;if(fin>88){startLevel(lv+1);flash=40;hurtT=60;state='play';vy=-6.4}}
 else if(state=='finale'||state=='end'){
  fin+=dt;dx+=(200-dx)*.03*dt;y+=(350+Math.sin(t/20)*8-y)*.04*dt;hist.unshift(y);hist.length=60;
  dropT-=dt;
  if(state=='finale'&&fin>130&&dropT<=0&&queue.length){dropT=7;drops.push({x:dx+(Math.random()-.5)*50,y:y+12,vx:(Math.random()-.5)*1.2,vy:0,ty:queue.pop()})}
  for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.vy+=.12*dt;d.y+=d.vy*dt;d.x+=d.vx*dt;
   if(d.y>gl()+28){landed++;burst(d.x,d.y,d.ty,8);parts.push({x:d.x,y:d.y,vx:(Math.random()-.5)*.6,vy:-.7,g:0,l:220,m:220,c:'#ff9a3c',r:5});drops.splice(i,1)}}
  if(state=='finale'&&fin>130&&!queue.length&&!drops.length){endT+=dt;if(endT>70){state='end';lock=60}}
 }
 for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;p.l-=dt;if(p.l<=0)parts.splice(i,1)}
 for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.y-=.5*dt;f.l-=dt;if(f.l<=0)floaters.splice(i,1)}
}

function puff(x,y,r,a){ctx.fillStyle=`rgba(255,255,255,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.moveTo(x+r*1.7,y+r*.2);ctx.arc(x+r*.9,y+r*.2,r*.8,0,7);ctx.moveTo(x-r*.2,y+r*.25);ctx.arc(x-r*.9,y+r*.25,r*.7,0,7);ctx.fill()}
const sky=new Image();let skyReady=false;
sky.onload=()=>{skyReady=true};sky.src='assets/clouds_loop.webp';
function bg(){
 if(skyReady){
  // Tile is horizontally seamless; two copies ensure endless leftward travel.
  const tileW=sky.naturalWidth*H/sky.naturalHeight;
  const shift=((bgx*.12)%tileW+tileW)%tileW;
  for(let x=-shift;x<W;x+=tileW)ctx.drawImage(sky,x,0,tileW,H);
  return;
 }
 const g=ctx.createLinearGradient(0,0,0,H);
 g.addColorStop(0,'#a7d2ed');g.addColorStop(1,'#f7fbff');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}

function icon(ty,x,y,k=1){ctx.save();ctx.translate(x,y);ctx.scale(k,k);
 if(ty==0){ctx.fillStyle='#f5c04a';ctx.strokeStyle='#b07a1c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,11,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#b07a1c';ctx.fillRect(-3.5,-3.5,7,7)}
 else if(ty==1){ctx.fillStyle='#e5283c';ctx.beginPath();ctx.moveTo(0,10);ctx.bezierCurveTo(-18,-3,-9,-15,0,-5);ctx.bezierCurveTo(9,-15,18,-3,0,10);ctx.fill();ctx.fillStyle='rgba(255,255,255,.6)';ctx.beginPath();ctx.arc(-6,-4,2.4,0,7);ctx.fill()}
 else{ctx.fillStyle='#35c46b';ctx.beginPath();for(const[a,b]of[[-5,0],[5,0],[0,-5],[0,5]]){ctx.moveTo(a+6,b);ctx.arc(a,b,6,0,7)}ctx.fill();ctx.strokeStyle='#1f8f4d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(4,13);ctx.stroke()}
 ctx.restore()}
function pillar(sx,a,b,up){
 const g=ctx.createLinearGradient(sx,0,sx+64,0);g.addColorStop(0,'#2b3855');g.addColorStop(.5,'#5a7098');g.addColorStop(1,'#2b3855');
 ctx.fillStyle=g;ctx.fillRect(sx,a,64,b-a);
 ctx.beginPath();for(let yy=a+10;yy<b;yy+=30){ctx.moveTo(sx+17,yy);ctx.arc(sx,yy,17,0,7);ctx.moveTo(sx+81,yy+12);ctx.arc(sx+64,yy+12,17,0,7)}ctx.fill();
 ctx.beginPath();ctx.ellipse(sx+32,up?b-12:a+12,36,14,0,0,7);ctx.fill();
}
function mountain(sx){
 ctx.fillStyle='#55627f';ctx.beginPath();ctx.moveTo(sx-62,H);ctx.lineTo(sx-14,H-118);ctx.lineTo(sx+6,H-128);ctx.lineTo(sx+20,H-112);ctx.lineTo(sx+66,H);ctx.fill();
 ctx.fillStyle='#e8f1ff';ctx.beginPath();ctx.moveTo(sx-14,H-118);ctx.lineTo(sx+6,H-128);ctx.lineTo(sx+20,H-112);ctx.lineTo(sx+8,H-106);ctx.lineTo(sx-4,H-112);ctx.lineTo(sx-10,H-104);ctx.fill();
}
function imp(sx,o){
 // Shanxiao stands on the existing bottom boundary between two pillars.
 // Sprite poses are separate PNGs; no sheet rectangles are ever drawn.
 const width=76,height=87,ground=H-5;
 let key='shan_idle';
 if(o.st===1)key=o.t<18?'shan_alert':o.t<40?'shan_hold':'shan_raise';
 else if(o.st===2&&o.t<18)key='shan_throw';
 if(sprite(key,sx-width/2,ground-height,width,height))return;
 ctx.save();ctx.fillStyle='#5b3c2e';ctx.beginPath();ctx.ellipse(sx,ground-26,22,29,0,0,7);ctx.fill();ctx.restore();
}
function rock(k){
 ctx.save();ctx.translate(k.x,k.y);ctx.rotate(k.a*.15);
 if(!sprite('shan_rock',-12,-12,24,24)){
  ctx.fillStyle='#8a8f9c';ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
// v3.3.12 TEST: pre-cut Huli Jing frames. The original decoy/damage logic is unchanged.
const huliFrames=Array.from({length:16},(_,i)=>{
 const im=new Image();im.src='assets/huli_'+String(i+1).padStart(2,'0')+'.png';return im;
});
function drawHuliFrame(i,x,y,w,h){
 const im=huliFrames[i];
 if(!im||!im.complete||!im.naturalWidth)return false;
 ctx.drawImage(im,x,y,w,h);return true;
}
function foxDraw(o){
 const running=o.st===2,spriteHop=running?-Math.sin(Math.min(1,o.rx/180)*Math.PI)*34:0;
 const frame=o.st===0 ? Math.floor(t/13)%4
   : o.st===1 ? 8+Math.min(3,Math.floor(o.t/10))
   : (o.rx<155 ? 4+Math.floor(t/5)%4 : 8+Math.min(3,Math.floor((o.rx-155)/22)));
 const frameX=o.x-dist+o.rx-49,frameY=o.y-82+spriteHop;
 if(drawHuliFrame(frame,frameX,frameY,112,76)){
   return;
 }
 if(sprite('enemy_hulijing',o.x-dist+o.rx-37,o.y-70+spriteHop,82,70,running)){
  if(o.st===1){ctx.save();ctx.fillStyle='#edbaff';ctx.font='bold 22px Georgia';ctx.fillText('!',o.x-dist+o.rx,o.y-80);ctx.restore()}
  return;
 }
 // placeholder Huli Jing: sits, stands up with a violet glow and a "!", then runs off ahead
 const run=o.st==2,stand=o.st==1,hop=run?-Math.sin(Math.min(1,o.rx/180)*Math.PI)*34:0;
 ctx.save();ctx.translate(o.x-dist+o.rx,o.y+hop);
 if(stand||run){ctx.shadowColor='#c77dff';ctx.shadowBlur=14}
 const wag=Math.sin(t/6)*.1;
 for(let k=0;k<3;k++){ctx.save();ctx.translate(-9,run?-14:-10);ctx.rotate((run?-.05:-.35)+k*(run?.12:.32)-.25+wag);ctx.fillStyle='#f08a3c';ctx.beginPath();ctx.ellipse(-17,0,run?22:16,6,0,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(run?-39:-31,0,5,4,0,0,7);ctx.fill();ctx.restore()}
 ctx.fillStyle='#f08a3c';
 if(run){
  ctx.beginPath();ctx.ellipse(0,-14,17,8,0,0,7);ctx.fill();ctx.beginPath();ctx.arc(17,-17,8,0,7);ctx.fill();
  ctx.beginPath();ctx.moveTo(23,-19);ctx.lineTo(32,-15);ctx.lineTo(23,-12);ctx.fill();
  ctx.beginPath();ctx.moveTo(13,-23);ctx.lineTo(14,-32);ctx.lineTo(19,-24);ctx.moveTo(18,-24);ctx.lineTo(22,-31);ctx.lineTo(23,-22);ctx.fill();
  const ph=Math.sin(t/2.5)*8;ctx.strokeStyle='#8a4a1c';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(8,-8);ctx.lineTo(8+ph,2);ctx.moveTo(-8,-8);ctx.lineTo(-8-ph,2);ctx.stroke();
  ctx.fillStyle='#ffe66d';ctx.beginPath();ctx.arc(19,-18,1.8,0,7);ctx.fill();
 }else{
  const h=stand?1.18:1;ctx.scale(1,h);
  ctx.beginPath();ctx.ellipse(0,-14,10,14,0,0,7);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(4,-12,5,9,0,0,7);ctx.fill();ctx.fillStyle='#f08a3c';
  ctx.beginPath();ctx.arc(4,-34,9,0,7);ctx.fill();
  ctx.beginPath();ctx.moveTo(10,-34);ctx.lineTo(19,-31);ctx.lineTo(10,-28);ctx.fill();
  ctx.beginPath();ctx.moveTo(-1,-40);ctx.lineTo(-3,-53);ctx.lineTo(6,-42);ctx.moveTo(6,-42);ctx.lineTo(11,-53);ctx.lineTo(12,-40);ctx.fill();
  ctx.fillStyle=stand?'#c77dff':'#ffe66d';ctx.beginPath();ctx.arc(8,-36,2,0,7);ctx.fill();
  if(stand){ctx.scale(1,1/h);ctx.shadowBlur=0;ctx.fillStyle='#e0b3ff';ctx.font='700 20px Cinzel,Georgia,serif';ctx.textAlign='center';ctx.fillText('!',4,-72)}
 }
 ctx.restore();
}
// v3.3.7: BOTH pillar types are drawn from the visible alpha silhouette.
// No transparent image padding can shrink the normal pillar on screen.
const pillarCropCache=new WeakMap();
function pillarCrop(img){
 if(pillarCropCache.has(img))return pillarCropCache.get(img);
 let crop={x:0,y:0,w:img.naturalWidth,h:img.naturalHeight};
 try{
  const c=document.createElement('canvas');
  c.width=img.naturalWidth;c.height=img.naturalHeight;
  const g=c.getContext('2d',{willReadFrequently:true});
  g.drawImage(img,0,0);
  const pixels=g.getImageData(0,0,c.width,c.height).data;
  let x0=c.width,x1=-1,y0=c.height,y1=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
   if(pixels[(y*c.width+x)*4+3]>16){
    x0=Math.min(x0,x);x1=Math.max(x1,x);
    y0=Math.min(y0,y);y1=Math.max(y1,y);
   }
  }
  if(x1>=x0&&y1>=y0)crop={x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
 }catch(e){/* use the full image as a safe fallback */}
 pillarCropCache.set(img,crop);
 return crop;
}
function pillarSection(img,c,srcY,srcH,x,y,w,h){
 if(srcH<=0||h<=0)return;
 ctx.drawImage(img,c.x,c.y+srcY,c.w,srcH,x,y,w,h);
}
// v3.3.9 — Unified 230x788 artwork, one consistent drawing path.
// Every pillar is rendered at OW width with the same cap/body/base mapping.
function drawUnifiedPillar(img,sx,y,height,flip){
 if(!img.complete||!img.naturalWidth){pillar(sx,y,y+height,flip);return}
 if(height<=1)return;
 const c=pillarCrop(img);
 ctx.save();
 if(flip){ctx.translate(sx+OW,y+height);ctx.rotate(Math.PI);sx=0;y=0}
 const topSrc=Math.round(c.h*0.14),bottomSrc=Math.round(c.h*0.12);
 const topH=Math.min(28,height*.22),bottomH=Math.min(26,height*.22);
 pillarSection(img,c,0,topSrc,sx,y,OW,topH);
 pillarSection(img,c,topSrc,c.h-topSrc-bottomSrc,sx,y+topH,OW,Math.max(.1,height-topH-bottomH));
 pillarSection(img,c,c.h-bottomSrc,bottomSrc,sx,y+height-bottomH,OW,bottomH);
 ctx.restore();
}
function drawPillarSprite(sx,y,height,flip){
 drawUnifiedPillar(pillarImg,sx,y,height,flip);
}
function drawLauncherPillar(sx,y,height,firing){
 const img=firing?spearAssets.pillar_firing:spearAssets.pillar_launcher;
 drawUnifiedPillar(img,sx,y,height,false);
}
function gateDraw(o,i,sx){
 const cy=gapCenter(o),top=cy-o.gap/2,bot=cy+o.gap/2;
 drawPillarSprite(sx,0,top,true);
 if(o.launcher){
  const z=spears.find(v=>v.pillarIndex===i);
  drawLauncherPillar(sx,bot,H-bot,z? spearFlight(z).warning:false);
 }else drawPillarSprite(sx,bot,H-bot,false);
}

// Independent, transparent PNG parts. The chain and head rotate together
// around a fixed ceiling mount; no frames or backgrounds are baked in.
const hammerSprites={};
for(const part of ['mount','chain','head']){
 const img=new Image();img.src='assets/hammer_'+part+'.png';hammerSprites[part]=img;
}
function hammerImage(part,x,y,w,h){
 const img=hammerSprites[part];
 if(img.complete&&img.naturalWidth){ctx.drawImage(img,x,y,w,h);return true}
 return false;
}
function drawHammer(h){
 const pos=hammerPos(h),ax=pos.anchor.x-dist,ay=pos.anchor.y;
 if(ax<-h.length-85||ax>W+h.length+85)return;
 ctx.save();
 // Pivot and chain swing; mount remains stationary at ceiling.
 ctx.translate(ax,ay);ctx.rotate(-pos.a);
 const headW=78,headH=54,chainEnd=h.length-headH*.24;
 if(!hammerImage('chain',-7,0,14,chainEnd)){
  ctx.strokeStyle='#d4a34b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,chainEnd);ctx.stroke();
 }
 if(!hammerImage('head',-headW/2,h.length-headH/2,headW,headH)){
  ctx.fillStyle='#b5352b';ctx.strokeStyle='#f5c56b';ctx.lineWidth=3;
  ctx.beginPath();ctx.roundRect(-36,h.length-25,72,50,10);ctx.fill();ctx.stroke();
 }
 ctx.restore();
 ctx.save();
 if(!hammerImage('mount',ax-33,0,66,32)){
  ctx.fillStyle='#a32a24';ctx.fillRect(ax-26,0,52,28);
 }
 ctx.restore();
}
function drawExtraTraps(){
 for(const z of wheels){const pos=wheelPos(z),xx=pos.x-dist;if(xx<-70||xx>W+70)continue;
  // Small sockets belong to the ceiling and floor, not to the pillars.
  if(!bladeSprite('blade_mount_top',xx-32,0,64,22)){
   ctx.fillStyle='#b77a2d';ctx.fillRect(xx-32,0,64,15);
  }
  if(!bladeSprite('blade_receiver_bottom',xx-33,H-23,66,23)){
   ctx.fillStyle='#b77a2d';ctx.fillRect(xx-33,H-15,66,15);
  }
  if(z.triggered){
   ctx.save();ctx.translate(xx,pos.y);ctx.rotate(stageFrame*z.rate+z.phase);
   if(!bladeSprite('blade_disc',-z.r,-z.r,z.r*2,z.r*2)){
    ctx.fillStyle='#b42d22';ctx.strokeStyle='#e2b052';ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(0,0,z.r,0,Math.PI*2);ctx.fill();ctx.stroke();
   }
   ctx.restore();
  }
 }
 for(const z of spears){
  const pos=spearPos(z),xx=pos.x-dist;
  if(xx<-520||xx>W+100)continue;
  const shot=spearFlight(z);
  const projectile=spearAssets.spear_projectile;
  ctx.save();
  // Launcher housing is already baked into the lower pillar; no extra socket.
  if(shot.flying){
   const sx=xx+shot.travel;
   if(projectile.complete&&projectile.naturalWidth)
    ctx.drawImage(projectile,sx,pos.y-13,z.length+10,26);
   else {
    ctx.fillStyle='#bd2425';ctx.fillRect(sx,pos.y-4,z.length-15,8);
    ctx.fillStyle='#f5d5a2';ctx.beginPath();ctx.moveTo(sx+z.length,pos.y);ctx.lineTo(sx+z.length-17,pos.y-11);ctx.lineTo(sx+z.length-17,pos.y+11);ctx.fill();
   }
  }
  ctx.restore();
 }
 for(const z of fireTraps){const pos=firePos(z),xx=pos.x-dist;if(xx<-130||xx>W+70)continue;
  const active=Math.sin(stageFrame*z.rate+z.phase)>.4;
  ctx.fillStyle='#a32c29';ctx.strokeStyle='#dba64e';ctx.lineWidth=2;ctx.fillRect(xx-14,pos.y-13,18,26);ctx.strokeRect(xx-14,pos.y-13,18,26);
  if(active){ctx.save();ctx.fillStyle='rgba(255,152,25,.27)';ctx.fillRect(xx,pos.y-12,z.length,24);ctx.restore()}
 }
}
function gate(cx){
 // The Heavenly Gate is a single transparent sprite; no scenery or extra dragon.
 // Its opening is aligned with the flight lane (y around 350).
 if(heavenlyGateImg.complete && heavenlyGateImg.naturalWidth){
  const gw=390,gh=gw*heavenlyGateImg.naturalHeight/heavenlyGateImg.naturalWidth;
  const gx=cx-gw/2,gy=350-gh*.62;ctx.drawImage(heavenlyGateImg,gx,gy,gw,gh);
  // Foreground cloud banks hide the base: the gateway rises from the clouds.
  for(let k=0;k<9;k++){const px=gx-12+k*(gw+24)/8;const py=gy+gh-18+Math.sin(k*1.9)*10;puff(px,py,26+k%3*8,.87)}
 }else{
  // Safe fallback if the external asset has not loaded.
  ctx.fillStyle='#a82427';ctx.fillRect(cx-115,280,25,220);
  ctx.fillRect(cx+90,280,25,220);ctx.fillRect(cx-125,268,250,30);
 }
}
function roof(x,y,w,c){ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x-w-6,y+8);ctx.quadraticCurveTo(x-w*.5,y+6,x-w*.3,y-8);ctx.lineTo(x+w*.3,y-8);ctx.quadraticCurveTo(x+w*.5,y+6,x+w+6,y+8);ctx.lineTo(x+w-4,y+14);ctx.lineTo(x-w+4,y+14);ctx.fill();ctx.fillStyle='#f0c24f';ctx.fillRect(x-w*.3,y-10,w*.6,3)}
function village(){
 const b=gl(),cheer=landed>0;
 ctx.fillStyle='#d6e7fb';ctx.beginPath();ctx.ellipse(200,b+70,280,90,0,0,7);ctx.fill();
 ctx.fillStyle='#a3202a';ctx.fillRect(322,b-40,26,48);for(let k=0;k<3;k++)roof(335,b-30-k*30,32-k*7,'#2aa38a');
 ctx.fillStyle='#c4262e';for(const o of[-62,-26,26,62])ctx.fillRect(200+o-5,b-96,10,98);
 ctx.fillStyle='#8f1a22';ctx.fillRect(130,b-80,140,7);
 roof(200,b-112,60,'#2aa38a');roof(156,b-94,36,'#2aa38a');roof(244,b-94,36,'#2aa38a');
 ctx.fillStyle='#f0c24f';ctx.fillRect(182,b-98,36,16);
 for(const o of[-44,44]){ctx.fillStyle='#e5283c';ctx.beginPath();ctx.arc(200+o,b-64,7,0,7);ctx.fill()}
 const cols=['#f7d56a','#e5283c','#2f8bff','#ffffff'];
 for(let i=0;i<12;i++){const px=50+i*27,py=b+34+(i%3)*9+(cheer?Math.sin(t/6+i)*-3:0);
  ctx.fillStyle=cols[i%4];ctx.beginPath();ctx.ellipse(px,py+9,8,10,0,0,7);ctx.fill();
  ctx.fillStyle='#f3d2b3';ctx.beginPath();ctx.arc(px,py-4,5,0,7);ctx.fill();
  if(cheer){ctx.strokeStyle='#f3d2b3';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px-7,py+6);ctx.lineTo(px-11,py-8);ctx.moveTo(px+7,py+6);ctx.lineTo(px+11,py-8);ctx.stroke()}}
}
function dragon(){
 // v2.2: one continuous spine and a head attached to its front.
 // Keep all artwork positions in world/canvas coordinates (no independently rotating body tiles).
 const hurt=hurtT>0,gold=cloverT>0;
 ctx.save();ctx.globalAlpha=hurt&&(Math.floor(t/5)%2)? .42:1;
 const headReady=bailongHead.complete&&bailongHead.naturalWidth>0;
 const pitch=Math.max(-.32,Math.min(.34,vy*.035));
 const spine=[];
 // Body stays within the visible playfield; sample delayed flight history for natural motion.
 const count=23, tailX=Math.max(14,dx-91),neckX=dx-19;
 for(let i=0;i<count;i++){
  const u=i/(count-1),hi=Math.min(hist.length-1,Math.round((1-u)*37));
  const px=tailX+(neckX-tailX)*u;
  const py=hist[hi]+Math.sin(t*.085-u*5.2)*(1-u)*5;
  spine.push({x:px,y:py,r:2.8+10.2*Math.sin(Math.PI*(u*.83+.10))});
 }
 // Solid, overlapping cross-sections: unlike separated drawImage sprites, this has no gaps.
 for(let i=0;i<spine.length;i++){
  const p=spine[i],r=p.r;
  const gr=ctx.createRadialGradient(p.x-r*.25,p.y-r*.4,1,p.x,p.y,r);
  gr.addColorStop(0,'#ffffff');gr.addColorStop(.48,'#e8f7ff');gr.addColorStop(.82,'#b9dfff');gr.addColorStop(1,'#74b7ee');
  ctx.fillStyle=gr;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
 }
 // One continuous gold dorsal ridge follows the same spine.
 ctx.strokeStyle='#e9bd69';ctx.lineWidth=2.7;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
 spine.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y-p.r*.72);else ctx.lineTo(p.x,p.y-p.r*.72)});ctx.stroke();
 // Small overlapping scales; decorative only, collision geometry is unchanged.
 ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=1;
 for(let i=3;i<spine.length-2;i+=3){const p=spine[i];ctx.beginPath();ctx.arc(p.x,p.y+2,p.r*.55,.12,Math.PI-.12);ctx.stroke()}
 if(headReady){
  ctx.save();ctx.translate(dx+1,y);ctx.rotate(pitch);
  ctx.drawImage(bailongHead,-36,-26,76,57);
  ctx.restore();
 }else{
  ctx.fillStyle='#f4faff';ctx.strokeStyle='#7ca9d1';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(dx+5,y,20,12,pitch,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#167cff';ctx.beginPath();ctx.arc(dx+12,y-4,3,0,Math.PI*2);ctx.fill();
 }
 if(gold){ctx.strokeStyle='rgba(255,214,97,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(dx,y,32,0,Math.PI*2);ctx.stroke()}
 ctx.restore();
}

function txt(s,x,y,size,col='#fff'){ctx.save();ctx.font=`600 ${size}px Cinzel,Georgia,serif`;ctx.textAlign='center';ctx.shadowColor='rgba(10,40,90,.7)';ctx.shadowBlur=8;ctx.fillStyle=col;ctx.fillText(s,x,y,300);ctx.restore()}
function panel(){ctx.fillStyle='rgba(12,34,76,.55)';ctx.beginPath();ctx.roundRect(40,240,320,190,18);ctx.fill()}
function draw(){
 bg();
 const gsx=gateX-dist;if(gsx<520)gate(gsx);
 // The gateway itself remains the only destination structure.
 for(const it of items){const sx=it.x-dist;if(it.on&&sx>-30&&sx<W+30){const yy=it.y+Math.sin(t/18+it.x)*3;icon(it.ty,sx,yy);if(it.fake){ctx.save();ctx.strokeStyle='#aa69ed';ctx.lineWidth=2;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(sx,yy,17+Math.sin(t/5)*2,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore()}}}
 obs.forEach((o,i)=>{const sx=o.x-dist;if(sx<-OW-30||sx>W+30)return;
  if(artMode){gateDraw(o,i,sx);return}
  const cy=gapCenter(o);pillar(sx,0,cy-o.gap/2,true);pillar(sx,cy+o.gap/2,H,false);
  if(!calm&&(t/12|0)%17==i%17){ctx.strokeStyle='#d9ecff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+32,0);for(let k=1;k<=5;k++)ctx.lineTo(sx+32+(k%2?-9:9),(o.gy-o.gap/2-14)*k/5);ctx.stroke()}});
 for(const h of hammers)drawHammer(h);
 drawExtraTraps();
 for(const o of shx){const sx=o.x-dist;if(sx>-80&&sx<W+80){imp(sx,o)}}
 for(const o of foxes)if(o.st<3)foxDraw(o);
 dragon();
 for(const k of rocks)rock(k);
 for(const f of floaters){ctx.globalAlpha=Math.min(1,f.l/20);txt(f.s,f.x,f.y,14,'#e0b3ff')}ctx.globalAlpha=1;
 for(const d of drops)icon(d.ty,d.x,d.y,.9);
 for(const p of parts){ctx.globalAlpha=Math.max(0,p.l/p.m);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}ctx.globalAlpha=1;
 if(state==='play'&&bannerT>0){
  ctx.globalAlpha=Math.min(.9,bannerT/25);
  ctx.fillStyle='rgba(12,36,76,.68)';ctx.beginPath();ctx.roundRect(52,133,301,76,13);ctx.fill();
  txt('STAGE '+(lv+1),202,162,19,'#ffdf9c');txt(LEVELS[lv].name,202,190,15);
  ctx.globalAlpha=1;
 }
 if(state==='clear'&&stageResults[lv]){const r=stageResults[lv];ctx.fillStyle='rgba(11,30,63,.84)';ctx.beginPath();ctx.roundRect(43,265,319,170,17);ctx.fill();txt('STAGE '+(lv+1)+' COMPLETE',202,301,17,'#f8d68a');txt(r.label,202,345,27,'#fff4bd');txt(r.coins+' / '+r.max+' COINS  ·  '+r.pct+'%',202,383,18);txt('NEXT STAGE',202,414,12,'#b7d9f7')}
 if(flash>0){ctx.fillStyle='rgba(255,255,255,'+Math.min(1,flash/30)+')';ctx.fillRect(0,0,W,H)}
}
let last=0,lag=0;
document.addEventListener('visibilitychange',()=>{
 last=0;lag=0;if(document.hidden&&state==='play')state='paused';
});
// A single fixed game step on all 60 / 90 / 120 Hz displays.
function loop(ts){
 if(touchHeld&&state==='play'&&ts-touchLast>=110){
   // Gentle repeated lift during a hold, no audio retrigger or extra pointer events.
   vy=Math.min(vy,-4.7);touchLast=ts;
 }
 if(!last)last=ts;
 lag+=Math.min(85,ts-last);last=ts;
 let n=0;
 while(lag>=1000/60&&n<5){update(1);lag-=1000/60;n++}
 if(n===5)lag=0;
 draw();
 BailongUI.sync({state,lives,got,level:lv+1,levelCount:LEVELS.length,
   name:LEVELS[lv].name,stageCoins,stageMax,stageResults,progress:Math.max(0,Math.min(1,dist/Math.max(1,gateX-200))),clover:cloverT,sound:BailongSound.enabled});
 requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.BailongDebug={getStatus:()=>({state,lives,lv,progress:dist/Math.max(1,gateX-200),
 pillarCount:obs.length,movingPillars:obs.filter(o=>o.motion).length,hammerCount:hammers.length,wheelCount:wheels.length,spearCount:spears.length,fireCount:fireTraps.length,stageFrame,proof:trackProof,y,vy,autoFrame,dist,positions:obs.map(o=>o.gy),
 firstPillar:obs[0]?.x-dist,stageCoins,stageMax,stageResults,coinPositions:items.filter(it=>it.ty===0).map(it=>({x:it.x,y:it.y,on:it.on})),artReady:ART.on,skyReady}),
 verify:()=>BailongChallenge.verify(obs,{W,H,x:DX0,speed:SP,gravity:.34,jump:-6.4,
 ow:OW,spacing:SPC,head:HB.head,body:HB.body,bodyLag:HB.bodyLag,bodyStep:HB.bodyStep,bodyCount:HB.bodyCount}),
 nextLevel:()=>{if(lv<LEVELS.length-1){startLevel(lv+1);state='play';hurtT=70}}
};
