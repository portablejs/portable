import * as JsonStream from '@portable/json-stream';
import { cuts, fc, fuzz, mutated, outcomeAsync, split } from '@portable/fuzz';
import { expect, test } from 'vite-plus/test';
import { encodeText, encodeUtf8, parse } from './utils.js';

const errors = [JsonStream.InvalidInputError, JsonStream.TruncatedError];
const space = fc.option(fc.oneof(fc.integer({ min: -1, max: 12 }), fc.constantFrom('\t', '\r\n')), {
  nil: undefined,
});
/** JSON values as JSON.parse returns them, so without -0, which JSON.stringify writes as 0. */
const json = fc.jsonValue().map((value) => JSON.parse(JSON.stringify(value)) as unknown);

test('encodeStream writes what JSON.stringify writes', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.jsonValue(),
      space,
      fc.constantFrom('', '--'),
      async (value, space, gap) => {
        expect(await encodeText(value, { space })).toBe(JSON.stringify(value, null, space));
        expect(await encodeText(value, { space: gap })).toBe(JSON.stringify(value, null, gap));
      },
    ),
  );
});

test('DecoderStream reads back the root value however the bytes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(json, space, cuts, async (value, space, at) => {
      const bytes = encodeUtf8(JSON.stringify(value, null, space));
      expect(await parse(split(bytes, at))).toEqual([{ path: [], value }]);
    }),
  );
});

test('DecoderStream emits each member of an object or array at its path', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.oneof(fc.array(json), fc.dictionary(fc.string(), json)),
      cuts,
      async (value, at) => {
        const members = Object.entries(value).map(([key, member]) => ({
          path: [Array.isArray(value) ? Number(key) : key],
          value: member,
        }));
        expect(await parse(split(JSON.stringify(value), at), { paths: ['$.*'] })).toEqual(members);
      },
    ),
  );
});

const mutatedJson = fc
  .jsonValue()
  .chain((value) => mutated(encodeUtf8(JSON.stringify(value, null, 1))));

test('DecoderStream agrees with JSON.parse on mutated JSON', async () => {
  await fuzz(
    fc.asyncProperty(mutatedJson, cuts, async (bytes, at) => {
      const text = new TextDecoder().decode(bytes);
      const result = await outcomeAsync(errors, () => parse(split(bytes, at)));
      expect(result).toEqual(parsesAs(text) ?? result);
    }),
  );
});

test('DecoderStream returns the same values or error however the bytes are chunked', async () => {
  await fuzz(
    fc.asyncProperty(mutatedJson, cuts, async (bytes, at) => {
      const paths = ['$..*'];
      expect(await outcomeAsync(errors, () => parse(split(bytes, at), { paths }))).toEqual(
        await outcomeAsync(errors, () => parse([bytes], { paths })),
      );
    }),
  );
});

/** The outcome JSON.parse gives for one document, or undefined when the text isn't one. */
function parsesAs(text: string): { value: JsonStream.DecoderStream.Match[] } | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  try {
    return { value: [{ path: [], value: JSON.parse(text) as unknown }] };
  } catch {
    return undefined;
  }
}
