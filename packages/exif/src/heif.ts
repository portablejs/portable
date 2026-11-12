import * as Bytes from '@portable/bytes';
import { InvalidInputError, TruncatedError, UnsupportedError } from './errors.js';
import { u16be, u32be } from './parse.js';

/** A box in a HEIF file. `at` is the start of its header and `start` the start of its content. */
type Box = { type: string; at: number; start: number; end: number };

/** A byte range, from `start` up to but not including `end`. */
export type Range = { start: number; end: number };

type Location = {
  id: number;
  at: number;
  end: number;
  method: number;
  dataReference: number;
  extents: Range[];
};

const heifBrands = new Set([
  'mif1',
  'mif2',
  'mif3',
  'msf1',
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'avif',
  'avis',
  'avci',
  'avcs',
]);

/**
 * Finds the top-level `meta` box in `bytes`, which holds the start of a HEIF file. Returns the box
 * if `bytes` holds all of it. Otherwise returns how many bytes from the start of the file it needs
 * to read further. If `final` is true, `bytes` holds the whole file.
 */
export function findMeta(bytes: Uint8Array, final: boolean): Box | number {
  const limit = final ? bytes.length : Infinity;
  for (let at = 0; ;) {
    const box = readBox(bytes, at, limit);
    if (!box) {
      if (final) {
        throw new InvalidInputError('Invalid HEIF: no meta box.');
      }
      return at + 16;
    }
    if (box.end > bytes.length && (at === 0 || box.type === 'meta')) {
      if (final) {
        throw new TruncatedError(`Input ended inside the HEIF ${box.type} box.`);
      }
      return box.end;
    }
    if (at === 0 && (box.type !== 'ftyp' || !hasHeifBrand(bytes, box))) {
      throw new UnsupportedError();
    }
    if (box.type === 'meta') {
      return box;
    }
    at = box.end;
  }
}

/**
 * Removes the `Exif` and XMP items from the `meta` box of a HEIF file. Returns the new bytes for
 * the file up to the end of `meta`, and the ranges after `meta` that hold those items' data.
 * `strip` and `StripStream` overwrite those ranges with zeros. A `free` box follows the new `meta`
 * box and keeps the file the same length, so that every offset in `iloc` stays valid.
 */
export function stripMeta(
  bytes: Uint8Array,
  meta: Box,
): { head: Uint8Array<ArrayBuffer>; clear: Range[] } {
  const children = readChildren(bytes, meta.start + 4, meta.end);
  const iinf = children.find((box) => box.type === 'iinf');
  const iloc = children.find((box) => box.type === 'iloc');
  const idat = children.find((box) => box.type === 'idat');
  const removed = iinf ? metadataItems(bytes, iinf) : new Set<number>();
  if (removed.size === 0) {
    return { head: bytes.slice(0, meta.end), clear: [] };
  }
  const locations = iloc ? readLocations(bytes, iloc) : [];

  const fileClear: Range[] = [];
  const idatClear: Range[] = [];
  const fileKept: Range[] = [];
  const idatKept: Range[] = [];
  for (const location of locations) {
    const removing = removed.has(location.id);
    if (location.dataReference !== 0) {
      continue;
    }
    if (location.method > 1) {
      if (removing) {
        throw new UnsupportedError(
          'Unsupported HEIF: an Exif or XMP item is built from another item.',
        );
      }
      continue;
    }
    for (const extent of location.extents) {
      if (removing && extent.end === Infinity) {
        throw new UnsupportedError('Unsupported HEIF: an Exif or XMP item has no length.');
      }
      const inIdat = location.method === 1;
      (removing ? (inIdat ? idatClear : fileClear) : inIdat ? idatKept : fileKept).push(extent);
    }
  }
  if (overlaps(fileClear, fileKept) || overlaps(idatClear, idatKept)) {
    throw new UnsupportedError(
      'Unsupported HEIF: an Exif or XMP item shares bytes with another item.',
    );
  }
  if (overlaps(fileClear, [{ start: meta.at, end: meta.end }])) {
    throw new UnsupportedError('Unsupported HEIF: an Exif or XMP item is inside the meta box.');
  }

  const parts = [bytes.subarray(meta.start, meta.start + 4)] satisfies Uint8Array[];
  for (const child of children) {
    if (child === iinf) {
      parts.push(rewriteIinf(bytes, child, removed));
    } else if (child === iloc) {
      parts.push(rewriteIloc(bytes, child, locations, removed));
    } else if (child.type === 'iref') {
      parts.push(rewriteIref(bytes, child, removed));
    } else if (child.type === 'iprp') {
      parts.push(rewriteIprp(bytes, child, removed));
    } else if (child === idat) {
      const copy = bytes.slice(child.at, child.end);
      fill(copy, idatClear, child.start - child.at);
      parts.push(copy);
    } else {
      parts.push(bytes.subarray(child.at, child.end));
    }
  }
  const body = Bytes.concat(parts);
  const newMeta = box('meta', [body], meta.start - meta.at === 16);
  const padding = meta.end - meta.at - newMeta.length;

  const head = new Uint8Array(meta.end);
  head.set(bytes.subarray(0, meta.at));
  fill(
    head,
    fileClear.filter((range) => range.start < meta.at),
    0,
  );
  head.set(newMeta, meta.at);
  head.set(box('free', [new Uint8Array(padding - 8)]), meta.at + newMeta.length);
  return { head, clear: merge(fileClear.filter((range) => range.start >= meta.end)) };
}

