import { toDate, toEpochMilliseconds } from '@portable/timers/internal';
import { describe, expect, test } from 'vite-plus/test';

describe('toEpochMilliseconds', () => {
  test('reads a Date and an object with epochMilliseconds the same way', () => {
    const ms = Date.UTC(2024, 0, 2, 3, 4, 5, 6);
    expect(toEpochMilliseconds(new Date(ms))).toBe(ms);
    expect(toEpochMilliseconds({ epochMilliseconds: ms })).toBe(ms);
  });

  test('reads a Temporal.Instant where the runtime has Temporal', () => {
    const Temporal = (globalThis as { Temporal?: any }).Temporal;
    if (Temporal === undefined) {
      return;
    }
    const instant = Temporal.Instant.from('2024-01-02T03:04:05.006Z');
    expect(toEpochMilliseconds(instant)).toBe(Date.UTC(2024, 0, 2, 3, 4, 5, 6));
    expect(toEpochMilliseconds(instant.toZonedDateTimeISO('Europe/Paris'))).toBe(
      Date.UTC(2024, 0, 2, 3, 4, 5, 6),
    );
  });

  test('throws a TypeError for anything else', () => {
    for (const value of [1_700_000_000_000, '2024-01-02', {}, null, undefined]) {
      expect(() => toEpochMilliseconds(value as never)).toThrow(TypeError);
    }
  });

  test('throws a RangeError for an invalid Date or a time outside the range of Date', () => {
    for (const value of [new Date(NaN), { epochMilliseconds: NaN }, { epochMilliseconds: 1e20 }]) {
      expect(() => toEpochMilliseconds(value)).toThrow(RangeError);
    }
    expect(() => toDate(new Date(NaN), 'expiresAt')).toThrow('`expiresAt` must be');
  });
});

describe('toDate', () => {
  test('returns a Date for an instant', () => {
    expect(toDate({ epochMilliseconds: 1000 })).toEqual(new Date(1000));
  });

  test('returns the current time for undefined', () => {
    const before = Date.now();
    const date = toDate(undefined);
    expect(date.getTime()).toBeGreaterThanOrEqual(before);
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
