import { permerror } from './errors.js'

export type Token =
  | { kind: 'literal'; text: string; escape: boolean }
  | {
      kind: 'macro'
      letter: string
      upper: boolean
      digits: number
      reverse: boolean
      delimiters: string
    }

export type Values = Record<'s' | 'l' | 'o' | 'd' | 'i' | 'v' | 'h' | 'c' | 'r' | 't', string> & {
  p: string
}

const escapes: Record<string, string> = { '%': '%', _: ' ', '-': '%20' }
const body = /^([a-z])(\d*)(r?)([.\-+,/_=]*)$/i
const letters = 'slodiphvcrt'
const unreserved = /[A-Za-z\d\-._~]/

export function parseMacroString(text: string, inExplanation: boolean): Token[] {
  const tokens: Token[] = []
  let literal = ''
  const flush = () => {
    if (literal) tokens.push({ kind: 'literal', text: literal, escape: false })
    literal = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char !== '%') {
      const code = char.charCodeAt(0)
      if (code < 0x21 || code > 0x7e) {
        if (!(inExplanation && code === 0x20)) throw permerror(`Invalid character in "${text}"`)
      }
      literal += char
      continue
    }
    flush()
    const next = text[i + 1]
    if (next !== undefined && next in escapes) {
      tokens.push({ kind: 'literal', text: escapes[next]!, escape: true })
      i++
      continue
    }
    const end = text.indexOf('}', i)
    const match = next === '{' && end > 0 ? body.exec(text.slice(i + 2, end)) : null
    if (!match) throw permerror(`Invalid macro in "${text}"`)
    const [, letter = '', digits = '', reverse = '', delimiters = ''] = match
    const lower = letter.toLowerCase()
    if (!letters.includes(lower) || (!inExplanation && 'crt'.includes(lower))) {
      throw permerror(`Macro letter "${letter}" is not allowed in "${text}"`)
    }
    if (digits && Number(digits) === 0) throw permerror(`Macro "%{${match[0]}}" keeps zero parts`)
    tokens.push({
      kind: 'macro',
      letter: lower,
      upper: letter !== lower,
      digits: digits ? Number(digits) : 0,
      reverse: reverse !== '',
      delimiters: delimiters || '.',
    })
    i = end
  }
  flush()
  return tokens
}

export function parseDomainSpec(text: string): Token[] {
  const tokens = parseMacroString(text, false)
  const last = tokens.at(-1)
  if (!last) throw permerror('Empty domain-spec')
  if (last.kind === 'macro' || last.escape) return tokens
  const labels = last.text.replace(/\.$/, '').split('.')
  if (labels.length < 2 || !isTopLabel(labels.at(-1)!)) {
    throw permerror(`Invalid domain-spec "${text}"`)
  }
  return tokens
}

export function isTopLabel(label: string): boolean {
  return /^(?:[a-z\d]*[a-z][a-z\d]*|[a-z\d]+-[a-z\d-]*[a-z\d])$/i.test(label)
}

export function hasMacro(tokens: readonly Token[], letter: string): boolean {
  return tokens.some((token) => token.kind === 'macro' && token.letter === letter)
}

export function expand(tokens: readonly Token[], values: Values): string {
  let out = ''
  for (const token of tokens) {
    if (token.kind === 'literal') {
      out += token.text
      continue
    }
    let parts = values[token.letter as keyof Values].split(
      new RegExp(`[${token.delimiters.replace(/./g, '\\$&')}]`),
    )
    if (token.reverse) parts.reverse()
    if (token.digits) parts = parts.slice(-token.digits)
    const value = parts.join('.')
    out += token.upper ? urlEscape(value) : value
  }
  return out
}

function urlEscape(value: string): string {
  let out = ''
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte)
    out += unreserved.test(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}
