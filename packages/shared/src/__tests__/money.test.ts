import { describe, expect, it } from 'vitest';
import { formatMinorUnits, parseAmountToMinorUnits } from '../money.js';

describe('parseAmountToMinorUnits', () => {
  it('parses whole and decimal amounts correctly', () => {
    expect(parseAmountToMinorUnits('123')).toBe(12300);
    expect(parseAmountToMinorUnits('123.45')).toBe(12345);
    expect(parseAmountToMinorUnits('0.1')).toBe(10);
  });

  it('does not reintroduce float error for tricky decimals', () => {
    // 0.1 + 0.2 famously isn't 0.3 in floating point; the parser must
    // avoid that failure mode entirely since it never does float math.
    expect(parseAmountToMinorUnits('0.29')).toBe(29);
    expect(parseAmountToMinorUnits('19.99')).toBe(1999);
  });

  it('rejects malformed input', () => {
    expect(parseAmountToMinorUnits('abc')).toBeNull();
    expect(parseAmountToMinorUnits('-5')).toBeNull();
    expect(parseAmountToMinorUnits('1.234')).toBeNull();
    expect(parseAmountToMinorUnits('')).toBeNull();
  });
});

describe('formatMinorUnits', () => {
  it('formats minor units as a currency string', () => {
    expect(formatMinorUnits(12345, 'GBP', 'en-GB')).toBe('£123.45');
  });
});
