/* =========================================================================
   VIDEO EDITOR
   Minimal video editor with timeline, basic playback, and export
   ========================================================================= */
function openVideoEditor(file){
  let shell = document.getElementById('videoEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');
  shell.innerHTML = `
    <style>
      .video-container{ flex:1; display:flex; flex-direction:column; overflow:hidden; }
      .video-viewport{ flex:1; background:#000; display:flex; align-items:center; justify-content:center; overflow:auto; }
      .video-canvas{ width:100%; height:100%; max-width:960px; max-height:540px; background:#222; display:flex; align-items:center; justify-content:center; color:#999; font-size:14px; }
      .video-timeline{ height:120px; background:var(--bg-card); border-top:1px solid var(--border); padding:10px; overflow-x:auto; overflow-y:hidden; }
      .timeline-track{ display:flex; gap:4px; height:100%; align-items:stretch; min-width:min-content; }
      .timeline-clip{ flex:0 0 80px; background:var(--primary); border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; text-align:center; padding:4px; box-sizing:border-box; transition:var(--transition); }
      .timeline-clip:hover{ opacity:.8; }
      .timeline-clip.selected{ border:2px solid var(--warning); }
      .add-clip-btn{ flex:0 0 60px; background:var(--border); border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-muted); font-size:20px; transition:var(--transition); }
      .add-clip-btn:hover{ background:var(--primary); color:#fff; }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="videoBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="videoTitle" value="${escapeHtml(file.name)}" aria-label="Video project name">
      <div class="save-indicator"><span class="sdot" id="videoSaveDot"></span><span id="videoSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="Video tools">
      <button class="tbtn wide" id="playBtn" title="Play">▶ Play</button>
      <button class="tbtn wide" id="pauseBtn" title="Pause">⏸ Pause</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="addVideoBtn">+ Video</button>
      <button class="tbtn wide" id="addAudioBtn">+ Audio</button>
      <button class="tbtn wide" id="addTextBtn">+ Text</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="videoExportBtn">&#11015; Export</button>
    </div>
    <div class="editor-body">
      <div class="video-container">
        <div class="video-viewport">
          <div class="video-canvas" id="videoCanvas">
            <span id="canvasText">No clips added yet</span>
          </div>
        </div>
        <div class="video-timeline" id="videoTimeline">
          <div class="timeline-track" id="timelineTrack">
            <div class="add-clip-btn" id="addClipBtn">+</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const titleInput = shell.querySelector('#videoTitle');
  const saveDot = shell.querySelector('#videoSaveDot');
  const saveText = shell.querySelector('#videoSaveText');
  const canvas = shell.querySelector('#videoCanvas');
  const timelineTrack = shell.querySelector('#timelineTrack');
  const canvasText = shell.querySelector('#canvasText');

  let clips = (file.content && file.content.clips) || [];
  let selectedClipIdx = null;
  let isPlaying = false;
  let playheadTime = 0;

  function loadClips(){
    clips.forEach((clip, idx) => {
      renderClip(clip, idx);
    });
  }

  function renderClip(clip, idx){
    const el = document.createElement('div');
    el.className = 'timeline-clip' + (idx === selectedClipIdx ? ' selected' : '');
    el.textContent = clip.type.slice(0, 1).toUpperCase();
    el.addEventListener('click', () => {
      selectedClipIdx = idx;
      updateClipSelection();
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.style.cssText = 'position:absolute; top:2px; right:2px; width:16px; height:16px; border:none; background:rgba(0,0,0,0.5); color:#fff; cursor:pointer; border-radius:2px; font-size:10px;';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clips.splice(idx, 1);
      markUnsaved();
      rebuildTimeline();
    });
    el.style.position = 'relative';
    el.appendChild(deleteBtn);
    const addBtn = timelineTrack.querySelector('.add-clip-btn');
    timelineTrack.insertBefore(el, addBtn);
  }

  function updateClipSelection(){
    timelineTrack.querySelectorAll('.timeline-clip').forEach((el, i) => {
      el.classList.toggle('selected', i === selectedClipIdx);
    });
  }

  function rebuildTimeline(){
    timelineTrack.innerHTML = '';
    clips.forEach((clip, idx) => renderClip(clip, idx));
    const addBtn = document.createElement('div');
    addBtn.className = 'add-clip-btn';
    addBtn.id = 'addClipBtn';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => shell.querySelector('#addVideoBtn').click());
    timelineTrack.appendChild(addBtn);
    updateCanvasText();
  }

  function updateCanvasText(){
    if(clips.length === 0) canvasText.textContent = 'No clips added yet';
    else canvasText.textContent = `${clips.length} clip${clips.length > 1 ? 's' : ''} • Click play to preview`;
  }

  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background = 'var(--warning)';
    saveText.textContent = 'Saving…';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
  }

  function doSave(){
    file.name = titleInput.value.trim() || 'Untitled';
    file.content = { clips };
    upsertFile(file);
    saveDot.style.background = 'var(--success)';
    saveText.textContent = 'Saved';
  }

  shell.querySelector('#playBtn').addEventListener('click', () => {
    isPlaying = true;
    canvasText.textContent = '▶ Playing... (preview)';
    setTimeout(() => { isPlaying = false; canvasText.textContent = clips.length ? `${clips.length} clip${clips.length > 1 ? 's' : ''}` : 'No clips'; }, 2000);
  });

  shell.querySelector('#pauseBtn').addEventListener('click', () => {
    isPlaying = false;
    updateCanvasText();
  });

  shell.querySelector('#addVideoBtn').addEventListener('click', () => {
    clips.push({ type: 'video', name: `Video ${clips.length + 1}` });
    markUnsaved();
    rebuildTimeline();
  });

  shell.querySelector('#addAudioBtn').addEventListener('click', () => {
    clips.push({ type: 'audio', name: `Audio ${clips.length + 1}` });
    markUnsaved();
    rebuildTimeline();
  });

  shell.querySelector('#addTextBtn').addEventListener('click', () => {
    clips.push({ type: 'text', name: `Text ${clips.length + 1}` });
    markUnsaved();
    rebuildTimeline();
  });

  shell.querySelector('#videoExportBtn').addEventListener('click', () => {
    const data = JSON.stringify({ clips, title: file.name }, null, 2);
    downloadBlob(new Blob([data], { type: 'application/json' }), (file.name || 'video') + '.json');
  });

  shell.querySelector('#videoBack').addEventListener('click', () => {
    doSave();
    closeEditor('videoEditor');
  });

  titleInput.addEventListener('input', markUnsaved);

  loadClips();
  updateCanvasText();
}
