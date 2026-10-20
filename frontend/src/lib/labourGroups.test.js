import { describe, expect, it } from 'vitest';
import { groupHours, groupLabel, groupLines, groupTasks, matchGroup } from './labourGroups.js';

const tasks = [
  { task: 'Bumper', name: 'Remove', section: 'Body & Paints', hours: 1.5, price: 600 },
  { task: 'Bumper', name: 'Paint', section: 'Body & Paints', hours: 3, price: 0 },
  { task: '', name: 'Solo', section: 'Mechanical Repairs', hours: 1, price: 0 }
];

describe('labour task groups', () => {
  const g = groupTasks(tasks);
  it('groups lines by task and leaves stand-alone lines out', () => { expect(g).toHaveLength(1); expect(groupHours(g[0])).toBe(4.5); });
  it('finds a group by its label', () => expect(matchGroup(g, groupLabel(g[0]))?.name).toBe('Bumper'));
  it('adds every line, priced by the sheet or hours x rate', () => {
    const l = groupLines(g[0], { default: 350 });
    expect(l.map(x => x.price)).toEqual([600, 1050]);
    expect(l[0].desc).toBe('Bumper: Remove');
  });
});
