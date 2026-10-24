import * as MimeHeaders from '@portable/mime-headers'
import { InvalidInputError } from './errors.js'
import { hostToAscii } from '@portable/idna/internal'

/**
 * One mailbox. Without a `name`, only the address is written.
 *
 * @example
 * ```ts
 * const mailbox: Mail.Mailbox = { name: 'Mari Tamm', address: 'mari@example.com' }
 * ```
 */
export type Mailbox = {
  readonly name?: string | undefined
  readonly address: string
}

/**
 * The recipients or senders of one header: an address list as text, a `Mailbox`, or a list of
 * either.
 *
 * @example
 * ```ts
 * const to: Mail.Addresses = ['Mari <mari@example.com>', { name: 'Jaan', address: 'jaan@example.com' }]
 * const cc: Mail.Addresses = 'Team: a@example.com, b@example.com;'
 * ```
 */
export type Addresses = string | Mailbox | readonly (string | Mailbox)[]

/**
 * The SMTP envelope of a message: the `MAIL FROM` address and every `RCPT TO` address.
 *
 * @example
 * ```ts
 * const { from, to }: Mail.Envelope = Mail.envelope(message)
 * ```
 */
export type Envelope = {
  /** The first `From` address, or the first `Sender` address when there is no `From`. */
  from: string | undefined
  /**
   * Every `To`, `Cc` and `Bcc` address once, in that order, with group members in place of groups.
   */
  to: string[]
}

type Entry = MimeHeaders.Mailbox | MimeHeaders.Group

export function parse(input: Addresses): Entry[] {
  const items = (
    typeof input === 'string' || 'address' in input ? [input] : input
  ) satisfies readonly (string | Mailbox)[]
  const entries: Entry[] = []
  for (const item of items) {
    if (typeof item === 'string') {
      for (const entry of MimeHeaders.parseAddresses(item))
        entries.push(
          'group' in entry
            ? { name: entry.name, group: entry.group.map(normalizeMailbox) }
            : normalizeMailbox(entry),
        )
    } else entries.push(normalizeMailbox({ name: item.name ?? '', address: item.address }))
  }
  return entries
}

function normalizeMailbox(mailbox: { name: string; address: string }): MimeHeaders.Mailbox {
  const address = check(normalizeAddress(mailbox.address))
  return { name: mailbox.name, address }
}

function check(address: string): string {
  try {
    return MimeHeaders.formatAddresses([{ name: '', address }])
  } catch (error) {
    throw new InvalidInputError(`${JSON.stringify(address)} is not one email address.`, {
      cause: error,
    })
  }
}

// oxlint-disable-next-line no-control-regex
const nonAscii = /[^\x00-\x7f]/

function normalizeAddress(address: string): string {
  const at = address.endsWith(']') ? address.lastIndexOf('@[') : address.lastIndexOf('@')
  if (at < 0) return address
  const local = address.slice(0, at)
  let domain = address.slice(at + 1).toLowerCase()
  if (nonAscii.test(domain) && !nonAscii.test(local)) domain = hostToAscii(domain) || domain
  return local + '@' + domain
}

export function format(
  entries: readonly Entry[],
  charset: MimeHeaders.CharsetEncoder | undefined,
): string {
  return entries
    .map((entry) =>
      MimeHeaders.formatAddresses([entry], {
        charset,
        wordEncoding: wordEncoding(entry.name),
      }),
    )
    .join(', ')
}

/** Q keeps mostly Latin text readable, and B is shorter for everything else. */
export function wordEncoding(text: string): MimeHeaders.WordEncoding {
  let latin = 0
  let other = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin++
    else if (code >= 0x80 || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d))
      other++
  }
  return other < latin ? 'Q' : 'B'
}

export function mailboxes(input: Addresses | undefined): MimeHeaders.Mailbox[] {
  if (input === undefined) return []
  return parse(input).flatMap((entry) => ('group' in entry ? entry.group : [entry]))
}

/**
 * Returns the SMTP envelope for a message, the addresses a transport passes to `MAIL FROM` and
 * `RCPT TO`. `Bcc` recipients are included, although `encodeStream` leaves the `Bcc` header out.
 * Addresses are normalized as in the message headers, and each recipient is listed once.
 *
 * @example
 * ```ts
 * import * as Mail from '@portable/mail'
 *
 * Mail.envelope({
 *   from: 'Mari <mari@example.com>',
 *   to: 'a@example.com, B <b@example.com>',
 *   bcc: ['a@example.com', 'c@example.com'],
 * })
 * // { from: 'mari@example.com', to: ['a@example.com', 'b@example.com', 'c@example.com'] }
 * ```
 *
 * @throws {InvalidInputError} When an address isn't one addr-spec.
 */
export function envelope(message: {
  readonly from?: Addresses | undefined
  readonly sender?: Addresses | undefined
  readonly to?: Addresses | undefined
  readonly cc?: Addresses | undefined
  readonly bcc?: Addresses | undefined
}): Envelope {
  const from = mailboxes(message.from)[0] ?? mailboxes(message.sender)[0]
  const to = new Set<string>()
  for (const input of [message.to, message.cc, message.bcc])
    for (const mailbox of mailboxes(input)) to.add(mailbox.address)
  return { from: from?.address, to: [...to] }
}
