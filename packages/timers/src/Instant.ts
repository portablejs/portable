/**
 * A point in time that an option such as `now` or `expiresAt` accepts: a `Date`, or any object
 * with `epochMilliseconds`, such as a `Temporal.Instant` or `Temporal.ZonedDateTime`.
 */
export type Instant = Date | { readonly epochMilliseconds: number };

/**
 * Returns the milliseconds since the Unix epoch of `instant`. It reads `epochMilliseconds` when the
 * value has it, and `getTime()` otherwise, which also works for a `Date` from another realm. If the
 * time is outside the range of `Date`, as an invalid `Date`'s is, it throws a `RangeError` that
 * mentions the option `name`.
 */
export function toEpochMilliseconds(instant: Instant, name = 'now'): number {
  const epochMilliseconds = (instant as { epochMilliseconds?: unknown } | null | undefined)
    ?.epochMilliseconds;
  let time: number;
  if (typeof epochMilliseconds === 'number') {
    time = epochMilliseconds;
  } else {
    try {
      time = Date.prototype.getTime.call(instant);
    } catch (cause) {
      throw new TypeError(`\`${name}\` must be a Date or an object with \`epochMilliseconds\`.`, {
        cause,
      });
    }
  }
  if (!(Math.abs(time) <= 8.64e15)) {
    throw new RangeError(`\`${name}\` must be a valid Date or instant.`);
  }
  return time;
}

/** Returns `instant` as a `Date`, or the current time when `instant` is `undefined`. */
export function toDate(instant: Instant | undefined, name = 'now'): Date {
  if (instant === undefined) {
    return new Date();
  }
  return new Date(toEpochMilliseconds(instant, name));
}
