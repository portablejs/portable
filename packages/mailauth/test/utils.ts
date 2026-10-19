import type * as Dns from '@portable/dns'
import * as Dkim from '@portable/dkim'
import * as Mailauth from '@portable/mailauth'

const files = import.meta.glob<string>('./fixtures/*', { query: '?url&inline', import: 'default' })

export async function fixtureText(name: string): Promise<string> {
  const load = files[`./fixtures/${name}`]
  if (!load) throw new Error(`No fixture ${name}`)
  return (await fetch(await load())).text()
}

export const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)
export const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

export type Records = {
  TXT?: readonly (string | readonly string[])[] | string | undefined
  A?: readonly string[] | string | undefined
  AAAA?: readonly string[] | string | undefined
  MX?: readonly Dns.MxRecord[] | string | undefined
  PTR?: readonly string[] | string | undefined
  CNAME?: string | undefined
}

export type Zone = Record<string, Records>

export function dnsError(code: string, name: string): Error {
  return Object.assign(new Error(`${code} ${name}`), { code })
}

const normalize = (name: string): string => name.toLowerCase().replace(/\.$/, '')

/** Fails like `node:dns`, as mailauth's tests expect: ENOTFOUND for a missing name, ENODATA for a missing type. */
export function zoneResolver(zone: Zone, log: string[] = []): Mailauth.Resolver {
  const names = new Map(Object.entries(zone).map(([name, records]) => [normalize(name), records]))
  async function answer<T>(
    type: string,
    name: string,
    pick: (records: Records) => readonly T[] | string | undefined,
  ): Promise<T[]> {
    log.push(`${type} ${name}`)
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
    resolve6: (name) => answer('AAAA', name, (records) => records.AAAA),
    resolveMx: (name) => answer('MX', name, (records) => records.MX),
    resolvePtr: (name) => answer('PTR', name, (records) => records.PTR),
    resolveCname: (name) =>
      answer('CNAME', name, (records) => (records.CNAME ? [records.CNAME] : undefined)),
    resolveTxt: async (name) =>
      (await answer('TXT', name, (records) => records.TXT)).map((record) =>
        typeof record === 'string' ? [record] : [...record],
      ),
  }
}

const pemBody = (pem: string): string => pem.replace(/-----[^-]+-----|\s/g, '')

export type Key = { privateKey: string; record: string }

export async function key(name: 'rsa' | 'ed25519'): Promise<Key> {
  const privateKey = await fixtureText(`private-${name}.pem.txt`)
  const spki = pemBody(await fixtureText(`public-${name}.pem.txt`))
  const p =
    name === 'rsa'
      ? spki
      : btoa(
          String.fromCharCode(
            ...Uint8Array.from(atob(spki), (char) => char.charCodeAt(0)).slice(-32),
          ),
        )
  return { privateKey, record: `v=DKIM1; k=${name}; p=${p}` }
}

export const buildMessage = ({
  from = 'sender@example.com',
  to = 'rcpt@example.net',
}: { from?: string; to?: string } = {}): string =>
  [
    `From: ${from}`,
    `To: ${to}`,
    'Subject: hello',
    'Date: Mon, 1 Jan 2024 00:00:00 +0000',
    `Message-ID: <1@${from.split('@').pop()}>`,
    '',
    'body',
    '',
  ].join('\r\n')

export async function signed(message: string, domain: string, selector = 'test'): Promise<string> {
  const signature = await Dkim.sign(message, {
    domain,
    selector,
    privateKey: (await key('rsa')).privateKey,
    signedAt: new Date('2024-01-01T00:00:00Z'),
  })
  return signature + message
}

export function fields(block: string): string[] {
  return block
    .replace(/\r\n(?=[ \t])/g, '')
    .split('\r\n')
    .filter(Boolean)
}

export function resinfos(value: string): string[] {
  return value
    .replace(/\r\n[ \t]+/g, ' ')
    .replace(/\((?:[^()\\]|\\.)*\)/g, '')
    .split(';')
    .slice(1)
    .map((part) => part.trim().replace(/\s+/g, ' '))
}

export const unfold = (value: string): string => value.replace(/\r\n(?=[ \t])/g, '')
