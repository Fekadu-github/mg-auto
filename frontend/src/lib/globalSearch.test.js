import { describe, expect, it } from 'vitest';
import { matchPages, searchEverything } from './globalSearch.js';

const db = {
  c: [{ id: 'C-1', name: 'Abebe Kebede', phone: '0911223344' }, { id: 'C-2', name: 'Sara Tesfaye', phone: '+251 980 766 566' }],
  v: [{ id: 'v1', cid: 'C-1', plate: 'AA 12345', vin: 'JTD123', brand: 'Toyota', model: 'Corolla' }, { id: 'v2', cid: 'C-2', plate: 'B-7788', brand: 'BYD', model: 'Dolphin' }],
  j: [{ id: 'JC-0001', cid: 'C-1', vid: 'v1', status: 'Created' }, { id: 'JC-0002', cid: 'C-2', vid: 'v2', status: 'Closed', claim_no: 'CL-9' }],
  p: [{ id: 1, code: 'TBRK-001', name: 'Brake Pad Set', stock: 2, reorder: 3 }]
};
const keys = (text, me) => searchEverything({ db, text, me }).map(g => g.key);
describe('searchEverything', () => {
  it('finds a job card by number and by plate typed with or without spaces', () => {
    expect(searchEverything({ db, text: 'jc-0002' })[0].items[0].id).toBe('JC-0002');
    expect(searchEverything({ db, text: 'aa12345' }).find(g => g.key === 'job').items[0].id).toBe('JC-0001');
  });
  it('finds a customer by phone in any written form', () => {
    for (const t of ['0980766566', '980766566', '+251980766566', '766566']) expect(searchEverything({ db, text: t }).find(g => g.key === 'customer').items[0].id).toBe('C-2');
  });
  it('finds a customer by part of the name and a vehicle by VIN or model', () => {
    expect(searchEverything({ db, text: 'kebe' }).find(g => g.key === 'customer').items[0].id).toBe('C-1');
    expect(searchEverything({ db, text: 'jtd1' }).find(g => g.key === 'vehicle').items[0].id).toBe('v1');
    expect(searchEverything({ db, text: 'dolphin' }).find(g => g.key === 'vehicle').items[0].cid).toBe('C-2');
  });
  it('needs every typed word to match, and shows nothing for an empty box', () => {
    expect(keys('abebe zzz')).toEqual([]);
    expect(keys('   ')).toEqual([]);
  });
  it('finds parts, but not for a technician', () => {
    expect(keys('brake')).toContain('part');
    expect(keys('brake', { role: 'TECH' })).not.toContain('part');
  });
});
describe('matchPages', () => {
  it('jumps to a screen by its name', () => {
    const pages = [['pos', 'Point of sale'], ['inv', 'Parts stock'], ['rep', 'Reports']];
    expect(matchPages(pages, 'parts').map(p => p.id)).toEqual(['inv']);
    expect(matchPages(pages, 'pos').map(p => p.id)).toEqual(['pos']);
  });
});
