import { fromIterable, toArray } from '@portable/streams';
import { describe, expect, expectTypeOf, test } from 'vite-plus/test';
import * as z from 'zod';
import {
  encodeStream,
  SchemaError,
  type Schema,
  InvalidInputError,
  DecoderStream,
  MaxLengthError,
  TruncatedError,
} from '@portable/json-stream';
import allNpm from './fixtures/all_npm.json?raw';
import couchSample from './fixtures/couch_sample.json?raw';
import depth from './fixtures/depth.json?raw';
import errorFixture from './fixtures/error.json?raw';
import headerFooter from './fixtures/header_footer.json?raw';
import { chunked, encodeUtf8, lineSeparator, parse, parseValues, randomChunks } from './utils.js';

// JSONStream's fixture has a trailing comma, which JSONStream accepts and JSON doesn't allow.
const couch = couchSample.replace('},\n]', '}\n]');
const npm = JSON.parse(allNpm) as { total_rows: number; rows: { value: { rev: string } }[] };

const escaped = {
  stringWithTabsAndNewlines: "Did it work?\nNo...\t\tI don't think so...",
  anArray: [1, 2, true, 'tabs?\t\t\t\u0001\u0002\u0003', false],
};

describe('schema', () => {
  const Row = z.object({ id: z.string() });

  test('types and validates each matched value', async () => {
    const stream = new DecoderStream({ paths: ['$.rows[*]'], schema: Row });
    expectTypeOf(stream.readable).toEqualTypeOf<
      ReadableStream<DecoderStream.Match<{ id: string }>>
    >();
    const matches = await toArray(
      fromIterable(['{"rows":[{"id":"a","x":1},{"id":"b"}]}']).pipeThrough(stream),
    );
    expect(matches).toEqual([
      { path: ['rows', 0], value: { id: 'a' } },
      { path: ['rows', 1], value: { id: 'b' } },
    ]);
  });

  test('fails with SchemaError naming the path of a value that does not pass', async () => {
    const error = await toArray(
      fromIterable(['{"rows":[{"id":"a"},{"id":2}]}']).pipeThrough(
        new DecoderStream({ paths: ['$.rows[*]'], schema: Row }),
      ),
    ).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(SchemaError);
    expect((error as SchemaError).message).toMatch(
      /^The value at \$\["rows"\]\[1\] doesn't match the schema: id: /,
    );
  });

  test('keeps the order of matches when an async schema settles out of order', async () => {
    let delay = 20;
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value: unknown) => {
          await new Promise((resolve) => setTimeout(resolve, (delay = Math.max(0, delay - 5))));
          return { value: value as number };
        },
      },
    } satisfies Schema<number>;
    const matches = await toArray(
      fromIterable(['[1,2,', '3]', ' [4]']).pipeThrough(
        new DecoderStream({ paths: ['$[*]'], schema }),
      ),
    );
    expect(matches.map((match) => match.value)).toEqual([1, 2, 3, 4]);
  });
});

describe('value type', () => {
  test('values are unknown without a type argument', () => {
    expectTypeOf(new DecoderStream().readable).toEqualTypeOf<ReadableStream<DecoderStream.Match>>();
  });

  test('a type argument types the values without checking them', async () => {
    type Row = { id: string };
    const stream = new DecoderStream<Row>({ paths: ['$.rows[*]'] });
    expectTypeOf(stream.readable).toEqualTypeOf<ReadableStream<DecoderStream.Match<Row>>>();
    const matches = await toArray(fromIterable(['{"rows":[{"id":"a"},2]}']).pipeThrough(stream));
    expect(matches.map((match) => match.value)).toEqual([{ id: 'a' }, 2]);
  });
});

