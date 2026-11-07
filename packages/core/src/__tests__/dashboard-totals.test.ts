import { describe, expect, it } from 'vitest';
import {
  remainingMonthlyIncome,
  sumMonthlyEquivalents,
} from '../domain/calculations/dashboard-totals.js';
import { monthlyEquivalentMinorUnits } from '../domain/calculations/monthly-equivalent.js';

describe('sumMonthlyEquivalents', () => {
  it('rounds the total once, rather than compounding per-item rounding error', () => {
    // Each item: 1 penny weekly -> 52/12 = 4.333... minor units, rounds to 4
    // individually. Three of them: naive sum of rounded values is 4*3=12,
    // but the true total (13/3 * 3 = 13 exactly) rounds to 13 — proving
    // late rounding is required for correctness, not just style.
    const items = [
      { amountMinorUnits: 1, frequency: 'weekly' as const },
      { amountMinorUnits: 1, frequency: 'weekly' as const },
      { amountMinorUnits: 1, frequency: 'weekly' as const },
    ];

    const naiveSum = items.reduce(
      (sum, item) => sum + monthlyEquivalentMinorUnits(item.amountMinorUnits, item.frequency),
      0,
    );

    expect(naiveSum).toBe(12);
    expect(sumMonthlyEquivalents(items)).toBe(13);
  });

  it('returns 0 for an empty list', () => {
    expect(sumMonthlyEquivalents([])).toBe(0);
  });

  it('sums exact monthly amounts directly', () => {
    const items = [
      { amountMinorUnits: 100_00, frequency: 'monthly' as const },
      { amountMinorUnits: 50_00, frequency: 'monthly' as const },
    ];

    expect(sumMonthlyEquivalents(items)).toBe(150_00);
  });
});

describe('remainingMonthlyIncome', () => {
  it('subtracts expenses from income', () => {
    expect(remainingMonthlyIncome(200_00, 150_00)).toBe(50_00);
  });

  it('can go negative when expenses exceed income', () => {
    expect(remainingMonthlyIncome(100_00, 150_00)).toBe(-50_00);
  });
});
