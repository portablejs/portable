import type * as Arc from '@portable/arc'
import type * as Dkim from '@portable/dkim'
import type * as Dmarc from '@portable/dmarc'
import * as MimeHeaders from '@portable/mime-headers'
import type * as Spf from '@portable/spf'

const token = /^[!#$%&'*+\-.0-9A-Z^_`a-z{|}~]+$/
const atext = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
const identity = new RegExp(`^(?:${atext}(?:\\.${atext})*)?@[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$`)
const hostName = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i
const keyword = /^[a-z0-9-]+$/i
const maxValueBytes = 900
const maxCommentWordBytes = 200
const encoder = new TextEncoder()

const byteLength = (text: string): number => encoder.encode(text).length

export function assertAuthservId(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('options.authservId must be a string.')
  if (!token.test(value) || value.length > maxValueBytes)
    throw new RangeError(
      `options.authservId must be a token, such as the host name in A-label form, not ${JSON.stringify(value)}.`,
    )
  return value
}

export type Input = {
  authservId: string
  ip: string
  sender: string | undefined
  spf: Spf.Result
  dkim: readonly Dkim.Result[]
  arc: Arc.Result
  dmarc: Dmarc.Result | undefined
}

export function formatResults(input: Input): string {
  const rows = [...dkimRows(input.dkim), spfRow(input), arcRow(input)]
  if (input.dmarc) rows.push(dmarcRow(input.dmarc, input.arc))
  return `${input.authservId};${rows.map((row) => `\r\n ${MimeHeaders.fold(row)}`).join(';')}`
}

type Property = [name: string, value: string | undefined]

function row(
  method: string,
  result: string,
  comments: readonly string[],
  properties: readonly Property[],
): string {
  const parts = [`${method}=${result}`]
  const text = comments.filter(Boolean).join('; ')
  if (text) parts.push(comment(text))
  for (const [name, value] of properties) {
    const written = value === undefined || value === '' ? undefined : pvalue(value)
    if (written !== undefined) parts.push(`${name}=${written}`)
  }
  return parts.join(' ')
}

function dkimRows(results: readonly Dkim.Result[]): string[] {
  if (results.length === 0) return ['dkim=none']
  return results.map((result) =>
    row(
      'dkim',
      result.result,
      [
        result.reason ?? '',
        result.testing ? 'test mode' : '',
        result.unsignedBodyBytes ? `${result.unsignedBodyBytes} body bytes unsigned` : '',
      ],
      [
        ['header.d', result.domain],
        ['header.i', result.identity],
        ['header.s', result.selector],
        ['header.a', result.algorithm],
        ['header.b', result.signature.slice(0, 8)],
      ],
    ),
  )
}

function spfRow({ authservId, ip, sender, spf }: Input): string {
  const who = spf.identity === 'mailfrom' && sender ? sender : `postmaster@${spf.domain}`
  const detail = spf.reason ? `: ${spf.reason}` : ''
  const text = {
    pass: `domain of ${who} designates ${ip} as permitted sender`,
    fail: `domain of ${who} does not designate ${ip} as permitted sender`,
    softfail: `domain of transitioning ${who} does not designate ${ip} as permitted sender`,
    neutral: `${ip} is neither permitted nor denied by domain of ${who}`,
    none: `${spf.domain} does not designate permitted sender hosts`,
    permerror: `permanent error in processing during lookup of ${who}${detail}`,
    temperror: `error in processing during lookup of ${who}${detail}`,
  }[spf.result]
  return row(
    'spf',
    spf.result,
    [`${authservId}: ${text}`],
    [[spf.identity === 'mailfrom' ? 'smtp.mailfrom' : 'smtp.helo', spf.domain]],
  )
}

function arcRow({ arc, ip }: Input): string {
  const comments =
    arc.result === 'pass' ? [passComment(arc)] : arc.result === 'fail' ? [arc.reason ?? ''] : []
  return row('arc', arc.result, comments, [['smtp.remote-ip', ip]])
}

function dmarcRow(dmarc: Dmarc.Result, arc: Arc.Result): string {
  const { record } = dmarc
  const comments = record
    ? [
        [
          `p=${record.p.toUpperCase()}`,
          record.sp ? `sp=${record.sp.toUpperCase()}` : '',
          `arc=${arc.result}`,
        ]
          .filter(Boolean)
          .join(' '),
      ]
    : [dmarc.reason ?? '']
  return row('dmarc', dmarc.result, comments, [
    ['policy.dmarc', dmarc.result === 'temperror' ? undefined : dmarc.policy],
    ['header.from', dmarc.domain],
  ])
}

function passComment(arc: Arc.Result): string {
  const parts = [`i=${arc.instance}`]
  const results = parseResults(arc.sets.at(-1)?.authResults ?? '')
  const spf = results.find((entry) => entry.method === 'spf')
  if (spf) parts.push(`spf=${spf.result}`)
  for (const dkim of results.filter((entry) => entry.method === 'dkim')) {
    parts.push(`dkim=${dkim.result}`)
    const id = dkim.properties.get('header.i') ?? dkim.properties.get('header.d')
    const domain = id?.slice(id.lastIndexOf('@') + 1)
    if (domain && hostName.test(domain)) parts.push(`dkdomain=${domain}`)
  }
  const dmarc = results.find((entry) => entry.method === 'dmarc')
  if (dmarc) {
    parts.push(`dmarc=${dmarc.result}`)
    const from = dmarc.properties.get('header.from')
    if (from && hostName.test(from)) parts.push(`fromdomain=${from}`)
  }
  return parts.join(' ')
}

type Resinfo = { method: string; result: string; properties: Map<string, string> }

export function parseResults(value: string): Resinfo[] {
  const segments: string[][] = [[]]
  let word = ''
  let depth = 0
  const end = () => {
    if (word) segments.at(-1)!.push(word)
    word = ''
  }
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!
    if (depth > 0) {
      if (char === '\\') i++
      else if (char === '(') depth++
      else if (char === ')') depth--
    } else if (char === '(') {
      depth = 1
      if (!word.endsWith('=')) end()
    } else if (char === '"') {
      for (i++; i < value.length && value[i] !== '"'; i++)
        word += value[i] === '\\' ? (value[++i] ?? '') : value[i]
    } else if (char === ';') {
      end()
      segments.push([])
    } else if (/\s/.test(char)) {
      if (!word.endsWith('=')) end()
    } else if (char === '=') {
      const words = segments.at(-1)!
      if (!word && words.length) word = words.pop()!
      word += '='
    } else word += char
  }
  end()
  const results: Resinfo[] = []
  for (const words of segments.slice(1)) {
    const [first, ...rest] = words
    const equals = first?.indexOf('=') ?? -1
    if (!first || equals < 1) continue
    const method = first.slice(0, equals).replace(/\/.*$/, '').toLowerCase()
    const result = first.slice(equals + 1).toLowerCase()
    if (!keyword.test(method) || !keyword.test(result)) continue
    const properties = new Map<string, string>()
    for (const part of rest) {
      const at = part.indexOf('=')
      if (at < 1) continue
      const name = part.slice(0, at).toLowerCase()
      if (!properties.has(name)) properties.set(name, part.slice(at + 1))
    }
    results.push({ method, result, properties })
  }
  return results
}

function pvalue(value: string): string | undefined {
  const clean = value.replace(/[\p{Cc}]/gu, ' ')
  if (byteLength(clean) > maxValueBytes) return undefined
  if (token.test(clean) || identity.test(clean)) return clean
  return `"${clean.replace(/[\\"]/g, '\\$&')}"`
}

function comment(text: string): string {
  const words = text
    .replace(/[\p{Cc}]/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (byteLength(word) <= maxCommentWordBytes) return word
      let short = ''
      let bytes = 0
      for (const char of word) {
        bytes += byteLength(char)
        if (bytes > maxCommentWordBytes) break
        short += char
      }
      return `${short}...`
    })
  return `(${words.join(' ').replace(/[\\()]/g, '\\$&')})`
}