function hasHeifBrand(bytes: Uint8Array, ftyp: Box): boolean {
  for (let at = ftyp.start; at + 4 <= ftyp.end; at += at === ftyp.start ? 8 : 4) {
    if (heifBrands.has(fourcc(bytes, at))) {
      return true;
    }
  }
  return false;
}

/**
 * Reads the header of the box at `at`, or returns `undefined` if `bytes` ends inside it. A box
 * whose size is 0 extends to `limit`.
 */
function readBox(bytes: Uint8Array, at: number, limit: number): Box | undefined {
  if (at + 8 > bytes.length) {
    return undefined;
  }
  let length = u32be(bytes, at);
  let start = at + 8;
  if (length === 1) {
    if (at + 16 > bytes.length) {
      return undefined;
    }
    length = u32be(bytes, at + 8) * 0x100000000 + u32be(bytes, at + 12);
    start = at + 16;
  } else if (length === 0) {
    length = limit - at;
  }
  if (length < start - at) {
    throw new InvalidInputError('Invalid HEIF: a box is shorter than its header.');
  }
  return { type: fourcc(bytes, at + 4), at, start, end: at + length };
}

function readChildren(bytes: Uint8Array, start: number, end: number): Box[] {
  const children: Box[] = [];
  for (let at = start; at < end;) {
    const child = readBox(bytes, at, end);
    if (!child || child.end > end) {
      throw new InvalidInputError('Invalid HEIF: a box extends past its parent.');
    }
    children.push(child);
    at = child.end;
  }
  return children;
}

/** Returns the IDs of the `Exif` items, and of the XMP items: `mime` items of `application/rdf+xml`. */
function metadataItems(bytes: Uint8Array, iinf: Box): Set<number> {
  const items = new Set<number>();
  for (const infe of infeBoxes(bytes, iinf)) {
    const id = infeId(bytes, infe);
    const typeAt = infe.start + 4 + (bytes[infe.start] === 2 ? 2 : 4) + 2;
    if (id === undefined || typeAt + 4 > infe.end) {
      continue;
    }
    const type = fourcc(bytes, typeAt);
    if (type === 'Exif') {
      items.add(id);
    } else if (type === 'mime') {
      const strings = bytes.subarray(typeAt + 4, infe.end);
      const nameEnd = strings.indexOf(0);
      const typeEnd = nameEnd < 0 ? -1 : strings.indexOf(0, nameEnd + 1);
      const contentType = new TextDecoder().decode(strings.subarray(nameEnd + 1, typeEnd));
      if (typeEnd >= 0 && contentType.toLowerCase() === 'application/rdf+xml') {
        items.add(id);
      }
    }
  }
  return items;
}

/** Returns the item ID of an `infe` box of version 2 or later. */
function infeId(bytes: Uint8Array, infe: Box): number | undefined {
  const version = bytes[infe.start];
  const idSize = version === 2 ? 2 : 4;
  if (version === undefined || version < 2 || infe.start + 4 + idSize > infe.end) {
    return undefined;
  }
  return readSized(bytes, infe.start + 4, idSize);
}

