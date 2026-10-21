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

// Find a finalized estimate by typing: one letter is enough. "e" lists every EST number, "12" finds EST-0012, and words of the damage note,
// the customer's name or the plate work too ("toy 12" finds the Toyota's estimate whose number holds 12). Number matches come first, then newest first.
// `who(e)` gives the extra text to search (customer name and plate).
export function searchEstimates(list, text, who = () => '', limit = 8) {
  const toks = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const words = s => s.split(/[^a-z0-9]+/).filter(Boolean);
  const out = [];
  (list || []).forEach((e, idx) => {
    const id = String(e.id).toLowerCase(), other = `${who(e) || ''} ${e.note || ''}`.toLowerCase(), ow = words(other);
    let score = 0;
    for (const t of toks) {
      const s = id.startsWith(t) ? 100 : id.replace(/^est-0*/, '').startsWith(t) ? 90 : id.includes(t) ? 60 : ow.some(w => w.startsWith(t)) ? 40 : t.length > 2 && other.includes(t) ? 20 : 0;
      if (!s) return;
      score += s;
    }
    out.push([score, idx, e]);
  });
  return out.sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, limit).map(x => x[2]);
}

// Find a customer by typing: one letter is enough. Matches the start of the name (or any word of it), the customer number, the phone, or a plate / brand / model of his vehicles.
export function searchCustomers(customers, vehicles, text, limit = 8) {
  const toks = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const words = s => s.split(/[^a-z0-9]+/).filter(Boolean);
  const cars = new Map();
  for (const v of vehicles || []) cars.set(v.cid, `${cars.get(v.cid) || ''} ${v.plate || ''} ${v.brand || ''} ${v.model || ''}`.toLowerCase());
  const out = [];
  (customers || []).forEach((c, idx) => {
    const name = String(c.name || '').toLowerCase(), id = String(c.id).toLowerCase(), phone = String(c.phone || '').replace(/\s+/g, ''), car = cars.get(c.id) || '', cw = words(car);
    let score = 0;
    for (const t of toks) {
      const s = name.startsWith(t) ? 100 : words(name).some(w => w.startsWith(t)) ? 80 : id.includes(t) ? 60 : t.length > 1 && phone.includes(t) ? 50 : cw.some(w => w.startsWith(t)) || (t.length > 1 && car.includes(t)) ? 40 : 0;
      if (!s) return;
      score += s;
    }
    out.push([score, name, idx, c]);
  });
  return out.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2])).slice(0, limit).map(x => x[3]);
}
