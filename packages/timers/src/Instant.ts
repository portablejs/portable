/**
 * A point in time that an option such as `now` or `expiresAt` accepts: a `Date`, or any object
 * with `epochMilliseconds`, such as a `Temporal.Instant` or `Temporal.ZonedDateTime`.
 */
export type Instant = Date | { readonly epochMilliseconds: number };

/**
 * Returns the milliseconds since the Unix epoch of `instant`. It reads `epochMilliseconds` when the
 * value has it, and `getTime()` otherwise, which also works for a `Date` from another realm.
 */
export function toEpochMilliseconds(instant: Instant): number {
  const epochMilliseconds = (instant as { epochMilliseconds?: unknown } | null | undefined)
    ?.epochMilliseconds;
  if (typeof epochMilliseconds === 'number') {
    return epochMilliseconds;
  }
  try {
    return Date.prototype.getTime.call(instant);
  } catch (cause) {
    throw new TypeError('Expected a Date or an object with `epochMilliseconds`.', { cause });
  }
}

/** Returns `instant` as a `Date`, or the current time when `instant` is `undefined`. */
export function toDate(instant: Instant | undefined): Date {
  if (instant === undefined) {
    return new Date();
  }
  return new Date(toEpochMilliseconds(instant));
}
