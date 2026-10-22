const special = /[\s/\\?#%@:[\]]/

/**
 * Converts a domain to lower-case ASCII with the URL host parser, which applies UTS #46 with the
 * runtime's own tables, so it adds none of this package's tables to a bundle. The parser also cuts
 * a host at `/`, `?` or `#` and percent-decodes it, so `hostToAscii` returns `undefined` for those
 * characters and the others that a URL authority treats specially, and when the parser rejects
 * the domain.
 */
export function hostToAscii(domain: string): string | undefined {
  if (special.test(domain)) return undefined
  if (/^[\x21-\x7e]*$/.test(domain)) return domain.toLowerCase()
  try {
    return new URL(`http://${domain}/`).hostname
  } catch {
    return undefined
  }
}
