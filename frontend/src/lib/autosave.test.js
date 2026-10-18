// A copy kept on this PC must not hide a newer version saved from another PC.
import { beforeEach, describe, expect, it } from 'vitest';
import { restoreDraft } from './autosave.js';

const KEY = id => 'mg-draft:' + id;   // see autosave.js: the storage key of a draft
beforeEach(() => localStorage.clear());

describe('restoreDraft', () => {
  const fromServer = { note: 'server' };
  it('opens the server copy when there is no local copy', () => {
    expect(restoreDraft('pro:1', fromServer)).toEqual({ value: fromServer, restored: false });
  });
  it('restores a local copy that is newer than the server copy', () => {
    localStorage.setItem(KEY('pro:1'), JSON.stringify({ v: { note: 'typed' }, t: 2000 }));
    expect(restoreDraft('pro:1', fromServer, 1000)).toEqual({ value: { note: 'typed' }, restored: true });
  });
  it('drops a local copy older than the server copy', () => {
    localStorage.setItem(KEY('pro:1'), JSON.stringify({ v: { note: 'old' }, t: 1000 }));
    const r = restoreDraft('pro:1', fromServer, 2000);
    expect(r.value).toBe(fromServer); expect(r.restored).toBe(false); expect(r.replaced).toBe(true);
    expect(localStorage.getItem(KEY('pro:1'))).toBe(null);
  });
});