function infeBoxes(bytes: Uint8Array, iinf: Box): Box[] {
  const countSize = bytes[iinf.start] === 0 ? 2 : 4;
  return readChildren(bytes, iinf.start + 4 + countSize, iinf.end).filter(
    (child) => child.type === 'infe',
  );
}

function rewriteIinf(bytes: Uint8Array, iinf: Box, removed: Set<number>): Uint8Array {
  const countSize = bytes[iinf.start] === 0 ? 2 : 4;
  const kept = readChildren(bytes, iinf.start + 4 + countSize, iinf.end).filter((child) => {
    const id = child.type === 'infe' ? infeId(bytes, child) : undefined;
    return id === undefined || !removed.has(id);
  });
  return box('iinf', [
    bytes.subarray(iinf.start, iinf.start + 4),
    sized(kept.length, countSize),
    ...kept.map((child) => bytes.subarray(child.at, child.end)),
  ]);
}

function readLocations(bytes: Uint8Array, iloc: Box): Location[] {
  const version = bytes[iloc.start]!;
  let at = iloc.start + 4;
  const idSize = version < 2 ? 2 : 4;
  need(at + 2 + idSize, iloc);
  const offsetSize = bytes[at]! >> 4;
  const lengthSize = bytes[at]! & 15;
  const baseOffsetSize = bytes[at + 1]! >> 4;
  const indexSize = version === 0 ? 0 : bytes[at + 1]! & 15;
  for (const size of [offsetSize, lengthSize, baseOffsetSize, indexSize]) {
    if (size !== 0 && size !== 4 && size !== 8) {
      throw new InvalidInputError(`Invalid HEIF: iloc field size ${size}.`);
    }
  }
  const count = readSized(bytes, at + 2, idSize);
  at += 2 + idSize;
  const locations: Location[] = [];
  for (let item = 0; item < count; item++) {
    const entry = at;
    need(at + idSize + (version === 0 ? 0 : 2) + 2 + baseOffsetSize + 2, iloc);
    const id = readSized(bytes, at, idSize);
    at += idSize;
    const method = version === 0 ? 0 : bytes[at + 1]! & 15;
    at += version === 0 ? 0 : 2;
    const dataReference = u16be(bytes, at);
    const base = readSized(bytes, at + 2, baseOffsetSize);
    at += 2 + baseOffsetSize;
    const extentCount = u16be(bytes, at);
    at += 2;
    const extentSize = indexSize + offsetSize + lengthSize;
    need(at + extentCount * extentSize, iloc);
    const extents: Range[] = [];
    // When `index_size`, `offset_size`, and `length_size` are all 0, every extent is the same.
    for (let i = 0; i < (extentSize === 0 ? Math.min(extentCount, 1) : extentCount); i++) {
      at += indexSize;
      const start = base + readSized(bytes, at, offsetSize);
      const length = readSized(bytes, at + offsetSize, lengthSize);
      at += offsetSize + lengthSize;
      extents.push({ start, end: length === 0 ? Infinity : start + length });
    }
    locations.push({ id, at: entry, end: at, method, dataReference, extents });
  }
  return locations;
}

function rewriteIloc(
  bytes: Uint8Array,
  iloc: Box,
  locations: readonly Location[],
  removed: Set<number>,
): Uint8Array {
  const idSize = bytes[iloc.start]! < 2 ? 2 : 4;
  const kept = locations.filter((location) => !removed.has(location.id));
  return box('iloc', [
    bytes.subarray(iloc.start, iloc.start + 6),
    sized(kept.length, idSize),
    ...kept.map((location) => bytes.subarray(location.at, location.end)),
  ]);
}