describe('JSONStream', () => {
  test('emits each row of a large document', async () => {
    expect(
      await parseValues(randomChunks(encodeUtf8(allNpm), 1, 4096), { paths: ['$.rows[*]'] }),
    ).toEqual(npm.rows);
  });

  test('emits the whole document for the root path', async () => {
    expect(await parseValues([couch], { paths: ['$'] })).toEqual([JSON.parse(couch)]);
  });

  test('emits matches from text written in one chunk', async () => {
    const values = await parseValues(['{"rows":[{"hello":"world"}, {"foo": "bar"}]}'], {
      paths: ['$.rows.*'],
    });
    expect(values).toEqual([{ hello: 'world' }, { foo: 'bar' }]);
  });

  test('emits a field of every row at any depth below rows', async () => {
    const values = await parseValues([allNpm], { paths: ['$.rows..rev'] });
    expect(values).toEqual(npm.rows.map((row) => row.value.rev));
  });

  test('emits every value named "value" below docs, inner matches first', async () => {
    expect(await parseValues([depth], { paths: ['$.docs..value'] })).toEqual([
      0,
      [1],
      { a: 2 },
      '3',
      4,
    ]);
  });

  test('emits nothing for an empty array and each element of a full one', async () => {
    expect(await parseValues(['{"docs":[]}'], { paths: ['$.docs[*]'] })).toEqual([]);
    expect(await parseValues(['{"docs":[{"hello":"world"}]}'], { paths: ['$.docs[*]'] })).toEqual([
      { hello: 'world' },
    ]);
  });

  test('emits the values around a selected array when their paths are given', async () => {
    const matches = await parse([headerFooter], {
      paths: ['$.total_rows', '$.offset', '$.rows[*]', '$.foo'],
    });
    const document = JSON.parse(headerFooter);
    expect(matches).toEqual([
      { path: ['total_rows'], value: 129 },
      { path: ['offset'], value: 0 },
      { path: ['rows', 0], value: document.rows[0] },
      { path: ['rows', 1], value: document.rows[1] },
      { path: ['foo'], value: { bar: 'baz' } },
    ]);
  });

  test('emits only the other paths when the selected key is missing', async () => {
    expect(await parse([errorFixture], { paths: ['$.rows', '$.error', '$.message'] })).toEqual([
      { path: ['error'], value: 'error_code' },
      { path: ['message'], value: 'this is an error message' },
    ]);
  });

  test('reports the key of each match', async () => {
    const matches = await parse([JSON.stringify({ obj: { one: 1, two: 2, three: 3 } })], {
      paths: ['$.obj.*'],
    });
    expect(matches).toEqual([
      { path: ['obj', 'one'], value: 1 },
      { path: ['obj', 'two'], value: 2 },
      { path: ['obj', 'three'], value: 3 },
    ]);
  });

  test('reports keys of nested matches', async () => {
    const matches = await parse([couch], { paths: ['$.rows[*].doc.*'] });
    expect(matches.map((match) => match.path.at(-1))).toEqual([
      '_id',
      '_rev',
      'hello',
      '_id',
      '_rev',
      'hello',
    ]);
    expect(matches.map((match) => match.value)).toEqual([
      'change1_0.6995461115147918',
      '1-e240bae28c7bb3667f02760f6398d508',
      1,
      'change2_0.6995461115147918',
      '1-13677d36b98c0c075145bb8975105153',
      2,
    ]);
  });

  test('emits a top-level key once with its value', async () => {
    const fixture = { obj: { one: 1, two: 2, three: 3 } };
    expect(await parse([JSON.stringify(fixture)], { paths: ['$.*'] })).toEqual([
      { path: ['obj'], value: fixture.obj },
    ]);
  });

  test('emits null values', async () => {
    const data = [
      { ID: 1, optional: null },
      { ID: 3, optional: 20 },
      { ID: 5, optional: 'hello' },
    ];
    expect(
      await parseValues([JSON.stringify(data, null, 2)], { paths: ['$[*].optional'] }),
    ).toEqual([null, 20, 'hello']);
  });

  test('parses several documents written back to back', async () => {
    const text = `${allNpm} ${allNpm}\n\n${allNpm}`;
    const keys = await parseValues(chunked(text, 65536), { paths: ['$.rows[*].key'] });
    expect(keys).toHaveLength(npm.rows.length * 3);
  });

  test('fails on a document with an extra closing brace', async () => {
    await expect(parse([allNpm + '}'])).rejects.toThrow(InvalidInputError);
  });

  test('fails on malformed input', async () => {
    await expect(parse(['["foo":bar['])).rejects.toThrow(InvalidInputError);
  });

  test('parses a nested key without error', async () => {
    expect(await parseValues(['{"bar":{"foo":"baz"}}'], { paths: ['$.bar.foo'] })).toEqual(['baz']);
  });

  test('keeps numbers exact', async () => {
    const numbers = Array.from({ length: 20 }, (_, i) => Math.sin(i + 1) * 10 ** (i - 10));
    expect(await parseValues([JSON.stringify(numbers)], { paths: ['$[*]'] })).toEqual(numbers);
  });

  test('reads back what encodeStream writes', async () => {
    const values = [
      { hello: 'eonuhckmqjk', whatever: 236515, lies: true, nothing: [null], stuff: [0.5, 0.25] },
      ['AOREC', 'reoubaor', { ouec: 62642 }, [[[], {}, 53]]],
    ];
    const parsed = await toArray(
      encodeStream(fromIterable(values)).pipeThrough(new DecoderStream({ paths: ['$[*]'] })),
    );
    expect(parsed.map((match) => match.value)).toEqual(values);
  });
});

