// A labour "task" is a group of lines (imported from the Excel sheet, one row per line). Searching a task by its name and picking it adds all its lines.
// Lines without a task are single stand-alone tasks and keep working as before (picked one by one).
import { rateOf } from './format.js';

const key = s => (s || '').trim().toLowerCase();
const r2 = n => Math.round(n * 100) / 100;

// [{ name, items: [task lines] }] for every task that has a name and more than one line or an explicit task name
export const groupTasks = tasks => {
  const map = new Map();
  for (const t of tasks || []) {
    if (!t.task) continue;
    const k = key(t.task);
    if (!map.has(k)) map.set(k, { name: t.task, items: [] });
    map.get(k).items.push(t);
  }
  return [...map.values()];
};

// The registered service types (Type A, B, C ...) as task groups of the "Regular Service" section: pick one and all its labour lines are added
export const serviceGroups = types => (types || []).filter(t => t.active !== false && t.active !== 0 && (t.labours || []).length).map(t => ({
  name: t.name, code: t.code, service: true,
  items: t.labours.map(l => ({ name: l.desc, section: 'Regular Service', hours: l.hours, price: l.price }))
}));

export const groupHours = g => r2(g.items.reduce((a, t) => a + (+t.hours || 0), 0));
export const groupCost = (g, rate) => r2(g.items.reduce((a, t) => a + (+t.price || (+t.hours || 0) * rateOf(rate, t.section)), 0));
export const groupLabel = g => `▤ ${g.name} (${g.items.length} line${g.items.length === 1 ? '' : 's'})`;
export const matchGroup = (groups, text) => (key(text) ? groups.find(g => key(groupLabel(g)) === key(text)) : undefined);

// The lines a group adds: the description shows the task and the line ("Front bumper repair: Paint bumper"); the cost is the sheet's total cost, or hours x the section's rate
export const groupLines = (g, rate) => g.items.map(t => ({
  desc: key(t.name) === key(g.name) ? t.name : `${g.name}: ${t.name}`,
  section: t.section, hours: t.hours || '', price: t.price || r2((+t.hours || 0) * rateOf(rate, t.section)) || ''
}));

// Limit the labour list to the vehicle's make. The price book names a model group per line ("Suzuki", "Toyota (SEDAN)", "Others"):
// a Toyota shows the lines of every "Toyota ..." group; a make with no group of its own (for example MG) shows the "Others" lines.
// Lines without any model group are general and always show. No brand = nothing is hidden.
export function tasksForVehicle(tasks, brand) {
  const b = key(brand);
  if (!b) return tasks || [];
  const base = g => key(g).replace(/\(.*?\)/g, '').trim();   // "toyota (sedan)" -> "toyota"
  const own = t => { const g = key(t.model_grp), s = base(t.model_grp); return !!g && (g.includes(b) || (!!s && b.includes(s))); };
  const hasOwn = (tasks || []).some(own);
  return (tasks || []).filter(t => !key(t.model_grp) || own(t) || (!hasOwn && /^others?$/.test(key(t.model_grp))));
}
