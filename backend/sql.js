// Split a .sql file into single statements: drops `--` comments, splits on `;` at the end of a line.
export function splitSql(text) {
  const clean = text.split('\n').map(l => l.replace(/(^|\s)--.*$/, '')).join('\n');
  return clean.split(/;[ \t]*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
}

// The users table was first created without the Manager role. Older databases need the role added (appended last, so no row changes).
export const ROLE_ENUM = "ENUM('SA','WS','TECH','ADMIN','MGR')";
export const lacksManagerRole = columnType => !/'MGR'/.test(String(columnType || ''));
