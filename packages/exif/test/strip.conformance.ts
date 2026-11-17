import { describe, expect, test, vi } from 'vite-plus/test';
import * as Exif from '@portable/exif';
import * as Png from '@portable/png';
import {
  ascii,
  buildTiff,
  concat,
  entry,
  exifPrefix,
  fixture,
  fixtures,
  randomChunks,
  tracked,
} from './utils.js';

const supported = fixtures.filter((name) => /\.(jpg|png)$/.test(name));
const heif = fixtures.filter((name) => /\.(heic|avif)$/.test(name));
const unsupported = fixtures.filter((name) => !supported.includes(name) && !heif.includes(name));

function includes(bytes: Uint8Array, text: string): boolean {
  const needle = ascii(text);
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

/** Walks the JPEG segments to the start-of-scan marker. */
function indexOfScan(bytes: Uint8Array): number {
  let i = 2;
  while (bytes[i + 1] !== 0xda) {
    i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!);
  }
  return i;
}

/**
 * Reads `stream` to the end. `Response.arrayBuffer` would replace a stream error with a `TypeError`
 * in Chromium.
 */
async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return concat(...parts);
    }
    parts.push(value);
  }
}

async function stripStream(chunks: readonly Uint8Array[], options?: Exif.StripStream.Options) {
  return collect(tracked(chunks).stream.pipeThrough(new Exif.StripStream(options)));
}

const empty = { ifd1: {}, exif: {}, gps: {}, interop: {} };

function keptOrientation(original: Exif.Metadata): Exif.Tags {
  const orientation = original.ifd0.Orientation;
  return typeof orientation === 'number' && orientation >= 2 && orientation <= 8
    ? { Orientation: orientation }
    : {};
}

