/* Giant Steps: independent 16-bar engine; exact user-supplied four-note pitch cells. */
'use strict';
const D=GS_DATA, PC={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const $=id=>document.getElementById(id), rnd=n=>Math.floor(Math.random()*n), pick=a=>a[rnd(a.length)];
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
let allEighths=false;
let events=[],rhythmIds=[],originalMode=false,playing=false,ctx=null,sources=[],stopTimer=null,bufferCache=new Map(),selectedFavorite=null;
const patterns={straight:[0,1,2,3],retro:[3,2,1,0],inverted:[0,2,1,3],river:[3,0,1,2],enclosure:[1,0,2,3]};
function noteCandidates(name){let a=[];for(let oct=2;oct<=7;oct++){const m=(oct+1)*12+PC[name];if(m>=Number($('fg-low').value)&&m<=Number($('fg-high').value))a.push(m);}return a;}
const pairedPatterns={pair_retro_straight:['retro','straight'],pair_straight_river:['straight','river'],pair_river_enclosure:['river','enclosure'],pair_inverted_river:['inverted','river']};
function patternNames(chord,chosenMode){let names=D.pitch[chord],mode=chosenMode||$('gs-order').value;if(mode==='random')mode=pick(Object.keys(patterns));return patterns[mode].map(i=>names[i]);}
// Rotate the intact 1-2-3-5 pitch-class cell to start on the closest
// available degree (1, 2, 3 or 5). Direction determines the traversal;
// octave placement must follow that direction within the selected range.
function voiceLeadCell(tones,previous,direction,avoidNames=null){
 const order=direction==='descending'?[3,2,1,0]:[0,1,2,3];
 let best=null,bestCost=Infinity;
 for(let rotation=0;rotation<4;rotation++){
  const names=Array.from({length:4},(_,i)=>tones[order[(rotation+i)%4]]);
  if(avoidNames&&names.every((name,i)=>name===avoidNames[i]))continue;
  const pools=names.map(noteCandidates);
  if(pools.some(pool=>!pool.length))continue;
  function visit(i,path){
   if(i===4){
    const join=previous==null?Math.abs(path[0]-70):Math.abs(path[0]-previous);
    const inside=path.slice(1).reduce((sum,p,j)=>sum+Math.abs(p-path[j]),0);
    // Prefer a close join, then compact steps within the cell.
    const cost=join*4+inside+(previous!=null&&join===0?3:0);
    if(cost<bestCost){bestCost=cost;best={names,pitches:path.slice()};}
    return;
   }
   for(const pitch of pools[i]){
    if(i){
     const step=pitch-path[i-1];
     if(direction==='ascending'&&step<=0)continue;
     if(direction==='descending'&&step>=0)continue;
    }
    path.push(pitch);visit(i+1,path);path.pop();
   }
  }
  visit(0,[]);
 }
 // A very narrow range may not contain a full strictly directed cell.
 // In that case, keep the four chord tones and minimize movement rather
 // than failing and leaving the score blank.
 if(!best){
  for(let rotation=0;rotation<4;rotation++){
   const names=Array.from({length:4},(_,i)=>tones[order[(rotation+i)%4]]);
   const pools=names.map(noteCandidates);
   if(pools.some(pool=>!pool.length))continue;
   const pitches=[];let last=previous;
   for(const pool of pools){
    const candidate=pool.reduce((a,p)=>Math.abs(p-(last??70))<Math.abs(a-(last??70))?p:a,pool[0]);
    pitches.push(candidate);last=candidate;
   }
   const cost=(previous==null?0:4*Math.abs(pitches[0]-previous))+pitches.slice(1).reduce((s,p,i)=>s+Math.abs(p-pitches[i]),0);
   if(cost<bestCost){bestCost=cost;best={names,pitches};}
  }
 }
 if(!best)throw Error('No playable octave for cell '+tones.join('-'));
 return best;
}
function rhythmDurations(id){const str=D.rhythms[id];let durations=[];for(const token of str.match(/Q\.|Q|E/g)||[])durations.push(token==='Q.'?1.5:token==='Q'?1:.5);if(Math.abs(durations.reduce((a,b)=>a+b,0)-4)>.01)throw Error('Invalid rhythm '+id);return durations;}
function chordAt(bar,t){const ch=D.bars[bar];return ch.length>1&&t>=2?ch[1][0]:ch[0][0];}
function generate(regenerateRhythms=true){
 stop();originalMode=false;
 if(regenerateRhythms||!rhythmIds.length)rhythmIds=Array.from({length:16},(_,bar)=>[2,6,8,10,12,14].includes(bar)?pick([1,2]):0);
 events=[];let prev=null,cellIndex=0;
 // Exactly 32 cells per chart: two per measure, including partial cells.
 // Half & Half uses 16 ascending and 16 descending cells in shuffled order.
 const balancedDirections=shuffle([...Array(16).fill('ascending'),...Array(16).fill('descending')]);
 for(let bar=0;bar<16;bar++){
  const order=$('gs-order').value,pair=pairedPatterns[order];
  const selectedModes=pair?(D.bars[bar].length===2?pair:[pick(pair)]):null;
  const durations=allEighths?Array(8).fill(.5):[2,6,8,10,12,14].includes(bar)?(rhythmIds[bar]===2?[2,.5,.5,.5,.5]:[1,.5,.5,.5,.5,.5,.5]):Array(8).fill(.5);
  let time=0,barEvents=[],seqs={},idx={},cellDirections={},cellPitches={},previousCellNames={};
  for(const d of durations){
   const end=time+d;
   while(time<end-1e-6){
    const chord=chordAt(bar,time);
    const segmentEnd=D.bars[bar].length===2&&time<2?Math.min(end,2):end;
    const n=idx[chord]||0,cellStart=n%4===0;
    if(cellStart){
     const setting=$('gs-direction')?.value||'random';
     const direction=setting==='alternating'?(cellIndex%2?'descending':'ascending'):
       setting==='random'?pick(['ascending','descending']):
       setting==='half-half'?balancedDirections[cellIndex%balancedDirections.length]:setting;
     cellDirections[chord]=direction;
     // Choose the smoothest of four cyclic rotations of 1235 or 5321.
     // The starting degree may be 1, 2, 3 or 5.
     // If the same harmony receives a second cell in this bar, forbid
     // an identical four-note rotation while retaining smooth voice leading.
     const cell=voiceLeadCell(D.pitch[chord],prev,direction,previousCellNames[chord]||null);
     previousCellNames[chord]=cell.names.slice();
     seqs[chord]=cell.names;
     cellPitches[chord]=cell.pitches;
     cellIndex++;
    }
    const direction=cellDirections[chord];
    const name=seqs[chord][n%4];
    idx[chord]=n+1;
    // Preserve the exact pitch-class order, including across octave changes.
    // Never replace a requested cell tone with another pitch class.
    const m=cellPitches[chord][n%4];
    barEvents.push({bar,start:time,dur:segmentEnd-time,m,chord,name});
    prev=m;time=segmentEnd;
   }
  }
  events.push(barEvents);
 }
 render();
}
function originalEvents(){return D.original.map((bar,i)=>bar.map(([m,start,dur])=>({bar:i,start,dur,m,chord:chordAt(i,start),name:midiName(m)})));}
function concertEvents(){return originalMode?originalEvents():events;}
function instrumentShift(){return Number($('gs-instrument')?.value||0);}
function activeEvents(){
 const shift=instrumentShift()+($('gs-clef')?.value==='bass'?-12:0);
 return concertEvents().map(bar=>bar.map(e=>({...e,m:e.m+shift})));
}
function transposeChord(symbol,shift){
 const names=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
 return symbol.replace(/^([A-G])([#b]?)/,(_,letter,acc)=>{
   const root=PC[letter+acc];
   return names[((root+shift)%12+12)%12];
 });
}
function midiName(m){return ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][m%12]+(Math.floor(m/12)-1);}
function abcPitch(m){const p=['C','^C','D','_E','E','F','^F','G','_A','A','_B','B'][m%12],oct=Math.floor(m/12)-1;let base=p;if(oct>=5)base=base.replace(/[A-G]/,s=>s.toLowerCase())+"'".repeat(Math.max(0,oct-5));else base+=','.repeat(Math.max(0,4-oct));return base;}
function abcBar(bar){
 const ev=activeEvents()[bar];let abc='',t=0;
 // Accidentals apply to the same staff pitch only within this measure.
 const accidentalsInBar=new Map();
 for(const e of ev){
  if(e.start>t+.0001)abc+=' z'+Math.round((e.start-t)*2);
  const chordChange=e.start===0||(Math.abs(e.start-2)<.0001&&D.bars[bar].length===2);
  const chordLabel=chordChange?'"'+transposeChord(e.chord,instrumentShift()).replace(/maj7/,'△7')+'"':'';
  const duration=Math.round(e.dur*2);
  // Original lead-sheet spelling: G-sharp in measures 6-7, not A-flat.
  let spelledPitch=(instrumentShift()===0&&e.chord==='Bmaj7'&&e.m%12===3)?(e.m>=72?'^d':'^D'):(instrumentShift()===0&&originalMode&&e.m%12===3)?(e.m>=72?'^d':'^D'):(instrumentShift()===0&&originalMode&&[3,9].includes(bar)&&e.start===0&&e.m===71?'=B':abcPitch(e.m));
  // Chord-specific enharmonic spelling only; MIDI pitch and timing are unchanged.
  const preferredSharp=(e.chord==='F#7'&&e.m%12===8)?'G':
                       (e.chord==='F#7'&&e.m%12===10)?'A':
                       (e.chord==='C#m7'&&e.m%12===8)?'G':
                       (e.chord==='C#m7'&&e.m%12===3)?'D':null;
  if(preferredSharp && instrumentShift()===0){
   const octave=Math.floor(e.m/12)-1;
   spelledPitch='^'+(octave>=5?preferredSharp.toLowerCase():preferredSharp)+
     (octave>=5?"'".repeat(octave-5):','.repeat(4-octave));
  }
  // Spell notes against the *displayed* G-flat dominant harmony with flats.
  // Only the engraving changes; event MIDI pitches and playback remain intact.
  const writtenChord=transposeChord(e.chord,instrumentShift());
  if(writtenChord==='Gb7'){
   const flatSpelling={1:'Db',3:'Eb',4:'Fb',6:'Gb',8:'Ab',10:'Bb'};
   const name=flatSpelling[e.m%12];
   if(name){
    const octave=Math.floor(e.m/12)-1;
    const letter=name[0],acc=name[1]==='b'?'_':'';
    spelledPitch=acc+(octave>=5?letter.toLowerCase()+"'".repeat(octave-5):letter+','.repeat(4-octave));
   }
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
  const abc=['X:1','M:4/4','L:1/8',($('gs-clef').value==='bass'?'K:C clef=bass':'K:C'),'%%stemheight 17',
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
let out=$('output');out.replaceChildren();activeEvents().forEach((bar,i)=>{let tr=document.createElement('tr');let ch=D.bars[i].map(x=>x[0]).join(' → ');[i+1,ch,(allEighths?'All 8ths':'Rhythm '+(rhythmIds[i]+1||1)),(allEighths?'EEEE · EEEE':[2,6,8,10,12,14].includes(i)?(rhythmIds[i]===2?'H · EEEE':'Q · EEEEEE'):'EEEE · EEEE'),D.bars[i].map(x=>D.pitch[x[0]].join(' ')).join(' / '),bar.map(e=>midiName(e.m)).join(' · ')].forEach(x=>{let td=document.createElement('td');td.textContent=x;tr.appendChild(td)});out.appendChild(tr);});}
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
    const systems=[...document.querySelectorAll('#score .score-system')];
    const markers=[];
    if(!document.getElementById('gs-measure-marker-style')){
        const style=document.createElement('style');
        style.id='gs-measure-marker-style';
        style.textContent='.gs-measure-marker{position:absolute;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:6px solid #2563eb;transform:translateX(-50%);pointer-events:none;z-index:50;display:none;}';
        document.head.appendChild(style);
    }
    for(let group=0;group<4;group++){
        const system=systems[group],svg=system?.querySelector('svg');
        if(!svg)continue;
        const systemRect=system.getBoundingClientRect();
        // Use the actual SVG screen transform, which includes ABCJS viewBox
        // cropping and responsive scaling. Do not estimate from barline widths.
        const point=(node,x,y)=>{
            const matrix=node.getScreenCTM();
            if(!matrix)return null;
            const p=svg.createSVGPoint();p.x=x;p.y=y;
            return p.matrixTransform(matrix);
        };
        const xOf=node=>{
            try{
                const box=node.getBBox();
                const pt=point(node,box.x+box.width/2,box.y+box.height/2);
                return pt?pt.x-systemRect.left:null;
            }catch{return null;}
        };
        // ABCJS annotates each note with abcjs-mN. Collect the actual first
        // notehead of EVERY measure, including measure four, instead of
        // deriving starts from the last four barlines (which can include
        // repeat signs and shift or omit the final measure).
        const byMeasure=new Map();
        for(const note of svg.querySelectorAll('.abcjs-note')){
            let node=note,measure=null;
            while(node&&node!==svg){
                const match=(node.getAttribute('class')||'').match(/(?:^|\s)abcjs-m(\d+)(?=\s|$)/);
                if(match){measure=Number(match[1]);break;}
                node=node.parentElement;
            }
            if(measure===null)continue;
            const x=xOf(note);
            if(Number.isFinite(x))byMeasure.set(measure,Math.min(byMeasure.get(measure)??Infinity,x));
        }
        const keys=[...byMeasure.keys()].sort((a,b)=>a-b);
        // Each SVG contains exactly four measures. ABCJS may number the
        // measures locally or globally, so normalize by sorted distinct IDs.
        let starts=keys.map(k=>byMeasure.get(k));
        if(starts.length!==4){
            // Fallback: identify note groups by their horizontal position
            // relative to actual barlines, not by dividing the staff evenly.
            const lines=[...svg.querySelectorAll('.abcjs-bar')].map(xOf)
                .filter(Number.isFinite).sort((a,b)=>a-b)
                .filter((x,i,arr)=>i===0||x-arr[i-1]>3);
            const noteXs=[...svg.querySelectorAll('.abcjs-note')].map(xOf).filter(Number.isFinite).sort((a,b)=>a-b);
            if(lines.length>=3&&noteXs.length){
                const internal=lines.filter(x=>x>noteXs[0]+3&&x<noteXs[noteXs.length-1]-3);
                if(internal.length>=3){
                    const splits=internal.slice(0,3);
                    starts=[noteXs[0],...splits.map(x=>noteXs.find(n=>n>x+2))];
                }
            }
        }
        if(starts.length!==4||starts.some(x=>!Number.isFinite(x))){
            console.warn('GS follower: cannot locate four engraved measures in system',group+1);
            continue;
        }
        // Measure the five horizontal staff rules. The bottom rule is
        // independent of low notes, stems, beams, and repeat barlines.
        const staffYs=[];
        for(const node of svg.querySelectorAll('.abcjs-staff')){
            try{
                const box=node.getBBox();
                if(box.width<100)continue;
                const pt=point(node,box.x,box.y+box.height/2);
                if(pt)staffYs.push(pt.y-systemRect.top);
            }catch{}
        }
        // ABCJS staff paths can be grouped into one five-line path.
        if(!staffYs.length){
            for(const node of svg.querySelectorAll('.abcjs-bar')){
                try{
                    const box=node.getBBox();
                    if(box.height<15)continue;
                    const pt=point(node,box.x,box.y+box.height);
                    if(pt)staffYs.push(pt.y-systemRect.top);
                }catch{}
            }
        }
        const staffBottom=staffYs.length?Math.max(...staffYs):svg.getBoundingClientRect().bottom-systemRect.top-12;
        const marker=document.createElement('div');
        marker.className='gs-measure-marker';
        marker.setAttribute('aria-hidden','true');
        marker.style.top=(staffBottom+14)+'px';
        system.appendChild(marker);
        markers.push({marker,starts,group});
    }
    if(!markers.length)return;
    const update=()=>{
        if(!playing||token!==playToken){clearGSScoreFollower();return;}
        const elapsed=Math.max(0,ctx.currentTime-startTime);
        const bar=Math.min(15,Math.floor((elapsed%(64*beat))/(4*beat)));
        const group=Math.floor(bar/4),within=bar%4;
        for(const item of markers){
            const visible=item.group===group;
            item.marker.style.display=visible?'block':'none';
            if(visible)item.marker.style.left=(item.starts[within]-20)+'px';
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
function stop(){clearGSScoreFollower();playToken++;if(stopTimer){clearTimeout(stopTimer);stopTimer=null;}for(const s of sources){try{s.stop()}catch{}}sources=[];playing=false;if(melodyBus)try{melodyBus.disconnect()}catch{};if(accompBus)try{accompBus.disconnect()}catch{};melodyBus=null;accompBus=null;$('playPause').disabled=false;$('playPause').textContent='▶ Play';$('transport-status').textContent='Ready';}
async function play(){
 if(playing){stop();return;}
 const token=++playToken;
 ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();
 if(token!==playToken)return;
 $('transport-status').textContent='Loading sounds…';$('playPause').disabled=true;
 const beat=60/Math.max(40,Math.min(240,Number($('tempo').value)||80));
 const melody=concertEvents().flat();
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
  if(token!==playToken)return;
  const sourceMidi=sampleSource('piano',m);
  accompanimentBuffers.set(sourceMidi,await bufferCache.get('piano-'+sourceMidi));
 }
 // Generation/Stop can occur during asynchronous buffer resolution. Never schedule a stale run.
 if(token!==playToken)return;
 const melodyBuffers=new Map();
 for(const m of new Set(melody.map(e=>e.m))){
  const sourceMidi=sampleSource('rhodes',m);
  melodyBuffers.set(sourceMidi,await bufferCache.get('rhodes-'+sourceMidi));
 }
 if(token!==playToken)return;
 melodyBus=ctx.createGain();accompBus=ctx.createGain();
 melodyBus.connect(ctx.destination);accompBus.connect(ctx.destination);
 updateMix();
 const start=ctx.currentTime+.12;
 const schedule=(m,t,d,sound,volume)=>{
 if(token!==playToken)return;
 const sourceMidi=sampleSource(sound,m),audio=melodyBuffers.get(sourceMidi);if(!audio)return;
 let src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=audio;src.playbackRate.value=2**((m-sourceMidi)/12);
 let when=start+t*beat,duration=Math.max(.07,d*beat);gain.gain.setValueAtTime(.0001,when);
 gain.gain.linearRampToValueAtTime(Math.max(.0001,volume),when+.02);
 gain.gain.setValueAtTime(Math.max(.0001,volume),when+Math.max(.021,duration-.04));
 gain.gain.linearRampToValueAtTime(.0001,when+duration);src.connect(gain).connect(melodyBus);
 src.start(when);src.stop(when+duration+.01);sources.push(src);};
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
 }
 if(token===playToken)stopTimer=setTimeout(stop,128*beat*1000+300);
}
function midiExport(){const ppq=480,track=[],ev=[];const add=(tick,bytes)=>ev.push([tick,bytes]);for(let bar of concertEvents())for(let e of bar){let t=Math.round((e.bar*4+e.start)*ppq),end=t+Math.round(e.dur*ppq);add(t,[0x90,e.m,94]);add(end,[0x80,e.m,0]);}ev.sort((a,b)=>a[0]-b[0]||a[1][0]-b[1][0]);const varlen=n=>{let out=[n&127];while(n>>=7)out.unshift((n&127)|128);return out};let prev=0;for(let [t,msg]of ev){track.push(...varlen(t-prev),...msg);prev=t;}track.push(0,0xff,0x2f,0);const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];const tempo=Math.round(60000000/Number($('tempo').value||80));const meta=[0,0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,0,0xff,0x2f,0];const bytes=[...Array.from('MThd',x=>x.charCodeAt(0)),0,0,0,6,0,1,0,2,1,224,...Array.from('MTrk',x=>x.charCodeAt(0)),...u32(meta.length),...meta,...Array.from('MTrk',x=>x.charCodeAt(0)),...u32(track.length),...track];download(new Blob([new Uint8Array(bytes)],{type:'audio/midi'}),'giant-steps.mid');}
function download(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
async function wavExport(){const bpm=Number($('tempo').value)||80,beat=60/bpm,sr=22050,length=Math.ceil((64*beat+1)*sr),offline=new OfflineAudioContext(1,length,sr);const notes=concertEvents().flat();for(let e of notes){let start=(e.bar*4+e.start)*beat,dur=e.dur*beat;let osc=offline.createOscillator(),gain=offline.createGain();osc.type='sine';osc.frequency.value=440*2**((e.m-69)/12);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.15*Number($('gs-melvol').value),start+.02);gain.gain.setValueAtTime(.13*Number($('gs-melvol').value),start+Math.max(.021,dur-.04));gain.gain.linearRampToValueAtTime(0,start+dur);osc.connect(gain).connect(offline.destination);osc.start(start);osc.stop(start+dur+.01)}let buf=await offline.startRendering(),f=buf.getChannelData(0),wav=new ArrayBuffer(44+f.length*2),view=new DataView(wav);const str=(off,s)=>{for(let i=0;i<s.length;i++)view.setUint8(off+i,s.charCodeAt(i))};str(0,'RIFF');view.setUint32(4,36+f.length*2,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sr,true);view.setUint32(28,sr*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,f.length*2,true);for(let i=0;i<f.length;i++)view.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(f[i]*32767))),true);download(new Blob([wav],{type:'audio/wav'}),'giant-steps.wav');}
function setupFavorites(){const key='giant-steps-favorites-v1';const load=()=>JSON.parse(localStorage.getItem(key)||'[]');const refresh=()=>{let select=$('fg-load');select.innerHTML='<option value="">Load Favorite…</option>';load().forEach((x,i)=>{let o=document.createElement('option');o.value=i;o.textContent=x.name;select.appendChild(o)});select.disabled=!load().length;$('fg-delete').disabled=!load().length;};$('fg-auth-status').textContent='Favorites: saved in this browser';$('fg-sign-in').hidden=true;$('fg-sign-out').hidden=true;$('fg-save').disabled=false;$('fg-save').onclick=()=>{let arr=load(),name=prompt('Favorite name','Giant Steps '+(arr.length+1));if(!name)return;arr.push({name,rhythmIds,events,originalMode,allEighths,clef:$('gs-clef').value,instrument:$('gs-instrument').value});localStorage.setItem(key,JSON.stringify(arr));refresh();};$('fg-load').onchange=e=>{let x=load()[Number(e.target.value)];if(!x)return;rhythmIds=x.rhythmIds;events=x.events;originalMode=x.originalMode;allEighths=!!x.allEighths;$('gs-clef').value=x.clef||'treble';$('gs-instrument').value=x.instrument||'0';render();};$('fg-delete').onclick=()=>{let idx=Number($('fg-load').value);if(!$('fg-load').value)return;let arr=load();arr.splice(idx,1);localStorage.setItem(key,JSON.stringify(arr));refresh();};refresh();}
// Remember interface preferences, but generate fresh notes on every page load.
const GS_SETTINGS_KEY='giant-steps-settings-v1';
const GS_SAVED_CONTROLS=['gs-order','gs-direction','gs-instrument','gs-clef','fg-low','fg-high','tempo','gs-melvol','gs-accvol','gs-hat'];
function saveGSSettings(){
 try{
  const settings={allEighths};
  for(const id of GS_SAVED_CONTROLS){const el=$(id);if(el)settings[id]=el.type==='checkbox'?el.checked:el.value;}
  localStorage.setItem(GS_SETTINGS_KEY,JSON.stringify(settings));
 }catch(err){console.warn('Could not save Giant Steps settings:',err);}
}
function restoreGSSettings(){
 try{
  const settings=JSON.parse(localStorage.getItem(GS_SETTINGS_KEY)||'null');
  if(!settings||typeof settings!=='object')return;
  for(const id of GS_SAVED_CONTROLS){
   const el=$(id),value=settings[id];
   if(!el||value===undefined||value===null)continue;
   if(el.type==='checkbox')el.checked=!!value;
   else if([...el.options||[]].length){if([...el.options].some(option=>option.value===String(value)))el.value=String(value);}
   else el.value=String(value);
  }
  allEighths=!!settings.allEighths;
  $('tempo-value').textContent=$('tempo').value+' BPM';
 }catch(err){console.warn('Could not restore Giant Steps settings:',err);}
}
function watchGSSettings(){
 for(const id of GS_SAVED_CONTROLS){
  const el=$(id);if(!el)continue;
  el.addEventListener('change',saveGSSettings);
  el.addEventListener('input',saveGSSettings);
 }
 for(const id of ['generate','rhythms','gs-all-eighths'])$(id)?.addEventListener('click',()=>queueMicrotask(saveGSSettings));
}
window.addEventListener('pagehide',saveGSSettings);
window.addEventListener('DOMContentLoaded',()=>{$('tempo').addEventListener('input',()=>{$('tempo-value').textContent=$('tempo').value+' BPM';});setupRange();
 // Add the fifth choice without requiring changes to index.html.
 const directionSelect=$('gs-direction');
 if(directionSelect&&!directionSelect.querySelector('option[value="half-half"]')){
  const option=document.createElement('option');
  option.value='half-half';option.textContent='Half Ascending / Half Descending';
  directionSelect.appendChild(option);
 }
 restoreGSSettings();watchGSSettings();$('gs-clef').addEventListener('change',()=>{stop();render();});$('gs-instrument').addEventListener('change',()=>{stop();render();});setupFavorites();for(const id of ['gs-melvol','gs-accvol'])$(id).addEventListener('input',updateMix);$('generate').onclick=()=>{allEighths=false;saveGSSettings();generate();};$('rhythms').onclick=()=>{allEighths=false;saveGSSettings();generate(true);};$('gs-all-eighths').onclick=()=>{allEighths=true;saveGSSettings();generate(false);};$('pentas').onclick=()=>generate(false);$('playPause').onclick=play;
// Spacebar controls Play/Stop, except while editing or using a form control.
document.addEventListener('keydown',event=>{
 if(event.code!=='Space'||event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
 const target=event.target;
 if(target instanceof Element && (target.closest('input, textarea, select, button, [contenteditable]') || target.isContentEditable))return;
 event.preventDefault();
 if(!$('playPause').disabled)play();
});$('stopPlayback').onclick=stop;$('gs-order').onchange=()=>generate(false);$('gs-direction').onchange=()=>generate(false);$('gs-original').onclick=()=>{stop();originalMode=!originalMode;$('gs-original').textContent=originalMode?'Return to Generated':'Original Melody';render();};$('gs-midi').onclick=midiExport;$('gs-wav').onclick=wavExport;$('gs-pdf').onclick=()=>window.print();generate();});
