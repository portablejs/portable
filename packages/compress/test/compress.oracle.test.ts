import zlib from 'node:zlib';
import CRC32 from 'crc-32';
import * as fflate from 'fflate';
import * as pako from 'pako';
import { describe, expect, test } from 'vite-plus/test';
import * as Compress from '@portable/compress';
import { decodeChunks, difference, fixture, randomBytes, randomChunks, samples } from './utils.js';

const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

describe('decodes what pako compresses', () => {
  for (const name of samples) {
    test(`${name}`, async () => {
      const data = await fixture(name);
      for (const level of levels) {
        expect(difference(await Compress.decode(pako.gzip(data, { level })), data)).toBe(undefined);
        expect(
          difference(
            await Compress.decode(pako.deflate(data, { level }), { format: 'deflate' }),
            data,
          ),
        ).toBe(undefined);
        expect(
          difference(
            await Compress.decode(pako.deflateRaw(data, { level }), { format: 'deflate-raw' }),
            data,
          ),
        ).toBe(undefined);
      }
    });
  }

  test('every strategy', async () => {
    const data = (await fixture('lorem_en_100k.txt')).subarray(0, 20_000);
    for (const strategy of [0, 1, 2, 3, 4]) {
      expect(difference(await Compress.decode(pako.gzip(data, { strategy })), data)).toBe(
        undefined,
      );
    }
  });

  test('every window size', async () => {
    const data = (await fixture('lorem_en_100k.txt')).subarray(0, 20_000);
    for (const windowBits of [9, 10, 11, 12, 13, 14, 15]) {
      expect(
        difference(
          await Compress.decode(pako.deflate(data, { windowBits }), { format: 'deflate' }),
          data,
        ),
      ).toBe(undefined);
    }
  });

  test('every memory level', async () => {
    const data = (await fixture('lorem_en_100k.txt')).subarray(0, 20_000);
    for (const memLevel of [1, 5, 9]) {
      expect(difference(await Compress.decode(pako.gzip(data, { memLevel })), data)).toBe(
        undefined,
      );
    }
  });

  test('randomly chunked through DecoderStream', async () => {
    const data = await fixture('lorem_utf_100k.txt');
    for (const seed of [1, 2, 3]) {
      expect(difference(await decodeChunks(randomChunks(pako.gzip(data), seed, 2048)), data)).toBe(
        undefined,
      );
    }
  });
});

describe('decodes what fflate compresses', () => {
  for (const name of samples) {
    test(`${name}`, async () => {
      const data = await fixture(name);
      for (const level of levels) {
        expect(difference(await Compress.decode(fflate.gzipSync(data, { level })), data)).toBe(
          undefined,
        );
        expect(
          difference(
            await Compress.decode(fflate.zlibSync(data, { level }), { format: 'deflate' }),
            data,
          ),
        ).toBe(undefined);
        expect(
          difference(
            await Compress.decode(fflate.deflateSync(data, { level }), { format: 'deflate-raw' }),
            data,
          ),
        ).toBe(undefined);
      }
    });
  }

  test('randomly chunked through DecoderStream', async () => {
    const data = await fixture('lorem_en_100k.txt');
    for (const seed of [1, 2, 3]) {
      expect(
        difference(await decodeChunks(randomChunks(fflate.gzipSync(data), seed, 2048)), data),
      ).toBe(undefined);
    }
  });
});

describe('matches node:zlib', () => {
  for (const name of ['KW_Rocketry_1', 'shapefile', 'sheet2', 'sheet3', 'sheet4']) {
    test(`raw deflate sample ${name}`, async () => {
      const data = await fixture(`raw-${name}.deflate-raw`);
      expect(
        difference(
          await Compress.decode(data, { format: 'deflate-raw' }),
          new Uint8Array(zlib.inflateRawSync(data)),
        ),
      ).toBe(undefined);
    });
  }

  test('multi-member gzip files', async () => {
    for (const name of ['gzip-joined.gz', 'gzip-joined-bgzip.gz']) {
      const data = await fixture(name);
      expect(difference(await Compress.decode(data), new Uint8Array(zlib.gunzipSync(data)))).toBe(
        undefined,
      );
    }
  });

  test('our output decodes with node:zlib', async () => {
    for (const name of samples) {
      const data = await fixture(name);
      expect(difference(new Uint8Array(zlib.gunzipSync(await Compress.encode(data))), data)).toBe(
        undefined,
      );
      expect(
        difference(
          new Uint8Array(zlib.inflateSync(await Compress.encode(data, { format: 'deflate' }))),
          data,
        ),
      ).toBe(undefined);
      expect(
        difference(
          new Uint8Array(
            zlib.inflateRawSync(await Compress.encode(data, { format: 'deflate-raw' })),
          ),
          data,
        ),
      ).toBe(undefined);
    }
  });

  // fflate's size test requires output within 5% of zlib at level 9. CompressionStream has no
  // level, so this compares with zlib's default level.
  test('compresses within 5% of zlib', async () => {
    for (const name of ['lorem_en_100k.txt', 'lorem_utf_100k.txt', 'lorem_cat.jpeg']) {
      const data = await fixture(name);
      const ours = (await Compress.encode(data)).length;
      expect(ours).toBeLessThanOrEqual(zlib.gzipSync(data).length * 1.05);
    }
  });
});

