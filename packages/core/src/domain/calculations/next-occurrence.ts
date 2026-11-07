import type { Frequency } from '../entities/frequency.js';

const MAX_ITERATIONS = 100_000; // defensive guard; should never be reached in practice

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addPeriod(date: Date, frequency: Frequency): Date {
  const next = new Date(date.getTime());

  switch (frequency) {
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'fortnightly':
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'quarterly':
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case 'annually':
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }

  return next;
}

/**
 * Steps the anchor date forward by the frequency's period until it reaches
 * or passes `today`, giving the next (or today's, if it lands exactly on
 * it) occurrence. Used uniformly for all five frequencies.
 */
export function nextOccurrence(
  frequency: Frequency,
  anchorDateIso: string,
  today: Date = new Date(),
): Date {
  let occurrence = parseIsoDate(anchorDateIso);
  const todayStart = startOfUtcDay(today);

  let iterations = 0;
  while (occurrence.getTime() < todayStart.getTime() && iterations < MAX_ITERATIONS) {
    occurrence = addPeriod(occurrence, frequency);
    iterations++;
  }

  return occurrence;
}

export function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