describe('stream-json', () => {
  const roundtrips: Record<string, unknown> = {
    true: true,
    false: false,
    null: null,
    '0': 0,
    '-1': -1,
    '1.5': 1.5,
    '1.5e-12': 1.5e-12,
    '1.5e33': 1.5e33,
    string: 'hi',
    'empty object': {},
    'empty array': [],
    object: { a: 1, b: true, c: 'd' },
    array: [1, 2, true, 'd', false],
    escaped,
  };
  for (const [name, value] of Object.entries(roundtrips)) {
    test(`parses ${name} back to the same value`, async () => {
      expect(await parseValues([JSON.stringify(value)])).toEqual([value]);
    });
  }

  for (let size = 1; size <= 13; size++) {
    test(`parses the same value from ${size}-character chunks`, async () => {
      expect(await parseValues(chunked(JSON.stringify(escaped), size))).toEqual([escaped]);
    });
  }

  for (const [count, separator] of [
    [1, ''],
    [5, ''],
    [5, ' '],
    [5, '\n'],
  ] as const) {
    test(`parses ${count} documents separated by ${JSON.stringify(separator)}`, async () => {
      const objects = Array.from({ length: count }, (_, n) => ({ ...escaped, n }));
      const text = objects.map((object) => JSON.stringify(object)).join(separator);
      expect(await parseValues(chunked(text, 4))).toEqual(objects);
    });
  }

  test('parses values that touch without whitespace', async () => {
    expect(await parseValues(['123[4]'])).toEqual([123, [4]]);
    expect(await parseValues(['42{"a":1}'])).toEqual([42, { a: 1 }]);
    expect(await parseValues(['99"hello"'])).toEqual([99, 'hello']);
    expect(await parseValues(chunked('7true', 2))).toEqual([7, true]);
  });

  test('fails on an unclosed object', async () => {
    await expect(parse(['{'])).rejects.toThrow(TruncatedError);
  });

  test('fails on a mismatched bracket', async () => {
    await expect(parse(['{"x":1]'])).rejects.toThrow(InvalidInputError);
  });

  test('fails on garbage in an endless stream instead of hanging', async () => {
    const sample = '{"key1":1}garbage{"key3":2}';
    const endless = new ReadableStream<string>({
      pull(controller) {
        controller.enqueue(sample);
      },
    });
    await expect(toArray(endless.pipeThrough(new DecoderStream()))).rejects.toThrow(
      InvalidInputError,
    );
  });

  test('emits nothing for empty input', async () => {
    expect(await parse([''])).toEqual([]);
    expect(await parse([])).toEqual([]);
  });

  for (const [name, character] of [
    ['a zero byte', '\x00'],
    ['a newline', '\n'],
    ['a tab', '\t'],
  ]) {
    test(`fails on ${name} inside a string`, async () => {
      await expect(parse([`["a${character}a"]`])).rejects.toThrow(InvalidInputError);
    });
  }

  test('fails on a comma between top-level values', async () => {
    await expect(parse(['1,2'])).rejects.toThrow(InvalidInputError);
  });

  test('fails on a missing comma', async () => {
    await expect(parse(['[1 2]'])).rejects.toThrow(InvalidInputError);
    await expect(parse(['[1,\n2\n3]'], { paths: ['$[*]'] })).rejects.toThrow(/offset 6/);
  });

  test('parses a number with an exponent at the end of input', async () => {
    expect(await parseValues(['1e5'])).toEqual([1e5]);
  });

  const picked = [{ a: {} }, { b: [] }, { c: null }, { d: 1 }, { e: 'e' }];

  test('picks values at a given depth', async () => {
    expect(await parse([JSON.stringify(picked)], { paths: ['$[*].*'] })).toEqual([
      { path: [0, 'a'], value: {} },
      { path: [1, 'b'], value: [] },
      { path: [2, 'c'], value: null },
      { path: [3, 'd'], value: 1 },
      { path: [4, 'e'], value: 'e' },
    ]);
  });

  test('picks one value by path', async () => {
    expect(await parseValues([JSON.stringify(picked)], { paths: ['$[0].a'] })).toEqual([{}]);
  });

  test('picks values by several paths', async () => {
    expect(
      await parseValues([JSON.stringify(picked)], { paths: ['$[1].b', '$[2].c', '$[3].d'] }),
    ).toEqual([[], null, 1]);
  });

  test('picks nothing for a path that matches nothing', async () => {
    expect(await parse([JSON.stringify(picked)], { paths: ['$[9]'] })).toEqual([]);
  });

  test('streams the elements of a picked array and the members of a picked object', async () => {
    const input = JSON.stringify({ a: [1, 2, 3], b: { c: 4, d: 5 } });
    expect(await parse([input], { paths: ['$.a[*]'] })).toEqual([
      { path: ['a', 0], value: 1 },
      { path: ['a', 1], value: 2 },
      { path: ['a', 2], value: 3 },
    ]);
    expect(await parse([input], { paths: ['$.b.*'] })).toEqual([
      { path: ['b', 'c'], value: 4 },
      { path: ['b', 'd'], value: 5 },
    ]);
  });

  test('parses a document nested 100,000 levels deep', async () => {
    const levels = 100_000;
    const input = '{"a":'.repeat(levels) + '1' + '}'.repeat(levels);
    expect(await parse(chunked(input, 65536), { paths: ['$.x'] })).toEqual([]);
  });

  test('emits each element of a top-level array', async () => {
    const pattern = [1, 'a', null, { b: [true] }, []];
    expect(await parse([JSON.stringify(pattern)], { paths: ['$[*]'] })).toEqual(
      pattern.map((value, i) => ({ path: [i], value })),
    );
  });

  test('selects object members with [*], as JSONPath does', async () => {
    expect(await parse(['{"a":1}'], { paths: ['$[*]'] })).toEqual([{ path: ['a'], value: 1 }]);
  });

  test('selects nothing with an index when the value is an object', async () => {
    expect(await parse(['{"0":1}'], { paths: ['$[0]'] })).toEqual([]);
  });

  test('creates "__proto__" as an own property, as JSON.parse does', async () => {
    const [value] = (await parseValues(['{"__proto__":{"polluted":true}}'])) as [object];
    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(({} as { polluted?: boolean | undefined }).polluted).toBeUndefined();
  });
});

