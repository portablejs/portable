import * as MimeHeaders from '@portable/mime-headers';
import { isMostlyLatin } from './body.js';
import { InvalidInputError } from './errors.js';
import { hostToAscii } from '@portable/idna/internal';

/**
 * One mailbox. Without a `name`, only the address is written.
 */
export type Mailbox = {
  readonly name?: string | undefined;
  readonly address: string;
};

/**
 * The recipients or senders of one header: an address list as text, a `Mailbox`, or a list of
 * either.
 */
export type Addresses = string | Mailbox | readonly (string | Mailbox)[];

/** The SMTP envelope of a message: the `MAIL FROM` address and every `RCPT TO` address. */
export type Envelope = {
  /** The first `From` address, or the first `Sender` address when there is no `From`. */
  from: string;
  /**
   * Every `To`, `Cc` and `Bcc` address once, in that order, with group members in place of groups.
   */
  to: readonly string[];
};

type Entry = MimeHeaders.Mailbox | MimeHeaders.Group;

export function parse(input: Addresses): Entry[] {
  const items = (
    typeof input === 'string' || 'address' in input ? [input] : input
  ) satisfies readonly (string | Mailbox)[];
  const entries: Entry[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      for (const entry of MimeHeaders.parseAddresses(item)) {
        entries.push(
          'group' in entry
            ? { name: entry.name, group: entry.group.map(normalizeMailbox) }
            : normalizeMailbox(entry),
        );
      }
    } else {
      entries.push(normalizeMailbox({ name: item.name ?? '', address: item.address }));
    }
  }
  return entries;
}

function normalizeMailbox(mailbox: { name: string; address: string }): MimeHeaders.Mailbox {
  const address = formatAddress(normalizeAddress(mailbox.address));
  return { name: mailbox.name, address };
}

function formatAddress(address: string): string {
  try {
    return MimeHeaders.formatAddresses([{ name: '', address }]);
  } catch (error) {
    throw new InvalidInputError(`${JSON.stringify(address)} is not one email address.`, {
      cause: error,
    });
  }
}

// oxlint-disable-next-line no-control-regex
const nonAscii = /[^\x00-\x7f]/;

function normalizeAddress(address: string): string {
  const at = address.endsWith(']') ? address.lastIndexOf('@[') : address.lastIndexOf('@');
  if (at < 0) {
    return address;
  }
  const local = address.slice(0, at);
  let domain = address.slice(at + 1).toLowerCase();
  if (nonAscii.test(domain) && !nonAscii.test(local)) {
    domain = hostToAscii(domain) || domain;
  }
  return local + '@' + domain;
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
    .join(', ');
}

export function wordEncoding(text: string): MimeHeaders.WordEncoding {
  return isMostlyLatin(text) ? 'Q' : 'B';
}

export function mailboxes(input: Addresses | undefined): MimeHeaders.Mailbox[] {
  if (input === undefined) {
    return [];
  }
  return parse(input).flatMap((entry) => ('group' in entry ? entry.group : [entry]));
}

/**
 * Returns the SMTP envelope for a message, the addresses a transport passes to `MAIL FROM` and
 * `RCPT TO`. `Bcc` recipients are included, although `encodeStream` leaves the `Bcc` header out.
 * Addresses are normalized as in the message headers, and each recipient is listed once. The
 * result can be spread into `Smtp.send`.
 *
 * @example
 * ```ts
 * import * as Mail from '@portable/mail';
 *
 * Mail.envelope({
 *   from: 'Mari <mari@example.com>',
 *   to: 'a@example.com, B <b@example.com>',
 *   bcc: ['a@example.com', 'c@example.com'],
 * });
 * // { from: 'mari@example.com', to: ['a@example.com', 'b@example.com', 'c@example.com'] }
 * ```
 *
 * @throws {InvalidInputError} When an address isn't one addr-spec, or the message has neither a
 * `From` nor a `Sender` address.
 */
export function envelope(message: {
  readonly from?: Addresses | undefined;
  readonly sender?: Addresses | undefined;
  readonly to?: Addresses | undefined;
  readonly cc?: Addresses | undefined;
  readonly bcc?: Addresses | undefined;
}): Envelope {
  const from = mailboxes(message.from)[0] ?? mailboxes(message.sender)[0];
  if (from === undefined) {
    throw new InvalidInputError('The message has no From or Sender address for MAIL FROM.');
  }
  const to = new Set<string>();
  for (const input of [message.to, message.cc, message.bcc]) {
    for (const mailbox of mailboxes(input)) {
      to.add(mailbox.address);
    }
  }
  return { from: from.address, to: [...to] };
}
