import { describe, expect, it } from 'vitest';
import { clockedIn, serviceDue, sparkPoints } from './insight.js';

const db = { c: [{ id: 'C1', name: 'Abel' }], st: [{ code: 'A', name: 'Type A' }], v: [
  { id: 'V1', cid: 'C1', plate: 'AA1', mileage: 10500, next_km: 10000, next_type: 'A' },
  { id: 'V2', cid: 'C1', plate: 'AA2', mileage: 9500, next_km: 10000, next_type: 'A' },
  { id: 'V3', cid: 'C1', plate: 'AA3', mileage: 5000, next_km: 10000 },
  { id: 'V4', cid: 'C1', plate: 'AA4', mileage: null, next_km: 10000 },
  { id: 'V5', cid: 'C1', plate: 'AA5', mileage: 3000 }] };
describe('serviceDue', () => {
  it('lists overdue and soon vehicles, most overdue first, and skips the rest', () => {
    const r = serviceDue(db);
    expect(r.map(x => [x.v.id, x.level, x.left])).toEqual([['V1', 'over', -500], ['V2', 'soon', 500]]);
    expect(r[0].what).toBe('Type A'); expect(r[0].c.name).toBe('Abel');
  });
});
describe('clockedIn', () => {
  it('names the technician and the job card', () => {
    const jobs = [{ id: 'JC-1', labours: [{ desc: 'Brakes', run: 1 }, { desc: 'Oil' }] }];
    expect(clockedIn(jobs, l => (l.run ? { tech: 'Sami', in: 5 } : null))).toEqual([{ tech: 'Sami', job: 'JC-1', work: 'Brakes', since: 5 }]);
  });
});
describe('sparkPoints', () => {
  it('draws the lowest value at the bottom and the highest at the top', () => {
    expect(sparkPoints([0, 10], 100, 20, 0)).toBe('0,20 100,0');
    expect(sparkPoints([], 100, 20)).toBe('');
  });
});
