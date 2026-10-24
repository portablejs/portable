import * as MimeHeaders from '@portable/mime-headers'

export type SkipReason =
  | 'no-author-domain'
  | 'multiple-author-domains'
  | 'invalid-author-domain'
  | 'multiple-from-fields'

export type Author = { domain: string } | { skip: SkipReason }

const CR = 0x0d
const LF = 0x0a

/**
 * The Author Domain (RFC 9989 section 3.2.10). DMARC needs exactly one From field with one
 * domain (section 5.3.1).
 */
export function author(message: Uint8Array): Author {
  const fields = MimeHeaders.parseHeaders(headerSection(message)).filter(
    (field) => field.name.toLowerCase() === 'from',
  )
  if (fields.length === 0) return { skip: 'no-author-domain' }
  if (fields.length > 1) return { skip: 'multiple-from-fields' }
  let mailboxes: MimeHeaders.Mailbox[]
  try {
    mailboxes = MimeHeaders.parseMailboxes(fields[0]!.value, { strict: true })
  } catch (error) {
    if (error instanceof MimeHeaders.InvalidInputError) return { skip: 'invalid-author-domain' }
    throw error
  }
  const domains = new Set<string>()
  for (const { address } of mailboxes) {
    const at = address.lastIndexOf('@')
    if (at < 1 || at === address.length - 1) return { skip: 'invalid-author-domain' }
    domains.add(address.slice(at + 1).toLowerCase())
  }
  if (domains.size === 0) return { skip: 'no-author-domain' }
  if (domains.size > 1) return { skip: 'multiple-author-domains' }
  return { domain: [...domains][0]! }
}

function headerSection(message: Uint8Array): Uint8Array {
  if (message[0] === LF || (message[0] === CR && message[1] === LF)) return message.subarray(0, 0)
  for (let i = message.indexOf(LF); i >= 0; i = message.indexOf(LF, i + 1)) {
    const next = message[i + 1] === CR ? i + 2 : i + 1
    if (message[next] === LF) return message.subarray(0, i + 1)
  }
  return message
}
