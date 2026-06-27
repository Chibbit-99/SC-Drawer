/* =========================================================================
   SLIDES EDITOR  —  Drawer Slides
   Slide list panel + canvas with draggable/resizable text, shape, image,
   and table elements. Supports gradients, themes, templates, animations,
   and richer formatting. Compatible with the shared shell in index.html
   (expects: openSlidesEditor, makeSlide, renderElementStaticGlobal,
   escapeHtml, uid, upsertFile, downloadBlob, closeEditor — all provided
   by index.html's inline script except the ones defined below).
   ========================================================================= */

/* ---------------------------------------------------------------------
   THEMES — each theme supplies a palette + font pairing. Themes only
   set defaults / accents; nothing here overrides explicit per-element
   color or per-slide background choices made by the user.
   --------------------------------------------------------------------- */
const SLIDE_THEMES = {
  classic: {
    label: 'Classic',
    bg: '#FFFFFF',
    text: '#1E2A3A',
    accent: '#3b82f6',
    heading: 'Georgia,serif',
    body: "-apple-system,'Segoe UI',sans-serif",
    swatch: ['#FFFFFF','#3b82f6','#1E2A3A']
  },
  midnight: {
    label: 'Midnight',
    bg: '#0f172a',
    text: '#e2e8f0',
    accent: '#60a5fa',
    heading: "'Iowan Old Style',Georgia,serif",
    body: "-apple-system,'Segoe UI',sans-serif",
    swatch: ['#0f172a','#60a5fa','#e2e8f0']
  },
  sand: {
    label: 'Sand',
    bg: '#F4F1EA',
    text: '#3a2e22',
    accent: '#c2682b',
    heading: "'Georgia',serif",
    body: "'Iowan Old Style',Georgia,serif",
    swatch: ['#F4F1EA','#c2682b','#3a2e22']
  },
  mint: {
    label: 'Mint',
    bg: '#ecfdf5',
    text: '#064e3b',
    accent: '#10b981',
    heading: "Georgia,serif",
    body: "-apple-system,'Segoe UI',sans-serif",
    swatch: ['#ecfdf5','#10b981','#064e3b']
  },
  grape: {
    label: 'Grape',
    bg: '#2e1065',
    text: '#f3e8ff',
    accent: '#c084fc',
    heading: "Georgia,serif",
    body: "-apple-system,'Segoe UI',sans-serif",
    swatch: ['#2e1065','#c084fc','#f3e8ff']
  },
  paper: {
    label: 'Newsprint',
    bg: '#fafaf9',
    text: '#18181b',
    accent: '#b91c1c',
    heading: "'Times New Roman',Georgia,serif",
    body: "'Times New Roman',Georgia,serif",
    swatch: ['#fafaf9','#b91c1c','#18181b']
  }
};

/* ---------------------------------------------------------------------
   SHAPES — extended catalogue. 'rect' and 'ellipse' render as plain
   divs (cheap, crisp at any aspect ratio); the rest render as inline
   SVG so arbitrary polygons / lines work and still scale cleanly.
   --------------------------------------------------------------------- */
const SHAPE_DEFS = {
  rect:      { label: 'Rectangle' },
  rounded:   { label: 'Rounded rect' },
  ellipse:   { label: 'Ellipse' },
  triangle:  { label: 'Triangle',  points: '50,2 98,98 2,98' },
  diamond:   { label: 'Diamond',   points: '50,2 98,50 50,98 2,50' },
  pentagon:  { label: 'Pentagon',  points: '50,2 98,38 80,98 20,98 2,38' },
  hexagon:   { label: 'Hexagon',   points: '25,2 75,2 98,50 75,98 25,98 2,50' },
  star:      { label: 'Star',      points: '50,2 61,37 98,37 68,59 79,96 50,74 21,96 32,59 2,37 39,37' },
  arrowRight:{ label: 'Arrow',     points: '0,30 60,30 60,10 100,50 60,90 60,70 0,70' },
  line:      { label: 'Line' }
};

/* ---------------------------------------------------------------------
   ANIMATIONS — entrance animations applied per element, played back
   in Present mode only (the editor canvas always shows elements
   settled in their final state).
   --------------------------------------------------------------------- */
const ANIMATIONS = {
  none:      { label: 'None' },
  fadeIn:    { label: 'Fade in' },
  slideUp:   { label: 'Slide up' },
  slideLeft: { label: 'Slide from left' },
  slideRight:{ label: 'Slide from right' },
  zoomIn:    { label: 'Zoom in' },
  pop:       { label: 'Pop' }
};

const SLIDE_TRANSITIONS = {
  none: { label: 'None' },
  fade: { label: 'Fade' },
  slide:{ label: 'Slide' }
};

/* ---------------------------------------------------------------------
   TEMPLATES — starter layouts. Each returns a fresh slide object with
   pre-placed elements so the user isn't starting from a blank canvas.
   --------------------------------------------------------------------- */
function tEl(kind, x, y, w, h, extra){
  return Object.assign({ id: uid(), kind, x, y, w, h, z: Date.now()+Math.random() }, extra||{});
}
const SLIDE_TEMPLATES = {
  blank: {
    label: 'Blank',
    build(theme){ return { elements: [] }; }
  },
  title: {
    label: 'Title slide',
    build(theme){
      return { elements: [
        tEl('text', 80, 200, 800, 100, { text:'Presentation title', fontSize:54, bold:true, align:'center', color:theme.text, fontFamily:theme.heading }),
        tEl('text', 80, 310, 800, 50, { text:'A subtitle goes here', fontSize:22, align:'center', color:theme.accent, fontFamily:theme.body })
      ]};
    }
  },
  titleBody: {
    label: 'Title + body',
    build(theme){
      return { elements: [
        tEl('text', 60, 50, 840, 70, { text:'Slide title', fontSize:36, bold:true, color:theme.text, fontFamily:theme.heading }),
        tEl('text', 60, 150, 840, 340, { text:'• First point\n• Second point\n• Third point', fontSize:22, color:theme.text, fontFamily:theme.body, lineHeight:1.6 })
      ]};
    }
  },
  twoColumn: {
    label: 'Two column',
    build(theme){
      return { elements: [
        tEl('text', 60, 40, 840, 60, { text:'Slide title', fontSize:32, bold:true, color:theme.text, fontFamily:theme.heading }),
        tEl('text', 60, 140, 400, 350, { text:'Left column text', fontSize:20, color:theme.text, fontFamily:theme.body }),
        tEl('text', 500, 140, 400, 350, { text:'Right column text', fontSize:20, color:theme.text, fontFamily:theme.body })
      ]};
    }
  },
  imageCaption: {
    label: 'Image + caption',
    build(theme){
      return { elements: [
        tEl('shape', 230, 60, 500, 320, { shape:'rect', fill:'#cbd5e1' }),
        tEl('text', 230, 60, 500, 320, { text:'Click to add image (use the Image tool)', fontSize:16, align:'center', color:'#64748b', fontFamily:theme.body }),
        tEl('text', 60, 400, 840, 60, { text:'Caption goes here', fontSize:18, align:'center', italic:true, color:theme.text, fontFamily:theme.body })
      ]};
    }
  },
  quote: {
    label: 'Quote',
    build(theme){
      return { elements: [
        tEl('text', 120, 160, 720, 160, { text:'"A well-placed quote can anchor a whole slide."', fontSize:34, italic:true, align:'center', color:theme.text, fontFamily:theme.heading }),
        tEl('text', 120, 340, 720, 40, { text:'— Attribution', fontSize:18, align:'center', color:theme.accent, fontFamily:theme.body })
      ]};
    }
  },
  table: {
    label: 'Table',
    build(theme){
      return { elements: [
        tEl('text', 60, 40, 840, 60, { text:'Slide title', fontSize:32, bold:true, color:theme.text, fontFamily:theme.heading }),
        tEl('table', 90, 140, 780, 320, makeDefaultTable(3,3, theme))
      ]};
    }
  },
  bigStat: {
    label: 'Big stat',
    build(theme){
      return { elements: [
        tEl('text', 80, 160, 800, 140, { text:'87%', fontSize:120, bold:true, align:'center', color:theme.accent, fontFamily:theme.heading }),
        tEl('text', 80, 320, 800, 60, { text:'of teams ship faster with a clear template', fontSize:24, align:'center', color:theme.text, fontFamily:theme.body })
      ]};
    }
  }
};

function makeDefaultTable(rows, cols, theme){
  const cells = [];
  for(let r=0;r<rows;r++){
    const row = [];
    for(let c=0;c<cols;c++) row.push(r===0 ? `Header ${c+1}` : `Cell ${r},${c+1}`);
    cells.push(row);
  }
  return {
    rows, cols, cells,
    headerRow: true,
    fontSize: 16,
    fontFamily: (theme&&theme.body) || "-apple-system,sans-serif",
    color: (theme&&theme.text) || '#1E2A3A',
    borderColor: '#cbd5e1',
    headerFill: (theme&&theme.accent) || '#3b82f6',
    headerColor: '#ffffff',
    cellFill: '#ffffff'
  };
}

/* ---------------------------------------------------------------------
   makeSlide — called by index.html when creating a brand-new
   presentation file. Kept as a global so index.html (unedited) still
   works; returns a slide using the classic theme's plain white bg.
   --------------------------------------------------------------------- */
function makeSlide(){
  return {
    id: uid(),
    bg: '#FFFFFF',
    bgType: 'solid',        // 'solid' | 'gradient'
    bgGradient: null,       // { type:'linear'|'radial', angle, stops:[{color,pos}] }
    elements: [],
    transition: 'fade',
    notes: ''
  };
}

/* ---------------------------------------------------------------------
   FILL HELPERS — produce a CSS background value from a fill spec.
   A fill spec is either a plain hex string (solid) or an object:
   { type:'linear', angle:90, stops:[{color:'#fff',pos:0},{color:'#000',pos:100}] }
   { type:'radial', stops:[...] }
   --------------------------------------------------------------------- */
