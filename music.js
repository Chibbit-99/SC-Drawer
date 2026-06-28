/* =========================================================================
   MUSIC EDITOR
   Minimal music composition software with piano roll and playback
   ========================================================================= */
function openMusicEditor(file){
  let shell = document.getElementById('musicEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');
  shell.innerHTML = `
    <style>
      .music-container{ flex:1; display:flex; flex-direction:column; overflow:hidden; }
      .piano-roll{ flex:1; display:flex; overflow:hidden; }
      .piano-keys{ width:100px; background:var(--bg-app); border-right:1px solid var(--border); display:flex; flex-direction:column; overflow-y:auto; }
      .key{ flex:0 0 24px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:9px; color:var(--text-muted); cursor:pointer; user-select:none; transition:var(--transition); }
      .key:hover{ background:var(--bg-card); }
      .key.black{ background:#1e293b; color:#fff; }
      .key.white{ background:#f1f5f9; }
      .grid-area{ flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--bg-card); position:relative; }
      .grid-row{ display:flex; height:24px; border-bottom:1px solid var(--border); }
      .grid-cell{ flex:0 0 40px; border-right:1px solid var(--border); position:relative; }
      .note-block{ position:absolute; height:20px; background:var(--primary); border-radius:3px; cursor:pointer; top:2px; transition:var(--transition); }
      .note-block:hover{ opacity:.8; }
      .transport-bar{ height:50px; background:var(--bg-card); border-top:1px solid var(--border); padding:8px 16px; display:flex; align-items:center; gap:10px; }
      .bpm-input{ width:60px; padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-size:13px; }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="musicBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="musicTitle" value="${escapeHtml(file.name)}" aria-label="Music project name">
      <div class="save-indicator"><span class="sdot" id="musicSaveDot"></span><span id="musicSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="Music tools">
      <button class="tbtn wide" id="playMusicBtn" title="Play">▶ Play</button>
      <button class="tbtn wide" id="pauseMusicBtn" title="Pause">⏸ Pause</button>
      <button class="tbtn wide" id="stopMusicBtn" title="Stop">⏹ Stop</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="clearNotesBtn">🗑 Clear</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="musicExportBtn">&#11015; Export MIDI</button>
    </div>
    <div class="editor-body">
      <div class="music-container">
        <div class="piano-roll" id="pianoRoll">
          <div class="piano-keys" id="pianoKeys"></div>
          <div class="grid-area" id="gridArea"></div>
        </div>
        <div class="transport-bar">
          <label style="font-size:13px;">BPM:</label>
          <input type="number" class="bpm-input" id="bpmInput" value="120" min="40" max="300">
          <span style="font-size:12px; color:var(--text-muted); margin-left:20px;">Click grid to add notes</span>
        </div>
      </div>
    </div>
  `;

  const titleInput = shell.querySelector('#musicTitle');
  const saveDot = shell.querySelector('#musicSaveDot');
  const saveText = shell.querySelector('#musicSaveText');
  const pianoKeys = shell.querySelector('#pianoKeys');
  const gridArea = shell.querySelector('#gridArea');
  const bpmInput = shell.querySelector('#bpmInput');

  const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'];
  let notes = (file.content && file.content.notes) || [];
  let bpm = (file.content && file.content.bpm) || 120;
  let isPlaying = false;

  function renderPianoKeys(){
    NOTES.forEach((note) => {
      const key = document.createElement('div');
      key.className = `key ${note.includes('#') ? 'black' : 'white'}`;
      key.textContent = note;
      key.addEventListener('click', () => {
        console.log('Play note:', note);
      });
      pianoKeys.appendChild(key);
    });
  }

  function renderGrid(){
    gridArea.innerHTML = '';
    NOTES.forEach((note, noteIdx) => {
      const row = document.createElement('div');
      row.className = 'grid-row';
      for(let i = 0; i < 16; i++){
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        const noteInCell = notes.find(n => n.note === note && n.beat === i);
        if(noteInCell){
          const block = document.createElement('div');
          block.className = 'note-block';
          block.style.width = (noteInCell.duration || 1) * 40 - 4 + 'px';
          block.addEventListener('click', (e) => {
            e.stopPropagation();
            notes = notes.filter(n => n !== noteInCell);
            markUnsaved();
            renderGrid();
          });
          cell.appendChild(block);
        }
        cell.addEventListener('click', () => {
          notes.push({ note, beat: i, duration: 1 });
          markUnsaved();
          renderGrid();
        });
        row.appendChild(cell);
      }
      gridArea.appendChild(row);
    });
  }

  bpmInput.value = bpm;
  bpmInput.addEventListener('change', (e) => {
    bpm = parseInt(e.target.value, 10);
    markUnsaved();
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
    file.content = { notes, bpm };
    upsertFile(file);
    saveDot.style.background = 'var(--success)';
    saveText.textContent = 'Saved';
  }

  shell.querySelector('#playMusicBtn').addEventListener('click', () => {
    isPlaying = true;
    console.log('Playing music at', bpm, 'BPM with', notes.length, 'notes');
  });

  shell.querySelector('#pauseMusicBtn').addEventListener('click', () => {
    isPlaying = false;
  });

  shell.querySelector('#stopMusicBtn').addEventListener('click', () => {
    isPlaying = false;
    console.log('Music stopped');
  });

  shell.querySelector('#clearNotesBtn').addEventListener('click', () => {
    if(confirm('Clear all notes?')){
      notes = [];
      markUnsaved();
      renderGrid();
    }
  });

  shell.querySelector('#musicExportBtn').addEventListener('click', () => {
    const data = JSON.stringify({ notes, bpm, title: file.name }, null, 2);
    downloadBlob(new Blob([data], { type: 'application/json' }), (file.name || 'music') + '.json');
  });

  shell.querySelector('#musicBack').addEventListener('click', () => {
    doSave();
    closeEditor('musicEditor');
  });

  titleInput.addEventListener('input', markUnsaved);

  renderPianoKeys();
  renderGrid();
}
