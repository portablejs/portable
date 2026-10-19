const pattern =
  /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3})\d*)?\s*(Z|[+-]\d{2}:?\d{2})?$/
const offsetPattern = /^([+-])(\d{2}):?(\d{2})$/

export declare namespace parseDate {
  type Options = {
    /** UTC offset such as `'+02:00'`, used when `value` has none. Anything else is ignored. */
    offset?: string | undefined
  }
}

/**
 * Parses an EXIF date such as `'2013:05:10 15:21:35'` into a `Date`. EXIF dates have no time zone,
 * so pass the matching `OffsetTime*` tag as the `offset` option (`'+02:00'`). Without one, the
 * date is read as UTC, so `getUTCHours()` and the other `getUTC*` methods return the time the
 * camera recorded. Also accepts the ISO 8601 form `'2004-09-04T23:39:06-08:00'` that some
 * writers use. Returns `undefined` for anything else, including the all-zero dates that cameras
 * write when the clock is unset.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * const { exif } = Exif.parse(bytes)
 * const taken = Exif.parseDate(String(exif.DateTimeOriginal), { offset: String(exif.OffsetTimeOriginal) })
 * ```
 */
export function parseDate(value: string, options: parseDate.Options = {}): Date | undefined {
  const { offset } = options
  const match = pattern.exec(value.trim())
  if (!match) return undefined
  const [, year, month, day, hours, minutes, seconds, fraction = '0', zone] = match
  const time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
    Number(fraction.padEnd(3, '0')),
  )
  const date = new Date(time)
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hours) ||
    date.getUTCMinutes() !== Number(minutes) ||
    date.getUTCSeconds() !== Number(seconds)
  )
    return undefined
  const offsetMatch = offsetPattern.exec(zone ?? offset?.trim() ?? '')
  const [, sign, offsetHours, offsetMinutes] = offsetMatch ?? []
  if (!offsetMatch || Number(offsetHours) > 23 || Number(offsetMinutes) > 59)
    return zone && zone !== 'Z' ? undefined : date
  const shift = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000
  return new Date(sign === '-' ? time + shift : time - shift)
}
