import { describe, expect, test, vi } from 'vite-plus/test';
import * as Random from '@portable/random';

const urlSafe = /^[\w-]*$/;
const distinct = (values: Iterable<unknown>) => new Set(values).size;

describe('int', () => {
  test('returns an integer within the range, both ends included', () => {
    const ranges = [
      [0, 1],
      [0, 2],
      [0, 10],
      [0, 100],
      [5, 10],
      [-10, -5],
      [524234213, 99999999999],
      [2 ** 31, 2 ** 52],
      [-(2 ** 52), 2 ** 52 - 1],
      [0, Number.MAX_SAFE_INTEGER],
      [-Number.MAX_SAFE_INTEGER, 0],
    ] satisfies [number, number][];
    for (const [min, max] of ranges) {
      for (let i = 0; i < 200; i++) {
        const value = Random.int(min, max);
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
    }
  });

  test('returns both ends of the range', () => {
    expect(distinct(Array.from({ length: 200 }, () => Random.int(0, 1)))).toBe(2);
    expect(distinct(Array.from({ length: 1000 }, () => Random.int(2, 4)))).toBe(3);
  });

  test('returns min when min equals max', () => {
    expect(Random.int(0, 0)).toBe(0);
    expect(Random.int(-7, -7)).toBe(-7);
    expect(Random.int(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  test('varies between calls', () => {
    expect(distinct(Array.from({ length: 20 }, () => Random.int(0, 2 ** 40)))).toBeGreaterThan(1);
  });

  test('returns odd and even numbers over the whole safe range', () => {
    const parities = new Set(
      Array.from({ length: 64 }, () => Random.int(0, Number.MAX_SAFE_INTEGER) % 2),
    );
    expect(parities).toEqual(new Set([0, 1]));
  });

  test('throws a RangeError when min is above max', () => {
    expect(() => Random.int(10, 5)).toThrow(RangeError);
    expect(() => Random.int(-5, -10)).toThrow(RangeError);
  });

  test('throws a RangeError for bounds that are not safe integers', () => {
    for (const [min, max] of [
      [1.5, 3],
      [0, 2.5],
      [NaN, 1],
      [0, Infinity],
      [0, 2 ** 62],
      [-(2 ** 53), 0],
    ] as const) {
      expect(() => Random.int(min, max)).toThrow(RangeError);
    }
    expect(() => Random.int('1' as unknown as number, 2)).toThrow(RangeError);
  });

  test('throws a RangeError for a range of more than 2^53 integers', () => {
    expect(() => Random.int(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(() => Random.int(-1, Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(Random.int(-1, Number.MAX_SAFE_INTEGER - 1)).toBeGreaterThanOrEqual(-1);
  });
});

describe('float', () => {
  test('returns numbers from 0 up to but not including 1', () => {
    for (let i = 0; i < 10000; i++) {
      const value = Random.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('returns numbers with a fractional part', () => {
    expect(Array.from({ length: 10 }, Random.float).some((value) => value % 1 !== 0)).toBe(true);
  });

  test('uses all 53 bits', () => {
    const lowBits = new Set(Array.from({ length: 64 }, () => (Random.float() * 2 ** 53) % 2));
    expect(lowBits).toEqual(new Set([0, 1]));
  });
});

// The alphabets of crypto-random-string's `type` option.
const alphabets = {
  hex: { alphabet: '0123456789abcdef', pattern: /^[\da-f]*$/ },
  base64: {
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    pattern: /^[\d+/a-z]*$/i,
  },
  'url-safe': {
    alphabet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~',
    pattern: /^[\w\-.~]*$/,
  },
  numeric: { alphabet: '0123456789', pattern: /^\d*$/ },
  distinguishable: { alphabet: 'CDEHKMPRTUWXY012458', pattern: /^[012458CDEHKMPRTUWXY]*$/ },
  'ascii-printable': {
    alphabet:
      '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
    pattern: /^[\w!"#$%&'()*+,\-./:;<=>?@[\\\]^`{|}~]*$/,
  },
  alphanumeric: {
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    pattern: /^[0-9a-z]*$/i,
  },
  characters: { alphabet: '1234', pattern: /^[1-4]*$/ },
};

// Every character of an alphabet of size n shows up in 640n draws, except with probability below 1e-256.
const charactersUsed = (alphabet: string) =>
  distinct(Random.string(Array.from(alphabet).length * 640, { alphabet }));

describe('string', () => {
  test('defaults to 64 URL-safe characters', () => {
    const id = Random.string(21);
    expect(id).toHaveLength(21);
    expect(id).toMatch(urlSafe);
    expect(distinct(Random.string(64 * 640))).toBe(64);
    expect(Random.string(64 * 640)).toMatch(urlSafe);
  });

  test('returns the requested length', () => {
    for (const length of [0, 1, 10, 100, 1000, 70000]) {
      const id = Random.string(length);
      expect(id).toHaveLength(length);
      expect(id).toMatch(urlSafe);
    }
  });

  for (const [name, { alphabet, pattern }] of Object.entries(alphabets)) {
    test(`uses only and every character of the ${name} alphabet`, () => {
      expect(Random.string(0, { alphabet })).toBe('');
      expect(Random.string(10, { alphabet })).toHaveLength(10);
      expect(Random.string(100, { alphabet })).toMatch(pattern);
      expect(charactersUsed(alphabet)).toBe(alphabet.length);
    });
  }

  test('excludes the space from printable ASCII', () => {
    expect(Random.string(10000, { alphabet: alphabets['ascii-printable'].alphabet })).not.toContain(
      ' ',
    );
  });

  test('repeats a one-character alphabet', () => {
    expect(Random.string(10, { alphabet: 'a' })).toBe('aaaaaaaaaa');
    expect(Random.string(5, { alphabet: 'a' })).toBe('aaaaa');
  });

  test('picks whole characters outside the Basic Multilingual Plane', () => {
    const id = Random.string(100, { alphabet: '😀🎉' });
    expect(Array.from(id)).toHaveLength(100);
    expect(id).toMatch(/^[🎉😀]*$/u);
    expect(charactersUsed('😀🎉')).toBe(2);
  });

  test('picks multi-byte characters', () => {
    for (let i = 0; i < 100; i++) {
      const id = Random.string(10, { alphabet: 'абвгд' });
      expect(id).toHaveLength(10);
      expect(id).toMatch(/^[абвгд]*$/);
    }
  });

  test('picks from alphabets bigger than 256 and 65536 characters', () => {
    for (const size of [32768, 32769, 40000, 65535, 65536, 70000]) {
      const alphabet = Array.from({ length: size }, (_, i) => String.fromCodePoint(i + 0x10000));
      const id = Array.from(Random.string(40000, { alphabet: alphabet.join('') }));
      expect(id).toHaveLength(40000);
      expect(id.every((character) => character.codePointAt(0)! >= 0x10000)).toBe(true);
      expect(id.filter((character) => character === alphabet[0]).length).toBeLessThan(50);
    }
  });

  test('keeps a large alphabet uniform when its size does not divide 2^32', () => {
    const size = 3 * 2 ** 16;
    const alphabet = Array.from({ length: size }, (_, i) => String.fromCodePoint(i + 0x10000)).join(
      '',
    );
    const id = Array.from(Random.string(100000, { alphabet }));
    const firstThird = id.filter((c) => c.codePointAt(0)! - 0x10000 < size / 3).length;
    expect(Math.abs(firstThird / id.length - 1 / 3)).toBeLessThan(0.01);
  });

  test('has no runs left by unfilled entropy in long strings', () => {
    for (const { alphabet } of Object.values(alphabets)) {
      expect(Random.string(300000, { alphabet })).not.toMatch(/(.)\1{63}/);
    }
  });

  test('returns a different string on each call', () => {
    expect(Random.string(32)).not.toBe(Random.string(32));
    const ids = new Set(Array.from({ length: 50000 }, () => Random.string(21)));
    expect(ids.size).toBe(50000);
  });

  test('throws a RangeError for a length that is not a non-negative integer', () => {
    for (const length of [Infinity, NaN, -1, -10, 1.5, 2.1]) {
      expect(() => Random.string(length)).toThrow(RangeError);
    }
    expect(() => Random.string('10' as unknown as number)).toThrow(RangeError);
    expect(() => Random.string({ valueOf: () => 21 } as unknown as number)).toThrow(RangeError);
  });

  test('keeps working after rejecting a length', () => {
    expect(() => Random.string(2.1)).toThrow(RangeError);
    expect(Random.string(21)).not.toBe(Random.string(21));
  });

  test('throws a RangeError for an empty alphabet', () => {
    expect(() => Random.string(0, { alphabet: '' })).toThrow(RangeError);
    expect(() => Random.string(10, { alphabet: '' })).toThrow(RangeError);
  });

  test('recovers when crypto.getRandomValues throws', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('Entropy failure');
    });
    try {
      expect(() => Random.string(100000)).toThrow('Entropy failure');
      expect(() => Random.bytes(131072)).toThrow('Entropy failure');
    } finally {
      spy.mockRestore();
    }
    expect(Random.string(21)).toHaveLength(21);
    expect(Random.string(21)).not.toBe(Random.string(21));
    expect(Random.bytes(10)).toHaveLength(10);
  });
});

describe('shuffle', () => {
  test('returns a new array and leaves the input unchanged', () => {
    const array = [1, 2, 3];
    const shuffled = Random.shuffle(array);
    expect(shuffled).not.toBe(array);
    expect(Array.isArray(shuffled)).toBe(true);
    expect(array).toEqual([1, 2, 3]);
  });

  test('keeps the same elements', () => {
    expect(Random.shuffle([1, 2, 3]).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    const big = Array.from({ length: 1000 }, (_, i) => i);
    expect(Random.shuffle(big).sort((a, b) => a - b)).toEqual(big);
  });

  test('shuffles small arrays into every order', () => {
    const orders = new Set(Array.from({ length: 1000 }, () => Random.shuffle([1, 2]).join()));
    expect(orders).toEqual(new Set(['1,2', '2,1']));
  });

  test('returns empty and one-element arrays as copies', () => {
    expect(Random.shuffle([])).toEqual([]);
    expect(Random.shuffle(['a'])).toEqual(['a']);
  });
});

describe('pick', () => {
  test('returns an element of the array', () => {
    const array = [1, 2, 3];
    for (let i = 0; i < 100; i++) {
      expect(array).toContain(Random.pick(array));
    }
    expect(distinct(Array.from({ length: 300 }, () => Random.pick(array)))).toBe(3);
  });

  test('returns undefined when undefined was picked', () => {
    expect(Random.pick([undefined])).toBeUndefined();
  });

  test('throws a RangeError for an empty array', () => {
    expect(() => Random.pick([])).toThrow(RangeError);
  });
});

describe('bytes', () => {
  test('returns the requested number of bytes', () => {
    for (const length of [0, 1, 10, 65536, 65537, 200000]) {
      const bytes = Random.bytes(length);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes).toHaveLength(length);
    }
  });

  test('fills every byte past the 65,536-byte limit of crypto.getRandomValues', () => {
    const bytes = Random.bytes(300000);
    expect(distinct(bytes.subarray(0, 65536))).toBe(256);
    expect(distinct(bytes.subarray(65536, 131072))).toBe(256);
    expect(distinct(bytes.subarray(262144))).toBe(256);
  });

  test('throws a RangeError for a negative or fractional length', () => {
    expect(() => Random.bytes(-1)).toThrow(RangeError);
    expect(() => Random.bytes(1.5)).toThrow(RangeError);
  });
});

describe('seeded', () => {
  test('returns the same values for the same seed', () => {
    const run = (seed: number) => {
      const random = Random.seeded(seed);
      return [
        random.int(0, 1000),
        random.int(0, Number.MAX_SAFE_INTEGER),
        random.float(),
        random.string(21),
        random.string(8, { alphabet: '0123456789' }),
        random.shuffle([1, 2, 3, 4, 5, 6, 7, 8]),
        random.pick(['a', 'b', 'c', 'd', 'e']),
        Array.from(random.bytes(7)),
      ];
    };
    expect(run(42)).toEqual(run(42));
    expect(run(-3)).toEqual(run(-3));
    expect(run(42)).not.toEqual(run(43));
  });

  test('keeps each generator independent', () => {
    const a = Random.seeded(7);
    const b = Random.seeded(7);
    a.float();
    Random.float();
    expect(b.string(10)).not.toBe(a.string(10));
    expect(Random.seeded(7).float()).toBe(Random.seeded(7).float());
  });

  test('gives distinct sequences for seeds that differ only in high bits', () => {
    const first = (seed: number) => Random.seeded(seed).string(21);
    expect(first(0)).not.toBe(first(2 ** 32));
    expect(first(1)).not.toBe(first(2 ** 52 + 1));
    expect(first(5)).not.toBe(first(-5));
  });

  test('returns the same sequence in every runtime', () => {
    const random = Random.seeded(2024);
    expect([
      random.int(1, 6),
      random.int(1, 6),
      random.int(-(2 ** 40), 2 ** 40),
      random.float(),
      random.string(21),
      random.string(6, { alphabet: '0123456789' }),
      random.shuffle(['a', 'b', 'c', 'd', 'e']),
      random.pick([10, 20, 30]),
      Array.from(random.bytes(6)),
    ]).toMatchInlineSnapshot(`
      [
        6,
        2,
        -596864981147,
        0.7380174259864991,
        "fnJVhHcTT-cgd1xoqKeXl",
        "150798",
        [
          "e",
          "c",
          "b",
          "a",
          "d",
        ],
        10,
        [
          179,
          76,
          211,
          248,
          101,
          127,
        ],
      ]
    `);
  });

  test('applies the same argument checks as the crypto-backed functions', () => {
    const random = Random.seeded(1);
    expect(() => random.int(2, 1)).toThrow(RangeError);
    expect(() => random.string(-1)).toThrow(RangeError);
    expect(() => random.string(1, { alphabet: '' })).toThrow(RangeError);
    expect(() => random.pick([])).toThrow(RangeError);
    expect(() => random.bytes(1.5)).toThrow(RangeError);
    expect(random.string(0)).toBe('');
    expect(random.string(5, { alphabet: 'a' })).toBe('aaaaa');
    expect(random.int(3, 3)).toBe(3);
  });

  test('returns 100,000 ids without a collision', () => {
    const random = Random.seeded(99);
    const ids = new Set(Array.from({ length: 100000 }, () => random.string(21)));
    expect(ids.size).toBe(100000);
  });

  test('throws a RangeError for a seed that is not a safe integer', () => {
    for (const seed of [1.5, NaN, Infinity, 2 ** 53]) {
      expect(() => Random.seeded(seed)).toThrow(RangeError);
    }
    expect(() => Random.seeded('hello.' as unknown as number)).toThrow(RangeError);
  });
});
