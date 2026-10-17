// Next-service suggestion. Same arithmetic as backend/services.js (that copy decides what is saved; this one only decides what is shown).
// types: [{ code, name, interval_km }]. A milestone such as 10 000 km belongs to the type with the largest interval that divides it
// (A = 5 000, B = 10 000, C = 20 000: 5 000 -> A, 10 000 -> B, 15 000 -> A, 20 000 -> C).
const usable = types => (types || []).filter(t => t && t.interval_km > 0);

export function milestoneType(km, types) {
  return usable(types).filter(t => km % t.interval_km === 0).sort((a, b) => b.interval_km - a.interval_km)[0] || null;
}

// The milestone closest to `km` (ties go to the later one): for a vehicle with no service history yet
export function nearestService(km, types) {
  const ts = usable(types);
  if (!ts.length || !Number.isFinite(+km) || +km < 0) return null;
  const c = ts.flatMap(t => [Math.floor(km / t.interval_km) * t.interval_km, Math.ceil(km / t.interval_km) * t.interval_km]).filter(x => x > 0)
    .sort((a, b) => Math.abs(a - km) - Math.abs(b - km) || b - a)[0];
  const at = c || Math.min(...ts.map(t => t.interval_km)), t = milestoneType(at, ts);
  return { km: at, code: t.code, name: t.name };
}

// What to suggest on a job card: the next service planned for the vehicle when the last completed service set one,
// otherwise the milestone closest to the mileage on the card.
export function suggestService(vehicle, mileage, types) {
  const planned = vehicle?.next_km && vehicle?.next_type && (types || []).find(t => t.code === vehicle.next_type);
  if (planned) return { km: vehicle.next_km, code: planned.code, name: planned.name, planned: true };
  return nearestService(mileage, types);
}
