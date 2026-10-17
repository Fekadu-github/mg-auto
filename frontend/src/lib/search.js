// Search the stock list by typing: the part number, or any words of the description, in any order. "brake pad t" finds "TBRK-001 Brake Pad Set".
// Part numbers that start with the typed text come first, then part numbers that contain it, then descriptions.
export function searchParts(stock, text, limit = 8) {
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const p of stock || []) {
    const code = String(p.code || '').toLowerCase(), name = String(p.name || '').toLowerCase(), hay = code + ' ' + name;
    if (!words.every(w => hay.includes(w))) continue;
    const rank = code === words[0] ? 0 : code.startsWith(words[0]) ? 1 : code.includes(words[0]) ? 2 : name.startsWith(words[0]) ? 3 : 4;
    hits.push([rank, code, p]);
  }
  return hits.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).slice(0, limit).map(h => h[2]);
}
