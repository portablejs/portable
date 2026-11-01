import { findBidiViolation } from './internal/bidiRule.js';
import { hostToAscii } from './internal/host.js';
import * as Punycode from './internal/punycode.js';
import { InvalidInputError } from './errors.js';

export declare namespace toAscii {
  type Options = {
    /**
     * Apply the hostname rules of STD 3 and the DNS length limits: only `a-z`, `0-9`, and `-` in a
     * label, no `-` at either end of a label or in its third and fourth positions, and at most 63
     * characters in a label and 253 in the name. This is the URL Standard's `beStrict`.
     * @default false
     */
    strict?: boolean | undefined;
  };
}

export declare namespace toUnicode {
  type Options = {
    /**
     * Apply the hostname rules of STD 3: only `a-z`, `0-9`, and `-` in a label, and no `-` at
     * either end of a label or in its third and fourth positions.
     * @default false
     */
    strict?: boolean | undefined;
  };
}

/**
 * Converts a domain name to the ASCII form that DNS and `URL` use, with Punycode `xn--` labels for
 * non-ASCII labels. Uses the runtime's URL host parser for UTS #46, so it rejects any domain the
 * parser rejects, such as a domain with a character newer than the parser's Unicode tables. It
 * applies the bidi rule itself, because the parsers in Node and Cloudflare Workers skip it.
 *
 * @example
 * ```ts
 * import * as Idna from '@portable/idna';
 *
 * Idna.toAscii('Bücher.example'); // 'xn--bcher-kva.example'
 * ```
 *
 * @throws {InvalidInputError} if the domain isn't valid.
 */
export function toAscii(domain: string, options: toAscii.Options = {}): string {
  const { strict = false } = options;
  const ascii = !strict && !nonAscii.test(domain) ? parse(domain) : convert(domain, strict).ascii;
  if (ascii === '') {
    throw new InvalidInputError('Domain is empty.');
  }
  if (strict) {
    for (const label of ascii.split('.')) {
      if (label.length === 0 || label.length > 63) {
        throw new InvalidInputError(`Label "${label}" is not 1 to 63 characters long.`);
      }
    }
    if (ascii.length > 253) {
      throw new InvalidInputError('Domain is longer than 253 characters.');
    }
  }
  return ascii;
}

/**
 * Converts a domain name to Unicode for display, decoding its Punycode `xn--` labels. Uses the
 * runtime's URL host parser for UTS #46, so it rejects any domain the parser rejects, such as a
 * domain with a character newer than the parser's Unicode tables. It applies the bidi rule itself,
 * because the parsers in Node and Cloudflare Workers skip it.
 *
 * @example
 * ```ts
 * import * as Idna from '@portable/idna';
 *
 * Idna.toUnicode(new URL('https://xn--bcher-kva.example/').hostname); // 'bücher.example'
 * ```
 *
 * @throws {InvalidInputError} if the domain isn't valid, such as a label that isn't valid
 * Punycode or decodes to characters IDNA doesn't allow.
 */
export function toUnicode(domain: string, options: toUnicode.Options = {}): string {
  const { strict = false } = options;
  return convert(domain, strict).labels.join('.');
}

const nonAscii = /[^\0-\x7f]/;
const punycodeLabel = /(?:^|\.)xn--/;

/**
 * Whether the input may have an `xn--` label once the parser maps it. NFKC and lowercasing map
 * fullwidth and other compatibility forms of `xn--` the way UTS #46 does.
 */
const hasPunycodeInput = (domain: string) =>
  domain.normalize('NFKC').toLowerCase().includes('xn--');
const std3 = /[^a-z0-9-]/;
const forbiddenCodePoint = /[\0-\x20#%/:<>?@[\\\]^|\x7f]/;

/**
 * Converts a domain to ASCII with the URL host parser and decodes its `xn--` labels. If the input
 * has `xn--` labels, it passes the decoded labels to the parser again and throws if the ASCII
 * differs, because the parser doesn't validate an `xn--` label in ASCII input. The `xn--` labels
 * that the parser writes for Unicode labels are valid already, so Unicode input is parsed once.
 */
function convert(domain: string, strict: boolean): { ascii: string; labels: string[] } {
  const ascii = parse(domain);
  const labels = ascii.split('.');
  if (punycodeLabel.test(ascii)) {
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i]!;
      if (!label.startsWith('xn--')) {
        continue;
      }
      const text = Punycode.decode(label.slice(4));
      if (text === undefined) {
        throw new InvalidInputError(`Label "${label}" isn't valid Punycode.`);
      }
      labels[i] = text;
    }
    if (hasPunycodeInput(domain) && hostToAscii(labels.join('.')) !== ascii) {
      throw new InvalidInputError(`Domain "${ascii}" decodes to labels that IDNA doesn't allow.`);
    }
  }
  const violation = findBidiViolation(labels);
  if (violation !== undefined) {
    throw new InvalidInputError(`Label "${violation}" breaks the bidi rule of RFC 5893.`);
  }
  if (strict) {
    for (const label of labels) {
      checkStrict(label);
    }
  }
  return { ascii, labels };
}

function parse(domain: string): string {
  const ascii = hostToAscii(domain);
  if (ascii === undefined) {
    const forbidden = domain.match(forbiddenCodePoint);
    throw new InvalidInputError(
      forbidden
        ? `Domain contains ${JSON.stringify(forbidden[0])}.`
        : `Domain "${domain}" isn't valid.`,
    );
  }
  if (nonAscii.test(domain) && endsInNumber(ascii)) {
    throw new InvalidInputError(`Domain "${domain}" maps to an IPv4 address.`);
  }
  const forbidden = ascii.match(forbiddenCodePoint);
  if (forbidden) {
    throw new InvalidInputError(`Domain contains ${JSON.stringify(forbidden[0])}.`);
  }
  return ascii;
}

/**
 * The URL Standard's ends-in-a-number checker. The parser reads such a host as an IPv4 address and
 * returns it in dotted decimal, which isn't the domain's ASCII form.
 */
function endsInNumber(host: string): boolean {
  const labels = host.split('.');
  if (labels.length > 1 && labels[labels.length - 1] === '') {
    labels.pop();
  }
  const last = labels[labels.length - 1]!;
  return /^(?:[0-9]+|0x[0-9a-f]*)$/.test(last);
}

function checkStrict(label: string): void {
  const invalid = (reason: string) => new InvalidInputError(`Label "${label}" ${reason}.`);
  const start = Array.from(label.slice(0, 8));
  if (start[2] === '-' && start[3] === '-') {
    throw invalid('has "-" in its third and fourth positions');
  }
  if (label.startsWith('-') || label.endsWith('-')) {
    throw invalid('starts or ends with "-"');
  }
  for (const char of label) {
    if (char < '\x80' && std3.test(char)) {
      throw invalid('contains a disallowed character');
    }
  }
}
