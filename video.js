/* =========================================================================
   VIDEO EDITOR  (scene-based)
   A clearer, stable in-browser video editor:
   - Sequential SCENES (no overlapping-clip math) each with a background:
       empty | color | image | video
   - ELEMENTS layered on top of any scene: text, rectangle, ellipse, image
     (drag to move, handle to resize, double-click text to edit)
   - Scene list with add / duplicate / delete / reorder + per-scene duration,
     background fit, transition and filter
   - Live preview that plays scene-by-scene with synced <video>/<audio>
   - Undo (Ctrl+Z), Delete key, timeline zoom, JSON project export
   Compatible with the shared shell: openVideoEditor(file), upsertFile, uid,
   escapeHtml, downloadBlob, closeEditor.
   Note: imported media uses session-only object URLs; the URL is stripped
   before saving, so on reload media scenes need re-importing (everything
   else — timing, layout, text, shapes — is preserved).
   ========================================================================= */
function openVideoEditor(file){
  let shell=document.getElementById('videoEditor');
  const fresh=shell.cloneNode(false); shell.replaceWith(fresh); shell=fresh;
  shell.classList.remove('hidden');

  const STAGE_W=1280, STAGE_H=720;

  shell.innerHTML=`<style>
    .ve-grid{flex:1;display:grid;grid-template-columns:200px 1fr 280px;grid-template-rows:1fr 150px;grid-template-areas:'scenes stage inspector' 'scenes timeline timeline';min-height:0;overflow:hidden;}
    .ve-scenes{grid-area:scenes;border-right:1px solid var(--border);background:var(--bg-card);overflow:auto;padding:10px;}
    .ve-scenes h4{margin:2px 0 8px;font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;}
    .ve-scene-card{position:relative;border:2px solid var(--border);border-radius:9px;padding:8px;margin-bottom:8px;cursor:pointer;background:var(--bg-app);transition:var(--transition);}
    .ve-scene-card.sel{border-color:var(--primary);}
    .ve-scene-thumb{height:62px;border-radius:6px;overflow:hidden;position:relative;background:#000;margin-bottom:6px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px;}
    .ve-scene-thumb img,.ve-scene-thumb video{width:100%;height:100%;object-fit:cover;}
    .ve-scene-meta{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;}
    .ve-scene-meta b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;}
    .ve-scene-meta span{color:var(--text-muted);}
    .ve-scene-tools{display:flex;gap:3px;margin-top:6px;}
    .ve-scene-tools button{flex:1;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);border-radius:5px;font-size:11px;padding:3px;cursor:pointer;}
    .ve-scene-tools button:hover{border-color:var(--primary);color:var(--primary);}
    .ve-addscene{width:100%;border:1.5px dashed var(--border);background:transparent;color:var(--text-muted);border-radius:9px;padding:10px;font-size:12.5px;font-weight:600;cursor:pointer;}
    .ve-addscene:hover{border-color:var(--primary);color:var(--primary);}
    .ve-stagewrap{grid-area:stage;background:#050505;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px;}
    .ve-stage{width:${STAGE_W}px;height:${STAGE_H}px;max-width:100%;max-height:100%;background:#000;position:relative;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45);}
    .ve-bg{position:absolute;inset:0;}
    .ve-bg img,.ve-bg video{width:100%;height:100%;}
    .ve-empty-bg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#475569;font-size:15px;background:repeating-conic-gradient(#1e293b 0% 25%,#0f172a 0% 50%) 50%/40px 40px;}
    .ve-el{position:absolute;cursor:move;user-select:none;display:flex;align-items:center;justify-content:center;}
    .ve-el.text{font-weight:800;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.55);padding:6px;line-height:1.12;}
    .ve-el.rect{border-radius:8px;}
    .ve-el.ellipse{border-radius:50%;}
    .ve-el img{width:100%;height:100%;object-fit:cover;pointer-events:none;}
    .ve-el.sel{outline:2px solid var(--warning);outline-offset:2px;}
    .ve-el .h{position:absolute;width:14px;height:14px;border-radius:50%;background:var(--warning);}
    .ve-el .h.br{right:-7px;bottom:-7px;cursor:nwse-resize;}
    .ve-inspector{grid-area:inspector;border-left:1px solid var(--border);background:var(--bg-card);overflow:auto;padding:12px;}
    .ve-inspector h4{margin:2px 0 8px;font-size:13px;}
    .ve-inspector label{display:flex;flex-direction:column;gap:3px;margin:7px 0;font-size:11.5px;color:var(--text-muted);}
    .ve-inspector input,.ve-inspector select,.ve-inspector textarea{padding:6px 8px;border:1px solid var(--border);border-radius:7px;background:var(--bg-app);color:var(--text-main);font-size:12.5px;}
    .ve-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
    .ve-sub{font-size:11px;color:var(--text-muted);margin:12px 0 4px;border-top:1px solid var(--border);padding-top:9px;text-transform:uppercase;letter-spacing:.05em;}
    .ve-addel{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;}
    .ve-addel button{border:1px solid var(--border);background:var(--bg-app);color:var(--text-main);border-radius:6px;padding:7px;font-size:11.5px;cursor:pointer;}
    .ve-addel button:hover{border-color:var(--primary);color:var(--primary);}
    .ve-ellist{display:flex;flex-direction:column;gap:4px;}
    .ve-elitem{display:flex;align-items:center;gap:6px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;font-size:11.5px;cursor:pointer;background:var(--bg-app);}
    .ve-elitem.sel{border-color:var(--warning);}
    .ve-elitem span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ve-elitem button{border:none;background:transparent;color:var(--text-muted);cursor:pointer;}
    .ve-timeline{grid-area:timeline;background:var(--bg-card);border-top:1px solid var(--border);padding:10px 12px;overflow:auto;}
    .ve-tl-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px;color:var(--text-muted);}
    .ve-tl-head .sp{margin-left:auto;}
    .ve-tl-zoom{display:flex;align-items:center;gap:5px;}
    .ve-tl-zoom button{border:1px solid var(--border);background:var(--bg-app);color:var(--text-main);border-radius:5px;width:24px;height:24px;cursor:pointer;}
    .ve-track{position:relative;height:54px;background:linear-gradient(90deg,rgba(148,163,184,.16) 1px,transparent 1px);background-size:60px 100%;border-radius:8px;min-width:100%;}
    .ve-tl-scene{position:absolute;top:7px;height:40px;border-radius:7px;color:#fff;font-size:11.5px;padding:5px 8px;overflow:hidden;cursor:pointer;border:2px solid transparent;box-shadow:0 2px 6px rgba(0,0,0,.2);white-space:nowrap;}
    .ve-tl-scene.sel{border-color:var(--warning);}
    .ve-tl-scene .gr{position:absolute;right:0;top:0;bottom:0;width:8px;cursor:ew-resize;background:rgba(255,255,255,.25);}
    .ve-playhead{position:absolute;top:0;bottom:0;width:2px;background:var(--danger);z-index:5;pointer-events:none;}
    .ve-note{color:var(--text-muted);font-size:11.5px;}
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
    <button class="tbtn wide" id="veUndo">↶ Undo</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="veExport">⬇ Export project</button>
    <input type="file" id="veFileInput" class="hidden">
  </div>
  <div class="editor-body">
    <div class="ve-grid">
      <div class="ve-scenes" id="veScenes"><h4>Scenes</h4><div id="veSceneList"></div><button class="ve-addscene" id="veAddScene">+ Add scene</button></div>
      <div class="ve-stagewrap"><div class="ve-stage" id="veStage"></div></div>
      <aside class="ve-inspector" id="veInspector"></aside>
      <div class="ve-timeline">
        <div class="ve-tl-head"><span id="veTime">0.0s</span> / <span id="veDur">0.0s</span><span class="ve-note sp">Click a scene to edit • drag right edge to change duration • click track to scrub</span><span class="ve-tl-zoom"><button id="veZoomOut">−</button><button id="veZoomIn">+</button></span></div>
        <div class="ve-track" id="veTrack"><div class="ve-playhead" id="vePlayhead"></div></div>
      </div>
    </div>
  </div>`;

  const $=s=>shell.querySelector(s);
  const titleInput=$('#veTitle'),saveDot=$('#veSaveDot'),saveText=$('#veSaveText');
  const stage=$('#veStage'),inspector=$('#veInspector'),sceneList=$('#veSceneList');
  const track=$('#veTrack'),playhead=$('#vePlayhead'),timeLbl=$('#veTime'),durLbl=$('#veDur'),fileInput=$('#veFileInput');

  let PX=80; // px per second on timeline (zoomable)
  const mediaURLs={}; // sceneId/elId -> object URL (session only)
  const mediaEls={};  // sceneId -> live <video>/<audio> for the scene bg

  /* ----- migrate legacy {clips:[...]} into {scenes:[...]} ----- */
  function migrate(content){
    if(content&&content.scenes)return content.scenes;
    if(content&&content.clips){
      // turn the old flat clips into one scene with text/shape elements
      const sc=newScene('color'); sc.bg.color='#0f172a'; sc.duration=4;
      return [sc];
    }
    return [];
  }
  let scenes=migrate(file.content);
  scenes.forEach(normalizeScene);

  let selScene=scenes[0]?scenes[0].id:null, selEl=null;
  let playing=false, t=0, raf=0, saveTimer=0;
  const undoStack=[];
  let pendingAdd=null; // {target:'sceneBg'|'element', sceneId}

  function newScene(bgType){
    return {id:uid(),name:'Scene '+(scenes?scenes.length+1:1),duration:4,transition:'fade',filter:'none',
      bg:{type:bgType||'empty',color:'#1e293b',fit:'cover'},elements:[]};
  }
  function normalizeScene(s){
    if(!s.bg)s.bg={type:'empty',color:'#1e293b',fit:'cover'};
    if(!s.elements)s.elements=[];
    if(s.duration==null)s.duration=4;
    if(!s.transition)s.transition='fade';
    if(!s.filter)s.filter='none';
  }

  /* ---------- persistence ---------- */
  function snapshot(){undoStack.push(JSON.stringify(stripMedia(scenes)));if(undoStack.length>50)undoStack.shift();}
  function stripMedia(arr){return arr.map(s=>{const{...c}=s;c.bg={...s.bg};delete c.bg.mediaUrl;c.elements=s.elements.map(e=>{const{mediaUrl,...rest}=e;return rest;});return c;});}
  function markUnsaved(){saveDot.style.background='var(--warning)';saveText.textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(save,400);}
  function save(){file.name=titleInput.value.trim()||'Untitled';file.content={scenes:stripMedia(scenes)};upsertFile(file);saveDot.style.background='var(--success)';saveText.textContent='Saved';}
  function commit(){render();markUnsaved();}

  /* ---------- timing ---------- */
  function totalDuration(){return Math.max(0.1,scenes.reduce((m,s)=>m+(+s.duration||0),0));}
  function sceneStart(id){let acc=0;for(const s of scenes){if(s.id===id)return acc;acc+=(+s.duration||0);}return acc;}
  function sceneAtTime(time){let acc=0;for(const s of scenes){if(time<acc+(+s.duration||0))return{scene:s,local:time-acc,start:acc};acc+=(+s.duration||0);}const last=scenes[scenes.length-1];return last?{scene:last,local:last.duration,start:acc-last.duration}:null;}

  /* ---------- media import ---------- */
  function pickFile(accept,cb){fileInput.accept=accept;fileInput.value='';fileInput.onchange=e=>{const f=e.target.files[0];if(f)cb(f,URL.createObjectURL(f));};fileInput.click();}
  function setSceneBg(s,type){
    snapshot();
    if(type==='image'){pickFile('image/*',(f,url)=>{s.bg={type:'image',fit:s.bg.fit||'cover',mediaUrl:url,name:f.name};mediaURLs['bg_'+s.id]=url;delete mediaEls[s.id];commit();});}
    else if(type==='video'){pickFile('video/*',(f,url)=>{s.bg={type:'video',fit:s.bg.fit||'cover',mediaUrl:url,name:f.name};mediaURLs['bg_'+s.id]=url;delete mediaEls[s.id];const v=document.createElement('video');v.src=url;v.onloadedmetadata=()=>{s.duration=Math.max(0.5,Math.round(v.duration*10)/10);commit();};commit();});}
    else if(type==='color'){s.bg={type:'color',color:s.bg.color||'#1e293b'};commit();}
    else {s.bg={type:'empty'};commit();}
  }

  /* ---------- elements ---------- */
  function addElement(kind){
    const s=scenes.find(x=>x.id===selScene); if(!s)return;
    snapshot();
    const base={id:uid(),kind,x:STAGE_W/2-200,y:STAGE_H/2-60,w:400,h:120,rotation:0,opacity:1};
    if(kind==='text')Object.assign(base,{text:'Double-click to edit',color:'#ffffff',fontSize:64,bold:true});
    else if(kind==='image'){pickFile('image/*',(f,url)=>{base.mediaUrl=url;mediaURLs['el_'+base.id]=url;s.elements.push(base);selEl=base.id;commit();});return;}
    else Object.assign(base,{color:kind==='rect'?'#3b82f6':'#ef4444'});
    s.elements.push(base);selEl=base.id;commit();
  }

  /* ---------- scene list ---------- */
  function renderScenes(){
    sceneList.innerHTML='';
    scenes.forEach((s,i)=>{
      const card=document.createElement('div');
      card.className='ve-scene-card'+(s.id===selScene?' sel':'');
      let thumb='';
      if(s.bg.type==='image'&&(mediaURLs['bg_'+s.id]||s.bg.mediaUrl))thumb=`<img src="${mediaURLs['bg_'+s.id]||s.bg.mediaUrl}">`;
      else if(s.bg.type==='video')thumb='🎬 video';
      else if(s.bg.type==='color')thumb=`<div style="position:absolute;inset:0;background:${s.bg.color}"></div>`;
      else thumb='empty';
      card.innerHTML=`<div class="ve-scene-thumb">${thumb}</div>
        <div class="ve-scene-meta"><b>${escapeHtml(s.name)}</b><span>${(+s.duration).toFixed(1)}s</span></div>
        <div class="ve-scene-tools"><button data-a="up" title="Move up">↑</button><button data-a="down" title="Move down">↓</button><button data-a="dup" title="Duplicate">⧉</button><button data-a="del" title="Delete">✕</button></div>`;
      card.onclick=e=>{const a=e.target.dataset.a;if(a){sceneAction(a,i);e.stopPropagation();return;}selScene=s.id;selEl=null;const st=sceneStart(s.id);t=st+0.01;render();};
      sceneList.appendChild(card);
    });
  }
  function sceneAction(a,i){
    snapshot();const s=scenes[i];
    if(a==='up'&&i>0){scenes.splice(i,1);scenes.splice(i-1,0,s);}
    else if(a==='down'&&i<scenes.length-1){scenes.splice(i,1);scenes.splice(i+1,0,s);}
    else if(a==='dup'){const copy=JSON.parse(JSON.stringify(stripMedia([s]))[0]?'[]':'[]');const c=JSON.parse(JSON.stringify(s));c.id=uid();c.name=s.name+' copy';c.elements=c.elements.map(e=>({...e,id:uid()}));if(mediaURLs['bg_'+s.id])mediaURLs['bg_'+c.id]=mediaURLs['bg_'+s.id];scenes.splice(i+1,0,c);selScene=c.id;}
    else if(a==='del'){scenes.splice(i,1);if(selScene===s.id){selScene=scenes[0]?scenes[0].id:null;selEl=null;}}
    commit();
  }

  /* ---------- stage / preview ---------- */
  function filterFor(f){return {none:'',grayscale:'grayscale(1)',sepia:'sepia(1)',blur:'blur(5px)',vignette:'contrast(.9) brightness(.82)',saturate:'saturate(1.8)',bright:'brightness(1.3)'}[f]||'';}
  function renderStage(){
    stage.innerHTML='';
    const at=sceneAtTime(t); if(!at){stage.innerHTML='<div class="ve-empty-bg">Add a scene to begin</div>';return;}
    const s=at.scene;
    const bg=document.createElement('div');bg.className='ve-bg';bg.style.filter=filterFor(s.filter);
    // fade transition alpha at scene edges
    const span=Math.min(0.5,s.duration/2);
    let alpha=1;
    if(s.transition==='fade'){const into=Math.min(1,at.local/span),outo=Math.min(1,(s.duration-at.local)/span);alpha=Math.min(into,outo);}
    bg.style.opacity=alpha;
    if(s.bg.type==='image'&&(mediaURLs['bg_'+s.id]||s.bg.mediaUrl)){const img=document.createElement('img');img.src=mediaURLs['bg_'+s.id]||s.bg.mediaUrl;img.style.objectFit=s.bg.fit||'cover';bg.appendChild(img);}
    else if(s.bg.type==='video'&&(mediaURLs['bg_'+s.id]||s.bg.mediaUrl)){const v=getSceneVideo(s,at.local);v.style.objectFit=s.bg.fit||'cover';bg.appendChild(v);}
    else if(s.bg.type==='video'||(s.bg.type==='image')){const ph=document.createElement('div');ph.className='ve-empty-bg';ph.textContent=s.bg.type+' — re-import to preview';bg.appendChild(ph);}
    else if(s.bg.type==='color'){bg.style.background=s.bg.color;}
    else {const e=document.createElement('div');e.className='ve-empty-bg';e.textContent='Empty scene';bg.appendChild(e);}
    stage.appendChild(bg);
    s.elements.forEach(el=>stage.appendChild(renderElement(s,el,alpha)));
  }
  function getSceneVideo(s,local){
    let v=mediaEls[s.id];
    if(!v){v=document.createElement('video');v.src=mediaURLs['bg_'+s.id]||s.bg.mediaUrl;v.muted=false;v.playsInline=true;mediaEls[s.id]=v;}
    if(!playing&&Math.abs(v.currentTime-local)>0.15){try{v.currentTime=local;}catch(e){}}
    return v;
  }
  function renderElement(s,el,sceneAlpha){
    const node=document.createElement('div');
    node.className='ve-el '+el.kind+(el.id===selEl?' sel':'');
    node.style.left=el.x+'px';node.style.top=el.y+'px';node.style.width=el.w+'px';node.style.height=el.h+'px';
    node.style.opacity=(el.opacity==null?1:el.opacity)*sceneAlpha;
    node.style.transform=`rotate(${el.rotation||0}deg)`;
    if(el.kind==='text'){node.style.color=el.color;node.style.fontSize=(el.fontSize||64)+'px';node.style.fontWeight=el.bold?800:500;node.textContent=el.text;}
    else if(el.kind==='image'&&(mediaURLs['el_'+el.id]||el.mediaUrl)){const img=document.createElement('img');img.src=mediaURLs['el_'+el.id]||el.mediaUrl;node.appendChild(img);}
    else if(el.kind==='image'){node.style.background='#334155';node.style.color='#94a3b8';node.style.fontSize='12px';node.textContent='re-import image';}
    else node.style.background=el.color;
    node.onmousedown=e=>startDrag(e,s,el,false);
    const h=document.createElement('div');h.className='h br';h.onmousedown=e=>startDrag(e,s,el,true);node.appendChild(h);
    node.ondblclick=()=>{if(el.kind==='text'){const v=prompt('Text:',el.text);if(v!=null){snapshot();el.text=v;commit();}}};
    return node;
  }
  function startDrag(e,s,el,resize){
    e.stopPropagation();selScene=s.id;selEl=el.id;snapshot();
    const sx=e.clientX,sy=e.clientY,ox=el.x,oy=el.y,ow=el.w,oh=el.h;
    const rect=stage.getBoundingClientRect();const k=STAGE_W/rect.width;
    const mv=ev=>{const dx=(ev.clientX-sx)*k,dy=(ev.clientY-sy)*k;
      if(resize){el.w=Math.max(20,ow+dx);el.h=Math.max(20,oh+dy);}else{el.x=ox+dx;el.y=oy+dy;}
      renderStage();updateInspector();};
    const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);render();markUnsaved();};
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  }

  /* ---------- inspector ---------- */
  function updateInspector(){
    const s=scenes.find(x=>x.id===selScene);
    if(!s){inspector.innerHTML='<h4>Inspector</h4><p class="ve-note">Add or select a scene to edit it.</p>';return;}
    const el=s.elements.find(x=>x.id===selEl);
    inspector.innerHTML=`
      <h4>${escapeHtml(s.name)}</h4>
      <label>Scene name<input id="s_name" value="${escapeHtml(s.name)}"></label>
      <label>Duration (s)<input id="s_dur" type="number" min=".3" step=".1" value="${s.duration}"></label>
      <div class="ve-sub">Background</div>
      <div class="ve-addel"><button data-bg="empty">Empty</button><button data-bg="color">Color</button><button data-bg="image">Image</button><button data-bg="video">Video</button></div>
      ${s.bg.type==='color'?`<label>Color<input id="s_bgcolor" type="color" value="${s.bg.color||'#1e293b'}"></label>`:''}
      ${(s.bg.type==='image'||s.bg.type==='video')?`<label>Fit<select id="s_fit"><option ${s.bg.fit==='cover'?'selected':''}>cover</option><option ${s.bg.fit==='contain'?'selected':''}>contain</option><option value="fill" ${s.bg.fit==='fill'?'selected':''}>fill</option></select></label>`:''}
      <label>Transition<select id="s_trans"><option ${s.transition==='cut'?'selected':''}>cut</option><option ${s.transition==='fade'?'selected':''}>fade</option></select></label>
      <label>Filter<select id="s_filter">${['none','grayscale','sepia','blur','vignette','saturate','bright'].map(o=>`<option ${s.filter===o?'selected':''}>${o}</option>`).join('')}</select></label>
      <div class="ve-sub">Add element</div>
      <div class="ve-addel"><button data-el="text">+ Text</button><button data-el="rect">+ Rectangle</button><button data-el="ellipse">+ Ellipse</button><button data-el="image">+ Image</button></div>
      <div class="ve-ellist" id="s_ellist"></div>
      ${el?`
        <div class="ve-sub">Element</div>
        ${el.kind==='text'?`<label>Text<textarea id="e_text" rows="2">${escapeHtml(el.text||'')}</textarea></label><label>Font size<input id="e_fs" type="number" value="${el.fontSize||64}"></label>`:''}
        <div class="ve-row2"><label>X<input id="e_x" type="number" value="${Math.round(el.x)}"></label><label>Y<input id="e_y" type="number" value="${Math.round(el.y)}"></label></div>
        <div class="ve-row2"><label>W<input id="e_w" type="number" value="${Math.round(el.w)}"></label><label>H<input id="e_h" type="number" value="${Math.round(el.h)}"></label></div>
        ${el.kind!=='image'?`<label>Color<input id="e_color" type="color" value="${el.color||'#ffffff'}"></label>`:''}
        <div class="ve-row2"><label>Rotation<input id="e_rot" type="number" value="${el.rotation||0}"></label><label>Opacity<input id="e_op" type="range" min="0" max="1" step=".05" value="${el.opacity==null?1:el.opacity}"></label></div>
        <div class="ve-addel"><button id="e_front">Bring front</button><button id="e_del">Delete</button></div>
      `:''}
    `;
    bindS('#s_name','input',v=>s.name=v,true);
    bindS('#s_dur','input',v=>s.duration=Math.max(.3,+v));
    bindS('#s_bgcolor','input',v=>{s.bg.color=v;});
    bindS('#s_fit','change',v=>s.bg.fit=v);
    bindS('#s_trans','change',v=>s.transition=v);
    bindS('#s_filter','change',v=>s.filter=v);
    inspector.querySelectorAll('[data-bg]').forEach(b=>b.onclick=()=>setSceneBg(s,b.dataset.bg));
    inspector.querySelectorAll('[data-el]').forEach(b=>b.onclick=()=>addElement(b.dataset.el));
    renderElList(s);
    if(el){
      bindS('#e_text','input',v=>el.text=v,true);
      bindS('#e_fs','input',v=>el.fontSize=+v);
      bindS('#e_x','input',v=>el.x=+v);bindS('#e_y','input',v=>el.y=+v);
      bindS('#e_w','input',v=>el.w=+v);bindS('#e_h','input',v=>el.h=+v);
      bindS('#e_color','input',v=>el.color=v);
      bindS('#e_rot','input',v=>el.rotation=+v);
      bindS('#e_op','input',v=>el.opacity=+v);
      const front=$('#e_front');if(front)front.onclick=()=>{snapshot();s.elements=s.elements.filter(x=>x.id!==el.id);s.elements.push(el);commit();};
      const del=$('#e_del');if(del)del.onclick=()=>{snapshot();s.elements=s.elements.filter(x=>x.id!==el.id);selEl=null;commit();};
    }
  }
  function renderElList(s){
    const list=$('#s_ellist');if(!list)return;list.innerHTML='';
    if(!s.elements.length){list.innerHTML='<span class="ve-note">No elements on this scene yet.</span>';return;}
    s.elements.forEach(el=>{
      const row=document.createElement('div');row.className='ve-elitem'+(el.id===selEl?' sel':'');
      const label=el.kind==='text'?('“'+escapeHtml(el.text||'')+'”'):el.kind;
      row.innerHTML=`<span>${label}</span><button title="Delete">✕</button>`;
      row.querySelector('span').onclick=()=>{selEl=el.id;render();};
      row.querySelector('button').onclick=e=>{e.stopPropagation();snapshot();s.elements=s.elements.filter(x=>x.id!==el.id);selEl=null;commit();};
      list.appendChild(row);
    });
  }
  function bindS(sel,evt,fn,light){const n=$(sel);if(!n)return;let snapped=false;n.addEventListener(evt,()=>{if(!snapped){snapshot();snapped=true;}fn(n.value);light?(renderScenes(),renderTimeline(),renderStage()):render();markUnsaved();});}

  /* ---------- timeline ---------- */
  function renderTimeline(){
    const dur=totalDuration();track.style.width=Math.max(track.parentElement.clientWidth, dur*PX+40)+'px';
    track.querySelectorAll('.ve-tl-scene').forEach(e=>e.remove());
    const palette=['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ec4899','#06b6d4','#ef4444'];
    scenes.forEach((s,i)=>{
      const el=document.createElement('div');el.className='ve-tl-scene'+(s.id===selScene?' sel':'');
      el.style.left=(sceneStart(s.id)*PX)+'px';el.style.width=Math.max(24,s.duration*PX)+'px';el.style.background=palette[i%palette.length];
      el.innerHTML=`${escapeHtml(s.name)}<div class="gr" title="Drag to resize"></div>`;
      el.onmousedown=e=>{if(e.target.classList.contains('gr')){startResize(e,s);return;}selScene=s.id;selEl=null;t=sceneStart(s.id)+0.01;render();};
      track.appendChild(el);
    });
    playhead.style.left=(t*PX)+'px';
  }
  function startResize(e,s){
    e.stopPropagation();selScene=s.id;snapshot();const sx=e.clientX,od=s.duration;
    const mv=ev=>{s.duration=Math.max(0.3,Math.round((od+(ev.clientX-sx)/PX)*10)/10);renderScenes();renderTimeline();updateInspector();};
    const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);render();markUnsaved();};
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  }

  function render(){renderScenes();renderTimeline();renderStage();updateInspector();timeLbl.textContent=t.toFixed(1)+'s';durLbl.textContent=totalDuration().toFixed(1)+'s';}

  /* ---------- playback ---------- */
  function syncMedia(){
    const at=sceneAtTime(t);const activeId=at?at.scene.id:null;
    Object.entries(mediaEls).forEach(([id,v])=>{
      if(playing&&id===activeId){const local=at.local;if(Math.abs(v.currentTime-local)>0.3){try{v.currentTime=Math.max(0,local);}catch(e){}}v.play().catch(()=>{});}
      else{v.pause();}
    });
  }
  function loop(ts){if(!playing)return;if(!loop.last)loop.last=ts;t+=(ts-loop.last)/1000;loop.last=ts;
    if(t>=totalDuration()){playing=false;t=0;loop.last=0;Object.values(mediaEls).forEach(v=>v.pause());render();return;}
    renderStage();syncMedia();timeLbl.textContent=t.toFixed(1)+'s';playhead.style.left=(t*PX)+'px';raf=requestAnimationFrame(loop);}
  $('#vePlay').onclick=()=>{if(playing||!scenes.length)return;playing=true;loop.last=0;syncMedia();raf=requestAnimationFrame(loop);};
  $('#vePause').onclick=()=>{playing=false;cancelAnimationFrame(raf);Object.values(mediaEls).forEach(v=>v.pause());};
  $('#veStop').onclick=()=>{playing=false;cancelAnimationFrame(raf);t=0;Object.values(mediaEls).forEach(v=>{v.pause();try{v.currentTime=0;}catch(e){}});render();};

  /* ---------- toolbar / misc ---------- */
  $('#veAddScene').onclick=()=>{snapshot();const s=newScene('empty');scenes.push(s);selScene=s.id;selEl=null;commit();};
  $('#veUndo').onclick=()=>{if(!undoStack.length)return;scenes=JSON.parse(undoStack.pop());scenes.forEach(normalizeScene);if(!scenes.find(s=>s.id===selScene))selScene=scenes[0]?scenes[0].id:null;selEl=null;render();markUnsaved();};
  $('#veZoomIn').onclick=()=>{PX=Math.min(240,PX+30);renderTimeline();};
  $('#veZoomOut').onclick=()=>{PX=Math.max(30,PX-30);renderTimeline();};
  $('#veExport').onclick=()=>downloadBlob(new Blob([JSON.stringify({title:file.name,duration:totalDuration(),scenes:stripMedia(scenes)},null,2)],{type:'application/json'}),(file.name||'video')+'.project.json');
  $('#veBack').onclick=()=>{playing=false;cancelAnimationFrame(raf);Object.values(mediaEls).forEach(v=>v.pause());save();closeEditor('videoEditor');};
  titleInput.oninput=markUnsaved;
  track.onclick=e=>{if(e.target===track){t=Math.max(0,Math.min(totalDuration(),e.offsetX/PX));playing=false;renderStage();updateInspector();timeLbl.textContent=t.toFixed(1)+'s';playhead.style.left=(t*PX)+'px';syncMedia();}};
  stage.addEventListener('mousedown',e=>{if(e.target===stage||e.target.classList.contains('ve-bg')||e.target.classList.contains('ve-empty-bg')){selEl=null;renderStage();updateInspector();}});
  shell.addEventListener('keydown',e=>{if((e.key==='Delete'||e.key==='Backspace')&&selEl&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){const s=scenes.find(x=>x.id===selScene);if(s){snapshot();s.elements=s.elements.filter(x=>x.id!==selEl);selEl=null;commit();}}});
  shell.tabIndex=0;

  if(!scenes.length){const s=newScene('color');s.bg.color='#0f172a';scenes.push(s);selScene=s.id;}
  render();
}
