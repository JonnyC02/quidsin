import { describe, expect, it } from 'vitest';
import { monthlyEquivalentMinorUnits } from '../domain/calculations/monthly-equivalent.js';

describe('monthlyEquivalentMinorUnits', () => {
  it('passes monthly amounts through unchanged', () => {
    expect(monthlyEquivalentMinorUnits(150_00, 'monthly')).toBe(150_00);
  });

  it('computes weekly as amount * 52 / 12', () => {
    // 100.00 * 52 / 12 = 433.33333... -> rounds to 433.33
    expect(monthlyEquivalentMinorUnits(100_00, 'weekly')).toBe(43_333);
  });

  it('computes fortnightly as amount * 26 / 12', () => {
    expect(monthlyEquivalentMinorUnits(100_00, 'fortnightly')).toBe(21_667);
  });

  it('computes quarterly as amount / 3', () => {
    expect(monthlyEquivalentMinorUnits(300_00, 'quarterly')).toBe(100_00);
  });

  it('computes annually as amount / 12', () => {
    expect(monthlyEquivalentMinorUnits(1200_00, 'annually')).toBe(100_00);
  });

  it('rounds half-up at the minor-unit boundary', () => {
    // 1.00 / 3 = 0.333... minor units -> 33.33... -> rounds to 33
    expect(monthlyEquivalentMinorUnits(100, 'quarterly')).toBe(33);
  });
});
