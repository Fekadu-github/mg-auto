// Service packages (Type A / B / C) and the "next service" suggestion. Pure functions: no database, easy to test (node --test).
import { fail } from './errors.js';
import { str, qn, partQty } from './rules.js';

// Starting packages, created once when the table is empty. The Service Advisor edits them on the Services screen
// (intervals, labour lines, parts). A part `code` that exists in the stock list is issued from stock; any other part is added as free text.
export const DEFAULT_SERVICES = [
  { code: 'A', name: 'Type A service', interval_km: 5000,
    labours: [{ desc: 'Engine oil & oil filter change', hours: 0.75, price: 0 }, { desc: 'Multi-point inspection', hours: 0.5, price: 0 }],
    parts: [{ code: 'TOIL-001', name: 'Engine Oil 15W-40', qty: 4, price: 0 }, { code: 'TFLT-001', name: 'Oil Filter', qty: 1, price: 0 }] },
  { code: 'B', name: 'Type B service', interval_km: 10000,
    labours: [{ desc: 'Engine oil & oil filter change', hours: 0.75, price: 0 }, { desc: 'Multi-point inspection', hours: 0.5, price: 0 },
      { desc: 'Air filter & cabin filter replacement', hours: 0.5, price: 0 }, { desc: 'Brake inspection & cleaning', hours: 0.75, price: 0 }],
    parts: [{ code: 'TOIL-001', name: 'Engine Oil 15W-40', qty: 4, price: 0 }, { code: 'TFLT-001', name: 'Oil Filter', qty: 1, price: 0 }] },
  { code: 'C', name: 'Type C service', interval_km: 20000,
    labours: [{ desc: 'Engine oil & oil filter change', hours: 0.75, price: 0 }, { desc: 'Multi-point inspection', hours: 0.5, price: 0 },
      { desc: 'Air filter & cabin filter replacement', hours: 0.5, price: 0 }, { desc: 'Brake inspection & cleaning', hours: 0.75, price: 0 },
      { desc: 'Spark plugs, brake fluid & coolant service', hours: 1.5, price: 0 }],
    parts: [{ code: 'TOIL-001', name: 'Engine Oil 15W-40', qty: 4, price: 0 }, { code: 'TFLT-001', name: 'Oil Filter', qty: 1, price: 0 }] }
];

// Clean what the Services screen sends. Blank lines are dropped.
export function normalizeService(b) {
  const name = str(b.name, 80);
  if (!name) fail(400, 'Give the service a name');
  const km = Math.round(+b.interval_km);
  if (!(km > 0 && km <= 1_000_000)) fail(400, 'Enter the service interval in km');
  const list = v => (Array.isArray(v) ? v.slice(0, 40) : []);
  const labours = list(b.labours).map(l => ({ desc: str(l.desc, 200), hours: Math.max(0, qn(l.hours) || 0), price: Math.max(0, qn(l.price) || 0) })).filter(l => l.desc);
  const parts = list(b.parts).map(p => ({ code: str(p.code, 40).toUpperCase(), name: str(p.name, 120), qty: partQty(p.qty), price: Math.max(0, qn(p.price) || 0) })).filter(p => p.code || p.name);
  if (!labours.length && !parts.length) fail(400, 'Add at least one labour or part line');
  return { name, interval_km: km, labours, parts };
}

// A visit counts as a service when a Type A / B / C package was added OR any labour line is in the Regular Service section
// (a service typed in as ordinary labour used to set nothing).
export const isServiceVisit = j => (j.services || []).length > 0 || (j.labours || []).some(l => l.section === 'Regular Service');

// ---- which service is next? ----
// types: [{ code, name, interval_km }]. A milestone such as 10 000 km belongs to the type with the largest interval that divides it
// (with A = 5 000, B = 10 000, C = 20 000: 5 000 -> A, 10 000 -> B, 15 000 -> A, 20 000 -> C).
const usable = types => (types || []).filter(t => t && t.interval_km > 0);

export function milestoneType(km, types) {
  return usable(types).filter(t => km % t.interval_km === 0).sort((a, b) => b.interval_km - a.interval_km)[0] || null;
}

// The next milestone strictly above `km`: used after a service is completed.
export function nextService(km, types) {
  const ts = usable(types);
  if (!ts.length || !Number.isFinite(+km) || +km < 0) return null;
  const at = Math.min(...ts.map(t => (Math.floor(km / t.interval_km) + 1) * t.interval_km)), t = milestoneType(at, ts);
  return { km: at, code: t.code, name: t.name };
}

// The milestone closest to `km` (ties go to the later one): used for a vehicle that has no history yet.
export function nearestService(km, types) {
  const ts = usable(types);
  if (!ts.length || !Number.isFinite(+km) || +km < 0) return null;
  const near = ts.flatMap(t => [Math.floor(km / t.interval_km) * t.interval_km, Math.ceil(km / t.interval_km) * t.interval_km]).filter(x => x > 0)
    .sort((a, b) => Math.abs(a - km) - Math.abs(b - km) || b - a)[0];
  if (!near) return nextService(km, ts);
  const t = milestoneType(near, ts);
  return { km: near, code: t.code, name: t.name };
}

// Starting labour task list, created once when the list is empty. Hours and prices are examples: edit them on the Labour list screen.
// BP = Body & Paints, ME = Mechanical Repairs.
export const DEFAULT_LABOUR = [
  { section: 'Body & Paints', name: 'Panel beating', hours: 3, price: 0 },
  { section: 'Body & Paints', name: 'Respray panel', hours: 4, price: 0 },
  { section: 'Body & Paints', name: 'Bumper repair & paint', hours: 3, price: 0 },
  { section: 'Body & Paints', name: 'Polish & finish', hours: 1.5, price: 0 },
  { section: 'Mechanical Repairs', name: 'Brake pad replacement', hours: 1.5, price: 0 },
  { section: 'Mechanical Repairs', name: 'Shock absorber replacement', hours: 2, price: 0 },
  { section: 'Mechanical Repairs', name: 'Engine diagnosis', hours: 1, price: 0 },
  { section: 'Mechanical Repairs', name: 'Clutch replacement', hours: 6, price: 0 }
];

export function normalizeTask(b, sections) {
  const name = str(b.name, 200);
  if (!name) fail(400, 'Describe the task');
  return { name, section: sections.includes(b.section) ? b.section : sections[0], hours: Math.max(0, qn(b.hours) || 0), price: Math.max(0, qn(b.price) || 0), active: b.active === false || b.active === 0 ? 0 : 1 };
}
