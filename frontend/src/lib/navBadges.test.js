import { describe, expect, it } from 'vitest';
import { navBadges } from './navBadges.js';

const db = { j: [{ status: 'At workshop' }, { status: 'Dispatched' }, { status: 'Work done' }, { status: 'Created', price_reqs: [{ status: 'Requested' }] }], p: [{ stock: 1, reorder: 2 }, { stock: 9, reorder: 2 }] };
describe('navBadges', () => {
  it('counts what waits for a manager', () => { expect(navBadges(db, { role: 'MGR' })).toEqual({ shop: 2, jobs: 2, inv: 1 }); });
  it('shows a technician only the workshop number', () => { expect(navBadges(db, { role: 'TECH' })).toEqual({ shop: 2 }); });
  it('shows nothing when nothing waits', () => { expect(navBadges({ j: [], p: [] }, { role: 'SA' })).toEqual({}); });
});
describe('navBadges service due', () => {
  it('counts vehicles that are due for service, for a sales advisor but not a technician', () => {
    const d = { j: [], p: [], v: [{ id: 'V', mileage: 10200, next_km: 10000 }, { id: 'W', mileage: 100, next_km: 10000 }], c: [], st: [] };
    expect(navBadges(d, { role: 'SA' }).due).toBe(1);
    expect(navBadges(d, { role: 'TECH' }).due).toBeUndefined();
  });
});
