/* =========================================================================
   SPREADSHEET EDITOR — v3
   • Direct cell typing (single click = start editing immediately)
   • = triggers function autocomplete dropdown with param hints + descriptions
   • Syntax-coloured formula display in formula bar
   • Nested function support
   • Group copy/paste (internal + native clipboard TSV)
   • Multi-cell selection (drag, shift-click, shift-arrow, ctrl+A)
   • Charts, undo/redo, find/replace, fill down/right, borders, sorting
   ========================================================================= */

/* ---------- helpers ---------- */
function colLabel(i){
  let s=''; i++;
  while(i>0){ const r=(i-1)%26; s=String.fromCharCode(65+r)+s; i=Math.floor((i-1)/26); }
  return s;
}
function cellKey(r,c){ return r+'_'+c; }

/* ---------- function catalogue ---------- */
const FN_CATALOG = [
  // math
  { name:'SUM',       sig:'SUM(range, …)',              desc:'Adds all numbers in a range.' },
  { name:'AVERAGE',   sig:'AVERAGE(range, …)',           desc:'Mean of all numbers in a range.' },
  { name:'MIN',       sig:'MIN(range, …)',               desc:'Smallest number in a range.' },
  { name:'MAX',       sig:'MAX(range, …)',               desc:'Largest number in a range.' },
  { name:'COUNT',     sig:'COUNT(range, …)',             desc:'Count of numeric cells.' },
  { name:'MEDIAN',    sig:'MEDIAN(range, …)',            desc:'Middle value of a sorted range.' },
  { name:'STDEV',     sig:'STDEV(range, …)',             desc:'Sample standard deviation.' },
  { name:'STDEVP',    sig:'STDEVP(range, …)',            desc:'Population standard deviation.' },
  { name:'POWER',     sig:'POWER(base, exponent)',       desc:'Raises base to exponent.' },
  { name:'SQRT',      sig:'SQRT(number)',                desc:'Square root of a number.' },
  { name:'ABS',       sig:'ABS(number)',                 desc:'Absolute value.' },
  { name:'ROUND',     sig:'ROUND(number, digits)',       desc:'Rounds to given decimal places.' },
  { name:'FLOOR',     sig:'FLOOR(number)',               desc:'Rounds down to nearest integer.' },
  { name:'CEILING',   sig:'CEILING(number)',             desc:'Rounds up to nearest integer.' },
  { name:'MOD',       sig:'MOD(dividend, divisor)',      desc:'Remainder after division.' },
  { name:'LOG',       sig:'LOG(number, [base])',         desc:'Logarithm. Default base 10.' },
  { name:'LN',        sig:'LN(number)',                  desc:'Natural logarithm.' },
  { name:'EXP',       sig:'EXP(number)',                 desc:'e raised to a power.' },
  { name:'PI',        sig:'PI()',                        desc:'Returns π (3.14159…).' },
  { name:'RAND',      sig:'RAND()',                      desc:'Random number 0–1.' },
  { name:'RANDBETWEEN',sig:'RANDBETWEEN(low, high)',     desc:'Random integer in range.' },
  // text
  { name:'LEN',       sig:'LEN(text)',                   desc:'Length of a string.' },
  { name:'UPPER',     sig:'UPPER(text)',                 desc:'Convert to uppercase.' },
  { name:'LOWER',     sig:'LOWER(text)',                 desc:'Convert to lowercase.' },
  { name:'TRIM',      sig:'TRIM(text)',                  desc:'Remove leading/trailing spaces.' },
  { name:'LEFT',      sig:'LEFT(text, n)',               desc:'First n characters.' },
  { name:'RIGHT',     sig:'RIGHT(text, n)',              desc:'Last n characters.' },
  { name:'MID',       sig:'MID(text, start, len)',       desc:'Substring starting at position.' },
  { name:'CONCAT',    sig:'CONCAT(text1, text2, …)',     desc:'Join strings together.' },
  { name:'SUBSTITUTE',sig:'SUBSTITUTE(text, find, new)',desc:'Replace all occurrences.' },
  { name:'REPT',      sig:'REPT(text, times)',           desc:'Repeat a string.' },
  { name:'FIND',      sig:'FIND(find, within)',          desc:'Position of substring (1-based).' },
  { name:'TEXT',      sig:'TEXT(number, format)',        desc:'Format a number as text.' },
  // logical
  { name:'IF',        sig:'IF(condition, true, false)',  desc:'Conditional value.' },
  { name:'IFERROR',   sig:'IFERROR(expr, fallback)',     desc:'Return fallback on error.' },
  { name:'AND',       sig:'AND(cond1, cond2, …)',        desc:'TRUE if all conditions are true.' },
  { name:'OR',        sig:'OR(cond1, cond2, …)',         desc:'TRUE if any condition is true.' },
  { name:'NOT',       sig:'NOT(condition)',              desc:'Inverts TRUE/FALSE.' },
  // lookup
  { name:'VLOOKUP',   sig:'VLOOKUP(key, range, col)',   desc:'Vertical lookup by first column.' },
  { name:'HLOOKUP',   sig:'HLOOKUP(key, range, row)',   desc:'Horizontal lookup by first row.' },
  { name:'SUMIF',     sig:'SUMIF(range, crit, sumRange)',desc:'Sum cells that meet a condition.' },
  { name:'COUNTIF',   sig:'COUNTIF(range, crit)',        desc:'Count cells meeting a condition.' },
  // date
  { name:'TODAY',     sig:'TODAY()',                     desc:'Today\'s date.' },
  { name:'NOW',       sig:'NOW()',                       desc:'Current date and time.' },
  { name:'YEAR',      sig:'YEAR(date)',                  desc:'Year component of a date.' },
  { name:'MONTH',     sig:'MONTH(date)',                 desc:'Month component (1–12).' },
  { name:'DAY',       sig:'DAY(date)',                   desc:'Day component (1–31).' },
];
const FN_NAMES = new Set(FN_CATALOG.map(f=>f.name));

/* =========================================================================
   MAIN EDITOR
   ========================================================================= */
