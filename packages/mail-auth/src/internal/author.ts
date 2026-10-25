import * as MimeHeaders from '@portable/mime-headers';

export type SkipReason =
  | 'no-author-domain'
  | 'multiple-author-domains'
  | 'invalid-author-domain'
  | 'multiple-from-fields';

export type Author = { domain: string } | { skip: SkipReason };

/**
 * The Author Domain (RFC 9989 section 3.2.10). DMARC needs exactly one From field with one
 * domain (section 5.3.1). `header` is the header section without the empty line that ends it.
 */
export function author(header: Uint8Array): Author {
  const fields = MimeHeaders.parseHeaders(header).filter(
    (field) => field.name.toLowerCase() === 'from',
  );
  if (fields.length === 0) {
    return { skip: 'no-author-domain' };
  }
  if (fields.length > 1) {
    return { skip: 'multiple-from-fields' };
  }
  let mailboxes: MimeHeaders.Mailbox[];
  try {
    mailboxes = MimeHeaders.parseMailboxes(fields[0]!.value, { strict: true });
  } catch (error) {
    if (error instanceof MimeHeaders.InvalidInputError) {
      return { skip: 'invalid-author-domain' };
    }
    throw error;
  }
  const domains = new Set<string>();
  for (const { address } of mailboxes) {
    const at = address.lastIndexOf('@');
    if (at < 1 || at === address.length - 1) {
      return { skip: 'invalid-author-domain' };
    }
    domains.add(address.slice(at + 1).toLowerCase());
  }
  if (domains.size === 0) {
    return { skip: 'no-author-domain' };
  }
  if (domains.size > 1) {
    return { skip: 'multiple-author-domains' };
  }
  return { domain: [...domains][0]! };
}
