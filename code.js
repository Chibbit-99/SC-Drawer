/* =========================================================================
   CODE EDITOR
   Minimal code editor with syntax highlighting, line numbers, and formatting
   ========================================================================= */
function openCodeEditor(file){
  let shell = document.getElementById('codeEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');
  shell.innerHTML = `
    <style>
      .code-container{ flex:1; display:flex; overflow:hidden; }
      .code-gutter{ width:50px; background:var(--bg-app); border-right:1px solid var(--border); padding:0; font-size:13px; color:var(--text-muted); font-family:'Courier New',monospace; line-height:1.5; overflow:hidden; user-select:none; }
      .code-gutter span{ display:block; padding:0 8px; text-align:right; height:24px; box-sizing:border-box; }
      .code-wrap{ flex:1; overflow:auto; position:relative; }
      .code-editor{ position:absolute; inset:0; padding:16px; font-family:'Courier New',monospace; font-size:13px; line-height:1.5; color:var(--text-main); background:var(--bg-card); white-space:pre; overflow-wrap:normal; resize:none; tab-size:2; outline:none; border:none; z-index:2; }
      .code-highlight{ position:absolute; inset:0; padding:16px; font-family:'Courier New',monospace; font-size:13px; line-height:1.5; white-space:pre; overflow-wrap:normal; overflow:auto; pointer-events:none; z-index:1; }
      .code-highlight code{ color:var(--text-main); }
      .kw{ color:#3b82f6; font-weight:600; }
      .str{ color:#10b981; }
      .num{ color:#f59e0b; }
      .cmt{ color:#94a3b8; font-style:italic; }
      .tag{ color:#8b5cf6; }
      .attr{ color:#06b6d4; }
      .code-editor.wrap,.code-highlight.wrap{ white-space:pre-wrap; overflow-wrap:anywhere; }
      .code-find{ display:none; gap:6px; padding:8px 12px; border-bottom:1px solid var(--border); background:var(--bg-card); align-items:center; }
      .code-find.open{ display:flex; }
      .code-find input{ padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-app); color:var(--text-main); }
      .code-status{ margin-left:auto; font-size:12px; color:var(--text-muted); }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="codeBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="codeTitle" value="${escapeHtml(file.name)}" aria-label="Code file name">
      <div class="save-indicator"><span class="sdot" id="codeSaveDot"></span><span id="codeSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="Code tools">
      <select class="tsel" id="langSelect" aria-label="Programming language">
        <option value="auto">Auto-detect</option>
        <option value="javascript">JavaScript</option>
        <option value="html">HTML</option>
        <option value="css">CSS</option>
        <option value="json">JSON</option>
        <option value="python">Python</option>
        <option value="sql">SQL</option>
        <option value="xml">XML</option>
      </select>
      <span class="sep"></span>
      <button class="tbtn wide" id="formatBtn" title="Format code">⚙️ Format</button>
      <button class="tbtn wide" id="copyBtn" title="Copy code">📋 Copy</button>
      <button class="tbtn wide" id="findCodeBtn" title="Find and replace">🔎 Find</button>
      <button class="tbtn wide" id="commentBtn" title="Toggle line comments">💬 Comment</button>
      <button class="tbtn wide" id="wrapBtn" title="Toggle word wrap">↩ Wrap</button>
      <button class="tbtn wide" id="statsBtn" title="Code stats"># Stats</button>
      <button class="tbtn wide" id="snippetBtn" title="Insert snippet">＋ Snippet</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="codeExportBtn">&#11015; Export</button>
    </div>
    <div class="code-find" id="codeFindPanel"><input id="codeFindInput" placeholder="Find"><input id="codeReplaceInput" placeholder="Replace"><button class="tbtn" id="codeFindNext">Next</button><button class="tbtn" id="codeReplaceOne">Replace</button><button class="tbtn" id="codeReplaceAll">All</button><span class="code-status" id="codeStatus"></span></div>
    <div class="editor-body">
      <div class="code-container">
        <div class="code-gutter" id="codeGutter"></div>
        <div class="code-wrap">
          <div class="code-highlight" id="codeHighlight"><code></code></div>
          <textarea class="code-editor" id="codeEditor" spellcheck="false" aria-label="Code content"></textarea>
        </div>
      </div>
    </div>
  `;

  const titleInput = shell.querySelector('#codeTitle');
  const saveDot = shell.querySelector('#codeSaveDot');
  const saveText = shell.querySelector('#codeSaveText');
  const editor = shell.querySelector('#codeEditor');
  const gutter = shell.querySelector('#codeGutter');
  const highlight = shell.querySelector('#codeHighlight');
  const langSelect = shell.querySelector('#langSelect');

  let language = file.content && file.content.language ? file.content.language : 'auto';
  langSelect.value = language;

  // Load content
  editor.value = (file.content && file.content.code) || '';

  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background = 'var(--warning)';
    saveText.textContent = 'Saving…';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
  }
  function doSave(){
    file.name = titleInput.value.trim() || 'Untitled';
    file.content = { code: editor.value, language };
    upsertFile(file);
    saveDot.style.background = 'var(--success)';
    saveText.textContent = 'Saved';
  }

  function updateGutter(){
    const lines = editor.value.split('\n').length;
    gutter.innerHTML = '';
    for(let i=1;i<=lines;i++){
      const span = document.createElement('span');
      span.textContent = i;
      gutter.appendChild(span);
    }
  }

  function highlightCode(){
    const code = editor.value;
    const lang = language === 'auto' ? detectLanguage(code) : language;
    const highlighted = syntaxHighlight(code, lang);
    highlight.querySelector('code').innerHTML = highlighted;
  }

  function syncScroll(){
    highlight.parentElement.scrollTop = editor.scrollTop;
    highlight.parentElement.scrollLeft = editor.scrollLeft;
  }

  function detectLanguage(code){
    if(code.includes('<html') || code.includes('<!DOCTYPE')) return 'html';
    if(code.includes('{') && code.includes('}') && code.includes('"')) {
      try{ JSON.parse(code); return 'json'; }catch(e){}
    }
    if(code.match(/^#!/)) return 'python';
    if(code.includes('function ') || code.includes('=>')) return 'javascript';
    if(code.includes('SELECT ') || code.includes('INSERT ')) return 'sql';
    if(code.includes('<?xml')) return 'xml';
    if(code.match(/^\s*(\/\/|\/\*|const|let|var)/m)) return 'javascript';
    return 'javascript';
  }

  function syntaxHighlight(code, lang){
    code = escapeHtml(code);
    if(lang === 'javascript') return highlightJS(code);
    if(lang === 'html') return highlightHTML(code);
    if(lang === 'css') return highlightCSS(code);
    if(lang === 'json') return highlightJSON(code);
    if(lang === 'python') return highlightPython(code);
    if(lang === 'sql') return highlightSQL(code);
    if(lang === 'xml') return highlightXML(code);
    return code;
  }

  function highlightJS(code){
    return code
      .replace(/\b(function|const|let|var|if|else|for|while|return|class|import|export|async|await|new|this|null|undefined|true|false)\b/g, '<span class="kw">$1</span>')
      .replace(/"([^"\\]|\\.)*"/g, match => `<span class="str">${match}</span>`)
      .replace(/'([^'\\]|\\.)*'/g, match => `<span class="str">${match}</span>`)
      .replace(/\/\/.*$/gm, match => `<span class="cmt">${match}</span>`)
      .replace(/\/\*[\s\S]*?\*\//g, match => `<span class="cmt">${match}</span>`)
      .replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
  }

  function highlightHTML(code){
    return code
      .replace(/(&lt;\/?)(\w+)([^&]*?&gt;)/g, (match, open, tag, close) => {
        const attrs = highlightAttrs(close);
        return `${open}<span class="tag">${tag}</span>${attrs}&gt;`;
      })
      .replace(/"([^"\\]|\\.)*"/g, match => `<span class="str">${match}</span>`)
      .replace(/&lt;!--[\s\S]*?--&gt;/g, match => `<span class="cmt">${match}</span>`);
  }

  function highlightAttrs(text){
    return text.replace(/(\w+)=/g, '<span class="attr">$1</span>=');
  }

  function highlightCSS(code){
    return code
      .replace(/\b(color|background|width|height|margin|padding|font|display|position|top|left|right|bottom|border|box-shadow)\b/g, '<span class="attr">$1</span>')
      .replace(/#[\da-f]{3,6}|rgb[a]?\([^)]+\)/gi, match => `<span class="num">${match}</span>`)
      .replace(/"([^"\\]|\\.)*"/g, match => `<span class="str">${match}</span>`)
      .replace(/\/\*[\s\S]*?\*\//g, match => `<span class="cmt">${match}</span>`);
  }

  function highlightJSON(code){
    return code
      .replace(/"([^"\\]|\\.)*"(?=\s*:)/g, match => `<span class="attr">${match}</span>`)
      .replace(/"([^"\\]|\\.)*"/g, match => `<span class="str">${match}</span>`)
      .replace(/\b(true|false|null)\b/g, '<span class="kw">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
  }

  function highlightPython(code){
    return code
      .replace(/\b(def|class|if|elif|else|for|while|return|import|from|as|with|try|except|finally|lambda|and|or|not|True|False|None)\b/g, '<span class="kw">$1</span>')
      .replace(/"([^"\\]|\\.)*"/g, match => `<span class="str">${match}</span>`)
      .replace(/'([^'\\]|\\.)*'/g, match => `<span class="str">${match}</span>`)
      .replace(/#.*$/gm, match => `<span class="cmt">${match}</span>`)
      .replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
  }

  function highlightSQL(code){
    return code
      .replace(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WHERE|FROM|JOIN|ON|GROUP|BY|ORDER|LIMIT|OFFSET|INNER|LEFT|RIGHT|FULL|AS)\b/gi, '<span class="kw">$&</span>')
      .replace(/'([^'\\]|\\.)*'/g, match => `<span class="str">${match}</span>`)
      .replace(/--.*$/gm, match => `<span class="cmt">${match}</span>`)
      .replace(/\/\*[\s\S]*?\*\//g, match => `<span class="cmt">${match}</span>`)
      .replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
  }

  function highlightXML(code){
    return code
      .replace(/(&lt;\/?)(\w+)((?:\s+[\w-]+="[^"]*")*\s*\/?&gt;)/g, (match, open, tag, attrs) => {
        const highlightedAttrs = attrs.replace(/(\w+)=/g, '<span class="attr">$1</span>=');
        return `${open}<span class="tag">${tag}</span>${highlightedAttrs}`;
      })
      .replace(/"([^"\\]|\\.)*"/g, match => `<span class="str">${match}</span>`)
      .replace(/&lt;!--[\s\S]*?--&gt;/g, match => `<span class="cmt">${match}</span>`);
  }

  editor.addEventListener('input', ()=>{
    updateGutter();
    highlightCode();
    updateStatus();
    markUnsaved();
  });
  editor.addEventListener('scroll', syncScroll);
  titleInput.addEventListener('input', markUnsaved);
  titleInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); editor.focus(); } });
  langSelect.addEventListener('change', (e)=>{
    language = e.target.value;
    highlightCode();
    markUnsaved();
  });

  shell.querySelector('#formatBtn').addEventListener('click', ()=>{
    const lang = language === 'auto' ? detectLanguage(editor.value) : language;
    if(lang === 'json'){
      try{
        const parsed = JSON.parse(editor.value);
        editor.value = JSON.stringify(parsed, null, 2);
        updateGutter();
        highlightCode();
        markUnsaved();
      }catch(e){ alert('Invalid JSON'); }
    } else if(lang === 'html' || lang === 'xml'){
      editor.value = editor.value.replace(/></g, '>\n<').trim();
      updateGutter();
      highlightCode();
      markUnsaved();
    } else {
      alert('Format not yet supported for this language');
    }
  });

  shell.querySelector('#copyBtn').addEventListener('click', ()=>{
    editor.select();
    document.execCommand('copy');
    const btn = shell.querySelector('#copyBtn');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(()=>{ btn.textContent = orig; }, 1500);
  });


  function getLineComment(){
    const lang = language === 'auto' ? detectLanguage(editor.value) : language;
    return ({html:'<!--', xml:'<!--', css:'/*', sql:'--', python:'#', javascript:'//'})[lang] || '//';
  }
  function selectedLineRange(){
    const start = editor.value.lastIndexOf('\n', editor.selectionStart - 1) + 1;
    let end = editor.value.indexOf('\n', editor.selectionEnd);
    if(end === -1) end = editor.value.length;
    return { start, end };
  }
  function updateStatus(){
    const text = editor.value;
    const lines = text ? text.split('\n').length : 1;
    const words = (text.match(/\b\w+\b/g) || []).length;
    const bytes = new Blob([text]).size;
    const lang = language === 'auto' ? detectLanguage(text) : language;
    const status = shell.querySelector('#codeStatus');
    if(status) status.textContent = `${lang} • ${lines} lines • ${words} words • ${bytes} bytes`;
  }
  shell.querySelector('#findCodeBtn').addEventListener('click',()=>{
    const panel = shell.querySelector('#codeFindPanel');
    panel.classList.toggle('open');
    updateStatus();
    if(panel.classList.contains('open')) shell.querySelector('#codeFindInput').focus();
  });
  shell.querySelector('#codeFindNext').addEventListener('click',()=>{
    const q = shell.querySelector('#codeFindInput').value;
    if(!q) return;
    let i = editor.value.indexOf(q, editor.selectionEnd);
    if(i < 0) i = editor.value.indexOf(q);
    if(i >= 0){ editor.focus(); editor.setSelectionRange(i, i + q.length); }
    updateStatus();
  });
  shell.querySelector('#codeReplaceOne').addEventListener('click',()=>{
    const q=shell.querySelector('#codeFindInput').value, r=shell.querySelector('#codeReplaceInput').value;
    if(q && editor.value.slice(editor.selectionStart, editor.selectionEnd) === q){ document.execCommand('insertText', false, r); markUnsaved(); updateGutter(); highlightCode(); updateStatus(); }
  });
  shell.querySelector('#codeReplaceAll').addEventListener('click',()=>{
    const q=shell.querySelector('#codeFindInput').value, r=shell.querySelector('#codeReplaceInput').value;
    if(q){ editor.value = editor.value.split(q).join(r); markUnsaved(); updateGutter(); highlightCode(); updateStatus(); }
  });
  shell.querySelector('#commentBtn').addEventListener('click',()=>{
    const range = selectedLineRange();
    const prefix = getLineComment();
    const block = editor.value.slice(range.start, range.end);
    const uncomment = block.split('\n').every(line => line.trim() === '' || line.trimStart().startsWith(prefix));
    const next = block.split('\n').map(line => uncomment ? line.replace(new RegExp('^(\\s*)'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s?'), '$1') : prefix + ' ' + line).join('\n');
    editor.setRangeText(next, range.start, range.end, 'select'); markUnsaved(); updateGutter(); highlightCode(); updateStatus();
  });
  shell.querySelector('#wrapBtn').addEventListener('click',()=>{ editor.classList.toggle('wrap'); highlight.classList.toggle('wrap'); });
  shell.querySelector('#statsBtn').addEventListener('click',()=>{ updateStatus(); alert(shell.querySelector('#codeStatus').textContent); });
  shell.querySelector('#snippetBtn').addEventListener('click',()=>{
    const lang = language === 'auto' ? detectLanguage(editor.value) : language;
    const snippets = { javascript:'function name(args){\n  return args;\n}\n', html:'<section>\n  <h1>Title</h1>\n</section>\n', css:'.class-name{\n  display:flex;\n  gap:1rem;\n}\n', python:'def name(args):\n    return args\n', sql:'SELECT *\nFROM table_name\nWHERE condition;\n', json:'{\n  "key": "value"\n}\n' };
    editor.setRangeText(snippets[lang] || snippets.javascript, editor.selectionStart, editor.selectionEnd, 'end'); markUnsaved(); updateGutter(); highlightCode(); updateStatus();
  });

  shell.querySelector('#codeExportBtn').addEventListener('click', ()=>{
    const ext = language === 'auto' ? 'txt' : language.replace('auto', 'txt');
    downloadBlob(new Blob([editor.value], {type:'text/plain'}), (file.name || 'code') + '.' + ext);
  });

  shell.querySelector('#codeBack').addEventListener('click', ()=>{
    doSave();
    closeEditor('codeEditor');
  });

  // Initial render
  updateGutter();
  highlightCode();
  updateStatus();
  editor.focus();
}
