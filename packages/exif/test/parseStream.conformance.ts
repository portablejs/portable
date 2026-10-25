import { describe, expect, test } from 'vite-plus/test';
import * as Exif from '@portable/exif';
import {
  ascii,
  buildTiff,
  chunked,
  concat,
  entry,
  exifPrefix,
  fixture,
  fixtures,
  jpeg,
  randomChunks,
  tracked,
} from './utils.js';

async function outcome(run: () => Exif.Metadata | Promise<Exif.Metadata>) {
  try {
    return { result: await run() };
  } catch (error) {
    return { error: (error as Error).name };
  }
}

const u32be = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24];

const pngChunk = (type: string, data: Uint8Array) =>
  concat(u32be(data.length), ascii(type), data, [0, 0, 0, 0]);

function png(...chunks: readonly Uint8Array[]): Uint8Array {
  const ihdr = pngChunk('IHDR', new Uint8Array([0, 0, 0, 7, 0, 0, 0, 5, 8, 2, 0, 0, 0]));
  return concat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ihdr, ...chunks);
}

const riffChunk = (type: string, data: Uint8Array) =>
  concat(ascii(type), u32le(data.length), data, data.length & 1 ? [0] : []);

function webp(...chunks: readonly Uint8Array[]): Uint8Array {
  const vp8x = riffChunk('VP8X', new Uint8Array([8, 0, 0, 0, 99, 0, 0, 49, 0, 0]));
  const body = concat(ascii('WEBP'), vp8x, ...chunks);
  return concat(ascii('RIFF'), u32le(body.length), body);
}

const tiff = buildTiff({ ifd0: [entry(0x010f, 2, 'Canon'), entry(0x0112, 3, [6])] });
const image = new Uint8Array(1024 * 1024);

