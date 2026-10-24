import type * as Bytes from '@portable/bytes'
import { InvalidInputError } from './errors.js'
import { toText } from './internal/text.js'
import { decodeWords, encodeWord } from './words.js'

/** One mailbox. `address` is `''` when the input has no address, as in `Undisclosed recipients`. */
export type Mailbox = {
  readonly name: string
  readonly address: string
}

/**
 * A named group of mailboxes (RFC 5322 section 3.4), as in `Team: a@example.com, b@example.com;`.
 */
export type Group = {
  readonly name: string
  readonly group: readonly Mailbox[]
}

/** One entry of an address list: a mailbox or a group. */
export type Address = Mailbox | Group

export declare namespace parseAddresses {
  type Options = {
    /**
     * Throw `InvalidInputError` unless the input is a valid RFC 5322 address list, with the
     * obsolete syntax of section 4 and the UTF-8 of RFC 6532 allowed. @default false
     */
    strict?: boolean | undefined
  }
}

/**
 * Parses an address list, such as the value of a `To` or `From` header. Display names are
 * unquoted and their encoded words decoded, and a comment is used as the name when the mailbox has
 * no other name. Without `strict`, malformed input never throws: each entry gets the first address
 * written in it, and the rest of the entry's text becomes the name.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.parseAddresses('"Reinman, Andris" <andris@example.com>, team: a@example.com;')
 * // [
 * //   { name: 'Reinman, Andris', address: 'andris@example.com' },
 * //   { name: 'team', group: [{ name: '', address: 'a@example.com' }] },
 * // ]
 * ```
 *
 * @throws {InvalidInputError} With `strict: true`, when the input isn't a valid address list.
 */
export function parseAddresses(
  input: string | Bytes.Input,
  options: parseAddresses.Options = {},
): Address[] {
  const { strict = false } = options
  const { list, error } = parseList(toText(input), strict)
  if (strict && error) throw new InvalidInputError(error)
  return list
}

export declare namespace parseMailboxes {
  type Options = parseAddresses.Options
}

/**
 * Parses an address list as `parseAddresses` does, and returns the members of each group in place
 * of the group.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.parseMailboxes('andris@example.com, team: a@example.com, b@example.com;')
 * // [
 * //   { name: '', address: 'andris@example.com' },
 * //   { name: '', address: 'a@example.com' },
 * //   { name: '', address: 'b@example.com' },
 * // ]
 * ```
 *
 * @throws {InvalidInputError} With `strict: true`, when the input isn't a valid address list.
 */
export function parseMailboxes(
  input: string | Bytes.Input,
  options: parseMailboxes.Options = {},
): Mailbox[] {
  return parseAddresses(input, options).flatMap((entry) =>
    'group' in entry ? entry.group : [entry],
  )
}

export declare namespace formatAddresses {
  type Options = Pick<encodeWord.Options, 'charset' | 'wordEncoding'>
}

/**
 * Formats mailboxes and groups as an address list, the reverse of `parseAddresses`. A name that
 * needs quoting is quoted, or written as encoded words when it contains characters outside
 * printable ASCII. Fold the whole header line afterwards.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.formatAddresses([
 *   { name: 'Reinman, Andris', address: 'andris@example.com' },
 *   { name: 'Jõgeva', address: 'j@example.com' },
 * ])
 * // '"Reinman, Andris" <andris@example.com>, =?UTF-8?Q?J=C3=B5geva?= <j@example.com>'
 * ```
 *
 * @throws {InvalidInputError} When an address doesn't parse as one addr-spec.
 */
export function formatAddresses(
  addresses: readonly Address[],
  options: formatAddresses.Options = {},
): string {
  const mailbox = (entry: Mailbox) => {
    const address = checkAddress(entry.address)
    return entry.name === '' ? address : `${phrase(entry.name, options)} <${address}>`
  }
  return addresses
    .map((entry) =>
      'group' in entry
        ? `${phrase(entry.name, options)}:${entry.group.length > 0 ? ' ' + entry.group.map(mailbox).join(', ') : ''};`
        : mailbox(entry),
    )
    .join(', ')
}