function rewriteIref(bytes: Uint8Array, iref: Box, removed: Set<number>): Uint8Array {
  need(iref.start + 4, iref);
  const idSize = bytes[iref.start] === 0 ? 2 : 4;
  const parts = [bytes.subarray(iref.start, iref.start + 4)] satisfies Uint8Array[];
  for (const reference of readChildren(bytes, iref.start + 4, iref.end)) {
    need(reference.start + idSize + 2, reference);
    const from = readSized(bytes, reference.start, idSize);
    const count = u16be(bytes, reference.start + idSize);
    const toAt = reference.start + idSize + 2;
    need(toAt + count * idSize, reference);
    const to: number[] = [];
    for (let i = 0; i < count; i++) {
      const id = readSized(bytes, toAt + i * idSize, idSize);
      if (!removed.has(id)) {
        to.push(id);
      }
    }
    if (removed.has(from) || to.length === 0) {
      continue;
    }
    parts.push(
      box(reference.type, [
        sized(from, idSize),
        sized(to.length, 2),
        ...to.map((id) => sized(id, idSize)),
      ]),
    );
  }
  return box('iref', parts);
}

function rewriteIprp(bytes: Uint8Array, iprp: Box, removed: Set<number>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const child of readChildren(bytes, iprp.start, iprp.end)) {
    parts.push(
      child.type === 'ipma'
        ? rewriteIpma(bytes, child, removed)
        : bytes.subarray(child.at, child.end),
    );
  }
  return box('iprp', parts);
}

function rewriteIpma(bytes: Uint8Array, ipma: Box, removed: Set<number>): Uint8Array {
  need(ipma.start + 8, ipma);
  const idSize = bytes[ipma.start]! < 1 ? 2 : 4;
  const indexSize = (bytes[ipma.start + 3]! & 1) === 1 ? 2 : 1;
  const count = u32be(bytes, ipma.start + 4);
  const kept: Uint8Array[] = [];
  let at = ipma.start + 8;
  for (let entry = 0; entry < count; entry++) {
    need(at + idSize + 1, ipma);
    const id = readSized(bytes, at, idSize);
    const end = at + idSize + 1 + bytes[at + idSize]! * indexSize;
    need(end, ipma);
    if (!removed.has(id)) {
      kept.push(bytes.subarray(at, end));
    }
    at = end;
  }
  return box('ipma', [bytes.subarray(ipma.start, ipma.start + 4), sized(kept.length, 4), ...kept]);
}

function need(end: number, box: Box): void {
  if (end > box.end) {
    throw new InvalidInputError(`Invalid HEIF: the ${box.type} box is too short.`);
  }
}

function overlaps(a: readonly Range[], b: readonly Range[]): boolean {
  const x = merge(a);
  const y = merge(b);
  for (let i = 0, j = 0; i < x.length && j < y.length;) {
    if (x[i]!.end <= y[j]!.start) {
      i++;
    } else if (y[j]!.end <= x[i]!.start) {
      j++;
    } else {
      return true;
    }
  }
  return false;
}

function merge(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Writes zeros over the parts of `ranges` inside `bytes`. Adding `offset` to a position in a range
 * gives its index in `bytes`.
 */
function fill(bytes: Uint8Array, ranges: readonly Range[], offset: number): void {
  for (const range of ranges) {
    bytes.fill(0, Math.max(0, range.start + offset), Math.min(bytes.length, range.end + offset));
  }
}

function box(type: string, body: readonly Uint8Array[], large = false): Uint8Array {
  const content = Bytes.concat(body);
  const header = large || content.length + 8 > 0xffffffff ? 16 : 8;
  const result = new Uint8Array(header + content.length);
  const length = result.length;
  if (header === 16) {
    result.set(sized(1, 4), 0);
    result.set(sized(length, 8), 8);
  } else {
    result.set(sized(length, 4), 0);
  }
  for (let i = 0; i < 4; i++) {
    result[4 + i] = type.charCodeAt(i);
  }
  result.set(content, header);
  return result;
}

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

function readSized(bytes: Uint8Array, at: number, size: number): number {
  if (size === 0) {
    return 0;
  }
  if (size === 2) {
    return u16be(bytes, at);
  }
  if (size === 4) {
    return u32be(bytes, at);
  }
  return u32be(bytes, at) * 0x100000000 + u32be(bytes, at + 4);
}

function sized(value: number, size: number): Uint8Array {
  const result = new Uint8Array(size);
  for (let i = size - 1; i >= 0; i--) {
    result[i] = value % 256;
    value = Math.floor(value / 256);
  }
  return result;
}
