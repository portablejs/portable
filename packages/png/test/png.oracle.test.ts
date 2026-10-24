import { readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { zlibSync } from 'fflate';
import { type Metadata, PNG } from 'pngjs';
import { describe, expect, test } from 'vite-plus/test';
import * as Png from '@portable/png';
import { randomBytes } from './utils.js';

const dirs = ['pngsuite', 'pngjs'].map((dir) => new URL(`./fixtures/${dir}/`, import.meta.url));
const files = dirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .map((name) => ({ name, bytes: new Uint8Array(readFileSync(new URL(name, dir))) })),
);

// pngjs's stream parser, its main API. PNG.sync.read also rejects files with bytes after IEND.
function viaPngjs(bytes: Uint8Array) {
  return new Promise<(Metadata & { data: Buffer; gamma: number }) | undefined>((resolve) => {
    let metadata: Metadata;
    new PNG()
      .on('metadata', (m: Metadata) => (metadata = m))
      .parse(Buffer.from(bytes), (error, png) =>
        resolve(error || !png ? undefined : { ...metadata, data: png.data, gamma: png.gamma }),
      );
  });
}

// pngjs sets the color of a tRNS-matched pixel to black, and we keep it, so the comparison
// ignores the color of fully transparent pixels.
function visible(data: Uint8Array): Buffer {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) {
      out.fill(0, i, i + 3);
    }
  }
  return out;
}

function gray(data: Uint8Array): Uint8Array {
  const out = data.slice();
  for (let i = 0; i < out.length; i += 4) {
    out[i + 1] = out[i + 2] = out[i]!;
  }
  return out;
}

const expected = new Map(
  await Promise.all(files.map(async ({ name, bytes }) => [name, await viaPngjs(bytes)] as const)),
);

const decodable = files.filter((file) => expected.get(file.name));

test('rejects the fixtures pngjs rejects', async () => {
  const rejected = files.filter((file) => !decodable.includes(file));
  expect(rejected.map((file) => file.name).sort()).toEqual(
    [
      'with_bad_type.png',
      ...files.filter((file) => file.name.startsWith('x')).map((file) => file.name),
    ].sort(),
  );
  for (const { bytes } of rejected) {
    await expect(Png.decode(bytes)).rejects.toBeInstanceOf(Error);
  }
});

describe('decodes every fixture to the same pixels as pngjs', () => {
  for (const { name: file, bytes } of decodable) {
    test(`${file}`, async () => {
      const png = expected.get(file)!;
      const actual = await Png.decode(bytes);
      expect(actual).toMatchObject({
        width: png.width,
        height: png.height,
        depth: png.depth,
        colorType: png.colorType,
        interlace: png.interlace,
        alpha: png.alpha,
      });
      expect(actual.gamma ?? 0).toBe(png.gamma);
      expect(visible(actual.data).equals(visible(png.data))).toBe(true);
      const sync = Png.decodeSync(bytes, { inflate: inflateSync });
      expect(Buffer.from(sync.data).equals(actual.data)).toBe(true);
    });
  }
});

describe('pngjs decodes our output to the input pixels', () => {
  for (const { name: file, bytes } of decodable) {
    test(`${file}`, async () => {
      const image = await Png.decode(bytes);
      const decoded = PNG.sync.read(Buffer.from(await Png.encode(image)));
      expect(decoded.data.equals(image.data)).toBe(true);
    });
  }
});

describe('pngjs decodes every color type and filter we write the same as its own output', () => {
  const color = PNG.sync.read(
    readFileSync(new URL('./fixtures/pngsuite/basn6a08.png', import.meta.url)),
  );
  // We convert color to gray with BT.709 luma and pngjs averages the channels, so the gray color
  // types are compared on gray input, where both give the same value.
  const grayscale = {
    width: color.width,
    height: color.height,
    data: Buffer.from(gray(color.data)),
  };
  for (const colorType of [0, 2, 4, 6] as const) {
    const image = colorType === 0 || colorType === 4 ? grayscale : color;
    for (const filter of [0, 1, 2, 3, 4, [0, 1, 2, 3, 4]] as const) {
      test(`color type ${colorType}, filter ${String(filter)}`, () => {
        const ours = Png.encodeSync(image, { colorType, filter, deflate: zlibSync });
        const theirs = PNG.sync.write(image as PNG, { colorType });
        expect(PNG.sync.read(Buffer.from(ours)).data.equals(PNG.sync.read(theirs).data)).toBe(true);
      });
    }
  }

  test('custom background', () => {
    const background = { red: 10, green: 200, blue: 30 };
    const ours = Png.encodeSync(color, { colorType: 2, background, deflate: zlibSync });
    const theirs = PNG.sync.write(color, { colorType: 2, bgColor: background });
    expect(PNG.sync.read(Buffer.from(ours)).data.equals(PNG.sync.read(theirs).data)).toBe(true);
  });
});

describe('matches pngjs on random images', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const [w = 0, h = 0] = randomBytes(2, seed);
    const width = 1 + (w % 70);
    const height = 1 + (h % 50);
    const colorType = ([0, 2, 4, 6] as const)[seed % 4]!;
    const random = randomBytes(width * height * 4, seed * 7);
    const data = colorType === 0 || colorType === 4 ? gray(random) : random;

    test(`${width}x${height}, color type ${colorType}, seed ${seed}`, async () => {
      const source = new PNG({ width, height });
      source.data = Buffer.from(data);
      const theirs = PNG.sync.write(source, { colorType });
      const reference = PNG.sync.read(theirs).data;
      const ours = await Png.decode(new Uint8Array(theirs));
      expect(Buffer.from(ours.data).equals(reference)).toBe(true);

      const encoded = await Png.encode({ width, height, data }, { colorType });
      expect(PNG.sync.read(Buffer.from(encoded)).data.equals(reference)).toBe(true);
    });
  }
});
