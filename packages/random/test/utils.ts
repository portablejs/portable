/** Counts how often each key occurs. */
export function tally<key>(values: Iterable<key>): Map<key, number> {
  const counts = new Map<key, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/** Pearson's chi-squared statistic for `counts` against equal expected counts over `categories`. */
export function chiSquared(counts: ReadonlyMap<unknown, number>, categories: number): number {
  let total = 0
  for (const count of counts.values()) total += count
  const expected = total / categories
  let statistic = (categories - counts.size) * expected
  for (const count of counts.values()) statistic += (count - expected) ** 2 / expected
  return statistic
}

/**
 * The chi-squared value that a uniform source exceeds with probability `p`, by the Wilson-Hilferty
 * approximation. For a few degrees of freedom it is a little above the exact value, which only
 * makes the test more lenient.
 */
export function critical(degreesOfFreedom: number, p: number): number {
  const z = normalQuantile(1 - p)
  const k = degreesOfFreedom
  return k * (1 - 2 / (9 * k) + z * Math.sqrt(2 / (9 * k))) ** 3
}

// Acklam's rational approximation of the inverse normal CDF, accurate to 1.2e-9.
function normalQuantile(p: number): number {
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628274631,
  ]
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ]
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const tail = (q: number) =>
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)))
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)))
  const q = p - 0.5
  const r = q * q
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  )
}

/**
 * Returns whether `values` look uniform over `categories` outcomes at significance `p`. Seeded tests
 * use p = 0.001, and a fixed seed passes or fails the same way every run. Tests of
 * `crypto.getRandomValues` use p = 1e-9, so a uniform source fails about once in a billion runs.
 */
export function looksUniform(
  values: Iterable<unknown>,
  categories: number,
  p: number,
): { statistic: number; limit: number; uniform: boolean } {
  const counts = tally(values)
  const statistic = chiSquared(counts, categories)
  const limit = critical(categories - 1, p)
  return { statistic, limit, uniform: counts.size <= categories && statistic < limit }
}

/** Calls `draw` `count` times and returns the results. */
export const draws = <value>(count: number, draw: () => value): value[] =>
  Array.from({ length: count }, draw)

export const seededP = 0.001
export const cryptoP = 1e-9

export const permutations = (n: number): number => (n <= 1 ? 1 : n * permutations(n - 1))
