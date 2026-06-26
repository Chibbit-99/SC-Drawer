/* =========================================================================
   SLIDES EDITOR
   Slide list panel + canvas with draggable/resizable text, shape, image elements
   ========================================================================= */
function openSlidesEditor(file){
  let shell = document.getElementById('slidesEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');

  if(!file.content || !file.content.slides || file.content.slides.length === 0){
    file.content = { slides:[makeSlide()], current:0 };
  }

  shell.innerHTML = `
    <style>
      .slides-main{ flex:1; display:flex; overflow:hidden; }
      .slide-panel{ width:200px; background:var(--bg-card); border-right:1px solid var(--border); overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
      .slide-thumb{ position:relative; border:2px solid var(--border); border-radius:8px; background:var(--bg-app); aspect-ratio:16/9; cursor:pointer; overflow:hidden; transition:var(--transition); }
      .slide-thumb:hover{ border-color:var(--primary); }
      .slide-thumb.active{ border-color:var(--primary); box-shadow:0 0 0 2px var(--sheet-tint); }
      .slide-thumb .thumb-num{ position:absolute; bottom:4px; left:4px; font-size:10px; color:var(--text-muted); background:rgba(248,250,252,0.9); padding:2px 4px; border-radius:3px; }
      .slide-thumb .thumb-del{ position:absolute; top:4px; right:4px; width:20px;height:20px;border:none;background:rgba(248,250,252,0.9);border-radius:4px;font-size:11px;display:none;align-items:center;justify-content:center;color:var(--danger);transition:var(--transition); }
      .slide-thumb:hover .thumb-del{ display:flex; }
      .thumb-render{ position:absolute; inset:0; transform-origin:top left; pointer-events:none; }
      .add-slide-btn{ border:1.5px dashed var(--border); background:transparent; border-radius:8px; padding:10px; font-size:12px; color:var(--text-muted); transition:var(--transition); }
      .add-slide-btn:hover{ border-color:var(--primary); color:var(--primary); background:var(--sheet-tint); }

      .slide-canvas-wrap{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--bg-app); overflow:auto; padding:32px; position:relative; }
      .slide-canvas{
        width:960px; height:540px; background:var(--bg-card); position:relative; box-shadow:var(--shadow-lg);
        flex-shrink:0; overflow:hidden; transform-origin:center center; border-radius:4px;
      }
      .slide-el{ position:absolute; cursor:move; user-select:none; }
      .slide-el.selected{ outline:2px solid var(--primary); outline-offset:1px; }
      .slide-el .el-content{ width:100%; height:100%; overflow:hidden; }
      .slide-el[data-kind="text"] .el-content{ padding:4px; outline:none; display:flex; align-items:center; }
      .slide-el[data-kind="shape"] .el-content{ width:100%; height:100%; }
      .resize-handle{
        position:absolute; width:10px; height:10px; background:var(--primary); border:2px solid var(--bg-card);
        border-radius:50%; z-index:5; box-shadow:0 1px 3px rgba(0,0,0,0.15);
      }
      .rh-se{ right:-5px; bottom:-5px; cursor:nwse-resize; }
      .rh-nw{ left:-5px; top:-5px; cursor:nwse-resize; }
      .rh-ne{ right:-5px; top:-5px; cursor:nesw-resize; }
      .rh-sw{ left:-5px; bottom:-5px; cursor:nesw-resize; }

      .slide-side-panel{ width:0; overflow:hidden; transition:width 0.2s ease; background:var(--bg-card); border-left:1px solid var(--border); }
      .slide-side-panel.open{ width:240px; overflow-y:auto; }
      .ssp-inner{ padding:16px; display:flex; flex-direction:column; gap:16px; }
      .ssp-group label{ font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:.05em; display:block; margin-bottom:8px; }
      .ssp-row{ display:flex; gap:8px; align-items:center; }
      .present-overlay{ position:fixed; inset:0; background:#0f172a; z-index:200; display:flex; align-items:center; justify-content:center; }
      .present-slide{ width:100%; height:100%; max-width:100vw; position:relative; }
      .present-nav{ position:absolute; bottom:20px; right:20px; display:flex; gap:8px; }
      .present-nav button{ background:rgba(255,255,255,0.12); color:#fff; border:1px solid rgba(255,255,255,0.2); width:40px;height:40px;border-radius:8px;font-size:16px;transition:var(--transition); }
      .present-nav button:hover{ background:rgba(255,255,255,0.2);border-color:rgba(255,255,255,0.4); }
      .present-counter{ position:absolute; bottom:20px; left:20px; color:rgba(255,255,255,0.7); font-size:13px; font-family:system-ui,sans-serif; }
      .present-exit{ position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.12); color:#fff; border:1px solid rgba(255,255,255,0.2); width:36px;height:36px;border-radius:8px;font-size:16px;transition:var(--transition);cursor:pointer; }
      .present-exit:hover{ background:rgba(255,255,255,0.2); }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="slidesBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="slidesTitle" value="${escapeHtml(file.name)}" aria-label="Presentation title">
      <div class="save-indicator"><span class="sdot" id="slidesSaveDot"></span><span id="slidesSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="Slide tools">
      <button class="tbtn wide" id="addTextBtn">&#65291; Text</button>
      <button class="tbtn wide" id="addShapeBtn">&#9645; Shape</button>
      <button class="tbtn wide" id="addImageBtn">&#128247; Image</button>
      <span class="sep"></span>
      <input type="color" id="bgColorInput" title="Slide background" value="#FFFFFF">
      <span class="sep"></span>
      <button class="tbtn" id="deleteElBtn" title="Delete selected" disabled>&#128465;</button>
      <button class="tbtn" id="frontBtn" title="Bring to front" disabled>&#9650;</button>
      <button class="tbtn" id="backBtn" title="Send to back" disabled>&#9660;</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="presentBtn">&#9654; Present</button>
      <button class="tbtn wide" id="slidesExportBtn">&#11015; Export</button>
    </div>
    <div class="slides-main">
      <div class="slide-panel" id="slidePanel"></div>
      <div class="slide-canvas-wrap">
        <div class="slide-canvas" id="slideCanvas"></div>
      </div>
      <div class="slide-side-panel" id="sidePanel"><div class="ssp-inner" id="sidePanelInner"></div></div>
    </div>
  `;

  const titleInput = shell.querySelector('#slidesTitle');
  const saveDot = shell.querySelector('#slidesSaveDot');
  const saveText = shell.querySelector('#slidesSaveText');
  const slidePanel = shell.querySelector('#slidePanel');
  const slideCanvas = shell.querySelector('#slideCanvas');
  const sidePanel = shell.querySelector('#sidePanel');
  const sidePanelInner = shell.querySelector('#sidePanelInner');
  const bgColorInput = shell.querySelector('#bgColorInput');

  let current = file.content.current || 0;
  if(current >= file.content.slides.length) current = 0;
  let selectedElId = null;

  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background = 'var(--warning)';
    saveText.textContent = 'Saving…';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
  }
  function doSave(){
    file.name = titleInput.value.trim() || 'Untitled';
    file.content.current = current;
    upsertFile(file);
    saveDot.style.background = '#5B8A5E';
    saveText.textContent = 'Saved';
  }
  titleInput.addEventListener('input', markUnsaved);

  function getCurrentSlide(){ return file.content.slides[current]; }

  function renderSlidePanel(){
    slidePanel.innerHTML = '';
    file.content.slides.forEach((slide, i)=>{
      const thumb = document.createElement('div');
      thumb.className = 'slide-thumb' + (i === current ? ' active' : '');
      thumb.innerHTML = `
        <div class="thumb-render" style="background:${slide.bg}; width:960px; height:540px; transform:scale(${190/960});"></div>
        <span class="thumb-num">${i+1}</span>
        <button class="thumb-del" data-idx="${i}" aria-label="Delete slide ${i+1}">&#10005;</button>
      `;
      const render = thumb.querySelector('.thumb-render');
      slide.elements.forEach(el=>{
        render.appendChild(renderElementStatic(el));
      });
      thumb.addEventListener('click', (e)=>{
        if(e.target.closest('.thumb-del')) return;
        current = i; selectedElId = null;
        renderAll();
      });
      slidePanel.appendChild(thumb);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'add-slide-btn';
    addBtn.textContent = '+ Add slide';
    addBtn.addEventListener('click', ()=>{
      file.content.slides.push(makeSlide());
      current = file.content.slides.length - 1;
      markUnsaved();
      renderAll();
    });
    slidePanel.appendChild(addBtn);

    slidePanel.querySelectorAll('.thumb-del').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx,10);
        if(file.content.slides.length <= 1){ alert('A presentation needs at least one slide.'); return; }
        file.content.slides.splice(idx,1);
        if(current >= file.content.slides.length) current = file.content.slides.length-1;
        markUnsaved();
        renderAll();
      });
    });
  }

  function renderElementStatic(el){
    const div = document.createElement('div');
    div.style.position='absolute';
    div.style.left=el.x+'px'; div.style.top=el.y+'px';
    div.style.width=el.w+'px'; div.style.height=el.h+'px';
    if(el.kind==='text'){
      div.style.fontSize=(el.fontSize||24)+'px';
      div.style.color=el.color||'#1E2A3A';
      div.style.fontWeight=el.bold?'700':'400';
      div.style.fontStyle=el.italic?'italic':'normal';
      div.style.textAlign=el.align||'left';
      div.style.fontFamily=el.fontFamily||'Georgia,serif';
      div.style.display='flex';
      div.style.alignItems='center';
      div.style.justifyContent = el.align==='center'?'center':(el.align==='right'?'flex-end':'flex-start');
      div.textContent = el.text||'';
      div.style.whiteSpace='pre-wrap';
      div.style.overflow='hidden';
    } else if(el.kind==='shape'){
      div.style.background = el.fill || 'var(--warning)';
      if(el.shape==='ellipse') div.style.borderRadius='50%';
      if(el.shape==='rect') div.style.borderRadius='4px';
    } else if(el.kind==='image'){
      const img = document.createElement('img');
      img.src = el.src; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover';
      div.appendChild(img);
    }
    return div;
  }

  function renderCanvas(){
    slideCanvas.innerHTML = '';
    const slide = getCurrentSlide();
    slideCanvas.style.background = slide.bg;
    bgColorInput.value = slide.bg.startsWith('#') ? slide.bg : '#FFFFFF';

    slide.elements.forEach(el=>{
      const wrap = document.createElement('div');
      wrap.className = 'slide-el' + (el.id===selectedElId ? ' selected':'');
      wrap.dataset.kind = el.kind;
      wrap.dataset.id = el.id;
      wrap.style.left = el.x+'px'; wrap.style.top = el.y+'px';
      wrap.style.width = el.w+'px'; wrap.style.height = el.h+'px';
      wrap.style.zIndex = el.z || 1;

      const content = document.createElement('div');
      content.className = 'el-content';

      if(el.kind === 'text'){
        content.contentEditable = true;
        content.spellcheck = false;
        content.style.fontSize = (el.fontSize||24)+'px';
        content.style.color = el.color || '#1E2A3A';
        content.style.fontWeight = el.bold ? '700':'400';
        content.style.fontStyle = el.italic ? 'italic':'normal';
        content.style.textAlign = el.align || 'left';
        content.style.fontFamily = el.fontFamily || 'Georgia,serif';
        content.style.width = '100%';
        content.style.justifyContent = el.align==='center'?'center':(el.align==='right'?'flex-end':'flex-start');
        content.textContent = el.text || '';
        content.addEventListener('input', ()=>{
          el.text = content.textContent;
          markUnsaved();
        });
        content.addEventListener('mousedown', (e)=> e.stopPropagation());
        content.addEventListener('dblclick', (e)=>{ e.stopPropagation(); content.focus(); });
      } else if(el.kind === 'shape'){
        content.style.background = el.fill || 'var(--warning)';
        if(el.shape === 'ellipse') content.style.borderRadius = '50%';
        if(el.shape === 'rect') content.style.borderRadius = '4px';
      } else if(el.kind === 'image'){
        const img = document.createElement('img');
        img.src = el.src;
        img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
        img.draggable = false;
        content.appendChild(img);
      }
      wrap.appendChild(content);

      if(el.id === selectedElId){
        ['nw','ne','sw','se'].forEach(pos=>{
          const handle = document.createElement('div');
          handle.className = 'resize-handle rh-'+pos;
          handle.addEventListener('mousedown', (e)=> startResize(e, el, pos));
          wrap.appendChild(handle);
        });
      }

      wrap.addEventListener('mousedown', (e)=>{
        if(e.target.closest('.resize-handle')) return;
        selectedElId = el.id;
        renderAll();
        startDrag(e, el);
      });

      slideCanvas.appendChild(wrap);
    });

    slideCanvas.addEventListener('mousedown', (e)=>{
      if(e.target === slideCanvas){
        selectedElId = null;
        renderAll();
      }
    });

    updateActionButtons();
    renderSidePanel();
  }

  function updateActionButtons(){
    const has = !!selectedElId;
    shell.querySelector('#deleteElBtn').disabled = !has;
    shell.querySelector('#frontBtn').disabled = !has;
    shell.querySelector('#backBtn').disabled = !has;
  }

  function renderSidePanel(){
    if(!selectedElId){ sidePanel.classList.remove('open'); sidePanelInner.innerHTML=''; return; }
    const slide = getCurrentSlide();
    const el = slide.elements.find(e=>e.id===selectedElId);
    if(!el){ sidePanel.classList.remove('open'); return; }
    sidePanel.classList.add('open');

    if(el.kind === 'text'){
      sidePanelInner.innerHTML = `
        <div class="ssp-group">
          <label>Font</label>
          <select class="tsel" id="elFontFamily" style="width:100%">
            <option value="Georgia,serif">Georgia</option>
            <option value="'Iowan Old Style',serif">Serif</option>
            <option value="-apple-system,sans-serif">Sans</option>
            <option value="'Courier New',monospace">Monospace</option>
          </select>
        </div>
        <div class="ssp-group">
          <label>Size</label>
          <input type="range" id="elFontSize" min="10" max="96" value="${el.fontSize||24}" style="width:100%">
        </div>
        <div class="ssp-group">
          <label>Style</label>
          <div class="ssp-row">
            <button class="tbtn" id="elBold" aria-pressed="${!!el.bold}"><b>B</b></button>
            <button class="tbtn" id="elItalic" aria-pressed="${!!el.italic}"><i>I</i></button>
          </div>
        </div>
        <div class="ssp-group">
          <label>Align</label>
          <div class="ssp-row">
            <button class="tbtn" id="elAlignL">&#8676;</button>
            <button class="tbtn" id="elAlignC">&#8596;</button>
            <button class="tbtn" id="elAlignR">&#8677;</button>
          </div>
        </div>
        <div class="ssp-group">
          <label>Color</label>
          <input type="color" id="elColor" value="${el.color||'#1E2A3A'}">
        </div>
      `;
      sidePanelInner.querySelector('#elFontFamily').value = el.fontFamily || 'Georgia,serif';
      sidePanelInner.querySelector('#elFontFamily').addEventListener('change', e=>{ el.fontFamily=e.target.value; markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elFontSize').addEventListener('input', e=>{ el.fontSize=parseInt(e.target.value,10); markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elBold').addEventListener('click', ()=>{ el.bold=!el.bold; markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elItalic').addEventListener('click', ()=>{ el.italic=!el.italic; markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elAlignL').addEventListener('click', ()=>{ el.align='left'; markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elAlignC').addEventListener('click', ()=>{ el.align='center'; markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elAlignR').addEventListener('click', ()=>{ el.align='right'; markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elColor').addEventListener('input', e=>{ el.color=e.target.value; markUnsaved(); renderCanvas(); });
    } else if(el.kind === 'shape'){
      sidePanelInner.innerHTML = `
        <div class="ssp-group">
          <label>Shape</label>
          <select class="tsel" id="elShapeType" style="width:100%">
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
          </select>
        </div>
        <div class="ssp-group">
          <label>Fill color</label>
          <input type="color" id="elFill" value="${el.fill||'#f59e0b'}">
        </div>
      `;
      sidePanelInner.querySelector('#elShapeType').value = el.shape || 'rect';
      sidePanelInner.querySelector('#elShapeType').addEventListener('change', e=>{ el.shape=e.target.value; markUnsaved(); renderCanvas(); });
      sidePanelInner.querySelector('#elFill').addEventListener('input', e=>{ el.fill=e.target.value; markUnsaved(); renderCanvas(); });
    } else {
      sidePanelInner.innerHTML = `<div class="ssp-group"><label>Image</label><p style="font-size:12px;color:var(--text-muted);margin:0;">Drag corners to resize, drag to move.</p></div>`;
    }
  }

  function renderAll(){
    renderSlidePanel();
    renderCanvas();
  }

  // ---- Dragging ----
  function startDrag(e, el){
    const startX = e.clientX, startY = e.clientY;
    const origX = el.x, origY = el.y;
    function onMove(ev){
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      el.x = Math.max(0, origX + dx);
      el.y = Math.max(0, origY + dy);
      const wrap = slideCanvas.querySelector(`.slide-el[data-id="${el.id}"]`);
      if(wrap){ wrap.style.left = el.x+'px'; wrap.style.top = el.y+'px'; }
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      markUnsaved();
      renderSlidePanel();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startResize(e, el, pos){
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const orig = { x:el.x, y:el.y, w:el.w, h:el.h };
    function onMove(ev){
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if(pos.includes('e')) el.w = Math.max(20, orig.w + dx);
      if(pos.includes('s')) el.h = Math.max(20, orig.h + dy);
      if(pos.includes('w')){ el.w = Math.max(20, orig.w - dx); el.x = orig.x + dx; }
      if(pos.includes('n')){ el.h = Math.max(20, orig.h - dy); el.y = orig.y + dy; }
      renderCanvas();
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      markUnsaved();
      renderSlidePanel();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ---- Add elements ----
  shell.querySelector('#addTextBtn').addEventListener('click', ()=>{
    const el = { id:uid(), kind:'text', x:300, y:230, w:360, h:80, text:'New text', fontSize:28, color:'#1E2A3A', align:'left', fontFamily:'Georgia,serif', z: Date.now() };
    getCurrentSlide().elements.push(el);
    selectedElId = el.id;
    markUnsaved();
    renderAll();
  });
  shell.querySelector('#addShapeBtn').addEventListener('click', ()=>{
    const el = { id:uid(), kind:'shape', shape:'rect', x:380, y:200, w:200, h:140, fill:'var(--warning)', z: Date.now() };
    getCurrentSlide().elements.push(el);
    selectedElId = el.id;
    markUnsaved();
    renderAll();
  });
  shell.querySelector('#addImageBtn').addEventListener('click', ()=>{
    const inputEl = document.createElement('input');
    inputEl.type = 'file'; inputEl.accept = 'image/*';
    inputEl.addEventListener('change', ()=>{
      const f = inputEl.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = (ev)=>{
        const el = { id:uid(), kind:'image', x:320, y:150, w:320, h:240, src:ev.target.result, z: Date.now() };
        getCurrentSlide().elements.push(el);
        selectedElId = el.id;
        markUnsaved();
        renderAll();
      };
      reader.readAsDataURL(f);
    });
    inputEl.click();
  });

  shell.querySelector('#deleteElBtn').addEventListener('click', ()=>{
    if(!selectedElId) return;
    const slide = getCurrentSlide();
    slide.elements = slide.elements.filter(e=>e.id!==selectedElId);
    selectedElId = null;
    markUnsaved();
    renderAll();
  });
  shell.querySelector('#frontBtn').addEventListener('click', ()=>{
    const el = getCurrentSlide().elements.find(e=>e.id===selectedElId);
    if(el){ el.z = Date.now(); markUnsaved(); renderCanvas(); }
  });
  shell.querySelector('#backBtn').addEventListener('click', ()=>{
    const el = getCurrentSlide().elements.find(e=>e.id===selectedElId);
    if(el){ el.z = 0; markUnsaved(); renderCanvas(); }
  });

  bgColorInput.addEventListener('input', (e)=>{
    getCurrentSlide().bg = e.target.value;
    markUnsaved();
    renderCanvas();
    renderSlidePanel();
  });

  function delKeyHandler(e){
    if((e.key === 'Delete' || e.key === 'Backspace') && selectedElId){
      const active = document.activeElement;
      if(active && active.isContentEditable) return;
      const slide = getCurrentSlide();
      slide.elements = slide.elements.filter(el=>el.id!==selectedElId);
      selectedElId = null;
      markUnsaved();
      renderAll();
    }
  }
  document.addEventListener('keydown', delKeyHandler);
  shell._cleanupDelKey = () => document.removeEventListener('keydown', delKeyHandler);

  // ---- Present mode ----
  shell.querySelector('#presentBtn').addEventListener('click', ()=> startPresent(file, current));

  // ---- Export ----
  shell.querySelector('#slidesExportBtn').addEventListener('click', ()=>{
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(file.name)}</title>
    <style>body{margin:0;font-family:sans-serif;background:#222;} .s{width:960px;height:540px;position:relative;margin:20px auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);overflow:hidden;}</style>
    </head><body>`;
    file.content.slides.forEach(slide=>{
      html += `<div class="s" style="background:${slide.bg}">`;
      slide.elements.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach(el=>{
        if(el.kind==='text'){
          html += `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;font-size:${el.fontSize||24}px;color:${el.color||'#000'};font-weight:${el.bold?'700':'400'};font-style:${el.italic?'italic':'normal'};text-align:${el.align||'left'};font-family:${el.fontFamily||'Georgia,serif'};display:flex;align-items:center;justify-content:${el.align==='center'?'center':el.align==='right'?'flex-end':'flex-start'};white-space:pre-wrap;">${escapeHtml(el.text||'')}</div>`;
        } else if(el.kind==='shape'){
          html += `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.fill};border-radius:${el.shape==='ellipse'?'50%':'4px'};"></div>`;
        } else if(el.kind==='image'){
          html += `<img src="${el.src}" style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;object-fit:cover;">`;
        }
      });
      html += `</div>`;
    });
    html += `</body></html>`;
    downloadBlob(new Blob([html], {type:'text/html'}), (file.name||'presentation') + '.html');
  });

  shell.querySelector('#slidesBack').addEventListener('click', ()=>{
    doSave();
    if(shell._cleanupDelKey) shell._cleanupDelKey();
    closeEditor('slidesEditor');
  });

  renderAll();
}

function startPresent(file, startIdx){
  let idx = startIdx;
  const overlay = document.createElement('div');
  overlay.className = 'present-overlay';
  document.body.appendChild(overlay);

  function render(){
    const slide = file.content.slides[idx];
    overlay.innerHTML = `
      <div class="present-slide" style="background:${slide.bg}" id="presentSlideArea"></div>
      <div class="present-counter">${idx+1} / ${file.content.slides.length}</div>
      <div class="present-nav">
        <button id="presentPrev" aria-label="Previous slide">&#8592;</button>
        <button id="presentNext" aria-label="Next slide">&#8594;</button>
      </div>
      <button class="present-exit" id="presentExit" aria-label="Exit presentation">&#10005;</button>
    `;
    const area = overlay.querySelector('#presentSlideArea');
    // scale 960x540 to fit viewport
    const scale = Math.min(window.innerWidth/960, window.innerHeight/540);
    area.style.width = '960px';
    area.style.height = '540px';
    area.style.position = 'absolute';
    area.style.left = '50%';
    area.style.top = '50%';
    area.style.transform = `translate(-50%,-50%) scale(${scale})`;
    slide.elements.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach(el=>{
      area.appendChild(renderElementStaticGlobal(el));
    });
    overlay.querySelector('#presentPrev').addEventListener('click', ()=>{ if(idx>0){ idx--; render(); } });
    overlay.querySelector('#presentNext').addEventListener('click', ()=>{ if(idx<file.content.slides.length-1){ idx++; render(); } });
    overlay.querySelector('#presentExit').addEventListener('click', exit);
  }
  function onKey(e){
    if(e.key === 'ArrowRight' || e.key === ' '){ if(idx<file.content.slides.length-1){ idx++; render(); } }
    else if(e.key === 'ArrowLeft'){ if(idx>0){ idx--; render(); } }
    else if(e.key === 'Escape'){ exit(); }
  }
  function exit(){
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  document.addEventListener('keydown', onKey);
  render();
}

function renderElementStaticGlobal(el){
  const div = document.createElement('div');
  div.style.position='absolute';
  div.style.left=el.x+'px'; div.style.top=el.y+'px';
  div.style.width=el.w+'px'; div.style.height=el.h+'px';
  if(el.kind==='text'){
    div.style.fontSize=(el.fontSize||24)+'px';
    div.style.color=el.color||'#1E2A3A';
    div.style.fontWeight=el.bold?'700':'400';
    div.style.fontStyle=el.italic?'italic':'normal';
    div.style.textAlign=el.align||'left';
    div.style.fontFamily=el.fontFamily||'Georgia,serif';
    div.style.display='flex';
    div.style.alignItems='center';
    div.style.justifyContent = el.align==='center'?'center':(el.align==='right'?'flex-end':'flex-start');
    div.style.whiteSpace='pre-wrap';
    div.style.overflow='hidden';
    div.textContent = el.text||'';
  } else if(el.kind==='shape'){
    div.style.background = el.fill || 'var(--warning)';
    if(el.shape==='ellipse') div.style.borderRadius='50%';
    if(el.shape==='rect') div.style.borderRadius='4px';
  } else if(el.kind==='image'){
    const img = document.createElement('img');
    img.src = el.src; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover';
    div.appendChild(img);
  }
  return div;
}
