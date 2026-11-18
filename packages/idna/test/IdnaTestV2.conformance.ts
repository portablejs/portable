import { describe, expect, test } from 'vite-plus/test';
import { hostToAscii } from '@portable/idna/internal';
import * as Idna from '@portable/idna';
import { attempt, idnaTestCases, strictCodes } from './utils.js';

type Case = (typeof idnaTestCases)[number];

type Differences = {
  /** Cases that the package accepts and IdnaTestV2.txt marks as errors. */
  acceptsInvalid: readonly string[];
  /** Cases that both accept, with a different result. */
  differentResult: readonly string[];
  /** Cases that the package rejects and IdnaTestV2.txt accepts. */
  rejectsValid: readonly Case[];
};

function compare(convert: (source: string) => string, expected: (testCase: Case) => string | null) {
  const differences = {
    acceptsInvalid: [] as string[],
    differentResult: [] as string[],
    rejectsValid: [] as Case[],
  };
  for (const testCase of idnaTestCases) {
    const want = expected(testCase);
    const actual = attempt(() => convert(testCase.source));
    if (actual === want) {
      continue;
    }
    const line = `line ${testCase.line}: ${JSON.stringify(testCase.source)} gave ${JSON.stringify(actual)}`;
    if (want === null) {
      differences.acceptsInvalid.push(line);
    } else if (actual === null) {
      differences.rejectsValid.push(testCase);
    } else {
      differences.differentResult.push(line);
    }
  }
  return differences satisfies Differences;
}

/**
 * Whether the runtime's URL host parser rejects the case's input or its expected result, or cuts
 * it at a delimiter. The package rejects whatever the parser rejects, so in those cases a
 * rejection comes from the runtime and not from this package.
 */
const parserRejects = (testCase: Case) =>
  hostToAscii(testCase.source) === undefined || hostToAscii(testCase.toUnicode) === undefined;

const lenient = (codes: readonly string[]) => codes.filter((code) => !strictCodes.has(code));

describe('IdnaTestV2.txt (Unicode 18.0.0) with @portable/idna', () => {
  const cases = [
    {
      name: 'toUnicode',
      convert: (source: string) => Idna.toUnicode(source),
      expected: (testCase: Case) =>
        lenient(testCase.toUnicodeStatus).length > 0 ? null : testCase.toUnicode,
    },
    {
      name: 'toUnicode with strict: true',
      convert: (source: string) => Idna.toUnicode(source, { strict: true }),
      expected: (testCase: Case) =>
        testCase.toUnicodeStatus.length > 0 ? null : testCase.toUnicode,
    },
    {
      name: 'toAscii with strict: true',
      convert: (source: string) => Idna.toAscii(source, { strict: true }),
      expected: (testCase: Case) => (testCase.toAsciiNStatus.length > 0 ? null : testCase.toAsciiN),
    },
  ];

  describe.each(cases)('$name', ({ convert, expected }) => {
    const differences = compare(convert, expected);

    test('accepts no invalid domain', () => {
      expect(differences.acceptsInvalid).toEqual([]);
    });

    test('gives the expected result for every domain it accepts', () => {
      expect(differences.differentResult).toEqual([]);
    });

    test('rejects a valid domain only when the URL host parser rejects it', () => {
      const unexplained = differences.rejectsValid
        .filter((testCase) => !parserRejects(testCase))
        .map((testCase) => `line ${testCase.line}: ${JSON.stringify(testCase.source)}`);
      expect(unexplained).toEqual([]);
    });
  });
});
