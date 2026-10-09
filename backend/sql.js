// Split a .sql file into single statements: drops `--` comments, splits on `;` at the end of a line.
export function splitSql(text) {
  const clean = text.split('\n').map(l => l.replace(/(^|\s)--.*$/, '')).join('\n');
  return clean.split(/;[ \t]*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
}
