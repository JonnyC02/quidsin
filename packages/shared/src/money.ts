import { Decimal } from 'decimal.js';

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Parses a user-typed decimal amount (e.g. "123.45") into integer minor
 * units (12345), decimal-safely — never via `Math.round(parseFloat(x) * 100)`.
 * Returns null for anything that isn't a plain non-negative amount with at
 * most 2 decimal places.
 */
export function parseAmountToMinorUnits(input: string): number | null {
  const trimmed = input.trim();

  if (!AMOUNT_PATTERN.test(trimmed)) {
    return null;
  }

  return new Decimal(trimmed).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Formats integer minor units as a localized currency string for display. */
export function formatMinorUnits(
  amountMinorUnits: number,
  currency: string,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    amountMinorUnits / 100,
  );
}
