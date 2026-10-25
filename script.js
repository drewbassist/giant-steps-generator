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
function generate(regenerateRhythms=true){stop();originalMode=false;if(regenerateRhythms||!rhythmIds.length)rhythmIds=Array.from({length:16},(_,bar)=>[2,6,8,10,12,14].includes(bar)?pick([1,2]):0);events=[];let prev=null;for(let bar=0;bar<16;bar++){
 let durations=([2,6,8,10,12,14].includes(bar)?(rhythmIds[bar]===2?[2,.5,.5,.5,.5]:[1,.5,.5,.5,.5,.5,.5]):Array(8).fill(.5)), time=0, barEvents=[],seqs={},idx={};
 for(const d of durations){let end=time+d;while(time<end-1e-6){let chord=chordAt(bar,time),segmentEnd=D.bars[bar].length===2&&time<2?Math.min(end,2):end, names=seqs[chord]||(seqs[chord]=patternNames(chord)),n=idx[chord]||0,name=names[n%4];idx[chord]=n+1;
 let mode=$('gs-mode').value, m=nearest(name,prev,mode);if(mode==='triadic'||mode==='quartal'){const candidates=noteCandidates(name);if(mode==='quartal'&&prev!=null){const rank=n=>{const d=Math.abs(n-prev);return d===5?0:d===6?1:2+Math.abs(d-5)+(d===3||d===4?10:0);};candidates.sort((a,b)=>rank(a)-rank(b)||Math.abs(a-prev)-Math.abs(b-prev));}else{const goal=mode==='quartal'?5:4;candidates.sort((a,b)=>Math.abs(Math.abs(a-(prev??a))-goal)-Math.abs(Math.abs(b-(prev??b))-goal));}m=candidates[0];}
 barEvents.push({bar,start:time,dur:segmentEnd-time,m,chord,name});prev=m;time=segmentEnd;
 }}events.push(barEvents);
 }render();}
