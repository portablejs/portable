const special = /[\0-\x20/\\?#%@:[\]]/;

/**
 * Converts a domain to lower-case ASCII. The URL host parser cuts a host at `/`, `?`, or `#`,
 * percent-decodes it, and removes tabs and newlines, so `hostToAscii` first returns `undefined` if
 * the domain contains a space, a control character, or a character with a special meaning in a URL
 * authority. It lowercases a domain of printable ASCII and passes any other domain to the parser,
 * which applies UTS #46 with the runtime's own tables, and returns `undefined` if the parser
 * rejects it. `toAscii` and `toUnicode` also check `xn--` labels in ASCII input and apply the bidi
 * rule, and `hostToAscii` does neither.
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
