/* =========================================================================
   VIDEO EDITOR
   A usable, browser-based video editor:
   - Import real video / image / audio files (object URLs)
   - Multiple visual clips on a multi-track timeline (drag to move, trim edges)
   - Multiple overlay elements per clip (text + shapes) positioned on the canvas
   - Live preview with real <video>/<img>/<audio>, effects, opacity, transitions
   - Inspector for clip timing/transform/effect and per-element editing
   Note: media object URLs are session-only (cannot be persisted to localStorage),
   so on reload imported media must be re-linked; all other data is saved.
   ========================================================================= */
function openVideoEditor(file){
  let shell=document.getElementById('videoEditor');
  const fresh=shell.cloneNode(false); shell.replaceWith(fresh); shell=fresh;
  shell.classList.remove('hidden');

  shell.innerHTML=`<style>
    .ve-wrap{flex:1;display:grid;grid-template-rows:1fr 220px;overflow:hidden;}
    .ve-main{display:grid;grid-template-columns:1fr 300px;min-height:0;}
    .ve-viewport{background:#050505;display:flex;align-items:center;justify-content:center;overflow:auto;padding:18px;}
    .ve-stage{width:960px;height:540px;max-width:100%;background:#000;position:relative;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4);}
    .ve-clip-layer{position:absolute;inset:0;overflow:hidden;}
    .ve-clip-layer video,.ve-clip-layer img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
    .ve-fill{position:absolute;inset:0;}
    .ve-el{position:absolute;cursor:move;user-select:none;display:flex;align-items:center;justify-content:center;}
    .ve-el.text{font-weight:800;text-align:center;text-shadow:0 2px 10px rgba(0,0,0,.6);padding:6px;line-height:1.1;}
    .ve-el.rect{border-radius:6px;}
    .ve-el.ellipse{border-radius:50%;}
    .ve-el.selected{outline:2px solid var(--warning);outline-offset:2px;}
    .ve-el .ve-handle{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;border-radius:50%;background:var(--warning);cursor:nwse-resize;}
    .ve-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:15px;text-align:center;padding:30px;}
    .ve-inspector{border-left:1px solid var(--border);background:var(--bg-card);padding:12px;overflow:auto;}
    .ve-inspector h4{margin:4px 0 8px;font-size:13px;}
    .ve-inspector label{display:flex;flex-direction:column;gap:3px;margin:7px 0;font-size:11.5px;color:var(--text-muted);}
    .ve-inspector input,.ve-inspector select,.ve-inspector textarea{padding:6px 8px;border:1px solid var(--border);border-radius:7px;background:var(--bg-app);color:var(--text-main);font-size:12.5px;}
    .ve-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
    .ve-sub{font-size:11px;color:var(--text-muted);margin:10px 0 4px;border-top:1px solid var(--border);padding-top:8px;}
    .ve-mini{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;}
    .ve-mini button{flex:1;min-width:70px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-app);color:var(--text-main);font-size:11.5px;cursor:pointer;}
    .ve-mini button:hover{border-color:var(--primary);color:var(--primary);}
    .ve-ellist{display:flex;flex-direction:column;gap:4px;}
    .ve-ellist .ve-elitem{display:flex;align-items:center;gap:6px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;font-size:11.5px;cursor:pointer;background:var(--bg-app);}
    .ve-ellist .ve-elitem.sel{border-color:var(--warning);}
    .ve-ellist .ve-elitem span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ve-ellist .ve-elitem button{border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:13px;}
    .ve-timeline{background:var(--bg-card);border-top:1px solid var(--border);padding:10px 12px;overflow:auto;}
    .ve-time-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:12px;color:var(--text-muted);}
    .ve-ruler{position:relative;height:18px;font-size:10px;color:var(--text-muted);min-width:900px;}
    .ve-ruler .tick{position:absolute;top:0;border-left:1px solid var(--border);padding-left:3px;height:100%;}
    .ve-tracks{position:relative;min-width:900px;}
    .ve-track{position:relative;height:58px;margin-top:6px;background:linear-gradient(90deg,rgba(148,163,184,.16) 1px,transparent 1px);background-size:60px 100%;border-radius:8px;}
    .ve-track-label{position:absolute;left:6px;top:4px;font-size:10px;color:var(--text-muted);z-index:1;pointer-events:none;}
    .ve-playhead{position:absolute;top:0;bottom:0;width:2px;background:var(--danger);z-index:5;pointer-events:none;}
    .ve-clip{position:absolute;top:8px;height:42px;border-radius:7px;color:#fff;padding:5px 8px;font-size:11.5px;cursor:grab;overflow:hidden;border:2px solid transparent;box-shadow:0 2px 6px rgba(0,0,0,.2);white-space:nowrap;}
    .ve-clip.selected{border-color:var(--warning);}
    .ve-clip .ve-trim{position:absolute;top:0;bottom:0;width:8px;cursor:ew-resize;}
    .ve-clip .ve-trim.l{left:0;} .ve-clip .ve-trim.r{right:0;}
    .ve-empty-note{color:var(--text-muted);font-size:12px;}
  </style>
  <div class="editor-topbar">
    <button class="back-btn" id="veBack" aria-label="Back to drawer">&#8592;</button>
    <input class="title-input" id="veTitle" value="${escapeHtml(file.name)}" aria-label="Video file name">
    <div class="save-indicator"><span class="sdot" id="veSaveDot"></span><span id="veSaveText">Saved</span></div>
  </div>
  <div class="editor-toolbar">
    <button class="tbtn wide" id="vePlay">▶ Play</button>
    <button class="tbtn wide" id="vePause">⏸ Pause</button>
    <button class="tbtn wide" id="veStop">⏹ Stop</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="veAddVideo">+ Video</button>
    <button class="tbtn wide" id="veAddImage">+ Image</button>
    <button class="tbtn wide" id="veAddAudio">+ Audio</button>
    <button class="tbtn wide" id="veAddColor">+ Color</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="veAddText">+ Text</button>
    <button class="tbtn wide" id="veAddRect">+ Shape</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="veSplit">✂ Split</button>
    <button class="tbtn wide" id="veDup">⧉ Duplicate</button>
    <button class="tbtn wide" id="veDelete">🗑 Delete</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="veExport">⬇ Export</button>
    <input type="file" id="veFileInput" class="hidden" accept="video/*,image/*,audio/*">
  </div>
  <div class="editor-body">
    <div class="ve-wrap">
      <div class="ve-main">
        <div class="ve-viewport">
          <div class="ve-stage" id="veStage"><div class="ve-placeholder" id="vePlaceholder">No clips yet. Add a Video, Image, or Color clip to begin.</div></div>
        </div>
        <aside class="ve-inspector" id="veInspector"></aside>
      </div>
      <div class="ve-timeline">
        <div class="ve-time-head"><span id="veTime">0.0s</span><span>/</span><span id="veDur">0.0s</span><span class="ve-empty-note" style="margin-left:auto">Drag clips to move • drag edges to trim • click ruler to scrub</span></div>
        <div class="ve-ruler" id="veRuler"></div>
        <div class="ve-tracks" id="veTracks">
          <div class="ve-track" data-track="video"><span class="ve-track-label">VIDEO / IMAGE / COLOR</span><div class="ve-playhead" id="vePlayhead"></div></div>
          <div class="ve-track" data-track="overlay"><span class="ve-track-label">TEXT / SHAPE</span></div>
          <div class="ve-track" data-track="audio"><span class="ve-track-label">AUDIO</span></div>
        </div>
      </div>
    </div>
  </div>`;

  const $=s=>shell.querySelector(s);
  const titleInput=$('#veTitle'),saveDot=$('#veSaveDot'),saveText=$('#veSaveText');
  const stage=$('#veStage'),placeholder=$('#vePlaceholder'),inspector=$('#veInspector');
  const ruler=$('#veRuler'),tracks=$('#veTracks'),playhead=$('#vePlayhead');
  const timeLbl=$('#veTime'),durLbl=$('#veDur'),fileInput=$('#veFileInput');

  const PX=60;
  const STAGE_W=960, STAGE_H=540;
  const mediaURLs={};
  const mediaEls={};

  let clips=(file.content&&file.content.clips)?file.content.clips:[];
  clips.forEach(c=>{ if(!c.elements)c.elements=[]; if(c.opacity==null)c.opacity=1; if(c.x==null){c.x=0;c.y=0;c.scale=1;c.rotation=0;} });

  let selectedClip=null, selectedEl=null, playing=false, t=0, raf=0, saveTimer=0;
  let pendingType=null;

  const TRACK_OF={video:'video',image:'video',color:'video',text:'overlay',rect:'overlay',ellipse:'overlay',audio:'audio'};
  function colorFor(type){return {video:'#3b82f6',image:'#f59e0b',color:'#ec4899',text:'#8b5cf6',rect:'#0ea5e9',ellipse:'#0ea5e9',audio:'#10b981'}[type]||'#64748b';}
  function duration(){return Math.max(0.1,...clips.map(c=>(+c.start||0)+(+c.duration||0)),5);}

  function markUnsaved(){saveDot.style.background='var(--warning)';saveText.textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(save,400);}
  function save(){
    file.name=titleInput.value.trim()||'Untitled';
    const serializable=clips.map(c=>{const{mediaUrl,...rest}=c;return rest;});
    file.content={clips:serializable};
    upsertFile(file);
    saveDot.style.background='var(--success)';saveText.textContent='Saved';
  }

  function nextStart(track){return clips.filter(c=>TRACK_OF[c.type]===track).reduce((m,c)=>Math.max(m,(+c.start||0)+(+c.duration||0)),0);}
  function makeClip(type,extra){
    const track=TRACK_OF[type];
    const c={id:uid(),type,name:type[0].toUpperCase()+type.slice(1)+' '+(clips.length+1),
      start:nextStart(track),duration:type==='audio'?5:4,
      color:colorFor(type),effect:'none',transition:'fade',opacity:1,
      x:0,y:0,scale:1,rotation:0,elements:[],...extra};
    clips.push(c);selectedClip=c.id;selectedEl=null;render();markUnsaved();return c;
  }
  function importMedia(kind){pendingType=kind;fileInput.accept=kind+'/*';fileInput.value='';fileInput.click();}
  fileInput.onchange=e=>{
    const f=e.target.files[0]; if(!f||!pendingType)return;
    const url=URL.createObjectURL(f);
    const c=makeClip(pendingType,{name:f.name,mediaUrl:url});
    mediaURLs[c.id]=url;
    if(pendingType==='video'){
      const v=document.createElement('video');v.src=url;v.onloadedmetadata=()=>{c.duration=Math.max(0.5,Math.round(v.duration*10)/10);render();markUnsaved();};
    }else if(pendingType==='audio'){
      const a=document.createElement('audio');a.src=url;a.onloadedmetadata=()=>{c.duration=Math.max(0.5,Math.round(a.duration*10)/10);render();markUnsaved();};
    }
    pendingType=null;
  };

  function addElement(kind){
    const c=clips.find(x=>x.id===selectedClip);
    if(!c){alert('Select or add a clip first, then add text/shape onto it.');return;}
    const el={id:uid(),kind,
      text:kind==='text'?'Double-click to edit':'',
      x:STAGE_W/2-150,y:STAGE_H/2-40,w:300,h:80,
      color:kind==='text'?'#ffffff':'#3b82f6',fontSize:48,rotation:0,opacity:1};
    c.elements.push(el);selectedEl=el.id;render();markUnsaved();
  }

  function renderRuler(){
    const dur=duration();ruler.innerHTML='';ruler.style.width=(dur*PX+60)+'px';
    for(let s=0;s<=Math.ceil(dur);s++){const tk=document.createElement('div');tk.className='tick';tk.style.left=(s*PX)+'px';tk.textContent=s+'s';ruler.appendChild(tk);}
  }
  function renderTracks(){
    const dur=duration();
    tracks.querySelectorAll('.ve-clip').forEach(e=>e.remove());
    tracks.querySelectorAll('.ve-track').forEach(tr=>tr.style.width=(dur*PX+60)+'px');
    clips.forEach(c=>{
      const track=tracks.querySelector(`.ve-track[data-track="${TRACK_OF[c.type]}"]`);
      const el=document.createElement('div');
      el.className='ve-clip'+(c.id===selectedClip?' selected':'');
      el.style.left=(c.start*PX)+'px';el.style.width=Math.max(20,c.duration*PX)+'px';
      el.style.background=c.color||colorFor(c.type);
      el.innerHTML=`<div class="ve-trim l"></div>${escapeHtml(c.name)} (${(+c.duration||0).toFixed(1)}s)<div class="ve-trim r"></div>`;
      attachClipDrag(el,c);
      track.appendChild(el);
    });
    playhead.style.left=(t*PX)+'px';
  }
  function attachClipDrag(el,c){
    el.querySelector('.ve-trim.l').onmousedown=e=>startTrim(e,c,'l');
    el.querySelector('.ve-trim.r').onmousedown=e=>startTrim(e,c,'r');
    el.onmousedown=e=>{
      if(e.target.classList.contains('ve-trim'))return;
      selectedClip=c.id;selectedEl=null;
      const sx=e.clientX,orig=c.start;el.style.cursor='grabbing';
      let moved=false;
      const mv=ev=>{moved=true;c.start=Math.max(0,Math.round((orig+(ev.clientX-sx)/PX)*10)/10);renderTracks();updateInspector();};
      const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);el.style.cursor='grab';render();if(moved)markUnsaved();};
      document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
    };
  }
  function startTrim(e,c,side){
    e.stopPropagation();selectedClip=c.id;
    const sx=e.clientX,os=c.start,od=c.duration;
    const mv=ev=>{const dx=(ev.clientX-sx)/PX;
      if(side==='r'){c.duration=Math.max(0.3,Math.round((od+dx)*10)/10);}
      else{const ns=Math.max(0,Math.round((os+dx)*10)/10);const delta=ns-os;if(od-delta>0.3){c.start=ns;c.duration=Math.round((od-delta)*10)/10;}}
      renderTracks();updateInspector();};
    const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);render();markUnsaved();};
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  }

  function activeClips(){return clips.filter(c=>t>=c.start&&t<c.start+c.duration);}
  function fadeAlpha(c){
    const span=Math.min(0.6,c.duration/2);
    const into=Math.min(1,(t-c.start)/span);
    const outo=Math.min(1,((c.start+c.duration)-t)/span);
    const base=(c.opacity==null?1:c.opacity);
    return c.transition==='fade'?base*Math.min(into,outo):base;
  }
  function filterFor(eff){return {none:'',grayscale:'grayscale(1)',sepia:'sepia(1)',blur:'blur(4px)',vignette:'contrast(.9) brightness(.8)',saturate:'saturate(1.8)'}[eff]||'';}
  function updatePreview(){
    timeLbl.textContent=t.toFixed(1)+'s';durLbl.textContent=duration().toFixed(1)+'s';playhead.style.left=(t*PX)+'px';
    const visual=activeClips().filter(c=>c.type!=='audio');
    stage.querySelectorAll('.ve-clip-layer').forEach(e=>e.remove());
    placeholder.style.display=clips.length?'none':'flex';
    if(clips.length&&!visual.length){placeholder.style.display='flex';placeholder.textContent='Gap at '+t.toFixed(1)+'s';}
    const order={color:0,video:1,image:2,rect:3,ellipse:3,text:4};
    visual.sort((a,b)=>(order[a.type]||0)-(order[b.type]||0));
    visual.forEach(c=>{
      const layer=document.createElement('div');layer.className='ve-clip-layer';
      layer.style.opacity=fadeAlpha(c);layer.style.filter=filterFor(c.effect);
      if(c.type==='video'&&(mediaURLs[c.id]||c.mediaUrl)){
        layer.appendChild(getMediaEl(c,'video'));
      }else if(c.type==='image'&&(mediaURLs[c.id]||c.mediaUrl)){
        const img=document.createElement('img');img.src=mediaURLs[c.id]||c.mediaUrl;layer.appendChild(img);
      }else if(c.type==='video'||c.type==='image'){
        const ph=document.createElement('div');ph.className='ve-fill';ph.style.display='flex';ph.style.alignItems='center';ph.style.justifyContent='center';ph.style.background='#1f2937';ph.style.color='#94a3b8';ph.style.fontSize='14px';ph.textContent=c.type+' — re-import media to preview';layer.appendChild(ph);
      }else if(c.type==='color'){
        const fill=document.createElement('div');fill.className='ve-fill';fill.style.background=c.color||'#000';layer.appendChild(fill);
      }
      (c.elements||[]).forEach(el=>layer.appendChild(renderElement(c,el)));
      stage.appendChild(layer);
    });
  }
  function getMediaEl(c,tag){
    let m=mediaEls[c.id];
    if(!m){m=document.createElement(tag);m.src=mediaURLs[c.id]||c.mediaUrl;m.muted=(tag==='video');m.playsInline=true;mediaEls[c.id]=m;}
    const local=Math.min(c.duration,t-c.start);
    if(!playing&&Math.abs(m.currentTime-local)>0.15){try{m.currentTime=local;}catch(e){}}
    return m;
  }
  function renderElement(c,el){
    const node=document.createElement('div');
    node.className='ve-el '+el.kind+(el.id===selectedEl?' selected':'');
    node.style.left=el.x+'px';node.style.top=el.y+'px';
    node.style.width=el.w+'px';node.style.height=el.h+'px';
    node.style.opacity=(el.opacity==null?1:el.opacity);
    node.style.transform=`rotate(${el.rotation||0}deg)`;
    if(el.kind==='text'){node.style.color=el.color;node.style.fontSize=(el.fontSize||48)+'px';node.textContent=el.text;}
    else{node.style.background=el.color;}
    node.onmousedown=e=>startElDrag(e,c,el,false);
    const handle=document.createElement('div');handle.className='ve-handle';handle.onmousedown=e=>startElDrag(e,c,el,true);node.appendChild(handle);
    node.ondblclick=()=>{if(el.kind==='text'){const v=prompt('Text:',el.text);if(v!=null){el.text=v;render();markUnsaved();}}};
    return node;
  }
  function startElDrag(e,c,el,resize){
    e.stopPropagation();selectedClip=c.id;selectedEl=el.id;
    const sx=e.clientX,sy=e.clientY,ox=el.x,oy=el.y,ow=el.w,oh=el.h;
    const rect=stage.getBoundingClientRect();const k=STAGE_W/rect.width;
    const mv=ev=>{const dx=(ev.clientX-sx)*k,dy=(ev.clientY-sy)*k;
      if(resize){el.w=Math.max(20,ow+dx);el.h=Math.max(20,oh+dy);}
      else{el.x=ox+dx;el.y=oy+dy;}
      updatePreview();updateInspector();};
    const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);render();markUnsaved();};
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  }

  function updateInspector(){
    const c=clips.find(x=>x.id===selectedClip);
    if(!c){inspector.innerHTML='<h4>Inspector</h4><p class="ve-empty-note">Select a clip to edit timing, transform, effects and its elements.</p>';return;}
    const el=(c.elements||[]).find(x=>x.id===selectedEl);
    inspector.innerHTML=`
      <h4>${escapeHtml(c.name)}</h4>
      <label>Name<input id="i_name" value="${escapeHtml(c.name)}"></label>
      <div class="ve-row2"><label>Start (s)<input id="i_start" type="number" min="0" step=".1" value="${c.start}"></label><label>Duration (s)<input id="i_dur" type="number" min=".3" step=".1" value="${c.duration}"></label></div>
      ${c.type==='color'?`<label>Color<input id="i_color" type="color" value="${c.color||'#000000'}"></label>`:''}
      <label>Opacity<input id="i_op" type="range" min="0" max="1" step=".05" value="${c.opacity==null?1:c.opacity}"></label>
      <label>Transition<select id="i_trans"><option ${c.transition==='cut'?'selected':''}>cut</option><option ${c.transition==='fade'?'selected':''}>fade</option></select></label>
      <label>Effect<select id="i_eff">${['none','grayscale','sepia','blur','vignette','saturate'].map(o=>`<option ${c.effect===o?'selected':''}>${o}</option>`).join('')}</select></label>
      <div class="ve-sub">Elements on this clip</div>
      <div class="ve-mini"><button id="i_addtext">+ Text</button><button id="i_addrect">+ Rect</button><button id="i_addell">+ Ellipse</button></div>
      <div class="ve-ellist" id="i_ellist"></div>
      ${el?`
      <div class="ve-sub">Selected element</div>
      ${el.kind==='text'?`<label>Text<textarea id="e_text" rows="2">${escapeHtml(el.text||'')}</textarea></label>`:''}
      <div class="ve-row2"><label>X<input id="e_x" type="number" value="${Math.round(el.x)}"></label><label>Y<input id="e_y" type="number" value="${Math.round(el.y)}"></label></div>
      <div class="ve-row2"><label>W<input id="e_w" type="number" value="${Math.round(el.w)}"></label><label>H<input id="e_h" type="number" value="${Math.round(el.h)}"></label></div>
      ${el.kind==='text'?`<label>Font size<input id="e_fs" type="number" value="${el.fontSize||48}"></label>`:''}
      <label>Color<input id="e_color" type="color" value="${el.color||'#ffffff'}"></label>
      <div class="ve-row2"><label>Rotation<input id="e_rot" type="number" value="${el.rotation||0}"></label><label>Opacity<input id="e_op" type="range" min="0" max="1" step=".05" value="${el.opacity==null?1:el.opacity}"></label></div>
      <div class="ve-mini"><button id="e_del">Delete element</button></div>
      `:''}
    `;
    bind('#i_name','input',v=>c.name=v,true);
    bind('#i_start','input',v=>c.start=Math.max(0,+v));
    bind('#i_dur','input',v=>c.duration=Math.max(.3,+v));
    bind('#i_color','input',v=>c.color=v);
    bind('#i_op','input',v=>c.opacity=+v);
    bind('#i_trans','change',v=>c.transition=v);
    bind('#i_eff','change',v=>c.effect=v);
    const addtext=$('#i_addtext'),addrect=$('#i_addrect'),addell=$('#i_addell');
    if(addtext)addtext.onclick=()=>addElement('text');
    if(addrect)addrect.onclick=()=>addElement('rect');
    if(addell)addell.onclick=()=>addElement('ellipse');
    renderElList(c);
    if(el){
      bind('#e_text','input',v=>el.text=v,true);
      bind('#e_x','input',v=>el.x=+v);bind('#e_y','input',v=>el.y=+v);
      bind('#e_w','input',v=>el.w=+v);bind('#e_h','input',v=>el.h=+v);
      bind('#e_fs','input',v=>el.fontSize=+v);
      bind('#e_color','input',v=>el.color=v);
      bind('#e_rot','input',v=>el.rotation=+v);
      bind('#e_op','input',v=>el.opacity=+v);
      const del=$('#e_del');if(del)del.onclick=()=>{c.elements=c.elements.filter(x=>x.id!==el.id);selectedEl=null;render();markUnsaved();};
    }
  }
  function renderElList(c){
    const list=$('#i_ellist');if(!list)return;list.innerHTML='';
    if(!c.elements||!c.elements.length){list.innerHTML='<span class="ve-empty-note">No elements yet.</span>';return;}
    c.elements.forEach(el=>{
      const row=document.createElement('div');row.className='ve-elitem'+(el.id===selectedEl?' sel':'');
      row.innerHTML=`<span>${el.kind==='text'?('“'+escapeHtml(el.text||'')+'”'):el.kind}</span><button title="Delete">✕</button>`;
      row.querySelector('span').onclick=()=>{selectedEl=el.id;render();};
      row.querySelector('button').onclick=e=>{e.stopPropagation();c.elements=c.elements.filter(x=>x.id!==el.id);selectedEl=null;render();markUnsaved();};
      list.appendChild(row);
    });
  }
  function bind(sel,evt,fn,light){const node=$(sel);if(!node)return;node.addEventListener(evt,()=>{fn(node.value);light?renderTracks():render();markUnsaved();});}

  function render(){renderRuler();renderTracks();updatePreview();updateInspector();}

  function syncMedia(){
    const active=new Set(activeClips().map(c=>c.id));
    Object.entries(mediaEls).forEach(([id,m])=>{
      const c=clips.find(x=>x.id===id);
      if(playing&&c&&active.has(id)){const local=t-c.start;if(Math.abs(m.currentTime-local)>0.3){try{m.currentTime=Math.max(0,local);}catch(e){}}m.play().catch(()=>{});}
      else{m.pause();}
    });
  }
  function loop(ts){
    if(!playing)return;
    if(!loop.last)loop.last=ts;
    t+=(ts-loop.last)/1000;loop.last=ts;
    if(t>=duration()){playing=false;t=0;loop.last=0;Object.values(mediaEls).forEach(m=>m.pause());updatePreview();return;}
    updatePreview();syncMedia();raf=requestAnimationFrame(loop);
  }
  $('#vePlay').onclick=()=>{if(playing)return;playing=true;loop.last=0;syncMedia();raf=requestAnimationFrame(loop);};
  $('#vePause').onclick=()=>{playing=false;cancelAnimationFrame(raf);Object.values(mediaEls).forEach(m=>m.pause());};
  $('#veStop').onclick=()=>{playing=false;cancelAnimationFrame(raf);t=0;Object.values(mediaEls).forEach(m=>{m.pause();try{m.currentTime=0;}catch(e){}});updatePreview();};

  $('#veAddVideo').onclick=()=>importMedia('video');
  $('#veAddImage').onclick=()=>importMedia('image');
  $('#veAddAudio').onclick=()=>importMedia('audio');
  $('#veAddColor').onclick=()=>makeClip('color',{color:'#1e293b'});
  $('#veAddText').onclick=()=>{if(!clips.length)makeClip('color',{color:'#000000',name:'Background'});addElement('text');};
  $('#veAddRect').onclick=()=>{if(!clips.length)makeClip('color',{color:'#000000',name:'Background'});addElement('rect');};
  $('#veSplit').onclick=()=>{const c=clips.find(x=>x.id===selectedClip);if(c&&c.duration>0.6){const half=Math.round((c.duration/2)*10)/10;const right={...c,id:uid(),name:c.name+' (2)',start:Math.round((c.start+half)*10)/10,duration:Math.round((c.duration-half)*10)/10,elements:(c.elements||[]).map(e=>({...e,id:uid()}))};if(mediaURLs[c.id])mediaURLs[right.id]=mediaURLs[c.id];c.duration=half;clips.push(right);selectedClip=right.id;render();markUnsaved();}};
  $('#veDup').onclick=()=>{const c=clips.find(x=>x.id===selectedClip);if(c){const copy={...c,id:uid(),name:c.name+' copy',start:Math.round((c.start+c.duration)*10)/10,elements:(c.elements||[]).map(e=>({...e,id:uid()}))};if(mediaURLs[c.id])mediaURLs[copy.id]=mediaURLs[c.id];clips.push(copy);selectedClip=copy.id;render();markUnsaved();}};
  $('#veDelete').onclick=()=>{if(selectedEl){const c=clips.find(x=>x.id===selectedClip);if(c){c.elements=c.elements.filter(e=>e.id!==selectedEl);selectedEl=null;render();markUnsaved();return;}}clips=clips.filter(c=>c.id!==selectedClip);selectedClip=null;selectedEl=null;render();markUnsaved();};
  $('#veExport').onclick=()=>downloadBlob(new Blob([JSON.stringify({title:file.name,duration:duration(),clips:clips.map(({mediaUrl,...c})=>c)},null,2)],{type:'application/json'}),(file.name||'video')+'.project.json');
  $('#veBack').onclick=()=>{playing=false;cancelAnimationFrame(raf);Object.values(mediaEls).forEach(m=>m.pause());save();closeEditor('videoEditor');};
  titleInput.oninput=markUnsaved;

  ruler.onclick=e=>{t=Math.max(0,Math.min(duration(),e.offsetX/PX));playing=false;updatePreview();syncMedia();};
  stage.addEventListener('mousedown',e=>{if(e.target===stage||e.target===placeholder){selectedEl=null;updateInspector();renderTracks();updatePreview();}});

  render();
}
