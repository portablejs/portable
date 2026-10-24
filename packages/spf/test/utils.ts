import type * as Dns from '@portable/dns'
import * as Spf from '@portable/spf'
import { parseAllDocuments } from 'yaml'
import suite from './fixtures/rfc7208-tests.yml?raw'

/** A string instead of records rejects every lookup of that type with that `code`. */
export type Records = {
  TXT?: readonly (string | readonly string[])[] | string | undefined
  A?: readonly string[] | string | undefined
  AAAA?: readonly string[] | string | undefined
  MX?: readonly Dns.MxRecord[] | string | undefined
  PTR?: readonly string[] | string | undefined
  CNAME?: string | undefined
}

export type Zone = Record<string, Records>

export type Query = `${'TXT' | 'A' | 'AAAA' | 'MX' | 'PTR'} ${string}`

export function dnsError(code: string, name: string): Error {
  return Object.assign(new Error(`${code} ${name}`), { code })
}

export function zoneResolver(zone: Zone, log: Query[] = []): Spf.Resolver {
  const names = new Map(Object.entries(zone).map(([name, records]) => [normalize(name), records]))
  async function answer<value>(
    type: 'TXT' | 'A' | 'AAAA' | 'MX' | 'PTR',
    name: string,
    pick: (records: Records) => readonly value[] | string | undefined,
  ): Promise<value[]> {
    log.push(`${type} ${name}`)
    if (name.split('.').some((label) => label.length > 63)) {
      throw dnsError('EBADNAME', name)
    }
    let key = normalize(name)
    for (let hops = 0; ; hops++) {
      const records = names.get(key)
      if (!records) {
        throw dnsError('ENOTFOUND', name)
      }
      if (records.CNAME === undefined) {
        const value = pick(records)
        if (value === undefined) {
          throw dnsError('ENODATA', name)
        }
        if (typeof value === 'string') {
          throw dnsError(value, name)
        }
        return [...value]
      }
      if (hops === 8) {
        throw dnsError('ESERVFAIL', name)
      }
      key = normalize(records.CNAME)
    }
  }
  return {
    resolve4: (name) => answer('A', name, (records) => records.A),
    resolve6: (name) => answer('AAAA', name, (records) => records.AAAA),
    resolveMx: (name) => answer('MX', name, (records) => records.MX),
    resolvePtr: (name) => answer('PTR', name, (records) => records.PTR),
    resolveTxt: async (name) =>
      (await answer('TXT', name, (records) => records.TXT)).map((record) =>
        typeof record === 'string' ? [record] : [...record],
      ),
  }
}

/**
 * mailauth's resolver shape, `(name, type) => records`, answered by `resolver`. mailauth's
 * `DNSResolver` type leaves out the MX objects it reads, hence the cast.
 */
export function mailauthResolver(
  resolver: Spf.Resolver,
): (name: string, type: string) => Promise<string[][] | string[]> {
  return (name, type) => {
    switch (type) {
      case 'A':
        return resolver.resolve4(name)
      case 'AAAA':
        return resolver.resolve6(name)
      case 'MX':
        return resolver.resolveMx(name) as unknown as Promise<string[]>
      case 'PTR':
        return resolver.resolvePtr(name)
      case 'TXT':
        return resolver.resolveTxt(name)
      default:
        return Promise.reject(dnsError('ENODATA', name))
    }
  }
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\.$/, '')
}

export function withRecord(record: string | readonly string[], extra: Zone = {}): Zone {
  return { 'example.test': { TXT: typeof record === 'string' ? [record] : record }, ...extra }
}

export function check(
  zone: Zone,
  input: Partial<Spf.check.Input> = {},
  options: Partial<Spf.check.Options> & { log?: Query[] | undefined } = {},
): Promise<Spf.Result> {
  const { log, ...rest } = options
  return Spf.check(
    { ip: '192.0.2.1', sender: 'user@example.test', helo: 'mail.example.test', ...input },
    { resolver: zoneResolver(zone, log), receiver: 'mx.receiver.test', ...rest },
  )
}

export type SuiteTest = {
  name: string
  scenario: string
  spec: string
  description: string
  host: string
  mailfrom: string
  helo: string
  result: readonly string[]
  explanation: string | undefined
  zone: Zone
}

type YamlRecord = Record<string, unknown> | string

/**
 * The OpenSPF RFC 7208 test suite, with each scenario's zone data read as pyspf's `testspf.py`
 * reads it: an `SPF` record is also served as TXT unless the name has its own TXT records,
 * `NONE` is no record, and `TIMEOUT` times out every type that has no record listed before it.
 */
export const rfc7208: readonly SuiteTest[] = parseAllDocuments(suite).flatMap((document) => {
  const scenario = document.toJS() as {
    description: string
    tests: Record<string, Record<string, unknown>>
    zonedata: Record<string, YamlRecord[] | null>
  }
  const zone: Zone = {}
  for (const [name, records] of Object.entries(scenario.zonedata)) {
    zone[name] = suiteRecords(records ?? [])
  }
  return Object.entries(scenario.tests).map(([name, test]) => ({
    name,
    scenario: scenario.description,
    spec: text(test.spec),
    description: text(test.description).trim(),
    host: text(test.host),
    mailfrom: text(test.mailfrom),
    helo: text(test.helo),
    result: [test.result].flat().map(text),
    explanation: test.explanation === undefined ? undefined : text(test.explanation),
    zone,
  }))
})

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function suiteRecords(list: readonly YamlRecord[]): Records {
  const typed = list.flatMap((item): [string, unknown][] =>
    typeof item === 'string' ? [['TIMEOUT', item]] : Object.entries(item),
  )
  const hasTxt = typed.some(([type]) => type === 'TXT')
  const generated = typed.filter(([type]) => type === 'SPF').map(([, value]) => ['TXT', value])
  const ordered = hasTxt ? typed : [...typed, ...generated]
  const collect = <value>(
    type: string,
    read: (value: unknown) => value,
  ): value[] | string | undefined => {
    const found: value[] = []
    for (const [itemType, value] of ordered) {
      if (itemType === 'TIMEOUT') {
        return found.length ? found : 'ETIMEOUT'
      }
      if (itemType === type && value !== 'NONE') {
        found.push(read(value))
      }
    }
    return found.length ? found : undefined
  }
  const cname = typed.find(([type]) => type === 'CNAME')
  return {
    TXT: collect('TXT', (value) => (Array.isArray(value) ? value.map(String) : [String(value)])),
    A: collect('A', String),
    AAAA: collect('AAAA', String),
    PTR: collect('PTR', String),
    MX: collect('MX', (value) => ({
      priority: Number(Array.isArray(value) ? value[0] : 0),
      exchange: String(Array.isArray(value) ? value[1] : value),
    })),
    CNAME: cname ? String(cname[1]) : undefined,
  }
}