describe('@worker-tools/json-stream', () => {
  const input = JSON.stringify([{ a: 1 }, { b: 2 }, { c: 3 }]);

  test('emits each element read one at a time', async () => {
    const reader = new Response(input)
      .body!.pipeThrough(new DecoderStream({ paths: ['$[*]'] }))
      .getReader();
    expect((await reader.read()).value?.value).toEqual({ a: 1 });
    expect((await reader.read()).value?.value).toEqual({ b: 2 });
    expect((await reader.read()).value?.value).toEqual({ c: 3 });
    expect((await reader.read()).done).toBe(true);
  });

  test('emits every value with $..*, children before parents', async () => {
    expect(await parseValues([input], { paths: ['$..*'] })).toEqual([
      1,
      { a: 1 },
      2,
      { b: 2 },
      3,
      { c: 3 },
    ]);
  });

  test('selects array elements by index', async () => {
    const books = JSON.stringify({ store: { book: ['a', 'b', 'c'] } });
    expect(await parseValues([books], { paths: ['$..book[0]', '$..book[1]'] })).toEqual(['a', 'b']);
  });

  test('selects quoted names', async () => {
    const value = JSON.stringify({ 'a.b': 1, "it's": 2, 'x[y]': 3 });
    expect(await parseValues([value], { paths: ["$['a.b']", '$["it\'s"]', "$['x[y]']"] })).toEqual([
      1, 2, 3,
    ]);
  });

  test('matches .. at any depth and only at the named key', async () => {
    const store = JSON.stringify({
      store: { price: 1, a: { price: 2, b: { price: 3 } }, foo: 4, x: { price: { b: 5 } } },
    });
    expect(await parseValues([store], { paths: ['$.store..price'] })).toEqual([1, 2, 3, { b: 5 }]);
  });

  test('reads a body built by encodeStream', async () => {
    async function* items() {
      yield 1;
      yield 2;
      yield 3;
    }
    const body = encodeStream({ a: 3, b: Promise.resolve(4), c: items() });
    expect(await toArray(body.pipeThrough(new DecoderStream({ paths: ['$.c[*]'] })))).toEqual([
      { path: ['c', 0], value: 1 },
      { path: ['c', 1], value: 2 },
      { path: ['c', 2], value: 3 },
    ]);
  });
});

