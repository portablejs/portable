import { permerror } from './errors.js'
import type { Address } from '@portable/ip'
import { parseIp } from './ip.js'
import { parseDomainSpec, parseMacroString, type Token } from './macro.js'

export type Qualifier = '+' | '-' | '~' | '?'

type Common = { qualifier: Qualifier; text: string }

export type Directive = Common &
  (
    | { kind: 'all' }
    | { kind: 'include' | 'exists'; domain: Token[] }
    | { kind: 'a' | 'mx'; domain: Token[] | undefined; cidr4: number; cidr6: number }
    | { kind: 'ptr'; domain: Token[] | undefined }
    | { kind: 'ip4' | 'ip6'; network: Address; prefix: number }
  )

export type Policy = {
  directives: Directive[]
  redirect: Token[] | undefined
  exp: Token[] | undefined
}

const modifier = /^([a-z][a-z\d\-_.]*)=(.*)$/i
const mechanism = /^([+\-~?]?)([a-z\d]*)(.*)$/i
const dualCidr = /^(?::(.+?))?(?:\/(\d+))?(?:\/\/(\d+))?$/
const network = /^:([^/]+)(?:\/(.*))?$/

export function parseRecord(terms: readonly string[]): Policy {
  const policy: Policy = { directives: [], redirect: undefined, exp: undefined }
  for (const term of terms) {
    const pair = modifier.exec(term)
    if (pair) {
      const name = pair[1]!.toLowerCase()
      const value = pair[2]!
      if (name === 'redirect' || name === 'exp') {
        if (policy[name]) throw permerror(`More than one ${name} modifier`)
        policy[name] = parseDomainSpec(value)
      } else parseMacroString(value, true)
      continue
    }
    policy.directives.push(parseDirective(term))
  }
  return policy
}

function parseDirective(text: string): Directive {
  const [, sign = '', name = '', rest = ''] = mechanism.exec(text) ?? []
  const qualifier = (sign === '-' || sign === '~' || sign === '?' ? sign : '+') satisfies Qualifier
  const kind = name.toLowerCase()
  switch (kind) {
    case 'all':
      if (rest) break
      return { kind, qualifier, text }
    case 'include':
    case 'exists':
      if (!rest.startsWith(':')) break
      return { kind, qualifier, text, domain: parseDomainSpec(rest.slice(1)) }
    case 'ptr':
      if (rest && !rest.startsWith(':')) break
      return { kind, qualifier, text, domain: rest ? parseDomainSpec(rest.slice(1)) : undefined }
    case 'a':
    case 'mx': {
      const match = dualCidr.exec(rest)
      if (!match) break
      return {
        kind,
        qualifier,
        text,
        domain: match[1] === undefined ? undefined : parseDomainSpec(match[1]),
        cidr4: cidr(match[2], 32),
        cidr6: cidr(match[3], 128),
      }
    }
    case 'ip4':
    case 'ip6': {
      const match = network.exec(rest)
      const address = match && parseIp(match[1]!)
      const max = kind === 'ip4' ? 32 : 128
      if (!address || address.bytes.length * 8 !== max) break
      return { kind, qualifier, text, network: address, prefix: cidr(match[2], max) }
    }
    default:
      throw permerror(`Unknown mechanism "${name}"`)
  }
  throw permerror(`Invalid term "${text}"`)
}

function cidr(value: string | undefined, max: number): number {
  if (value === undefined) return max
  if (!/^(?:0|[1-9]\d{0,2})$/.test(value) || Number(value) > max) {
    throw permerror(`Invalid prefix length "/${value}"`)
  }
  return Number(value)
}
