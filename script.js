/* Giant Steps: independent 16-bar engine; exact user-supplied four-note pitch cells. */
'use strict';
const D=GS_DATA, PC={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const $=id=>document.getElementById(id), rnd=n=>Math.floor(Math.random()*n), pick=a=>a[rnd(a.length)];
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
let events=[],rhythmIds=[],originalMode=false,playing=false,ctx=null,sources=[],stopTimer=null,bufferCache=new Map(),selectedFavorite=null;
const patterns={straight:[0,1,2,3],retro:[3,2,1,0],inverted:[0,2,1,3],river:[3,0,1,2],enclosure:[1,0,2,3]};
function noteCandidates(name){let a=[];for(let oct=2;oct<=7;oct++){const m=(oct+1)*12+PC[name];if(m>=Number($('fg-low').value)&&m<=Number($('fg-high').value))a.push(m);}return a;}
function nearest(name,prev,mode){const pool=noteCandidates(name);if(!pool.length)throw Error('No available pitch in the selected range: '+name);const sorted=pool.map(m=>({m,score:prev==null?Math.abs(m-70):Math.abs(m-prev)}));sorted.sort((a,b)=>a.score-b.score);if(mode==='smooth')return sorted[0].m;if(mode==='angular')return pick(sorted.slice(0,Math.min(3,sorted.length))).m;return sorted[0].m;}
function patternNames(chord){let names=D.pitch[chord], mode=$('gs-order').value;if(mode==='random')mode=pick(Object.keys(patterns));return patterns[mode].map(i=>names[i]);}
function rhythmDurations(id){const str=D.rhythms[id];let durations=[];for(const token of str.match(/Q\.|Q|E/g)||[])durations.push(token==='Q.'?1.5:token==='Q'?1:.5);if(Math.abs(durations.reduce((a,b)=>a+b,0)-4)>.01)throw Error('Invalid rhythm '+id);return durations;}
function chordAt(bar,t){const ch=D.bars[bar];return ch.length>1&&t>=2?ch[1][0]:ch[0][0];}
function generate(regenerateRhythms=true){stop();originalMode=false;if(regenerateRhythms||!rhythmIds.length)rhythmIds=shuffle(Array.from({length:24},(_,i)=>i)).slice(0,16);events=[];let prev=null;for(let bar=0;bar<16;bar++){
 let durations=rhythmDurations(rhythmIds[bar]), time=0, barEvents=[],seqs={},idx={};
 for(const d of durations){let end=time+d;while(time<end-1e-6){let chord=chordAt(bar,time),segmentEnd=D.bars[bar].length===2&&time<2?Math.min(end,2):end, names=seqs[chord]||(seqs[chord]=patternNames(chord)),n=idx[chord]||0,name=names[n%4];idx[chord]=n+1;
 let mode=$('gs-mode').value, m=nearest(name,prev,mode);if(mode==='triadic'||mode==='quartal'){const candidates=noteCandidates(name);const goal=mode==='quartal'?5:4;candidates.sort((a,b)=>Math.abs(Math.abs(a-(prev??a))-goal)-Math.abs(Math.abs(b-(prev??b))-goal));m=candidates[0];}
 barEvents.push({bar,start:time,dur:segmentEnd-time,m,chord,name});prev=m;time=segmentEnd;
 }}events.push(barEvents);
 }render();}
function originalEvents(){return D.original.map((bar,i)=>bar.map(([m,start,dur])=>({bar:i,start,dur,m,chord:chordAt(i,start),name:midiName(m)})));}
function activeEvents(){return originalMode?originalEvents():events;}
function midiName(m){return ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][m%12]+(Math.floor(m/12)-1);}
function abcPitch(m){const p=['C','^C','D','_E','E','F','^F','G','_A','A','_B','B'][m%12],oct=Math.floor(m/12)-1;let base=p;if(oct>=5)base=base.replace(/[A-G]/,s=>s.toLowerCase())+"'".repeat(Math.max(0,oct-5));else base+=','.repeat(Math.max(0,4-oct));return base;}
function abcBar(bar){let ev=activeEvents()[bar],abc='',t=0;for(const e of ev){if(e.start>t+.0001)abc+=' z'+Math.round((e.start-t)*2);if(e.start===0||Math.abs(e.start-2)<.0001&&D.bars[bar].length===2)abc+='"'+e.chord.replace(/maj7/,'△7')+'"';const duration=Math.round(e.dur*2);abc+=' '+abcPitch(e.m)+(duration===1?'':duration);t=e.start+e.dur;}if(t<4)abc+=' z'+Math.round((4-t)*2);return abc+' |';}
function render(){let s=$('score');s.innerHTML='';for(let group=0;group<4;group++){let div=document.createElement('div');div.className='score-system';div.dataset.measures=`${group*4+1}-${group*4+4}`;div.style.cssText='width:80%;margin:0 auto 2px;';s.appendChild(div);let abc=['X:1','M:4/4','L:1/8','K:C',`%%measurefirst ${group*4+1}`,'%%barsperstaff 4',...Array.from({length:1},()=>Array.from({length:4},(_,j)=>abcBar(group*4+j)).join(' '))].join('\n');if(window.ABCJS)ABCJS.renderAbc(div,abc,{staffwidth:Math.max(520,Math.round((s.clientWidth||1100)*.8-60)),scale:1,add_classes:true,paddingleft:18,paddingright:18});else div.textContent=abc;}
 let out=$('output');out.replaceChildren();activeEvents().forEach((bar,i)=>{let tr=document.createElement('tr');let ch=D.bars[i].map(x=>x[0]).join(' → ');[i+1,ch,'Rhythm '+(rhythmIds[i]+1||1),D.rhythms[rhythmIds[i]||0],D.bars[i].map(x=>D.pitch[x[0]].join(' ')).join(' / '),bar.map(e=>midiName(e.m)).join(' · ')].forEach(x=>{let td=document.createElement('td');td.textContent=x;tr.appendChild(td)});out.appendChild(tr);});}