describe('strip', () => {
  for (const name of supported) {
    test(`leaves no tags but Orientation in ${name}`, async () => {
      const bytes = await fixture(name);
      const stripped = Exif.parse(Exif.strip(bytes));
      expect(stripped).toMatchObject({ ...empty, ifd0: keptOrientation(Exif.parse(bytes)) });
      expect(stripped.thumbnail).toBeUndefined();
      expect(Exif.parse(Exif.strip(bytes, { keepOrientation: false }))).toMatchObject({
        ...empty,
        ifd0: {},
      });
    });

    test(`StripStream matches strip for ${name} in random chunks`, async () => {
      const bytes = await fixture(name);
      for (const options of [{}, { keepOrientation: false, keepColorProfile: false }]) {
        const expected = Exif.strip(bytes, options);
        for (const seed of [1, 2]) {
          const chunks = randomChunks(bytes, seed, seed === 1 && bytes.length < 50_000 ? 64 : 4096);
          expect(await stripStream(chunks, options)).toEqual(expected);
        }
      }
    });

    test(`leaves no tags but Orientation in truncated copies of ${name}`, async () => {
      const bytes = await fixture(name);
      for (let i = 1; i < 16; i++) {
        const prefix = bytes.subarray(0, Math.floor((bytes.length * i) / 16));
        const ifds = Exif.parse(Exif.strip(prefix, { keepOrientation: false }));
        expect(ifds).toMatchObject({ ...empty, ifd0: {} });
      }
    });
  }

  for (const name of unsupported) {
    test(`throws UnsupportedError for ${name}`, async () => {
      const bytes = await fixture(name);
      expect(() => Exif.strip(bytes)).toThrow(Exif.UnsupportedError);
      await expect(stripStream([bytes])).rejects.toThrow(Exif.UnsupportedError);
    });
  }

  test('keeps the Orientation of a JPEG', async () => {
    const stripped = Exif.strip(await fixture('orientation-f6t.jpg'));
    expect(Exif.parse(stripped).ifd0).toEqual({ Orientation: 6 });
  });

  test('removes the XMP and Photoshop segments of a JPEG and keeps its scan data and ICC profile', async () => {
    const bytes = await fixture('issue-fast-exif-2.jpg');
    for (const text of [
      'Exif\0\0',
      'http://ns.adobe.com/xap/1.0/',
      'Photoshop 3.0',
      'ICC_PROFILE',
    ]) {
      expect(includes(bytes, text)).toBe(true);
    }
    const stripped = Exif.strip(bytes);
    expect(includes(stripped, 'http://ns.adobe.com/xap/1.0/')).toBe(false);
    expect(includes(stripped, 'Photoshop 3.0')).toBe(false);
    expect(includes(stripped, 'ICC_PROFILE')).toBe(true);
    expect(includes(stripped, 'JFIF')).toBe(true);
    expect(stripped.subarray(indexOfScan(stripped))).toEqual(bytes.subarray(indexOfScan(bytes)));
    expect(includes(Exif.strip(bytes, { keepColorProfile: false }), 'ICC_PROFILE')).toBe(false);
  });

  test('removes eXIf and XMP from a PNG without changing its pixels', async () => {
    const bytes = await fixture('png_with_exif_and_gps.png');
    expect(Exif.parse(bytes).gps).not.toEqual({});
    expect(includes(bytes, 'XML:com.adobe.xmp')).toBe(true);
    const stripped = Exif.strip(bytes);
    expect(includes(stripped, 'XML:com.adobe.xmp')).toBe(false);
    expect((await Png.decode(stripped)).data).toEqual((await Png.decode(bytes)).data);
  });

  test('writes an eXIf chunk with a valid CRC when a PNG has an Orientation', async () => {
    const tiff = buildTiff({ ifd0: [entry(0x010f, 2, 'Canon'), entry(0x0112, 3, [8])] });
    const source = await fixture('png_with_exif_and_gps.png');
    const end = source.length - 12;
    const exif = concat([0, 0, 0, tiff.length], ascii('eXIf'), tiff, [0, 0, 0, 0]);
    const bytes = concat(source.subarray(0, end), exif, source.subarray(end));
    const stripped = Exif.strip(bytes);
    expect(Exif.parse(stripped).ifd0).toEqual({ Orientation: 8 });
    expect((await Png.decode(stripped)).data).toEqual((await Png.decode(source)).data);
  });

  test('removes the color profile of a PNG only when asked', async () => {
    const bytes = await fixture('IMG_20180725_163423-1.png');
    expect(includes(Exif.strip(bytes), 'iCCP')).toBe(true);
    const stripped = Exif.strip(bytes, { keepColorProfile: false });
    expect(includes(stripped, 'iCCP')).toBe(false);
    expect((await Png.decode(stripped)).data).toEqual((await Png.decode(bytes)).data);
  });

  describe('WebP', () => {
    const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24];
    const chunk = (type: string, data: Uint8Array) =>
      concat(ascii(type), le32(data.length), data, data.length & 1 ? [0] : []);
    const riff = (...chunks: readonly Uint8Array[]) => {
      const body = concat(ascii('WEBP'), ...chunks);
      return concat(ascii('RIFF'), le32(body.length), body);
    };
    const vp8x = (flags: number) =>
      chunk('VP8X', new Uint8Array([flags, 0, 0, 0, 99, 0, 0, 49, 0, 0]));
    const icc = chunk('ICCP', ascii('profile'));
    const image = chunk('VP8L', new Uint8Array(1001).fill(7));
    const tiff = buildTiff({ ifd0: [entry(0x010f, 2, 'Canon'), entry(0x0112, 3, [6])] });
    const minimal = buildTiff({ ifd0: [entry(0x0112, 3, [6])] });
    const bytes = riff(
      vp8x(0x20 | 0x10 | 0x08 | 0x04),
      icc,
      image,
      chunk('EXIF', concat(exifPrefix, tiff)),
      chunk('XMP ', ascii('<x:xmpmeta/>')),
    );

    test('removes EXIF and XMP, keeps the image chunk, and fixes the header and flags', () => {
      const stripped = Exif.strip(bytes);
      expect(stripped).toEqual(riff(vp8x(0x20 | 0x10 | 0x08), icc, image, chunk('EXIF', minimal)));
      expect(Exif.parse(stripped)).toMatchObject({
        ...empty,
        ifd0: { Orientation: 6 },
        imageSize: { width: 100, height: 50 },
      });
    });

    test('clears the EXIF and ICC flags when nothing is kept', () => {
      const stripped = Exif.strip(bytes, { keepOrientation: false, keepColorProfile: false });
      expect(stripped).toEqual(riff(vp8x(0x10), image));
    });

    test('StripStream matches strip in random chunks', async () => {
      for (const seed of [1, 2, 3]) {
        expect(await stripStream(randomChunks(bytes, seed, 64))).toEqual(Exif.strip(bytes));
      }
    });
  });

  describe('HEIF', () => {
    for (const name of heif) {
      test(`StripStream matches strip for ${name} in random chunks`, async () => {
        const bytes = await fixture(name);
        const expected = Exif.strip(bytes);
        for (const seed of [1, 2]) {
          expect(await stripStream(randomChunks(bytes, seed, 64))).toEqual(expected);
        }
      });

      test(`keeps the length and image size of ${name}, and strips it only once`, async () => {
        const bytes = await fixture(name);
        const stripped = Exif.strip(bytes);
        expect(stripped.length).toBe(bytes.length);
        expect(Exif.parse(stripped)).toMatchObject({
          ...empty,
          ifd0: {},
          imageSize: Exif.parse(bytes).imageSize,
        });
        expect(Exif.strip(stripped)).toEqual(stripped);
      });
    }

    test('removes the Exif item of an AVIF and keeps every byte of the image data', async () => {
      const bytes = await fixture('Irvine_CA.avif');
      expect(Exif.parse(bytes).ifd0).not.toEqual({});
      const stripped = Exif.strip(bytes);
      expect(includes(stripped, 'MM\0*')).toBe(false);
      expect(includes(stripped, 'II*\0')).toBe(false);
      // The mdat box starts at byte 400, and the av01 item is its first 27,613 bytes.
      expect(stripped.subarray(400, 28_013)).toEqual(bytes.subarray(400, 28_013));
    });

    test('keeps the irot and color properties of an iPhone HEIC', async () => {
      const bytes = await fixture('heic-iphone7-head.heic');
      const stripped = Exif.strip(bytes, { keepOrientation: false, keepColorProfile: false });
      expect(stripped).toEqual(Exif.strip(bytes));
      expect(includes(stripped, 'irot')).toBe(true);
      expect(includes(stripped, 'prof')).toBe(true);
      expect(includes(stripped, 'cdsc')).toBe(false);
    });

    test('returns a HEIC without Exif or XMP items unchanged', async () => {
      const bytes = await fixture('heic-single-head.heic');
      expect(Exif.strip(bytes)).toEqual(bytes);
    });

    const u16 = (n: number) => [n >> 8, n & 255];
    const u32 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const box = (type: string, ...parts: readonly (Uint8Array | readonly number[])[]) => {
      const body = concat(...parts);
      return concat(u32(body.length + 8), ascii(type), body);
    };
    const fullBox = (type: string, ...parts: readonly (Uint8Array | readonly number[])[]) =>
      box(type, [0, 0, 0, 0], ...parts);
    const infe = (id: number, type: string, contentType = '') =>
      box(
        'infe',
        [2, 0, 0, 0],
        u16(id),
        u16(0),
        ascii(type),
        [0],
        ascii(contentType && `${contentType}\0`),
      );

    const ftypBox = box('ftyp', ascii('heic'), u32(0), ascii('mif1heic'));
    const image = new Uint8Array(40).fill(7);
    const xmp = ascii('<x:xmpmeta>GPS</x:xmpmeta>');
    const exif = concat(u32(0), buildTiff({ ifd0: [entry(0x010f, 2, 'Canon')] }));
    const idatExif = concat(u32(6), exifPrefix, buildTiff({ ifd0: [entry(0x010f, 2, 'Nikon')] }));
    const imageAt = ftypBox.length + 8;
    const xmpAt = imageAt + image.length;

    type Location = readonly [id: number, method: number, offset: number, length: number];

    /**
     * Builds the meta box of a HEIC with an image item 1 and three metadata items: Exif item 2 in
     * the last mdat, XMP item 3 in the first mdat, and Exif item 4 in idat. Items 2 and 3 refer to
     * item 1 through `cdsc`. If `stripped` is true, it builds the box that strip should write.
     */
    function meta(options: {
      exifAt: number;
      stripped?: boolean | undefined;
      locations?: readonly Location[] | undefined;
    }) {
      const stripped = options.stripped ?? false;
      const keep = (id: number) => !stripped || id === 1;
      const locations = options.locations ?? [
        [1, 0, imageAt, image.length],
        [2, 0, options.exifAt, exif.length],
        [3, 0, xmpAt, xmp.length],
        [4, 1, 0, idatExif.length],
      ];
      const infes = [
        infe(1, 'hvc1'),
        infe(2, 'Exif'),
        infe(3, 'mime', 'application/rdf+xml'),
        infe(4, 'Exif'),
      ].filter((_, i) => keep(i + 1));
      const kept = locations.filter(([id]) => keep(id));
      const references = stripped
        ? [box('thmb', u16(1), u16(1), u16(1))]
        : [
            box('cdsc', u16(2), u16(1), u16(1)),
            box('cdsc', u16(3), u16(1), u16(1)),
            box('thmb', u16(1), u16(2), u16(2), u16(1)),
          ];
      const associations = stripped
        ? [u16(1), [2, 0x81, 0x02]]
        : [u16(1), [2, 0x81, 0x02], u16(2), [1, 0x02]];
      return fullBox(
        'meta',
        fullBox('hdlr', u32(0), ascii('pict'), new Uint8Array(13)),
        fullBox('pitm', u16(1)),
        box(
          'iloc',
          [1, 0, 0, 0, 0x44, 0x00],
          u16(kept.length),
          ...kept.map(([id, method, offset, length]) =>
            concat(u16(id), u16(method), u16(0), u16(1), u32(offset), u32(length)),
          ),
        ),
        fullBox('iinf', u16(infes.length), ...infes),
        fullBox('iref', ...references),
        box(
          'iprp',
          box(
            'ipco',
            box('ispe', u32(0), u32(8), u32(5)),
            box('colr', ascii('prof'), ascii('icc')),
          ),
          fullBox('ipma', u32(stripped ? 1 : 2), ...associations),
        ),
        box('idat', stripped ? new Uint8Array(idatExif.length) : idatExif),
      );
    }

    const mdatBefore = box('mdat', image, xmp);
    const metaAt = ftypBox.length + mdatBefore.length;
    const exifAt = metaAt + meta({ exifAt: 0 }).length + 8;
    const original = concat(ftypBox, mdatBefore, meta({ exifAt }), box('mdat', exif));

    test('removes Exif and XMP items from meta, idat, and mdat boxes before and after meta', async () => {
      expect(Exif.parse(original).ifd0).toEqual({ Make: 'Nikon' });
      const strippedMeta = meta({ exifAt, stripped: true });
      const padding = meta({ exifAt }).length - strippedMeta.length;
      const expected = concat(
        ftypBox,
        box('mdat', image, new Uint8Array(xmp.length)),
        strippedMeta,
        box('free', new Uint8Array(padding - 8)),
        box('mdat', new Uint8Array(exif.length)),
      );
      expect(Exif.strip(original)).toEqual(expected);
      for (const seed of [1, 2, 3]) {
        expect(await stripStream(randomChunks(original, seed, 32))).toEqual(expected);
      }
    });

    test('throws TruncatedError when the input ends inside the meta box', async () => {
      const bytes = original.subarray(0, metaAt + 20);
      expect(() => Exif.strip(bytes)).toThrow(Exif.TruncatedError);
      await expect(stripStream([bytes])).rejects.toThrow(Exif.TruncatedError);
    });

    test('throws InvalidInputError for a HEIF file without a meta box', async () => {
      const bytes = concat(ftypBox, mdatBefore);
      expect(() => Exif.strip(bytes)).toThrow(Exif.InvalidInputError);
      await expect(stripStream([bytes])).rejects.toThrow(Exif.InvalidInputError);
    });

    test('throws UnsupportedError for an MP4 file', () => {
      const bytes = concat(box('ftyp', ascii('isom'), u32(0), ascii('isommp41')), mdatBefore);
      expect(() => Exif.strip(bytes)).toThrow(Exif.UnsupportedError);
    });

    test('throws UnsupportedError when an Exif item shares bytes with the image', () => {
      const shared = meta({
        exifAt,
        locations: [
          [1, 0, imageAt, image.length],
          [2, 0, imageAt + 8, 8],
        ],
      });
      expect(() => Exif.strip(concat(ftypBox, mdatBefore, shared))).toThrow(Exif.UnsupportedError);
    });

    test('throws UnsupportedError when an Exif item is built from another item', () => {
      const built = meta({
        exifAt,
        locations: [
          [1, 0, imageAt, image.length],
          [2, 2, 0, 8],
        ],
      });
      expect(() => Exif.strip(concat(ftypBox, mdatBefore, built))).toThrow(Exif.UnsupportedError);
    });
  });

  test('throws InvalidInputError for a JPEG with bytes between segments', () => {
    const bytes = concat([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0], [0x12, 0x34], [0xff, 0xd9]);
    expect(() => Exif.strip(bytes)).toThrow(Exif.InvalidInputError);
  });

  test('StripStream errors with the abort reason', async () => {
    const controller = new AbortController();
    const source = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array([0xff, 0xd8]));
      },
    });
    const result = collect(source.pipeThrough(new Exif.StripStream({ signal: controller.signal })));
    controller.abort(new Error('stop'));
    await expect(result).rejects.toThrow('stop');
  });

  test('StripStream removes its abort listener when it ends', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const bytes = concat([0xff, 0xd8], [0xff, 0xd9]);
    const source = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(bytes);
        stream.close();
      },
    });
    const output = collect(source.pipeThrough(new Exif.StripStream({ signal: controller.signal })));
    expect(await output).toEqual(bytes);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
