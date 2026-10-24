/* Light DOM HUD and menus. No gameplay rules live in this file. */
(function(root){'use strict';
const id=(name)=>document.getElementById(name);
const nodes={hud:id('hud'),veil:id('veil'),pause:id('pauseBtn'),sound:id('soundBtn'),main:id('mainBtn'),
 eyebrow:id('menuEyebrow'),title:id('menuTitle'),desc:id('menuDescription'),stats:id('menuStats'),
 help:id('menuHelp'),hearts:id('hearts'),coins:id('coins'),bar:id('progressFill'),
 label:id('levelLabel'),progress:id('progressLabel'),shield:id('shield'),toast:id('toast')};
let actions=null,lastState='',toastFrames=0;
function bind(x){actions=x;
 nodes.main.addEventListener('pointerdown',e=>e.stopPropagation());
 nodes.main.addEventListener('click',e=>{e.stopPropagation();actions.main()});
 nodes.pause.addEventListener('pointerdown',e=>e.stopPropagation());
 nodes.pause.addEventListener('click',e=>{e.stopPropagation();actions.pause()});
 nodes.sound.addEventListener('pointerdown',e=>e.stopPropagation());
 nodes.sound.addEventListener('click',e=>{e.stopPropagation();actions.sound()});
}
function showNotice(text,frames=100){nodes.toast.textContent=text;nodes.toast.classList.add('show');toastFrames=frames;}
function sync(g){
 const v=g.state;
 if(v!==lastState){
  lastState=v;
  nodes.veil.classList.toggle('hidden',v==='play'||v==='clear'||v==='finale');
  nodes.hud.hidden=v==='title';
  nodes.pause.style.display=v==='play'?'grid':'none';
  nodes.sound.style.display=v==='play'?'grid':'none';
  const info={
   title:['THE HEAVENLY PASSAGE','BAILONG','One touch. One flight. Four heavenly trials.','BEGIN FLIGHT','TAP / SPACE / ↑ TO FLY · P TO PAUSE'],
   dead:['THE SKY REMEMBERS','TRY AGAIN','Every mistake teaches a safer path.','RETRY FLIGHT','SAME STAGE · SAME OBSTACLE SEQUENCE'],
   paused:['FLIGHT SUSPENDED','PAUSED','The wind will wait for you.','RESUME FLIGHT','TAP / SPACE TO CONTINUE'],
   end:['THE HEAVENLY PASSAGE','GATE REACHED','Bailong has delivered the celestial blessings.','FLY AGAIN','A NEW RUN THROUGH FOUR STAGES']
  }[v];
  if(info){nodes.eyebrow.textContent=info[0];nodes.title.textContent=info[1];nodes.desc.textContent=info[2];nodes.main.innerHTML=info[3]+' <span aria-hidden="true">→</span>';nodes.help.textContent=info[4]}
 }
 nodes.hearts.textContent='♥ '.repeat(Math.max(0,g.lives))+'♡ '.repeat(Math.max(0,3-g.lives));
 nodes.hearts.setAttribute('aria-label',`${g.lives} hearts remaining`);
 nodes.coins.textContent=`${g.stageCoins}/${g.stageMax}`;
 nodes.sound.textContent=g.sound?'♪':'×';
 nodes.sound.setAttribute('aria-label',g.sound?'Mute sound':'Enable sound');
 nodes.label.textContent=`${g.level}/${g.levelCount} · ${g.name.toUpperCase()}`;
 nodes.bar.style.width=`${Math.round(g.progress*100)}%`;
 nodes.progress.textContent=`${Math.round(g.progress*100)}%`;
 nodes.shield.hidden=g.clover<=0;
 if(v==='dead')nodes.stats.textContent=`STAGE ${g.level} · ${Math.round(g.progress*100)}% · ✦ ${g.got[0]}`;
 else if(v==='end'){const perfect=g.stageResults.filter(r=>r&&r.pct===100).length;nodes.stats.textContent=`✦ ${g.got[0]} COINS · ${perfect}/${g.levelCount} PERFECT STAGES` ;nodes.desc.textContent=perfect===g.levelCount?'PERFECT RUN! Every coin collected.':'The gate is reached. Master each stage to earn 100%.';}
 else nodes.stats.textContent='♥ 3 LIVES   ·   ✦ 8 STAGES';
 if(toastFrames>0){toastFrames--;if(!toastFrames)nodes.toast.classList.remove('show')}
}
root.BailongUI={bind,sync,showNotice};
})(window);
