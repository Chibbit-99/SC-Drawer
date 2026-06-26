/* =========================================================================
   DOCUMENT EDITOR
   contentEditable rich text editor with formatting toolbar, tabs, math,
   code boxes, and multi-format export (HTML / Markdown / DOCX / PDF print)
   ========================================================================= */

/* ---------------------------------------------------------------------
   Tiny in-browser ZIP writer (store-only, no compression) — enough to
   build a valid .docx (OOXML) package with zero external dependencies.
   ------------------------------------------------------------------- */
const DocxZip = (() => {
  function crc32(buf){
    let c, table = DocxZip._crcTable;
    if(!table){
      table = DocxZip._crcTable = new Uint32Array(256);
      for(let n=0;n<256;n++){
        c = n;
        for(let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c;
      }
    }
    let crc = 0 ^ -1;
    for(let i=0;i<buf.length;i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
  }
  function strToBytes(str){
    return new TextEncoder().encode(str);
  }
  function dosDateTime(){
    const d = new Date();
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    const date = (((d.getFullYear()-1980) & 0x7F) << 9) | (((d.getMonth()+1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time, date };
  }
  class ZipBuilder{
    constructor(){ this.files = []; }
    add(name, data){
      const bytes = typeof data === 'string' ? strToBytes(data) : data;
      this.files.push({ name, bytes });
    }
    build(){
      const { time, date } = dosDateTime();
      const localParts = [];
      const centralParts = [];
      let offset = 0;
      for(const f of this.files){
        const nameBytes = strToBytes(f.name);
        const crc = crc32(f.bytes);
        const size = f.bytes.length;

        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);

        localParts.push(local, f.bytes);

        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        central.set(nameBytes, 46);

        centralParts.push(central);
        offset += local.length + f.bytes.length;
      }

      const centralStart = offset;
      let centralSize = 0;
      for(const c of centralParts) centralSize += c.length;

      const end = new Uint8Array(22);
      const ev = new DataView(end.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true);
      ev.setUint16(6, 0, true);
      ev.setUint16(8, this.files.length, true);
      ev.setUint16(10, this.files.length, true);
      ev.setUint32(12, centralSize, true);
      ev.setUint32(16, centralStart, true);
      ev.setUint16(20, 0, true);

      const totalLen = offset + centralSize + end.length;
      const out = new Uint8Array(totalLen);
      let p = 0;
      for(const part of localParts){ out.set(part, p); p += part.length; }
      for(const part of centralParts){ out.set(part, p); p += part.length; }
      out.set(end, p);
      return out;
    }
  }
  return { ZipBuilder };
})();

/* ---------------------------------------------------------------------
   Lightweight HTML -> OOXML (docx) converter — handles the subset of
   markup this editor actually produces: headings, paragraphs, bold,
   italic, underline, strike, color, lists, blockquote, links, images,
   tables, code blocks, math placeholders, alignment, hr.
   ------------------------------------------------------------------- */
function htmlToDocxXml(rootEl, opts){
  opts = opts || {};
  let imageCounter = 0;
  const images = [];

  function esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function colorHex(c){
    if(!c) return null;
    if(c.startsWith('#')){
      let hex = c.slice(1);
      if(hex.length === 3) hex = hex.split('').map(ch=>ch+ch).join('');
      return hex.toUpperCase();
    }
    const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if(m) return [1,2,3].map(i=>(+m[i]).toString(16).padStart(2,'0')).join('').toUpperCase();
    return null;
  }

  function runProps(style){
    let rpr = '';
    if(style.bold) rpr += '<w:b/>';
    if(style.italic) rpr += '<w:i/>';
    if(style.underline) rpr += '<w:u w:val="single"/>';
    if(style.strike) rpr += '<w:strike/>';
    if(style.color) rpr += `<w:color w:val="${esc(style.color)}"/>`;
    if(style.highlight) rpr += `<w:highlight w:val="${esc(style.highlight)}"/>`;
    if(style.font) rpr += `<w:rFonts w:ascii="${esc(style.font)}" w:hAnsi="${esc(style.font)}"/>`;
    if(style.size) rpr += `<w:sz w:val="${style.size}"/>`;
    if(style.sup) rpr += '<w:vertAlign w:val="superscript"/>';
    if(style.sub) rpr += '<w:vertAlign w:val="subscript"/>';
    return rpr ? `<w:rPr>${rpr}</w:rPr>` : '';
  }

  function textRun(text, style){
    if(text === '') return '';
    const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
    return `<w:r>${runProps(style)}<w:t${space}>${esc(text)}</w:t></w:r>`;
  }

  function walkInline(node, style, out){
    style = Object.assign({}, style);
    if(node.nodeType === Node.TEXT_NODE){
      out.push(textRun(node.nodeValue, style));
      return;
    }
    if(node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if(tag === 'BR'){ out.push('<w:br/>'); return; }
    if(tag === 'B' || tag === 'STRONG') style.bold = true;
    if(tag === 'I' || tag === 'EM') style.italic = true;
    if(tag === 'U') style.underline = true;
    if(tag === 'S' || tag === 'STRIKE') style.strike = true;
    if(tag === 'SUP') style.sup = true;
    if(tag === 'SUB') style.sub = true;
    if(tag === 'CODE') style.font = 'Consolas';
    if(node.classList && node.classList.contains('dr-math')) style.italic = true;
    if(tag === 'FONT'){
      const colorAttr = node.getAttribute('color');
      if(colorAttr){ const h = colorHex(colorAttr.startsWith('#') ? colorAttr : ('#'+colorAttr)); if(h) style.color = h; }
      const faceAttr = node.getAttribute('face');
      if(faceAttr) style.font = faceAttr.split(',')[0].replace(/['"]/g,'').trim();
    }
    const cStyle = node.style || {};
    if(cStyle.color){ const h = colorHex(cStyle.color); if(h) style.color = h; }
    if(cStyle.backgroundColor){ const h = colorHex(cStyle.backgroundColor); if(h) style.highlight = mapHighlight(h); }
    if(cStyle.fontFamily) style.font = cStyle.fontFamily.split(',')[0].replace(/['"]/g,'').trim();
    if(tag === 'A'){
      // simplified: render as colored underlined text (no relationship hyperlink to keep zip writer simple)
      style.color = style.color || '2563EB';
      style.underline = true;
    }
    if(tag === 'IMG'){
      out.push(imageRun(node));
      return;
    }
    if(!node.childNodes.length){
      return;
    }
    node.childNodes.forEach(child => walkInline(child, style, out));
  }

  function mapHighlight(hex){
    const table = { 'FEF08A':'yellow','FECACA':'red','BBF7D0':'green','BFDBFE':'blue','E9D5FF':'magenta' };
    return table[hex] || 'yellow';
  }

  function imageRun(img){
    imageCounter++;
    const id = 'rIdImg' + imageCounter;
    let w = img.naturalWidth || img.width || 300;
    let h = img.naturalHeight || img.height || 200;
    const maxW = 580;
    if(w > maxW){ h = Math.round(h * (maxW / w)); w = maxW; }
    const emuW = Math.round(w * 9525);
    const emuH = Math.round(h * 9525);
    images.push({ id, src: img.src });
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="${emuW}" cy="${emuH}"/>
      <wp:docPr id="${imageCounter}" name="Picture ${imageCounter}"/>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr><pic:cNvPr id="${imageCounter}" name="Picture ${imageCounter}"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="${id}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline></w:drawing></w:r>`;
  }

  function paraProps(node, extra){
    let jc = '';
    const align = (node.style && node.style.textAlign) || '';
    if(align === 'center') jc = '<w:jc w:val="center"/>';
    else if(align === 'right') jc = '<w:jc w:val="right"/>';
    else if(align === 'justify') jc = '<w:jc w:val="both"/>';
    return `<w:pPr>${extra||''}${jc}</w:pPr>`;
  }

  function blockToXml(node, listCtx){
    if(node.nodeType === Node.TEXT_NODE){
      if(!node.nodeValue.trim()) return '';
      return `<w:p>${textRun(node.nodeValue, {})}</w:p>`;
    }
    if(node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName;

    if(tag === 'HR'){
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>';
    }
    if(/^H[1-3]$/.test(tag)){
      const lvl = tag[1];
      const out = [];
      node.childNodes.forEach(c => walkInline(c, {}, out));
      return `<w:p>${paraProps(node, `<w:pStyle w:val="Heading${lvl}"/>`)}${out.join('')}</w:p>`;
    }
    if(tag === 'BLOCKQUOTE'){
      const inner = Array.from(node.children).length ? Array.from(node.children) : [node];
      return inner.map(p=>{
        const out = [];
        (p.childNodes ? p.childNodes : [p]).forEach(c => walkInline(c, { italic:true, color:'555555' }, out));
        return `<w:p>${paraProps(node, '<w:pStyle w:val="IntenseQuote"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="F59E0B"/></w:pBdr><w:ind w:left="360"/>')}${out.join('')}</w:p>`;
      }).join('');
    }
    if(tag === 'PRE' || node.classList?.contains('dr-codebox')){
      const codeEl = node.querySelector ? node.querySelector('code') : null;
      const text = (codeEl || node).textContent || '';
      const lines = text.split('\n');
      const runs = lines.map((line, i) => {
        const r = textRun(line || ' ', { font:'Consolas', size:'20' });
        return i < lines.length - 1 ? r + '<w:r><w:br/></w:r>' : r;
      }).join('');
      return `<w:p><w:pPr><w:shd w:val="clear" w:fill="F1F5F9"/><w:spacing w:after="160"/></w:pPr>${runs}</w:p>`;
    }
    if(tag === 'UL' || tag === 'OL'){
      const isChecklist = node.classList && node.classList.contains('dr-checklist');
      const numId = tag === 'UL' ? 1 : 2;
      let out = '';
      Array.from(node.children).forEach(li=>{
        if(li.tagName !== 'LI') return;
        if(isChecklist){
          const checkbox = li.querySelector ? li.querySelector('input') : null;
          const checked = checkbox && checkbox.checked;
          const runs = [textRun((checked ? '\u2611 ' : '\u2610 '), {})];
          li.childNodes.forEach(c => {
            if(c.tagName === 'INPUT') return;
            walkInline(c, {}, runs);
          });
          out += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr>${runs.join('')}</w:p>`;
          return;
        }
        const runs = [];
        li.childNodes.forEach(c => walkInline(c, {}, runs));
        out += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${runs.join('')}</w:p>`;
      });
      return out;
    }
    if(tag === 'TABLE'){
      const rows = Array.from(node.querySelectorAll('tr'));
      if(!rows.length) return '';
      const colCount = Math.max(...rows.map(r=>r.children.length));
      const colWidth = Math.floor(9360 / colCount);
      const grid = `<w:tblGrid>${Array(colCount).fill(`<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>`;
      const rowsXml = rows.map(r=>{
        const cells = Array.from(r.children).map(td=>{
          const runs = [];
          td.childNodes.forEach(c => walkInline(c, {}, runs));
          const content = runs.join('') || '<w:r><w:t></w:t></w:r>';
          return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:tcBorders>
            <w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/>
            <w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/>
          </w:tcBorders></w:tcPr><w:p>${content}</w:p></w:tc>`;
        }).join('');
        return `<w:tr>${cells}</w:tr>`;
      }).join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/>
      </w:tblBorders></w:tblPr>${grid}${rowsXml}</w:tbl><w:p/>`;
    }
    if(node.classList && node.classList.contains('dr-pagebreak')){
      return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    }
    if(node.classList && node.classList.contains('dr-callout')){
      const fill = node.classList.contains('warn') ? 'FFFBEB' : node.classList.contains('success') ? 'ECFDF5' : 'EFF6FF';
      const border = node.classList.contains('warn') ? 'F59E0B' : node.classList.contains('success') ? '10B981' : '3B82F6';
      const out = [];
      Array.from(node.children).forEach(child=>{
        if(child.classList && child.classList.contains('dr-callout-icon')) return;
        child.childNodes.forEach(c => walkInline(c, {}, out));
      });
      return `<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="16" w:space="8" w:color="${border}"/></w:pBdr><w:shd w:val="clear" w:fill="${fill}"/><w:ind w:left="120"/></w:pPr>${out.join('') || textRun(' ', {})}</w:p>`;
    }
    if(tag === 'P' || tag === 'DIV'){
      if(!node.textContent.trim() && !node.querySelector('img, br')) return '<w:p/>';
      const out = [];
      node.childNodes.forEach(c => walkInline(c, {}, out));
      return `<w:p>${paraProps(node)}${out.join('')}</w:p>`;
    }
    // fallback: treat unknown block as paragraph
    const out = [];
    node.childNodes.forEach(c => walkInline(c, {}, out));
    return out.length ? `<w:p>${out.join('')}</w:p>` : '';
  }

  let body = '';
  rootEl.childNodes.forEach(node => { body += blockToXml(node); });
  if(!body) body = '<w:p/>';
  return { body, images };
}

async function buildDocxBlob(file, rootEl){
  const { body, images } = htmlToDocxXml(rootEl);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  let docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`;

  const zip = new DocxZip.ZipBuilder();
  for(const img of images){
    try{
      const resp = await fetch(img.src);
      const blob = await resp.blob();
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg','jpeg');
      const buf = new Uint8Array(await blob.arrayBuffer());
      const fname = `media/${img.id}.${ext === 'jpeg' ? 'jpeg' : ext}`;
      zip.add(`word/${fname}`, buf);
      docRels += `<Relationship Id="${img.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${fname}"/>`;
    }catch(e){ /* skip image that fails to embed */ }
  }
  docRels += '</Relationships>';

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="320" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="280" w:after="140"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="IntenseQuote"><w:name w:val="Intense Quote"/><w:basedOn w:val="Normal"/>
    <w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
</w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

  const now = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${(file.name||'Document').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</dc:title>
  <dc:creator>Drawer</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Drawer</Application></Properties>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${body}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;

  zip.add('[Content_Types].xml', contentTypes);
  zip.add('_rels/.rels', rootRels);
  zip.add('word/document.xml', document);
  zip.add('word/styles.xml', styles);
  zip.add('word/numbering.xml', numbering);
  zip.add('word/_rels/document.xml.rels', docRels);
  zip.add('docProps/core.xml', core);
  zip.add('docProps/app.xml', app);

  const bytes = zip.build();
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------------------------------------------------------------------
   HTML -> Markdown (basic, best-effort) for the "Export as Markdown" option
   ------------------------------------------------------------------- */
function htmlToMarkdown(rootEl){
  function inline(node){
    if(node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if(node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName;
    const inner = () => Array.from(node.childNodes).map(inline).join('');
    switch(tag){
      case 'B': case 'STRONG': return `**${inner()}**`;
      case 'I': case 'EM': return `*${inner()}*`;
      case 'U': return `<u>${inner()}</u>`;
      case 'S': case 'STRIKE': return `~~${inner()}~~`;
      case 'CODE': return `\`${inner()}\``;
      case 'A': return `[${inner()}](${node.getAttribute('href')||''})`;
      case 'BR': return '\n';
      case 'IMG': return `![](${node.getAttribute('src')||''})`;
      default: return inner();
    }
  }
  function block(node){
    if(node.nodeType === Node.TEXT_NODE) return node.nodeValue.trim() ? node.nodeValue : '';
    if(node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName;
    if(tag === 'H1') return `# ${inline2(node)}\n\n`;
    if(tag === 'H2') return `## ${inline2(node)}\n\n`;
    if(tag === 'H3') return `### ${inline2(node)}\n\n`;
    if(tag === 'BLOCKQUOTE') return `> ${inline2(node)}\n\n`;
    if(tag === 'HR') return `---\n\n`;
    if(tag === 'PRE' || node.classList?.contains('dr-codebox')){
      const codeEl = node.querySelector ? node.querySelector('code') : node;
      const lang = node.dataset ? (node.dataset.lang||'') : '';
      return `\`\`\`${lang}\n${(codeEl||node).textContent}\n\`\`\`\n\n`;
    }
    if(tag === 'UL'){
      const isChecklist = node.classList && node.classList.contains('dr-checklist');
      if(isChecklist){
        return Array.from(node.children).map(li=>{
          const checkbox = li.querySelector ? li.querySelector('input') : null;
          const checked = checkbox && checkbox.checked;
          const text = Array.from(li.childNodes).filter(c=>c.tagName !== 'INPUT').map(inline).join('').trim();
          return `- [${checked ? 'x' : ' '}] ${text}\n`;
        }).join('') + '\n';
      }
      return Array.from(node.children).map(li=>`- ${inline2(li)}\n`).join('') + '\n';
    }
    if(tag === 'OL') return Array.from(node.children).map((li,i)=>`${i+1}. ${inline2(li)}\n`).join('') + '\n';
    if(node.classList && node.classList.contains('dr-pagebreak')) return `\n---\n\n`;
    if(node.classList && node.classList.contains('dr-callout')){
      const lines = Array.from(node.children)
        .filter(child => !(child.classList && child.classList.contains('dr-callout-icon')))
        .map(child => inline2(child)).join(' ').trim();
      return `> **Note:** ${lines}\n\n`;
    }
    if(tag === 'TABLE'){
      const rows = Array.from(node.querySelectorAll('tr')).map(r=>Array.from(r.children).map(c=>inline2(c).trim()||' '));
      if(!rows.length) return '';
      let out = `| ${rows[0].join(' | ')} |\n`;
      out += `| ${rows[0].map(()=>'---').join(' | ')} |\n`;
      rows.slice(1).forEach(r=> out += `| ${r.join(' | ')} |\n`);
      return out + '\n';
    }
    if(tag === 'P' || tag === 'DIV'){
      const t = inline2(node);
      return t.trim() ? `${t}\n\n` : '\n';
    }
    return Array.from(node.childNodes).map(block).join('');
  }
  function inline2(node){ return Array.from(node.childNodes).map(inline).join(''); }
  return Array.from(rootEl.childNodes).map(block).join('').replace(/\n{3,}/g,'\n\n').trim() + '\n';
}

/* ---------------------------------------------------------------------
   Built-in zero-dependency math renderer.
   Accepts a small LaTeX-like subset and turns it into formatted HTML
   spans (handles ^{}, _{}, \frac{}{}, common symbols, sqrt).
   ------------------------------------------------------------------- */
const MATH_SYMBOLS = {
  '\\alpha':'α','\\beta':'β','\\gamma':'γ','\\delta':'δ','\\epsilon':'ε','\\zeta':'ζ',
  '\\eta':'η','\\theta':'θ','\\iota':'ι','\\kappa':'κ','\\lambda':'λ','\\mu':'μ','\\nu':'ν',
  '\\xi':'ξ','\\pi':'π','\\rho':'ρ','\\sigma':'σ','\\tau':'τ','\\upsilon':'υ','\\phi':'φ',
  '\\chi':'χ','\\psi':'ψ','\\omega':'ω',
  '\\Delta':'Δ','\\Sigma':'Σ','\\Omega':'Ω','\\Gamma':'Γ','\\Theta':'Θ','\\Lambda':'Λ','\\Pi':'Π','\\Phi':'Φ','\\Psi':'Ψ',
  '\\infty':'∞','\\pm':'±','\\mp':'∓','\\times':'×','\\div':'÷','\\cdot':'·',
  '\\leq':'≤','\\geq':'≥','\\neq':'≠','\\approx':'≈','\\equiv':'≡','\\sim':'∼',
  '\\rightarrow':'→','\\leftarrow':'←','\\Rightarrow':'⇒','\\Leftrightarrow':'⇔','\\to':'→',
  '\\sum':'∑','\\prod':'∏','\\int':'∫','\\partial':'∂','\\nabla':'∇',
  '\\in':'∈','\\notin':'∉','\\subset':'⊂','\\cup':'∪','\\cap':'∩','\\emptyset':'∅',
  '\\forall':'∀','\\exists':'∃','\\sqrt':'√','\\degree':'°','\\%':'%',
};

function renderMathToHtml(src){
  let s = src;
  // \frac{a}{b} -> stacked fraction
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m,a,b)=>{
    return `<span class="dr-frac"><span class="dr-frac-num">${renderMathInline(a)}</span><span class="dr-frac-den">${renderMathInline(b)}</span></span>`;
  });
  s = renderMathInline(s);
  return s;
}
function renderMathInline(s){
  // sqrt{x}
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, (m,a)=> `√<span class="dr-sqrt-bar">${escapeMathText(a)}</span>`);
  // superscript ^{...} or ^x
  s = s.replace(/\^\{([^{}]*)\}/g, (m,a)=> `<sup>${escapeMathText(a)}</sup>`);
  s = s.replace(/\^(\w)/g, (m,a)=> `<sup>${a}</sup>`);
  // subscript _{...} or _x
  s = s.replace(/_\{([^{}]*)\}/g, (m,a)=> `<sub>${escapeMathText(a)}</sub>`);
  s = s.replace(/_(\w)/g, (m,a)=> `<sub>${a}</sub>`);
  // symbols (longest keys first to avoid partial collisions)
  const keys = Object.keys(MATH_SYMBOLS).sort((a,b)=>b.length-a.length);
  for(const k of keys){
    s = s.split(k).join(MATH_SYMBOLS[k]);
  }
  return s;
}
function escapeMathText(s){
  // still allow nested ^ _ symbol replacement, just escape stray braces/backslashes left
  return renderMathInlineSimpleSymbols(s);
}
function renderMathInlineSimpleSymbols(s){
  const keys = Object.keys(MATH_SYMBOLS).sort((a,b)=>b.length-a.length);
  for(const k of keys) s = s.split(k).join(MATH_SYMBOLS[k]);
  return s;
}

/* =========================================================================
   MULTI-DOCUMENT TAB SESSION
   The shell can hold several open documents at once as tabs. Each tab
   tracks its own file id, dirty state, undo state lives in the DOM itself
   (contentEditable's native undo stack per page element).
   ========================================================================= */
let docSession = null; // { tabs: [{fileId, name, type}], activeIndex }

function openDocEditor(file){
  let shell = document.getElementById('docEditor');
  const fresh = shell.cloneNode(false);
  shell.replaceWith(fresh);
  shell = fresh;
  shell.classList.remove('hidden');

  docSession = { tabs: [{ fileId: file.id }], activeIndex: 0 };

  buildEditorShell(shell);
  mountTab(shell, file.id, true);
}

const DOC_FONTS = [
  { label:'Serif (Iowan)', value:"'Iowan Old Style','Palatino Linotype',Georgia,serif" },
  { label:'Sans (System)', value:"-apple-system,'Segoe UI',Helvetica,Arial,sans-serif" },
  { label:'Georgia', value:"Georgia,serif" },
  { label:'Times New Roman', value:"'Times New Roman',Times,serif" },
  { label:'Garamond', value:"Garamond,'EB Garamond',serif" },
  { label:'Helvetica', value:"Helvetica,Arial,sans-serif" },
  { label:'Verdana', value:"Verdana,Geneva,sans-serif" },
  { label:'Trebuchet MS', value:"'Trebuchet MS',sans-serif" },
  { label:'Tahoma', value:"Tahoma,Geneva,sans-serif" },
  { label:'Courier New (Mono)', value:"'Courier New',monospace" },
  { label:'Consolas (Mono)', value:"Consolas,'Courier New',monospace" },
  { label:'Comic Sans', value:"'Comic Sans MS',cursive" },
  { label:'Impact', value:"Impact,'Arial Black',sans-serif" },
  { label:'Palatino', value:"Palatino,'Palatino Linotype',serif" },
  { label:'Brush Script', value:"'Brush Script MT',cursive" },
];

function buildEditorShell(shell){
  shell.innerHTML = `
    <style>
      .doc-tabbar{ display:flex; align-items:stretch; gap:0; background:var(--bg-app); border-bottom:1px solid var(--border); overflow-x:auto; flex-wrap:nowrap; }
      .doc-tab{ display:flex; align-items:center; gap:8px; padding:9px 10px 9px 14px; border-right:1px solid var(--border);
        background:var(--bg-app); color:var(--text-muted); font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap; max-width:220px; flex-shrink:0; }
      .doc-tab.active{ background:var(--bg-card); color:var(--text-main); box-shadow:inset 0 -2px 0 var(--primary); }
      .doc-tab .tlabel{ overflow:hidden; text-overflow:ellipsis; max-width:140px; }
      .doc-tab .tclose{ border:none; background:transparent; color:var(--text-muted); width:18px;height:18px;border-radius:4px;
        display:flex;align-items:center;justify-content:center; font-size:12px; flex-shrink:0; }
      .doc-tab .tclose:hover{ background:var(--border); color:var(--danger); }
      .doc-tab .tdirty{ width:6px;height:6px;border-radius:50%;background:var(--warning); flex-shrink:0; }
      .doc-newtab{ border:none; background:transparent; color:var(--text-muted); width:36px; flex-shrink:0; font-size:16px; }
      .doc-newtab:hover{ background:var(--border); color:var(--text-main); }

      .doc-page-wrap{ flex:1; overflow-y:auto; padding:40px 20px 140px; display:flex; justify-content:center; background:var(--bg-app); }
      .doc-page{
        width:100%; max-width:800px; min-height:1000px; background:var(--bg-card);
        box-shadow:var(--shadow-lg); padding:72px 80px; border-radius:4px;
        font-family:system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size:16px; line-height:1.7; color:var(--text-main); outline:none;
      }
      .doc-page.zoom-90{ transform:scale(0.9); transform-origin:top center; }
      .doc-page.zoom-75{ transform:scale(0.75); transform-origin:top center; }
      .doc-page.zoom-125{ transform:scale(1.25); transform-origin:top center; }
      .doc-page:focus{ outline:none; }
      .doc-page h1{ font-size:32px; margin:0.6em 0 0.3em; font-weight:700; color:var(--text-main); }
      .doc-page h2{ font-size:24px; margin:0.6em 0 0.3em; font-weight:700; color:var(--text-main); }
      .doc-page h3{ font-size:20px; margin:0.6em 0 0.3em; font-weight:700; color:var(--text-main); }
      .doc-page p{ margin:0 0 0.9em; }
      .doc-page ul, .doc-page ol{ margin:0 0 0.9em; padding-left:28px; }
      .doc-page ul.dr-checklist{ list-style:none; padding-left:4px; }
      .doc-page ul.dr-checklist li{ display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; }
      .doc-page ul.dr-checklist li input[type="checkbox"]{ margin-top:5px; flex-shrink:0; }
      .doc-page blockquote{ border-left:3px solid var(--primary); margin:0 0 0.9em; padding:2px 0 2px 16px; color:var(--text-muted); font-style:italic; }
      .doc-page a{ color:var(--primary); text-decoration:underline; }
      .doc-page table{ border-collapse:collapse; margin:0 0 0.9em; width:100%; }
      .doc-page table td{ border:1px solid var(--border); padding:8px 12px; vertical-align:top; background:var(--bg-app); position:relative; }
      .doc-page img{ max-width:100%; border-radius:6px; }
      .doc-page hr{ border:none; border-top:1px solid var(--border); margin:1.5em 0; }
      .doc-page .dr-pagebreak{ display:block; border-top:2px dashed var(--border); margin:2em 0; position:relative; height:0; }
      .doc-page .dr-pagebreak::after{ content:"Page break"; position:absolute; top:-9px; left:50%; transform:translateX(-50%);
        background:var(--bg-card); padding:0 8px; font-size:10px; color:var(--text-muted); letter-spacing:.05em; text-transform:uppercase; }
      .doc-page .dr-codebox{ display:block; background:#0f172a; color:#e2e8f0; border-radius:8px; padding:14px 16px; margin:0 0 0.9em;
        font-family:Consolas,'Courier New',monospace; font-size:13.5px; line-height:1.55; overflow-x:auto; white-space:pre; position:relative; }
      .doc-page .dr-codebox .dr-codelang{ position:absolute; top:6px; right:10px; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; font-family:system-ui,sans-serif; }
      .doc-page .dr-callout{ display:flex; gap:10px; padding:12px 14px; border-radius:8px; margin:0 0 0.9em; background:var(--sheet-tint); border:1px solid var(--sheet-color); }
      .doc-page .dr-callout.warn{ background:var(--slide-tint); border-color:var(--slide-color); }
      .doc-page .dr-callout.success{ background:var(--doc-tint); border-color:var(--doc-color); }
      .doc-page .dr-callout .dr-callout-icon{ flex-shrink:0; }
      .doc-page .dr-math{ font-family:Georgia,'Times New Roman',serif; font-style:italic; padding:1px 3px; }
      .doc-page .dr-math .dr-frac{ display:inline-flex; flex-direction:column; vertical-align:middle; text-align:center; margin:0 2px; font-size:0.9em; }
      .doc-page .dr-math .dr-frac-num{ border-bottom:1.2px solid currentColor; padding:0 3px; }
      .doc-page .dr-math .dr-frac-den{ padding:0 3px; }
      .doc-page .dr-math .dr-sqrt-bar{ border-top:1.2px solid currentColor; padding:0 2px; }

      .find-bar{ display:flex; align-items:center; gap:8px; padding:10px 16px; background:var(--bg-card); border-bottom:1px solid var(--border); flex-wrap:wrap; }
      .find-bar input{ padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; width:170px; background:var(--bg-app); color:var(--text-main); }
      .find-bar button{ border:1px solid var(--border); background:var(--bg-app); border-radius:6px; padding:6px 12px; font-size:12px; color:var(--text-main); transition:var(--transition); }
      .find-bar button:hover{ background:var(--border); }
      .find-bar .fb-count{ font-size:11.5px; color:var(--text-muted); }
      .find-bar .fb-close{ margin-left:auto; border:none; background:transparent; font-size:16px; color:var(--text-muted); cursor:pointer; }
      .dr-hit{ background:#fde68a; }
      .dr-hit.dr-hit-current{ background:#f59e0b; color:#fff; }

      .status-bar{ display:flex; align-items:center; gap:18px; padding:7px 18px; border-top:1px solid var(--border); background:var(--bg-card);
        font-size:11.5px; color:var(--text-muted); flex-wrap:wrap; }
      .status-bar .zoom-ctrl{ margin-left:auto; display:flex; align-items:center; gap:6px; }
      .status-bar select{ border:1px solid var(--border); border-radius:6px; font-size:11px; padding:3px 6px; background:var(--bg-app); color:var(--text-main); }

      .outline-panel{ position:absolute; top:0; right:0; width:220px; height:100%; background:var(--bg-card); border-left:1px solid var(--border);
        overflow-y:auto; padding:14px; transform:translateX(100%); transition:transform .2s ease; z-index:5; }
      .outline-panel.open{ transform:translateX(0); }
      .outline-panel h4{ margin:0 0 10px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); }
      .outline-item{ display:block; width:100%; text-align:left; border:none; background:transparent; padding:6px 8px; border-radius:6px;
        font-size:12.5px; color:var(--text-main); margin-bottom:2px; }
      .outline-item:hover{ background:var(--bg-app); }
      .outline-item.lvl2{ padding-left:18px; font-size:12px; color:var(--text-muted); }
      .outline-item.lvl3{ padding-left:28px; font-size:11.5px; color:var(--text-muted); }

      .math-modal, .codebox-modal{ position:fixed; inset:0; background:rgba(15,23,42,0.4); display:flex; align-items:center; justify-content:center; z-index:200; backdrop-filter:blur(4px); }
      .math-box, .codebox-box{ background:var(--bg-card); border-radius:12px; padding:24px; width:460px; max-width:90vw; box-shadow:var(--shadow-lg); }
      .math-box h3, .codebox-box h3{ margin:0 0 12px; font-size:16px; }
      .math-box textarea, .codebox-box textarea{ width:100%; min-height:80px; border:1px solid var(--border); border-radius:8px; padding:10px; font-family:Consolas,monospace; font-size:13px; resize:vertical; background:var(--bg-app); color:var(--text-main); }
      .math-preview{ margin-top:12px; padding:14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-app); min-height:40px; font-size:18px; text-align:center; }
      .math-hint{ font-size:11px; color:var(--text-muted); margin-top:8px; line-height:1.5; }
      .codebox-row{ display:flex; gap:10px; margin-bottom:10px; }
      .codebox-row select{ flex-shrink:0; border:1px solid var(--border); border-radius:8px; padding:8px 10px; font-size:13px; background:var(--bg-app); color:var(--text-main); }
      .modal-footer-row{ display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }

      .export-menu{ position:absolute; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; box-shadow:var(--shadow-lg);
        padding:6px; min-width:190px; z-index:60; }
      .export-menu button{ display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:none; background:transparent;
        padding:9px 10px; border-radius:7px; font-size:13px; color:var(--text-main); }
      .export-menu button:hover{ background:var(--bg-app); }

      @media (max-width:720px){
        .doc-page{ padding:36px 22px; }
        .outline-panel{ width:80vw; }
      }
    </style>
    <div class="editor-topbar" id="docTopbar"></div>
    <div class="editor-toolbar" role="toolbar" aria-label="Formatting" id="docToolbar"></div>
    <div class="find-bar hidden" id="findBar">
      <input type="text" id="findInput" placeholder="Find">
      <input type="text" id="replaceInput" placeholder="Replace with">
      <span class="fb-count" id="findCount"></span>
      <button id="findPrevBtn">&#8593; Prev</button>
      <button id="findNextBtn">Next &#8595;</button>
      <button id="replaceBtn">Replace</button>
      <button id="replaceAllBtn">Replace all</button>
      <button class="fb-close" id="findCloseBtn" aria-label="Close find bar">&#10005;</button>
    </div>
    <div class="doc-tabbar" id="docTabbar"></div>
    <div class="editor-body" id="docEditorBody" style="position:relative;">
      <div class="outline-panel" id="outlinePanel"><h4>Outline</h4><div id="outlineList"></div></div>
    </div>
    <div class="status-bar" id="docStatusBar"></div>
  `;

  // Topbar (shared across tabs — shows active tab's title)
  shell.querySelector('#docTopbar').innerHTML = `
    <button class="back-btn" id="docBack" aria-label="Back to drawer">&#8592;</button>
    <input type="text" class="title-input" id="docTitle" aria-label="Document title">
    <div class="save-indicator"><span class="sdot" id="docSaveDot"></span><span id="docSaveText">Saved</span></div>
  `;

  shell.querySelector('#docToolbar').innerHTML = `
    <select class="tsel" id="blockStyle" aria-label="Paragraph style">
      <option value="P">Normal text</option>
      <option value="H1">Heading 1</option>
      <option value="H2">Heading 2</option>
      <option value="H3">Heading 3</option>
      <option value="BLOCKQUOTE">Quote</option>
    </select>
    <select class="tsel" id="fontFamily" aria-label="Font">
      ${DOC_FONTS.map(f=>`<option value="${f.value}">${f.label}</option>`).join('')}
    </select>
    <select class="tsel" id="fontSize" aria-label="Font size">
      <option value="1">Small</option>
      <option value="2">Smallish</option>
      <option value="3" selected>Normal</option>
      <option value="4">Large</option>
      <option value="5">X-Large</option>
      <option value="6">XX-Large</option>
      <option value="7">Huge</option>
    </select>
    <span class="sep"></span>
    <button class="tbtn" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
    <button class="tbtn" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
    <button class="tbtn" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
    <button class="tbtn" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
    <button class="tbtn" data-cmd="superscript" title="Superscript">x&sup2;</button>
    <button class="tbtn" data-cmd="subscript" title="Subscript">x&#8322;</button>
    <input type="color" id="textColor" title="Text color" value="#1E2A3A">
    <input type="color" id="highlightColor" title="Highlight color" value="#FEF08A">
    <span class="sep"></span>
    <button class="tbtn" data-cmd="justifyLeft" title="Align left">&#8676;</button>
    <button class="tbtn" data-cmd="justifyCenter" title="Align center">&#8596;</button>
    <button class="tbtn" data-cmd="justifyRight" title="Align right">&#8677;</button>
    <button class="tbtn" data-cmd="justifyFull" title="Justify">&#9636;</button>
    <select class="tsel" id="lineHeight" aria-label="Line spacing" title="Line spacing">
      <option value="1.3">1.0</option>
      <option value="1.5">1.15</option>
      <option value="1.7" selected>1.5</option>
      <option value="2.2">2.0</option>
    </select>
    <span class="sep"></span>
    <button class="tbtn" data-cmd="insertUnorderedList" title="Bullet list">&#8226;&#8226;</button>
    <button class="tbtn" data-cmd="insertOrderedList" title="Numbered list">1.2.</button>
    <button class="tbtn" id="checklistBtn" title="Checklist">&#9744;</button>
    <button class="tbtn" data-cmd="outdent" title="Decrease indent">&#8676;|</button>
    <button class="tbtn" data-cmd="indent" title="Increase indent">|&#8677;</button>
    <span class="sep"></span>
    <button class="tbtn" id="linkBtn" title="Insert link">&#128279;</button>
    <button class="tbtn" id="imageBtn" title="Insert image">&#128247;</button>
    <button class="tbtn" id="tableBtn" title="Insert table">&#8862;</button>
    <button class="tbtn" id="mathBtn" title="Insert equation">&#8721;</button>
    <button class="tbtn" id="codeBtn" title="Insert code block">&#60;/&#62;</button>
    <button class="tbtn" id="calloutBtn" title="Insert callout box">&#9888;</button>
    <button class="tbtn" id="emojiBtn" title="Insert emoji">&#128515;</button>
    <button class="tbtn" data-cmd="insertHorizontalRule" title="Insert divider">&#8213;</button>
    <button class="tbtn" id="pageBreakBtn" title="Insert page break">&#8676;&#8677;</button>
    <span class="sep"></span>
    <button class="tbtn" data-cmd="undo" title="Undo (Ctrl+Z)">&#8634;</button>
    <button class="tbtn" data-cmd="redo" title="Redo (Ctrl+Y)">&#8635;</button>
    <button class="tbtn" data-cmd="removeFormat" title="Clear formatting">Tx</button>
    <span class="sep"></span>
    <button class="tbtn wide" id="findBtn" title="Find and replace (Ctrl+F)">&#128269; Find</button>
    <button class="tbtn wide" id="outlineBtn" title="Document outline">&#128203; Outline</button>
    <button class="tbtn wide" id="docExportBtn" title="Export document">&#11015; Export</button>
    <button class="tbtn wide" id="docPrintBtn" title="Print / Save as PDF">&#128424; Print</button>
  `;

  // ---- Tab bar rendering ----
  function renderTabs(){
    const bar = shell.querySelector('#docTabbar');
    bar.innerHTML = '';
    docSession.tabs.forEach((tab, i)=>{
      const f = getFile(tab.fileId) || { name:'Untitled' };
      const el = document.createElement('div');
      el.className = 'doc-tab' + (i === docSession.activeIndex ? ' active' : '');
      el.innerHTML = `
        ${tab.dirty ? '<span class="tdirty"></span>' : ''}
        <span class="tlabel">${escapeHtml(f.name || 'Untitled')}</span>
        <button class="tclose" type="button" aria-label="Close tab" data-i="${i}">&#10005;</button>
      `;
      el.addEventListener('click', (e)=>{
        if(e.target.closest('.tclose')) return;
        switchTab(shell, i);
      });
      el.querySelector('.tclose').addEventListener('click', (e)=>{
        e.stopPropagation();
        closeTab(shell, i);
      });
      bar.appendChild(el);
    });
    const newBtn = document.createElement('button');
    newBtn.className = 'doc-newtab';
    newBtn.type = 'button';
    newBtn.title = 'Open another document in a new tab';
    newBtn.innerHTML = '&#43;';
    newBtn.addEventListener('click', ()=> openPickerForNewTab(shell));
    bar.appendChild(newBtn);
  }
  shell._renderTabs = renderTabs;
  renderTabs();

  shell.querySelector('#docBack').addEventListener('click', ()=>{
    docSession.tabs.forEach(t=>{ if(t.save) t.save(); });
    cleanupDocShell(shell);
    closeEditor('docEditor');
    docSession = null;
  });
}

function cleanupDocShell(shell){
  if(shell._drSelectionChangeHandler){
    document.removeEventListener('selectionchange', shell._drSelectionChangeHandler);
    shell._drSelectionChangeHandler = null;
  }
}

function openPickerForNewTab(shell){
  const files = loadFiles().filter(f=>f.type === 'doc');
  const already = new Set(docSession.tabs.map(t=>t.fileId));
  const choices = files.filter(f=>!already.has(f.id));
  if(choices.length === 0){
    if(confirm('No other documents to open. Create a new document?')){
      const f = { id: uid(), type:'doc', name:'Untitled', content:{html:''}, createdAt:Date.now(), updatedAt:Date.now() };
      upsertFile(f);
      docSession.tabs.push({ fileId: f.id });
      docSession.activeIndex = docSession.tabs.length - 1;
      shell._renderTabs();
      mountTab(shell, f.id, true);
    }
    return;
  }
  const name = prompt('Open which document as a new tab? Type the exact name:\n\n' + choices.map(c=>'• '+c.name).join('\n'));
  if(!name) return;
  const match = choices.find(c=>c.name.toLowerCase() === name.trim().toLowerCase());
  if(!match){ alert('No document found with that name.'); return; }
  docSession.tabs.push({ fileId: match.id });
  docSession.activeIndex = docSession.tabs.length - 1;
  shell._renderTabs();
  mountTab(shell, match.id, true);
}

function switchTab(shell, index){
  if(docSession.activeIndex === index) return;
  const cur = docSession.tabs[docSession.activeIndex];
  if(cur && cur.save) cur.save();
  docSession.activeIndex = index;
  shell._renderTabs();
  mountTab(shell, docSession.tabs[index].fileId, false);
}

function closeTab(shell, index){
  const tab = docSession.tabs[index];
  if(tab && tab.save) tab.save();
  docSession.tabs.splice(index, 1);
  if(docSession.tabs.length === 0){
    cleanupDocShell(shell);
    closeEditor('docEditor');
    docSession = null;
    return;
  }
  if(docSession.activeIndex >= docSession.tabs.length) docSession.activeIndex = docSession.tabs.length - 1;
  else if(index < docSession.activeIndex) docSession.activeIndex--;
  shell._renderTabs();
  mountTab(shell, docSession.tabs[docSession.activeIndex].fileId, false);
}

/* ---------------------------------------------------------------------
   Mounts a given file's content + wires up all toolbar behavior for the
   *active* tab. Re-runs every time the active tab switches.
   ------------------------------------------------------------------- */
function mountTab(shell, fileId, isFirstMount){
  const file = getFile(fileId);
  if(!file) return;
  const body = shell.querySelector('#docEditorBody');
  let page = body.querySelector('#docPage');
  if(!page){
    page = document.createElement('div');
    page.className = 'doc-page';
    page.id = 'docPage';
    page.contentEditable = 'true';
    page.setAttribute('role','textbox');
    page.setAttribute('aria-multiline','true');
    page.setAttribute('aria-label','Document content');
    const wrap = document.createElement('div');
    wrap.className = 'doc-page-wrap';
    wrap.appendChild(page);
    body.insertBefore(wrap, body.firstChild);
  }
  page.innerHTML = (file.content && file.content.html) || '<p><br></p>';
  page.style.lineHeight = (file.content && file.content.lineHeight) || '1.7';
  document.execCommand('styleWithCSS', false, true);

  const titleInput = shell.querySelector('#docTitle');
  const saveDot = shell.querySelector('#docSaveDot');
  const saveText = shell.querySelector('#docSaveText');
  titleInput.value = file.name;

  let saveTimeout = null;
  function markUnsaved(){
    saveDot.style.background = 'var(--warning)';
    saveText.textContent = 'Saving…';
    const tab = docSession.tabs.find(t=>t.fileId === fileId);
    if(tab) tab.dirty = true;
    shell._renderTabs();
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
    updateStatusBar();
  }
  function doSave(){
    file.name = titleInput.value.trim() || 'Untitled';
    file.content = { html: page.innerHTML, lineHeight: page.style.lineHeight };
    upsertFile(file);
    saveDot.style.background = '#5B8A5E';
    saveText.textContent = 'Saved';
    const tab = docSession.tabs.find(t=>t.fileId === fileId);
    if(tab) tab.dirty = false;
    shell._renderTabs();
  }
  // expose save() so tab switch/close can flush pending edits
  const tabRef = docSession.tabs.find(t=>t.fileId === fileId);
  if(tabRef) tabRef.save = doSave;

  page.oninput = markUnsaved;
  titleInput.oninput = markUnsaved;
  titleInput.onkeydown = (e)=>{ if(e.key==='Enter'){ e.preventDefault(); page.focus(); } };

  /* ---------- toolbar wiring (rebind every mount; toolbar DOM is shared) ---------- */
  const tb = shell.querySelector('#docToolbar');

  function focusPage(){ page.focus(); }

  // Selection preservation helpers — fixes the "color picker glitch" where
  // focus moving to the <input type=color"> loses the text selection.
  let savedRange = null;
  function saveSelection(){
    const sel = window.getSelection();
    if(sel && sel.rangeCount > 0){
      const r = sel.getRangeAt(0);
      if(page.contains(r.commonAncestorContainer)) savedRange = r.cloneRange();
    }
  }
  function restoreSelection(){
    if(savedRange){
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }
  if(page._drSaveSelHandler){
    page.removeEventListener('keyup', page._drSaveSelHandler);
    page.removeEventListener('mouseup', page._drSaveSelHandler);
  }
  page._drSaveSelHandler = saveSelection;
  page.addEventListener('keyup', saveSelection);
  page.addEventListener('mouseup', saveSelection);

  tb.querySelectorAll('.tbtn[data-cmd]').forEach(btn=>{
    btn.onclick = ()=>{
      focusPage();
      document.execCommand(btn.dataset.cmd, false, null);
      markUnsaved();
      updateToolbarState();
    };
  });

  tb.querySelector('#blockStyle').onchange = (e)=>{
    focusPage();
    document.execCommand('formatBlock', false, '<' + e.target.value + '>');
    markUnsaved();
  };
  tb.querySelector('#fontFamily').onchange = (e)=>{
    focusPage();
    restoreSelection();
    document.execCommand('fontName', false, e.target.value);
    markUnsaved();
  };
  tb.querySelector('#fontSize').onchange = (e)=>{
    focusPage();
    restoreSelection();
    document.execCommand('fontSize', false, e.target.value);
    markUnsaved();
  };
  tb.querySelector('#lineHeight').onchange = (e)=>{
    page.style.lineHeight = e.target.value;
    markUnsaved();
  };

  // FIX: color pickers — save selection on mousedown/focus (before the
  // native color UI steals focus), then explicitly restore it before
  // execCommand runs on 'input'/'change'. This is the core fix for the
  // "color changing is glitchy" bug: previously the selection could
  // collapse or shift to the input element, silently making foreColor a
  // no-op or applying to the wrong place.
  const textColor = tb.querySelector('#textColor');
  textColor.addEventListener('mousedown', saveSelection);
  textColor.addEventListener('input', (e)=>{
    restoreSelection();
    focusPage();
    document.execCommand('foreColor', false, e.target.value);
    markUnsaved();
  });

  const highlightColor = tb.querySelector('#highlightColor');
  highlightColor.addEventListener('mousedown', saveSelection);
  highlightColor.addEventListener('input', (e)=>{
    restoreSelection();
    focusPage();
    let ok = false;
    try{ ok = document.execCommand('hiliteColor', false, e.target.value); }catch(err){ ok = false; }
    if(!ok){
      try{ document.execCommand('backColor', false, e.target.value); }catch(err){ /* ignore */ }
    }
    markUnsaved();
  });

  tb.querySelector('#checklistBtn').onclick = ()=>{
    focusPage();
    document.execCommand('insertHTML', false, '<ul class="dr-checklist"><li><input type="checkbox"> Item</li></ul><p><br></p>');
    markUnsaved();
  };

  tb.querySelector('#linkBtn').onclick = ()=>{
    const url = prompt('Enter URL:', 'https://');
    if(url){ focusPage(); document.execCommand('createLink', false, url); markUnsaved(); }
  };
  tb.querySelector('#imageBtn').onclick = ()=>{
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = 'image/*';
    inputEl.onchange = ()=>{
      const f = inputEl.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = (ev)=>{
        focusPage();
        document.execCommand('insertImage', false, ev.target.result);
        markUnsaved();
      };
      reader.readAsDataURL(f);
    };
    inputEl.click();
  };
  tb.querySelector('#tableBtn').onclick = ()=>{
    const rows = parseInt(prompt('Number of rows:', '3'), 10) || 3;
    const cols = parseInt(prompt('Number of columns:', '3'), 10) || 3;
    let html = '<table>';
    for(let r=0;r<rows;r++){
      html += '<tr>';
      for(let c=0;c<cols;c++) html += '<td><br></td>';
      html += '</tr>';
    }
    html += '</table><p><br></p>';
    focusPage();
    document.execCommand('insertHTML', false, html);
    markUnsaved();
  };

  tb.querySelector('#pageBreakBtn').onclick = ()=>{
    focusPage();
    document.execCommand('insertHTML', false, '<div class="dr-pagebreak"></div><p><br></p>');
    markUnsaved();
  };

  tb.querySelector('#calloutBtn').onclick = ()=>{
    openCalloutPicker(shell, (kind)=>{
      const icons = { info:'&#8505;', warn:'&#9888;', success:'&#9989;' };
      focusPage();
      document.execCommand('insertHTML', false,
        `<div class="dr-callout ${kind==='info'?'':kind}"><span class="dr-callout-icon">${icons[kind]}</span><div>Note text here…</div></div><p><br></p>`);
      markUnsaved();
    });
  };

  tb.querySelector('#emojiBtn').onclick = ()=>{
    openEmojiPicker(shell, (emoji)=>{
      focusPage();
      document.execCommand('insertText', false, emoji);
      markUnsaved();
    });
  };

  tb.querySelector('#mathBtn').onclick = ()=> openMathModal(shell, focusPage, markUnsaved);
  tb.querySelector('#codeBtn').onclick = ()=> openCodeModal(shell, focusPage, markUnsaved);

  tb.querySelector('#outlineBtn').onclick = ()=>{
    const panel = shell.querySelector('#outlinePanel');
    panel.classList.toggle('open');
    if(panel.classList.contains('open')) renderOutline(shell, page);
  };

  /* ---------- Export menu ---------- */
  const exportBtn = tb.querySelector('#docExportBtn');
  exportBtn.onclick = (e)=>{
    e.stopPropagation();
    const existing = shell.querySelector('.export-menu');
    if(existing){ existing.remove(); return; }
    const menu = document.createElement('div');
    menu.className = 'export-menu';
    const rect = exportBtn.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    menu.style.top = (rect.bottom - shellRect.top + 6) + 'px';
    menu.style.left = (rect.left - shellRect.left) + 'px';
    menu.innerHTML = `
      <button data-fmt="docx">&#128196; Word (.docx)</button>
      <button data-fmt="html">&#127760; HTML (.html)</button>
      <button data-fmt="md">&#128221; Markdown (.md)</button>
      <button data-fmt="txt">&#128203; Plain text (.txt)</button>
    `;
    shell.appendChild(menu);
    menu.querySelectorAll('button').forEach(b=>{
      b.onclick = async ()=>{
        menu.remove();
        await exportDocument(file, page, b.dataset.fmt);
      };
    });
    const closer = (ev)=>{ if(!menu.contains(ev.target)){ menu.remove(); document.removeEventListener('click', closer); } };
    setTimeout(()=>document.addEventListener('click', closer), 0);
  };

  shell.querySelector('#docPrintBtn').onclick = ()=>{
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(file.name)}</title>
      <style>body{font-family:Georgia,serif;max-width:780px;margin:30px auto;line-height:1.7;}
      table{border-collapse:collapse;}td{border:1px solid #ccc;padding:6px 10px;}
      blockquote{border-left:3px solid #f59e0b;padding-left:16px;color:#555;font-style:italic;}
      .dr-codebox{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px 16px;font-family:Consolas,monospace;font-size:13px;white-space:pre;}
      .dr-callout{display:flex;gap:10px;padding:12px 14px;border-radius:8px;background:#eff6ff;border:1px solid #3b82f6;}
      .dr-pagebreak{page-break-after:always;border:none;}
      img{max-width:100%;}</style></head><body>${page.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>{ w.focus(); w.print(); }, 300);
  };

  /* ---------- Find & replace (custom implementation, replaces window.find) ---------- */
  setupFindReplace(shell, page, markUnsaved);

  function updateToolbarState(){
    ['bold','italic','underline','strikeThrough','superscript','subscript','justifyLeft','justifyCenter','justifyRight','justifyFull','insertUnorderedList','insertOrderedList'].forEach(cmd=>{
      const btn = tb.querySelector(`.tbtn[data-cmd="${cmd}"]`);
      if(btn){
        try{ btn.setAttribute('aria-pressed', document.queryCommandState(cmd) ? 'true' : 'false'); }catch(e){}
      }
    });
  }
  page.onkeyup = (e)=>{ updateToolbarState(); updateStatusBar(); };
  page.onmouseup = ()=>{ updateToolbarState(); updateStatusBar(); };
  if(shell._drSelectionChangeHandler){
    document.removeEventListener('selectionchange', shell._drSelectionChangeHandler);
  }
  shell._drSelectionChangeHandler = ()=>{
    if(document.activeElement === page) updateToolbarState();
  };
  document.addEventListener('selectionchange', shell._drSelectionChangeHandler);

  page.onkeydown = (e)=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='b'){ e.preventDefault(); document.execCommand('bold'); markUnsaved(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='i'){ e.preventDefault(); document.execCommand('italic'); markUnsaved(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='u'){ e.preventDefault(); document.execCommand('underline'); markUnsaved(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='f'){ e.preventDefault(); shell.querySelector('#findBtn').click(); }
  };

  /* ---------- Status bar (word count etc.) ---------- */
  function updateStatusBar(){
    const text = page.innerText || '';
    const words = (text.trim().match(/\S+/g) || []).length;
    const chars = text.replace(/\n/g,'').length;
    const bar = shell.querySelector('#docStatusBar');
    bar.innerHTML = `
      <span>${words} word${words===1?'':'s'}</span>
      <span>${chars} character${chars===1?'':'s'}</span>
      <span class="zoom-ctrl">Zoom
        <select id="zoomSel">
          <option value="">100%</option>
          <option value="zoom-75">75%</option>
          <option value="zoom-90">90%</option>
          <option value="zoom-125">125%</option>
        </select>
      </span>
    `;
    const zoomSel = bar.querySelector('#zoomSel');
    zoomSel.value = page.dataset.zoom || '';
    zoomSel.onchange = ()=>{
      page.classList.remove('zoom-75','zoom-90','zoom-125');
      if(zoomSel.value) page.classList.add(zoomSel.value);
      page.dataset.zoom = zoomSel.value;
    };
  }
  updateStatusBar();
  updateToolbarState();

  if(isFirstMount) page.focus();
}

/* ---------------------------------------------------------------------
   Outline panel: lists H1/H2/H3 headings, click to scroll to them.
   ------------------------------------------------------------------- */
function renderOutline(shell, page){
  const list = shell.querySelector('#outlineList');
  const heads = Array.from(page.querySelectorAll('h1,h2,h3'));
  list.innerHTML = '';
  if(!heads.length){
    list.innerHTML = '<p style="font-size:12px;color:var(--text-muted);">No headings yet. Use the paragraph style menu to add Heading 1/2/3.</p>';
    return;
  }
  heads.forEach((h, i)=>{
    if(!h.id) h.id = 'dr-head-' + i + '-' + Date.now();
    const btn = document.createElement('button');
    btn.className = 'outline-item lvl' + h.tagName[1];
    btn.textContent = h.textContent || '(untitled heading)';
    btn.onclick = ()=> h.scrollIntoView({ behavior:'smooth', block:'center' });
    list.appendChild(btn);
  });
}

/* ---------------------------------------------------------------------
   Find & replace — robust custom implementation (no deprecated window.find)
   ------------------------------------------------------------------- */
function setupFindReplace(shell, page, markUnsaved){
  const findBar = shell.querySelector('#findBar');
  const findInput = shell.querySelector('#findInput');
  const replaceInput = shell.querySelector('#replaceInput');
  const countEl = shell.querySelector('#findCount');
  let matches = [];
  let currentIdx = -1;

  function clearHighlights(){
    page.querySelectorAll('.dr-hit').forEach(span=>{
      const parent = span.parentNode;
      while(span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    page.normalize();
  }

  function runSearch(){
    clearHighlights();
    matches = [];
    currentIdx = -1;
    const term = findInput.value;
    if(!term){ countEl.textContent = ''; return; }
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while((node = walker.nextNode())) textNodes.push(node);
    const lowerTerm = term.toLowerCase();
    textNodes.forEach(tn=>{
      const text = tn.nodeValue;
      const lower = text.toLowerCase();
      let idx = 0;
      let pos;
      const ranges = [];
      while((pos = lower.indexOf(lowerTerm, idx)) !== -1){
        ranges.push(pos);
        idx = pos + lowerTerm.length;
      }
      if(!ranges.length) return;
      let lastEnd = 0;
      const frag = document.createDocumentFragment();
      ranges.forEach(start=>{
        if(start > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, start)));
        const span = document.createElement('span');
        span.className = 'dr-hit';
        span.textContent = text.slice(start, start + term.length);
        frag.appendChild(span);
        matches.push(span);
        lastEnd = start + term.length;
      });
      if(lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
      tn.parentNode.replaceChild(frag, tn);
    });
    countEl.textContent = matches.length ? `1 / ${matches.length}` : 'No matches';
    if(matches.length){ currentIdx = 0; highlightCurrent(); }
  }

  function highlightCurrent(){
    matches.forEach(m=>m.classList.remove('dr-hit-current'));
    if(currentIdx >= 0 && matches[currentIdx]){
      matches[currentIdx].classList.add('dr-hit-current');
      matches[currentIdx].scrollIntoView({ behavior:'smooth', block:'center' });
      countEl.textContent = `${currentIdx+1} / ${matches.length}`;
    }
  }

  findInput.oninput = runSearch;
  shell.querySelector('#findNextBtn').onclick = ()=>{
    if(!matches.length){ runSearch(); return; }
    currentIdx = (currentIdx + 1) % matches.length;
    highlightCurrent();
  };
  shell.querySelector('#findPrevBtn').onclick = ()=>{
    if(!matches.length){ runSearch(); return; }
    currentIdx = (currentIdx - 1 + matches.length) % matches.length;
    highlightCurrent();
  };
  shell.querySelector('#replaceBtn').onclick = ()=>{
    if(currentIdx >= 0 && matches[currentIdx]){
      matches[currentIdx].replaceWith(document.createTextNode(replaceInput.value));
      page.normalize();
      markUnsaved();
      runSearch();
    }
  };
  shell.querySelector('#replaceAllBtn').onclick = ()=>{
    const term = findInput.value;
    if(!term) return;
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    clearHighlights();
    // Walk text nodes and replace within them directly to avoid corrupting tags
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let node;
    while((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(n=>{ n.nodeValue = n.nodeValue.replace(regex, replaceInput.value); });
    markUnsaved();
    matches = []; currentIdx = -1; countEl.textContent = '';
  };
  shell.querySelector('#findBtn').onclick = ()=>{
    findBar.classList.toggle('hidden');
    if(!findBar.classList.contains('hidden')) findInput.focus();
    else clearHighlights();
  };
  shell.querySelector('#findCloseBtn').onclick = ()=>{
    findBar.classList.add('hidden');
    clearHighlights();
  };
  findInput.onkeydown = (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); shell.querySelector(e.shiftKey ? '#findPrevBtn' : '#findNextBtn').click(); }
  };
}

/* ---------------------------------------------------------------------
   Math equation modal
   ------------------------------------------------------------------- */
function openMathModal(shell, focusPage, markUnsaved){
  const overlay = document.createElement('div');
  overlay.className = 'math-modal';
  overlay.innerHTML = `
    <div class="math-box">
      <h3>Insert equation</h3>
      <textarea id="mathSrc" placeholder="e.g. x^2 + y^2 = r^2   or   \\frac{a}{b} + \\sqrt{c}">x^{2} + y^{2} = r^{2}</textarea>
      <div class="math-preview" id="mathPreview"></div>
      <div class="math-hint">Supports ^{} superscript, _{} subscript, \\frac{a}{b}, \\sqrt{x}, and Greek/math symbols like \\alpha, \\pi, \\sum, \\leq, \\rightarrow.</div>
      <div class="modal-footer-row">
        <button class="btn" id="mathCancel">Cancel</button>
        <button class="btn btn-primary" id="mathInsert">Insert</button>
      </div>
    </div>
  `;
  shell.appendChild(overlay);
  const srcEl = overlay.querySelector('#mathSrc');
  const preview = overlay.querySelector('#mathPreview');
  function update(){ preview.innerHTML = `<span class="dr-math">${renderMathToHtml(srcEl.value)}</span>`; }
  srcEl.addEventListener('input', update);
  update();
  srcEl.focus();
  srcEl.select();
  overlay.querySelector('#mathCancel').onclick = ()=> overlay.remove();
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
  overlay.querySelector('#mathInsert').onclick = ()=>{
    focusPage();
    const html = `<span class="dr-math" contenteditable="false" data-math-src="${escapeHtmlAttr(srcEl.value)}">${renderMathToHtml(srcEl.value)}</span>&nbsp;`;
    document.execCommand('insertHTML', false, html);
    markUnsaved();
    overlay.remove();
  };
}

/* ---------------------------------------------------------------------
   Code block modal
   ------------------------------------------------------------------- */
function openCodeModal(shell, focusPage, markUnsaved){
  const overlay = document.createElement('div');
  overlay.className = 'codebox-modal';
  overlay.innerHTML = `
    <div class="codebox-box">
      <h3>Insert code block</h3>
      <div class="codebox-row">
        <select id="codeLang">
          <option>plaintext</option>
          <option>javascript</option>
          <option>python</option>
          <option>html</option>
          <option>css</option>
          <option>json</option>
          <option>bash</option>
          <option>sql</option>
          <option>java</option>
          <option>c++</option>
        </select>
      </div>
      <textarea id="codeSrc" placeholder="Paste or type code…" style="min-height:140px;"></textarea>
      <div class="modal-footer-row">
        <button class="btn" id="codeCancel">Cancel</button>
        <button class="btn btn-primary" id="codeInsert">Insert</button>
      </div>
    </div>
  `;
  shell.appendChild(overlay);
  overlay.querySelector('#codeSrc').focus();
  overlay.querySelector('#codeCancel').onclick = ()=> overlay.remove();
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
  overlay.querySelector('#codeInsert').onclick = ()=>{
    const lang = overlay.querySelector('#codeLang').value;
    const code = overlay.querySelector('#codeSrc').value;
    focusPage();
    const html = `<div class="dr-codebox" contenteditable="false" data-lang="${escapeHtmlAttr(lang)}"><span class="dr-codelang">${escapeHtmlAttr(lang)}</span><code>${escapeHtml(code)}</code></div><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    markUnsaved();
    overlay.remove();
  };
}

/* ---------------------------------------------------------------------
   Callout picker (small inline menu, not a full modal)
   ------------------------------------------------------------------- */
function openCalloutPicker(shell, onPick){
  const existing = shell.querySelector('.export-menu');
  if(existing) existing.remove();
  const menu = document.createElement('div');
  menu.className = 'export-menu';
  const calloutBtn = shell.querySelector('#calloutBtn');
  const rect = calloutBtn.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  menu.style.top = (rect.bottom - shellRect.top + 6) + 'px';
  menu.style.left = (rect.left - shellRect.left) + 'px';
  menu.innerHTML = `
    <button data-k="info">&#8505; Info note</button>
    <button data-k="warn">&#9888; Warning</button>
    <button data-k="success">&#9989; Success</button>
  `;
  shell.appendChild(menu);
  menu.querySelectorAll('button').forEach(b=>{
    b.onclick = ()=>{ menu.remove(); onPick(b.dataset.k); };
  });
  const closer = (ev)=>{ if(!menu.contains(ev.target)){ menu.remove(); document.removeEventListener('click', closer); } };
  setTimeout(()=>document.addEventListener('click', closer), 0);
}

/* ---------------------------------------------------------------------
   Emoji picker (small curated grid, no external dependency)
   ------------------------------------------------------------------- */
const EMOJI_SET = ['😀','😂','😍','🤔','😎','😢','🎉','👍','👎','❤️','🔥','✨','✅','❌','⭐','📌','📅','💡','🚀','📎','⚠️','🙏','👏','🎯','📝','💬','🔗','📷'];
function openEmojiPicker(shell, onPick){
  const existing = shell.querySelector('.export-menu');
  if(existing) existing.remove();
  const menu = document.createElement('div');
  menu.className = 'export-menu';
  menu.style.width = '200px';
  menu.style.display = 'grid';
  menu.style.gridTemplateColumns = 'repeat(6, 1fr)';
  menu.style.gap = '2px';
  const emojiBtn = shell.querySelector('#emojiBtn');
  const rect = emojiBtn.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  menu.style.top = (rect.bottom - shellRect.top + 6) + 'px';
  menu.style.left = (rect.left - shellRect.left) + 'px';
  EMOJI_SET.forEach(em=>{
    const b = document.createElement('button');
    b.textContent = em;
    b.style.fontSize = '17px';
    b.style.padding = '6px 0';
    b.onclick = ()=>{ menu.remove(); onPick(em); };
    menu.appendChild(b);
  });
  shell.appendChild(menu);
  const closer = (ev)=>{ if(!menu.contains(ev.target)){ menu.remove(); document.removeEventListener('click', closer); } };
  setTimeout(()=>document.addEventListener('click', closer), 0);
}

function escapeHtmlAttr(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ---------------------------------------------------------------------
   Export dispatcher
   ------------------------------------------------------------------- */
async function exportDocument(file, page, fmt){
  const name = file.name || 'document';
  if(fmt === 'html'){
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(name)}</title>
      <style>body{font-family:Georgia,serif;max-width:780px;margin:40px auto;line-height:1.7;padding:0 20px;}
      table{border-collapse:collapse;}td{border:1px solid #ccc;padding:6px 10px;}
      blockquote{border-left:3px solid #f59e0b;padding-left:16px;color:#555;font-style:italic;}
      .dr-codebox{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px 16px;font-family:Consolas,monospace;font-size:13px;white-space:pre;}
      .dr-callout{display:flex;gap:10px;padding:12px 14px;border-radius:8px;background:#eff6ff;border:1px solid #3b82f6;}
      </style></head><body>${page.innerHTML}</body></html>`], {type:'text/html'});
    downloadBlob(blob, name + '.html');
    return;
  }
  if(fmt === 'md'){
    const md = htmlToMarkdown(page);
    downloadBlob(new Blob([md], {type:'text/markdown'}), name + '.md');
    return;
  }
  if(fmt === 'txt'){
    downloadBlob(new Blob([page.innerText], {type:'text/plain'}), name + '.txt');
    return;
  }
  if(fmt === 'docx'){
    try{
      const blob = await buildDocxBlob(file, page);
      downloadBlob(blob, name + '.docx');
    }catch(e){
      console.error('DOCX export failed', e);
      alert('Could not export as Word document. Try the HTML export instead.');
    }
    return;
  }
}
