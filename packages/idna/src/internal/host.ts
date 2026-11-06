const special = /[\0-\x20/\\?#%@:[\]]/;

/**
 * Converts a domain to lower-case ASCII. A domain of printable ASCII is only lowercased, and any
 * other domain goes through the URL host parser, which applies UTS #46 with the runtime's own
 * tables. The parser also cuts a host at `/`, `?`, or `#`, percent-decodes it, and removes tabs and
 * newlines. So `hostToAscii` returns `undefined` if the parser rejects the domain, or if the domain
 * contains a character with a special meaning in a URL authority, a space, or a control character. It doesn't check `xn--` labels or apply the bidi rule, which
 * `toAscii` does.
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
