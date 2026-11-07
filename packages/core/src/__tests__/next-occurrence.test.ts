import { describe, expect, it } from 'vitest';
import { nextOccurrence, toIsoDateString } from '../domain/calculations/next-occurrence.js';

describe('nextOccurrence', () => {
  it('returns the anchor date itself if it is today', () => {
    const today = new Date('2026-03-15T00:00:00.000Z');
    const result = nextOccurrence('monthly', '2026-03-15', today);
    expect(toIsoDateString(result)).toBe('2026-03-15');
  });

  it('returns the anchor date if it is still in the future', () => {
    const today = new Date('2026-03-01T00:00:00.000Z');
    const result = nextOccurrence('monthly', '2026-03-15', today);
    expect(toIsoDateString(result)).toBe('2026-03-15');
  });

  it('steps a past weekly anchor forward to the next occurrence', () => {
    const today = new Date('2026-03-15T00:00:00.000Z');
    // Anchor was 2026-03-01 (a Sunday); weekly occurrences land on
    // 03-08, 03-15 — the first one >= today is 03-15.
    const result = nextOccurrence('weekly', '2026-03-01', today);
    expect(toIsoDateString(result)).toBe('2026-03-15');
  });

  it('steps a past monthly anchor forward across month boundaries', () => {
    const today = new Date('2026-06-01T00:00:00.000Z');
    const result = nextOccurrence('monthly', '2026-01-10', today);
    expect(toIsoDateString(result)).toBe('2026-06-10');
  });

  it('steps a past quarterly anchor forward', () => {
    const today = new Date('2026-08-01T00:00:00.000Z');
    const result = nextOccurrence('quarterly', '2026-01-01', today);
    expect(toIsoDateString(result)).toBe('2026-10-01');
  });

  it('steps a past annual anchor forward across years', () => {
    const today = new Date('2028-01-01T00:00:00.000Z');
    const result = nextOccurrence('annually', '2025-05-20', today);
    expect(toIsoDateString(result)).toBe('2028-05-20');
  });
});
