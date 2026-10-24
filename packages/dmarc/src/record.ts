/**
 * A Domain Owner Assessment Policy (RFC 9989 section 4.7): what the domain owner asks a receiver to
 * do with mail that fails DMARC.
 *
 * @example
 * ```ts
 * import * as Dmarc from '@portable/dmarc'
 *
 * const policy: Dmarc.Policy = 'quarantine'
 * ```
 */
export type Policy = 'none' | 'quarantine' | 'reject'

/**
 * A DMARC Policy Record, with the defaults of RFC 9989 section 4.7 filled in. Invalid tag values
 * are replaced by their defaults, and unknown and historic tags such as `pct` and `ri` are left
 * out.
 *
 * @example
 * ```ts
 * import * as Dmarc from '@portable/dmarc'
 *
 * const { record } = await Dmarc.check({ from: 'example.com' }, { resolver })
 * record?.rua // ['mailto:dmarc@example.com']
 * ```
 */
export type Record = {
  /** The TXT record as published, with its strings joined. */
  text: string
  /** The policy for the domain itself. `'none'` when the tag is missing or invalid and `rua` is valid. */
  p: Policy
  /** The policy for existing subdomains. */
  sp?: Policy | undefined
  /** The policy for subdomains that don't exist. */
  np?: Policy | undefined
  /** DKIM alignment mode: `'r'` relaxed or `'s'` strict. */
  adkim: 'r' | 's'
  /** SPF alignment mode: `'r'` relaxed or `'s'` strict. */
  aspf: 'r' | 's'
  /** `'y'` when the domain owner is testing its policy, which lowers the applied policy one level. */
  t: 'y' | 'n'
  /** `'y'` for a public suffix domain, `'n'` for an organizational domain, `'u'` for unknown. */
  psd: 'y' | 'n' | 'u'
  /** Valid URIs for aggregate reports, without the obsolete `!size` suffix. */
  rua: readonly string[]
  /** Valid URIs for failure reports, without the obsolete `!size` suffix. */
  ruf: readonly string[]
  /** Failure reporting options, such as `'0'` or `'1:d'`. */
  fo: string
}

export type Parsed = { psd: Record['psd']; record: Record | undefined }

const version = /^[vV][ \t]*=[ \t]*DMARC1[ \t]*(?:;|$)/
const uri = /^[a-z][a-z0-9+.-]*:(?:[a-z0-9\-._~:/?#[\]@$&'()*+;=]|%[0-9a-f]{2})*$/i
const reportSize = /![0-9]+[kmgt]?$/i
const caseless = new Set(['p', 'sp', 'np', 'adkim', 'aspf', 'fo', 't', 'psd'])

export function isDmarc(text: string): boolean {
  return version.test(text)
}

// A duplicate tag invalidates the whole tag-list (RFC 6376 section 3.2).
export function parseRecord(text: string): Parsed | undefined {
  const tags = new Map<string, string>()
  for (const [index, fragment] of text.split(';').entries()) {
    const equals = fragment.indexOf('=')
    if (equals < 0) continue
    const name = fragment.slice(0, equals).trim()
    if (!name) continue
    const key = index === 0 ? name.toLowerCase() : name
    if (tags.has(key)) return undefined
    const value = fragment.slice(equals + 1).trim()
    tags.set(key, caseless.has(key) ? value.toLowerCase() : value)
  }
  const psd = pick(tags.get('psd'), ['y', 'n', 'u'] as const, 'u')
  const rua = uris(tags.get('rua'))
  const [p, sp, np] = [tags.get('p'), tags.get('sp'), tags.get('np')]
  const policy =
    isPolicy(p) && (sp === undefined || isPolicy(sp)) && (np === undefined || isPolicy(np))
      ? { p, ...(sp && { sp }), ...(np && { np }) }
      : undefined
  if (!policy && !rua.length) return { psd, record: undefined }
  return {
    psd,
    record: {
      text,
      ...(policy ?? { p: 'none' }),
      adkim: pick(tags.get('adkim'), ['r', 's'] as const, 'r'),
      aspf: pick(tags.get('aspf'), ['r', 's'] as const, 'r'),
      t: pick(tags.get('t'), ['y', 'n'] as const, 'n'),
      psd,
      rua,
      ruf: uris(tags.get('ruf')),
      fo: /^[01ds](?::[01ds])*$/.test(tags.get('fo') ?? '') ? tags.get('fo')! : '0',
    },
  }
}

function isPolicy(value: string | undefined): value is Policy {
  return value === 'none' || value === 'quarantine' || value === 'reject'
}

function pick<value extends string>(
  value: string | undefined,
  allowed: readonly value[],
  fallback: value,
): value {
  return allowed.find((option) => option === value) ?? fallback
}

function uris(value: string | undefined): string[] {
  if (value === undefined) return []
  return value
    .split(',')
    .map((item) => item.trim().replace(reportSize, ''))
    .filter((item) => uri.test(item))
}
