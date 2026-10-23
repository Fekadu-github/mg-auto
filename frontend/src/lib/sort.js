// Click a column title: A→Z, then Z→A, then back to the original order. Numbers sort as numbers ("2" before "10"), empty cells go last.
const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const nextSort = (cur, key) => (cur?.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null);
export function sortRows(rows, sort, get = (r, k) => r[k]) {
  if (!sort?.key) return rows;
  const sign = sort.dir === 'desc' ? -1 : 1, empty = v => v === null || v === undefined || v === '';
  return rows.map((r, i) => [r, i, get(r, sort.key)]).sort((a, b) => {
    if (empty(a[2]) !== empty(b[2])) return empty(a[2]) ? 1 : -1;               // empty last, whatever the direction
    if (empty(a[2])) return a[1] - b[1];
    const x = a[2], y = b[2], c = typeof x === 'number' && typeof y === 'number' ? x - y : coll.compare(String(x), String(y));
    return c ? c * sign : a[1] - b[1];
  }).map(x => x[0]);
}
