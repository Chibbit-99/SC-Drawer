/* =========================================================================
   SPREADSHEET EDITOR
   Grid with formulas (SUM, AVERAGE, MIN, MAX, COUNT, IF, basic math/refs),
   cell formatting, row/col insert/delete, sorting.
   ========================================================================= */
function colLabel(i){
  let s = '';
  i++;
  while(i>0){
    let rem = (i-1)%26;
    s = String.fromCharCode(65+rem) + s;
    i = Math.floor((i-1)/26);
  }
  return s;
}
function cellKey(r,c){ return r+'_'+c; }

function openSheetEditor(file){
  let shell = document.getElementById('sheetEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');

  if(!file.content || !file.content.cells){
    file.content = defaultContentFor('sheet');
  }
  const content = file.content;
  if(!content.formats) content.formats = {};

  shell.innerHTML = `
    <style>
      .sheet-wrap{ flex:1; overflow:auto; background:var(--bg-app); position:relative; }
      table.sheet-table{ border-collapse:collapse; table-layout:fixed; background:var(--bg-card); }
      table.sheet-table th, table.sheet-table td{
        border:1px solid var(--border); padding:0; position:relative; height:28px;
      }
      table.sheet-table th{
        background:var(--bg-app); font-size:11.5px; color:var(--text-muted); font-weight:600;
        position:sticky; top:0; z-index:3; min-width:90px; user-select:none; text-align:center;
      }
      table.sheet-table th.row-head{
        position:sticky; left:0; z-index:4; width:44px; min-width:44px; text-align:center;
      }
      table.sheet-table th.corner{ left:0; top:0; z-index:5; width:44px; min-width:44px; }
      table.sheet-table td{ min-width:90px; background:var(--bg-card); }
      .cell-input{
        width:100%; height:28px; border:none; padding:4px 6px; font-size:13px; background:transparent;
        outline:none; box-sizing:border-box; color:var(--text-main); font-family:system-ui,sans-serif;
      }
      table.sheet-table td.selected{ outline:2px solid var(--primary); outline-offset:-1px; background:var(--sheet-tint); }
      table.sheet-table td.col-selected, table.sheet-table th.col-selected{ background:var(--sheet-tint); }
      .formula-bar{ display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid var(--border); background:var(--bg-card); flex-wrap:wrap; }
      .formula-bar .cellref{ font-size:12px; font-weight:700; color:var(--text-muted); width:50px; flex-shrink:0; }
      .formula-bar input{ flex:1; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; font-family:'Courier New',monospace;background:var(--bg-app);color:var(--text-main);transition:var(--transition); }
      .formula-bar input:focus{ border-color:var(--primary);outline:none; }
      .row-head{ font-size:11px; text-align:center; color:var(--text-muted); cursor:pointer; }
      table.sheet-table td { background:var(--bg-card); }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="sheetBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="sheetTitle" value="${escapeHtml(file.name)}" aria-label="Spreadsheet title">
      <div class="save-indicator"><span class="sdot" id="sheetSaveDot"></span><span id="sheetSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="Sheet tools">
      <button class="tbtn" id="boldBtn" title="Bold"><b>B</b></button>
      <button class="tbtn" id="italicBtn" title="Italic"><i>I</i></button>
      <input type="color" id="bgFillInput" title="Cell fill color" value="#ffffff">
      <input type="color" id="textColorInput" title="Text color" value="#1E2A3A">
      <select class="tsel" id="alignSel" title="Alignment">
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
      <select class="tsel" id="numFormatSel" title="Number format">
        <option value="none">Plain</option>
        <option value="number">Number (1,234.00)</option>
        <option value="currency">Currency ($)</option>
        <option value="percent">Percent (%)</option>
      </select>
      <span class="sep"></span>
      <button class="tbtn wide" id="insertRowBtn">+ Row</button>
      <button class="tbtn wide" id="insertColBtn">+ Col</button>
      <button class="tbtn wide" id="delRowBtn">&minus; Row</button>
      <button class="tbtn wide" id="delColBtn">&minus; Col</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="sortAscBtn">A&#8595;Z Sort</button>
      <button class="tbtn wide" id="clearBtn">Clear cell</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="sheetExportBtn">&#11015; Export CSV</button>
    </div>
    <div class="formula-bar">
      <span class="cellref" id="cellRefLabel">A1</span>
      <input type="text" id="formulaInput" placeholder="Enter value or formula, e.g. =SUM(A1:A5)" aria-label="Formula input">
    </div>
    <div class="editor-body">
      <div class="sheet-wrap" id="sheetWrap"></div>
    </div>
  `;

  const titleInput = shell.querySelector('#sheetTitle');
  const saveDot = shell.querySelector('#sheetSaveDot');
  const saveText = shell.querySelector('#sheetSaveText');
  const sheetWrap = shell.querySelector('#sheetWrap');
  const formulaInput = shell.querySelector('#formulaInput');
  const cellRefLabel = shell.querySelector('#cellRefLabel');

  let selR = 0, selC = 0;

  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background = 'var(--warning)';
    saveText.textContent = 'Saving…';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
  }
  function doSave(){
    file.name = titleInput.value.trim() || 'Untitled';
    upsertFile(file);
    saveDot.style.background = '#5B8A5E';
    saveText.textContent = 'Saved';
  }
  titleInput.addEventListener('input', markUnsaved);

  function getRaw(r,c){ return content.cells[cellKey(r,c)] || ''; }
  function setRaw(r,c,val){
    const key = cellKey(r,c);
    if(val === '') delete content.cells[key];
    else content.cells[key] = val;
  }
  function getFormat(r,c){ return content.formats[cellKey(r,c)] || {}; }
  function setFormat(r,c,patch){
    const key = cellKey(r,c);
    content.formats[key] = Object.assign({}, content.formats[key], patch);
  }

  // ---- Formula evaluation ----
  function colToIdx(label){
    let n = 0;
    for(let i=0;i<label.length;i++) n = n*26 + (label.charCodeAt(i)-64);
    return n-1;
  }
  function parseRef(ref){
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if(!m) return null;
    return { c: colToIdx(m[1]), r: parseInt(m[2],10)-1 };
  }
  function getComputed(r,c, seen){
    seen = seen || new Set();
    const key = cellKey(r,c);
    if(seen.has(key)) return '#REF!';
    seen.add(key);
    const raw = getRaw(r,c);
    if(typeof raw === 'string' && raw.startsWith('=')){
      try{
        return evalFormula(raw.slice(1), seen);
      }catch(e){
        return '#ERR!';
      }
    }
    return raw;
  }
  function rangeValues(rangeStr, seen){
    const [a,b] = rangeStr.split(':');
    const ra = parseRef(a), rb = parseRef(b);
    if(!ra || !rb) return [];
    const r0=Math.min(ra.r,rb.r), r1=Math.max(ra.r,rb.r);
    const c0=Math.min(ra.c,rb.c), c1=Math.max(ra.c,rb.c);
    const vals = [];
    for(let r=r0;r<=r1;r++){
      for(let c=c0;c<=c1;c++){
        const v = getComputed(r,c, new Set(seen));
        const n = parseFloat(v);
        if(!isNaN(n)) vals.push(n);
      }
    }
    return vals;
  }
  function evalFormula(expr, seen){
    expr = expr.trim();
    // Functions: SUM, AVERAGE, MIN, MAX, COUNT, IF
    const fnMatch = expr.match(/^([A-Z]+)\((.*)\)$/i);
    if(fnMatch){
      const fn = fnMatch[1].toUpperCase();
      const argsStr = fnMatch[2];
      if(fn === 'SUM' || fn === 'AVERAGE' || fn === 'MIN' || fn === 'MAX' || fn === 'COUNT'){
        let vals = [];
        argsStr.split(',').forEach(part=>{
          part = part.trim();
          if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(part)) vals = vals.concat(rangeValues(part.toUpperCase(), seen));
          else {
            const n = parseFloat(resolveRefsAndEval(part, seen));
            if(!isNaN(n)) vals.push(n);
          }
        });
        if(fn==='SUM') return vals.reduce((a,b)=>a+b,0);
        if(fn==='AVERAGE') return vals.length? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
        if(fn==='MIN') return vals.length? Math.min(...vals) : 0;
        if(fn==='MAX') return vals.length? Math.max(...vals) : 0;
        if(fn==='COUNT') return vals.length;
      }
      if(fn === 'IF'){
        const parts = splitArgs(argsStr);
        const cond = resolveRefsAndEval(parts[0], seen);
        const condVal = evalCondition(cond);
        return condVal ? stripQuotes(resolveRefsAndEval(parts[1], seen)) : stripQuotes(resolveRefsAndEval(parts[2], seen));
      }
      if(fn === 'CONCAT' || fn === 'CONCATENATE'){
        const parts = splitArgs(argsStr);
        return parts.map(p=>stripQuotes(resolveRefsAndEval(p, seen))).join('');
      }
      if(fn === 'ROUND'){
        const parts = splitArgs(argsStr);
        const num = parseFloat(resolveRefsAndEval(parts[0], seen));
        const digits = parts[1]!==undefined ? parseInt(resolveRefsAndEval(parts[1], seen),10) : 0;
        return Math.round(num * Math.pow(10,digits)) / Math.pow(10,digits);
      }
      if(fn === 'ABS') return Math.abs(parseFloat(resolveRefsAndEval(argsStr, seen)));
      if(fn === 'TODAY') return new Date().toLocaleDateString();
    }
    return resolveRefsAndEval(expr, seen);
  }
  function splitArgs(str){
    // split on commas not inside quotes
    const out = []; let cur=''; let inQ=false;
    for(let i=0;i<str.length;i++){
      const ch = str[i];
      if(ch === '"') inQ = !inQ;
      if(ch === ',' && !inQ){ out.push(cur); cur=''; }
      else cur += ch;
    }
    if(cur) out.push(cur);
    return out.map(s=>s.trim());
  }
  function stripQuotes(s){
    if(typeof s === 'string' && s.startsWith('"') && s.endsWith('"')) return s.slice(1,-1);
    return s;
  }
  function evalCondition(str){
    str = String(str);
    const m = str.match(/^(.*?)(>=|<=|<>|!=|=|>|<)(.*)$/);
    if(!m) return !!parseFloat(str);
    let [_, left, op, right] = m;
    left = left.trim(); right = right.trim();
    const ln = parseFloat(left), rn = parseFloat(right);
    const bothNum = !isNaN(ln) && !isNaN(rn);
    const lv = bothNum ? ln : stripQuotes(left);
    const rv = bothNum ? rn : stripQuotes(right);
    switch(op){
      case '=': return lv === rv;
      case '<>': case '!=': return lv !== rv;
      case '>': return lv > rv;
      case '<': return lv < rv;
      case '>=': return lv >= rv;
      case '<=': return lv <= rv;
    }
    return false;
  }
  function resolveRefsAndEval(str, seen){
    str = str.trim();
    if(/^".*"$/.test(str)) return str;
    // replace cell refs with their computed values
    const replaced = str.replace(/\b([A-Z]+\d+)\b/g, (m)=>{
      const ref = parseRef(m);
      if(!ref) return m;
      const v = getComputed(ref.r, ref.c, seen);
      const n = parseFloat(v);
      return isNaN(n) ? `"${String(v).replace(/"/g,'')}"` : n;
    });
    // if it's a condition expr (used by IF), return as is for evalCondition to use later;
    // otherwise try arithmetic eval
    if(/^[-+*/0-9.()\s]+$/.test(replaced)){
      try{ return Function('"use strict";return ('+replaced+')')(); }catch(e){ return replaced; }
    }
    return replaced;
  }

  function displayValue(r,c){
    const raw = getRaw(r,c);
    let val;
    if(typeof raw === 'string' && raw.startsWith('=')){
      try{ val = evalFormula(raw.slice(1), new Set()); }catch(e){ val = '#ERR!'; }
    } else {
      val = raw;
    }
    const fmt = getFormat(r,c);
    if(fmt.numFormat && val !== '' && !isNaN(parseFloat(val))){
      const num = parseFloat(val);
      if(fmt.numFormat === 'number') return num.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(fmt.numFormat === 'currency') return '$' + num.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(fmt.numFormat === 'percent') return (num*100).toFixed(1) + '%';
    }
    return val;
  }

  // ---- Rendering grid ----
  function renderGrid(){
    let html = '<table class="sheet-table"><thead><tr><th class="corner"></th>';
    for(let c=0;c<content.cols;c++) html += `<th data-col="${c}">${colLabel(c)}</th>`;
    html += '</tr></thead><tbody>';
    for(let r=0;r<content.rows;r++){
      html += `<tr><th class="row-head" data-row="${r}">${r+1}</th>`;
      for(let c=0;c<content.cols;c++){
        const fmt = getFormat(r,c);
        const style = [
          fmt.bold ? 'font-weight:700;' : '',
          fmt.italic ? 'font-style:italic;' : '',
          fmt.color ? `color:${fmt.color};` : '',
          fmt.bg ? `background:${fmt.bg};` : '',
          fmt.align ? `text-align:${fmt.align};` : '',
        ].join('');
        const val = displayValue(r,c);
        html += `<td data-row="${r}" data-col="${c}" style="${style}">${escapeHtml(String(val))}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    sheetWrap.innerHTML = html;
    attachGridHandlers();
    highlightSelection();
  }

  function attachGridHandlers(){
    sheetWrap.querySelectorAll('td[data-row]').forEach(td=>{
      td.addEventListener('click', ()=>{
        selR = parseInt(td.dataset.row,10);
        selC = parseInt(td.dataset.col,10);
        syncFormulaBar();
        highlightSelection();
      });
      td.addEventListener('dblclick', ()=> beginEdit(td));
    });
    sheetWrap.querySelectorAll('th[data-col]').forEach(th=>{
      th.addEventListener('click', ()=>{
        const c = parseInt(th.dataset.col,10);
        sheetWrap.querySelectorAll(`[data-col="${c}"]`).forEach(el=>el.classList.add('col-selected'));
      });
    });
  }

  function highlightSelection(){
    sheetWrap.querySelectorAll('td.selected').forEach(td=>td.classList.remove('selected'));
    const td = sheetWrap.querySelector(`td[data-row="${selR}"][data-col="${selC}"]`);
    if(td){
      td.classList.add('selected');
      td.scrollIntoView({block:'nearest', inline:'nearest'});
    }
  }

  function syncFormulaBar(){
    cellRefLabel.textContent = colLabel(selC) + (selR+1);
    formulaInput.value = getRaw(selR, selC);
    const fmt = getFormat(selR, selC);
    shell.querySelector('#boldBtn').setAttribute('aria-pressed', fmt.bold? 'true':'false');
    shell.querySelector('#italicBtn').setAttribute('aria-pressed', fmt.italic? 'true':'false');
    shell.querySelector('#alignSel').value = fmt.align || 'left';
    shell.querySelector('#numFormatSel').value = fmt.numFormat || 'none';
    shell.querySelector('#textColorInput').value = fmt.color || '#1E2A3A';
    shell.querySelector('#bgFillInput').value = fmt.bg || '#ffffff';
  }

  function beginEdit(td){
    const r = parseInt(td.dataset.row,10), c = parseInt(td.dataset.col,10);
    const raw = getRaw(r,c);
    td.innerHTML = `<input class="cell-input" value="${escapeHtml(String(raw))}">`;
    const input = td.querySelector('input');
    input.focus(); input.select();
    function commit(moveDir){
      const newVal = input.value;
      setRaw(r,c,newVal);
      markUnsaved();
      renderGrid();
      if(moveDir === 'down' && r < content.rows-1) { selR=r+1; selC=c; }
      else if(moveDir === 'right' && c < content.cols-1) { selR=r; selC=c+1; }
      else { selR=r; selC=c; }
      syncFormulaBar();
      highlightSelection();
    }
    input.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); commit('down'); }
      else if(e.key === 'Tab'){ e.preventDefault(); commit('right'); }
      else if(e.key === 'Escape'){ renderGrid(); }
    });
    input.addEventListener('blur', ()=> commit(null));
  }

  // formula bar editing
  formulaInput.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){
      setRaw(selR, selC, formulaInput.value);
      markUnsaved();
      renderGrid();
      if(selR < content.rows-1) selR++;
      syncFormulaBar();
      highlightSelection();
    }
  });
  formulaInput.addEventListener('change', ()=>{
    setRaw(selR, selC, formulaInput.value);
    markUnsaved();
    renderGrid();
    syncFormulaBar();
  });

  // keyboard navigation
  shell.addEventListener('keydown', (e)=>{
    if(document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement !== formulaInput) return;
    if(document.activeElement === formulaInput) return;
    let moved = true;
    if(e.key === 'ArrowDown' && selR < content.rows-1) selR++;
    else if(e.key === 'ArrowUp' && selR > 0) selR--;
    else if(e.key === 'ArrowRight' && selC < content.cols-1) selC++;
    else if(e.key === 'ArrowLeft' && selC > 0) selC--;
    else if(e.key === 'Enter'){
      const td = sheetWrap.querySelector(`td[data-row="${selR}"][data-col="${selC}"]`);
      if(td) beginEdit(td);
      moved = false;
    }
    else if(e.key === 'Delete' || e.key === 'Backspace'){
      setRaw(selR, selC, ''); markUnsaved(); renderGrid(); moved=false;
    }
    else if(e.key.length === 1 && !e.ctrlKey && !e.metaKey){
      const td = sheetWrap.querySelector(`td[data-row="${selR}"][data-col="${selC}"]`);
      if(td){
        beginEdit(td);
        const input = td.querySelector('input');
        input.value = e.key;
        input.setSelectionRange(1,1);
      }
      moved = false;
    } else { moved = false; }
    if(moved){ e.preventDefault(); syncFormulaBar(); highlightSelection(); }
  });

  // ---- Toolbar formatting actions ----
  shell.querySelector('#boldBtn').addEventListener('click', ()=>{
    const fmt = getFormat(selR,selC);
    setFormat(selR,selC,{bold: !fmt.bold});
    markUnsaved(); renderGrid(); syncFormulaBar();
  });
  shell.querySelector('#italicBtn').addEventListener('click', ()=>{
    const fmt = getFormat(selR,selC);
    setFormat(selR,selC,{italic: !fmt.italic});
    markUnsaved(); renderGrid(); syncFormulaBar();
  });
  shell.querySelector('#bgFillInput').addEventListener('input', (e)=>{
    setFormat(selR,selC,{bg: e.target.value});
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#textColorInput').addEventListener('input', (e)=>{
    setFormat(selR,selC,{color: e.target.value});
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#alignSel').addEventListener('change', (e)=>{
    setFormat(selR,selC,{align: e.target.value});
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#numFormatSel').addEventListener('change', (e)=>{
    setFormat(selR,selC,{numFormat: e.target.value});
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#clearBtn').addEventListener('click', ()=>{
    setRaw(selR,selC,''); content.formats[cellKey(selR,selC)] = {};
    markUnsaved(); renderGrid(); syncFormulaBar();
  });

  // ---- Row/col insert/delete ----
  shell.querySelector('#insertRowBtn').addEventListener('click', ()=>{
    content.rows++;
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#insertColBtn').addEventListener('click', ()=>{
    content.cols++;
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#delRowBtn').addEventListener('click', ()=>{
    if(content.rows <= 1) return;
    // shift cells up from selR
    for(let r=selR; r<content.rows-1; r++){
      for(let c=0;c<content.cols;c++){
        content.cells[cellKey(r,c)] = content.cells[cellKey(r+1,c)];
        content.formats[cellKey(r,c)] = content.formats[cellKey(r+1,c)];
        if(content.cells[cellKey(r,c)] === undefined) delete content.cells[cellKey(r,c)];
      }
    }
    for(let c=0;c<content.cols;c++){ delete content.cells[cellKey(content.rows-1,c)]; delete content.formats[cellKey(content.rows-1,c)]; }
    content.rows--;
    if(selR >= content.rows) selR = content.rows-1;
    markUnsaved(); renderGrid(); syncFormulaBar();
  });
  shell.querySelector('#delColBtn').addEventListener('click', ()=>{
    if(content.cols <= 1) return;
    for(let c=selC; c<content.cols-1; c++){
      for(let r=0;r<content.rows;r++){
        content.cells[cellKey(r,c)] = content.cells[cellKey(r,c+1)];
        content.formats[cellKey(r,c)] = content.formats[cellKey(r,c+1)];
        if(content.cells[cellKey(r,c)] === undefined) delete content.cells[cellKey(r,c)];
      }
    }
    for(let r=0;r<content.rows;r++){ delete content.cells[cellKey(r,content.cols-1)]; delete content.formats[cellKey(r,content.cols-1)]; }
    content.cols--;
    if(selC >= content.cols) selC = content.cols-1;
    markUnsaved(); renderGrid(); syncFormulaBar();
  });

  // ---- Sort ----
  shell.querySelector('#sortAscBtn').addEventListener('click', ()=>{
    const col = selC;
    const dataRows = [];
    for(let r=0;r<content.rows;r++){
      const row = {};
      for(let c=0;c<content.cols;c++){ row[c] = content.cells[cellKey(r,c)]; }
      dataRows.push(row);
    }
    dataRows.sort((a,b)=>{
      const av = a[col] ?? '', bv = b[col] ?? '';
      const an = parseFloat(av), bn = parseFloat(bv);
      if(!isNaN(an) && !isNaN(bn)) return an-bn;
      return String(av).localeCompare(String(bv));
    });
    const newCells = {};
    dataRows.forEach((row, r)=>{
      for(let c=0;c<content.cols;c++){
        if(row[c] !== undefined) newCells[cellKey(r,c)] = row[c];
      }
    });
    content.cells = newCells;
    markUnsaved(); renderGrid();
  });

  // ---- Export CSV ----
  shell.querySelector('#sheetExportBtn').addEventListener('click', ()=>{
    let csv = '';
    for(let r=0;r<content.rows;r++){
      const rowVals = [];
      let rowHasData = false;
      for(let c=0;c<content.cols;c++){
        const v = displayValue(r,c);
        if(v !== '') rowHasData = true;
        const s = String(v).replace(/"/g,'""');
        rowVals.push(/[,"\n]/.test(s) ? `"${s}"` : s);
      }
      if(rowHasData || r < content.rows) csv += rowVals.join(',') + '\n';
    }
    downloadBlob(new Blob([csv], {type:'text/csv'}), (file.name||'spreadsheet') + '.csv');
  });

  shell.querySelector('#sheetBack').addEventListener('click', ()=>{
    doSave();
    closeEditor('sheetEditor');
  });

  renderGrid();
  syncFormulaBar();
}
