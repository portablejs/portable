import * as Dmarc from '@portable/dmarc'

/** A string instead of records rejects every lookup of that type with that `code`. */
export type Records = {
  TXT?: readonly (string | readonly string[])[] | string | undefined
  A?: readonly string[] | string | undefined
  CNAME?: string | undefined
}

/** A name with `{}` exists but has no records. A missing name gives `ENOTFOUND`. */
export type Zone = Record<string, Records>

export type Query = `${'TXT' | 'A' | 'CNAME'} ${string}`

export function dnsError(code: string, name: string): Error {
  return Object.assign(new Error(`${code} ${name}`), { code })
}

/**
 * Answers from `zone` like a recursive resolver: a name with a CNAME is followed for TXT and A,
 * so a missing target gives `ENOTFOUND`, and `resolveCname` returns the CNAME itself.
 */
export function zoneResolver(zone: Zone, log?: Query[]): Dmarc.Resolver {
  const names = new Map(Object.entries(zone).map(([name, records]) => [normalize(name), records]))
  async function answer<T>(
    type: 'TXT' | 'A' | 'CNAME',
    name: string,
    pick: (records: Records) => readonly T[] | string | undefined,
  ): Promise<T[]> {
    log?.push(`${type} ${name}`)
    let key = normalize(name)
    for (let hops = 0; ; hops++) {
      const records = names.get(key)
      if (!records) throw dnsError('ENOTFOUND', name)
      if (records.CNAME === undefined || type === 'CNAME') {
        const value = pick(records)
        if (value === undefined) throw dnsError('ENODATA', name)
        if (typeof value === 'string') throw dnsError(value, name)
        return [...value]
      }
      if (hops === 8) throw dnsError('ESERVFAIL', name)
      key = normalize(records.CNAME)
    }
  }
  return {
    resolve4: (name) => answer('A', name, (records) => records.A),
    resolveCname: (name) =>
      answer('CNAME', name, (records) =>
        records.CNAME === undefined ? undefined : [records.CNAME],
      ),
    resolveTxt: async (name) =>
      (await answer('TXT', name, (records) => records.TXT)).map((record) =>
        typeof record === 'string' ? [record] : [...record],
      ),
  }
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\.$/, '')
}

/** A zone with `record` published at `_dmarc.<domain>`. */
export function withRecord(record: string, domain = 'example.com', extra: Zone = {}): Zone {
  return { [`_dmarc.${domain}`]: { TXT: [record] }, ...extra }
}

export const pass = (domain: string) => ({ result: 'pass' as const, domain })

export function check(
  zone: Zone,
  input: Dmarc.check.Input,
  options: Partial<Dmarc.check.Options> & { log?: Query[] } = {},
): Promise<Dmarc.Result> {
  const { log, ...rest } = options
  return Dmarc.check(input, { resolver: zoneResolver(zone, log), ...rest })
}

/** The `_dmarc` names queried, in order. */
export function dmarcQueries(log: readonly Query[]): string[] {
  return log.filter((query) => query.startsWith('TXT ')).map((query) => query.slice(4))
}
