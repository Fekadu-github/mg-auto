import { describe, expect, it } from 'vitest';
import { milestoneType, nearestService, suggestService } from './services.js';
import { km, matchPart } from './format.js';

const TYPES = [{ code: 'A', name: 'Type A service', interval_km: 5000 }, { code: 'B', name: 'Type B service', interval_km: 10000 }, { code: 'C', name: 'Type C service', interval_km: 20000 }];

describe('next service', () => {
  it('names a milestone after the largest interval that divides it', () => {
    expect([5000, 10000, 15000, 20000, 25000].map(k => milestoneType(k, TYPES).code)).toEqual(['A', 'B', 'A', 'C', 'A']);
    expect(milestoneType(7000, TYPES)).toBeNull();
  });
  it('suggests the closest milestone for a vehicle with no history', () => {
    expect([0, 4800, 5200, 7600, 19000].map(k => nearestService(k, TYPES).km)).toEqual([5000, 5000, 5000, 10000, 20000]);
    expect(nearestService(-1, TYPES)).toBeNull();
  });
  it('prefers the service planned at the last completed service', () => {
    expect(suggestService({ next_km: 10000, next_type: 'B' }, 5200, TYPES)).toMatchObject({ km: 10000, code: 'B', planned: true });
    expect(suggestService({}, 5200, TYPES).code).toBe('A');
    expect(suggestService({ next_km: 1, next_type: 'Z' }, 9800, TYPES).code).toBe('B');   // an unknown planned type is ignored
  });
});

describe('helpers', () => {
  it('formats mileage', () => { expect(km(12345)).toBe('12,345 km'); expect(km(null)).toBe(''); expect(km(0)).toBe('0 km'); });
  it('finds the stock part a typed text points to', () => {
    const stock = [{ id: 1, code: 'OIL-001', name: 'Engine Oil' }];
    expect(matchPart(stock, 'oil-001').id).toBe(1);
    expect(matchPart(stock, 'OIL-001 · Engine Oil').id).toBe(1);
    expect(matchPart(stock, 'oil')).toBeUndefined();
    expect(matchPart(stock, '')).toBeUndefined();
  });
});