describe('parseStream', () => {
  for (const name of fixtures) {
    test(`returns what parse returns for ${name} in random chunks`, async () => {
      const bytes = await fixture(name);
      const expected = await outcome(() => Exif.parse(bytes));
      for (const seed of [1, 2, 3]) {
        const chunks = randomChunks(bytes, seed, seed === 1 ? 16 : 4096);
        expect(await outcome(() => Exif.parseStream(tracked(chunks).stream))).toEqual(expected);
      }
    });

    test(`returns what parse returns for truncated copies of ${name}`, async () => {
      const bytes = await fixture(name);
      const span = Math.min(bytes.length, 40_000);
      for (let i = 0; i <= 16; i++) {
        const prefix = bytes.subarray(0, Math.floor((span * i) / 16));
        const stream = tracked(randomChunks(prefix, i + 1)).stream;
        expect(await outcome(() => Exif.parseStream(stream))).toEqual(
          await outcome(() => Exif.parse(prefix)),
        );
      }
    });
  }

  test('reads only the start of a large JPEG, then cancels the stream', async () => {
    const bytes = await fixture('starfish.jpg');
    const { stream, read, cancelled } = tracked(chunked(bytes, 1024));
    const result = await Exif.parseStream(stream);
    expect(result.ifd0.Make).toBe('Nokia');
    expect(result.imageSize).toEqual({ width: 1278, height: 720 });
    expect(read()).toBeLessThan(64 * 1024);
    expect(cancelled()).toBe(true);
  });

  test('stops a JPEG without EXIF at the start of scan', async () => {
    const tail = new Uint8Array(1024 * 1024);
    const bytes = concat(
      jpeg(tiff).subarray(0, 2),
      jpeg(tiff).subarray(2 + 2 + 2 + 6 + tiff.length),
      tail,
    );
    const { stream, read, cancelled } = tracked(chunked(bytes, 1024));
    expect(await Exif.parseStream(stream)).toEqual(Exif.parse(bytes));
    expect(read()).toBe(1024);
    expect(cancelled()).toBe(true);
  });

  test('reads an eXIf chunk after 1 MiB of IDAT while holding less than maxBytes', async () => {
    const bytes = png(
      pngChunk('IDAT', image),
      pngChunk('eXIf', tiff),
      pngChunk('IEND', new Uint8Array(0)),
    );
    const result = await Exif.parseStream(tracked(chunked(bytes, 4096)).stream, { maxBytes: 8192 });
    expect(result).toEqual(Exif.parse(bytes));
    expect(result.ifd0.Make).toBe('Canon');
  });

  test('reads an EXIF chunk after 1 MiB of WebP image data while holding less than maxBytes', async () => {
    const bytes = webp(riffChunk('VP8L', image), riffChunk('EXIF', concat(exifPrefix, tiff)));
    const { stream, cancelled } = tracked(chunked(bytes, 4096));
    const result = await Exif.parseStream(stream, { maxBytes: 8192 });
    expect(result).toEqual(Exif.parse(bytes));
    expect(result.ifd0.Orientation).toBe(6);
    expect(result.imageSize).toEqual({ width: 100, height: 50 });
    expect(cancelled()).toBe(true);
  });

  test('stops a WebP once the EXIF chunk and the size are read', async () => {
    const exif = riffChunk('EXIF', tiff);
    const bytes = webp(exif, riffChunk('VP8L', image));
    const { stream, read } = tracked(chunked(bytes, 1024));
    expect((await Exif.parseStream(stream)).ifd0.Make).toBe('Canon');
    expect(read()).toBe(1024);
  });

  test('throws MaxBytesError when a TIFF needs more than maxBytes', async () => {
    const bytes = await fixture('Bush-dog.tif');
    const error = await Exif.parseStream(tracked(chunked(bytes, 256)).stream, {
      maxBytes: 1024,
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Exif.MaxBytesError);
    expect((error as Exif.MaxBytesError).maxBytes).toBe(1024);
  });

  test('throws RangeError for a negative or NaN maxBytes', async () => {
    const stream = () => new ReadableStream<Uint8Array>();
    await expect(Exif.parseStream(stream(), { maxBytes: -1 })).rejects.toThrow(RangeError);
    await expect(Exif.parseStream(stream(), { maxBytes: Number.NaN })).rejects.toThrow(RangeError);
  });

  test('throws MaxBytesError when an HEIF file puts more than maxBytes of mdat before meta', async () => {
    const box = (type: string, data: Uint8Array) =>
      concat(u32be(data.length + 8), ascii(type), data);
    const bytes = concat(
      box('ftyp', ascii('heic\0\0\0\0mif1heic')),
      box('mdat', image),
      box('meta', new Uint8Array(4)),
    );
    expect(await Exif.parseStream(tracked([bytes]).stream)).toEqual(Exif.parse(bytes));
    await expect(
      Exif.parseStream(tracked(chunked(bytes, 4096)).stream, { maxBytes: 64 * 1024 }),
    ).rejects.toThrow(Exif.MaxBytesError);
  });

  test('throws UnsupportedError for other formats and cancels the stream', async () => {
    const { stream, cancelled } = tracked([ascii('GIF89a'), image]);
    await expect(Exif.parseStream(stream)).rejects.toThrow(Exif.UnsupportedError);
    expect(cancelled()).toBe(true);
  });

  test('rejects with the abort reason and cancels the stream when the signal is aborted', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array([0xff, 0xd8]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = Exif.parseStream(stream, { signal: controller.signal });
    controller.abort(new Error('stop'));
    await expect(result).rejects.toThrow('stop');
    expect(cancelled).toBe(true);
  });

  test('rejects without reading when the signal is already aborted', async () => {
    const { stream, read, cancelled } = tracked([await fixture('starfish.jpg')]);
    const signal = AbortSignal.abort(new Error('stop'));
    await expect(Exif.parseStream(stream, { signal })).rejects.toThrow('stop');
    expect(read()).toBe(0);
    expect(cancelled()).toBe(true);
  });

  test('passes on an error from the source stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('network down'));
      },
    });
    await expect(Exif.parseStream(stream)).rejects.toThrow('network down');
  });
});
