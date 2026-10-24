import * as Address from './address.js'
import { ResponseError } from './errors.js'
import { type Context, type Fetch, type Json, request } from './request.js'

const base = 'https://data.iana.org/rdap/'
const ttl = 24 * 60 * 60 * 1000

type Kind = 'dns' | 'ipv4' | 'ipv6' | 'asn'

type Index = {
  names: Map<string, string>
  ranges: Range[]
  numbers: NumberRange[]
}

type Range = { prefix: Address.Prefix; url: string }

type NumberRange = { start: number; end: number; url: string }

type Entry = {
  expires: number
  index: Promise<Index>
  waiters: number
  controller: AbortController
}

const caches = new WeakMap<Fetch, Map<Kind, Entry>>()

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function index({ json, response }: Json, url: string): Index {
  const result: Index = { names: new Map(), ranges: [], numbers: [] }
  if (!Array.isArray(json.services)) {
    throw new ResponseError({ message: `${url} has no services array`, response, url, body: json })
  }
  for (const service of json.services) {
    if (!Array.isArray(service) || !isStrings(service[0]) || !isStrings(service[1])) {
      continue
    }
    const urls = service[1]
    let server =
      urls.find((u) => u.startsWith('https://')) ?? urls.find((u) => u.startsWith('http://'))
    if (!server) {
      continue
    }
    if (!server.endsWith('/')) {
      server += '/'
    }
    for (const key of service[0]) {
      const prefix = key.includes('/') ? Address.parse(key) : undefined
      const range = /^(\d+)(?:-(\d+))?$/.exec(key)
      if (prefix) {
        result.ranges.push({ prefix, url: server })
      } else if (range) {
        result.numbers.push({
          start: Number(range[1]),
          end: Number(range[2] ?? range[1]),
          url: server,
        })
      } else {
        result.names.set(key.toLowerCase(), server)
      }
    }
  }
  return result
}

function load(kind: Kind, { fetch, signal, now }: Context): Promise<Index> {
  const time = now?.getTime() ?? Date.now()
  if (signal?.aborted) {
    return Promise.reject(signal.reason)
  }
  let entries = caches.get(fetch)
  if (!entries) {
    caches.set(fetch, (entries = new Map()))
  }
  let entry = entries.get(kind)
  if (!entry || entry.expires <= time) {
    const controller = new AbortController()
    const url = `${base}${kind}.json`
    const created = {
      expires: time + ttl,
      index: request(url, { fetch, signal: controller.signal, now }).then((result) =>
        index(result, url),
      ),
      waiters: 0,
      controller,
    } satisfies Entry
    const cache = entries
    created.index.catch(() => {
      if (cache.get(kind) === created) {
        cache.delete(kind)
      }
    })
    entries.set(kind, (entry = created))
  }
  return wait(entry, signal)
}

function wait(entry: Entry, signal: AbortSignal | undefined): Promise<Index> {
  entry.waiters++
  if (!signal) {
    return entry.index
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(signal.reason)
      if (--entry.waiters === 0) {
        entry.controller.abort(signal.reason)
      }
    }
    signal.addEventListener('abort', abort, { once: true })
    entry.index.then(
      (index) => {
        signal.removeEventListener('abort', abort)
        resolve(index)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

export async function domain(name: string, context: Context): Promise<string | undefined> {
  const { names } = await load('dns', context)
  for (let suffix = name; ;) {
    const url = names.get(suffix)
    if (url) {
      return url
    }
    const dot = suffix.indexOf('.')
    if (dot < 0) {
      return undefined
    }
    suffix = suffix.slice(dot + 1)
  }
}

export async function ip(prefix: Address.Prefix, context: Context): Promise<string | undefined> {
  const { ranges } = await load(prefix.address.version === 4 ? 'ipv4' : 'ipv6', context)
  let best: (typeof ranges)[number] | undefined
  for (const range of ranges) {
    if (
      (!best || range.prefix.prefix > best.prefix.prefix) &&
      Address.contains(range.prefix, prefix)
    ) {
      best = range
    }
  }
  return best?.url
}

export async function asn(number: number, context: Context): Promise<string | undefined> {
  const { numbers } = await load('asn', context)
  return numbers.find(({ start, end }) => number >= start && number <= end)?.url
}
