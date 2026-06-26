/* =========================================================================
   SPREADSHEET EDITOR — Enhanced
   Multi-cell selection, charts (bar/line/pie), extended formula library,
   undo/redo, find & replace, fill down/right, copy/paste, borders,
   underline, strikethrough, font size, freeze header row, sort asc/desc.
   ========================================================================= */
function colLabel(i){
  let s=''; i++;
  while(i>0){ let rem=(i-1)%26; s=String.fromCharCode(65+rem)+s; i=Math.floor((i-1)/26); }
  return s;
}
function cellKey(r,c){ return r+'_'+c; }

function openSheetEditor(file){
  let shell = document.getElementById('sheetEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');

  if(!file.content || !file.content.cells) file.content = defaultContentFor('sheet');
  const content = file.content;
  if(!content.formats) content.formats = {};
  if(!content.charts) content.charts = [];

  /* ---- Undo / Redo stacks ---- */
  const undoStack = [], redoStack = [];
  function snapshot(){
    undoStack.push(JSON.stringify({ cells: content.cells, formats: content.formats, rows: content.rows, cols: content.cols }));
    if(undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function undo(){
    if(!undoStack.length) return;
    redoStack.push(JSON.stringify({ cells: content.cells, formats: content.formats, rows: content.rows, cols: content.cols }));
    const prev = JSON.parse(undoStack.pop());
    Object.assign(content, prev);
    renderGrid(); syncFormulaBar();
  }
  function redo(){
    if(!redoStack.length) return;
    undoStack.push(JSON.stringify({ cells: content.cells, formats: content.formats, rows: content.rows, cols: content.cols }));
    const next = JSON.parse(redoStack.pop());
    Object.assign(content, next);
    renderGrid(); syncFormulaBar();
  }

  /* ---- Clipboard ---- */
  let clipboardCells = null; // { data[][], r0, c0 }

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
    table.sheet-table td{ min-width:90px; background:var(--bg-card); overflow:hidden; white-space:nowrap; }
    table.sheet-table td.wrap-text{ white-space:pre-wrap; height:auto; }
    .cell-input{
      width:100%; height:28px; border:none; padding:4px 6px; font-size:13px; background:transparent;
      outline:none; box-sizing:border-box; color:var(--text-main); font-family:system-ui,sans-serif;
    }
    table.sheet-table td.selected{ outline:2px solid var(--primary); outline-offset:-1px; z-index:2; }
    table.sheet-table td.in-selection{ background:rgba(59,130,246,0.12) !important; }
    table.sheet-table td.anchor{ outline:2px solid var(--primary); outline-offset:-1px; z-index:2; background:rgba(59,130,246,0.08) !important; }
    table.sheet-table th.col-header-sel{ background:#dbeafe; color:#1d4ed8; }
    table.sheet-table th.row-header-sel{ background:#dbeafe; color:#1d4ed8; }
    .formula-bar{ display:flex; align-items:center; gap:10px; padding:8px 16px; border-bottom:1px solid var(--border); background:var(--bg-card); }
    .formula-bar .cellref{ font-size:12px; font-weight:700; color:var(--text-muted); width:64px; flex-shrink:0; font-family:'Courier New',monospace; }
    .formula-bar input{ flex:1; padding:7px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; font-family:'Courier New',monospace; background:var(--bg-app); color:var(--text-main); transition:var(--transition); }
    .formula-bar input:focus{ border-color:var(--primary); outline:none; }
    .row-head{ font-size:11px; text-align:center; color:var(--text-muted); cursor:pointer; user-select:none; }
    /* toolbar second row */
    .editor-toolbar-row2{ display:flex; align-items:center; gap:6px; padding:6px 16px; border-bottom:1px solid var(--border); background:var(--bg-card); flex-wrap:wrap; overflow-x:auto; }
    /* chart panel */
    #chartPanel{
      position:fixed; inset:0; background:rgba(15,23,42,0.45); z-index:200;
      display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);
    }
    #chartPanel.hidden{ display:none !important; }
    .chart-modal{
      background:var(--bg-card); border-radius:14px; padding:28px; width:680px; max-width:96vw;
      max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.18);
    }
    .chart-modal h3{ margin:0 0 16px; font-size:17px; font-weight:700; }
    .chart-canvas-wrap{ background:#f8fafc; border-radius:10px; padding:10px; margin-top:16px; }
    canvas#chartCanvas{ width:100%; display:block; }
    .chart-cfg{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
    .chart-cfg label{ font-size:12.5px; font-weight:600; color:var(--text-muted); display:flex; flex-direction:column; gap:4px; }
    .chart-cfg input, .chart-cfg select{ padding:7px 10px; border:1px solid var(--border); border-radius:6px; font-size:13px; font-family:inherit; background:var(--bg-app); color:var(--text-main); }
    /* find/replace */
    #findPanel{
      position:absolute; top:0; right:0; background:var(--bg-card); border:1px solid var(--border);
      border-radius:10px; padding:14px 16px; z-index:100; box-shadow:var(--shadow-lg);
      display:flex; flex-direction:column; gap:10px; width:300px; margin:12px;
    }
    #findPanel.hidden{ display:none !important; }
    #findPanel input{ padding:7px 10px; border:1px solid var(--border); border-radius:6px; font-size:13px; font-family:inherit; background:var(--bg-app); color:var(--text-main); }
    #findPanel .find-row{ display:flex; gap:6px; }
    #findPanel .find-row button{ flex:1; padding:6px; border-radius:6px; font-size:12px; font-weight:600; border:1px solid var(--border); background:var(--bg-card); color:var(--text-main); cursor:pointer; }
    #findPanel .find-row button:hover{ background:var(--primary); color:#fff; border-color:var(--primary); }
    #findStatus{ font-size:11.5px; color:var(--text-muted); }
    /* freeze indicator */
    .freeze-line{ position:absolute; top:0; left:0; width:2px; background:var(--primary); pointer-events:none; z-index:10; opacity:.5; }
  </style>

  <div class="editor-topbar">
    <button class="back-btn" id="sheetBack" aria-label="Back to drawer">&#8592;</button>
    <input type="text" class="title-input" id="sheetTitle" value="${escapeHtml(file.name)}" aria-label="Spreadsheet title">
    <div class="save-indicator"><span class="sdot" id="sheetSaveDot"></span><span id="sheetSaveText">Saved</span></div>
  </div>

  <!-- Toolbar row 1: text formatting -->
  <div class="editor-toolbar" role="toolbar" aria-label="Text formatting">
    <button class="tbtn" id="boldBtn" title="Bold (Ctrl+B)"><b>B</b></button>
    <button class="tbtn" id="italicBtn" title="Italic (Ctrl+I)"><i>I</i></button>
    <button class="tbtn" id="underlineBtn" title="Underline (Ctrl+U)" style="text-decoration:underline">U</button>
    <button class="tbtn" id="strikeBtn" title="Strikethrough"><s>S</s></button>
    <select class="tsel" id="fontSizeSel" title="Font size">
      <option value="11">11</option>
      <option value="12">12</option>
      <option value="13" selected>13</option>
      <option value="14">14</option>
      <option value="16">16</option>
      <option value="18">18</option>
      <option value="22">22</option>
      <option value="28">28</option>
    </select>
    <span class="sep"></span>
    <input type="color" id="bgFillInput" title="Cell fill color" value="#ffffff">
    <input type="color" id="textColorInput" title="Text color" value="#1E2A3A">
    <select class="tsel" id="alignSel" title="Alignment">
      <option value="left">⬱ Left</option>
      <option value="center">≡ Center</option>
      <option value="right">⬰ Right</option>
    </select>
    <button class="tbtn wide" id="wrapBtn" title="Wrap text">↵ Wrap</button>
    <span class="sep"></span>
    <select class="tsel" id="borderSel" title="Borders">
      <option value="none">No border</option>
      <option value="all">All borders</option>
      <option value="outer">Outer border</option>
      <option value="bottom">Bottom border</option>
      <option value="top">Top border</option>
    </select>
    <select class="tsel" id="numFormatSel" title="Number format">
      <option value="none">Plain</option>
      <option value="number">1,234.00</option>
      <option value="currency">$ Currency</option>
      <option value="percent">% Percent</option>
      <option value="scientific">1.23e+4</option>
      <option value="date">Date</option>
    </select>
    <span class="sep"></span>
    <button class="tbtn wide" id="undoBtn" title="Undo (Ctrl+Z)">↩ Undo</button>
    <button class="tbtn wide" id="redoBtn" title="Redo (Ctrl+Y)">↪ Redo</button>
  </div>

  <!-- Toolbar row 2: grid actions -->
  <div class="editor-toolbar-row2" role="toolbar" aria-label="Grid actions">
    <button class="tbtn wide" id="insertRowBtn">+ Row</button>
    <button class="tbtn wide" id="insertColBtn">+ Col</button>
    <button class="tbtn wide" id="delRowBtn">− Row</button>
    <button class="tbtn wide" id="delColBtn">− Col</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="fillDownBtn">↓ Fill Down</button>
    <button class="tbtn wide" id="fillRightBtn">→ Fill Right</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="sortAscBtn">A↓Z</button>
    <button class="tbtn wide" id="sortDescBtn">Z↓A</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="clearBtn">Clear</button>
    <button class="tbtn wide" id="clearFmtBtn">Clear Format</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="chartBtn">📊 Chart</button>
    <button class="tbtn wide" id="findBtn">🔍 Find</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="sheetExportBtn">⬇ CSV</button>
  </div>

  <div class="formula-bar">
    <span class="cellref" id="cellRefLabel">A1</span>
    <input type="text" id="formulaInput" placeholder="Enter value or formula…" aria-label="Formula input">
  </div>

  <div class="editor-body" style="position:relative;">
    <div class="sheet-wrap" id="sheetWrap"></div>

    <!-- Find/Replace Panel -->
    <div id="findPanel" class="hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <b style="font-size:13px;">Find &amp; Replace</b>
        <button id="findClose" style="border:none;background:transparent;font-size:16px;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <input type="text" id="findInput" placeholder="Find…">
      <input type="text" id="replaceInput" placeholder="Replace with…">
      <div class="find-row">
        <button id="findPrevBtn">◀ Prev</button>
        <button id="findNextBtn">Next ▶</button>
        <button id="replaceBtn">Replace</button>
        <button id="replaceAllBtn">All</button>
      </div>
      <span id="findStatus"></span>
    </div>
  </div>

  <!-- Chart Modal -->
  <div id="chartPanel" class="hidden">
    <div class="chart-modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;">Insert Chart</h3>
        <button id="chartClose" style="border:none;background:transparent;font-size:20px;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <div class="chart-cfg">
        <label>Chart type
          <select id="chartTypeSel">
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
            <option value="area">Area</option>
          </select>
        </label>
        <label>Data range (e.g. A1:B6)
          <input type="text" id="chartRange" placeholder="A1:B10">
        </label>
        <label>Chart title
          <input type="text" id="chartTitle" placeholder="My Chart">
        </label>
        <label>Labels column? <small style="font-weight:400">(first col = labels)</small>
          <select id="chartLabels">
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <button class="btn btn-primary" id="chartPreviewBtn">Preview</button>
        <button class="btn" id="chartInsertBtn">Insert into sheet</button>
      </div>
      <div class="chart-canvas-wrap">
        <canvas id="chartCanvas" height="320"></canvas>
      </div>
    </div>
  </div>
  `;

  /* ---- DOM refs ---- */
  const titleInput   = shell.querySelector('#sheetTitle');
  const saveDot      = shell.querySelector('#sheetSaveDot');
  const saveText     = shell.querySelector('#sheetSaveText');
  const sheetWrap    = shell.querySelector('#sheetWrap');
  const formulaInput = shell.querySelector('#formulaInput');
  const cellRefLabel = shell.querySelector('#cellRefLabel');
  const findPanel    = shell.querySelector('#findPanel');
  const chartPanel   = shell.querySelector('#chartPanel');

  /* ---- Selection state ---- */
  let selR = 0, selC = 0;          // anchor cell
  let selR2 = 0, selC2 = 0;        // drag end
  let isDragging = false;

  function selMinR(){ return Math.min(selR, selR2); }
  function selMaxR(){ return Math.max(selR, selR2); }
  function selMinC(){ return Math.min(selC, selC2); }
  function selMaxC(){ return Math.max(selC, selC2); }
  function isSingleCell(){ return selR===selR2 && selC===selC2; }
  function inSel(r,c){ return r>=selMinR()&&r<=selMaxR()&&c>=selMinC()&&c<=selMaxC(); }

  /* ---- Save ---- */
  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background='var(--warning)'; saveText.textContent='Saving…';
    clearTimeout(saveTimeout); saveTimeout=setTimeout(doSave,500);
  }
  function doSave(){
    file.name=titleInput.value.trim()||'Untitled';
    upsertFile(file);
    saveDot.style.background='#5B8A5E'; saveText.textContent='Saved';
  }
  titleInput.addEventListener('input', markUnsaved);

  /* ---- Cell data accessors ---- */
  function getRaw(r,c){ return content.cells[cellKey(r,c)]||''; }
  function setRaw(r,c,val){
    const k=cellKey(r,c);
    if(val===''||val===undefined) delete content.cells[k];
    else content.cells[k]=val;
  }
  function getFormat(r,c){ return content.formats[cellKey(r,c)]||{}; }
  function setFormat(r,c,patch){
    const k=cellKey(r,c);
    content.formats[k]=Object.assign({},content.formats[k],patch);
  }
  function applyFormatToSelection(patch){
    snapshot();
    for(let r=selMinR();r<=selMaxR();r++)
      for(let c=selMinC();c<=selMaxC();c++) setFormat(r,c,patch);
    markUnsaved(); renderGrid(); syncFormulaBar();
  }

  /* ---- Formula engine ---- */
  function colToIdx(label){
    let n=0;
    for(let i=0;i<label.length;i++) n=n*26+(label.charCodeAt(i)-64);
    return n-1;
  }
  function parseRef(ref){
    const m=ref.match(/^([A-Z]+)(\d+)$/);
    if(!m) return null;
    return{c:colToIdx(m[1]),r:parseInt(m[2],10)-1};
  }
  function getComputed(r,c,seen){
    seen=seen||new Set();
    const k=cellKey(r,c);
    if(seen.has(k)) return '#REF!';
    seen.add(k);
    const raw=getRaw(r,c);
    if(typeof raw==='string'&&raw.startsWith('=')){
      try{ return evalFormula(raw.slice(1),seen); }catch(e){ return '#ERR!'; }
    }
    return raw;
  }
  function rangeValues(rangeStr,seen){
    const[a,b]=rangeStr.split(':');
    const ra=parseRef(a),rb=parseRef(b);
    if(!ra||!rb) return[];
    const r0=Math.min(ra.r,rb.r),r1=Math.max(ra.r,rb.r);
    const c0=Math.min(ra.c,rb.c),c1=Math.max(ra.c,rb.c);
    const vals=[];
    for(let r=r0;r<=r1;r++)
      for(let c=c0;c<=c1;c++){
        const v=getComputed(r,c,new Set(seen));
        const n=parseFloat(v);
        if(!isNaN(n)) vals.push(n);
      }
    return vals;
  }
  function rangeAllValues(rangeStr,seen){
    const[a,b]=rangeStr.split(':');
    const ra=parseRef(a),rb=parseRef(b);
    if(!ra||!rb) return[];
    const r0=Math.min(ra.r,rb.r),r1=Math.max(ra.r,rb.r);
    const c0=Math.min(ra.c,rb.c),c1=Math.max(ra.c,rb.c);
    const vals=[];
    for(let r=r0;r<=r1;r++)
      for(let c=c0;c<=c1;c++)
        vals.push(getComputed(r,c,new Set(seen)));
    return vals;
  }
  function splitArgs(str){
    const out=[];let cur='';let inQ=false;
    for(let i=0;i<str.length;i++){
      const ch=str[i];
      if(ch==='"') inQ=!inQ;
      if(ch===','&&!inQ){out.push(cur);cur='';}else cur+=ch;
    }
    if(cur) out.push(cur);
    return out.map(s=>s.trim());
  }
  function stripQuotes(s){
    if(typeof s==='string'&&s.startsWith('"')&&s.endsWith('"')) return s.slice(1,-1);
    return s;
  }
  function evalCondition(str){
    str=String(str);
    const m=str.match(/^(.*?)(>=|<=|<>|!=|=|>|<)(.*)$/);
    if(!m) return !!parseFloat(str);
    let[_,left,op,right]=m;
    left=left.trim();right=right.trim();
    const ln=parseFloat(left),rn=parseFloat(right);
    const bothNum=!isNaN(ln)&&!isNaN(rn);
    const lv=bothNum?ln:stripQuotes(left);
    const rv=bothNum?rn:stripQuotes(right);
    switch(op){
      case'=':return lv===rv;
      case'<>':case'!=':return lv!==rv;
      case'>':return lv>rv;
      case'<':return lv<rv;
      case'>=':return lv>=rv;
      case'<=':return lv<=rv;
    }
    return false;
  }
  function resolveRefsAndEval(str,seen){
    str=str.trim();
    if(/^".*"$/.test(str)) return str;
    const replaced=str.replace(/\b([A-Z]+\d+)\b/g,(m)=>{
      const ref=parseRef(m);
      if(!ref) return m;
      const v=getComputed(ref.r,ref.c,seen);
      const n=parseFloat(v);
      return isNaN(n)?`"${String(v).replace(/"/g,'')}"`:n;
    });
    if(/^[-+*/0-9.()\s]+$/.test(replaced)){
      try{ return Function('"use strict";return ('+replaced+')')(); }catch(e){}
    }
    return replaced;
  }
  function evalFormula(expr,seen){
    expr=expr.trim();
    // nested function detection — match outermost function
    const fnMatch=expr.match(/^([A-Z_]+)\(([\s\S]*)\)$/i);
    if(fnMatch){
      const fn=fnMatch[1].toUpperCase();
      const argsStr=fnMatch[2];
      /* --- aggregate functions --- */
      if(['SUM','AVERAGE','MIN','MAX','COUNT'].includes(fn)){
        let vals=[];
        argsStr.split(',').forEach(part=>{
          part=part.trim();
          if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(part)) vals=vals.concat(rangeValues(part.toUpperCase(),seen));
          else{ const n=parseFloat(resolveRefsAndEval(part,seen)); if(!isNaN(n)) vals.push(n); }
        });
        if(fn==='SUM') return vals.reduce((a,b)=>a+b,0);
        if(fn==='AVERAGE') return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
        if(fn==='MIN') return vals.length?Math.min(...vals):0;
        if(fn==='MAX') return vals.length?Math.max(...vals):0;
        if(fn==='COUNT') return vals.length;
      }
      /* --- statistical --- */
      if(fn==='MEDIAN'){
        let vals=[];
        argsStr.split(',').forEach(part=>{
          part=part.trim();
          if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(part)) vals=vals.concat(rangeValues(part.toUpperCase(),seen));
          else{ const n=parseFloat(resolveRefsAndEval(part,seen)); if(!isNaN(n)) vals.push(n); }
        });
        vals.sort((a,b)=>a-b);
        const mid=Math.floor(vals.length/2);
        return vals.length%2?vals[mid]:(vals[mid-1]+vals[mid])/2;
      }
      if(fn==='STDEV'||fn==='STDEVP'){
        let vals=[];
        argsStr.split(',').forEach(part=>{
          part=part.trim();
          if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(part)) vals=vals.concat(rangeValues(part.toUpperCase(),seen));
          else{ const n=parseFloat(resolveRefsAndEval(part,seen)); if(!isNaN(n)) vals.push(n); }
        });
        if(vals.length<2) return 0;
        const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
        const denom=fn==='STDEVP'?vals.length:vals.length-1;
        return Math.sqrt(vals.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/denom);
      }
      /* --- math --- */
      if(fn==='POWER'){ const p=splitArgs(argsStr); return Math.pow(parseFloat(resolveRefsAndEval(p[0],seen)),parseFloat(resolveRefsAndEval(p[1],seen))); }
      if(fn==='SQRT'){ return Math.sqrt(parseFloat(resolveRefsAndEval(argsStr,seen))); }
      if(fn==='ABS') return Math.abs(parseFloat(resolveRefsAndEval(argsStr,seen)));
      if(fn==='ROUND'){ const p=splitArgs(argsStr); const d=p[1]!==undefined?parseInt(resolveRefsAndEval(p[1],seen),10):0; return Math.round(parseFloat(resolveRefsAndEval(p[0],seen))*10**d)/10**d; }
      if(fn==='FLOOR'){ const p=splitArgs(argsStr); return Math.floor(parseFloat(resolveRefsAndEval(p[0],seen))); }
      if(fn==='CEILING'){ const p=splitArgs(argsStr); return Math.ceil(parseFloat(resolveRefsAndEval(p[0],seen))); }
      if(fn==='MOD'){ const p=splitArgs(argsStr); return parseFloat(resolveRefsAndEval(p[0],seen))%parseFloat(resolveRefsAndEval(p[1],seen)); }
      if(fn==='LOG'){ const p=splitArgs(argsStr); const base=p[1]?parseFloat(resolveRefsAndEval(p[1],seen)):10; return Math.log(parseFloat(resolveRefsAndEval(p[0],seen)))/Math.log(base); }
      if(fn==='LN') return Math.log(parseFloat(resolveRefsAndEval(argsStr,seen)));
      if(fn==='EXP') return Math.exp(parseFloat(resolveRefsAndEval(argsStr,seen)));
      if(fn==='PI') return Math.PI;
      if(fn==='RAND') return Math.random();
      if(fn==='RANDBETWEEN'){ const p=splitArgs(argsStr); const lo=parseFloat(resolveRefsAndEval(p[0],seen)),hi=parseFloat(resolveRefsAndEval(p[1],seen)); return Math.floor(Math.random()*(hi-lo+1))+lo; }
      /* --- text --- */
      if(fn==='LEN') return String(stripQuotes(resolveRefsAndEval(argsStr,seen))).length;
      if(fn==='UPPER') return String(stripQuotes(resolveRefsAndEval(argsStr,seen))).toUpperCase();
      if(fn==='LOWER') return String(stripQuotes(resolveRefsAndEval(argsStr,seen))).toLowerCase();
      if(fn==='TRIM') return String(stripQuotes(resolveRefsAndEval(argsStr,seen))).trim();
      if(fn==='LEFT'){ const p=splitArgs(argsStr); return String(stripQuotes(resolveRefsAndEval(p[0],seen))).slice(0,parseInt(resolveRefsAndEval(p[1],seen),10)); }
      if(fn==='RIGHT'){ const p=splitArgs(argsStr); const s=String(stripQuotes(resolveRefsAndEval(p[0],seen))); const n=parseInt(resolveRefsAndEval(p[1],seen),10); return s.slice(-n); }
      if(fn==='MID'){ const p=splitArgs(argsStr); const s=String(stripQuotes(resolveRefsAndEval(p[0],seen))); const start=parseInt(resolveRefsAndEval(p[1],seen),10)-1; const len=parseInt(resolveRefsAndEval(p[2],seen),10); return s.substr(start,len); }
      if(fn==='CONCAT'||fn==='CONCATENATE'){ const p=splitArgs(argsStr); return p.map(x=>stripQuotes(resolveRefsAndEval(x,seen))).join(''); }
      if(fn==='TEXT'){ const p=splitArgs(argsStr); const n=parseFloat(resolveRefsAndEval(p[0],seen)); const fmt=stripQuotes(resolveRefsAndEval(p[1],seen)); if(!isNaN(n)&&fmt.includes('%')) return (n*100).toFixed(2)+'%'; return String(n); }
      if(fn==='REPT'){ const p=splitArgs(argsStr); return String(stripQuotes(resolveRefsAndEval(p[0],seen))).repeat(parseInt(resolveRefsAndEval(p[1],seen),10)); }
      if(fn==='FIND'){ const p=splitArgs(argsStr); const needle=String(stripQuotes(resolveRefsAndEval(p[0],seen))); const hay=String(stripQuotes(resolveRefsAndEval(p[1],seen))); const idx=hay.indexOf(needle); return idx===-1?'#VALUE!':idx+1; }
      if(fn==='SUBSTITUTE'){ const p=splitArgs(argsStr); const src=String(stripQuotes(resolveRefsAndEval(p[0],seen))); const find=String(stripQuotes(resolveRefsAndEval(p[1],seen))); const repl=String(stripQuotes(resolveRefsAndEval(p[2],seen))); return src.split(find).join(repl); }
      /* --- logical --- */
      if(fn==='IF'){ const p=splitArgs(argsStr); const cond=resolveRefsAndEval(p[0],seen); return evalCondition(cond)?stripQuotes(resolveRefsAndEval(p[1],seen)):stripQuotes(resolveRefsAndEval(p[2],seen)); }
      if(fn==='IFERROR'){ const p=splitArgs(argsStr); try{ const v=resolveRefsAndEval(p[0],seen); if(String(v).startsWith('#')) return stripQuotes(resolveRefsAndEval(p[1],seen)); return v; }catch(e){ return stripQuotes(resolveRefsAndEval(p[1],seen)); } }
      if(fn==='AND'){ const p=splitArgs(argsStr); return p.every(x=>evalCondition(resolveRefsAndEval(x,seen)))?'TRUE':'FALSE'; }
      if(fn==='OR'){ const p=splitArgs(argsStr); return p.some(x=>evalCondition(resolveRefsAndEval(x,seen)))?'TRUE':'FALSE'; }
      if(fn==='NOT'){ return !evalCondition(resolveRefsAndEval(argsStr,seen))?'TRUE':'FALSE'; }
      /* --- lookup --- */
      if(fn==='SUMIF'){
        const p=splitArgs(argsStr);
        const rng=p[0].trim().toUpperCase(); const crit=stripQuotes(resolveRefsAndEval(p[1],seen)); const sumRng=p[2]?p[2].trim().toUpperCase():rng;
        const condVals=rangeAllValues(rng,seen); const sumVals=rangeAllValues(sumRng,seen);
        let total=0;
        condVals.forEach((v,i)=>{ if(String(v)===String(crit)||parseFloat(v)===parseFloat(crit)){ const n=parseFloat(sumVals[i]); if(!isNaN(n)) total+=n; } });
        return total;
      }
      if(fn==='COUNTIF'){
        const p=splitArgs(argsStr);
        const rng=p[0].trim().toUpperCase(); const crit=stripQuotes(resolveRefsAndEval(p[1],seen));
        const vals=rangeAllValues(rng,seen);
        return vals.filter(v=>String(v)===String(crit)||parseFloat(v)===parseFloat(crit)).length;
      }
      if(fn==='VLOOKUP'){
        const p=splitArgs(argsStr);
        const lookup=stripQuotes(resolveRefsAndEval(p[0],seen));
        const rng=p[1].trim().toUpperCase();
        const colIdx=parseInt(resolveRefsAndEval(p[2],seen),10)-1;
        const[a,b]=rng.split(':'); const ra=parseRef(a),rb=parseRef(b);
        if(!ra||!rb) return'#REF!';
        for(let r=ra.r;r<=rb.r;r++){
          const first=getComputed(r,ra.c,new Set(seen));
          if(String(first)===String(lookup)||parseFloat(first)===parseFloat(lookup)){
            return getComputed(r,ra.c+colIdx,new Set(seen));
          }
        }
        return'#N/A';
      }
      if(fn==='HLOOKUP'){
        const p=splitArgs(argsStr);
        const lookup=stripQuotes(resolveRefsAndEval(p[0],seen));
        const rng=p[1].trim().toUpperCase();
        const rowIdx=parseInt(resolveRefsAndEval(p[2],seen),10)-1;
        const[a,b]=rng.split(':'); const ra=parseRef(a),rb=parseRef(b);
        if(!ra||!rb) return'#REF!';
        for(let c=ra.c;c<=rb.c;c++){
          const first=getComputed(ra.r,c,new Set(seen));
          if(String(first)===String(lookup)){
            return getComputed(ra.r+rowIdx,c,new Set(seen));
          }
        }
        return'#N/A';
      }
      /* --- date/time --- */
      if(fn==='TODAY') return new Date().toLocaleDateString();
      if(fn==='NOW') return new Date().toLocaleString();
      if(fn==='YEAR'){ const v=new Date(stripQuotes(resolveRefsAndEval(argsStr,seen))); return isNaN(v)?'#VALUE!':v.getFullYear(); }
      if(fn==='MONTH'){ const v=new Date(stripQuotes(resolveRefsAndEval(argsStr,seen))); return isNaN(v)?'#VALUE!':v.getMonth()+1; }
      if(fn==='DAY'){ const v=new Date(stripQuotes(resolveRefsAndEval(argsStr,seen))); return isNaN(v)?'#VALUE!':v.getDate(); }
    }
    return resolveRefsAndEval(expr,seen);
  }

  function displayValue(r,c){
    const raw=getRaw(r,c);
    let val;
    if(typeof raw==='string'&&raw.startsWith('=')){
      try{ val=evalFormula(raw.slice(1),new Set()); }catch(e){ val='#ERR!'; }
    } else { val=raw; }
    const fmt=getFormat(r,c);
    if(fmt.numFormat&&val!==''&&!isNaN(parseFloat(val))){
      const num=parseFloat(val);
      if(fmt.numFormat==='number') return num.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(fmt.numFormat==='currency') return '$'+num.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(fmt.numFormat==='percent') return(num*100).toFixed(1)+'%';
      if(fmt.numFormat==='scientific') return num.toExponential(2);
      if(fmt.numFormat==='date') return new Date(num*86400000).toLocaleDateString();
    }
    return val;
  }

  /* ---- Render grid ---- */
  function renderGrid(){
    let html='<table class="sheet-table"><thead><tr><th class="corner"></th>';
    for(let c=0;c<content.cols;c++){
      const sel=(c>=selMinC()&&c<=selMaxC())?'col-header-sel':'';
      html+=`<th data-col="${c}" class="${sel}">${colLabel(c)}</th>`;
    }
    html+='</tr></thead><tbody>';
    for(let r=0;r<content.rows;r++){
      const rowSel=(r>=selMinR()&&r<=selMaxR())?'row-header-sel':'';
      html+=`<tr><th class="row-head ${rowSel}" data-row="${r}">${r+1}</th>`;
      for(let c=0;c<content.cols;c++){
        const fmt=getFormat(r,c);
        const isAnchor=(r===selR&&c===selC);
        const isInSel=inSel(r,c);
        let cls='';
        if(isAnchor) cls='anchor';
        else if(isInSel) cls='in-selection';
        if(fmt.wrapText) cls+=' wrap-text';

        // build border style
        let borderStyle='';
        if(fmt.border==='all') borderStyle='border:1.5px solid #334155;';
        else if(fmt.border==='outer'){ /* handled via CSS outline */ }
        else if(fmt.border==='bottom') borderStyle='border-bottom:2px solid #334155;';
        else if(fmt.border==='top') borderStyle='border-top:2px solid #334155;';

        const style=[
          fmt.bold?'font-weight:700;':'',
          fmt.italic?'font-style:italic;':'',
          fmt.underline?'text-decoration:underline'+(fmt.strike?' line-through':'')+'solid;':'',
          fmt.strike&&!fmt.underline?'text-decoration:line-through;':'',
          fmt.color?`color:${fmt.color};`:'',
          fmt.bg?`background:${fmt.bg};`:'',
          fmt.align?`text-align:${fmt.align};`:'',
          fmt.fontSize?`font-size:${fmt.fontSize}px;`:'',
          borderStyle,
        ].join('');

        const val=displayValue(r,c);
        html+=`<td data-row="${r}" data-col="${c}" class="${cls}" style="${style}">${escapeHtml(String(val))}</td>`;
      }
      html+='</tr>';
    }
    html+='</tbody></table>';
    sheetWrap.innerHTML=html;
    attachGridHandlers();
  }

  /* ---- Grid event handlers ---- */
  function attachGridHandlers(){
    sheetWrap.querySelectorAll('td[data-row]').forEach(td=>{
      td.addEventListener('mousedown',(e)=>{
        if(e.button!==0) return;
        const r=parseInt(td.dataset.row,10), c=parseInt(td.dataset.col,10);
        if(e.shiftKey){
          selR2=r; selC2=c;
        } else {
          selR=r; selC=c; selR2=r; selC2=c;
          isDragging=true;
        }
        syncFormulaBar(); renderGrid();
        e.preventDefault();
      });
      td.addEventListener('mousemove',(e)=>{
        if(!isDragging) return;
        const r=parseInt(td.dataset.row,10), c=parseInt(td.dataset.col,10);
        if(r!==selR2||c!==selC2){ selR2=r; selC2=c; renderGrid(); }
      });
      td.addEventListener('dblclick',()=>beginEdit(td));
    });
    sheetWrap.addEventListener('mouseup',()=>{ isDragging=false; });

    // Column header click → select whole column
    sheetWrap.querySelectorAll('th[data-col]').forEach(th=>{
      th.addEventListener('click',()=>{
        const c=parseInt(th.dataset.col,10);
        selR=0; selC=c; selR2=content.rows-1; selC2=c;
        syncFormulaBar(); renderGrid();
      });
    });
    // Row header click → select whole row
    sheetWrap.querySelectorAll('th[data-row]').forEach(th=>{
      th.addEventListener('click',()=>{
        const r=parseInt(th.dataset.row,10);
        selR=r; selC=0; selR2=r; selC2=content.cols-1;
        syncFormulaBar(); renderGrid();
      });
    });
  }

  function syncFormulaBar(){
    const rangeLabel = isSingleCell()
      ? colLabel(selC)+(selR+1)
      : `${colLabel(selMinC())}${selMinR()+1}:${colLabel(selMaxC())}${selMaxR()+1}`;
    cellRefLabel.textContent=rangeLabel;
    formulaInput.value=getRaw(selR,selC);
    const fmt=getFormat(selR,selC);
    shell.querySelector('#boldBtn').setAttribute('aria-pressed',fmt.bold?'true':'false');
    shell.querySelector('#italicBtn').setAttribute('aria-pressed',fmt.italic?'true':'false');
    shell.querySelector('#underlineBtn').setAttribute('aria-pressed',fmt.underline?'true':'false');
    shell.querySelector('#strikeBtn').setAttribute('aria-pressed',fmt.strike?'true':'false');
    shell.querySelector('#wrapBtn').setAttribute('aria-pressed',fmt.wrapText?'true':'false');
    shell.querySelector('#alignSel').value=fmt.align||'left';
    shell.querySelector('#numFormatSel').value=fmt.numFormat||'none';
    shell.querySelector('#fontSizeSel').value=fmt.fontSize||'13';
    shell.querySelector('#textColorInput').value=fmt.color||'#1E2A3A';
    shell.querySelector('#bgFillInput').value=fmt.bg||'#ffffff';
    shell.querySelector('#borderSel').value=fmt.border||'none';
  }

  /* ---- Inline cell editing ---- */
  function beginEdit(td){
    const r=parseInt(td.dataset.row,10),c=parseInt(td.dataset.col,10);
    selR=r; selC=c; selR2=r; selC2=c;
    const raw=getRaw(r,c);
    td.innerHTML=`<input class="cell-input" value="${escapeHtml(String(raw))}">`;
    const input=td.querySelector('input');
    input.focus(); input.select();
    function commit(moveDir){
      const newVal=input.value;
      snapshot();
      setRaw(r,c,newVal); markUnsaved(); renderGrid();
      if(moveDir==='down'&&r<content.rows-1){selR=r+1;selC=c;selR2=selR;selC2=selC;}
      else if(moveDir==='right'&&c<content.cols-1){selR=r;selC=c+1;selR2=selR;selC2=selC;}
      else{selR=r;selC=c;selR2=r;selC2=c;}
      syncFormulaBar();
    }
    input.addEventListener('keydown',(e)=>{
      if(e.key==='Enter'){e.preventDefault();commit('down');}
      else if(e.key==='Tab'){e.preventDefault();commit('right');}
      else if(e.key==='Escape'){renderGrid();}
    });
    input.addEventListener('blur',()=>commit(null));
  }

  /* ---- Formula bar ---- */
  formulaInput.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'){
      snapshot();
      setRaw(selR,selC,formulaInput.value); markUnsaved(); renderGrid();
      if(selR<content.rows-1){selR++;selR2=selR;selC2=selC;}
      syncFormulaBar();
    }
  });
  formulaInput.addEventListener('change',()=>{
    snapshot();
    setRaw(selR,selC,formulaInput.value); markUnsaved(); renderGrid(); syncFormulaBar();
  });

  /* ---- Keyboard navigation ---- */
  shell.addEventListener('keydown',(e)=>{
    const active=document.activeElement;
    const inCellInput=active&&active.tagName==='INPUT'&&active!==formulaInput&&active!==titleInput;
    if(inCellInput) return;
    if(active===formulaInput) return;

    // Ctrl shortcuts
    if(e.ctrlKey||e.metaKey){
      if(e.key==='z'){e.preventDefault();undo();return;}
      if(e.key==='y'||e.key==='Z'){e.preventDefault();redo();return;}
      if(e.key==='b'){e.preventDefault();applyFormatToSelection({bold:!getFormat(selR,selC).bold});return;}
      if(e.key==='i'){e.preventDefault();applyFormatToSelection({italic:!getFormat(selR,selC).italic});return;}
      if(e.key==='u'){e.preventDefault();applyFormatToSelection({underline:!getFormat(selR,selC).underline});return;}
      if(e.key==='a'){e.preventDefault();selR=0;selC=0;selR2=content.rows-1;selC2=content.cols-1;renderGrid();syncFormulaBar();return;}
      if(e.key==='c'){ copySelection(); return; }
      if(e.key==='v'){ pasteSelection(); return; }
      if(e.key==='x'){ copySelection(); clearSelection(); return; }
      if(e.key==='f'){ e.preventDefault(); toggleFind(); return; }
      return;
    }

    let moved=true;
    if(e.key==='ArrowDown'){
      if(e.shiftKey){ selR2=Math.min(selR2+1,content.rows-1); }
      else{ selR=Math.min(selR+1,content.rows-1); selR2=selR; selC2=selC; }
    } else if(e.key==='ArrowUp'){
      if(e.shiftKey){ selR2=Math.max(selR2-1,0); }
      else{ selR=Math.max(selR-1,0); selR2=selR; selC2=selC; }
    } else if(e.key==='ArrowRight'){
      if(e.shiftKey){ selC2=Math.min(selC2+1,content.cols-1); }
      else{ selC=Math.min(selC+1,content.cols-1); selR2=selR; selC2=selC; }
    } else if(e.key==='ArrowLeft'){
      if(e.shiftKey){ selC2=Math.max(selC2-1,0); }
      else{ selC=Math.max(selC-1,0); selR2=selR; selC2=selC; }
    } else if(e.key==='Tab'){
      e.preventDefault();
      selC=Math.min(selC+1,content.cols-1); selC2=selC; selR2=selR;
    } else if(e.key==='Enter'){
      const td=sheetWrap.querySelector(`td[data-row="${selR}"][data-col="${selC}"]`);
      if(td) beginEdit(td);
      moved=false;
    } else if(e.key==='Delete'||e.key==='Backspace'){
      clearSelection(); moved=false;
    } else if(e.key==='Escape'){
      selR2=selR; selC2=selC; renderGrid(); moved=false;
    } else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){
      const td=sheetWrap.querySelector(`td[data-row="${selR}"][data-col="${selC}"]`);
      if(td){ beginEdit(td); const inp=td.querySelector('input'); inp.value=e.key; inp.setSelectionRange(1,1); }
      moved=false;
    } else { moved=false; }

    if(moved){ e.preventDefault(); syncFormulaBar(); renderGrid(); }
  });

  /* ---- Copy / Paste ---- */
  function copySelection(){
    const data=[];
    for(let r=selMinR();r<=selMaxR();r++){
      const row=[];
      for(let c=selMinC();c<=selMaxC();c++) row.push({raw:getRaw(r,c),fmt:getFormat(r,c)});
      data.push(row);
    }
    clipboardCells={data,r0:selMinR(),c0:selMinC()};
    // also native clipboard (plain text)
    const txt=data.map(row=>row.map(cell=>String(displayValue(selMinR(),selMinC()))).join('\t')).join('\n');
    navigator.clipboard&&navigator.clipboard.writeText(txt).catch(()=>{});
  }
  function pasteSelection(){
    if(!clipboardCells) return;
    snapshot();
    const{data}=clipboardCells;
    const dr=selR-clipboardCells.r0, dc=selC-clipboardCells.c0;
    data.forEach((row,ri)=>{
      row.forEach((cell,ci)=>{
        const r=clipboardCells.r0+ri+dr, c=clipboardCells.c0+ci+dc;
        if(r>=0&&r<content.rows&&c>=0&&c<content.cols){
          setRaw(r,c,cell.raw);
          content.formats[cellKey(r,c)]=Object.assign({},cell.fmt);
        }
      });
    });
    markUnsaved(); renderGrid(); syncFormulaBar();
  }
  function clearSelection(){
    snapshot();
    for(let r=selMinR();r<=selMaxR();r++)
      for(let c=selMinC();c<=selMaxC();c++){ setRaw(r,c,''); }
    markUnsaved(); renderGrid(); syncFormulaBar();
  }

  /* ---- Toolbar: formatting ---- */
  shell.querySelector('#boldBtn').addEventListener('click',()=>applyFormatToSelection({bold:!getFormat(selR,selC).bold}));
  shell.querySelector('#italicBtn').addEventListener('click',()=>applyFormatToSelection({italic:!getFormat(selR,selC).italic}));
  shell.querySelector('#underlineBtn').addEventListener('click',()=>applyFormatToSelection({underline:!getFormat(selR,selC).underline}));
  shell.querySelector('#strikeBtn').addEventListener('click',()=>applyFormatToSelection({strike:!getFormat(selR,selC).strike}));
  shell.querySelector('#wrapBtn').addEventListener('click',()=>applyFormatToSelection({wrapText:!getFormat(selR,selC).wrapText}));
  shell.querySelector('#bgFillInput').addEventListener('input',(e)=>applyFormatToSelection({bg:e.target.value}));
  shell.querySelector('#textColorInput').addEventListener('input',(e)=>applyFormatToSelection({color:e.target.value}));
  shell.querySelector('#alignSel').addEventListener('change',(e)=>applyFormatToSelection({align:e.target.value}));
  shell.querySelector('#numFormatSel').addEventListener('change',(e)=>applyFormatToSelection({numFormat:e.target.value}));
  shell.querySelector('#fontSizeSel').addEventListener('change',(e)=>applyFormatToSelection({fontSize:parseInt(e.target.value,10)}));
  shell.querySelector('#borderSel').addEventListener('change',(e)=>applyFormatToSelection({border:e.target.value}));

  shell.querySelector('#clearBtn').addEventListener('click',()=>clearSelection());
  shell.querySelector('#clearFmtBtn').addEventListener('click',()=>{
    snapshot();
    for(let r=selMinR();r<=selMaxR();r++)
      for(let c=selMinC();c<=selMaxC();c++) content.formats[cellKey(r,c)]={};
    markUnsaved(); renderGrid(); syncFormulaBar();
  });

  shell.querySelector('#undoBtn').addEventListener('click',undo);
  shell.querySelector('#redoBtn').addEventListener('click',redo);

  /* ---- Toolbar: grid ops ---- */
  shell.querySelector('#insertRowBtn').addEventListener('click',()=>{
    snapshot();
    // insert row above selMinR
    for(let r=content.rows-1;r>=selMinR();r--){
      for(let c=0;c<content.cols;c++){
        content.cells[cellKey(r+1,c)]=content.cells[cellKey(r,c)];
        content.formats[cellKey(r+1,c)]=content.formats[cellKey(r,c)];
        delete content.cells[cellKey(r,c)]; delete content.formats[cellKey(r,c)];
      }
    }
    content.rows++;
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#insertColBtn').addEventListener('click',()=>{
    snapshot();
    for(let c=content.cols-1;c>=selMinC();c--){
      for(let r=0;r<content.rows;r++){
        content.cells[cellKey(r,c+1)]=content.cells[cellKey(r,c)];
        content.formats[cellKey(r,c+1)]=content.formats[cellKey(r,c)];
        delete content.cells[cellKey(r,c)]; delete content.formats[cellKey(r,c)];
      }
    }
    content.cols++;
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#delRowBtn').addEventListener('click',()=>{
    if(content.rows<=1) return;
    snapshot();
    for(let r=selMinR();r<content.rows-1;r++)
      for(let c=0;c<content.cols;c++){
        content.cells[cellKey(r,c)]=content.cells[cellKey(r+1,c)];
        content.formats[cellKey(r,c)]=content.formats[cellKey(r+1,c)];
        if(content.cells[cellKey(r,c)]===undefined) delete content.cells[cellKey(r,c)];
      }
    for(let c=0;c<content.cols;c++){ delete content.cells[cellKey(content.rows-1,c)]; delete content.formats[cellKey(content.rows-1,c)]; }
    content.rows--;
    selR=Math.min(selR,content.rows-1); selR2=selR; selC2=selC;
    markUnsaved(); renderGrid(); syncFormulaBar();
  });
  shell.querySelector('#delColBtn').addEventListener('click',()=>{
    if(content.cols<=1) return;
    snapshot();
    for(let c=selMinC();c<content.cols-1;c++)
      for(let r=0;r<content.rows;r++){
        content.cells[cellKey(r,c)]=content.cells[cellKey(r,c+1)];
        content.formats[cellKey(r,c)]=content.formats[cellKey(r,c+1)];
        if(content.cells[cellKey(r,c)]===undefined) delete content.cells[cellKey(r,c)];
      }
    for(let r=0;r<content.rows;r++){ delete content.cells[cellKey(r,content.cols-1)]; delete content.formats[cellKey(r,content.cols-1)]; }
    content.cols--;
    selC=Math.min(selC,content.cols-1); selR2=selR; selC2=selC;
    markUnsaved(); renderGrid(); syncFormulaBar();
  });

  /* ---- Fill Down / Right ---- */
  shell.querySelector('#fillDownBtn').addEventListener('click',()=>{
    if(selMinR()===selMaxR()&&selMinC()===selMaxC()) return;
    snapshot();
    for(let c=selMinC();c<=selMaxC();c++){
      const srcVal=getRaw(selMinR(),c);
      const srcFmt=getFormat(selMinR(),c);
      for(let r=selMinR()+1;r<=selMaxR();r++){
        setRaw(r,c,srcVal);
        content.formats[cellKey(r,c)]=Object.assign({},srcFmt);
      }
    }
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#fillRightBtn').addEventListener('click',()=>{
    if(selMinR()===selMaxR()&&selMinC()===selMaxC()) return;
    snapshot();
    for(let r=selMinR();r<=selMaxR();r++){
      const srcVal=getRaw(r,selMinC());
      const srcFmt=getFormat(r,selMinC());
      for(let c=selMinC()+1;c<=selMaxC();c++){
        setRaw(r,c,srcVal);
        content.formats[cellKey(r,c)]=Object.assign({},srcFmt);
      }
    }
    markUnsaved(); renderGrid();
  });

  /* ---- Sort ---- */
  function sortColumn(asc){
    snapshot();
    const col=selC;
    const dataRows=[];
    for(let r=0;r<content.rows;r++){
      const row={cells:{},formats:{}};
      for(let c=0;c<content.cols;c++){
        row.cells[c]=content.cells[cellKey(r,c)];
        row.formats[c]=content.formats[cellKey(r,c)];
      }
      dataRows.push(row);
    }
    dataRows.sort((a,b)=>{
      const av=a.cells[col]??'', bv=b.cells[col]??'';
      const an=parseFloat(av),bn=parseFloat(bv);
      if(!isNaN(an)&&!isNaN(bn)) return asc?an-bn:bn-an;
      return asc?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));
    });
    const newCells={},newFmts={};
    dataRows.forEach((row,r)=>{
      for(let c=0;c<content.cols;c++){
        if(row.cells[c]!==undefined) newCells[cellKey(r,c)]=row.cells[c];
        if(row.formats[c]) newFmts[cellKey(r,c)]=row.formats[c];
      }
    });
    content.cells=newCells; content.formats=newFmts;
    markUnsaved(); renderGrid();
  }
  shell.querySelector('#sortAscBtn').addEventListener('click',()=>sortColumn(true));
  shell.querySelector('#sortDescBtn').addEventListener('click',()=>sortColumn(false));

  /* ---- Export CSV ---- */
  shell.querySelector('#sheetExportBtn').addEventListener('click',()=>{
    let csv='';
    for(let r=0;r<content.rows;r++){
      const rowVals=[]; let rowHasData=false;
      for(let c=0;c<content.cols;c++){
        const v=displayValue(r,c);
        if(v!=='') rowHasData=true;
        const s=String(v).replace(/"/g,'""');
        rowVals.push(/[,"\n]/.test(s)?`"${s}"`:s);
      }
      if(rowHasData) csv+=rowVals.join(',')+'\n';
    }
    downloadBlob(new Blob([csv],{type:'text/csv'}),(file.name||'spreadsheet')+'.csv');
  });

  /* ---- Find & Replace ---- */
  let findMatches=[], findIdx=0;
  function toggleFind(){
    findPanel.classList.toggle('hidden');
    if(!findPanel.classList.contains('hidden')) shell.querySelector('#findInput').focus();
  }
  shell.querySelector('#findBtn').addEventListener('click',toggleFind);
  shell.querySelector('#findClose').addEventListener('click',()=>findPanel.classList.add('hidden'));
  function doFind(){
    const q=shell.querySelector('#findInput').value.toLowerCase();
    findMatches=[];
    if(!q){ shell.querySelector('#findStatus').textContent=''; return; }
    for(let r=0;r<content.rows;r++)
      for(let c=0;c<content.cols;c++){
        const v=String(displayValue(r,c)).toLowerCase();
        if(v.includes(q)) findMatches.push({r,c});
      }
    shell.querySelector('#findStatus').textContent=findMatches.length?`${findMatches.length} match(es)`:'No matches';
    findIdx=0;
    if(findMatches.length){ const m=findMatches[0]; selR=m.r;selC=m.c;selR2=m.r;selC2=m.c; renderGrid(); syncFormulaBar(); }
  }
  shell.querySelector('#findInput').addEventListener('input',doFind);
  shell.querySelector('#findNextBtn').addEventListener('click',()=>{
    if(!findMatches.length) return;
    findIdx=(findIdx+1)%findMatches.length;
    const m=findMatches[findIdx]; selR=m.r;selC=m.c;selR2=m.r;selC2=m.c; renderGrid(); syncFormulaBar();
  });
  shell.querySelector('#findPrevBtn').addEventListener('click',()=>{
    if(!findMatches.length) return;
    findIdx=(findIdx-1+findMatches.length)%findMatches.length;
    const m=findMatches[findIdx]; selR=m.r;selC=m.c;selR2=m.r;selC2=m.c; renderGrid(); syncFormulaBar();
  });
  shell.querySelector('#replaceBtn').addEventListener('click',()=>{
    if(!findMatches.length) return;
    snapshot();
    const m=findMatches[findIdx];
    const find=shell.querySelector('#findInput').value;
    const repl=shell.querySelector('#replaceInput').value;
    const raw=getRaw(m.r,m.c);
    setRaw(m.r,m.c,raw.replace(find,repl));
    markUnsaved(); renderGrid(); doFind();
  });
  shell.querySelector('#replaceAllBtn').addEventListener('click',()=>{
    if(!findMatches.length) return;
    snapshot();
    const find=shell.querySelector('#findInput').value;
    const repl=shell.querySelector('#replaceInput').value;
    findMatches.forEach(m=>{
      const raw=getRaw(m.r,m.c);
      setRaw(m.r,m.c,String(raw).split(find).join(repl));
    });
    markUnsaved(); renderGrid(); doFind();
  });

  /* ---- Charts ---- */
  const CHART_PALETTE=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];
  let chartInstance=null;

  shell.querySelector('#chartBtn').addEventListener('click',()=>{
    // pre-fill range from selection
    if(!(selMinR()===0&&selMinC()===0&&selMaxR()===content.rows-1&&selMaxC()===content.cols-1)){
      const rangeStr=`${colLabel(selMinC())}${selMinR()+1}:${colLabel(selMaxC())}${selMaxR()+1}`;
      shell.querySelector('#chartRange').value=rangeStr;
    }
    chartPanel.classList.remove('hidden');
  });
  shell.querySelector('#chartClose').addEventListener('click',()=>chartPanel.classList.add('hidden'));
  chartPanel.addEventListener('click',(e)=>{ if(e.target===chartPanel) chartPanel.classList.add('hidden'); });

  function parseChartData(){
    const rangeStr=shell.querySelector('#chartRange').value.trim().toUpperCase();
    const useLabels=shell.querySelector('#chartLabels').value==='yes';
    if(!rangeStr.includes(':')) return null;
    const[a,b]=rangeStr.split(':');
    const ra=parseRef(a),rb=parseRef(b);
    if(!ra||!rb) return null;
    const r0=Math.min(ra.r,rb.r),r1=Math.max(ra.r,rb.r);
    const c0=Math.min(ra.c,rb.c),c1=Math.max(ra.c,rb.c);
    const rows=[];
    for(let r=r0;r<=r1;r++){
      const row=[];
      for(let c=c0;c<=c1;c++) row.push(getComputed(r,c,new Set()));
      rows.push(row);
    }
    // determine if header row
    const firstRowAllText=rows[0]&&rows[0].every(v=>isNaN(parseFloat(v)));
    let headers=null, dataRows=rows;
    if(firstRowAllText){ headers=rows[0]; dataRows=rows.slice(1); }
    const labels=useLabels?dataRows.map(r=>String(r[0])):dataRows.map((_,i)=>String(i+1));
    const seriesCols=useLabels?
      Array.from({length:(c1-c0)},(_,i)=>i+1):
      Array.from({length:(c1-c0+1)},(_,i)=>i);
    const datasets=seriesCols.map((colIdx,si)=>{
      const label=headers?String(headers[colIdx]):`Series ${si+1}`;
      const data=dataRows.map(r=>parseFloat(r[colIdx])||0);
      return{label,data};
    });
    return{labels,datasets};
  }

  function drawChart(){
    const canvas=shell.querySelector('#chartCanvas');
    const ctx=canvas.getContext('2d');
    const chartType=shell.querySelector('#chartTypeSel').value;
    const title=shell.querySelector('#chartTitle').value||'Chart';
    const parsed=parseChartData();
    if(!parsed){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#ef4444'; ctx.font='14px system-ui'; ctx.fillText('Invalid range',20,40); return; }

    // set canvas resolution
    const W=canvas.offsetWidth||600, H=320;
    canvas.width=W*devicePixelRatio; canvas.height=H*devicePixelRatio;
    canvas.style.height=H+'px';
    ctx.scale(devicePixelRatio,devicePixelRatio);
    ctx.clearRect(0,0,W,H);

    const{labels,datasets}=parsed;
    const pad={top:48,right:24,bottom:52,left:60};
    const cW=W-pad.left-pad.right, cH=H-pad.top-pad.bottom;
    const n=labels.length;

    // background
    ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,W,H);

    // title
    ctx.fillStyle='#0f172a'; ctx.font='bold 14px system-ui'; ctx.textAlign='center';
    ctx.fillText(title,W/2,24);

    if(chartType==='pie'||chartType==='doughnut'){
      const cx=W/2, cy=pad.top+cH/2, outerR=Math.min(cW,cH)/2-10;
      const innerR=chartType==='doughnut'?outerR*0.5:0;
      const flatData=datasets[0]?datasets[0].data:[];
      const total=flatData.reduce((a,b)=>a+b,0)||1;
      let angle=-Math.PI/2;
      flatData.forEach((val,i)=>{
        const slice=(val/total)*Math.PI*2;
        ctx.beginPath(); ctx.moveTo(cx,cy);
        ctx.arc(cx,cy,outerR,angle,angle+slice);
        if(innerR>0){ ctx.arc(cx,cy,innerR,angle+slice,angle,true); }
        ctx.closePath();
        ctx.fillStyle=CHART_PALETTE[i%CHART_PALETTE.length];
        ctx.fill();
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
        // label
        const mid=angle+slice/2;
        const lx=cx+Math.cos(mid)*(outerR+innerR)/2*0.7; const ly=cy+Math.sin(mid)*(outerR+innerR)/2*0.7;
        ctx.fillStyle='#fff'; ctx.font='bold 11px system-ui'; ctx.textAlign='center';
        if(slice>0.2) ctx.fillText(labels[i],lx,ly+4);
        angle+=slice;
      });
      // legend
      const legX=pad.left; let legY=H-18;
      flatData.forEach((_,i)=>{ ctx.fillStyle=CHART_PALETTE[i%CHART_PALETTE.length]; ctx.fillRect(legX+i*110,legY,10,10); ctx.fillStyle='#334155'; ctx.font='11px system-ui'; ctx.textAlign='left'; ctx.fillText(labels[i],legX+i*110+14,legY+9); });
      return;
    }

    // Bar / Line / Area — compute range
    let allVals=datasets.flatMap(d=>d.data).filter(v=>!isNaN(v));
    if(!allVals.length) allVals=[0,1];
    const minV=Math.min(0,...allVals), maxV=Math.max(...allVals);
    const range=maxV-minV||1;
    function vy(v){ return pad.top+cH-(((v-minV)/range)*cH); }

    // grid lines
    const gridLines=5;
    ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1;
    for(let i=0;i<=gridLines;i++){
      const y=pad.top+(cH/gridLines)*i;
      ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+cW,y); ctx.stroke();
      const val=maxV-(range/gridLines)*i;
      ctx.fillStyle='#94a3b8'; ctx.font='10px system-ui'; ctx.textAlign='right';
      ctx.fillText(val.toFixed(val%1?1:0),pad.left-6,y+4);
    }

    // axes
    ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(pad.left,pad.top); ctx.lineTo(pad.left,pad.top+cH); ctx.lineTo(pad.left+cW,pad.top+cH); ctx.stroke();

    const barGroupW=cW/n;
    const barW=chartType==='bar'?(barGroupW*0.7/datasets.length):0;

    datasets.forEach((ds,si)=>{
      const color=CHART_PALETTE[si%CHART_PALETTE.length];
      if(chartType==='bar'){
        const offset=(si-(datasets.length-1)/2)*barW;
        ds.data.forEach((v,i)=>{
          const x=pad.left+barGroupW*(i+0.5)+offset-barW/2;
          const y=vy(v), h=vy(minV)-y;
          ctx.fillStyle=color;
          ctx.beginPath(); ctx.roundRect(x,y,barW,h,3); ctx.fill();
        });
      } else if(chartType==='line'||chartType==='area'){
        ctx.beginPath();
        ds.data.forEach((v,i)=>{
          const x=pad.left+barGroupW*(i+0.5), y=vy(v);
          i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
        });
        if(chartType==='area'){
          const last=ds.data.length-1;
          ctx.lineTo(pad.left+barGroupW*(last+0.5),vy(minV));
          ctx.lineTo(pad.left+barGroupW*0.5,vy(minV));
          ctx.closePath();
          ctx.fillStyle=color+'33'; ctx.fill();
          // redraw line
          ctx.beginPath();
          ds.data.forEach((v,i)=>{ const x=pad.left+barGroupW*(i+0.5),y=vy(v); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
        }
        ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.stroke();
        // dots
        ds.data.forEach((v,i)=>{ const x=pad.left+barGroupW*(i+0.5),y=vy(v); ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke(); });
      }
    });

    // x-axis labels
    ctx.fillStyle='#64748b'; ctx.font='11px system-ui'; ctx.textAlign='center';
    labels.forEach((lbl,i)=>{ const x=pad.left+barGroupW*(i+0.5); ctx.fillText(String(lbl).substring(0,10),x,pad.top+cH+18); });

    // legend
    if(datasets.length>1){
      const legTop=H-14; let legX=pad.left;
      datasets.forEach((ds,i)=>{
        ctx.fillStyle=CHART_PALETTE[i%CHART_PALETTE.length]; ctx.fillRect(legX,legTop-10,12,10);
        ctx.fillStyle='#334155'; ctx.font='11px system-ui'; ctx.textAlign='left';
        ctx.fillText(ds.label,legX+16,legTop-1);
        legX+=ctx.measureText(ds.label).width+36;
      });
    }
  }

  shell.querySelector('#chartPreviewBtn').addEventListener('click',drawChart);
  shell.querySelector('#chartInsertBtn').addEventListener('click',()=>{
    drawChart();
    // Embed chart as a dataURL note in a special cell below selection
    const canvas=shell.querySelector('#chartCanvas');
    const dataURL=canvas.toDataURL('image/png');
    content.charts=content.charts||[];
    content.charts.push({
      dataURL,
      title:shell.querySelector('#chartTitle').value||'Chart',
      row:selMaxR()+2, col:selMinC(),
      type:shell.querySelector('#chartTypeSel').value
    });
    // store reference in a cell (just a label)
    snapshot();
    setRaw(selMaxR()+2,selMinC(),`[Chart: ${shell.querySelector('#chartTitle').value||'Chart'}]`);
    markUnsaved(); renderGrid();
    chartPanel.classList.add('hidden');
    alert('Chart inserted as a reference below your data. Use "Preview" to view it in the chart window.');
  });

  /* ---- Back button ---- */
  shell.querySelector('#sheetBack').addEventListener('click',()=>{ doSave(); closeEditor('sheetEditor'); });

  /* ---- Initial render ---- */
  renderGrid();
  syncFormulaBar();
}