describe('DecoderStream', () => {
  const document = {
    id: 'doc',
    'k"e\\y': 'escaped key',
    list: [1, -2.5e-3, 0, true, false, null, 'ü🚀' + lineSeparator, { nested: [[], {}] }],
    unicode: 'é🚀 \\u not an escape',
  };
  const text = JSON.stringify(document, null, 2);

  test('gives the same matches for every way of splitting the bytes', async () => {
    const paths = ['$..*', '$'];
    const expected = await parse([text], { paths });
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(await parse(randomChunks(encodeUtf8(text), seed, 8), { paths })).toEqual(expected);
    }
    expect(await parse(chunked(encodeUtf8(text), 1), { paths })).toEqual(expected);
  });

  test('decodes escaped keys and values', async () => {
    expect(await parse([text], { paths: ['$["k\\"e\\\\y"]', '$.unicode'] })).toEqual([
      { path: ['k"e\\y'], value: 'escaped key' },
      { path: ['unicode'], value: document.unicode },
    ]);
  });

  test('decodes \\u escapes split across chunks', async () => {
    expect(await parseValues(chunked('"\\u00e9\\ud83d\\ude80"', 1))).toEqual(['é🚀']);
  });

  test('skips a UTF-8 byte order mark', async () => {
    expect(await parseValues([new Uint8Array([0xef, 0xbb, 0xbf, 0x31])])).toEqual([1]);
  });

  test('emits each match as soon as it is complete', async () => {
    let push!: (chunk: string) => void;
    const input = new ReadableStream<string>({
      start(controller) {
        push = (chunk) => controller.enqueue(chunk);
      },
    });
    const reader = input.pipeThrough(new DecoderStream({ paths: ['$.rows[*]'] })).getReader();
    push('{"rows":[{"a":1},');
    expect((await reader.read()).value).toEqual({ path: ['rows', 0], value: { a: 1 } });
  });

  test('cancelling the output cancels the input', async () => {
    // The pipe cancels the source after `reader.cancel()` resolves, a tick later in some runtimes.
    let onCancel!: () => void;
    const cancelled = new Promise<void>((resolve) => (onCancel = resolve));
    const input = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('[1,2,');
      },
      cancel: () => onCancel(),
    });
    const reader = input.pipeThrough(new DecoderStream({ paths: ['$[*]'] })).getReader();
    expect((await reader.read()).value?.value).toBe(1);
    await reader.cancel();
    await expect(cancelled).resolves.toBeUndefined();
  });

  const invalid = [
    '{"a":1,}',
    '[1,]',
    '[,1]',
    '{,}',
    '{"a"}',
    '{"a" 1}',
    '{1:2}',
    "{'a':1}",
    '01',
    '-a',
    '1.e',
    '.5',
    '1e]',
    '[1e+]',
    '+1',
    'tru ',
    'nulll',
    'NaN',
    'Infinity',
    '"\\x"',
    '"\\u12g4"',
    ']',
    '}',
    '{"a":1}}',
  ];
  for (const input of invalid) {
    test(`fails with InvalidInputError on ${JSON.stringify(input)}`, async () => {
      await expect(parse(chunked(input, 1))).rejects.toThrow(InvalidInputError);
    });
  }

  for (const input of ['{"a":', '[1,2', '"abc', '{"a', 'tru', '-', '1.', '1e', '"\\u12']) {
    test(`fails with TruncatedError on ${JSON.stringify(input)}`, async () => {
      await expect(parse([input])).rejects.toThrow(TruncatedError);
    });
  }

  test('gives the offset of a bad character outside the selected values', async () => {
    await expect(parse(chunked('{"a": [1, 2, x]}', 3), { paths: ['$.b'] })).rejects.toThrow(
      'Unexpected "x" at offset 13 in JSON input.',
    );
  });

  test('gives the offset of a selected value that is invalid', async () => {
    const error = await parse(chunked('{"a": [1, 2 3]}', 3), { paths: ['$.a'] }).catch(
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(InvalidInputError);
    expect((error as Error).message).toBe('Invalid JSON in the value at offset 6.');
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
  });

  for (const path of ['', 'a', '$.', '$..', '$[', '$[-1]', '$[01]', "$['a", '$[a]', '$x', '$[*']) {
    test(`rejects the JSONPath ${JSON.stringify(path)}`, () => {
      expect(() => new DecoderStream({ paths: [path] })).toThrow(RangeError);
    });
  }

  test('does not modify the options object', () => {
    const options = { paths: ['$.a'] };
    new DecoderStream(options);
    expect(options).toEqual({ paths: ['$.a'] });
  });
});

