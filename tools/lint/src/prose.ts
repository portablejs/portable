// Finds prose built around a made-up actor, such as "an app that supports older browsers adds its
// own" or "a caller who wants a few tries writes a counter". Say "if you support older browsers,
// add them yourself" instead. Text in double quotes is skipped, so a rule can quote the pattern.
const pattern =
  /\b(?:an?|any|each|every) (?:app|application|caller|user|program|developer|consumer)s? (?:that|who) /i;

/** Returns the made-up actor phrase in `line`, or `undefined` if it has none. */
export function findMadeUpActor(line: string): string | undefined {
  return pattern.exec(line.replaceAll(/"[^"]*"/g, ''))?.[0];
}

// Finds a list of three or more items without a comma before the last `and` or `or`, such as
// "`fetch`, `Request` and `Response`". An item is a code span, a quotation, a Markdown link, or up
// to three words, and the text inside code spans, quotations, and links isn't checked. The check
// doesn't parse sentences, so it skips a match if it may be a series of clauses rather than a list:
//
// - a later item starts with a word in `clauseStarts` or with a participle, or has a word in
//   `prepositions` after its first word, as in "`exports`, whether or not" and "the header, sorted
//   by name and then",
// - the sentence starts with a word in `openers`, and the match has one middle item and starts
//   before the sentence's first comma, as in "When it aborts, `encode` and `decode` reject".
//
// It misses some lists in exchange, such as "In Node, Bun and Deno".
const word = String.raw`(?:\x60[^\x60]+\x60|"[^"]+"|(?!(?:and|or)\b)[\p{L}\p{N}][\p{L}\p{N}.+'’/_-]*)`;
const item = String.raw`${word}(?: ${word}){0,2}`;
const list = new RegExp(
  String.raw`(?<![\p{L}\p{N},\x60'’.+/_-])(${item})((?:, ${item})+) (?:and|or) ${word}`,
  'gu',
);
const clauseStarts = new Set(
  'about across after against all also although and any apart as at because before between both but by each either even every except for from he if in including instead into it its just like neither never no nor not of on only or over per plus she since so such than that then there these they this those though through to under unless unlike until up versus via we when whenever where whereas whether which while who whom whose with within without yet you'.split(
    ' ',
  ),
);
const prepositions = new Set(
  'at by etc. for from in into of on over per to under via with without'.split(' '),
);
const openers = new Set(
  'after although as at because before by during for from if in on once since though to unless until when whenever where while with without'.split(
    ' ',
  ),
);

/** Returns the first list in `line` without a serial comma, or `undefined` if it has none. */
export function findMissingSerialComma(line: string): string | undefined {
  const text = line
    .replaceAll(/\x60[^\x60]*\x60/g, (span) => `\x60${'x'.repeat(span.length - 2)}\x60`)
    .replaceAll(/"[^"]*"/g, (quote) => `"${'x'.repeat(quote.length - 2)}"`)
    .replaceAll(/\[[^\]]*\]\([^)]*\)/g, (link) => 'x'.repeat(link.length));
  list.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = list.exec(text))) {
    list.lastIndex = match.index + 1;
    const middles = match[2]!.slice(2).split(', ');
    const clause = middles.some((middle) => {
      const words = middle.split(' ');
      return (
        clauseStarts.has(words[0]!.toLowerCase()) ||
        (words.length > 1 && /(?:ed|ing)$/.test(words[0]!)) ||
        words.slice(1).some((word) => prepositions.has(word))
      );
    });
    if (clause) {
      continue;
    }
    const sentence = text
      .slice(0, match.index)
      .split(/[.:;!?(|][*_]*\s/)
      .at(-1)!;
    const opener = `${sentence} ${match[1]}`.match(/\p{L}+/u)?.[0]?.toLowerCase() ?? '';
    if (middles.length === 1 && openers.has(opener) && !sentence.includes(',')) {
      continue;
    }
    return line.slice(match.index, match.index + match[0].length);
  }
  return undefined;
}

// Matches an em dash, a word from the AI vocabulary list, or a figurative word from the Writing
// section of AGENTS.md. `findRuledOutWord` removes code spans and double-quoted text before
// matching, so a rule can quote these words.
const ruledOut =
  /—|\b(?:delve[sd]?|crucial|leverage[sd]?|lands|landed|absorbs?|rides along|stands on|seams?)\b/iu;

/** Returns the first ruled-out word in `line`, or `undefined` if it has none. */
export function findRuledOutWord(line: string): string | undefined {
  return ruledOut.exec(line.replaceAll(/\x60[^\x60]*\x60/g, '').replaceAll(/"[^"]*"/g, ''))?.[0];
}
