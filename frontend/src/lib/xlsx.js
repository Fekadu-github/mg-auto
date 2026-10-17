// Read and write .xlsx files with nothing but the browser's own zip support (no library to install).
//   readXlsx(arrayBuffer)  -> Promise<rows>   the first sheet as an array of rows, each an array of cell values (text or number)
//   writeXlsx(rows, name)  -> Uint8Array      one sheet; the first row is bold
// An .xlsx file is a zip of small XML files. Reading uses DecompressionStream; writing stores the files without compression.

const enc = new TextEncoder(), dec = new TextDecoder();

// ---------- zip ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(files) {   // files: [[name, string]]
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);   // version, UTF-8 names, stored
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);                                                              // time 0:00, date 1980-01-01
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

async function inflate(data) {
  const ds = new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
}

// the files of a zip: Map(name -> () => Promise<string>)
function unzip(buf) {
  const b = new Uint8Array(buf), v = new DataView(buf instanceof ArrayBuffer ? buf : b.buffer, b.byteOffset, b.byteLength);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This is not an Excel (.xlsx) file.');
  const n = v.getUint16(e + 10, true), files = new Map();
  let p = v.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The Excel file is damaged.');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    files.set(name, async () => {
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), raw = b.subarray(start, start + csize);
      if (method === 0) return dec.decode(raw);
      if (method === 8) return dec.decode(await inflate(raw));
      throw new Error('The Excel file uses a compression this app cannot read.');
    });
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

// ---------- xml helpers ----------
const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => {
  const k = g.toLowerCase();
  if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'quot') return '"'; if (k === 'apos') return "'";
  return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const texts = x => [...x.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => unesc(m[1])).join('');
const colNo = ref => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// ---------- read ----------
export async function readXlsx(buf) {
  const files = unzip(buf), get = async n => (files.has(n) ? files.get(n)() : '');
  // which file is the first sheet: workbook.xml names it, workbook.xml.rels says where it is
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await get('xl/workbook.xml'), rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  if (rid) {
    const rel = [...(await get('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => new RegExp(`\\bId="${rid}"`).test(r));
    const target = rel && /\bTarget="([^"]+)"/.exec(rel)?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  }
  if (!files.has(sheetPath)) throw new Error('The Excel file has no sheet to read.');
  const shared = [...(await get('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const sheet = await get(sheetPath), rows = [];
  let nextRow = 0;
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rn = /\br="(\d+)"/.exec(rm[1])?.[1], ri = rn ? +rn - 1 : nextRow;
    nextRow = ri + 1;
    if (ri > 50000) throw new Error('The sheet has too many rows (the limit is 50,000).');
    const row = rows[ri] = rows[ri] || [];
    let nextCol = 0;
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cm[1])?.[1], ci = ref ? colNo(ref) : nextCol, t = /\bt="([^"]+)"/.exec(cm[1])?.[1];
      nextCol = ci + 1;
      const body = cm[2] || '', v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val;
      if (t === 'inlineStr') val = texts(body);
      else if (v === undefined) val = '';
      else if (t === 's') val = shared[+v] ?? '';
      else if (t === 'str' || t === 'e') val = unesc(v);
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else val = v === '' || isNaN(+v) ? unesc(v) : +v;
      if (ci < 200) row[ci] = val;
    }
  }
  return Array.from(rows, r => Array.from(r || [], c => c ?? ''));    // fill the gaps
}

// First row = headers. Rows below become objects keyed by the header text; empty rows are dropped.
export const rowsToObjects = rows => {
  const [head = [], ...body] = rows;
  return body.filter(r => r.some(c => String(c).trim() !== '')).map(r => Object.fromEntries(head.map((h, i) => [String(h).trim(), r[i] ?? '']).filter(([h]) => h)));
};

// ---------- write ----------
export function writeXlsx(rows, sheetName = 'Sheet1') {
  const widths = [];
  rows.forEach(r => r.forEach((c, i) => { widths[i] = Math.min(60, Math.max(widths[i] || 8, String(c ?? '').length + 2)); }));
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + cols + '<sheetData>' +
    rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => {
      const ref = colName(ci) + (ri + 1), style = ri === 0 ? ' s="1"' : '';
      if (c === null || c === undefined || c === '') return '';
      return typeof c === 'number' && Number.isFinite(c) ? `<c r="${ref}"${style}><v>${c}</v></c>` : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
    }).join('') + '</row>').join('') + '</sheetData></worksheet>';
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', NS = 'http://schemas.openxmlformats.org/';
  return zip([
    ['[Content_Types].xml', `${X}<Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${X}<Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${X}<workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${NS}officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${X}<Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${X}<styleSheet xmlns="${NS}spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', sheet]
  ]);
}

// Browser: hand the file to the person
export function downloadXlsx(name, rows, sheetName) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([writeXlsx(rows, sheetName)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
