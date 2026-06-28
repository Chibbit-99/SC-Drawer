/* =========================================================================
   CAD EDITOR
   Minimal CAD software for basic 2D drawing and shapes
   ========================================================================= */
function openCADEditor(file){
  let shell = document.getElementById('cadEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');
  shell.innerHTML = `
    <style>
      .cad-container{ flex:1; display:flex; overflow:hidden; }
      .cad-tools{ width:60px; background:var(--bg-card); border-right:1px solid var(--border); padding:8px; display:flex; flex-direction:column; gap:6px; }
      .tool-btn{ width:44px; height:44px; border:1px solid var(--border); background:transparent; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; transition:var(--transition); color:var(--text-muted); }
      .tool-btn:hover{ border-color:var(--primary); color:var(--primary); }
      .tool-btn.active{ border-color:var(--primary); background:var(--primary); color:#fff; }
      .cad-canvas-wrap{ flex:1; overflow:auto; background:#fafbfc; position:relative; }
      .cad-canvas{ position:absolute; inset:0; cursor:crosshair; background:#fff; box-shadow:var(--shadow); }
      .cad-shape{ position:absolute; user-select:none; }
      .cad-line{ border:none; }
      .cad-rect{ border:2px solid var(--primary); box-sizing:border-box; }
      .cad-circle{ border:2px solid var(--primary); border-radius:50%; }
      .cad-text{ font-size:14px; color:var(--text-main); font-family:monospace; padding:4px; background:rgba(255,255,255,0.7); }
      .shape-handle{ position:absolute; width:8px; height:8px; background:var(--primary); border:1px solid #fff; border-radius:50%; }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="cadBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="cadTitle" value="${escapeHtml(file.name)}" aria-label="CAD project name">
      <div class="save-indicator"><span class="sdot" id="cadSaveDot"></span><span id="cadSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="CAD tools">
      <button class="tbtn wide" id="selectBtn">🔖 Select</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="lineBtn">📏 Line</button>
      <button class="tbtn wide" id="rectBtn">▭ Rect</button>
      <button class="tbtn wide" id="circleBtn">●  Circle</button>
      <button class="tbtn wide" id="textBtn">A Text</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="deleteBtn">🗑 Delete</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="cadExportBtn">&#11015; Export SVG</button>
    </div>
    <div class="editor-body">
      <div class="cad-container">
        <div class="cad-tools" id="cadTools"></div>
        <div class="cad-canvas-wrap" id="cadCanvasWrap">
          <canvas id="cadCanvas" class="cad-canvas" width="1200" height="800"></canvas>
        </div>
      </div>
    </div>
  `;

  const titleInput = shell.querySelector('#cadTitle');
  const saveDot = shell.querySelector('#cadSaveDot');
  const saveText = shell.querySelector('#cadSaveText');
  const canvas = shell.querySelector('#cadCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = shell.querySelector('#cadCanvasWrap');

  let shapes = (file.content && file.content.shapes) || [];
  let currentTool = 'select';
  let selectedShapeIdx = null;
  let isDrawing = false;
  let startX, startY;

  function drawShapes(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for(let i = 0; i < canvas.width; i += 40){
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for(let i = 0; i < canvas.height; i += 40){
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    shapes.forEach((shape, idx) => {
      const isSelected = idx === selectedShapeIdx;
      ctx.strokeStyle = isSelected ? '#f59e0b' : '#3b82f6';
      ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.05)';
      ctx.lineWidth = isSelected ? 2 : 1;

      if(shape.type === 'line'){
        ctx.beginPath();
        ctx.moveTo(shape.x1, shape.y1);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
      } else if(shape.type === 'rect'){
        ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
        ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
      } else if(shape.type === 'circle'){
        ctx.beginPath();
        ctx.arc(shape.x + shape.r, shape.y + shape.r, shape.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if(shape.type === 'text'){
        ctx.fillStyle = '#0f172a';
        ctx.font = '14px monospace';
        ctx.fillText(shape.text, shape.x, shape.y);
      }
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    if(currentTool === 'select') return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
  });

  canvas.addEventListener('mousemove', (e) => {
    if(!isDrawing || currentTool === 'select') return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if(currentTool === 'line'){
      drawShapes();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if(currentTool === 'rect'){
      drawShapes();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(startX, startY, x - startX, y - startY);
      ctx.strokeRect(startX, startY, x - startX, y - startY);
    } else if(currentTool === 'circle'){
      drawShapes();
      const r = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2);
      ctx.strokeStyle = '#3b82f6';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(startX, startY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if(!isDrawing) return;
    isDrawing = false;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    if(currentTool === 'line'){
      shapes.push({ type: 'line', x1: startX, y1: startY, x2: endX, y2: endY });
    } else if(currentTool === 'rect'){
      shapes.push({ type: 'rect', x: startX, y: startY, w: endX - startX, h: endY - startY });
    } else if(currentTool === 'circle'){
      const r = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
      shapes.push({ type: 'circle', x: startX, y: startY, r });
    } else if(currentTool === 'text'){
      const text = prompt('Enter text:', 'Text');
      if(text) shapes.push({ type: 'text', text, x: startX, y: startY });
    }
    markUnsaved();
    drawShapes();
  });

  canvas.addEventListener('click', (e) => {
    if(currentTool !== 'select') return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    selectedShapeIdx = null;
    shapes.forEach((shape, idx) => {
      let isHit = false;
      if(shape.type === 'line'){
        isHit = Math.hypot(x - shape.x1, y - shape.y1) < 5 || Math.hypot(x - shape.x2, y - shape.y2) < 5;
      } else if(shape.type === 'rect'){
        isHit = x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h;
      } else if(shape.type === 'circle'){
        isHit = Math.hypot(x - (shape.x + shape.r), y - (shape.y + shape.r)) <= shape.r;
      }
      if(isHit) selectedShapeIdx = idx;
    });
    drawShapes();
  });

  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background = 'var(--warning)';
    saveText.textContent = 'Saving…';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
  }

  function doSave(){
    file.name = titleInput.value.trim() || 'Untitled';
    file.content = { shapes };
    upsertFile(file);
    saveDot.style.background = 'var(--success)';
    saveText.textContent = 'Saved';
  }

  function setTool(tool){
    currentTool = tool;
    shell.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    shell.querySelector(`[data-tool="${tool}"]`).classList.add('active');
  }

  shell.querySelector('#selectBtn').addEventListener('click', () => setTool('select'));
  shell.querySelector('#lineBtn').addEventListener('click', () => setTool('line'));
  shell.querySelector('#rectBtn').addEventListener('click', () => setTool('rect'));
  shell.querySelector('#circleBtn').addEventListener('click', () => setTool('circle'));
  shell.querySelector('#textBtn').addEventListener('click', () => setTool('text'));

  shell.querySelector('#deleteBtn').addEventListener('click', () => {
    if(selectedShapeIdx !== null){
      shapes.splice(selectedShapeIdx, 1);
      selectedShapeIdx = null;
      markUnsaved();
      drawShapes();
    }
  });

  shell.querySelector('#cadExportBtn').addEventListener('click', () => {
    let svg = `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="100%" height="100%" fill="#fff"/>';
    shapes.forEach(shape => {
      if(shape.type === 'line'){
        svg += `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="#3b82f6" stroke-width="1"/>`;
      } else if(shape.type === 'rect'){
        svg += `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" stroke-width="1"/>`;
      } else if(shape.type === 'circle'){
        svg += `<circle cx="${shape.x + shape.r}" cy="${shape.y + shape.r}" r="${shape.r}" fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" stroke-width="1"/>`;
      } else if(shape.type === 'text'){
        svg += `<text x="${shape.x}" y="${shape.y}" font-family="monospace" font-size="14" fill="#0f172a">${escapeHtml(shape.text)}</text>`;
      }
    });
    svg += '</svg>';
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), (file.name || 'cad') + '.svg');
  });

  shell.querySelector('#cadBack').addEventListener('click', () => {
    doSave();
    closeEditor('cadEditor');
  });

  titleInput.addEventListener('input', markUnsaved);

  drawShapes();
  setTool('select');
}