describe('known upstream issues', () => {
  test('fails instead of ending quietly on {"] (JSONStream #145)', async () => {
    await expect(parse(['{"]'])).rejects.toThrow(TruncatedError);
  });

  test('fails on a trailing comma, which JSONStream accepts', async () => {
    await expect(parse([couchSample])).rejects.toThrow(InvalidInputError);
  });

  test('emits null matches (JSONStream drops them)', async () => {
    expect(await parseValues(['[null,1,null]'], { paths: ['$[*]'] })).toEqual([null, 1, null]);
  });

  test('parses numbers in exponential notation (JSONStream #10)', async () => {
    expect(await parseValues(['[1E3,2e-2,-0.5E+1]'], { paths: ['$[*]'] })).toEqual([1e3, 2e-2, -5]);
  });

  test('counts array indexes in skipped arrays (stream-json #63)', async () => {
    const input = JSON.stringify([[1, 2], { a: 3 }, [4], 'x']);
    expect(await parse([input], { paths: ['$[3]', '$[1].a'] })).toEqual([
      { path: [1, 'a'], value: 3 },
      { path: [3], value: 'x' },
    ]);
  });

  test('fails on invalid JSON in a part of the document no path selects (stream-json #104)', async () => {
    await expect(parse(['{"skip":[1 2],"keep":1}'], { paths: ['$.keep'] })).rejects.toThrow(
      InvalidInputError,
    );
  });
});

describe('maxLength', () => {
  test('accepts a matched value of exactly maxLength, in one chunk or many', async () => {
    const input = '{"rows":[{"a":1},{"bb":22}]}';
    for (const chunks of [[input], chunked(input, 1)]) {
      expect(await parseValues(chunks, { paths: ['$.rows[*]'], maxLength: 9 })).toEqual([
        { a: 1 },
        { bb: 22 },
      ]);
    }
  });

  test('fails with MaxLengthError on a longer matched value', async () => {
    const input = '{"rows":[{"a":1},{"bbb":333}]}';
    for (const chunks of [[input], chunked(input, 1)]) {
      const error = await parse(chunks, { paths: ['$.rows[*]'], maxLength: 9 }).catch(
        (error: unknown) => error,
      );
      expect(error).toBeInstanceOf(MaxLengthError);
      expect(error).toMatchObject({ name: 'JsonStream.MaxLengthError', maxLength: 9 });
    }
  });

  test('does not count values outside paths', async () => {
    const input = `{"skip":"${'x'.repeat(10_000)}","keep":1}`;
    expect(await parseValues(chunked(input, 100), { paths: ['$.keep'], maxLength: 1 })).toEqual([
      1,
    ]);
  });

  test('fails before an endless matched string is buffered', async () => {
    let pulled = 0;
    const endless = new ReadableStream<string>({
      pull(controller) {
        controller.enqueue(pulled++ === 0 ? '["' : 'x'.repeat(100));
      },
    });
    await expect(
      toArray(endless.pipeThrough(new DecoderStream({ paths: ['$[*]'], maxLength: 1000 }))),
    ).rejects.toBeInstanceOf(MaxLengthError);
    expect(pulled).toBeLessThan(20);
  });

  test('rejects a negative or NaN maxLength with a RangeError', () => {
    expect(() => new DecoderStream({ maxLength: -1 })).toThrow(RangeError);
    expect(() => new DecoderStream({ maxLength: Number.NaN })).toThrow(RangeError);
  });
});
