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
  input: string | Uint8Array,
  options: parseAddresses.Options = {},
): Address[] {
  const { strict = false } = options
  const parser = new Parser(toText(input), strict)
  const list = parser.run()
  if (strict && parser.error) throw new InvalidInputError(parser.error)
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
  input: string | Uint8Array,
  options: parseMailboxes.Options = {},
): Mailbox[] {
  return parseAddresses(input, options).flatMap((entry) =>
    'group' in entry ? entry.group : [entry],
  )
}

export declare namespace formatAddresses {
  type Options = Pick<encodeWord.Options, 'charset' | 'encoding'>
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

class Parser {
  error = ''
  private readonly list: Address[] = []
  private group: { name: string; members: Mailbox[] } | null = null
  private tokens: Token[] = []
  private open = -1
  private close = -1
  private last: Kind | '' = ''
  private space = false
  private count = 0

  constructor(
    private readonly text: string,
    private readonly strict: boolean,
  ) {}

  run(): Address[] {
    const { text } = this
    for (let i = 0; i < text.length;) {
      const code = text.charCodeAt(i)
      if (isSpace(code)) {
        if (this.strict) this.checkSpace(i)
        this.space = true
        i++
      } else if (code === 0x22) i = this.quoted(i)
      else if (code === 0x28) i = this.comment(i)
      else if (code === 0x5b && this.last === '@') i = this.literal(i)
      else if (
        code === 0x40 ||
        code === 0x3c ||
        code === 0x3e ||
        code === 0x3a ||
        code === 0x3b ||
        code === 0x2c
      ) {
        this.token(text[i] as Kind, text[i]!)
        i++
      } else i = this.atom(i)
    }
    if (this.open >= 0 && this.close < 0) this.invalid('An angle bracket is not closed.')
    this.endEntry()
    if (this.group) {
      this.invalid('A group is not closed with ";".')
      this.endGroup()
    }
    if (this.count === 0) this.invalid('The list holds no address.')
    return mergeNameFragments(this.list)
  }

  private invalid(reason: string) {
    if (!this.error) this.error = reason
  }

  private checkSpace(i: number) {
    const { text } = this
    const code = text.charCodeAt(i)
    if (code === 0x0a) {
      if (text.charCodeAt(i - 1) !== 0x0d) this.invalid('A line feed is not part of a CRLF.')
    } else if (code === 0x0d) {
      if (text.charCodeAt(i + 1) !== 0x0a) this.invalid('A carriage return is not part of a CRLF.')
      else if (!isWsp(text.charCodeAt(i + 2))) this.invalid('A CRLF is not followed by whitespace.')
    }
  }

  private inner(i: number): number {
    const { text } = this
    const code = text.charCodeAt(i)
    if (code === 0x5c) {
      if (i + 1 < text.length) return 2
      this.invalid('A backslash ends the input.')
      return 1
    }
    if (code === 0) this.invalid('A NUL character is not escaped.')
    else if (code === 0x0d || code === 0x0a) this.checkSpace(i)
    return 1
  }

  private quoted(start: number): number {
    const { text } = this
    let value = ''
    let i = start + 1
    for (;;) {
      if (i >= text.length) {
        this.invalid('A quoted string is not closed.')
        break
      }
      const code = text.charCodeAt(i)
      if (code === 0x22) {
        i++
        break
      }
      const length = this.strict ? this.inner(i) : code === 0x5c && i + 1 < text.length ? 2 : 1
      if (code === 0x5c && length === 2) value += text[i + 1]
      else if (code !== 0x0d && code !== 0x0a) value += text[i]
      i += length
    }
    this.token('quoted', value)
    return i
  }

  private comment(start: number): number {
    const { text } = this
    let value = ''
    let depth = 1
    let i = start + 1
    for (;;) {
      if (i >= text.length) {
        this.invalid('A comment is not closed.')
        break
      }
      const code = text.charCodeAt(i)
      if (code === 0x29 && --depth === 0) {
        i++
        break
      }
      if (code === 0x28) depth++
      const length = this.strict ? this.inner(i) : code === 0x5c && i + 1 < text.length ? 2 : 1
      if (code === 0x5c && length === 2) value += text[i + 1]
      else value += text[i]
      i += length
    }
    this.tokens.push({
      kind: 'comment',
      value: value.replace(/[\r\n]+/g, ''),
      space: this.space,
      role: 'name',
    })
    this.space = true
    return i
  }

  private literal(start: number): number {
    const { text } = this
    const inAngle = this.open >= 0 && this.close < 0
    let i = start + 1
    for (;;) {
      if (i >= text.length || (!inAngle && ',;<>()"'.includes(text[i]!))) {
        this.invalid('A domain literal is not closed.')
        break
      }
      const code = text.charCodeAt(i)
      if (code === 0x5d) {
        i++
        break
      }
      if (this.strict) {
        if (code === 0x5b) this.invalid('A domain literal holds "[".')
        i += this.inner(i)
      } else i += code === 0x5c && i + 1 < text.length ? 2 : 1
    }
    this.token('literal', text.slice(start, i))
    return i
  }

  private atom(start: number): number {
    const { text } = this
    let i = start
    while (i < text.length) {
      const code = text.charCodeAt(i)
      if (isSpace(code) || '"(@<>:;,'.includes(text[i]!)) break
      i++
    }
    const value = text.slice(start, i)
    if (this.strict && !atext.test(value.replaceAll('.', 'a')))
      this.invalid(`${JSON.stringify(value)} holds a character that needs quoting.`)
    this.token('text', value)
    return i
  }

