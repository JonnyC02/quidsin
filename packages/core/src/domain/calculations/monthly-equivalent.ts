import { Decimal } from 'decimal.js';
import type { Frequency } from '../entities/frequency.js';

/**
 * Unrounded monthly-equivalent value, in minor units. Callers that need to
 * sum several items' monthly equivalents (e.g. dashboard totals) should sum
 * these Decimal values and round once at the end — rounding each item
 * individually first and then summing compounds rounding error.
 */
export function monthlyEquivalentDecimal(amountMinorUnits: number, frequency: Frequency): Decimal {
  const amount = new Decimal(amountMinorUnits);

  switch (frequency) {
    case 'weekly':
      return amount.times(52).dividedBy(12);
    case 'fortnightly':
      return amount.times(26).dividedBy(12);
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount.dividedBy(3);
    case 'annually':
      return amount.dividedBy(12);
  }
}

/** Rounded monthly-equivalent value, in minor units, for standalone display. */
export function monthlyEquivalentMinorUnits(
  amountMinorUnits: number,
  frequency: Frequency,
): number {
  return monthlyEquivalentDecimal(amountMinorUnits, frequency)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}