function openSheetEditor(file){
  let shell = document.getElementById('sheetEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');

  if(!file.content || !file.content.cells) file.content = defaultContentFor('sheet');
  const content = file.content;
  if(!content.formats) content.formats = {};
  if(!content.charts)  content.charts  = [];

  /* ===== undo / redo ===== */
  const undoStack=[], redoStack=[];
  function snapshot(){
    undoStack.push(JSON.stringify({cells:content.cells,formats:content.formats,rows:content.rows,cols:content.cols}));
    if(undoStack.length>80) undoStack.shift();
    redoStack.length=0;
  }
  function applyState(s){ const p=JSON.parse(s); Object.assign(content,p); renderGrid(); syncFormulaBar(); }
  function undo(){ if(!undoStack.length) return; redoStack.push(JSON.stringify({cells:content.cells,formats:content.formats,rows:content.rows,cols:content.cols})); applyState(undoStack.pop()); }
  function redo(){ if(!redoStack.length) return; undoStack.push(JSON.stringify({cells:content.cells,formats:content.formats,rows:content.rows,cols:content.cols})); applyState(redoStack.pop()); }

  /* ===== internal clipboard ===== */
  let clipboardData = null; // { cells[][], fmts[][] }

  /* ===== HTML ===== */
  shell.innerHTML = `
<style>
/* --- grid --- */
.sheet-wrap{ flex:1; overflow:auto; background:var(--bg-app); position:relative; outline:none; }
table.sheet-table{ border-collapse:collapse; table-layout:fixed; background:var(--bg-card); }
table.sheet-table th,table.sheet-table td{ border:1px solid var(--border); padding:0; position:relative; height:26px; }
table.sheet-table th{
  background:#f1f5f9; font-size:11px; color:#64748b; font-weight:600;
  position:sticky; top:0; z-index:3; min-width:100px; user-select:none; text-align:center; cursor:default;
}
table.sheet-table th.row-head{ position:sticky; left:0; z-index:4; width:46px; min-width:46px; text-align:center; cursor:default; }
table.sheet-table th.corner{ left:0; top:0; z-index:5; width:46px; min-width:46px; background:#e8edf2; }
table.sheet-table td{ min-width:100px; background:var(--bg-card); overflow:hidden; white-space:nowrap; font-size:13px; padding:0 6px; line-height:26px; cursor:cell; }
table.sheet-table td.wrap-text{ white-space:pre-wrap; height:auto; line-height:1.4; padding:4px 6px; }
/* selection */
table.sheet-table td.s-anchor{ outline:2px solid #2563eb; outline-offset:-1px; z-index:2; }
table.sheet-table td.s-range{ background:rgba(59,130,246,.1) !important; }
table.sheet-table th.sh{ background:#dbeafe !important; color:#1d4ed8 !important; }
/* editing */
.cell-editor-wrap{ position:absolute; inset:0; z-index:10; }
.cell-editor{
  width:100%; height:100%; min-height:26px; border:none; padding:0 6px;
  font-size:13px; font-family:system-ui,sans-serif; background:#fff;
  outline:2px solid #2563eb; outline-offset:-1px; box-sizing:border-box; color:#0f172a;
  resize:none; overflow:hidden; white-space:pre; line-height:26px;
}
/* formula bar */
.formula-bar{ display:flex; align-items:center; gap:0; border-bottom:1px solid var(--border); background:#fff; height:36px; }
.fb-ref{ width:72px; flex-shrink:0; font-size:12px; font-weight:700; color:#64748b; font-family:'Courier New',monospace; text-align:center; border-right:1px solid var(--border); height:100%; display:flex; align-items:center; justify-content:center; }
.fb-fx{ width:28px; flex-shrink:0; font-size:13px; color:#64748b; font-family:'Courier New',monospace; display:flex; align-items:center; justify-content:center; border-right:1px solid var(--border); height:100%; font-style:italic; }
#formulaInput{
  flex:1; border:none; padding:4px 10px; font-size:13px; font-family:'Courier New',monospace;
  background:transparent; color:#0f172a; outline:none; height:100%;
}
/* syntax coloring in formula bar — done via colored span overlay */
.formula-display{
  flex:1; padding:4px 10px; font-size:13px; font-family:'Courier New',monospace; color:#0f172a;
  pointer-events:none; white-space:pre; overflow:hidden; height:100%; display:flex; align-items:center;
  position:relative;
}
/* autocomplete dropdown */
#fnDropdown{
  position:fixed; background:#fff; border:1px solid #cbd5e1; border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,.14); z-index:9999; min-width:320px; max-width:460px;
  overflow:hidden; display:none; flex-direction:column;
}
#fnDropdown.open{ display:flex; }
.fnd-list{ overflow-y:auto; max-height:220px; }
.fnd-item{
  display:flex; align-items:flex-start; gap:10px; padding:8px 14px; cursor:pointer;
  border-bottom:1px solid #f1f5f9; transition:background .1s;
}
.fnd-item:last-child{ border-bottom:none; }
.fnd-item:hover,.fnd-item.active{ background:#eff6ff; }
.fnd-name{ font-family:'Courier New',monospace; font-size:12.5px; font-weight:700; color:#1d4ed8; min-width:80px; }
.fnd-sig{ font-family:'Courier New',monospace; font-size:11px; color:#7c3aed; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fnd-desc{ font-size:11.5px; color:#475569; line-height:1.4; }
.fnd-hint{
  padding:10px 14px; background:#f8fafc; border-top:1px solid #e2e8f0;
  font-family:'Courier New',monospace; font-size:12px; color:#7c3aed; font-weight:600;
}
/* toolbar */
.editor-toolbar-row2{ display:flex; align-items:center; gap:5px; padding:5px 12px; border-bottom:1px solid var(--border); background:#fff; flex-wrap:wrap; }
/* chart / find panels */
#chartPanel{ position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:200; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(3px); }
#chartPanel.hidden{ display:none !important; }
.chart-modal{ background:var(--bg-app); border-radius:14px; padding:28px; width:700px; max-width:96vw; max-height:92vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.18); }
.chart-cfg{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
.chart-cfg label{ font-size:12px; font-weight:600; color:#64748b; display:flex; flex-direction:column; gap:4px; }
.chart-cfg input,.chart-cfg select{ padding:6px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; font-family:inherit; background:#f8fafc; color:#0f172a; }
canvas#chartCanvas{ width:100%; display:block; border-radius:8px; }
#findPanel{ position:absolute; top:8px; right:8px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; z-index:100; box-shadow:0 8px 24px rgba(0,0,0,.1); display:flex; flex-direction:column; gap:8px; width:290px; }
#findPanel.hidden{ display:none !important; }
#findPanel input{ padding:7px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; font-family:inherit; }
.find-row{ display:flex; gap:6px; }
.find-row button{ flex:1; padding:6px 4px; border-radius:6px; font-size:11.5px; font-weight:600; border:1px solid #e2e8f0; background:#f8fafc; color:#334155; cursor:pointer; }
.find-row button:hover{ background:#2563eb; color:#fff; border-color:#2563eb; }
/* copy march-ants border */
table.sheet-table td.copied{ outline:2px dashed #2563eb !important; outline-offset:-2px; }
/* formula syntax colours (spans inside cell) */
.fx-fn{ color:#7c3aed; font-weight:700; }
.fx-op{ color:#0ea5e9; }
.fx-str{ color:#16a34a; }
.fx-num{ color:#d97706; }
.fx-ref{ color:#2563eb; }
.fx-err{ color:#dc2626; }
</style>

<div class="editor-topbar">
  <button class="back-btn" id="sheetBack">&#8592;</button>
  <input class="title-input" id="sheetTitle" value="${escapeHtml(file.name)}">
  <div class="save-indicator"><span class="sdot" id="sheetSaveDot"></span><span id="sheetSaveText">Saved</span></div>
</div>

<!-- toolbar row 1 -->
<div class="editor-toolbar" role="toolbar">
  <button class="tbtn" id="boldBtn" title="Bold (Ctrl+B)"><b>B</b></button>
  <button class="tbtn" id="italicBtn" title="Italic (Ctrl+I)"><i>I</i></button>
  <button class="tbtn" id="underlineBtn" title="Underline (Ctrl+U)" style="text-decoration:underline">U</button>
  <button class="tbtn" id="strikeBtn" title="Strikethrough"><s>S</s></button>
  <select class="tsel" id="fontSizeSel" title="Font size">
    <option value="11">11</option><option value="12">12</option>
    <option value="13" selected>13</option><option value="14">14</option>
    <option value="16">16</option><option value="18">18</option>
    <option value="22">22</option><option value="28">28</option>
  </select>
  <span class="sep"></span>
  <label title="Fill colour" style="display:flex;align-items:center;gap:3px;font-size:11px;color:#64748b;cursor:pointer">
    <input type="color" id="bgFillInput" value="#ffffff" style="width:28px;height:28px"> Fill
  </label>
  <label title="Text colour" style="display:flex;align-items:center;gap:3px;font-size:11px;color:#64748b;cursor:pointer">
    <input type="color" id="textColorInput" value="#1E2A3A" style="width:28px;height:28px"> Text
  </label>
  <select class="tsel" id="alignSel">
    <option value="left">⬱ Left</option><option value="center">≡ Center</option><option value="right">⬰ Right</option>
  </select>
  <button class="tbtn wide" id="wrapBtn" title="Wrap text">↵ Wrap</button>
  <span class="sep"></span>
  <select class="tsel" id="borderSel" title="Borders">
    <option value="none">No border</option><option value="all">All borders</option>
    <option value="outer">Outer</option><option value="bottom">Bottom</option><option value="top">Top</option>
  </select>
  <select class="tsel" id="numFormatSel" title="Number format">
    <option value="none">Plain</option><option value="number">1,234.00</option>
    <option value="currency">$ Currency</option><option value="percent">% Percent</option>
    <option value="scientific">1.23e+4</option>
  </select>
  <span class="sep"></span>
  <button class="tbtn wide" id="undoBtn" title="Ctrl+Z">↩ Undo</button>
  <button class="tbtn wide" id="redoBtn" title="Ctrl+Y">↪ Redo</button>
</div>

<!-- toolbar row 2 -->
<div class="editor-toolbar-row2">
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
  <button class="tbtn wide" id="clearFmtBtn">Clear Fmt</button>
  <span class="sep"></span>
  <button class="tbtn wide" id="chartBtn">📊 Chart</button>
  <button class="tbtn wide" id="findBtn">🔍 Find</button>
  <span class="sep"></span>
  <button class="tbtn wide" id="sheetExportBtn">⬇ CSV</button>
</div>

<!-- formula bar -->
<div class="formula-bar">
  <div class="fb-ref" id="cellRefLabel">A1</div>
  <div class="fb-fx">fx</div>
  <input id="formulaInput" spellcheck="false" autocomplete="off" placeholder="Click a cell or type a formula…">
</div>

<!-- main body -->
<div class="editor-body" style="position:relative;overflow:hidden;display:flex;flex-direction:column;">
  <div class="sheet-wrap" id="sheetWrap" tabindex="0"></div>

  <!-- find/replace -->
  <div id="findPanel" class="hidden">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b style="font-size:13px">Find &amp; Replace</b>
      <button id="findClose" style="border:none;background:none;font-size:17px;cursor:pointer;color:#64748b">✕</button>
    </div>
    <input id="findInput" placeholder="Find…">
    <input id="replaceInput" placeholder="Replace with…">
    <div class="find-row">
      <button id="findPrevBtn">◀ Prev</button>
      <button id="findNextBtn">Next ▶</button>
      <button id="replaceBtn">Replace</button>
      <button id="replaceAllBtn">All</button>
    </div>
    <span id="findStatus" style="font-size:11.5px;color:#64748b"></span>
  </div>
</div>

<!-- chart modal -->
<div id="chartPanel" class="hidden">
  <div class="chart-modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <b style="font-size:17px">Insert Chart</b>
      <button id="chartClose" style="border:none;background:none;font-size:22px;cursor:pointer;color:#64748b">✕</button>
    </div>
    <div class="chart-cfg">
      <label>Type<select id="chartTypeSel"><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option><option value="area">Area</option></select></label>
      <label>Range (e.g. A1:C8)<input id="chartRange" placeholder="A1:B10"></label>
      <label>Title<input id="chartTitle" placeholder="My Chart"></label>
      <label>First column = labels?<select id="chartLabels"><option value="yes">Yes</option><option value="no">No</option></select></label>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <button class="btn btn-primary" id="chartPreviewBtn">Preview</button>
      <button class="btn" id="chartInsertBtn">Save as note</button>
    </div>
    <div style="background:#f8fafc;border-radius:10px;padding:10px">
      <canvas id="chartCanvas" height="300"></canvas>
    </div>
  </div>
</div>

<!-- autocomplete dropdown (appended to body later) -->
<div id="fnDropdown">
  <div class="fnd-list" id="fndList"></div>
  <div class="fnd-hint" id="fndHint"></div>
</div>
`;

  /* ===== DOM refs ===== */
  const titleInput   = shell.querySelector('#sheetTitle');
  const saveDot      = shell.querySelector('#sheetSaveDot');
  const saveText     = shell.querySelector('#sheetSaveText');
  const sheetWrap    = shell.querySelector('#sheetWrap');
  const formulaInput = shell.querySelector('#formulaInput');
  const cellRefLabel = shell.querySelector('#cellRefLabel');
  const findPanel    = shell.querySelector('#findPanel');
  const chartPanel   = shell.querySelector('#chartPanel');
  const fnDropdown   = shell.querySelector('#fnDropdown');
  const fndList      = shell.querySelector('#fndList');
  const fndHint      = shell.querySelector('#fndHint');
  // move dropdown to body so it isn't clipped
  document.body.appendChild(fnDropdown);

  /* ===== selection ===== */
  let selR=0,selC=0,selR2=0,selC2=0,isDragging=false;
  const selMinR=()=>Math.min(selR,selR2);
  const selMaxR=()=>Math.max(selR,selR2);
  const selMinC=()=>Math.min(selC,selC2);
  const selMaxC=()=>Math.max(selC,selC2);
  const isSingle=()=>selR===selR2&&selC===selC2;
  const inSel=(r,c)=>r>=selMinR()&&r<=selMaxR()&&c>=selMinC()&&c<=selMaxC();

  /* ===== editing state ===== */
  let editingCell=null; // {r,c,el}
  let copiedRange=null; // {r0,c0,r1,c1}

  /* ===== save ===== */
  let saveTO=null;
  function markUnsaved(){ saveDot.style.background='var(--warning)'; saveText.textContent='Saving…'; clearTimeout(saveTO); saveTO=setTimeout(doSave,600); }
  function doSave(){ file.name=titleInput.value.trim()||'Untitled'; upsertFile(file); saveDot.style.background='#5B8A5E'; saveText.textContent='Saved'; }
  titleInput.addEventListener('input',markUnsaved);

  /* ===== cell data ===== */
  function getRaw(r,c){ return content.cells[cellKey(r,c)]||''; }
  function setRaw(r,c,v){ const k=cellKey(r,c); if(v===''||v==null) delete content.cells[k]; else content.cells[k]=v; }
  function getFormat(r,c){ return content.formats[cellKey(r,c)]||{}; }
  function setFormat(r,c,p){ const k=cellKey(r,c); content.formats[k]=Object.assign({},content.formats[k],p); }
  function applyFmtToSel(p){ snapshot(); for(let r=selMinR();r<=selMaxR();r++) for(let c=selMinC();c<=selMaxC();c++) setFormat(r,c,p); markUnsaved(); renderGrid(); syncFormulaBar(); }

  /* ===== formula engine ===== */
  function colToIdx(l){ let n=0; for(let i=0;i<l.length;i++) n=n*26+(l.charCodeAt(i)-64); return n-1; }
  function parseRef(ref){ const m=ref.match(/^([A-Z]+)(\d+)$/); if(!m) return null; return{c:colToIdx(m[1]),r:parseInt(m[2],10)-1}; }
  function getComputed(r,c,seen){
    seen=seen||new Set(); const k=cellKey(r,c);
    if(seen.has(k)) return'#REF!'; seen.add(k);
    const raw=getRaw(r,c);
    if(typeof raw==='string'&&raw.startsWith('=')){ try{ return evalFormula(raw.slice(1),seen); }catch(e){ return'#ERR!'; } }
    return raw;
  }
  function rangeNums(rs,seen){ return rangeAll(rs,seen).map(v=>parseFloat(v)).filter(v=>!isNaN(v)); }
  function rangeAll(rs,seen){
    const[a,b]=rs.split(':'); const ra=parseRef(a),rb=parseRef(b); if(!ra||!rb) return[];
    const r0=Math.min(ra.r,rb.r),r1=Math.max(ra.r,rb.r),c0=Math.min(ra.c,rb.c),c1=Math.max(ra.c,rb.c);
    const out=[]; for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++) out.push(getComputed(r,c,new Set(seen))); return out;
  }
  function splitArgs(s){
    const out=[]; let cur='',q=false;
    for(const ch of s){ if(ch==='"') q=!q; if(ch===','&&!q){out.push(cur);cur='';}else cur+=ch; }
    if(cur) out.push(cur); return out.map(x=>x.trim());
  }
  function sq(s){ if(typeof s==='string'&&s.startsWith('"')&&s.endsWith('"')) return s.slice(1,-1); return s; }
  function evalCond(s){
    s=String(s); const m=s.match(/^(.*?)(>=|<=|<>|!=|=|>|<)(.*)$/);
    if(!m) return!!parseFloat(s);
    const[,l,op,r2]=m; const ln=parseFloat(l.trim()),rn=parseFloat(r2.trim());
    const both=!isNaN(ln)&&!isNaN(rn); const lv=both?ln:sq(l.trim()); const rv=both?rn:sq(r2.trim());
    return op==='='?lv===rv:op==='<>'||op==='!='?lv!==rv:op==='>'?lv>rv:op==='<'?lv<rv:op==='>='?lv>=rv:lv<=rv;
  }
  function resolveExpr(s,seen){
    s=s.trim(); if(/^".*"$/.test(s)) return s;
    const rep=s.replace(/\b([A-Z]+\d+)\b/g,m=>{ const ref=parseRef(m); if(!ref) return m; const v=getComputed(ref.r,ref.c,seen); const n=parseFloat(v); return isNaN(n)?`"${String(v).replace(/"/g,'')}"`:n; });
    if(/^[-+*/0-9.()\s^]+$/.test(rep)){ try{ return Function('"use strict";return ('+rep+')')(); }catch(e){} }
    return rep;
  }
  function evalFormula(expr,seen){
    expr=expr.trim();
    const fm=expr.match(/^([A-Z_]+)\(([\s\S]*)\)$/i);
    if(fm){
      const fn=fm[1].toUpperCase(),a=fm[2];
      // aggregates
      if(['SUM','AVERAGE','MIN','MAX','COUNT'].includes(fn)){
        let v=[]; splitArgs(a).forEach(p=>{ p=p.trim(); if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(p)) v=v.concat(rangeNums(p.toUpperCase(),seen)); else{ const n=parseFloat(resolveExpr(p,seen)); if(!isNaN(n)) v.push(n); } });
        if(fn==='SUM') return v.reduce((a,b)=>a+b,0);
        if(fn==='AVERAGE') return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
        if(fn==='MIN') return v.length?Math.min(...v):0;
        if(fn==='MAX') return v.length?Math.max(...v):0;
        if(fn==='COUNT') return v.length;
      }
      if(fn==='MEDIAN'){ let v=[]; splitArgs(a).forEach(p=>{ p=p.trim(); if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(p)) v=v.concat(rangeNums(p.toUpperCase(),seen)); else{ const n=parseFloat(resolveExpr(p,seen)); if(!isNaN(n)) v.push(n); } }); v.sort((a,b)=>a-b); const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2; }
      if(fn==='STDEV'||fn==='STDEVP'){ let v=[]; splitArgs(a).forEach(p=>{ p=p.trim(); if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(p)) v=v.concat(rangeNums(p.toUpperCase(),seen)); else{ const n=parseFloat(resolveExpr(p,seen)); if(!isNaN(n)) v.push(n); } }); if(v.length<2) return 0; const mean=v.reduce((a,b)=>a+b,0)/v.length; const d=fn==='STDEVP'?v.length:v.length-1; return Math.sqrt(v.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/d); }
      if(fn==='POWER'){ const p=splitArgs(a); return Math.pow(parseFloat(resolveExpr(p[0],seen)),parseFloat(resolveExpr(p[1],seen))); }
      if(fn==='SQRT') return Math.sqrt(parseFloat(resolveExpr(a,seen)));
      if(fn==='ABS') return Math.abs(parseFloat(resolveExpr(a,seen)));
      if(fn==='ROUND'){ const p=splitArgs(a),d=p[1]!=null?parseInt(resolveExpr(p[1],seen),10):0; return Math.round(parseFloat(resolveExpr(p[0],seen))*10**d)/10**d; }
      if(fn==='FLOOR') return Math.floor(parseFloat(resolveExpr(a,seen)));
      if(fn==='CEILING') return Math.ceil(parseFloat(resolveExpr(a,seen)));
      if(fn==='MOD'){ const p=splitArgs(a); return parseFloat(resolveExpr(p[0],seen))%parseFloat(resolveExpr(p[1],seen)); }
      if(fn==='LOG'){ const p=splitArgs(a),base=p[1]?parseFloat(resolveExpr(p[1],seen)):10; return Math.log(parseFloat(resolveExpr(p[0],seen)))/Math.log(base); }
      if(fn==='LN') return Math.log(parseFloat(resolveExpr(a,seen)));
      if(fn==='EXP') return Math.exp(parseFloat(resolveExpr(a,seen)));
      if(fn==='PI') return Math.PI;
      if(fn==='RAND') return Math.random();
      if(fn==='RANDBETWEEN'){ const p=splitArgs(a); const lo=parseFloat(resolveExpr(p[0],seen)),hi=parseFloat(resolveExpr(p[1],seen)); return Math.floor(Math.random()*(hi-lo+1))+lo; }
      if(fn==='LEN') return String(sq(resolveExpr(a,seen))).length;
      if(fn==='UPPER') return String(sq(resolveExpr(a,seen))).toUpperCase();
      if(fn==='LOWER') return String(sq(resolveExpr(a,seen))).toLowerCase();
      if(fn==='TRIM') return String(sq(resolveExpr(a,seen))).trim();
      if(fn==='LEFT'){ const p=splitArgs(a); return String(sq(resolveExpr(p[0],seen))).slice(0,parseInt(resolveExpr(p[1],seen),10)); }
      if(fn==='RIGHT'){ const p=splitArgs(a); const s=String(sq(resolveExpr(p[0],seen))); return s.slice(-parseInt(resolveExpr(p[1],seen),10)); }
      if(fn==='MID'){ const p=splitArgs(a); return String(sq(resolveExpr(p[0],seen))).substr(parseInt(resolveExpr(p[1],seen),10)-1,parseInt(resolveExpr(p[2],seen),10)); }
      if(fn==='CONCAT'||fn==='CONCATENATE') return splitArgs(a).map(p=>sq(resolveExpr(p,seen))).join('');
      if(fn==='SUBSTITUTE'){ const p=splitArgs(a); return String(sq(resolveExpr(p[0],seen))).split(String(sq(resolveExpr(p[1],seen)))).join(String(sq(resolveExpr(p[2],seen)))); }
      if(fn==='REPT'){ const p=splitArgs(a); return String(sq(resolveExpr(p[0],seen))).repeat(parseInt(resolveExpr(p[1],seen),10)); }
      if(fn==='FIND'){ const p=splitArgs(a); const idx=String(sq(resolveExpr(p[1],seen))).indexOf(String(sq(resolveExpr(p[0],seen)))); return idx===-1?'#VALUE!':idx+1; }
      if(fn==='TEXT'){ const p=splitArgs(a); const n=parseFloat(resolveExpr(p[0],seen)); const fmt=sq(resolveExpr(p[1],seen)); if(!isNaN(n)&&String(fmt).includes('%')) return(n*100).toFixed(2)+'%'; return String(n); }
      if(fn==='IF'){ const p=splitArgs(a); return evalCond(resolveExpr(p[0],seen))?sq(resolveExpr(p[1],seen)):sq(resolveExpr(p[2],seen)); }
      if(fn==='IFERROR'){ const p=splitArgs(a); try{ const v=resolveExpr(p[0],seen); if(String(v).startsWith('#')) return sq(resolveExpr(p[1],seen)); return v; }catch(e){ return sq(resolveExpr(p[1],seen)); } }
      if(fn==='AND') return splitArgs(a).every(p=>evalCond(resolveExpr(p,seen)))?'TRUE':'FALSE';
      if(fn==='OR') return splitArgs(a).some(p=>evalCond(resolveExpr(p,seen)))?'TRUE':'FALSE';
      if(fn==='NOT') return!evalCond(resolveExpr(a,seen))?'TRUE':'FALSE';
      if(fn==='SUMIF'){ const p=splitArgs(a); const rng=p[0].trim().toUpperCase(),crit=sq(resolveExpr(p[1],seen)),sr=p[2]?p[2].trim().toUpperCase():rng; const cv=rangeAll(rng,seen),sv=rangeAll(sr,seen); let t=0; cv.forEach((v,i)=>{ if(String(v)===String(crit)||parseFloat(v)===parseFloat(crit)){ const n=parseFloat(sv[i]); if(!isNaN(n)) t+=n; } }); return t; }
      if(fn==='COUNTIF'){ const p=splitArgs(a); const crit=sq(resolveExpr(p[1],seen)); return rangeAll(p[0].trim().toUpperCase(),seen).filter(v=>String(v)===String(crit)||parseFloat(v)===parseFloat(crit)).length; }
      if(fn==='VLOOKUP'){ const p=splitArgs(a); const key=sq(resolveExpr(p[0],seen)),rng=p[1].trim().toUpperCase(),ci=parseInt(resolveExpr(p[2],seen),10)-1; const[a2,b2]=rng.split(':'); const ra=parseRef(a2),rb=parseRef(b2); if(!ra||!rb) return'#REF!'; for(let r=ra.r;r<=rb.r;r++){ const f=getComputed(r,ra.c,new Set(seen)); if(String(f)===String(key)||parseFloat(f)===parseFloat(key)) return getComputed(r,ra.c+ci,new Set(seen)); } return'#N/A'; }
      if(fn==='HLOOKUP'){ const p=splitArgs(a); const key=sq(resolveExpr(p[0],seen)),rng=p[1].trim().toUpperCase(),ri=parseInt(resolveExpr(p[2],seen),10)-1; const[a2,b2]=rng.split(':'); const ra=parseRef(a2),rb=parseRef(b2); if(!ra||!rb) return'#REF!'; for(let c=ra.c;c<=rb.c;c++){ const f=getComputed(ra.r,c,new Set(seen)); if(String(f)===String(key)) return getComputed(ra.r+ri,c,new Set(seen)); } return'#N/A'; }
      if(fn==='TODAY') return new Date().toLocaleDateString();
      if(fn==='NOW') return new Date().toLocaleString();
      if(fn==='YEAR'){ const d=new Date(sq(resolveExpr(a,seen))); return isNaN(d)?'#VALUE!':d.getFullYear(); }
      if(fn==='MONTH'){ const d=new Date(sq(resolveExpr(a,seen))); return isNaN(d)?'#VALUE!':d.getMonth()+1; }
      if(fn==='DAY'){ const d=new Date(sq(resolveExpr(a,seen))); return isNaN(d)?'#VALUE!':d.getDate(); }
    }
    return resolveExpr(expr,seen);
  }

  function displayValue(r,c){
    const raw=getRaw(r,c); let val;
    if(typeof raw==='string'&&raw.startsWith('=')){ try{ val=evalFormula(raw.slice(1),new Set()); }catch(e){ val='#ERR!'; } } else val=raw;
    const fmt=getFormat(r,c);
    if(fmt.numFormat&&val!==''&&!isNaN(parseFloat(val))){
      const n=parseFloat(val);
      if(fmt.numFormat==='number') return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(fmt.numFormat==='currency') return'$'+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(fmt.numFormat==='percent') return(n*100).toFixed(1)+'%';
      if(fmt.numFormat==='scientific') return n.toExponential(2);
    }
    return val;
  }

  /* ===== syntax coloring ===== */
  function colorizeFormula(raw){
    if(!raw||!raw.startsWith('=')) return escapeHtml(raw);
    let s=raw.slice(1);
    // order matters: strings first, then fn names, refs, numbers, ops
    s=s.replace(/"[^"]*"/g,m=>`\x00str\x01${m}\x02`);
    s=s.replace(/\b([A-Z]{1,10})\(/g,(_,fn)=>{
      const isKnown=FN_NAMES.has(fn.toUpperCase());
      return `\x00fn${isKnown?'k':'u'}\x01${fn}(\x02`;
    });
    s=s.replace(/\b([A-Z]+\d+)\b/g,m=>`\x00ref\x01${m}\x02`);
    s=s.replace(/\b(\d+\.?\d*)\b/g,m=>`\x00num\x01${m}\x02`);
    s=s.replace(/([+\-*/=<>!&|^%])/g,m=>`\x00op\x01${m}\x02`);
    // encode then swap
    s=escapeHtml(s);
    s=s.replace(/\x00str\x01(.*?)\x02/g,'<span class="fx-str">$1</span>');
    s=s.replace(/\x00fnk\x01(.*?)\x02/g,'<span class="fx-fn">$1</span>');
    s=s.replace(/\x00fnu\x01(.*?)\x02/g,'<span style="color:#64748b">$1</span>');
    s=s.replace(/\x00ref\x01(.*?)\x02/g,'<span class="fx-ref">$1</span>');
    s=s.replace(/\x00num\x01(.*?)\x02/g,'<span class="fx-num">$1</span>');
    s=s.replace(/\x00op\x01(.*?)\x02/g,'<span class="fx-op">$1</span>');
    return '<span class="fx-op">=</span>'+s;
  }

  /* ===== render grid ===== */
  function renderGrid(){
    let html='<table class="sheet-table"><thead><tr><th class="corner"></th>';
    for(let c=0;c<content.cols;c++){
      const sel=c>=selMinC()&&c<=selMaxC()?'sh':'';
      html+=`<th data-col="${c}" class="${sel}">${colLabel(c)}</th>`;
    }
    html+='</tr></thead><tbody>';
    for(let r=0;r<content.rows;r++){
      const rsel=r>=selMinR()&&r<=selMaxR()?'sh':'';
      html+=`<tr><th class="row-head ${rsel}" data-row="${r}">${r+1}</th>`;
      for(let c=0;c<content.cols;c++){
        const fmt=getFormat(r,c);
        const isAnchor=r===selR&&c===selC;
        const isInSel=inSel(r,c);
        const isCopied=copiedRange&&r>=copiedRange.r0&&r<=copiedRange.r1&&c>=copiedRange.c0&&c<=copiedRange.c1;
        let cls=isAnchor?'s-anchor':isInSel?'s-range':'';
        if(isCopied) cls+=(cls?' ':'')+' copied';
        if(fmt.wrapText) cls+=' wrap-text';
        let bdr='';
        if(fmt.border==='all') bdr='border:1.5px solid #334155;';
        else if(fmt.border==='bottom') bdr='border-bottom:2px solid #334155;';
        else if(fmt.border==='top') bdr='border-top:2px solid #334155;';
        const style=[
          fmt.bold?'font-weight:700;':'',
          fmt.italic?'font-style:italic;':'',
          fmt.underline?'text-decoration:underline'+(fmt.strike?' line-through':'')+';':'',
          fmt.strike&&!fmt.underline?'text-decoration:line-through;':'',
          fmt.color?`color:${fmt.color};`:'',
          fmt.bg?`background:${fmt.bg};`:'',
          fmt.align?`text-align:${fmt.align};`:'',
          fmt.fontSize?`font-size:${fmt.fontSize}px;line-height:26px;`:'',
          bdr,
        ].join('');
        const raw=getRaw(r,c);
        const dispVal=displayValue(r,c);
        // show colored formula in cell if starts with =
        let inner;
        if(typeof raw==='string'&&raw.startsWith('=')){
          inner=`<span style="font-size:11px;font-family:'Courier New',monospace;color:#94a3b8">=</span><span style="color:inherit">${escapeHtml(String(dispVal))}</span>`;
        } else {
          inner=escapeHtml(String(dispVal));
        }
        html+=`<td data-row="${r}" data-col="${c}" class="${cls}" style="${style}">${inner}</td>`;
      }
      html+='</tr>';
    }
    html+='</tbody></table>';
    sheetWrap.innerHTML=html;
    attachGridEvents();
  }

  /* ===== grid mouse/touch events ===== */
  function attachGridEvents(){
    sheetWrap.querySelectorAll('td[data-row]').forEach(td=>{
      td.addEventListener('mousedown',e=>{
        if(e.button!==0) return;
        closeFnDropdown();
        const r=+td.dataset.row, c=+td.dataset.col;
        if(editingCell&&(editingCell.r!==r||editingCell.c!==c)) commitEdit();
        if(e.shiftKey){ selR2=r; selC2=c; }
        else { selR=r; selC=c; selR2=r; selC2=c; isDragging=true; }
        e.preventDefault();
        syncFormulaBar(); renderGrid(); sheetWrap.focus();
      });
      td.addEventListener('mouseover',e=>{
        if(!isDragging) return;
        const r=+td.dataset.row, c=+td.dataset.col;
        if(r!==selR2||c!==selC2){ selR2=r; selC2=c; renderGrid(); }
      });
    });
    document.addEventListener('mouseup',()=>{ isDragging=false; },{ once:false, passive:true });

    sheetWrap.querySelectorAll('th[data-col]').forEach(th=>{
      th.addEventListener('click',()=>{ const c=+th.dataset.col; selR=0;selC=c;selR2=content.rows-1;selC2=c; syncFormulaBar(); renderGrid(); });
    });
    sheetWrap.querySelectorAll('th[data-row]').forEach(th=>{
      th.addEventListener('click',()=>{ const r=+th.dataset.row; selR=r;selC=0;selR2=r;selC2=content.cols-1; syncFormulaBar(); renderGrid(); });
    });
  }

  /* ===== sync formula bar ===== */
  function syncFormulaBar(){
    const label=isSingle()?colLabel(selC)+(selR+1):`${colLabel(selMinC())}${selMinR()+1}:${colLabel(selMaxC())}${selMaxR()+1}`;
    cellRefLabel.textContent=label;
    const raw=getRaw(selR,selC);
    formulaInput.value=raw;
    updateFormulaBarColor(raw);
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

  /* formula bar: colored overlay is done by coloring the input text itself via a hidden div behind */
  // Actually we make the input transparent and overlay a div — simpler: just style the input via CSS custom property trick
  // We keep it simple: the formula bar input stays plain but the CELL shows the colored version.
  function updateFormulaBarColor(raw){
    // Color the input text itself isn't feasible in <input>, so we apply a CSS gradient trick
    // For simplicity we just keep the formula input as a regular input and show color in cell only.
    // (true syntax coloring of <input> isn't supported in HTML — would need contenteditable)
  }

  /* ===== inline editing ===== */
  function beginEdit(r,c,initialChar){
    if(editingCell&&(editingCell.r===r&&editingCell.c===c)) return; // already editing
    commitEdit(); // commit any previous
    editingCell={r,c};
    const td=sheetWrap.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
    if(!td) return;
    const raw=getRaw(r,c);
    const startVal=initialChar!==undefined&&initialChar!==null ? initialChar : raw;
    // Build a contenteditable div so we can do syntax colouring later — for now a textarea
    td.innerHTML=`<textarea class="cell-editor" spellcheck="false">${escapeHtml(String(startVal))}</textarea>`;
    const ta=td.querySelector('textarea');
    ta.focus();
    if(initialChar===null||initialChar===undefined){ ta.setSelectionRange(ta.value.length,ta.value.length); } else { ta.setSelectionRange(1,1); }
    // sync formula bar live
    ta.addEventListener('input',()=>{
      formulaInput.value=ta.value;
      handleAutocomplete(ta.value, ta);
    });
    ta.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); commitEdit('down'); }
      else if(e.key==='Tab'){ e.preventDefault(); commitEdit('right'); }
      else if(e.key==='Escape'){ cancelEdit(); }
      else if(e.key==='ArrowUp'&&!fnDropdownOpen()){ e.preventDefault(); commitEdit('up'); }
      else if(e.key==='ArrowDown'&&!fnDropdownOpen()){ e.preventDefault(); commitEdit('down'); }
      else if(e.key==='ArrowDown'&&fnDropdownOpen()){ e.preventDefault(); moveFnSel(1); }
      else if(e.key==='ArrowUp'&&fnDropdownOpen()){ e.preventDefault(); moveFnSel(-1); }
      else if(e.key==='Enter'&&fnDropdownOpen()){ e.preventDefault(); insertFnCompletion(ta); }
    });
    ta.addEventListener('blur',e=>{
      // delay so click on dropdown works
      setTimeout(()=>{ if(!fnDropdown.contains(document.activeElement)) commitEdit(); },120);
    });
    // trigger autocomplete if already starts with =
    if(startVal&&startVal.startsWith('=')) handleAutocomplete(startVal, ta);
  }

  function commitEdit(dir){
    if(!editingCell) return;
    const{r,c}=editingCell;
    const td=sheetWrap.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
    const ta=td&&td.querySelector('textarea');
    if(ta){
      const v=ta.value;
      snapshot(); setRaw(r,c,v); markUnsaved();
    }
    editingCell=null;
    closeFnDropdown();
    renderGrid();
    // move selection
    if(dir==='down'&&r<content.rows-1){ selR=r+1;selC=c;selR2=selR;selC2=selC; }
    else if(dir==='up'&&r>0){ selR=r-1;selC=c;selR2=selR;selC2=selC; }
    else if(dir==='right'&&c<content.cols-1){ selR=r;selC=c+1;selR2=selR;selC2=selC; }
    else{ selR=r;selC=c;selR2=r;selC2=c; }
    syncFormulaBar();
  }
  function cancelEdit(){
    editingCell=null; closeFnDropdown(); renderGrid(); syncFormulaBar();
  }

  /* ===== formula bar editing ===== */
  formulaInput.addEventListener('focus',()=>{
    // if a cell is being edited, keep them in sync; if not, begin a "virtual" edit tracked via formulaInput
  });
  formulaInput.addEventListener('input',()=>{
    const v=formulaInput.value;
    if(editingCell){ const ta=sheetWrap.querySelector(`td[data-row="${editingCell.r}"][data-col="${editingCell.c}"] textarea`); if(ta) ta.value=v; }
    handleAutocomplete(v, formulaInput);
  });
  formulaInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      if(fnDropdownOpen()){ insertFnCompletion(formulaInput); return; }
      snapshot(); setRaw(selR,selC,formulaInput.value); markUnsaved();
      editingCell=null; closeFnDropdown();
      renderGrid();
      if(selR<content.rows-1){ selR++;selR2=selR;selC2=selC; }
      syncFormulaBar();
    } else if(e.key==='Escape'){ closeFnDropdown(); }
    else if(e.key==='ArrowDown'&&fnDropdownOpen()){ e.preventDefault(); moveFnSel(1); }
    else if(e.key==='ArrowUp'&&fnDropdownOpen()){ e.preventDefault(); moveFnSel(-1); }
  });

  /* ===== autocomplete ===== */
  let fnSelIdx=0, fnFilteredList=[];
  function handleAutocomplete(val, anchorEl){
    if(!val||!val.startsWith('=')){ closeFnDropdown(); return; }
    // find the last word after = or ( or ,
    const inner=val.slice(1);
    const lastToken=inner.match(/(?:^|[,(+\-*\/\s])([A-Z]*)$/i);
    if(!lastToken){ closeFnDropdown(); return; }
    const query=lastToken[1].toUpperCase();
    // check if we're inside a completed function for param hint
    const paramHint=getParamHint(inner);
    fnFilteredList=FN_CATALOG.filter(f=>f.name.startsWith(query));
    if(!fnFilteredList.length&&!paramHint){ closeFnDropdown(); return; }
    buildDropdown(fnFilteredList, paramHint, query);
    positionDropdown(anchorEl);
    fnSelIdx=0;
    renderFndSel();
  }
  function getParamHint(expr){
    // find innermost open function
    let depth=0, fnStart=-1, fnName='';
    for(let i=expr.length-1;i>=0;i--){
      const ch=expr[i];
      if(ch===')') depth++;
      else if(ch==='('){
        if(depth===0){
          // find fn name before this (
          const m=expr.slice(0,i).match(/([A-Z_]+)$/i);
          if(m){ fnName=m[1].toUpperCase(); fnStart=i; break; }
        } else depth--;
      }
    }
    if(!fnName) return null;
    const entry=FN_CATALOG.find(f=>f.name===fnName);
    return entry?entry:null;
  }
  function buildDropdown(list, hint, query){
    fndList.innerHTML=list.slice(0,12).map((f,i)=>`
      <div class="fnd-item${i===0?' active':''}" data-idx="${i}">
        <div><div class="fnd-name">${escapeHtml(f.name)}</div><div class="fnd-sig">${escapeHtml(f.sig)}</div></div>
        <div class="fnd-desc">${escapeHtml(f.desc)}</div>
      </div>`).join('');
    fndHint.textContent=hint?hint.sig:'';
    fndHint.style.display=hint?'block':'none';
    fndList.querySelectorAll('.fnd-item').forEach((el,i)=>{
      el.addEventListener('mousedown',e=>{ e.preventDefault(); fnSelIdx=i; const active=document.activeElement; insertFnCompletion(active&&(active.tagName==='TEXTAREA'||active===formulaInput)?active:formulaInput); });
    });
    fnDropdown.classList.add('open');
  }
  function closeFnDropdown(){ fnDropdown.classList.remove('open'); }
  function fnDropdownOpen(){ return fnDropdown.classList.contains('open'); }
  function positionDropdown(anchorEl){
    const rect=anchorEl.getBoundingClientRect();
    fnDropdown.style.left=rect.left+'px';
    fnDropdown.style.top=(rect.bottom+4)+'px';
    fnDropdown.style.maxWidth=Math.max(340, rect.width)+'px';
  }
  function renderFndSel(){
    fndList.querySelectorAll('.fnd-item').forEach((el,i)=>{ el.classList.toggle('active',i===fnSelIdx); });
    const active=fndList.querySelector('.fnd-item.active');
    if(active) active.scrollIntoView({block:'nearest'});
  }
  function moveFnSel(d){ fnSelIdx=Math.max(0,Math.min(fnFilteredList.length-1,fnSelIdx+d)); renderFndSel(); }
  function insertFnCompletion(inputEl){
    if(!fnFilteredList[fnSelIdx]) return;
    const fn=fnFilteredList[fnSelIdx].name;
    const val=(inputEl.value||'');
    // replace the partial token after last =/(,
    const inner=val.startsWith('=')?val.slice(1):val;
    const replaced='='+inner.replace(/([A-Z]*)$/i,fn+'(');
    inputEl.value=replaced;
    formulaInput.value=replaced;
    if(editingCell){ const ta=sheetWrap.querySelector(`td[data-row="${editingCell.r}"][data-col="${editingCell.c}"] textarea`); if(ta){ta.value=replaced;ta.focus();} }
    closeFnDropdown();
    // re-trigger for param hint
    handleAutocomplete(replaced, inputEl);
  }

  /* ===== keyboard navigation (when not editing) ===== */
  sheetWrap.addEventListener('keydown',e=>{
    if(editingCell) return; // let textarea handle
    const ctrl=e.ctrlKey||e.metaKey;
    if(ctrl){
      if(e.key==='z'){ e.preventDefault(); undo(); return; }
      if(e.key==='y'||e.key==='Z'){ e.preventDefault(); redo(); return; }
      if(e.key==='b'){ e.preventDefault(); applyFmtToSel({bold:!getFormat(selR,selC).bold}); return; }
      if(e.key==='i'){ e.preventDefault(); applyFmtToSel({italic:!getFormat(selR,selC).italic}); return; }
      if(e.key==='u'){ e.preventDefault(); applyFmtToSel({underline:!getFormat(selR,selC).underline}); return; }
      if(e.key==='a'){ e.preventDefault(); selR=0;selC=0;selR2=content.rows-1;selC2=content.cols-1; renderGrid();syncFormulaBar(); return; }
      if(e.key==='c'){ e.preventDefault(); copySelection(); return; }
      if(e.key==='v'){ e.preventDefault(); pasteSelection(); return; }
      if(e.key==='x'){ e.preventDefault(); copySelection(); clearSelection(); return; }
      if(e.key==='f'){ e.preventDefault(); toggleFind(); return; }
      return;
    }
    if(e.key==='ArrowDown'){ e.preventDefault(); if(e.shiftKey){ selR2=Math.min(selR2+1,content.rows-1); }else{ selR=Math.min(selR+1,content.rows-1);selR2=selR;selC2=selC; } renderGrid();syncFormulaBar(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(e.shiftKey){ selR2=Math.max(selR2-1,0); }else{ selR=Math.max(selR-1,0);selR2=selR;selC2=selC; } renderGrid();syncFormulaBar(); }
    else if(e.key==='ArrowRight'){ e.preventDefault(); if(e.shiftKey){ selC2=Math.min(selC2+1,content.cols-1); }else{ selC=Math.min(selC+1,content.cols-1);selR2=selR;selC2=selC; } renderGrid();syncFormulaBar(); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); if(e.shiftKey){ selC2=Math.max(selC2-1,0); }else{ selC=Math.max(selC-1,0);selR2=selR;selC2=selC; } renderGrid();syncFormulaBar(); }
    else if(e.key==='Tab'){ e.preventDefault(); selC=Math.min(selC+1,content.cols-1);selC2=selC;selR2=selR; renderGrid();syncFormulaBar(); }
    else if(e.key==='Enter'||e.key==='F2'){ e.preventDefault(); beginEdit(selR,selC); }
    else if(e.key==='Delete'||e.key==='Backspace'){ clearSelection(); }
    else if(e.key==='Escape'){ selR2=selR;selC2=selC; copiedRange=null; renderGrid(); }
    else if(e.key.length===1&&!ctrl){ beginEdit(selR,selC,e.key); }
  });
  // single click = start editing immediately (no double-click needed)
  sheetWrap.addEventListener('click',e=>{
    const td=e.target.closest('td[data-row]');
    if(!td) return;
    const r=+td.dataset.row, c=+td.dataset.col;
    if(editingCell&&(editingCell.r!==r||editingCell.c!==c)) commitEdit();
    // only start edit on second click of same cell (first click = select, second = edit)
    if(selR===r&&selC===c&&!e.shiftKey&&!isDragging){ beginEdit(r,c); }
  });

  /* ===== copy / paste ===== */
  function copySelection(){
    const r0=selMinR(),r1=selMaxR(),c0=selMinC(),c1=selMaxC();
    const cells=[],fmts=[];
    for(let r=r0;r<=r1;r++){
      const rc=[],fc=[];
      for(let c=c0;c<=c1;c++){ rc.push(getRaw(r,c)); fc.push(Object.assign({},getFormat(r,c))); }
      cells.push(rc); fmts.push(fc);
    }
    clipboardData={cells,fmts,rows:r1-r0+1,cols:c1-c0+1};
    copiedRange={r0,c0,r1,c1};
    // native clipboard (tab-separated values)
    const tsv=cells.map(row=>row.map(v=>{ const s=String(v).replace(/\t/g,' '); return s; }).join('\t')).join('\n');
    navigator.clipboard&&navigator.clipboard.writeText(tsv).catch(()=>{});
    renderGrid();
  }
  function pasteSelection(){
    // try native clipboard first for cross-app paste
    if(navigator.clipboard&&navigator.clipboard.readText){
      navigator.clipboard.readText().then(text=>{
        if(text&&!clipboardData){
          // parse TSV from external source
          snapshot();
          const rows=text.split('\n');
          rows.forEach((row,ri)=>{
            row.split('\t').forEach((cell,ci)=>{
              const r=selR+ri,c=selC+ci;
              if(r<content.rows&&c<content.cols) setRaw(r,c,cell.trim());
            });
          });
          markUnsaved(); renderGrid(); syncFormulaBar();
        } else if(clipboardData){ doPaste(); }
      }).catch(()=>{ if(clipboardData) doPaste(); });
    } else if(clipboardData){ doPaste(); }
  }
  function doPaste(){
    if(!clipboardData) return;
    snapshot();
    const{cells,fmts}=clipboardData;
    cells.forEach((row,ri)=>{
      row.forEach((val,ci)=>{
        const r=selR+ri, c=selC+ci;
        if(r<content.rows&&c<content.cols){
          setRaw(r,c,val);
          content.formats[cellKey(r,c)]=Object.assign({},fmts[ri][ci]);
        }
      });
    });
    copiedRange=null;
    markUnsaved(); renderGrid(); syncFormulaBar();
  }
  function clearSelection(){
    snapshot();
    for(let r=selMinR();r<=selMaxR();r++) for(let c=selMinC();c<=selMaxC();c++) setRaw(r,c,'');
    markUnsaved(); renderGrid(); syncFormulaBar();
  }

  /* ===== toolbar bindings ===== */
  shell.querySelector('#boldBtn').addEventListener('click',()=>applyFmtToSel({bold:!getFormat(selR,selC).bold}));
  shell.querySelector('#italicBtn').addEventListener('click',()=>applyFmtToSel({italic:!getFormat(selR,selC).italic}));
  shell.querySelector('#underlineBtn').addEventListener('click',()=>applyFmtToSel({underline:!getFormat(selR,selC).underline}));
  shell.querySelector('#strikeBtn').addEventListener('click',()=>applyFmtToSel({strike:!getFormat(selR,selC).strike}));
  shell.querySelector('#wrapBtn').addEventListener('click',()=>applyFmtToSel({wrapText:!getFormat(selR,selC).wrapText}));
  shell.querySelector('#bgFillInput').addEventListener('input',e=>applyFmtToSel({bg:e.target.value}));
  shell.querySelector('#textColorInput').addEventListener('input',e=>applyFmtToSel({color:e.target.value}));
  shell.querySelector('#alignSel').addEventListener('change',e=>applyFmtToSel({align:e.target.value}));
  shell.querySelector('#numFormatSel').addEventListener('change',e=>applyFmtToSel({numFormat:e.target.value}));
  shell.querySelector('#fontSizeSel').addEventListener('change',e=>applyFmtToSel({fontSize:+e.target.value}));
  shell.querySelector('#borderSel').addEventListener('change',e=>applyFmtToSel({border:e.target.value}));
  shell.querySelector('#undoBtn').addEventListener('click',undo);
  shell.querySelector('#redoBtn').addEventListener('click',redo);
  shell.querySelector('#clearBtn').addEventListener('click',clearSelection);
  shell.querySelector('#clearFmtBtn').addEventListener('click',()=>{
    snapshot();
    for(let r=selMinR();r<=selMaxR();r++) for(let c=selMinC();c<=selMaxC();c++) content.formats[cellKey(r,c)]={};
    markUnsaved(); renderGrid(); syncFormulaBar();
  });

  /* ---- insert/delete row/col ---- */
  shell.querySelector('#insertRowBtn').addEventListener('click',()=>{
    snapshot();
    for(let r=content.rows-1;r>=selMinR();r--) for(let c=0;c<content.cols;c++){ content.cells[cellKey(r+1,c)]=content.cells[cellKey(r,c)]; content.formats[cellKey(r+1,c)]=content.formats[cellKey(r,c)]; delete content.cells[cellKey(r,c)]; delete content.formats[cellKey(r,c)]; }
    content.rows++; markUnsaved(); renderGrid();
  });
  shell.querySelector('#insertColBtn').addEventListener('click',()=>{
    snapshot();
    for(let c=content.cols-1;c>=selMinC();c--) for(let r=0;r<content.rows;r++){ content.cells[cellKey(r,c+1)]=content.cells[cellKey(r,c)]; content.formats[cellKey(r,c+1)]=content.formats[cellKey(r,c)]; delete content.cells[cellKey(r,c)]; delete content.formats[cellKey(r,c)]; }
    content.cols++; markUnsaved(); renderGrid();
  });
  shell.querySelector('#delRowBtn').addEventListener('click',()=>{
    if(content.rows<=1) return; snapshot();
    for(let r=selMinR();r<content.rows-1;r++) for(let c=0;c<content.cols;c++){ content.cells[cellKey(r,c)]=content.cells[cellKey(r+1,c)]; content.formats[cellKey(r,c)]=content.formats[cellKey(r+1,c)]; if(!content.cells[cellKey(r,c)]) delete content.cells[cellKey(r,c)]; }
    for(let c=0;c<content.cols;c++){ delete content.cells[cellKey(content.rows-1,c)]; delete content.formats[cellKey(content.rows-1,c)]; }
    content.rows--; selR=Math.min(selR,content.rows-1); selR2=selR; selC2=selC; markUnsaved(); renderGrid(); syncFormulaBar();
  });
  shell.querySelector('#delColBtn').addEventListener('click',()=>{
    if(content.cols<=1) return; snapshot();
    for(let c=selMinC();c<content.cols-1;c++) for(let r=0;r<content.rows;r++){ content.cells[cellKey(r,c)]=content.cells[cellKey(r,c+1)]; content.formats[cellKey(r,c)]=content.formats[cellKey(r,c+1)]; if(!content.cells[cellKey(r,c)]) delete content.cells[cellKey(r,c)]; }
    for(let r=0;r<content.rows;r++){ delete content.cells[cellKey(r,content.cols-1)]; delete content.formats[cellKey(r,content.cols-1)]; }
    content.cols--; selC=Math.min(selC,content.cols-1); selR2=selR; selC2=selC; markUnsaved(); renderGrid(); syncFormulaBar();
  });

  /* ---- fill ---- */
  shell.querySelector('#fillDownBtn').addEventListener('click',()=>{
    snapshot();
    for(let c=selMinC();c<=selMaxC();c++){ const v=getRaw(selMinR(),c),f=getFormat(selMinR(),c); for(let r=selMinR()+1;r<=selMaxR();r++){ setRaw(r,c,v); content.formats[cellKey(r,c)]=Object.assign({},f); } }
    markUnsaved(); renderGrid();
  });
  shell.querySelector('#fillRightBtn').addEventListener('click',()=>{
    snapshot();
    for(let r=selMinR();r<=selMaxR();r++){ const v=getRaw(r,selMinC()),f=getFormat(r,selMinC()); for(let c=selMinC()+1;c<=selMaxC();c++){ setRaw(r,c,v); content.formats[cellKey(r,c)]=Object.assign({},f); } }
    markUnsaved(); renderGrid();
  });

  /* ---- sort ---- */
  function sortCol(asc){
    snapshot();
    const col=selC;
    const rows=Array.from({length:content.rows},(_,r)=>{ const row={c:{},f:{}}; for(let c=0;c<content.cols;c++){row.c[c]=content.cells[cellKey(r,c)];row.f[c]=content.formats[cellKey(r,c)];} return row; });
    rows.sort((a,b)=>{ const av=a.c[col]??'',bv=b.c[col]??''; const an=parseFloat(av),bn=parseFloat(bv); if(!isNaN(an)&&!isNaN(bn)) return asc?an-bn:bn-an; return asc?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av)); });
    const nc={},nf={};
    rows.forEach((row,r)=>{ for(let c=0;c<content.cols;c++){ if(row.c[c]!=null) nc[cellKey(r,c)]=row.c[c]; if(row.f[c]) nf[cellKey(r,c)]=row.f[c]; } });
    content.cells=nc; content.formats=nf; markUnsaved(); renderGrid();
  }
  shell.querySelector('#sortAscBtn').addEventListener('click',()=>sortCol(true));
  shell.querySelector('#sortDescBtn').addEventListener('click',()=>sortCol(false));

  /* ---- export ---- */
  shell.querySelector('#sheetExportBtn').addEventListener('click',()=>{
    let csv='';
    for(let r=0;r<content.rows;r++){
      const row=[]; let hasData=false;
      for(let c=0;c<content.cols;c++){ const v=String(displayValue(r,c)); if(v) hasData=true; const s=v.replace(/"/g,'""'); row.push(/[,"\n]/.test(s)?`"${s}"`:s); }
      if(hasData) csv+=row.join(',')+'\n';
    }
    downloadBlob(new Blob([csv],{type:'text/csv'}),(file.name||'spreadsheet')+'.csv');
  });

  /* ---- find & replace ---- */
  let findMatches=[],findIdx=0;
  function toggleFind(){ findPanel.classList.toggle('hidden'); if(!findPanel.classList.contains('hidden')) shell.querySelector('#findInput').focus(); }
  shell.querySelector('#findBtn').addEventListener('click',toggleFind);
  shell.querySelector('#findClose').addEventListener('click',()=>findPanel.classList.add('hidden'));
  function doFind(){
    const q=shell.querySelector('#findInput').value.toLowerCase(); findMatches=[];
    if(!q){ shell.querySelector('#findStatus').textContent=''; return; }
    for(let r=0;r<content.rows;r++) for(let c=0;c<content.cols;c++) if(String(displayValue(r,c)).toLowerCase().includes(q)) findMatches.push({r,c});
    shell.querySelector('#findStatus').textContent=findMatches.length?`${findMatches.length} result(s)`:'No results';
    findIdx=0; if(findMatches.length){ const m=findMatches[0]; selR=m.r;selC=m.c;selR2=m.r;selC2=m.c; renderGrid();syncFormulaBar(); }
  }
  shell.querySelector('#findInput').addEventListener('input',doFind);
  shell.querySelector('#findNextBtn').addEventListener('click',()=>{ if(!findMatches.length) return; findIdx=(findIdx+1)%findMatches.length; const m=findMatches[findIdx];selR=m.r;selC=m.c;selR2=m.r;selC2=m.c;renderGrid();syncFormulaBar(); });
  shell.querySelector('#findPrevBtn').addEventListener('click',()=>{ if(!findMatches.length) return; findIdx=(findIdx-1+findMatches.length)%findMatches.length; const m=findMatches[findIdx];selR=m.r;selC=m.c;selR2=m.r;selC2=m.c;renderGrid();syncFormulaBar(); });
  shell.querySelector('#replaceBtn').addEventListener('click',()=>{ if(!findMatches.length) return; snapshot(); const m=findMatches[findIdx]; const find=shell.querySelector('#findInput').value,repl=shell.querySelector('#replaceInput').value; setRaw(m.r,m.c,String(getRaw(m.r,m.c)).replace(find,repl)); markUnsaved();renderGrid();doFind(); });
  shell.querySelector('#replaceAllBtn').addEventListener('click',()=>{ if(!findMatches.length) return; snapshot(); const find=shell.querySelector('#findInput').value,repl=shell.querySelector('#replaceInput').value; findMatches.forEach(m=>setRaw(m.r,m.c,String(getRaw(m.r,m.c)).split(find).join(repl))); markUnsaved();renderGrid();doFind(); });

  /* ---- charts ---- */
  const PAL=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];
  shell.querySelector('#chartBtn').addEventListener('click',()=>{
    if(!isSingle()){ const rs=`${colLabel(selMinC())}${selMinR()+1}:${colLabel(selMaxC())}${selMaxR()+1}`; shell.querySelector('#chartRange').value=rs; }
    chartPanel.classList.remove('hidden');
  });
  shell.querySelector('#chartClose').addEventListener('click',()=>chartPanel.classList.add('hidden'));
  chartPanel.addEventListener('click',e=>{ if(e.target===chartPanel) chartPanel.classList.add('hidden'); });
  function parseChartData(){
    const rs=shell.querySelector('#chartRange').value.trim().toUpperCase(); if(!rs.includes(':')) return null;
    const[a,b]=rs.split(':'); const ra=parseRef(a),rb=parseRef(b); if(!ra||!rb) return null;
    const r0=Math.min(ra.r,rb.r),r1=Math.max(ra.r,rb.r),c0=Math.min(ra.c,rb.c),c1=Math.max(ra.c,rb.c);
    const rows=[];
    for(let r=r0;r<=r1;r++){ const row=[]; for(let c=c0;c<=c1;c++) row.push(getComputed(r,c,new Set())); rows.push(row); }
    const hdr=rows[0]&&rows[0].every(v=>isNaN(parseFloat(v)));
    const headers=hdr?rows[0]:null; const dataRows=hdr?rows.slice(1):rows;
    const useLabels=shell.querySelector('#chartLabels').value==='yes';
    const labels=useLabels?dataRows.map(r=>String(r[0])):dataRows.map((_,i)=>String(i+1));
    const scols=useLabels?Array.from({length:c1-c0},(_,i)=>i+1):Array.from({length:c1-c0+1},(_,i)=>i);
    const datasets=scols.map((ci,si)=>({ label:headers?String(headers[ci]):`Series ${si+1}`, data:dataRows.map(r=>parseFloat(r[ci])||0) }));
    return{labels,datasets};
  }
  function drawChart(){
    const canvas=shell.querySelector('#chartCanvas'); const ctx=canvas.getContext('2d');
    const type=shell.querySelector('#chartTypeSel').value; const title=shell.querySelector('#chartTitle').value||'Chart';
    const parsed=parseChartData();
    if(!parsed){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#ef4444'; ctx.font='14px system-ui'; ctx.fillText('Invalid range — check the data range field.',20,40); return; }
    const W=canvas.offsetWidth||620,H=300;
    canvas.width=W*devicePixelRatio; canvas.height=H*devicePixelRatio; canvas.style.height=H+'px';
    ctx.scale(devicePixelRatio,devicePixelRatio); ctx.clearRect(0,0,W,H);
    const{labels,datasets}=parsed;
    const pad={top:44,right:20,bottom:48,left:56};
    const cW=W-pad.left-pad.right,cH=H-pad.top-pad.bottom,n=labels.length;
    ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#0f172a'; ctx.font='bold 13px system-ui'; ctx.textAlign='center'; ctx.fillText(title,W/2,22);
    if(type==='pie'){
      const cx=W/2,cy=pad.top+cH/2,outerR=Math.min(cW,cH)/2-8;
      const flat=datasets[0]?datasets[0].data:[]; const total=flat.reduce((a,b)=>a+b,0)||1;
      let angle=-Math.PI/2;
      flat.forEach((v,i)=>{ const s=(v/total)*Math.PI*2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,outerR,angle,angle+s); ctx.closePath(); ctx.fillStyle=PAL[i%PAL.length]; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); const mid=angle+s/2; ctx.fillStyle='#fff'; ctx.font='bold 11px system-ui'; ctx.textAlign='center'; if(s>0.2) ctx.fillText(labels[i],cx+Math.cos(mid)*outerR*.65,cy+Math.sin(mid)*outerR*.65+4); angle+=s; });
      return;
    }
    let allV=datasets.flatMap(d=>d.data).filter(v=>!isNaN(v)); if(!allV.length) allV=[0,1];
    const minV=Math.min(0,...allV),maxV=Math.max(...allV),range=maxV-minV||1;
    const vy=v=>pad.top+cH-((v-minV)/range)*cH;
    ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1;
    for(let i=0;i<=5;i++){ const y=pad.top+(cH/5)*i; ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+cW,y); ctx.stroke(); const val=maxV-(range/5)*i; ctx.fillStyle='#94a3b8'; ctx.font='10px system-ui'; ctx.textAlign='right'; ctx.fillText(val.toFixed(val%1?1:0),pad.left-6,y+3); }
    ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(pad.left,pad.top); ctx.lineTo(pad.left,pad.top+cH); ctx.lineTo(pad.left+cW,pad.top+cH); ctx.stroke();
    const bw=cW/n;
    datasets.forEach((ds,si)=>{
      const col=PAL[si%PAL.length];
      if(type==='bar'){ const dw=bw*0.7/datasets.length,off=(si-(datasets.length-1)/2)*dw; ds.data.forEach((v,i)=>{ const x=pad.left+bw*(i+.5)+off-dw/2,y=vy(v),h=vy(minV)-y; ctx.fillStyle=col; ctx.beginPath(); ctx.roundRect(x,y,dw,h,3); ctx.fill(); }); }
      else{
        ctx.beginPath(); ds.data.forEach((v,i)=>{ const x=pad.left+bw*(i+.5),y=vy(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
        if(type==='area'){ const last=ds.data.length-1; ctx.lineTo(pad.left+bw*(last+.5),vy(minV)); ctx.lineTo(pad.left+bw*.5,vy(minV)); ctx.closePath(); ctx.fillStyle=col+'2a'; ctx.fill(); ctx.beginPath(); ds.data.forEach((v,i)=>{ const x=pad.left+bw*(i+.5),y=vy(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); }
        ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.stroke();
        ds.data.forEach((v,i)=>{ const x=pad.left+bw*(i+.5),y=vy(v); ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke(); });
      }
    });
    ctx.fillStyle='#64748b'; ctx.font='10.5px system-ui'; ctx.textAlign='center';
    labels.forEach((l,i)=>ctx.fillText(String(l).substring(0,12),pad.left+bw*(i+.5),pad.top+cH+16));
    if(datasets.length>1){ let lx=pad.left; datasets.forEach((ds,i)=>{ ctx.fillStyle=PAL[i%PAL.length]; ctx.fillRect(lx,H-14,10,10); ctx.fillStyle='#334155'; ctx.font='11px system-ui'; ctx.textAlign='left'; ctx.fillText(ds.label,lx+14,H-5); lx+=ctx.measureText(ds.label).width+30; }); }
  }
  shell.querySelector('#chartPreviewBtn').addEventListener('click',drawChart);
  shell.querySelector('#chartInsertBtn').addEventListener('click',()=>{
    drawChart();
    snapshot(); setRaw(selMaxR()+2,selMinC(),`[Chart: ${shell.querySelector('#chartTitle').value||'Chart'}]`);
    markUnsaved(); renderGrid(); chartPanel.classList.add('hidden');
  });

  /* ---- back ---- */
  shell.querySelector('#sheetBack').addEventListener('click',()=>{ commitEdit(); doSave(); closeFnDropdown(); closeEditor('sheetEditor'); });

  /* ---- cleanup dropdown on shell removal ---- */
  const observer=new MutationObserver(()=>{ if(!document.contains(shell)){ fnDropdown.remove(); observer.disconnect(); } });
  observer.observe(document.body,{childList:true,subtree:true});

  /* ---- initial render ---- */
  renderGrid();
  syncFormulaBar();
  sheetWrap.focus();
}