  private token(kind: Kind, value: string) {
    const token: Token = { kind, value, space: this.space, role: 'name' }
    this.space = false
    this.last = kind
    const inAngle = this.open >= 0 && this.close < 0
    if (inAngle) {
      if (kind === '<') {
        this.invalid('An angle bracket opens inside another.')
        for (let i = this.open; i < this.tokens.length; i++) this.tokens[i]!.role = 'skip'
        this.open = this.tokens.length
      } else if (kind === '>') this.close = this.tokens.length
      else if ((kind === ',' && this.angleHoldsAddress()) || (kind === ';' && this.group)) {
        this.invalid('An angle bracket is not closed.')
        this.close = this.tokens.length
        this.separator(kind)
        return
      }
      this.tokens.push(token)
      return
    }
    if (kind === ',' || kind === ';') return this.separator(kind)
    if (kind === ':') {
      if (this.group) {
        this.invalid('Groups can not be nested.')
      } else {
        this.markAngle()
        const name = buildName(this.tokens)
        const quoted = this.tokens.some((token) => token.kind === 'quoted' && token.role === 'name')
        if (name.text === '' && !quoted) this.invalid('A group has no name.')
        else if (this.strict) this.checkPhrase(this.tokens)
        this.group = { name: decodeWords(name.text || name.comments), members: [] }
      }
      this.resetEntry()
      return
    }
    if (kind === '<') {
      if (this.open < 0) {
        this.open = this.tokens.length
      } else {
        this.invalid('An entry has two angle addresses.')
        token.kind = 'text'
      }
    } else if (kind === '>') {
      this.invalid('An angle bracket closes without opening.')
      token.kind = 'text'
    }
    this.tokens.push(token)
  }

  private angleHoldsAddress(): boolean {
    for (let i = this.open + 2; i < this.tokens.length; i++)
      if (
        this.tokens[i]!.kind === '@' &&
        this.tokens[i - 1]!.kind !== ',' &&
        this.tokens[i - 1]!.kind !== ':'
      )
        return true
    return false
  }

  private separator(kind: ',' | ';') {
    this.endEntry()
    if (kind === ';') {
      if (this.group) this.endGroup()
      else this.invalid('";" separates two addresses outside a group.')
    }
  }

  private resetEntry() {
    this.tokens = []
    this.open = -1
    this.close = -1
  }

  private endEntry() {
    const { tokens } = this
    if (tokens.length > 0) {
      const mailbox = this.resolve()
      this.count++
      if (this.group) this.group.members.push(mailbox)
      else this.list.push(mailbox)
    }
    this.resetEntry()
  }

  private endGroup() {
    this.list.push({ name: this.group!.name, group: mergeNameFragments(this.group!.members) })
    this.count++
    this.group = null
  }

  private markAngle() {
    if (this.open < 0) return
    const end = this.close < 0 ? this.tokens.length : this.close
    for (let i = this.open; i <= end && i < this.tokens.length; i++) this.tokens[i]!.role = 'skip'
  }

  private resolve(): Mailbox {
    const { tokens, open, strict } = this
    const close = this.close < 0 ? tokens.length : this.close
    let address = ''
    if (open >= 0) {
      tokens[open]!.role = 'skip'
      if (close < tokens.length) tokens[close]!.role = 'skip'
      let from = open + 1
      while (from < close && tokens[from]!.role === 'skip') from++
      from = skipRoute(tokens, from, close)
      address = this.takeAddress(from, close)
      if (strict) {
        this.checkPhrase(tokens.slice(0, open))
        for (let i = from; i < tokens.length; i++) {
          const token = tokens[i]!
          if (token.kind !== 'comment' && token.role === 'name')
            this.invalid(`${JSON.stringify(token.value)} follows the address.`)
        }
        if (!address) this.invalid('An angle address is empty.')
      }
    } else {
      address = this.takeAddress(0, tokens.length)
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
        if (!address) this.invalid('An entry holds no address.')
        for (const token of tokens)
          if (token.kind !== 'comment' && token.role === 'name')
            this.invalid(`${JSON.stringify(token.value)} is not part of the address.`)
      }
    }
    const name = buildName(tokens)
    return { name: decodeWords(name.text || name.comments), address }
  }

  private takeAddress(from: number, to: number): string {
    const { tokens } = this
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
    return this.formatSpec(run)
  }

  private formatSpec(run: readonly Token[]): string {
    const at = run.findIndex((token) => token.kind === '@')
    const single =
      at > 0 && at < run.length - 1 && run.findIndex((t, i) => i > at && t.kind === '@') < 0
    const raw = (token: Token) => (token.kind === 'quoted' ? quote(token.value) : token.value)
    if (!single) {
      this.invalid('An address does not have one "@" between a local part and a domain.')
      return run.map(raw).join('')
    }
    const local = run.slice(0, at)
    const domain = run.slice(at + 1)
    if (this.strict) {
      if (!isWords(local)) this.invalid('The local part of an address is malformed.')
      if (!(domain.length === 1 && domain[0]!.kind === 'literal') && !isWords(domain, true))
        this.invalid('The domain of an address is malformed.')
    }
    let localPart = local.map(raw).join('')
    if (local.some((token) => token.kind === 'quoted')) {
      const semantic = local.map((token) => token.value).join('')
      localPart = dotAtom.test(semantic) ? semantic : quote(semantic)
    }
    return localPart + '@' + domain.map(raw).join('')
  }

  private checkPhrase(tokens: readonly Token[]) {
    let first = true
    for (const token of tokens) {
      if (token.kind === 'comment' || token.role === 'skip') continue
      if (
        (token.kind !== 'text' && token.kind !== 'quoted') ||
        (first && token.kind === 'text' && token.value.startsWith('.'))
      )
        this.invalid(`${JSON.stringify(token.value)} can't be part of a display name.`)
      first = false
    }
  }
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
function mergeNameFragments<T extends Address>(list: readonly T[]): T[] {
  const merged: T[] = []
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
