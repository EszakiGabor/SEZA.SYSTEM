/* Tiny procedurally synthesized sound effects; no audio downloads. */
(function(root){'use strict';let ac=null,enabled=true;
function play(kind){if(!enabled)return;try{
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
 if(!ac)ac=new AC();if(ac.state==='suspended')ac.resume();
 const now=ac.currentTime;
 const settings={flap:[300,230,.055,.02,'sine'],coin:[760,1150,.13,.04,'sine'],
 heart:[480,840,.20,.055,'sine'],shield:[560,950,.22,.045,'triangle'],
 hit:[180,60,.24,.065,'sawtooth'],win:[500,900,.32,.035,'sine'],fox:[320,540,.20,.035,'triangle']}[kind];
 if(!settings)return;let [a,b,d,vol,wave]=settings;
 const osc=ac.createOscillator(),gain=ac.createGain();osc.type=wave;
 osc.frequency.setValueAtTime(a,now);osc.frequency.exponentialRampToValueAtTime(Math.max(30,b),now+d);
 gain.gain.setValueAtTime(vol,now);gain.gain.exponentialRampToValueAtTime(.001,now+d);
 osc.connect(gain);gain.connect(ac.destination);osc.start(now);osc.stop(now+d+.01);
 }catch(_){ /* Audio is optional on restricted browsers. */ }}
function setEnabled(x){enabled=!!x;return enabled}
root.BailongSound={play,setEnabled,get enabled(){return enabled}};
})(window);
