/* =========================================================================
   DOCUMENT EDITOR
   contentEditable rich text editor with formatting toolbar
   ========================================================================= */
function openDocEditor(file){
  let shell = document.getElementById('docEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');
  shell.innerHTML = `
    <style>
      .doc-page-wrap{ flex:1; overflow-y:auto; padding:40px 20px 100px; display:flex; justify-content:center; background:var(--bg-app); }
      .doc-page{
        width:100%; max-width:800px; min-height:1000px; background:var(--bg-card);
        box-shadow:var(--shadow-lg); padding:72px 80px; border-radius:4px;
        font-family:system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size:16px; line-height:1.7; color:var(--text-main); outline:none;
      }
      .doc-page:focus{ outline:none; }
      .doc-page h1{ font-size:32px; margin:0.6em 0 0.3em; font-weight:700; color:var(--text-main); }
      .doc-page h2{ font-size:24px; margin:0.6em 0 0.3em; font-weight:700; color:var(--text-main); }
      .doc-page h3{ font-size:20px; margin:0.6em 0 0.3em; font-weight:700; color:var(--text-main); }
      .doc-page p{ margin:0 0 0.9em; }
      .doc-page ul, .doc-page ol{ margin:0 0 0.9em; padding-left:28px; }
      .doc-page blockquote{ border-left:3px solid var(--primary); margin:0 0 0.9em; padding:2px 0 2px 16px; color:var(--text-muted); font-style:italic; }
      .doc-page a{ color:var(--primary); text-decoration:underline; }
      .doc-page table{ border-collapse:collapse; margin:0 0 0.9em; width:100%; }
      .doc-page table td{ border:1px solid var(--border); padding:8px 12px; vertical-align:top; background:var(--bg-app); }
      .doc-page img{ max-width:100%; border-radius:6px; }
      .doc-page hr{ border:none; border-top:1px solid var(--border); margin:1.5em 0; }
      .find-bar{ display:flex; align-items:center; gap:8px; padding:10px 16px; background:var(--bg-card); border-bottom:1px solid var(--border); flex-wrap:wrap; }
      .find-bar input{ padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; width:200px; background:var(--bg-app); color:var(--text-main); }
      .find-bar button{ border:1px solid var(--border); background:var(--bg-app); border-radius:6px; padding:6px 12px; font-size:12px; color:var(--text-main); transition:var(--transition); }
      .find-bar button:hover{ background:var(--border); }
      .find-bar .fb-close{ margin-left:auto; border:none; background:transparent; font-size:16px; color:var(--text-muted); cursor:pointer; }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="docBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="docTitle" value="${escapeHtml(file.name)}" aria-label="Document title">
      <div class="save-indicator"><span class="sdot" id="docSaveDot"></span><span id="docSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="Formatting">
      <select class="tsel" id="blockStyle" aria-label="Paragraph style">
        <option value="P">Normal text</option>
        <option value="H1">Heading 1</option>
        <option value="H2">Heading 2</option>
        <option value="H3">Heading 3</option>
        <option value="BLOCKQUOTE">Quote</option>
      </select>
      <select class="tsel" id="fontFamily" aria-label="Font">
        <option value="'Iowan Old Style','Palatino Linotype',Georgia,serif">Serif</option>
        <option value="-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">Sans</option>
        <option value="'Courier New',monospace">Monospace</option>
        <option value="Georgia,serif">Georgia</option>
        <option value="'Comic Sans MS',cursive">Comic</option>
      </select>
      <select class="tsel" id="fontSize" aria-label="Font size">
        <option value="1">Small</option>
        <option value="3" selected>Normal</option>
        <option value="4">Large</option>
        <option value="5">X-Large</option>
        <option value="6">XX-Large</option>
      </select>
      <span class="sep"></span>
      <button class="tbtn" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
      <button class="tbtn" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
      <button class="tbtn" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
      <button class="tbtn" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
      <input type="color" id="textColor" title="Text color" value="#1E2A3A">
      <span class="sep"></span>
      <button class="tbtn" data-cmd="justifyLeft" title="Align left">&#8676;</button>
      <button class="tbtn" data-cmd="justifyCenter" title="Align center">&#8596;</button>
      <button class="tbtn" data-cmd="justifyRight" title="Align right">&#8677;</button>
      <button class="tbtn" data-cmd="justifyFull" title="Justify">&#9636;</button>
      <span class="sep"></span>
      <button class="tbtn" data-cmd="insertUnorderedList" title="Bullet list">&#8226;&#8226;</button>
      <button class="tbtn" data-cmd="insertOrderedList" title="Numbered list">1.2.</button>
      <button class="tbtn" data-cmd="outdent" title="Decrease indent">&#8676;|</button>
      <button class="tbtn" data-cmd="indent" title="Increase indent">|&#8677;</button>
      <span class="sep"></span>
      <button class="tbtn" id="linkBtn" title="Insert link">&#128279;</button>
      <button class="tbtn" id="imageBtn" title="Insert image">&#128247;</button>
      <button class="tbtn" id="tableBtn" title="Insert table">&#8862;</button>
      <button class="tbtn" data-cmd="insertHorizontalRule" title="Insert divider">&#8213;</button>
      <span class="sep"></span>
      <button class="tbtn" data-cmd="undo" title="Undo (Ctrl+Z)">&#8634;</button>
      <button class="tbtn" data-cmd="redo" title="Redo (Ctrl+Y)">&#8635;</button>
      <button class="tbtn" data-cmd="removeFormat" title="Clear formatting">Tx</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="findBtn" title="Find and replace">&#128269; Find</button>
      <button class="tbtn wide" id="docExportBtn" title="Export as HTML">&#11015; Export</button>
      <button class="tbtn wide" id="docPrintBtn" title="Print / Save as PDF">&#128424; Print</button>
    </div>
    <div class="find-bar hidden" id="findBar">
      <input type="text" id="findInput" placeholder="Find">
      <input type="text" id="replaceInput" placeholder="Replace with">
      <button id="findNextBtn">Find next</button>
      <button id="replaceBtn">Replace</button>
      <button id="replaceAllBtn">Replace all</button>
      <button class="fb-close" id="findCloseBtn" aria-label="Close find bar">&#10005;</button>
    </div>
    <div class="editor-body">
      <div class="doc-page-wrap">
        <div class="doc-page" id="docPage" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document content"></div>
      </div>
    </div>
  `;

  const docPage = shell.querySelector('#docPage');
  const titleInput = shell.querySelector('#docTitle');
  const saveDot = shell.querySelector('#docSaveDot');
  const saveText = shell.querySelector('#docSaveText');

  // Load content
  docPage.innerHTML = (file.content && file.content.html) || '<p><br></p>';

  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background = 'var(--warning)';
    saveText.textContent = 'Saving…';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
  }
  function doSave(){
    file.name = titleInput.value.trim() || 'Untitled';
    file.content = { html: docPage.innerHTML };
    upsertFile(file);
    saveDot.style.background = '#5B8A5E';
    saveText.textContent = 'Saved';
  }

  docPage.addEventListener('input', markUnsaved);
  titleInput.addEventListener('input', markUnsaved);
  titleInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); docPage.focus(); } });

  // Toolbar commands
  shell.querySelectorAll('.tbtn[data-cmd]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      docPage.focus();
      document.execCommand(btn.dataset.cmd, false, null);
      markUnsaved();
      updateToolbarState();
    });
  });

  shell.querySelector('#blockStyle').addEventListener('change', (e)=>{
    docPage.focus();
    document.execCommand('formatBlock', false, e.target.value);
    markUnsaved();
  });
  shell.querySelector('#fontFamily').addEventListener('change', (e)=>{
    docPage.focus();
    document.execCommand('fontName', false, e.target.value);
    markUnsaved();
  });
  shell.querySelector('#fontSize').addEventListener('change', (e)=>{
    docPage.focus();
    document.execCommand('fontSize', false, e.target.value);
    markUnsaved();
  });
  shell.querySelector('#textColor').addEventListener('input', (e)=>{
    docPage.focus();
    document.execCommand('foreColor', false, e.target.value);
    markUnsaved();
  });

  shell.querySelector('#linkBtn').addEventListener('click', ()=>{
    const url = prompt('Enter URL:', 'https://');
    if(url){ docPage.focus(); document.execCommand('createLink', false, url); markUnsaved(); }
  });
  shell.querySelector('#imageBtn').addEventListener('click', ()=>{
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = 'image/*';
    inputEl.addEventListener('change', ()=>{
      const f = inputEl.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = (ev)=>{
        docPage.focus();
        document.execCommand('insertImage', false, ev.target.result);
        markUnsaved();
      };
      reader.readAsDataURL(f);
    });
    inputEl.click();
  });
  shell.querySelector('#tableBtn').addEventListener('click', ()=>{
    const rows = parseInt(prompt('Number of rows:', '3'), 10) || 3;
    const cols = parseInt(prompt('Number of columns:', '3'), 10) || 3;
    let html = '<table>';
    for(let r=0;r<rows;r++){
      html += '<tr>';
      for(let c=0;c<cols;c++) html += '<td><br></td>';
      html += '</tr>';
    }
    html += '</table><p><br></p>';
    docPage.focus();
    document.execCommand('insertHTML', false, html);
    markUnsaved();
  });

  shell.querySelector('#docExportBtn').addEventListener('click', ()=>{
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(file.name)}</title>
      <style>body{font-family:Georgia,serif;max-width:780px;margin:40px auto;line-height:1.7;padding:0 20px;}
      table{border-collapse:collapse;}td{border:1px solid #ccc;padding:6px 10px;}
      blockquote{border-left:3px solid #f59e0b;padding-left:16px;color:#555;font-style:italic;}
      </style></head><body>${docPage.innerHTML}</body></html>`], {type:'text/html'});
    downloadBlob(blob, (file.name || 'document') + '.html');
  });
  shell.querySelector('#docPrintBtn').addEventListener('click', ()=>{
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(file.name)}</title>
      <style>body{font-family:Georgia,serif;max-width:780px;margin:30px auto;line-height:1.7;}
      table{border-collapse:collapse;}td{border:1px solid #ccc;padding:6px 10px;}
      blockquote{border-left:3px solid #f59e0b;padding-left:16px;color:#555;font-style:italic;}
      img{max-width:100%;}</style></head><body>${docPage.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>{ w.focus(); w.print(); }, 300);
  });

  // Find & replace
  const findBar = shell.querySelector('#findBar');
  shell.querySelector('#findBtn').addEventListener('click', ()=>{
    findBar.classList.toggle('hidden');
    if(!findBar.classList.contains('hidden')) shell.querySelector('#findInput').focus();
  });
  shell.querySelector('#findCloseBtn').addEventListener('click', ()=> findBar.classList.add('hidden'));
  shell.querySelector('#findNextBtn').addEventListener('click', ()=>{
    const term = shell.querySelector('#findInput').value;
    if(!term) return;
    const found = window.find ? window.find(term) : false;
    if(!found) alert('No more matches found.');
  });
  shell.querySelector('#replaceBtn').addEventListener('click', ()=>{
    const term = shell.querySelector('#findInput').value;
    const repl = shell.querySelector('#replaceInput').value;
    if(!term) return;
    const sel = window.getSelection();
    if(sel && sel.toString().toLowerCase() === term.toLowerCase()){
      document.execCommand('insertText', false, repl);
      markUnsaved();
    }
    if(window.find) window.find(term);
  });
  shell.querySelector('#replaceAllBtn').addEventListener('click', ()=>{
    const term = shell.querySelector('#findInput').value;
    const repl = shell.querySelector('#replaceInput').value;
    if(!term) return;
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    docPage.innerHTML = docPage.innerHTML.replace(regex, repl);
    markUnsaved();
  });

  function updateToolbarState(){
    ['bold','italic','underline','strikeThrough','justifyLeft','justifyCenter','justifyRight','justifyFull','insertUnorderedList','insertOrderedList'].forEach(cmd=>{
      const btn = shell.querySelector(`.tbtn[data-cmd="${cmd}"]`);
      if(btn){
        try{ btn.setAttribute('aria-pressed', document.queryCommandState(cmd) ? 'true' : 'false'); }catch(e){}
      }
    });
  }
  docPage.addEventListener('keyup', updateToolbarState);
  docPage.addEventListener('mouseup', updateToolbarState);

  // keyboard shortcuts within doc
  docPage.addEventListener('keydown', (e)=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='b'){ e.preventDefault(); document.execCommand('bold'); markUnsaved(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='i'){ e.preventDefault(); document.execCommand('italic'); markUnsaved(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='u'){ e.preventDefault(); document.execCommand('underline'); markUnsaved(); }
  });

  shell.querySelector('#docBack').addEventListener('click', ()=>{
    doSave();
    closeEditor('docEditor');
  });

  docPage.focus();
}