function isGradientFill(fill){
  return fill && typeof fill === 'object' && (fill.type === 'linear' || fill.type === 'radial');
}
function cssFromFill(fill, fallback){
  if(!fill) return fallback || '#FFFFFF';
  if(typeof fill === 'string') return fill;
  if(isGradientFill(fill)){
    const stops = (fill.stops||[]).map(s => `${s.color} ${s.pos}%`).join(', ');
    if(fill.type === 'radial') return `radial-gradient(circle, ${stops})`;
    return `linear-gradient(${fill.angle||90}deg, ${stops})`;
  }
  return fallback || '#FFFFFF';
}
function defaultGradient(c1, c2){
  return { type:'linear', angle:135, stops:[ {color:c1||'#3b82f6', pos:0}, {color:c2||'#8b5cf6', pos:100} ] };
}
const GRADIENT_PRESETS = [
  { name:'Ocean',   fill: { type:'linear', angle:135, stops:[{color:'#2563eb',pos:0},{color:'#0ea5e9',pos:100}] } },
  { name:'Sunset',  fill: { type:'linear', angle:135, stops:[{color:'#f59e0b',pos:0},{color:'#ef4444',pos:100}] } },
  { name:'Grape',   fill: { type:'linear', angle:135, stops:[{color:'#7c3aed',pos:0},{color:'#c026d3',pos:100} ] } },
  { name:'Forest',  fill: { type:'linear', angle:135, stops:[{color:'#065f46',pos:0},{color:'#22c55e',pos:100}] } },
  { name:'Slate',   fill: { type:'linear', angle:135, stops:[{color:'#0f172a',pos:0},{color:'#334155',pos:100}] } },
  { name:'Peach',   fill: { type:'radial', stops:[{color:'#fed7aa',pos:0},{color:'#fb7185',pos:100}] } }
];

/* ---------------------------------------------------------------------
   ANIMATION CSS — keyframes injected once per shell, plus a helper
   that returns the inline style needed to run an entrance animation.
   --------------------------------------------------------------------- */
const ANIM_KEYFRAMES = `
@keyframes dsAnimFadeIn{ from{opacity:0;} to{opacity:1;} }
@keyframes dsAnimSlideUp{ from{opacity:0; transform:translateY(40px);} to{opacity:1; transform:translateY(0);} }
@keyframes dsAnimSlideLeft{ from{opacity:0; transform:translateX(-60px);} to{opacity:1; transform:translateX(0);} }
@keyframes dsAnimSlideRight{ from{opacity:0; transform:translateX(60px);} to{opacity:1; transform:translateX(0);} }
@keyframes dsAnimZoomIn{ from{opacity:0; transform:scale(0.7);} to{opacity:1; transform:scale(1);} }
@keyframes dsAnimPop{ 0%{opacity:0; transform:scale(0.4);} 70%{opacity:1; transform:scale(1.08);} 100%{opacity:1; transform:scale(1);} }
`;
function animationStyle(anim, delayMs){
  if(!anim || anim === 'none') return '';
  const map = { fadeIn:'dsAnimFadeIn', slideUp:'dsAnimSlideUp', slideLeft:'dsAnimSlideLeft', slideRight:'dsAnimSlideRight', zoomIn:'dsAnimZoomIn', pop:'dsAnimPop' };
  const name = map[anim];
  if(!name) return '';
  return `animation:${name} 0.55s cubic-bezier(.2,.7,.3,1) both; animation-delay:${delayMs||0}ms;`;
}

/* ---------------------------------------------------------------------
   MIGRATION — upgrade older saved files (plain bg string, no bgType,
   no transition/notes, table-less elements) to the current shape
   in-place, without breaking anything already on disk.
   --------------------------------------------------------------------- */
function migrateSlideContent(content){
  if(!content || !content.slides) content = { slides:[makeSlide()], current:0 };
  content.theme = content.theme || 'classic';
  content.slides.forEach(slide=>{
    if(slide.bgType === undefined) slide.bgType = 'solid';
    if(slide.bgGradient === undefined) slide.bgGradient = null;
    if(slide.transition === undefined) slide.transition = 'fade';
    if(slide.notes === undefined) slide.notes = '';
    (slide.elements||[]).forEach(el=>{
      if(el.opacity === undefined) el.opacity = 1;
      if(el.rotation === undefined) el.rotation = 0;
      if(el.anim === undefined) el.anim = 'none';
      if(el.kind === 'shape' && el.borderColor === undefined) el.borderColor = 'transparent';
      if(el.kind === 'shape' && el.borderWidth === undefined) el.borderWidth = 0;
      if(el.kind === 'text' && el.lineHeight === undefined) el.lineHeight = 1.3;
      if(el.kind === 'text' && el.letterSpacing === undefined) el.letterSpacing = 0;
      if(el.kind === 'text' && el.shadow === undefined) el.shadow = false;
    });
  });
  return content;
}

/* =========================================================================
   MAIN EDITOR
   ========================================================================= */
