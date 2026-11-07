import { Decimal } from 'decimal.js';
import { monthlyEquivalentDecimal } from './monthly-equivalent.js';
import type { Frequency } from '../entities/frequency.js';

export interface MoneyFrequencyItem {
  amountMinorUnits: number;
  frequency: Frequency;
}

/**
 * Sums the unrounded monthly-equivalent of every item and rounds once at
 * the end, rather than rounding each item first and summing the rounded
 * values — the latter compounds rounding error across many small amounts.
 */
export function sumMonthlyEquivalents(items: readonly MoneyFrequencyItem[]): number {
  const total = items.reduce(
    (sum, item) => sum.plus(monthlyEquivalentDecimal(item.amountMinorUnits, item.frequency)),
    new Decimal(0),
  );

  return total.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function remainingMonthlyIncome(
  monthlyIncomeTotalMinorUnits: number,
  monthlyExpensesTotalMinorUnits: number,
): number {
  return monthlyIncomeTotalMinorUnits - monthlyExpensesTotalMinorUnits;
}