function originalEvents(){return D.original.map((bar,i)=>bar.map(([m,start,dur])=>({bar:i,start,dur,m,chord:chordAt(i,start),name:midiName(m)})));}
function activeEvents(){return originalMode?originalEvents():events;}
function midiName(m){return ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][m%12]+(Math.floor(m/12)-1);}
function abcPitch(m){const p=['C','^C','D','_E','E','F','^F','G','_A','A','_B','B'][m%12],oct=Math.floor(m/12)-1;let base=p;if(oct>=5)base=base.replace(/[A-G]/,s=>s.toLowerCase())+"'".repeat(Math.max(0,oct-5));else base+=','.repeat(Math.max(0,4-oct));return base;}
function abcBar(bar){
 const ev=activeEvents()[bar];let abc='',t=0;
 // Accidentals apply to the same staff pitch only within this measure.
 const accidentalsInBar=new Map();
 for(const e of ev){
  if(e.start>t+.0001)abc+=' z'+Math.round((e.start-t)*2);
  const chordChange=e.start===0||(Math.abs(e.start-2)<.0001&&D.bars[bar].length===2);
  const chordLabel=chordChange?'"'+e.chord.replace(/maj7/,'△7')+'"':'';
  const duration=Math.round(e.dur*2);
  // Original lead-sheet spelling: G-sharp in measures 6-7, not A-flat.
  let spelledPitch=(e.chord==='Bmaj7'&&e.m%12===3)?(e.m>=72?'^d':'^D'):(originalMode&&e.m%12===3)?(e.m>=72?'^d':'^D'):(originalMode&&[3,9].includes(bar)&&e.start===0&&e.m===71?'=B':abcPitch(e.m));
  // Chord-specific enharmonic spelling only; MIDI pitch and timing are unchanged.
  const preferredSharp=(e.chord==='F#7'&&e.m%12===8)?'G':
                       (e.chord==='F#7'&&e.m%12===10)?'A':
                       (e.chord==='C#m7'&&e.m%12===8)?'G':
                       (e.chord==='C#m7'&&e.m%12===3)?'D':null;
  if(preferredSharp){
   const octave=Math.floor(e.m/12)-1;
   spelledPitch='^'+(octave>=5?preferredSharp.toLowerCase():preferredSharp)+
     (octave>=5?"'".repeat(octave-5):','.repeat(4-octave));
  }
  const pitchParts=/^([_=^]?)([A-Ga-g][,']*)$/.exec(spelledPitch);
  if(pitchParts){
   const [, accidental, staffPitch]=pitchParts;
   if(!accidental && accidentalsInBar.has(staffPitch) && accidentalsInBar.get(staffPitch)!=='=')
    spelledPitch='='+staffPitch;
   if(accidental || spelledPitch[0]==='=')
    accidentalsInBar.set(staffPitch,spelledPitch[0]);
  }
  // Explicit beam boundaries: eighths form groups within each half-measure.
  // Never introduce a beam break solely because the harmony changes.
  const groupStart=originalMode||e.start===0||Math.abs(e.start-2)<.0001||e.dur>=1;
  // Ties in Coltrane's original melody: barline pairs and bar 4's internal tie.
  const crossBarTies=new Set([1,5,7,9,11,13]); // zero-based outgoing measures
  const endOfBar=Math.abs(e.start+e.dur-4)<.001;
  const nextFirst=D.original[bar+1]?.[0];
  const crossTie=originalMode&&crossBarTies.has(bar)&&endOfBar&&nextFirst&&nextFirst[0]===e.m;
  const internalTie=originalMode&&bar===3&&Math.abs(e.start-1.5)<.001&&ev.find(x=>x.start===2)?.m===e.m;
  abc+=(groupStart?' ':'')+chordLabel+spelledPitch+(duration===1?'':duration)+((crossTie||internalTie)?'-':'');
  t=e.start+e.dur;
 }
 if(t<4)abc+=' z'+Math.round((4-t)*2);
 return (bar===0?'|: ':'')+abc+(bar===15?' :|':' |');
}
function render(){
 let s=$('score');s.innerHTML='';
 for(let group=0;group<4;group++){
  const div=document.createElement('div');
  div.className='score-system';
  div.dataset.measures=`${group*4+1}-${group*4+4}`;
  div.style.cssText='width:100%;max-width:1300px;margin:0 auto 2px;overflow:visible;position:relative;';
  s.appendChild(div);
  const abc=['X:1','M:4/4','L:1/8','K:C','%%stemheight 17',
   `%%measurefirst ${group*4+1}`,'%%barnumbers 0','%%stretchlast 1',
   Array.from({length:4},(_,j)=>abcBar(group*4+j)).join(' ')].join('\n');
  if(window.ABCJS){
   // A wide engraving canvas prevents ABCJS from wrapping measure 4 to a second staff.
   // The finished SVG is then scaled to the available score width.
   ABCJS.renderAbc(div,abc,{staffwidth:1180,scale:1,stretchlast:true,
    add_classes:true,paddingleft:18,paddingright:18});
  }else div.textContent=abc;
  const svg=div.querySelector('svg');
  if(svg){
   // Crop ABCJS's surrounding whitespace, including unused bottom staff space.
   const drawing=svg.querySelector('g');
   let bounds=null;
   try{if(drawing)bounds=drawing.getBBox();}catch(e){}
   const w=parseFloat(svg.getAttribute('width'))||1800;
   const h=parseFloat(svg.getAttribute('height'))||150;
   const x=bounds&&bounds.width>0?Math.max(0,bounds.x-12):0;
   const y=bounds&&bounds.height>0?Math.max(0,bounds.y-12):0;
   const vw=bounds&&bounds.width>0?Math.min(w-x,bounds.width+24):w;
   const vh=bounds&&bounds.height>0?Math.min(h-y,bounds.height+24):h;
   svg.setAttribute('viewBox',`${x} ${y} ${vw} ${vh}`);
   svg.setAttribute('width','100%');
   svg.removeAttribute('height');
   svg.style.cssText='display:block;width:100%;height:auto;';
   svg.setAttribute('preserveAspectRatio','xMidYMin meet');
  }
  const number=document.createElement('span');
  number.textContent=String(group*4+1);
  number.setAttribute('aria-label','Measure '+(group*4+1));
  number.style.cssText='position:absolute;left:12px;top:0;font-size:12px;font-weight:600;color:#222;pointer-events:none;';
  div.appendChild(number);
 }
let out=$('output');out.replaceChildren();activeEvents().forEach((bar,i)=>{let tr=document.createElement('tr');let ch=D.bars[i].map(x=>x[0]).join(' → ');[i+1,ch,'Rhythm '+(rhythmIds[i]+1||1),([2,6,8,10,12,14].includes(i)?(rhythmIds[i]===2?'H · EEEE':'Q · EEEEEE'):'EEEE · EEEE'),D.bars[i].map(x=>D.pitch[x[0]].join(' ')).join(' / '),bar.map(e=>midiName(e.m)).join(' · ')].forEach(x=>{let td=document.createElement('td');td.textContent=x;tr.appendChild(td)});out.appendChild(tr);});}
function setupRange(){let names=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];for(let m=40;m<=96;m++)for(let id of ['fg-low','fg-high']){let o=document.createElement('option');o.value=m;o.textContent=names[m%12]+(Math.floor(m/12)-1);$(id).appendChild(o);} $('fg-low').value=60;$('fg-high').value=79;for(let id of ['fg-low','fg-high'])$(id).onchange=()=>{if(Number($('fg-low').value)>=Number($('fg-high').value))return;generate(false)};}
// Sample libraries have different coverage: Rhodes is sampled sparsely, piano chromatically.
// Select the nearest existing recording and transpose it to the requested MIDI pitch.
const RHODES_SAMPLES=[45,50,55,59,62,65,71,76,81,86];
const PIANO_SAMPLES=new Set(['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']);
function sampleSource(sound,m){
 if(sound==='rhodes')return RHODES_SAMPLES.reduce((best,n)=>Math.abs(n-m)<Math.abs(best-m)?n:best,RHODES_SAMPLES[0]);
 return Math.min(83,Math.max(48,m)); // piano recordings cover C3 through B5
}
function samplePath(sound,source){return sound==='rhodes'?'assets/instruments/warm-rhodes/'+source+'.mp3':'assets/instruments/iowa-steinway/'+midiName(source)+'.mp3';}
async function loadSample(sound,m){
 const source=sampleSource(sound,m),key=sound+'-'+source;
 if(!bufferCache.has(key)){
  const promise=(async()=>{const res=await fetch(samplePath(sound,source));if(!res.ok)throw Error('Sample unavailable: '+res.url);const audio=await ctx.decodeAudioData(await res.arrayBuffer());
    // Remove sample-start transients from piano comping only; Rhodes is untouched.
    if(sound==='piano'){
     const fadeSamples=Math.min(Math.round(audio.sampleRate*.015),audio.length);
     for(let channel=0;channel<audio.numberOfChannels;channel++){
      const data=audio.getChannelData(channel);
      for(let i=0;i<fadeSamples;i++)data[i]*=i/Math.max(1,fadeSamples-1);
     }
    }
    return audio;})();
  bufferCache.set(key,promise);
 }
 return bufferCache.get(key);
}
// Four-part, close-position seventh-chord accompaniment with minimal voice movement.
// This is independent of the four-note melodic pitch cells.
function accompanimentChords(){
 const output=[];let previous=null;
 for(let bar=0;bar<16;bar++){
  const changes=D.bars[bar];
  for(let j=0;j<changes.length;j++){
   const [name,offset]=changes[j];
   const match=name.match(/^([A-G][b#]?)(maj7|m7|7)$/);
   if(!match)throw Error('Unknown accompaniment chord: '+name);
   const root=PC[match[1]],quality=match[2];
   const intervals=quality==='maj7'?[0,4,7,11]:quality==='m7'?[0,3,7,10]:[0,4,7,10];
   const pcs=intervals.map(v=>(root+v)%12);
   const candidates=[];
   // All close-position inversions, positioned between C3 and C5.
   for(let inversion=0;inversion<4;inversion++){
    const rotated=pcs.slice(inversion).concat(pcs.slice(0,inversion));
    for(let bottom=48;bottom<=60;bottom++){
     if(bottom%12!==rotated[0])continue;
     const notes=[bottom];
     for(let k=1;k<4;k++){
      let n=notes[k-1]+1;
      while(n%12!==rotated[k])n++;
      notes.push(n);
     }
     if(notes[3]<=72)candidates.push(notes);
    }
   }
   const cost=notes=>previous
     ? notes.reduce((sum,n,i)=>sum+Math.abs(n-previous[i]),0)+Math.abs(notes[0]-previous[0])*.25
     : notes.reduce((sum,n,i)=>sum+Math.abs(n-[48,52,55,59][i]),0);
   candidates.sort((a,b)=>cost(a)-cost(b));
   const voicing=candidates[0];
   if(!voicing)throw Error('No accompaniment voicing for '+name);
   output.push({m:voicing,start:bar*4+offset,dur:(j+1<changes.length?changes[j+1][1]:4)-offset});
   previous=voicing;
  }
 }
 return output;
}
// Falling Grace score-follower geometry, adapted to Giant Steps 16 bars.
function clearGSScoreFollower(){
    if(window.gsFollowerFrame) cancelAnimationFrame(window.gsFollowerFrame);
    window.gsFollowerFrame=0;
    document.querySelectorAll(".gs-measure-marker").forEach(el=>el.remove());
}

function startGSScoreFollower(startTime, beat, token){
    clearGSScoreFollower();
    const positions=[];
    // Same triangle geometry and color as Falling Grace, scoped to Giant Steps.
    if(!document.getElementById('gs-measure-marker-style')){
        const style=document.createElement('style');
        style.id='gs-measure-marker-style';
        style.textContent='.gs-measure-marker{position:absolute;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:6px solid #2563eb;transform:translateX(-50%);pointer-events:none;z-index:5;}';
        document.head.appendChild(style);
    }
    const systems=[...document.querySelectorAll("#score .score-system")];
    for(let group=0;group<Math.min(4,systems.length);group++){
        const system=systems[group];
        const svg=system.querySelector("svg");
        if(!svg) continue;
        const systemRect=system.getBoundingClientRect();
        const svgRect=svg.getBoundingClientRect();
        const viewBox=svg.viewBox.baseVal;
        const scaleX=svgRect.width/(viewBox.width||svgRect.width);
        const svgToX=x=>svgRect.left-systemRect.left+(x-viewBox.x)*scaleX;
        const elementX=node=>{
            try{
                const bb=node.getBBox();
                const pt=svg.createSVGPoint();
                pt.x=bb.x+bb.width/2;pt.y=bb.y;
                const matrix=node.getCTM();
                return svgToX(matrix?pt.matrixTransform(matrix).x:pt.x);
            }catch(e){return null;}
        };
        // Read existing engraving coordinates; do not change or re-render notation.
        // abcjs may put measure and note classes on the SAME SVG element.
        // The old descendant-only selector returned no notes, hiding the marker.
        const firstNotes=[0,1,2,3].map(m=>{
            const candidates=[...system.querySelectorAll(`.abcjs-m${m}.abcjs-note, .abcjs-m${m} .abcjs-note`)];
            const xs=candidates.map(elementX).filter(x=>x!==null);
            return xs.length?Math.min(...xs):null;
        });
        // Empty improvisation measures contain rests, not noteheads.
        // Include those rests when finding the measure's engraved start.
        const firstSymbols=[0,1,2,3].map(m=>{
            const nodes=[...system.querySelectorAll(`.abcjs-m${m}.abcjs-note, .abcjs-m${m} .abcjs-note, .abcjs-m${m}.abcjs-rest, .abcjs-m${m} .abcjs-rest`)];
            const xs=nodes.map(elementX).filter(x=>x!==null);
            return xs.length?Math.min(...xs):null;
        });
        const barlines=[...system.querySelectorAll(".abcjs-bar")]
            .map(elementX).filter(x=>x!==null).sort((a,b)=>a-b)
            .filter((x,i,arr)=>i===0||x-arr[i-1]>2);
        // Anchor the triangle to the bottom STAFF LINE, not to a note or
        // the overall staff group's bounding box (which can include ledger lines).
        let staffBottom=null;
        const staffLines=[...svg.querySelectorAll(".abcjs-staff")];
        const scaleY=svgRect.height/(viewBox.height||svgRect.height);
        for(const line of staffLines){
            try{
                const bb=line.getBBox();
                const pt=svg.createSVGPoint();
                pt.x=bb.x;pt.y=bb.y+bb.height;
                const matrix=line.getCTM();
                const svgY=matrix?pt.matrixTransform(matrix).y:pt.y;
                const y=svgRect.top-systemRect.top+(svgY-viewBox.y)*scaleY;
                if(staffBottom===null||y>staffBottom) staffBottom=y;
            }catch(e){}
        }
        // Quarter-note grid: four equal beat positions per bar, irrespective
        // of note attacks, rests, ties, or the melody's rhythmic subdivision.
        for(let m=0;m<4;m++){
            const barIndex=group*4+m;
            // Prefer the actual note position, with engraved barline fallback
            // for system-opening measures and measures without noteheads.
            const noteStart=firstNotes[m];
            const symbolStart=firstSymbols[m];
            // Mark the measure boundary, not the first notehead. ABCJS
            // leaves space after each barline before engraving the note.
            // For a system-opening measure there is no preceding barline:
            // place the marker just before its first note instead.
            const precedingBarline=m===0||symbolStart===null?null:
                [...barlines].reverse().find(x=>x<symbolStart-2);
            // Improvisation bars (6 and 21) have no noteheads. Locate their
            // start from the engraved barlines instead of skipping the bar.
            // For a system-opening empty bar (21), estimate the opening
            // boundary from the adjacent engraved bar width.
            const emptyBarStart=m===0
                ? (barlines.length>=2 ? barlines[0]-(barlines[1]-barlines[0])
                   : (barlines[0]!==undefined ? barlines[0]-80 : null))
                : (barlines[m-1]??null);
            // Do not drop a timed measure simply because it contains no notes.
            // Use the engraved rest as the anchor when available.
            const left=precedingBarline ?? (symbolStart!==null?symbolStart-12:emptyBarStart);
            if(left===null) continue;
            const nextFirst=m<3?firstNotes[m+1]:null;
            const rightBoundary=barlines.find(x=>x>left+2)??null;
            const right=rightBoundary??(nextFirst!==null?nextFirst-8:null);
            // A measure marker needs only the starting x coordinate;
            // never discard it because its ending barline is ambiguous.
            const width=right!==null&&right>left?right-left:0;
            for(let q=0;q<4;q++){
                positions.push({time:(barIndex*4+q)*beat,system,
                    x:left+width*q/4,barX:left,barIndex,staffBottom});
            }
        }
    }
    if(!positions.length) return;
    const measureMarkers=new Map();
    const update=()=>{
        if(!playing || token!==playToken){clearGSScoreFollower();return;}
        const elapsed=Math.max(0,ctx.currentTime-startTime) % (16*4*beat);
        let active=null;
        for(const p of positions){if(p.time<=elapsed+0.015) active=p;else break;}
        measureMarkers.forEach((marker,system)=>{marker.style.display=active&&system===active.system?"block":"none";});
        if(active){
            let marker=measureMarkers.get(active.system);
            if(!marker){
                marker=document.createElement("div");
                marker.className="gs-measure-marker";
                marker.setAttribute("aria-hidden","true");
                active.system.appendChild(marker);
                measureMarkers.set(active.system,marker);
            }
            // A stationary indicator at beat one, held until the next measure.
            marker.style.left=active.barX+"px";
            if(active.staffBottom!==null){
                // Triangle tip sits at the bottom staff line, consistently
                // above low notes and their ledger lines.
                marker.style.top=(active.staffBottom+1)+"px";
            }
            marker.style.display="block";
        }
        window.gsFollowerFrame=requestAnimationFrame(update);
    };
    update();
}

let playToken=0,melodyBus=null,accompBus=null;
function sliderLevel(id){return Math.max(0,Math.min(1,Number($(id).value)||0));}
function updateMix(){
 if(!ctx)return;
 if(melodyBus)melodyBus.gain.setTargetAtTime(sliderLevel('gs-melvol')*0.75,ctx.currentTime,.015);
 if(accompBus)accompBus.gain.setTargetAtTime(sliderLevel('gs-accvol')*0.68,ctx.currentTime,.015);
}
function sampleBoost(buffer){
 let peak=0;
 for(let c=0;c<buffer.numberOfChannels;c++){
  const samples=buffer.getChannelData(c);
  for(let i=0;i<samples.length;i+=32)peak=Math.max(peak,Math.abs(samples[i]));
 }
 return Math.min(7,Math.max(1,.65/Math.max(peak,.001)));
}
function stop(){clearGSScoreFollower();playToken++;if(stopTimer)clearTimeout(stopTimer);for(const s of sources){try{s.stop()}catch{}}sources=[];playing=false;melodyBus=null;accompBus=null;$('playPause').textContent='▶ Play';$('transport-status').textContent='Ready';}
async function play(){
 if(playing){stop();return;}
 ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();const token=++playToken;
 $('transport-status').textContent='Loading sounds…';$('playPause').disabled=true;
 const beat=60/Math.max(40,Math.min(240,Number($('tempo').value)||80));
 const melody=activeEvents().flat();
 let chords;
 try { chords=accompanimentChords(); if(!chords.length)throw Error('No accompaniment chords generated'); }
 catch(err){ console.error('Accompaniment generation failed:',err); $('transport-status').textContent='Accompaniment error: '+err.message; return; }
 const melSound='rhodes',accSound='piano';
 // Preload ALL samples before starting the clock, so the first notes cannot be skipped.
 try{await Promise.all([...[...new Set(melody.map(e=>e.m))].map(m=>loadSample(melSound,m)), ...[...new Set(chords.flatMap(c=>c.m))].map(m=>loadSample('piano',m))]);}
 catch(err){console.error(err);$('transport-status').textContent='Audio error: '+err.message;$('playPause').disabled=false;return;}
 if(token!==playToken){$('playPause').disabled=false;return;}
 const accompanimentBuffers=new Map();
 for(const m of new Set(chords.flatMap(c=>c.m))){
  const sourceMidi=sampleSource('piano',m);
  accompanimentBuffers.set(sourceMidi,await bufferCache.get('piano-'+sourceMidi));
 }
 melodyBus=ctx.createGain();accompBus=ctx.createGain();
 melodyBus.connect(ctx.destination);accompBus.connect(ctx.destination);
 updateMix();
 const start=ctx.currentTime+.12;
 const schedule=(m,t,d,sound,volume)=>{const sourceMidi=sampleSource(sound,m),buf=bufferCache.get(sound+'-'+sourceMidi);if(!buf)return;
 // All buffers are loaded: scheduling is now synchronous and sample-accurate.
 return buf.then(audio=>{if(token!==playToken)return;let src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=audio;src.playbackRate.value=2**((m-sourceMidi)/12);
 let when=start+t*beat,duration=Math.max(.07,d*beat);gain.gain.setValueAtTime(.0001,when);
 gain.gain.linearRampToValueAtTime(Math.max(.0001,volume),when+.02);
 gain.gain.setValueAtTime(Math.max(.0001,volume),when+Math.max(.021,duration-.04));
 gain.gain.linearRampToValueAtTime(.0001,when+duration);src.connect(gain).connect(melodyBus);
 src.start(when);src.stop(when+duration+.01);sources.push(src);});};
 playing=true;startGSScoreFollower(start,beat,token);$('playPause').disabled=false;$('playPause').textContent='Ⅱ Pause';$('transport-status').textContent='Playing · '+chords.length+' accompaniment chords';
 // Closed hi-hat on beats 2 and 4, using short filtered noise bursts.
 if($('gs-hat')?.checked){
  const length=Math.max(256,Math.round(ctx.sampleRate*.065));
  const noise=ctx.createBuffer(1,length,ctx.sampleRate),data=noise.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
  for(let pass=0;pass<2;pass++)for(let bar=0;bar<16;bar++)for(const b of [1,3]){
   const when=start+(pass*64+bar*4+b)*beat;
   const src=ctx.createBufferSource(),hp=ctx.createBiquadFilter(),gain=ctx.createGain();
   src.buffer=noise;hp.type='highpass';hp.frequency.value=6500;
   gain.gain.setValueAtTime(.0001,when);
   gain.gain.linearRampToValueAtTime(.17,when+.003);
   gain.gain.exponentialRampToValueAtTime(.0001,when+.055);
   src.connect(hp).connect(gain).connect(ctx.destination);
   src.start(when);src.stop(when+.065);sources.push(src);
  }
 }
 const jobs=[];for(let pass=0;pass<2;pass++){
 for(let e of melody)jobs.push(schedule(e.m,pass*64+e.bar*4+e.start,e.dur,melSound,.5));
 for(const chord of chords){
  const when=start+(pass*64+chord.start)*beat;
  const duration=Math.max(.10,chord.dur*beat);
  // Direct, fully decoded piano samples. Each voice has its own audible gain.
  for(const m of chord.m){
   const sourceMidi=sampleSource('piano',m);
   const audio=accompanimentBuffers.get(sourceMidi);
   if(!audio){console.error('Missing piano buffer for',m);continue;}
   const src=ctx.createBufferSource(),gain=ctx.createGain();
   src.buffer=audio;
   src.playbackRate.value=2**((m-sourceMidi)/12);
   const level=.28*sampleBoost(audio);
   gain.gain.setValueAtTime(.0001,when);
   gain.gain.linearRampToValueAtTime(level,when+.025);
   gain.gain.setValueAtTime(level,when+Math.max(.020,duration-.08));
   gain.gain.linearRampToValueAtTime(.0001,when+duration);
   src.connect(gain).connect(accompBus);
   src.start(when);src.stop(when+duration+.01);sources.push(src);
  }
 }
 }await Promise.all(jobs);
 if(token===playToken)stopTimer=setTimeout(stop,128*beat*1000+300);
}
function midiExport(){const ppq=480,track=[],ev=[];const add=(tick,bytes)=>ev.push([tick,bytes]);for(let bar of activeEvents())for(let e of bar){let t=Math.round((e.bar*4+e.start)*ppq),end=t+Math.round(e.dur*ppq);add(t,[0x90,e.m,94]);add(end,[0x80,e.m,0]);}ev.sort((a,b)=>a[0]-b[0]||a[1][0]-b[1][0]);const varlen=n=>{let out=[n&127];while(n>>=7)out.unshift((n&127)|128);return out};let prev=0;for(let [t,msg]of ev){track.push(...varlen(t-prev),...msg);prev=t;}track.push(0,0xff,0x2f,0);const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];const tempo=Math.round(60000000/Number($('tempo').value||80));const meta=[0,0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,0,0xff,0x2f,0];const bytes=[...Array.from('MThd',x=>x.charCodeAt(0)),0,0,0,6,0,1,0,2,1,224,...Array.from('MTrk',x=>x.charCodeAt(0)),...u32(meta.length),...meta,...Array.from('MTrk',x=>x.charCodeAt(0)),...u32(track.length),...track];download(new Blob([new Uint8Array(bytes)],{type:'audio/midi'}),'giant-steps.mid');}
function download(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
async function wavExport(){const bpm=Number($('tempo').value)||80,beat=60/bpm,sr=22050,length=Math.ceil((64*beat+1)*sr),offline=new OfflineAudioContext(1,length,sr);const notes=activeEvents().flat();for(let e of notes){let start=(e.bar*4+e.start)*beat,dur=e.dur*beat;let osc=offline.createOscillator(),gain=offline.createGain();osc.type='sine';osc.frequency.value=440*2**((e.m-69)/12);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.15*Number($('gs-melvol').value),start+.02);gain.gain.setValueAtTime(.13*Number($('gs-melvol').value),start+Math.max(.021,dur-.04));gain.gain.linearRampToValueAtTime(0,start+dur);osc.connect(gain).connect(offline.destination);osc.start(start);osc.stop(start+dur+.01)}let buf=await offline.startRendering(),f=buf.getChannelData(0),wav=new ArrayBuffer(44+f.length*2),view=new DataView(wav);const str=(off,s)=>{for(let i=0;i<s.length;i++)view.setUint8(off+i,s.charCodeAt(i))};str(0,'RIFF');view.setUint32(4,36+f.length*2,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sr,true);view.setUint32(28,sr*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,f.length*2,true);for(let i=0;i<f.length;i++)view.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(f[i]*32767))),true);download(new Blob([wav],{type:'audio/wav'}),'giant-steps.wav');}
function setupFavorites(){const key='giant-steps-favorites-v1';const load=()=>JSON.parse(localStorage.getItem(key)||'[]');const refresh=()=>{let select=$('fg-load');select.innerHTML='<option value="">Load Favorite…</option>';load().forEach((x,i)=>{let o=document.createElement('option');o.value=i;o.textContent=x.name;select.appendChild(o)});select.disabled=!load().length;$('fg-delete').disabled=!load().length;};$('fg-auth-status').textContent='Favorites: saved in this browser';$('fg-sign-in').hidden=true;$('fg-sign-out').hidden=true;$('fg-save').disabled=false;$('fg-save').onclick=()=>{let arr=load(),name=prompt('Favorite name','Giant Steps '+(arr.length+1));if(!name)return;arr.push({name,rhythmIds,events,originalMode});localStorage.setItem(key,JSON.stringify(arr));refresh();};$('fg-load').onchange=e=>{let x=load()[Number(e.target.value)];if(!x)return;rhythmIds=x.rhythmIds;events=x.events;originalMode=x.originalMode;render();};$('fg-delete').onclick=()=>{let idx=Number($('fg-load').value);if(!$('fg-load').value)return;let arr=load();arr.splice(idx,1);localStorage.setItem(key,JSON.stringify(arr));refresh();};refresh();}
window.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b===button));$('gs-mode').value=button.dataset.mode;generate(false);}));$('tempo').addEventListener('input',()=>{$('tempo-value').textContent=$('tempo').value+' BPM';});setupRange();setupFavorites();for(const id of ['gs-melvol','gs-accvol'])$(id).addEventListener('input',updateMix);$('generate').onclick=()=>generate();$('rhythms').onclick=()=>generate(true);$('pentas').onclick=()=>generate(false);$('playPause').onclick=play;
// Spacebar controls Play/Stop, except while editing or using a form control.
document.addEventListener('keydown',event=>{
 if(event.code!=='Space'||event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
 const target=event.target;
 if(target instanceof Element && (target.closest('input, textarea, select, button, [contenteditable]') || target.isContentEditable))return;
 event.preventDefault();
 if(!$('playPause').disabled)play();
});$('stopPlayback').onclick=stop;$('gs-mode').onchange=()=>generate(false);$('gs-order').onchange=()=>generate(false);$('gs-original').onclick=()=>{stop();originalMode=!originalMode;$('gs-original').textContent=originalMode?'Return to Generated':'Original Melody';render();};$('gs-midi').onclick=midiExport;$('gs-wav').onclick=wavExport;$('gs-pdf').onclick=()=>window.print();generate();});
