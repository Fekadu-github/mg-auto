// The user-defined report: the server sends flat rows and the column list of a source; the manager picks the columns, a filter, a sort and an optional grouping.
// Plain functions (no React) so they are easy to test.
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const OPS = [['contains', 'contains'], ['=', 'is'], ['>', 'is more than'], ['<', 'is less than']];

const text = v => String(v ?? '').toLowerCase();
export function matches(row, filter, columns) {
  if (!filter || filter.value === '' || filter.value === undefined) return true;
  const cols = filter.col ? [filter.col] : columns.map(c => c.key);
  const want = String(filter.value).trim();
  return cols.some(k => {
    const v = row[k];
    if (filter.op === '>' || filter.op === '<') { const a = Number(v), b = Number(want); return Number.isFinite(a) && Number.isFinite(b) && (filter.op === '>' ? a > b : a < b); }
    if (filter.op === '=') return text(v) === text(want);
    return text(v).includes(text(want));
  });
}

const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : text(a) < text(b) ? -1 : text(a) > text(b) ? 1 : 0);

/** rows: [{ key: value }]; columns: [{ key, label, type }] (the source); pick: keys to show. Returns { head: [label], keys, rows: [[value]], numeric: [bool] }. */
export function buildReport(rows, columns, { pick, filter, sort, dir = 'asc', group } = {}) {
  const all = columns, show = all.filter(c => !pick || pick.includes(c.key));
  let data = rows.filter(r => matches(r, filter, all));
  if (group) {
    const by = new Map();
    for (const r of data) { const k = String(r[group] ?? ''); const o = by.get(k) || { key: k, n: 0, sums: {} }; o.n++; for (const c of show) if (c.type === 'num' && c.key !== group) o.sums[c.key] = r2((o.sums[c.key] || 0) + (Number(r[c.key]) || 0)); by.set(k, o); }
    const nums = show.filter(c => c.type === 'num' && c.key !== group), gc = all.find(c => c.key === group);
    let out = [...by.values()].map(o => [o.key || '(empty)', o.n, ...nums.map(c => o.sums[c.key] || 0)]);
    const head = [gc?.label || group, 'Count', ...nums.map(c => `Total ${c.label.toLowerCase()}`)];
    if (sort) { const i = head.indexOf(sort === group ? head[0] : `Total ${(all.find(c => c.key === sort)?.label || '').toLowerCase()}`); if (i >= 0) out = out.sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[i], b[i])); }
    return { head, keys: [group, '#count', ...nums.map(c => c.key)], rows: out, numeric: head.map((_, i) => i > 0), grouped: true };
  }
  if (sort) data = [...data].sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[sort], b[sort]));
  return { head: show.map(c => c.label), keys: show.map(c => c.key), rows: data.map(r => show.map(c => r[c.key] ?? '')), numeric: show.map(c => c.type === 'num'), grouped: false };
}