function openSlidesEditor(file){
  let shell = document.getElementById('slidesEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');

  file.content = migrateSlideContent(file.content);

  shell.innerHTML = `
    <style>
      ${ANIM_KEYFRAMES}
      .slides-main{ flex:1; display:flex; overflow:hidden; min-height:0; }
      .slide-panel{ width:188px; background:var(--bg-card); border-right:1px solid var(--border); overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
      .slide-thumb{ position:relative; border:2px solid var(--border); border-radius:8px; background:var(--bg-app); aspect-ratio:16/9; cursor:pointer; overflow:hidden; transition:var(--transition); }
      .slide-thumb:hover{ border-color:var(--primary); }
      .slide-thumb.active{ border-color:var(--primary); box-shadow:0 0 0 2px var(--sheet-tint); }
      .slide-thumb .thumb-num{ position:absolute; bottom:4px; left:4px; font-size:10px; color:var(--text-muted); background:rgba(248,250,252,0.9); padding:2px 4px; border-radius:3px; z-index:2; }
      .slide-thumb .thumb-del{ position:absolute; top:4px; right:4px; width:20px;height:20px;border:none;background:rgba(248,250,252,0.9);border-radius:4px;font-size:11px;display:none;align-items:center;justify-content:center;color:var(--danger);transition:var(--transition); z-index:2; }
      .slide-thumb .thumb-dup{ position:absolute; top:4px; right:26px; width:20px;height:20px;border:none;background:rgba(248,250,252,0.9);border-radius:4px;font-size:11px;display:none;align-items:center;justify-content:center;color:var(--text-muted);transition:var(--transition); z-index:2; }
      .slide-thumb:hover .thumb-del, .slide-thumb:hover .thumb-dup{ display:flex; }
      .thumb-render{ position:absolute; inset:0; transform-origin:top left; pointer-events:none; }
      .add-slide-row{ display:flex; gap:6px; }
      .add-slide-btn{ flex:1; border:1.5px dashed var(--border); background:transparent; border-radius:8px; padding:10px; font-size:12px; color:var(--text-muted); transition:var(--transition); }
      .add-slide-btn:hover{ border-color:var(--primary); color:var(--primary); background:var(--sheet-tint); }

      .slide-canvas-wrap{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--bg-app); overflow:auto; padding:32px; position:relative; min-width:0; }
      .slide-canvas{
        width:960px; height:540px; position:relative; box-shadow:var(--shadow-lg);
        flex-shrink:0; overflow:hidden; transform-origin:center center; border-radius:4px;
      }
      .slide-el{ position:absolute; cursor:move; user-select:none; }
      .slide-el.selected{ outline:2px solid var(--primary); outline-offset:1px; }
      .slide-el .el-content{ width:100%; height:100%; overflow:hidden; }
      .slide-el[data-kind="text"] .el-content{ padding:4px; outline:none; display:flex; }
      .slide-el[data-kind="shape"] .el-content{ width:100%; height:100%; }
      .resize-handle{
        position:absolute; width:10px; height:10px; background:var(--primary); border:2px solid var(--bg-card);
        border-radius:50%; z-index:5; box-shadow:0 1px 3px rgba(0,0,0,0.15);
      }
      .rh-se{ right:-5px; bottom:-5px; cursor:nwse-resize; }
      .rh-nw{ left:-5px; top:-5px; cursor:nwse-resize; }
      .rh-ne{ right:-5px; top:-5px; cursor:nesw-resize; }
      .rh-sw{ left:-5px; bottom:-5px; cursor:nesw-resize; }
      .rotate-handle{ position:absolute; top:-26px; left:50%; transform:translateX(-50%); width:16px; height:16px; border-radius:50%; background:var(--bg-card); border:2px solid var(--primary); cursor:grab; z-index:5; }
      .rotate-handle::after{ content:''; position:absolute; left:50%; top:100%; width:1px; height:10px; background:var(--primary); }

      .slide-side-panel{ width:0; overflow:hidden; transition:width 0.2s ease; background:var(--bg-card); border-left:1px solid var(--border); flex-shrink:0; }
      .slide-side-panel.open{ width:260px; overflow-y:auto; }
      .ssp-inner{ padding:16px; display:flex; flex-direction:column; gap:16px; }
      .ssp-group label{ font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:.05em; display:block; margin-bottom:8px; }
      .ssp-row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .ssp-hint{ font-size:11px; color:var(--text-muted); margin:0; line-height:1.4; }
      .seg{ display:flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
      .seg button{ flex:1; border:none; background:var(--bg-card); color:var(--text-muted); padding:7px 10px; font-size:11.5px; font-weight:600; border-right:1px solid var(--border); transition:var(--transition); }
      .seg button:last-child{ border-right:none; }
      .seg button[aria-pressed="true"]{ background:var(--primary); color:#fff; }
      .gradient-stop-row{ display:flex; gap:6px; align-items:center; }
      .gradient-preset{ width:30px;height:30px;border-radius:6px;border:1.5px solid var(--border); cursor:pointer; transition:var(--transition); }
      .gradient-preset:hover{ transform:scale(1.08); border-color:var(--text-main); }
      .swatch-row{ display:flex; gap:6px; flex-wrap:wrap; }
      .swatch-btn{ width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);cursor:pointer; transition:var(--transition); }
      .swatch-btn:hover{ transform:scale(1.1); }
      .range-row{ display:flex; align-items:center; gap:8px; }
      .range-row input[type=range]{ flex:1; }
      .range-row .rval{ font-size:11px; color:var(--text-muted); width:34px; text-align:right; flex-shrink:0; }

      .theme-grid{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .theme-card{ border:1.5px solid var(--border); border-radius:8px; padding:8px; cursor:pointer; transition:var(--transition); text-align:left; }
      .theme-card:hover{ border-color:var(--primary); }
      .theme-card.active{ border-color:var(--primary); box-shadow:0 0 0 2px var(--sheet-tint); }
      .theme-swatches{ display:flex; gap:4px; margin-bottom:6px; }
      .theme-swatches span{ width:16px;height:16px;border-radius:4px;display:inline-block;border:1px solid rgba(0,0,0,0.08); }
      .theme-card .tname{ font-size:11.5px; font-weight:600; color:var(--text-main); }

      .template-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:4px 0; }
      .template-card{ border:1.5px solid var(--border); border-radius:8px; padding:10px 8px; cursor:pointer; transition:var(--transition); text-align:center; background:var(--bg-card); }
      .template-card:hover{ border-color:var(--primary); background:var(--sheet-tint); transform:translateY(-1px); }
      .template-card .tglyph{ font-size:20px; display:block; margin-bottom:6px; }
      .template-card .tlabel{ font-size:11.5px; font-weight:600; color:var(--text-main); }

      .picker-overlay{ position:fixed; inset:0; background:rgba(15,23,42,0.4); display:flex; align-items:center; justify-content:center; z-index:120; backdrop-filter:blur(4px); }
      .picker-modal{ background:var(--bg-card); border-radius:var(--radius); padding:28px; width:560px; max-width:92vw; box-shadow:var(--shadow-lg); max-height:80vh; overflow-y:auto; }
      .picker-modal h2{ margin:0 0 4px; font-size:18px; }
      .picker-modal p{ margin:0 0 18px; color:var(--text-muted); font-size:13px; }
      .picker-close-row{ display:flex; justify-content:flex-end; margin-top:18px; }

      .table-el{ border-collapse:collapse; width:100%; height:100%; table-layout:fixed; }
      .table-el td{ border:1px solid #cbd5e1; padding:6px 8px; overflow:hidden; outline:none; word-break:break-word; }
      .table-el tr.is-header td{ font-weight:700; }
      .table-toolbar{ display:flex; gap:6px; }
      .table-toolbar button{ flex:1; }

      .present-overlay{ position:fixed; inset:0; background:#0f172a; z-index:200; display:flex; align-items:center; justify-content:center; }
      .present-slide{ width:100%; height:100%; max-width:100vw; position:relative; }
      .present-nav{ position:absolute; bottom:20px; right:20px; display:flex; gap:8px; }
      .present-nav button{ background:rgba(255,255,255,0.12); color:#fff; border:1px solid rgba(255,255,255,0.2); width:40px;height:40px;border-radius:8px;font-size:16px;transition:var(--transition); }
      .present-nav button:hover{ background:rgba(255,255,255,0.2);border-color:rgba(255,255,255,0.4); }
      .present-counter{ position:absolute; bottom:20px; left:20px; color:rgba(255,255,255,0.7); font-size:13px; font-family:system-ui,sans-serif; }
      .present-exit{ position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.12); color:#fff; border:1px solid rgba(255,255,255,0.2); width:36px;height:36px;border-radius:8px;font-size:16px;transition:var(--transition);cursor:pointer; }
      .present-exit:hover{ background:rgba(255,255,255,0.2); }
      .present-notes{ position:absolute; top:20px; left:20px; max-width:40%; color:rgba(255,255,255,0.55); font-size:12px; font-family:system-ui,sans-serif; background:rgba(255,255,255,0.06); padding:8px 10px; border-radius:8px; line-height:1.4; }

      .notes-bar{ border-top:1px solid var(--border); background:var(--bg-card); padding:8px 16px; display:flex; gap:10px; align-items:flex-start; flex-shrink:0; }
      .notes-bar label{ font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; padding-top:6px; flex-shrink:0; }
      .notes-bar textarea{ flex:1; border:1px solid var(--border); border-radius:8px; padding:6px 10px; font-size:12.5px; resize:vertical; min-height:34px; font-family:inherit; color:var(--text-main); background:var(--bg-app); }
    </style>
    <div class="editor-topbar">
      <button class="back-btn" id="slidesBack" aria-label="Back to drawer">&#8592;</button>
      <input type="text" class="title-input" id="slidesTitle" value="${escapeHtml(file.name)}" aria-label="Presentation title">
      <button class="tbtn wide" id="themeBtn" title="Theme">&#127912; Theme</button>
      <button class="tbtn wide" id="templateBtn" title="Layouts">&#128203; Layout</button>
      <div class="save-indicator"><span class="sdot" id="slidesSaveDot"></span><span id="slidesSaveText">Saved</span></div>
    </div>
    <div class="editor-toolbar" role="toolbar" aria-label="Slide tools">
      <button class="tbtn wide" id="addTextBtn">&#65291; Text</button>
      <button class="tbtn wide" id="addShapeBtn">&#9645; Shape</button>
      <button class="tbtn wide" id="addTableBtn">&#9638; Table</button>
      <button class="tbtn wide" id="addImageBtn">&#128247; Image</button>
      <span class="sep"></span>
      <button class="tbtn wide" id="bgBtn">&#127912; Background</button>
      <span class="sep"></span>
      <button class="tbtn" id="dupElBtn" title="Duplicate" disabled>&#10697;</button>
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
    <div class="notes-bar">
      <label>Speaker notes</label>
      <textarea id="notesInput" placeholder="Notes for this slide (visible to you in Present mode, not to your audience)…"></textarea>
    </div>
  `;

  const titleInput = shell.querySelector('#slidesTitle');
  const saveDot = shell.querySelector('#slidesSaveDot');
  const saveText = shell.querySelector('#slidesSaveText');
  const slidePanel = shell.querySelector('#slidePanel');
  const slideCanvas = shell.querySelector('#slideCanvas');
  const sidePanel = shell.querySelector('#sidePanel');
  const sidePanelInner = shell.querySelector('#sidePanelInner');
  const notesInput = shell.querySelector('#notesInput');

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
  function getTheme(){ return SLIDE_THEMES[file.content.theme] || SLIDE_THEMES.classic; }

  function slideBackgroundCss(slide){
    if(slide.bgType === 'gradient' && slide.bgGradient) return cssFromFill(slide.bgGradient);
    return slide.bg || '#FFFFFF';
  }

  /* ---------------- Slide panel (thumbnails) ---------------- */
  function renderSlidePanel(){
    slidePanel.innerHTML = '';
    file.content.slides.forEach((slide, i)=>{
      const thumb = document.createElement('div');
      thumb.className = 'slide-thumb' + (i === current ? ' active' : '');
      thumb.innerHTML = `
        <div class="thumb-render" style="background:${slideBackgroundCss(slide)}; width:960px; height:540px; transform:scale(${178/960});"></div>
        <span class="thumb-num">${i+1}</span>
        <button class="thumb-dup" data-idx="${i}" aria-label="Duplicate slide ${i+1}">&#10697;</button>
        <button class="thumb-del" data-idx="${i}" aria-label="Delete slide ${i+1}">&#10005;</button>
      `;
      const render = thumb.querySelector('.thumb-render');
      slide.elements.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach(el=>{
        render.appendChild(renderElementStatic(el));
      });
      thumb.addEventListener('click', (e)=>{
        if(e.target.closest('.thumb-del') || e.target.closest('.thumb-dup')) return;
        current = i; selectedElId = null;
        renderAll();
      });
      slidePanel.appendChild(thumb);
    });
    const addRow = document.createElement('div');
    addRow.className = 'add-slide-row';
    addRow.innerHTML = `<button class="add-slide-btn" id="addSlidePlain">+ Slide</button><button class="add-slide-btn" id="addSlideFromTemplate">From layout…</button>`;
    slidePanel.appendChild(addRow);
    addRow.querySelector('#addSlidePlain').addEventListener('click', ()=>{
      const s = makeSlide();
      s.bg = getCurrentSlide() ? getCurrentSlide().bg : '#FFFFFF';
      s.bgType = getCurrentSlide() ? getCurrentSlide().bgType : 'solid';
      s.bgGradient = getCurrentSlide() ? getCurrentSlide().bgGradient : null;
      file.content.slides.push(s);
      current = file.content.slides.length - 1;
      markUnsaved();
      renderAll();
    });
    addRow.querySelector('#addSlideFromTemplate').addEventListener('click', openTemplatePicker);

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
    slidePanel.querySelectorAll('.thumb-dup').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx,10);
        const clone = JSON.parse(JSON.stringify(file.content.slides[idx]));
        clone.id = uid();
        clone.elements.forEach(el=> el.id = uid());
        file.content.slides.splice(idx+1, 0, clone);
        current = idx+1;
        markUnsaved();
        renderAll();
      });
    });
  }

  /* ---------------- Static element render (thumbnails / export / present) ---------------- */
  function renderElementStatic(el){
    const div = buildElementVisual(el, false);
    div.style.position='absolute';
    div.style.left=el.x+'px'; div.style.top=el.y+'px';
    div.style.width=el.w+'px'; div.style.height=el.h+'px';
    return div;
  }

  /* Builds the inner "look" of an element (used by both the editable
     canvas wrapper and static renders). When editable=true, text
     becomes contenteditable and tables get editable cells. */
  function buildElementVisual(el, editable){
    const wrap = document.createElement('div');
    wrap.style.width = '100%';
    wrap.style.height = '100%';
    wrap.style.opacity = (el.opacity !== undefined ? el.opacity : 1);
    wrap.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : '';
    wrap.style.transformOrigin = 'center center';

    if(el.kind === 'text'){
      const d = document.createElement('div');
      d.contentEditable = !!editable;
      d.spellcheck = false;
      d.style.width = '100%';
      d.style.height = '100%';
      d.style.fontSize = (el.fontSize||24)+'px';
      d.style.color = el.color || '#1E2A3A';
      d.style.fontWeight = el.bold ? '700':'400';
      d.style.fontStyle = el.italic ? 'italic':'normal';
      d.style.textDecoration = el.underline ? 'underline':'none';
      d.style.textAlign = el.align || 'left';
      d.style.fontFamily = el.fontFamily || 'Georgia,serif';
      d.style.lineHeight = el.lineHeight || 1.3;
      d.style.letterSpacing = (el.letterSpacing||0)+'px';
      d.style.display = 'flex';
      d.style.alignItems = el.valign === 'top' ? 'flex-start' : (el.valign === 'bottom' ? 'flex-end' : 'center');
      d.style.justifyContent = el.align==='center'?'center':(el.align==='right'?'flex-end':'flex-start');
      d.style.whiteSpace = 'pre-wrap';
      d.style.overflow = 'hidden';
      d.style.outline = 'none';
      if(el.shadow) d.style.textShadow = '0 2px 8px rgba(0,0,0,0.35)';
      d.textContent = el.text || '';
      wrap.appendChild(d);
      wrap._textNode = d;
    } else if(el.kind === 'shape'){
      wrap.appendChild(buildShapeVisual(el));
    } else if(el.kind === 'image'){
      const img = document.createElement('img');
      img.src = el.src;
      img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = el.fit || 'cover';
      img.style.borderRadius = (el.radius||0)+'px';
      img.draggable = false;
      wrap.appendChild(img);
    } else if(el.kind === 'table'){
      wrap.appendChild(buildTableVisual(el, editable));
    }
    return wrap;
  }

  function buildShapeVisual(el){
    const def = SHAPE_DEFS[el.shape] || SHAPE_DEFS.rect;
    const fillCss = cssFromFill(el.fill, '#f59e0b');
    if(el.shape === 'rect' || el.shape === 'rounded' || el.shape === 'ellipse'){
      const d = document.createElement('div');
      d.style.width = '100%'; d.style.height = '100%';
      d.style.background = fillCss;
      d.style.border = el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor||'#000'}` : 'none';
      if(el.shape === 'ellipse') d.style.borderRadius = '50%';
      else if(el.shape === 'rounded') d.style.borderRadius = '16px';
      else d.style.borderRadius = '4px';
      return d;
    }
    if(el.shape === 'line'){
      const d = document.createElement('div');
      d.style.width='100%'; d.style.height='100%'; d.style.display='flex'; d.style.alignItems='center';
      const ln = document.createElement('div');
      ln.style.width='100%'; ln.style.height=Math.max(2,el.borderWidth||4)+'px';
      ln.style.background = typeof fillCss === 'string' && fillCss.indexOf('gradient')===-1 ? fillCss : (el.borderColor||'#1E2A3A');
      d.appendChild(ln);
      return d;
    }
    // polygon shapes via SVG so gradients + strokes scale correctly
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('preserveAspectRatio','none');
    svg.style.width='100%'; svg.style.height='100%';
    const gradId = 'grad_' + Math.random().toString(36).slice(2,9);
    let fillRef = fillCss;
    if(isGradientFill(el.fill)){
      const defs = document.createElementNS(ns,'defs');
      const isRadial = el.fill.type === 'radial';
      const grad = document.createElementNS(ns, isRadial ? 'radialGradient' : 'linearGradient');
      grad.setAttribute('id', gradId);
      if(!isRadial){
        const rad = ((el.fill.angle||90) * Math.PI/180);
        grad.setAttribute('x1','0%'); grad.setAttribute('y1','0%');
        grad.setAttribute('x2', (Math.cos(rad)*100).toFixed(0)+'%');
        grad.setAttribute('y2', (Math.sin(rad)*100).toFixed(0)+'%');
      }
      (el.fill.stops||[]).forEach(s=>{
        const stop = document.createElementNS(ns,'stop');
        stop.setAttribute('offset', s.pos+'%');
        stop.setAttribute('stop-color', s.color);
        grad.appendChild(stop);
      });
      defs.appendChild(grad);
      svg.appendChild(defs);
      fillRef = `url(#${gradId})`;
    }
    const poly = document.createElementNS(ns,'polygon');
    poly.setAttribute('points', def.points);
    poly.setAttribute('fill', fillRef);
    if(el.borderWidth){ poly.setAttribute('stroke', el.borderColor||'#000'); poly.setAttribute('stroke-width', el.borderWidth); }
    svg.appendChild(poly);
    return svg;
  }

  function buildTableVisual(el, editable){
    const t = el.table;
    const table = document.createElement('table');
    table.className = 'table-el';
    table.style.fontSize = (t.fontSize||16)+'px';
    table.style.fontFamily = t.fontFamily || "-apple-system,sans-serif";
    table.style.color = t.color || '#1E2A3A';
    for(let r=0;r<t.rows;r++){
      const tr = document.createElement('tr');
      const isHeader = t.headerRow && r===0;
      if(isHeader) tr.className = 'is-header';
      for(let c=0;c<t.cols;c++){
        const td = document.createElement('td');
        td.style.borderColor = t.borderColor || '#cbd5e1';
        td.style.background = isHeader ? (t.headerFill||'#3b82f6') : (t.cellFill||'#ffffff');
        td.style.color = isHeader ? (t.headerColor||'#ffffff') : (t.color||'#1E2A3A');
        td.textContent = (t.cells[r] && t.cells[r][c] !== undefined) ? t.cells[r][c] : '';
        td.contentEditable = !!editable;
        if(editable){
          td.addEventListener('mousedown', ev=> ev.stopPropagation());
          td.addEventListener('input', ()=>{
            t.cells[r][c] = td.textContent;
            markUnsaved();
          });
        }
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }

  /* ---------------- Canvas (editable) ---------------- */
  function renderCanvas(){
    slideCanvas.innerHTML = '';
    const slide = getCurrentSlide();
    slideCanvas.style.background = slideBackgroundCss(slide);
    notesInput.value = slide.notes || '';

    slide.elements.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach(el=>{
      const wrap = document.createElement('div');
      wrap.className = 'slide-el' + (el.id===selectedElId ? ' selected':'');
      wrap.dataset.kind = el.kind;
      wrap.dataset.id = el.id;
      wrap.style.left = el.x+'px'; wrap.style.top = el.y+'px';
      wrap.style.width = el.w+'px'; wrap.style.height = el.h+'px';
      wrap.style.zIndex = Math.floor(el.z || 1);

      const content = document.createElement('div');
      content.className = 'el-content';
      const visual = buildElementVisual(el, true);
      content.appendChild(visual);

      if(el.kind === 'text' && visual._textNode){
        const tn = visual._textNode;
        tn.addEventListener('input', ()=>{ el.text = tn.textContent; markUnsaved(); });
        tn.addEventListener('mousedown', e=> e.stopPropagation());
        tn.addEventListener('dblclick', e=>{ e.stopPropagation(); tn.focus(); });
      }
      wrap.appendChild(content);

      if(el.id === selectedElId){
        ['nw','ne','sw','se'].forEach(pos=>{
          const handle = document.createElement('div');
          handle.className = 'resize-handle rh-'+pos;
          handle.addEventListener('mousedown', (e)=> startResize(e, el, pos));
          wrap.appendChild(handle);
        });
        if(el.kind !== 'table'){
          const rot = document.createElement('div');
          rot.className = 'rotate-handle';
          rot.title = 'Drag to rotate';
          rot.addEventListener('mousedown', (e)=> startRotate(e, el));
          wrap.appendChild(rot);
        }
      }

      wrap.addEventListener('mousedown', (e)=>{
        if(e.target.closest('.resize-handle') || e.target.closest('.rotate-handle')) return;
        if(selectedElId !== el.id){
          selectedElId = el.id;
          renderAll();
        }
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

  notesInput.addEventListener('input', ()=>{
    getCurrentSlide().notes = notesInput.value;
    markUnsaved();
  });

  function updateActionButtons(){
    const has = !!selectedElId;
    shell.querySelector('#deleteElBtn').disabled = !has;
    shell.querySelector('#frontBtn').disabled = !has;
    shell.querySelector('#backBtn').disabled = !has;
    shell.querySelector('#dupElBtn').disabled = !has;
  }

  /* ---------------- Side panel: per-element formatting ---------------- */
  function fillPickerHtml(idPrefix, fill){
    const solid = !isGradientFill(fill);
    const gradient = isGradientFill(fill) ? fill : defaultGradient();
    return `
      <div class="seg" id="${idPrefix}Mode">
        <button data-mode="solid" aria-pressed="${solid}">Solid</button>
        <button data-mode="gradient" aria-pressed="${!solid}">Gradient</button>
      </div>
      <div id="${idPrefix}SolidRow" style="${solid?'':'display:none'}; margin-top:8px;">
        <input type="color" id="${idPrefix}SolidColor" value="${solid ? (typeof fill==='string'?fill:'#f59e0b') : '#f59e0b'}">
      </div>
      <div id="${idPrefix}GradRow" style="${solid?'display:none':''}; margin-top:8px; display:flex; flex-direction:column; gap:8px;">
        <div class="gradient-stop-row">
          <input type="color" id="${idPrefix}Stop1" value="${gradient.stops[0].color}">
          <input type="color" id="${idPrefix}Stop2" value="${gradient.stops[1].color}">
          <select class="tsel" id="${idPrefix}GradType">
            <option value="linear" ${gradient.type==='linear'?'selected':''}>Linear</option>
            <option value="radial" ${gradient.type==='radial'?'selected':''}>Radial</option>
          </select>
        </div>
        <div class="range-row" id="${idPrefix}AngleRow" style="${gradient.type==='radial'?'display:none':''}">
          <span class="ssp-hint" style="width:40px;">Angle</span>
          <input type="range" id="${idPrefix}Angle" min="0" max="360" value="${gradient.angle||135}">
          <span class="rval" id="${idPrefix}AngleVal">${gradient.angle||135}°</span>
        </div>
        <div class="swatch-row">
          ${GRADIENT_PRESETS.map((p,i)=>`<button type="button" class="gradient-preset" data-idx="${i}" title="${p.name}" style="background:${cssFromFill(p.fill)}"></button>`).join('')}
        </div>
      </div>
    `;
  }
  function wireFillPicker(idPrefix, getFill, setFill){
    const root = sidePanelInner;
    const seg = root.querySelector('#'+idPrefix+'Mode');
    const solidRow = root.querySelector('#'+idPrefix+'SolidRow');
    const gradRow = root.querySelector('#'+idPrefix+'GradRow');
    seg.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));
        btn.setAttribute('aria-pressed','true');
        if(btn.dataset.mode === 'solid'){
          solidRow.style.display=''; gradRow.style.display='none';
          setFill(root.querySelector('#'+idPrefix+'SolidColor').value);
        } else {
          solidRow.style.display='none'; gradRow.style.display='flex';
          setFill(currentGradientFromControls());
        }
        markUnsaved(); renderCanvas(); renderSlidePanel();
      });
    });
    function currentGradientFromControls(){
      return {
        type: root.querySelector('#'+idPrefix+'GradType').value,
        angle: parseInt(root.querySelector('#'+idPrefix+'Angle').value,10),
        stops: [
          { color: root.querySelector('#'+idPrefix+'Stop1').value, pos:0 },
          { color: root.querySelector('#'+idPrefix+'Stop2').value, pos:100 }
        ]
      };
    }
    root.querySelector('#'+idPrefix+'SolidColor').addEventListener('input', e=>{
      setFill(e.target.value); markUnsaved(); renderCanvas(); renderSlidePanel();
    });
    root.querySelector('#'+idPrefix+'Stop1').addEventListener('input', ()=>{ setFill(currentGradientFromControls()); markUnsaved(); renderCanvas(); renderSlidePanel(); });
    root.querySelector('#'+idPrefix+'Stop2').addEventListener('input', ()=>{ setFill(currentGradientFromControls()); markUnsaved(); renderCanvas(); renderSlidePanel(); });
    root.querySelector('#'+idPrefix+'GradType').addEventListener('change', (e)=>{
      root.querySelector('#'+idPrefix+'AngleRow').style.display = e.target.value==='radial' ? 'none' : 'flex';
      setFill(currentGradientFromControls()); markUnsaved(); renderCanvas(); renderSlidePanel();
    });
    root.querySelector('#'+idPrefix+'Angle').addEventListener('input', (e)=>{
      root.querySelector('#'+idPrefix+'AngleVal').textContent = e.target.value+'°';
      setFill(currentGradientFromControls()); markUnsaved(); renderCanvas(); renderSlidePanel();
    });
    root.querySelectorAll('.gradient-preset').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const preset = GRADIENT_PRESETS[parseInt(btn.dataset.idx,10)];
        setFill(JSON.parse(JSON.stringify(preset.fill)));
        seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.mode==='gradient'?'true':'false'));
        solidRow.style.display='none'; gradRow.style.display='flex';
        root.querySelector('#'+idPrefix+'Stop1').value = preset.fill.stops[0].color;
        root.querySelector('#'+idPrefix+'Stop2').value = preset.fill.stops[1].color;
        root.querySelector('#'+idPrefix+'GradType').value = preset.fill.type;
        markUnsaved(); renderCanvas(); renderSlidePanel();
      });
    });
  }

  function renderSidePanel(){
    if(!selectedElId){ sidePanel.classList.remove('open'); sidePanelInner.innerHTML=''; return; }
    const slide = getCurrentSlide();
    const el = slide.elements.find(e=>e.id===selectedElId);
    if(!el){ sidePanel.classList.remove('open'); return; }
    sidePanel.classList.add('open');

    const commonOpacityRotation = `
      <div class="ssp-group">
        <label>Opacity</label>
        <div class="range-row">
          <input type="range" id="elOpacity" min="0" max="100" value="${Math.round((el.opacity!==undefined?el.opacity:1)*100)}">
          <span class="rval" id="elOpacityVal">${Math.round((el.opacity!==undefined?el.opacity:1)*100)}%</span>
        </div>
      </div>
      <div class="ssp-group">
        <label>Animation</label>
        <select class="tsel" id="elAnim" style="width:100%">
          ${Object.keys(ANIMATIONS).map(k=>`<option value="${k}" ${ (el.anim||'none')===k?'selected':''}>${ANIMATIONS[k].label}</option>`).join('')}
        </select>
      </div>
    `;

    if(el.kind === 'text'){
      sidePanelInner.innerHTML = `
        <div class="ssp-group">
          <label>Font</label>
          <select class="tsel" id="elFontFamily" style="width:100%">
            <option value="Georgia,serif">Georgia</option>
            <option value="'Iowan Old Style',serif">Serif</option>
            <option value="-apple-system,sans-serif">Sans</option>
            <option value="'Courier New',monospace">Monospace</option>
            <option value="'Times New Roman',serif">Times</option>
          </select>
        </div>
        <div class="ssp-group">
          <label>Size</label>
          <div class="range-row"><input type="range" id="elFontSize" min="10" max="140" value="${el.fontSize||24}"><span class="rval" id="elFontSizeVal">${el.fontSize||24}</span></div>
        </div>
        <div class="ssp-group">
          <label>Style</label>
          <div class="ssp-row">
            <button class="tbtn" id="elBold" aria-pressed="${!!el.bold}"><b>B</b></button>
            <button class="tbtn" id="elItalic" aria-pressed="${!!el.italic}"><i>I</i></button>
            <button class="tbtn" id="elUnderline" aria-pressed="${!!el.underline}"><u>U</u></button>
            <button class="tbtn" id="elShadow" aria-pressed="${!!el.shadow}" title="Text shadow">S</button>
          </div>
        </div>
        <div class="ssp-group">
          <label>Align</label>
          <div class="ssp-row">
            <button class="tbtn" id="elAlignL" aria-pressed="${(el.align||'left')==='left'}">&#8676;</button>
            <button class="tbtn" id="elAlignC" aria-pressed="${el.align==='center'}">&#8596;</button>
            <button class="tbtn" id="elAlignR" aria-pressed="${el.align==='right'}">&#8677;</button>
            <span class="sep"></span>
            <button class="tbtn" id="elValignT" aria-pressed="${el.valign==='top'}" title="Align top">&#8869;</button>
            <button class="tbtn" id="elValignM" aria-pressed="${(!el.valign||el.valign==='middle')}" title="Align middle">&#8596;</button>
            <button class="tbtn" id="elValignB" aria-pressed="${el.valign==='bottom'}" title="Align bottom">&#8868;</button>
          </div>
        </div>
        <div class="ssp-group">
          <label>Line height</label>
          <div class="range-row"><input type="range" id="elLineHeight" min="08" max="25" value="${Math.round((el.lineHeight||1.3)*10)}"><span class="rval" id="elLineHeightVal">${(el.lineHeight||1.3).toFixed(1)}</span></div>
        </div>
        <div class="ssp-group">
          <label>Letter spacing</label>
          <div class="range-row"><input type="range" id="elLetterSpacing" min="-3" max="15" value="${el.letterSpacing||0}"><span class="rval" id="elLetterSpacingVal">${el.letterSpacing||0}px</span></div>
        </div>
        <div class="ssp-group">
          <label>Color</label>
          <input type="color" id="elColor" value="${el.color||'#1E2A3A'}">
        </div>
        ${commonOpacityRotation}
      `;
      const $ = sel => sidePanelInner.querySelector(sel);
      $('#elFontFamily').value = el.fontFamily || 'Georgia,serif';
      $('#elFontFamily').addEventListener('change', e=>{ el.fontFamily=e.target.value; markUnsaved(); renderCanvas(); });
      $('#elFontSize').addEventListener('input', e=>{ el.fontSize=parseInt(e.target.value,10); $('#elFontSizeVal').textContent=el.fontSize; markUnsaved(); renderCanvas(); });
      $('#elBold').addEventListener('click', ()=>{ el.bold=!el.bold; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elItalic').addEventListener('click', ()=>{ el.italic=!el.italic; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elUnderline').addEventListener('click', ()=>{ el.underline=!el.underline; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elShadow').addEventListener('click', ()=>{ el.shadow=!el.shadow; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elAlignL').addEventListener('click', ()=>{ el.align='left'; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elAlignC').addEventListener('click', ()=>{ el.align='center'; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elAlignR').addEventListener('click', ()=>{ el.align='right'; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elValignT').addEventListener('click', ()=>{ el.valign='top'; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elValignM').addEventListener('click', ()=>{ el.valign='middle'; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elValignB').addEventListener('click', ()=>{ el.valign='bottom'; markUnsaved(); renderCanvas(); renderSidePanel(); });
      $('#elLineHeight').addEventListener('input', e=>{ el.lineHeight=parseInt(e.target.value,10)/10; $('#elLineHeightVal').textContent=el.lineHeight.toFixed(1); markUnsaved(); renderCanvas(); });
      $('#elLetterSpacing').addEventListener('input', e=>{ el.letterSpacing=parseInt(e.target.value,10); $('#elLetterSpacingVal').textContent=el.letterSpacing+'px'; markUnsaved(); renderCanvas(); });
      $('#elColor').addEventListener('input', e=>{ el.color=e.target.value; markUnsaved(); renderCanvas(); });
      $('#elOpacity').addEventListener('input', e=>{ el.opacity=parseInt(e.target.value,10)/100; $('#elOpacityVal').textContent=e.target.value+'%'; markUnsaved(); renderCanvas(); });
      $('#elAnim').addEventListener('change', e=>{ el.anim=e.target.value; markUnsaved(); });

    } else if(el.kind === 'shape'){
      sidePanelInner.innerHTML = `
        <div class="ssp-group">
          <label>Shape</label>
          <select class="tsel" id="elShapeType" style="width:100%">
            ${Object.keys(SHAPE_DEFS).map(k=>`<option value="${k}" ${el.shape===k?'selected':''}>${SHAPE_DEFS[k].label}</option>`).join('')}
          </select>
        </div>
        <div class="ssp-group">
          <label>Fill</label>
          ${fillPickerHtml('elFill', el.fill)}
        </div>
        <div class="ssp-group">
          <label>Border</label>
          <div class="ssp-row">
            <input type="color" id="elBorderColor" value="${el.borderColor && el.borderColor!=='transparent' ? el.borderColor : '#000000'}">
            <input type="range" id="elBorderWidth" min="0" max="20" value="${el.borderWidth||0}" style="flex:1">
            <span class="rval" id="elBorderWidthVal">${el.borderWidth||0}px</span>
          </div>
        </div>
        ${commonOpacityRotation}
      `;
      const $ = sel => sidePanelInner.querySelector(sel);
      $('#elShapeType').addEventListener('change', e=>{ el.shape=e.target.value; markUnsaved(); renderCanvas(); renderSlidePanel(); });
      $('#elBorderColor').addEventListener('input', e=>{ el.borderColor=e.target.value; markUnsaved(); renderCanvas(); });
      $('#elBorderWidth').addEventListener('input', e=>{ el.borderWidth=parseInt(e.target.value,10); $('#elBorderWidthVal').textContent=el.borderWidth+'px'; markUnsaved(); renderCanvas(); });
      $('#elOpacity').addEventListener('input', e=>{ el.opacity=parseInt(e.target.value,10)/100; $('#elOpacityVal').textContent=e.target.value+'%'; markUnsaved(); renderCanvas(); });
      $('#elAnim').addEventListener('change', e=>{ el.anim=e.target.value; markUnsaved(); });
      wireFillPicker('elFill', ()=>el.fill, (v)=>{ el.fill = v; });

    } else if(el.kind === 'table'){
      const t = el.table;
      sidePanelInner.innerHTML = `
        <div class="ssp-group">
          <label>Rows / columns</label>
          <div class="table-toolbar">
            <button class="tbtn wide" id="tblAddRow">+ Row</button>
            <button class="tbtn wide" id="tblAddCol">+ Col</button>
          </div>
          <div class="table-toolbar" style="margin-top:6px;">
            <button class="tbtn wide" id="tblDelRow">− Row</button>
            <button class="tbtn wide" id="tblDelCol">− Col</button>
          </div>
        </div>
        <div class="ssp-group">
          <label>Header row</label>
          <button class="tbtn wide" id="tblHeaderToggle" aria-pressed="${!!t.headerRow}">${t.headerRow?'On':'Off'}</button>
        </div>
        <div class="ssp-group">
          <label>Font size</label>
          <div class="range-row"><input type="range" id="tblFontSize" min="10" max="36" value="${t.fontSize||16}"><span class="rval" id="tblFontSizeVal">${t.fontSize||16}</span></div>
        </div>
        <div class="ssp-group">
          <label>Header fill</label>
          <input type="color" id="tblHeaderFill" value="${t.headerFill||'#3b82f6'}">
        </div>
        <div class="ssp-group">
          <label>Cell fill</label>
          <input type="color" id="tblCellFill" value="${t.cellFill||'#ffffff'}">
        </div>
        <div class="ssp-group">
          <label>Text color</label>
          <input type="color" id="tblTextColor" value="${t.color||'#1E2A3A'}">
        </div>
        <p class="ssp-hint">Double-click any cell on the canvas to edit its text directly.</p>
        ${commonOpacityRotation}
      `;
      const $ = sel => sidePanelInner.querySelector(sel);
      $('#tblAddRow').addEventListener('click', ()=>{ const row=[]; for(let c=0;c<t.cols;c++) row.push(''); t.cells.push(row); t.rows++; markUnsaved(); renderCanvas(); });
      $('#tblAddCol').addEventListener('click', ()=>{ t.cells.forEach(row=>row.push('')); t.cols++; markUnsaved(); renderCanvas(); });
      $('#tblDelRow').addEventListener('click', ()=>{ if(t.rows>1){ t.cells.pop(); t.rows--; markUnsaved(); renderCanvas(); } });
      $('#tblDelCol').addEventListener('click', ()=>{ if(t.cols>1){ t.cells.forEach(row=>row.pop()); t.cols--; markUnsaved(); renderCanvas(); } });
      $('#tblHeaderToggle').addEventListener('click', ()=>{ t.headerRow=!t.headerRow; $('#tblHeaderToggle').textContent=t.headerRow?'On':'Off'; $('#tblHeaderToggle').setAttribute('aria-pressed', t.headerRow); markUnsaved(); renderCanvas(); });
      $('#tblFontSize').addEventListener('input', e=>{ t.fontSize=parseInt(e.target.value,10); $('#tblFontSizeVal').textContent=t.fontSize; markUnsaved(); renderCanvas(); });
      $('#tblHeaderFill').addEventListener('input', e=>{ t.headerFill=e.target.value; markUnsaved(); renderCanvas(); });
      $('#tblCellFill').addEventListener('input', e=>{ t.cellFill=e.target.value; markUnsaved(); renderCanvas(); });
      $('#tblTextColor').addEventListener('input', e=>{ t.color=e.target.value; markUnsaved(); renderCanvas(); });
      $('#elOpacity').addEventListener('input', e=>{ el.opacity=parseInt(e.target.value,10)/100; $('#elOpacityVal').textContent=e.target.value+'%'; markUnsaved(); renderCanvas(); });
      $('#elAnim').addEventListener('change', e=>{ el.anim=e.target.value; markUnsaved(); });

    } else {
      sidePanelInner.innerHTML = `
        <div class="ssp-group"><label>Image</label><p class="ssp-hint">Drag corners to resize, drag to move.</p></div>
        <div class="ssp-group">
          <label>Fit</label>
          <div class="seg" id="elFit">
            <button data-fit="cover" aria-pressed="${(el.fit||'cover')==='cover'}">Cover</button>
            <button data-fit="contain" aria-pressed="${el.fit==='contain'}">Contain</button>
          </div>
        </div>
        <div class="ssp-group">
          <label>Corner radius</label>
          <div class="range-row"><input type="range" id="elRadius" min="0" max="80" value="${el.radius||0}"><span class="rval" id="elRadiusVal">${el.radius||0}</span></div>
        </div>
        ${commonOpacityRotation}
      `;
      const $ = sel => sidePanelInner.querySelector(sel);
      $('#elFit').querySelectorAll('button').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          el.fit = btn.dataset.fit;
          $('#elFit').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed', b===btn));
          markUnsaved(); renderCanvas();
        });
      });
      $('#elRadius').addEventListener('input', e=>{ el.radius=parseInt(e.target.value,10); $('#elRadiusVal').textContent=el.radius; markUnsaved(); renderCanvas(); });
      $('#elOpacity').addEventListener('input', e=>{ el.opacity=parseInt(e.target.value,10)/100; $('#elOpacityVal').textContent=e.target.value+'%'; markUnsaved(); renderCanvas(); });
      $('#elAnim').addEventListener('change', e=>{ el.anim=e.target.value; markUnsaved(); });
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
    let moved = false;
    function onMove(ev){
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if(Math.abs(dx)>2 || Math.abs(dy)>2) moved = true;
      el.x = Math.max(-2000, origX + dx);
      el.y = Math.max(-2000, origY + dy);
      const wrap = slideCanvas.querySelector(`.slide-el[data-id="${el.id}"]`);
      if(wrap){ wrap.style.left = el.x+'px'; wrap.style.top = el.y+'px'; }
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if(moved){ markUnsaved(); renderSlidePanel(); }
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

  function startRotate(e, el){
    e.stopPropagation(); e.preventDefault();
    const wrap = slideCanvas.querySelector(`.slide-el[data-id="${el.id}"]`);
    const rect = wrap.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    function angleFor(ev){
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      return Math.atan2(dy,dx) * 180/Math.PI + 90;
    }
    function onMove(ev){
      let ang = Math.round(angleFor(ev));
      if(ev.shiftKey) ang = Math.round(ang/15)*15;
      el.rotation = ((ang % 360) + 360) % 360;
      // buildElementVisual() always returns a single <div> wrapper as the
      // direct child of .el-content (it carries opacity + transform);
      // update it live during drag instead of re-rendering the whole canvas.
      const visual = wrap.querySelector('.el-content > div');
      if(visual) visual.style.transform = `rotate(${el.rotation}deg)`;
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
    const theme = getTheme();
    const el = { id:uid(), kind:'text', x:300, y:230, w:360, h:80, text:'New text', fontSize:28, color:theme.text, align:'left', fontFamily:theme.body, lineHeight:1.3, letterSpacing:0, opacity:1, rotation:0, anim:'none', z: Date.now() };
    getCurrentSlide().elements.push(el);
    selectedElId = el.id;
    markUnsaved();
    renderAll();
  });
  shell.querySelector('#addShapeBtn').addEventListener('click', ()=>{
    const el = { id:uid(), kind:'shape', shape:'rect', x:380, y:200, w:200, h:140, fill:'#f59e0b', borderColor:'transparent', borderWidth:0, opacity:1, rotation:0, anim:'none', z: Date.now() };
    getCurrentSlide().elements.push(el);
    selectedElId = el.id;
    markUnsaved();
    renderAll();
  });
  shell.querySelector('#addTableBtn').addEventListener('click', ()=>{
    const theme = getTheme();
    const el = { id:uid(), kind:'table', x:180, y:140, w:600, h:260, table: makeDefaultTable(3,3,theme), opacity:1, rotation:0, anim:'none', z: Date.now() };
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
        const el = { id:uid(), kind:'image', x:320, y:150, w:320, h:240, src:ev.target.result, fit:'cover', radius:0, opacity:1, rotation:0, anim:'none', z: Date.now() };
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
  shell.querySelector('#dupElBtn').addEventListener('click', ()=>{
    if(!selectedElId) return;
    const slide = getCurrentSlide();
    const el = slide.elements.find(e=>e.id===selectedElId);
    if(!el) return;
    const clone = JSON.parse(JSON.stringify(el));
    clone.id = uid();
    clone.x = el.x + 24; clone.y = el.y + 24;
    clone.z = Date.now();
    slide.elements.push(clone);
    selectedElId = clone.id;
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

  function delKeyHandler(e){
    const active = document.activeElement;
    if(active && active.isContentEditable) return;
    if(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    if((e.key === 'Delete' || e.key === 'Backspace') && selectedElId){
      const slide = getCurrentSlide();
      slide.elements = slide.elements.filter(el=>el.id!==selectedElId);
      selectedElId = null;
      markUnsaved();
      renderAll();
    } else if((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey) && selectedElId){
      e.preventDefault();
      shell.querySelector('#dupElBtn').click();
    }
  }
  document.addEventListener('keydown', delKeyHandler);
  shell._cleanupDelKey = () => document.removeEventListener('keydown', delKeyHandler);

  // ---- Background picker (per-slide solid or gradient) ----
  function openBackgroundPicker(){
    const slide = getCurrentSlide();
    const overlay = document.createElement('div');
    overlay.className = 'picker-overlay';
    overlay.innerHTML = `
      <div class="picker-modal" role="dialog" aria-modal="true">
        <h2>Slide background</h2>
        <p>Applies to the current slide only.</p>
        <div id="bgFillHost"></div>
        <div class="ssp-group" style="margin-top:14px;">
          <label>Apply to all slides</label>
          <button class="btn" id="bgApplyAll">Apply this background to every slide</button>
        </div>
        <div class="picker-close-row"><button class="btn btn-primary" id="bgPickerDone">Done</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const host = overlay.querySelector('#bgFillHost');
    const currentFill = slide.bgType === 'gradient' && slide.bgGradient ? slide.bgGradient : (slide.bg || '#FFFFFF');
    host.innerHTML = fillPickerHtml('pickBg', currentFill);

    function setSlideFill(v){
      if(typeof v === 'string'){ slide.bg = v; slide.bgType = 'solid'; slide.bgGradient = null; }
      else { slide.bgType = 'gradient'; slide.bgGradient = v; }
    }
    // reuse wireFillPicker but targeted at this overlay's DOM via a scoped lookup
    wireFillPickerScoped(host, 'pickBg', ()=> (slide.bgType==='gradient'?slide.bgGradient:slide.bg), setSlideFill, ()=>{ renderCanvas(); renderSlidePanel(); markUnsaved(); });

    overlay.querySelector('#bgApplyAll').addEventListener('click', ()=>{
      file.content.slides.forEach(s=>{ s.bg = slide.bg; s.bgType = slide.bgType; s.bgGradient = slide.bgGradient ? JSON.parse(JSON.stringify(slide.bgGradient)) : null; });
      markUnsaved(); renderAll();
    });
    overlay.querySelector('#bgPickerDone').addEventListener('click', ()=> overlay.remove());
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
  }

  // A variant of wireFillPicker that operates within an arbitrary root
  // element (used by the background picker, which lives outside sidePanelInner).
  function wireFillPickerScoped(root, idPrefix, getFill, setFill, onChange){
    const seg = root.querySelector('#'+idPrefix+'Mode');
    const solidRow = root.querySelector('#'+idPrefix+'SolidRow');
    const gradRow = root.querySelector('#'+idPrefix+'GradRow');
    function currentGradientFromControls(){
      return {
        type: root.querySelector('#'+idPrefix+'GradType').value,
        angle: parseInt(root.querySelector('#'+idPrefix+'Angle').value,10),
        stops: [
          { color: root.querySelector('#'+idPrefix+'Stop1').value, pos:0 },
          { color: root.querySelector('#'+idPrefix+'Stop2').value, pos:100 }
        ]
      };
    }
    seg.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));
        btn.setAttribute('aria-pressed','true');
        if(btn.dataset.mode === 'solid'){
          solidRow.style.display=''; gradRow.style.display='none';
          setFill(root.querySelector('#'+idPrefix+'SolidColor').value);
        } else {
          solidRow.style.display='none'; gradRow.style.display='flex';
          setFill(currentGradientFromControls());
        }
        onChange();
      });
    });
    root.querySelector('#'+idPrefix+'SolidColor').addEventListener('input', e=>{ setFill(e.target.value); onChange(); });
    root.querySelector('#'+idPrefix+'Stop1').addEventListener('input', ()=>{ setFill(currentGradientFromControls()); onChange(); });
    root.querySelector('#'+idPrefix+'Stop2').addEventListener('input', ()=>{ setFill(currentGradientFromControls()); onChange(); });
    root.querySelector('#'+idPrefix+'GradType').addEventListener('change', (e)=>{
      root.querySelector('#'+idPrefix+'AngleRow').style.display = e.target.value==='radial' ? 'none' : 'flex';
      setFill(currentGradientFromControls()); onChange();
    });
    root.querySelector('#'+idPrefix+'Angle').addEventListener('input', (e)=>{
      root.querySelector('#'+idPrefix+'AngleVal').textContent = e.target.value+'°';
      setFill(currentGradientFromControls()); onChange();
    });
    root.querySelectorAll('.gradient-preset').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const preset = GRADIENT_PRESETS[parseInt(btn.dataset.idx,10)];
        setFill(JSON.parse(JSON.stringify(preset.fill)));
        seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.mode==='gradient'?'true':'false'));
        solidRow.style.display='none'; gradRow.style.display='flex';
        root.querySelector('#'+idPrefix+'Stop1').value = preset.fill.stops[0].color;
        root.querySelector('#'+idPrefix+'Stop2').value = preset.fill.stops[1].color;
        root.querySelector('#'+idPrefix+'GradType').value = preset.fill.type;
        onChange();
      });
    });
  }

  // ---- Theme picker ----
  function openThemePicker(){
    const overlay = document.createElement('div');
    overlay.className = 'picker-overlay';
    overlay.innerHTML = `
      <div class="picker-modal" role="dialog" aria-modal="true">
        <h2>Choose a theme</h2>
        <p>Sets the default colors and fonts new text and slides will use. Won't change elements you've already styled.</p>
        <div class="theme-grid" id="themeGrid"></div>
        <div class="picker-close-row"><button class="btn" id="themePickerClose">Close</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const grid = overlay.querySelector('#themeGrid');
    Object.keys(SLIDE_THEMES).forEach(key=>{
      const t = SLIDE_THEMES[key];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card' + (file.content.theme === key ? ' active' : '');
      card.innerHTML = `<div class="theme-swatches">${t.swatch.map(c=>`<span style="background:${c}"></span>`).join('')}</div><div class="tname">${t.label}</div>`;
      card.addEventListener('click', ()=>{
        file.content.theme = key;
        markUnsaved();
        grid.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('active'));
        card.classList.add('active');
      });
      grid.appendChild(card);
    });
    overlay.querySelector('#themePickerClose').addEventListener('click', ()=> overlay.remove());
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
  }

  // ---- Template / layout picker ----
  const TEMPLATE_GLYPHS = { blank:'&#9723;', title:'&#127902;', titleBody:'&#128203;', twoColumn:'&#9636;&#9636;', imageCaption:'&#128247;', quote:'&#10077;', table:'&#9638;', bigStat:'&#128200;' };
  function openTemplatePicker(){
    const overlay = document.createElement('div');
    overlay.className = 'picker-overlay';
    overlay.innerHTML = `
      <div class="picker-modal" role="dialog" aria-modal="true">
        <h2>Choose a layout</h2>
        <p>Adds a new slide using this starter layout, styled with your current theme.</p>
        <div class="template-grid" id="templateGrid"></div>
        <div class="picker-close-row"><button class="btn" id="templatePickerClose">Cancel</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const grid = overlay.querySelector('#templateGrid');
    Object.keys(SLIDE_TEMPLATES).forEach(key=>{
      const tpl = SLIDE_TEMPLATES[key];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-card';
      card.innerHTML = `<span class="tglyph">${TEMPLATE_GLYPHS[key]||'&#9723;'}</span><span class="tlabel">${tpl.label}</span>`;
      card.addEventListener('click', ()=>{
        const theme = getTheme();
        const built = tpl.build(theme);
        const s = makeSlide();
        s.bg = theme.bg;
        s.elements = built.elements;
        file.content.slides.push(s);
        current = file.content.slides.length - 1;
        selectedElId = null;
        markUnsaved();
        renderAll();
        overlay.remove();
      });
      grid.appendChild(card);
    });
    overlay.querySelector('#templatePickerClose').addEventListener('click', ()=> overlay.remove());
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
  }

  shell.querySelector('#bgBtn').addEventListener('click', openBackgroundPicker);
  shell.querySelector('#themeBtn').addEventListener('click', openThemePicker);
  shell.querySelector('#templateBtn').addEventListener('click', openTemplatePicker);

  // ---- Present mode ----
  shell.querySelector('#presentBtn').addEventListener('click', ()=> startPresent(file, current));

  // ---- Export (self-contained HTML, includes animations + transitions) ----
  shell.querySelector('#slidesExportBtn').addEventListener('click', ()=>{
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(file.name)}</title>
    <style>
      body{margin:0;font-family:sans-serif;background:#222;}
      .s{width:960px;height:540px;position:relative;margin:20px auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);overflow:hidden;}
      table.exp-table{border-collapse:collapse;width:100%;height:100%;table-layout:fixed;}
      table.exp-table td{border:1px solid #cbd5e1;padding:6px 8px;overflow:hidden;}
      ${ANIM_KEYFRAMES}
    </style>
    </head><body>`;
    file.content.slides.forEach(slide=>{
      html += `<div class="s" style="background:${slideBackgroundCss(slide)}">`;
      slide.elements.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach((el, idx)=>{
        const animCss = animationStyle(el.anim, idx*90);
        const baseStyle = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;opacity:${el.opacity!==undefined?el.opacity:1};${el.rotation?`transform:rotate(${el.rotation}deg);`:''}${animCss}`;
        if(el.kind==='text'){
          html += `<div style="${baseStyle}font-size:${el.fontSize||24}px;color:${el.color||'#000'};font-weight:${el.bold?'700':'400'};font-style:${el.italic?'italic':'normal'};text-decoration:${el.underline?'underline':'none'};text-align:${el.align||'left'};font-family:${el.fontFamily||'Georgia,serif'};line-height:${el.lineHeight||1.3};letter-spacing:${el.letterSpacing||0}px;display:flex;align-items:${el.valign==='top'?'flex-start':el.valign==='bottom'?'flex-end':'center'};justify-content:${el.align==='center'?'center':el.align==='right'?'flex-end':'flex-start'};white-space:pre-wrap;${el.shadow?'text-shadow:0 2px 8px rgba(0,0,0,0.35);':''}">${escapeHtml(el.text||'')}</div>`;
        } else if(el.kind==='shape'){
          const def = SHAPE_DEFS[el.shape]||SHAPE_DEFS.rect;
          if(['rect','rounded','ellipse','line'].includes(el.shape)){
            html += `<div style="${baseStyle}background:${cssFromFill(el.fill)};border-radius:${el.shape==='ellipse'?'50%':el.shape==='rounded'?'16px':'4px'};border:${el.borderWidth?el.borderWidth+'px solid '+(el.borderColor||'#000'):'none'};"></div>`;
          } else {
            const gradAttr = isGradientFill(el.fill);
            let fillAttr = typeof el.fill === 'string' ? el.fill : '#f59e0b';
            let defsSvg = '';
            if(gradAttr){
              const gid = 'g'+Math.random().toString(36).slice(2,8);
              const isRadial = el.fill.type==='radial';
              if(isRadial){
                defsSvg = `<radialGradient id="${gid}">${el.fill.stops.map(s=>`<stop offset="${s.pos}%" stop-color="${s.color}"/>`).join('')}</radialGradient>`;
              } else {
                const rad=(el.fill.angle||90)*Math.PI/180;
                defsSvg = `<linearGradient id="${gid}" x1="0%" y1="0%" x2="${(Math.cos(rad)*100).toFixed(0)}%" y2="${(Math.sin(rad)*100).toFixed(0)}%">${el.fill.stops.map(s=>`<stop offset="${s.pos}%" stop-color="${s.color}"/>`).join('')}</linearGradient>`;
              }
              fillAttr = `url(#${gid})`;
            }
            html += `<div style="${baseStyle}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;"><defs>${defsSvg}</defs><polygon points="${def.points}" fill="${fillAttr}" ${el.borderWidth?`stroke="${el.borderColor||'#000'}" stroke-width="${el.borderWidth}"`:''}/></svg></div>`;
          }
        } else if(el.kind==='image'){
          html += `<div style="${baseStyle}"><img src="${el.src}" style="width:100%;height:100%;object-fit:${el.fit||'cover'};border-radius:${el.radius||0}px;"></div>`;
        } else if(el.kind==='table'){
          const t = el.table;
          let tbl = `<table class="exp-table" style="font-size:${t.fontSize||16}px;font-family:${t.fontFamily||'sans-serif'};color:${t.color||'#1E2A3A'};">`;
          for(let r=0;r<t.rows;r++){
            tbl += '<tr>';
            for(let c=0;c<t.cols;c++){
              const isHeader = t.headerRow && r===0;
              tbl += `<td style="background:${isHeader?(t.headerFill||'#3b82f6'):(t.cellFill||'#fff')};color:${isHeader?(t.headerColor||'#fff'):(t.color||'#1E2A3A')};font-weight:${isHeader?'700':'400'};">${escapeHtml((t.cells[r]&&t.cells[r][c])||'')}</td>`;
            }
            tbl += '</tr>';
          }
          tbl += '</table>';
          html += `<div style="${baseStyle}">${tbl}</div>`;
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

/* =========================================================================
   PRESENT MODE — full-screen playback with slide transitions, per-element
   entrance animations, arrow-key / click navigation, and a speaker-notes
   readout in the corner (visible only to the presenter's own screen).
   ========================================================================= */
function startPresent(file, startIdx){
  let idx = startIdx;
  const overlay = document.createElement('div');
  overlay.className = 'present-overlay';
  const styleTag = document.createElement('style');
  styleTag.textContent = ANIM_KEYFRAMES + `
    .present-slide.fade-enter{ animation: dsAnimFadeIn 0.35s ease both; }
    .present-slide.slide-enter{ animation: dsAnimSlideRight 0.35s ease both; }
  `;
  overlay.appendChild(styleTag);
  document.body.appendChild(overlay);

  function render(){
    const slide = file.content.slides[idx];
    const bgCss = (slide.bgType === 'gradient' && slide.bgGradient) ? cssFromFill(slide.bgGradient) : (slide.bg || '#FFFFFF');
    const transitionClass = slide.transition === 'slide' ? 'slide-enter' : (slide.transition === 'fade' ? 'fade-enter' : '');

    const wrap = document.createElement('div');
    wrap.style.position = 'absolute'; wrap.style.inset = '0';
    wrap.innerHTML = `
      <div class="present-slide ${transitionClass}" style="background:${bgCss}" id="presentSlideArea"></div>
      ${slide.notes ? `<div class="present-notes">${escapeHtml(slide.notes)}</div>` : ''}
      <div class="present-counter">${idx+1} / ${file.content.slides.length}</div>
      <div class="present-nav">
        <button id="presentPrev" aria-label="Previous slide">&#8592;</button>
        <button id="presentNext" aria-label="Next slide">&#8594;</button>
      </div>
      <button class="present-exit" id="presentExit" aria-label="Exit presentation">&#10005;</button>
    `;
    overlay.innerHTML = '';
    overlay.appendChild(styleTag);
    overlay.appendChild(wrap);

    const area = overlay.querySelector('#presentSlideArea');
    const scale = Math.min(window.innerWidth/960, window.innerHeight/540);
    area.style.width = '960px';
    area.style.height = '540px';
    area.style.position = 'absolute';
    area.style.left = '50%';
    area.style.top = '50%';
    area.style.transform = `translate(-50%,-50%) scale(${scale})`;
    slide.elements.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach((el, i)=>{
      const node = renderElementStaticGlobal(el);
      const inner = node.firstChild;
      if(inner && el.anim && el.anim !== 'none'){
        inner.style.cssText += animationStyle(el.anim, i*120);
      }
      area.appendChild(node);
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

/* renderElementStaticGlobal — used by Present mode. Wraps the same
   buildElementVisual() used by the editor canvas (non-editable) so
   gradients, rotation, opacity, tables, and shapes all match exactly
   what the user designed. Kept as a top-level function (not nested
   inside openSlidesEditor) since index.html's pattern expects a
   standalone global of this name. */
function renderElementStaticGlobal(el){
  const outer = document.createElement('div');
  outer.style.position = 'absolute';
  outer.style.left = el.x+'px'; outer.style.top = el.y+'px';
  outer.style.width = el.w+'px'; outer.style.height = el.h+'px';
  const visual = buildElementVisualGlobal(el);
  outer.appendChild(visual);
  return outer;
}

/* Standalone (non-editable) version of buildElementVisual, usable
   outside the openSlidesEditor closure (present mode, thumbnails
   that are rendered before the editor for a file has been opened, etc). */
function buildElementVisualGlobal(el){
  const wrap = document.createElement('div');
  wrap.style.width = '100%';
  wrap.style.height = '100%';
  wrap.style.opacity = (el.opacity !== undefined ? el.opacity : 1);
  wrap.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : '';
  wrap.style.transformOrigin = 'center center';

  if(el.kind === 'text'){
    const d = document.createElement('div');
    d.style.width = '100%'; d.style.height = '100%';
    d.style.fontSize = (el.fontSize||24)+'px';
    d.style.color = el.color || '#1E2A3A';
    d.style.fontWeight = el.bold ? '700':'400';
    d.style.fontStyle = el.italic ? 'italic':'normal';
    d.style.textDecoration = el.underline ? 'underline':'none';
    d.style.textAlign = el.align || 'left';
    d.style.fontFamily = el.fontFamily || 'Georgia,serif';
    d.style.lineHeight = el.lineHeight || 1.3;
    d.style.letterSpacing = (el.letterSpacing||0)+'px';
    d.style.display = 'flex';
    d.style.alignItems = el.valign === 'top' ? 'flex-start' : (el.valign === 'bottom' ? 'flex-end' : 'center');
    d.style.justifyContent = el.align==='center'?'center':(el.align==='right'?'flex-end':'flex-start');
    d.style.whiteSpace = 'pre-wrap';
    d.style.overflow = 'hidden';
    if(el.shadow) d.style.textShadow = '0 2px 8px rgba(0,0,0,0.35)';
    d.textContent = el.text || '';
    wrap.appendChild(d);
  } else if(el.kind === 'shape'){
    wrap.appendChild(buildShapeVisualGlobal(el));
  } else if(el.kind === 'image'){
    const img = document.createElement('img');
    img.src = el.src;
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = el.fit || 'cover';
    img.style.borderRadius = (el.radius||0)+'px';
    wrap.appendChild(img);
  } else if(el.kind === 'table'){
    const t = el.table;
    const table = document.createElement('table');
    table.className = 'table-el';
    table.style.fontSize = (t.fontSize||16)+'px';
    table.style.fontFamily = t.fontFamily || "-apple-system,sans-serif";
    table.style.color = t.color || '#1E2A3A';
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%'; table.style.height = '100%';
    table.style.tableLayout = 'fixed';
    for(let r=0;r<t.rows;r++){
      const tr = document.createElement('tr');
      const isHeader = t.headerRow && r===0;
      for(let c=0;c<t.cols;c++){
        const td = document.createElement('td');
        td.style.border = `1px solid ${t.borderColor||'#cbd5e1'}`;
        td.style.padding = '6px 8px';
        td.style.overflow = 'hidden';
        td.style.background = isHeader ? (t.headerFill||'#3b82f6') : (t.cellFill||'#ffffff');
        td.style.color = isHeader ? (t.headerColor||'#ffffff') : (t.color||'#1E2A3A');
        td.style.fontWeight = isHeader ? '700' : '400';
        td.textContent = (t.cells[r] && t.cells[r][c] !== undefined) ? t.cells[r][c] : '';
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    wrap.appendChild(table);
  }
  return wrap;
}

function buildShapeVisualGlobal(el){
  const def = SHAPE_DEFS[el.shape] || SHAPE_DEFS.rect;
  const fillCss = cssFromFill(el.fill, '#f59e0b');
  if(el.shape === 'rect' || el.shape === 'rounded' || el.shape === 'ellipse'){
    const d = document.createElement('div');
    d.style.width = '100%'; d.style.height = '100%';
    d.style.background = fillCss;
    d.style.border = el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor||'#000'}` : 'none';
    if(el.shape === 'ellipse') d.style.borderRadius = '50%';
    else if(el.shape === 'rounded') d.style.borderRadius = '16px';
    else d.style.borderRadius = '4px';
    return d;
  }
  if(el.shape === 'line'){
    const d = document.createElement('div');
    d.style.width='100%'; d.style.height='100%'; d.style.display='flex'; d.style.alignItems='center';
    const ln = document.createElement('div');
    ln.style.width='100%'; ln.style.height=Math.max(2,el.borderWidth||4)+'px';
    ln.style.background = typeof fillCss === 'string' && fillCss.indexOf('gradient')===-1 ? fillCss : (el.borderColor||'#1E2A3A');
    d.appendChild(ln);
    return d;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 100 100');
  svg.setAttribute('preserveAspectRatio','none');
  svg.style.width='100%'; svg.style.height='100%';
  let fillRef = fillCss;
  if(isGradientFill(el.fill)){
    const gradId = 'grad_' + Math.random().toString(36).slice(2,9);
    const defs = document.createElementNS(ns,'defs');
    const isRadial = el.fill.type === 'radial';
    const grad = document.createElementNS(ns, isRadial ? 'radialGradient' : 'linearGradient');
    grad.setAttribute('id', gradId);
    if(!isRadial){
      const rad = ((el.fill.angle||90) * Math.PI/180);
      grad.setAttribute('x1','0%'); grad.setAttribute('y1','0%');
      grad.setAttribute('x2', (Math.cos(rad)*100).toFixed(0)+'%');
      grad.setAttribute('y2', (Math.sin(rad)*100).toFixed(0)+'%');
    }
    (el.fill.stops||[]).forEach(s=>{
      const stop = document.createElementNS(ns,'stop');
      stop.setAttribute('offset', s.pos+'%');
      stop.setAttribute('stop-color', s.color);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);
    fillRef = `url(#${gradId})`;
  }
  const poly = document.createElementNS(ns,'polygon');
  poly.setAttribute('points', def.points);
  poly.setAttribute('fill', fillRef);
  if(el.borderWidth){ poly.setAttribute('stroke', el.borderColor||'#000'); poly.setAttribute('stroke-width', el.borderWidth); }
  svg.appendChild(poly);
  return svg;
}