function setupRange(){let names=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];for(let m=40;m<=96;m++)for(let id of ['fg-low','fg-high']){let o=document.createElement('option');o.value=m;o.textContent=names[m%12]+(Math.floor(m/12)-1);$(id).appendChild(o);} $('fg-low').value=60;$('fg-high').value=79;for(let id of ['fg-low','fg-high'])$(id).onchange=()=>{if(Number($('fg-low').value)>=Number($('fg-high').value))return;generate(false)};}
function samplePath(sound,m){let name=midiName(m).replace('Db','Db').replace('Gb','Gb');let folder=sound==='rhodes'?'warm-rhodes':'iowa-steinway';return 'assets/instruments/'+folder+'/'+(sound==='rhodes'?m:name)+'.mp3';}
async function loadSample(sound,m){
 const key=sound+'-'+m;if(bufferCache.has(key))return bufferCache.get(key);
 const promise=(async()=>{let oct=Math.floor(m/12)-1,clamped=Math.min(5,Math.max(3,oct)),source=m+(clamped-oct)*12;
 let res=await fetch(samplePath(sound,source));if(!res.ok)throw Error('Sample unavailable: '+res.url);
 return ctx.decodeAudioData(await res.arrayBuffer());})();bufferCache.set(key,promise);return promise;
}
let playToken=0;
function stop(){playToken++;if(stopTimer)clearTimeout(stopTimer);for(const s of sources){try{s.stop()}catch{}}sources=[];playing=false;$('playPause').textContent='▶ Play';$('transport-status').textContent='Ready';}
async function play(){
 if(playing){stop();return;}
 ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();const token=++playToken;
 $('transport-status').textContent='Loading sounds…';$('playPause').disabled=true;
 const beat=60/Math.max(40,Math.min(240,Number($('tempo').value)||80));
 const melody=activeEvents().flat();const chords=[];
 for(let bar=0;bar<16;bar++){let arr=D.bars[bar];for(let j=0;j<arr.length;j++){
 let [name,t]=arr[j],root=PC[name.match(/^[A-G][b#]?/)[0]],minor=/m7/.test(name),dom=/^[A-G][b#]?7$/.test(name);
 let tones=[0,minor?3:4,7,dom||minor?10:11];chords.push({m:tones.map(v=>48+root+v),start:bar*4+t,dur:(j+1<arr.length?arr[j+1][1]:4)-t});}}
 const melSound=$('gs-melody-sound').value,accSound=$('gs-accomp-sound').value;
 // Preload ALL samples before starting the clock, so the first notes cannot be skipped.
 try{await Promise.all([...new Set(melody.map(e=>e.m))].map(m=>loadSample(melSound,m)).concat([...new Set(chords.flatMap(c=>c.m))].map(m=>loadSample(accSound,m))));}
 catch(err){console.error(err);$('transport-status').textContent='Audio error: '+err.message;$('playPause').disabled=false;return;}
 if(token!==playToken){$('playPause').disabled=false;return;}
 const start=ctx.currentTime+.12,melVol=Number($('gs-melvol').value),accVol=Number($('gs-accvol').value);
 const schedule=(m,t,d,sound,volume)=>{const buf=bufferCache.get(sound+'-'+m);if(!buf)return;
 // All buffers are loaded: scheduling is now synchronous and sample-accurate.
 return buf.then(audio=>{if(token!==playToken)return;let src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=audio;
 let when=start+t*beat,duration=Math.max(.07,d*beat);gain.gain.setValueAtTime(.0001,when);
 gain.gain.linearRampToValueAtTime(Math.max(.0001,volume),when+.02);
 gain.gain.setValueAtTime(Math.max(.0001,volume),when+Math.max(.021,duration-.04));
 gain.gain.linearRampToValueAtTime(.0001,when+duration);src.connect(gain).connect(ctx.destination);
 src.start(when);src.stop(when+duration+.01);sources.push(src);});};
 playing=true;$('playPause').disabled=false;$('playPause').textContent='Ⅱ Pause';$('transport-status').textContent='Playing';
 const jobs=[];for(let pass=0;pass<2;pass++){
 for(let e of melody)jobs.push(schedule(e.m,pass*64+e.bar*4+e.start,e.dur,melSound,melVol*.32));
 for(let c of chords)for(let m of c.m)jobs.push(schedule(m,pass*64+c.start,c.dur,accSound,accVol*.12));
 }await Promise.all(jobs);
 if(token===playToken)stopTimer=setTimeout(stop,128*beat*1000+300);
}
function midiExport(){const ppq=480,track=[],ev=[];const add=(tick,bytes)=>ev.push([tick,bytes]);for(let bar of activeEvents())for(let e of bar){let t=Math.round((e.bar*4+e.start)*ppq),end=t+Math.round(e.dur*ppq);add(t,[0x90,e.m,94]);add(end,[0x80,e.m,0]);}ev.sort((a,b)=>a[0]-b[0]||a[1][0]-b[1][0]);const varlen=n=>{let out=[n&127];while(n>>=7)out.unshift((n&127)|128);return out};let prev=0;for(let [t,msg]of ev){track.push(...varlen(t-prev),...msg);prev=t;}track.push(0,0xff,0x2f,0);const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];const tempo=Math.round(60000000/Number($('tempo').value||80));const meta=[0,0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,0,0xff,0x2f,0];const bytes=[...Array.from('MThd',x=>x.charCodeAt(0)),0,0,0,6,0,1,0,2,1,224,...Array.from('MTrk',x=>x.charCodeAt(0)),...u32(meta.length),...meta,...Array.from('MTrk',x=>x.charCodeAt(0)),...u32(track.length),...track];download(new Blob([new Uint8Array(bytes)],{type:'audio/midi'}),'giant-steps.mid');}
function download(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
async function wavExport(){const bpm=Number($('tempo').value)||80,beat=60/bpm,sr=22050,length=Math.ceil((64*beat+1)*sr),offline=new OfflineAudioContext(1,length,sr);const notes=activeEvents().flat();for(let e of notes){let start=(e.bar*4+e.start)*beat,dur=e.dur*beat;let osc=offline.createOscillator(),gain=offline.createGain();osc.type='sine';osc.frequency.value=440*2**((e.m-69)/12);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.15*Number($('gs-melvol').value),start+.02);gain.gain.setValueAtTime(.13*Number($('gs-melvol').value),start+Math.max(.021,dur-.04));gain.gain.linearRampToValueAtTime(0,start+dur);osc.connect(gain).connect(offline.destination);osc.start(start);osc.stop(start+dur+.01)}let buf=await offline.startRendering(),f=buf.getChannelData(0),wav=new ArrayBuffer(44+f.length*2),view=new DataView(wav);const str=(off,s)=>{for(let i=0;i<s.length;i++)view.setUint8(off+i,s.charCodeAt(i))};str(0,'RIFF');view.setUint32(4,36+f.length*2,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sr,true);view.setUint32(28,sr*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,f.length*2,true);for(let i=0;i<f.length;i++)view.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(f[i]*32767))),true);download(new Blob([wav],{type:'audio/wav'}),'giant-steps.wav');}
function setupFavorites(){const key='giant-steps-favorites-v1';const load=()=>JSON.parse(localStorage.getItem(key)||'[]');const refresh=()=>{let select=$('fg-load');select.innerHTML='<option value="">Load Favorite…</option>';load().forEach((x,i)=>{let o=document.createElement('option');o.value=i;o.textContent=x.name;select.appendChild(o)});select.disabled=!load().length;$('fg-delete').disabled=!load().length;};$('fg-auth-status').textContent='Favorites: saved in this browser';$('fg-sign-in').hidden=true;$('fg-sign-out').hidden=true;$('fg-save').disabled=false;$('fg-save').onclick=()=>{let arr=load(),name=prompt('Favorite name','Giant Steps '+(arr.length+1));if(!name)return;arr.push({name,rhythmIds,events,originalMode});localStorage.setItem(key,JSON.stringify(arr));refresh();};$('fg-load').onchange=e=>{let x=load()[Number(e.target.value)];if(!x)return;rhythmIds=x.rhythmIds;events=x.events;originalMode=x.originalMode;render();};$('fg-delete').onclick=()=>{let idx=Number($('fg-load').value);if(!$('fg-load').value)return;let arr=load();arr.splice(idx,1);localStorage.setItem(key,JSON.stringify(arr));refresh();};refresh();}
window.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b===button));$('gs-mode').value=button.dataset.mode;generate(false);}));$('tempo').addEventListener('input',()=>{$('tempo-value').textContent=$('tempo').value+' BPM';});setupRange();setupFavorites();$('generate').onclick=()=>generate();$('rhythms').onclick=()=>generate(true);$('pentas').onclick=()=>generate(false);$('playPause').onclick=play;$('stopPlayback').onclick=stop;$('gs-mode').onchange=()=>generate(false);$('gs-order').onchange=()=>generate(false);$('gs-original').onclick=()=>{stop();originalMode=!originalMode;$('gs-original').textContent=originalMode?'Return to Generated':'Original Melody';render();};$('gs-midi').onclick=midiExport;$('gs-wav').onclick=wavExport;$('gs-pdf').onclick=()=>window.print();generate();});