describe('crc32 matches node:zlib and crc-32', () => {
  test('random data of many lengths', () => {
    for (let length = 0; length < 300; length++) {
      const data = randomBytes(length, length + 1);
      expect(Compress.crc32(data)).toBe(zlib.crc32(data));
    }
  });

  test('continuing a checksum', () => {
    const data = randomBytes(100_000, 9);
    let ours = 0;
    let theirs = 0;
    for (const chunk of randomChunks(data, 3, 5000)) {
      ours = Compress.crc32(chunk, ours);
      theirs = zlib.crc32(chunk, theirs);
    }
    expect(ours).toBe(theirs);
    expect(ours).toBe(CRC32.buf(data) >>> 0);
  });

  test('strings', () => {
    for (const text of ['', 'hello', 'héllo 🎵', 'x'.repeat(1000)]) {
      expect(Compress.crc32(text)).toBe(zlib.crc32(text));
    }
  });
});

// Each test shows a trap in a replaced library that we handle differently.
describe('known upstream issues', () => {
  test('fflate does not check the gzip CRC-32 or length (fflate #181)', async () => {
    const data = await fixture('lorem_en_100k.txt');
    const corrupt = fflate.gzipSync(data);
    corrupt[corrupt.length - 8]! ^= 1;
    expect(difference(fflate.gunzipSync(corrupt), data)).toBe(undefined);
    await expect(Compress.decode(corrupt)).rejects.toThrow(Compress.InvalidInputError);
  });

  test('fflate trusts the gzip length field when it allocates (fflate #161, #181)', async () => {
    const data = await fixture('lorem_en_100k.txt');
    const lying = fflate.gzipSync(data);
    new DataView(lying.buffer).setUint32(lying.length - 4, 10, true);
    expect(fflate.gunzipSync(lying).length).not.toBe(data.length);
    await expect(Compress.decode(lying)).rejects.toThrow(Compress.InvalidInputError);
  });

  test('fflate reads only the first gzip member (fflate #102)', async () => {
    const joined = new Uint8Array([
      ...fflate.gzipSync(fflate.strToU8('foo')),
      ...fflate.gzipSync(fflate.strToU8('bar')),
    ]);
    expect(fflate.strFromU8(fflate.gunzipSync(joined))).toBe('foo');
    expect(new TextDecoder().decode(await Compress.decode(joined))).toBe('foobar');
  });

  test('node:zlib and pako ignore bytes after the end of the data', async () => {
    const padded = new Uint8Array([...zlib.gzipSync('padded'), 0, 0, 0, 0]);
    expect(zlib.gunzipSync(padded).toString()).toBe('padded');
    expect(new TextDecoder().decode(pako.ungzip(padded))).toBe('padded');
    await expect(Compress.decode(padded)).rejects.toThrow(Compress.InvalidInputError);

    const twoStreams = new Uint8Array([...zlib.deflateSync('AAA'), ...zlib.deflateSync('BBB')]);
    expect(zlib.inflateSync(twoStreams).toString()).toBe('AAA');
    await expect(Compress.decode(twoStreams, { format: 'deflate' })).rejects.toThrow(
      Compress.InvalidInputError,
    );
  });

  test('pako and fflate have no output limit (pako #310)', async () => {
    const bomb = zlib.gzipSync(new Uint8Array(20_000_000));
    expect(pako.ungzip(bomb).length).toBe(20_000_000);
    await expect(Compress.decode(bomb, { maxBytes: 1_000_000 })).rejects.toThrow(
      Compress.MaxBytesError,
    );
  });

  test('a truncated stream throws instead of returning partial output', async () => {
    const full = zlib.deflateSync('some longer payload to truncate');
    const truncated = full.subarray(0, full.length - 5);
    expect(() => zlib.inflateSync(truncated)).toThrow('unexpected end of file');
    await expect(Compress.decode(truncated, { format: 'deflate' })).rejects.toThrow(
      Compress.TruncatedError,
    );
  });
});
