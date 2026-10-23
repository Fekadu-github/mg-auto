import { describe, expect, it } from 'vitest';
import { boardColumns, isDueToday, isOverdue, isUrgent } from './jobFlags.js';

const T = '2026-10-23';
describe('job flags', () => {
  it('is overdue only while the card is still open', () => {
    expect(isOverdue({ status: 'At workshop', due_date: '2026-10-20' }, T)).toBe(true);
    expect(isOverdue({ status: 'At workshop', due_date: '2026-10-23T00:00:00.000Z' }, T)).toBe(false);
    expect(isOverdue({ status: 'Closed', due_date: '2026-10-01' }, T)).toBe(false);
    expect(isOverdue({ status: 'Created' }, T)).toBe(false);
    expect(isDueToday({ status: 'Created', due_date: '2026-10-23' }, T)).toBe(true);
  });
  it('reads the priority words', () => { expect(isUrgent({ priority: 'Urgent' })).toBe(true); expect(isUrgent({ priority: 'Normal' })).toBe(false); });
  it('puts overdue, then urgent, then the earliest due date first in a column', () => {
    const jobs = [{ id: 'a', status: 'Created', due_date: '2026-11-01' }, { id: 'b', status: 'Created', priority: 'Urgent' }, { id: 'c', status: 'Created', due_date: '2026-10-01' }, { id: 'd', status: 'Closed' }];
    const col = boardColumns(jobs, T);
    expect(col.find(c => c.status === 'Created').jobs.map(j => j.id)).toEqual(['c', 'b', 'a']);
    expect(col.find(c => c.status === 'Closed').jobs.map(j => j.id)).toEqual(['d']);
  });
});
