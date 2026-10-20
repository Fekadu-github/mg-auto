import { describe, expect, it } from 'vitest';
import { groupHours, groupLabel, groupLines, groupTasks, matchGroup, tasksForVehicle } from './labourGroups.js';

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

describe('tasksForVehicle', () => {
  const t = (name, model_grp) => ({ name, model_grp, section: 'Body & Paints' });
  const list = [t('a', 'Suzuki'), t('b', 'Toyota (SEDAN)'), t('c', 'Toyota (SUV)'), t('d', 'Others'), t('e', '')];
  const names = xs => xs.map(x => x.name).join('');
  it('shows only the make of the vehicle plus the general lines', () => {
    expect(names(tasksForVehicle(list, 'Suzuki'))).toBe('ae');
    expect(names(tasksForVehicle(list, 'toyota'))).toBe('bce');
    expect(names(tasksForVehicle(list, 'Toyota Corolla'))).toBe('bce');
  });
  it('a make without its own group uses the Others lines', () => { expect(names(tasksForVehicle(list, 'MG'))).toBe('de'); });
  it('no brand hides nothing', () => { expect(tasksForVehicle(list, '')).toHaveLength(5); expect(tasksForVehicle(list, undefined)).toHaveLength(5); });
});