function phrase(name: string, options: formatAddresses.Options): string {
  if (/[^\x20-\x7e]|=\?|\?=/.test(name)) return encodeWord(name, options)
  if (/^[\w']+(?: [\w']+)*$/.test(name)) return name
  return quote(name)
}

function checkAddress(address: string): string {
  const parsed = address === '' ? [] : parseAddresses(address, { strict: true })
  const only = parsed[0]
  if (parsed.length !== 1 || !only || 'group' in only || only.name !== '' || only.address === '')
    throw new InvalidInputError(`${JSON.stringify(address)} is not one address.`)
  return only.address
}

type Kind = 'text' | 'quoted' | 'comment' | 'literal' | '@' | '<' | '>' | ':' | ';' | ','

type Role = 'name' | 'address' | 'skip'

type Token = {
  kind: Kind
  value: string
  space: boolean
  role: Role
}

const quote = (text: string) => '"' + text.replace(/["\\]/g, '\\$&') + '"'

// oxlint-disable-next-line no-control-regex
const atext = /^[^\x00-\x20\x7f"(),.:;<>@[\\\]]+$/
// oxlint-disable-next-line no-control-regex
const dotAtom = /^[^\x00-\x20\x7f"(),.:;<>@[\\\]]+(?:\.[^\x00-\x20\x7f"(),.:;<>@[\\\]]+)*$/

const isWsp = (code: number) => code === 0x20 || code === 0x09
const isSpace = (code: number) => isWsp(code) || code === 0x0d || code === 0x0a

/** Parses an address list and returns it with the first reason it isn't valid, or `''`. */
function parseList(text: string, strict: boolean): { list: Address[]; error: string } {
  let error = ''
  const list: Address[] = []
  let group: { name: string; members: Mailbox[] } | null = null
  let tokens: Token[] = []
  let open = -1
  let close = -1
  let last: Kind | '' = ''
  let space = false
  let count = 0

  function parse(): Address[] {
    for (let i = 0; i < text.length;) {
      const code = text.charCodeAt(i)
      if (isSpace(code)) {
        if (strict) checkSpace(i)
        space = true
        i++
      } else if (code === 0x22) i = readQuoted(i)
      else if (code === 0x28) i = readComment(i)
      else if (code === 0x5b && last === '@') i = readLiteral(i)
      else if (
        code === 0x40 ||
        code === 0x3c ||
        code === 0x3e ||
        code === 0x3a ||
        code === 0x3b ||
        code === 0x2c
      ) {
        addToken(text[i] as Kind, text[i]!)
        i++
      } else i = readAtom(i)
    }
    if (open >= 0 && close < 0) invalid('An angle bracket is not closed.')
    endEntry()
    if (group) {
      invalid('A group is not closed with ";".')
      endGroup()
    }
    if (count === 0) invalid('The list holds no address.')
    return mergeNameFragments(list)
  }

  function invalid(reason: string) {
    if (!error) error = reason
  }

  function checkSpace(i: number) {
    const code = text.charCodeAt(i)
    if (code === 0x0a) {
      if (text.charCodeAt(i - 1) !== 0x0d) invalid('A line feed is not part of a CRLF.')
    } else if (code === 0x0d) {
      if (text.charCodeAt(i + 1) !== 0x0a) invalid('A carriage return is not part of a CRLF.')
      else if (!isWsp(text.charCodeAt(i + 2))) invalid('A CRLF is not followed by whitespace.')
    }
  }

  function inner(i: number): number {
    const code = text.charCodeAt(i)
    if (code === 0x5c) {
      if (i + 1 < text.length) return 2
      invalid('A backslash ends the input.')
      return 1
    }
    if (code === 0) invalid('A NUL character is not escaped.')
    else if (code === 0x0d || code === 0x0a) checkSpace(i)
    return 1
  }

  function readQuoted(start: number): number {
    let value = ''
    let i = start + 1
    for (;;) {
      if (i >= text.length) {
        invalid('A quoted string is not closed.')
        break
      }
      const code = text.charCodeAt(i)
      if (code === 0x22) {
        i++
        break
      }
      const length = strict ? inner(i) : code === 0x5c && i + 1 < text.length ? 2 : 1
      if (code === 0x5c && length === 2) value += text[i + 1]
      else if (code !== 0x0d && code !== 0x0a) value += text[i]
      i += length
    }
    addToken('quoted', value)
    return i
  }

  function readComment(start: number): number {
    let value = ''
    let depth = 1
    let i = start + 1
    for (;;) {
      if (i >= text.length) {
        invalid('A comment is not closed.')
        break
      }
      const code = text.charCodeAt(i)
      if (code === 0x29 && --depth === 0) {
        i++
        break
      }
      if (code === 0x28) depth++
      const length = strict ? inner(i) : code === 0x5c && i + 1 < text.length ? 2 : 1
      if (code === 0x5c && length === 2) value += text[i + 1]
      else value += text[i]
      i += length
    }
    tokens.push({
      kind: 'comment',
      value: value.replace(/[\r\n]+/g, ''),
      space: space,
      role: 'name',
    })
    space = true
    return i
  }

  function readLiteral(start: number): number {
    const inAngle = open >= 0 && close < 0
    let i = start + 1
    for (;;) {
      if (i >= text.length || (!inAngle && ',;<>()"'.includes(text[i]!))) {
        invalid('A domain literal is not closed.')
        break
      }
      const code = text.charCodeAt(i)
      if (code === 0x5d) {
        i++
        break
      }
      if (strict) {
        if (code === 0x5b) invalid('A domain literal holds "[".')
        i += inner(i)
      } else i += code === 0x5c && i + 1 < text.length ? 2 : 1
    }
    addToken('literal', text.slice(start, i))
    return i
  }

  function readAtom(start: number): number {
    let i = start
    while (i < text.length) {
      const code = text.charCodeAt(i)
      if (isSpace(code) || '"(@<>:;,'.includes(text[i]!)) break
      i++
    }
    const value = text.slice(start, i)
    if (strict && !atext.test(value.replaceAll('.', 'a')))
      invalid(`${JSON.stringify(value)} holds a character that needs quoting.`)
    addToken('text', value)
    return i
  }

  function addToken(kind: Kind, value: string) {
    const token: Token = { kind, value, space: space, role: 'name' }
    space = false
    last = kind
    const inAngle = open >= 0 && close < 0
    if (inAngle) {
      if (kind === '<') {
        invalid('An angle bracket opens inside another.')
        for (let i = open; i < tokens.length; i++) tokens[i]!.role = 'skip'
        open = tokens.length
      } else if (kind === '>') close = tokens.length
      else if ((kind === ',' && angleHoldsAddress()) || (kind === ';' && group)) {
        invalid('An angle bracket is not closed.')
        close = tokens.length
        separator(kind)
        return
      }
      tokens.push(token)
      return
    }
    if (kind === ',' || kind === ';') return separator(kind)
    if (kind === ':') {
      if (group) {
        invalid('Groups can not be nested.')
      } else {
        markAngle()
        const name = buildName(tokens)
        const quoted = tokens.some((token) => token.kind === 'quoted' && token.role === 'name')
        if (name.text === '' && !quoted) invalid('A group has no name.')
        else if (strict) checkPhrase(tokens)
        group = { name: decodeWords(name.text || name.comments), members: [] }
      }
      resetEntry()
      return
    }
    if (kind === '<') {
      if (open < 0) {
        open = tokens.length
      } else {
        invalid('An entry has two angle addresses.')
        token.kind = 'text'
      }
    } else if (kind === '>') {
      invalid('An angle bracket closes without opening.')
      token.kind = 'text'
    }
    tokens.push(token)
  }

  function angleHoldsAddress(): boolean {
    for (let i = open + 2; i < tokens.length; i++)
      if (tokens[i]!.kind === '@' && tokens[i - 1]!.kind !== ',' && tokens[i - 1]!.kind !== ':')
        return true
    return false
  }

  function separator(kind: ',' | ';') {
    endEntry()
    if (kind === ';') {
      if (group) endGroup()
      else invalid('";" separates two addresses outside a group.')
    }
  }

  function resetEntry() {
    tokens = []
    open = -1
    close = -1
  }

  function endEntry() {
    if (tokens.length > 0) {
      const mailbox = resolve()
      count++
      if (group) group.members.push(mailbox)
      else list.push(mailbox)
    }
    resetEntry()
  }

  function endGroup() {
    list.push({ name: group!.name, group: mergeNameFragments(group!.members) })
    count++
    group = null
  }

  function markAngle() {
    if (open < 0) return
    const end = close < 0 ? tokens.length : close
    for (let i = open; i <= end && i < tokens.length; i++) tokens[i]!.role = 'skip'
  }

  function resolve(): Mailbox {
    const end = close < 0 ? tokens.length : close
    let address = ''
    if (open >= 0) {
      tokens[open]!.role = 'skip'
      if (end < tokens.length) tokens[end]!.role = 'skip'
      let from = open + 1
      while (from < end && tokens[from]!.role === 'skip') from++
      from = skipRoute(tokens, from, close)
      address = takeAddress(from, end)
      if (strict) {
        checkPhrase(tokens.slice(0, open))
        for (let i = from; i < tokens.length; i++) {
          const token = tokens[i]!
          if (token.kind !== 'comment' && token.role === 'name')
            invalid(`${JSON.stringify(token.value)} follows the address.`)
        }
        if (!address) invalid('An angle address is empty.')
      }
    } else {
      address = takeAddress(0, tokens.length)
      if (!address) {
        const words = tokens.filter((token) => token.kind !== 'comment')
        const only = words[0]
        if (words.length === 1 && only!.kind === 'quoted' && /^[^@]+@[^@]+$/.test(only!.value)) {
          const [local, domain] = only!.value.split('@') as [string, string]
          if (dotAtom.test(local) && dotAtom.test(domain)) {
            only!.role = 'address'
            address = only!.value
          }
        }
      }
      if (strict) {
        if (!address) invalid('An entry holds no address.')
        for (const token of tokens)
          if (token.kind !== 'comment' && token.role === 'name')
            invalid(`${JSON.stringify(token.value)} is not part of the address.`)
      }
    }
    const name = buildName(tokens)
    return { name: decodeWords(name.text || name.comments), address }
  }

  function takeAddress(from: number, to: number): string {
    let start = -1
    let previous: Token | undefined
    let gap = false
    let found = false
    let end = to
    for (let i = from; i < to; i++) {
      const token = tokens[i]!
      if (token.role === 'skip') continue
      if (token.kind === 'comment') {
        gap = true
        continue
      }
      const tight = !gap && !token.space
      const secondAt = found && token.kind === '@' && !tight && previous?.kind !== '@'
      const joined =
        previous !== undefined &&
        !secondAt &&
        (tight ||
          previous.kind === '@' ||
          token.kind === '@' ||
          (previous.kind === 'text' && previous.value.endsWith('.')) ||
          (token.kind === 'text' && token.value.startsWith('.')))
      if (!joined) {
        if (found) {
          end = i
          break
        }
        start = i
      }
      if (token.kind === '@') found = true
      previous = token
      gap = false
    }
    if (!found) return ''
    const run: Token[] = []
    for (let i = start; i < end; i++) {
      const token = tokens[i]!
      if (token.kind === 'comment' || token.role === 'skip') continue
      token.role = 'address'
      run.push(token)
    }
    return formatSpec(run)
  }

  function formatSpec(run: readonly Token[]): string {
    const at = run.findIndex((token) => token.kind === '@')
    const single =
      at > 0 && at < run.length - 1 && run.findIndex((t, i) => i > at && t.kind === '@') < 0
    const raw = (token: Token) => (token.kind === 'quoted' ? quote(token.value) : token.value)
    if (!single) {
      invalid('An address does not have one "@" between a local part and a domain.')
      return run.map(raw).join('')
    }
    const local = run.slice(0, at)
    const domain = run.slice(at + 1)
    if (strict) {
      if (!isWords(local)) invalid('The local part of an address is malformed.')
      if (!(domain.length === 1 && domain[0]!.kind === 'literal') && !isWords(domain, true))
        invalid('The domain of an address is malformed.')
    }
    let localPart = local.map(raw).join('')
    if (local.some((token) => token.kind === 'quoted')) {
      const semantic = local.map((token) => token.value).join('')
      localPart = dotAtom.test(semantic) ? semantic : quote(semantic)
    }
    return localPart + '@' + domain.map(raw).join('')
  }

  function checkPhrase(tokens: readonly Token[]) {
    let first = true
    for (const token of tokens) {
      if (token.kind === 'comment' || token.role === 'skip') continue
      if (
        (token.kind !== 'text' && token.kind !== 'quoted') ||
        (first && token.kind === 'text' && token.value.startsWith('.'))
      )
        invalid(`${JSON.stringify(token.value)} can't be part of a display name.`)
      first = false
    }
  }

  return { list: parse(), error }
}

/**
 * Skips an obsolete source route (RFC 5322 section 4.4), as in `<@relay.example:user@example.com>`.
 */
function skipRoute(tokens: Token[], from: number, to: number): number {
  if (tokens[from]?.kind !== '@') return from
  for (let i = from; i < to; i++) {
    if (tokens[i]!.kind !== ':') continue
    for (let j = i + 1; j < to; j++) {
      if (tokens[j]!.kind !== '@') continue
      for (let k = from; k <= i; k++) if (tokens[k]!.kind !== 'comment') tokens[k]!.role = 'skip'
      return i + 1
    }
    return from
  }
  return from
}

/** Whether tokens spell `word *("." word)`, the dot-atom or obs-local-part and obs-domain forms. */
function isWords(tokens: readonly Token[], atomsOnly = false): boolean {
  let expectWord = true
  for (const token of tokens) {
    if (token.kind === 'quoted' && !atomsOnly) {
      if (!expectWord) return false
      expectWord = false
      continue
    }
    if (token.kind !== 'text') return false
    for (const part of token.value.split(/(\.)/)) {
      if (part === '') continue
      if ((part === '.') === expectWord) return false
      expectWord = part === '.'
    }
  }
  return !expectWord
}

function buildName(tokens: readonly Token[]): { text: string; comments: string } {
  let text = ''
  let comments = ''
  let gap = false
  for (const token of tokens) {
    if (token.space) gap = true
    if (token.kind === 'comment') {
      if (token.role !== 'skip') comments += (comments ? ' ' : '') + token.value
      gap = true
    } else if (token.role === 'name') {
      if (text && gap) text += ' '
      text += token.value
      gap = false
    } else if (token.role === 'address') gap = false
  }
  return { text, comments }
}

/**
 * Joins an unquoted display name that a comma split into entries, as in
 * `Joe Foo, PhD <joe@example.com>`: an entry with only a name is joined to a following entry that
 * has both a name and an address.
 */
function mergeNameFragments<value extends Address>(list: readonly value[]): value[] {
  const merged: value[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const current = list[i]!
    const next = merged[merged.length - 1]
    if (
      next &&
      !('group' in current) &&
      !('group' in next) &&
      current.address === '' &&
      current.name !== '' &&
      next.address !== '' &&
      next.name !== ''
    )
      merged[merged.length - 1] = { ...next, name: `${current.name}, ${next.name}` }
    else merged.push(current)
  }
  return merged.reverse()
}
