import * as bidi from './bidi.js';
import { unpackInts } from './packed.js';

// The groups of bidi classes that the bidi rule tells apart, numbered as in scripts/generate.ts.
// Group 5 holds ES, CS, ET, ON, and BN, which the rule allows anywhere but the ends of a label.
const other = 0;
const l = 1;
const r = 2;
const an = 3;
const en = 4;
const nsm = 6;

type Runs = { starts: Int32Array; groups: Uint8Array };

let decoded: Runs | undefined;

function decode(): Runs {
  const runs = unpackInts(bidi.runs);
  const starts = new Int32Array(runs.length);
  const groups = new Uint8Array(runs.length);
  for (let i = 0, start = 0; i < runs.length; i++) {
    starts[i] = start;
    groups[i] = runs[i]! & 7;
    start += Math.floor(runs[i]! / 8) + 1;
  }
  return { starts, groups };
}

/** The group of a code point that IDNA allows. */
function group(codePoint: number): number {
  const { starts, groups } = (decoded ??= decode());
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle]! <= codePoint) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return groups[low]!;
}

const rtlCandidate = /[^\0-֏]/;

/**
 * Checks the labels of a domain against the bidi rule of RFC 5893 section 2, which applies when
 * any label has a right-to-left character. Returns the first label that breaks the rule, or
 * `undefined` if none does.
 * Reads only the bidi classes, so the labels must already be valid IDNA labels.
 */
export function findBidiViolation(labels: readonly string[]): string | undefined {
  if (!labels.some((label) => rtlCandidate.test(label))) {
    return undefined;
  }
  const classes = labels.map((label) => Array.from(label, (char) => group(char.codePointAt(0)!)));
  if (!classes.some((groups) => groups.includes(r) || groups.includes(an))) {
    return undefined;
  }
  for (let i = 0; i < labels.length; i++) {
    const groups = classes[i]!;
    if (groups.length > 0 && !satisfiesBidiRule(groups)) {
      return labels[i];
    }
  }
  return undefined;
}

function satisfiesBidiRule(groups: readonly number[]): boolean {
  const first = groups[0];
  let end = groups.length - 1;
  while (end > 0 && groups[end] === nsm) {
    end--;
  }
  const last = groups[end];
  if (first === r) {
    let hasEn = false;
    let hasAn = false;
    for (const value of groups) {
      if (value === l || value === other) {
        return false;
      }
      if (value === en) {
        hasEn = true;
      }
      if (value === an) {
        hasAn = true;
      }
    }
    return !(hasEn && hasAn) && (last === r || last === en || last === an);
  }
  if (first !== l) {
    return false;
  }
  for (const value of groups) {
    if (value === r || value === an || value === other) {
      return false;
    }
  }
  return last === l || last === en;
}
