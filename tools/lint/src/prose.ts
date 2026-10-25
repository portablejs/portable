// Prose built around a made-up actor, such as "an app that supports older browsers adds its own"
// or "a caller who wants a few tries writes a counter". Say "if you support older browsers, add
// them yourself" instead. Text in double quotes is skipped, so a rule can quote the pattern.
const pattern =
  /\b(?:an?|any|each|every) (?:app|application|caller|user|program|developer|consumer)s? (?:that|who) /i;

/** Returns the made-up actor phrase in `line`, or `undefined` if it has none. */
export function findMadeUpActor(line: string): string | undefined {
  return pattern.exec(line.replaceAll(/"[^"]*"/g, ''))?.[0];
}
