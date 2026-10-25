const special = /[\s/\\?#%@:[\]]/;

/**
 * Converts a domain to lower-case ASCII. A domain of printable ASCII is only lowercased, and any
 * other domain goes through the URL host parser, which applies UTS #46 with the runtime's own
 * tables, so this function adds none of this package's tables to a bundle. The parser also cuts a
 * host at `/`, `?` or `#` and percent-decodes it, so `hostToAscii` returns `undefined` if the
 * domain contains one of those or another character with a special meaning in a URL authority,
 * or if the parser rejects the domain.
 */
export function hostToAscii(domain: string): string | undefined {
  if (special.test(domain)) {
    return undefined;
  }
  if (/^[\x21-\x7e]*$/.test(domain)) {
    return domain.toLowerCase();
  }
  try {
    return new URL(`http://${domain}/`).hostname;
  } catch {
    return undefined;
  }
}
