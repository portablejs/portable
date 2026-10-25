import { describe, expect, test } from 'vite-plus/test';
import { decode, encode, EncoderStream } from '@portable/quoted-printable';
import { decodeStream, decodeText, encodeStream, latin1, split, text, utf8 } from './utils.js';

// Ported from libqp 3.0.1 test/libqp-test.ts. libqp's wrap(encode(x), n) is encode(x, { lineLength: n })
// here, and its encode(x) is encode(x, { lineLength: false }).

const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
const unwrapped = { lineLength: false } as const;

const rfcEncoded = "Now's the time =\r\nfor all folk to come=\r\n to the aid of their country.";
const rfcDecoded = "Now's the time for all folk to come to the aid of their country.";

describe('encode()', () => {
  test('encodes a string as UTF-8', () => {
    expect(encode('tere jõgeva')).toBe('tere j=C3=B5geva');
    expect(encode('€')).toBe('=E2=82=AC');
  });

  test('encodes a Uint8Array the same as the string it holds', () => {
    expect(encode(utf8('tere jõgeva'))).toBe('tere j=C3=B5geva');
  });

  test('returns an empty string for empty input', () => {
    expect(encode('')).toBe('');
    expect(encode(new Uint8Array(0))).toBe('');
  });

  test('keeps the printable ASCII range except "=" literal', () => {
    let printable = '';
    for (let i = 0x21; i <= 0x7e; i++) {
      printable += String.fromCharCode(i);
    }
    expect(encode(printable, unwrapped)).toBe(printable.replace('=', '=3D'));
  });

  test('escapes every other byte with uppercase hex digits', () => {
    const encoded = encode(allBytes);
    const escaped = [...allBytes].filter(
      (i) => !(i === 0x09 || i === 0x0a || i === 0x0d || (i >= 0x20 && i <= 0x7e && i !== 0x3d)),
    );
    for (const i of escaped) {
      expect(encoded).toContain('=' + i.toString(16).toUpperCase().padStart(2, '0'));
    }
    expect(encoded).not.toMatch(/[=][0-9A-F]?[a-f]/);
    expect(decode(encoded)).toEqual(allBytes);
  });

  test('escapes whitespace at the end of a line and at the end of the input', () => {
    expect(encode('a \r\nb\t\nc ')).toBe('a=20\r\nb=09\nc=20');
    expect(encode('a \rb')).toBe('a=20\rb');
    expect(encode('a b\tc')).toBe('a b\tc');
    expect(encode(' ')).toBe('=20');
  });

  test('keeps line breaks literal', () => {
    expect(encode('a\r\nb\nc\rd')).toBe('a\r\nb\nc\rd');
  });

  test('does not wrap with lineLength false', () => {
    expect(encode('a'.repeat(200), unwrapped)).toBe('a'.repeat(200));
  });
});

describe('decode()', () => {
  test('decodes the RFC 2045 example', () => {
    expect(decodeText(rfcEncoded)).toBe(rfcDecoded);
  });

  test('decodes valid escapes and keeps invalid ones', () => {
    expect(decodeText('=41=42=43')).toBe('ABC');
    expect(decodeText('=c3=a9')).toBe('é');
    expect(decodeText('=4G=4')).toBe('=4G=4');
    expect(decodeText('==41')).toBe('=A');
    expect(decodeText('=')).toBe('');
    expect(decodeText('a=4')).toBe('a=4');
    expect(decodeText('a=\r\nb=\nc=')).toBe('abc');
  });

  test('decodes the escape of every byte', () => {
    expect(decode(encode(allBytes))).toEqual(allBytes);
    let lowercase = '';
    for (let i = 0; i < 256; i++) {
      lowercase += '=' + i.toString(16).padStart(2, '0');
    }
    expect(decode(lowercase)).toEqual(allBytes);
  });

  test('returns empty bytes for empty input', () => {
    expect(decode('')).toEqual(new Uint8Array(0));
    expect(decode(new Uint8Array(0))).toEqual(new Uint8Array(0));
  });

  test('reads a Uint8Array view byte for byte', () => {
    const input = latin1('caf\xe9 =E9 =\r\nx');
    const view = new Uint8Array(input.length + 4).fill(0x41);
    view.set(input, 2);
    expect(decode(view.subarray(2, 2 + input.length))).toEqual(latin1('caf\xe9 \xe9 x'));
  });

  test('removes whitespace from the end of lines', () => {
    expect(decodeText('abc  \r\ndef \t\nghi  ')).toBe('abc\r\ndef\nghi');
    expect(decodeText('   \n   ')).toBe('\n');
    expect(decodeText('a  b')).toBe('a  b');
    expect(decodeText('a =20\r\n')).toBe('a  \r\n');
  });

  test('treats a soft line break with trailing whitespace as a soft line break', () => {
    expect(decodeText('foo= \t\r\nbar')).toBe('foobar');
  });

  test('keeps whitespace in front of a soft line break', () => {
    expect(decodeText('foo =\r\nbar')).toBe('foo bar');
  });

  test('sizes the output for a body made of escapes', () => {
    const count = 1024 * 1024;
    const decoded = decode('=41'.repeat(count));
    expect(decoded.length).toBe(count);
    expect(decoded[0]).toBe(0x41);
    expect(decoded[count - 1]).toBe(0x41);
  });
});

describe('raw 8-bit bytes in quoted-printable input', () => {
  const utf8Input = latin1('caf\xc3\xa9 \xe2\x82\xac =C3=A9');
  const utf8Expected = utf8('café € é');
  const latin1Input = latin1('caf\xe9 =E9');
  const latin1Expected = Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x20, 0xe9);

  test('decode() keeps raw UTF-8 bytes', () => {
    expect(decode(utf8Input)).toEqual(utf8Expected);
  });

  test('decode() keeps raw latin1 bytes', () => {
    expect(decode(latin1Input)).toEqual(latin1Expected);
  });

  test('decode() reads a string as UTF-8', () => {
    expect(decode('caf\xe9 =E9')).toEqual(Uint8Array.of(0x63, 0x61, 0x66, 0xc3, 0xa9, 0x20, 0xe9));
  });

  test('the stream keeps raw UTF-8 bytes', async () => {
    expect(await decodeStream([utf8Input])).toEqual(utf8Expected);
  });

  test('the stream keeps raw latin1 bytes', async () => {
    expect(await decodeStream([latin1Input])).toEqual(latin1Expected);
  });

  test('the stream keeps raw bytes and escapes split byte by byte', async () => {
    expect(await decodeStream(split(utf8Input, 1))).toEqual(utf8Expected);
  });
});

describe('soft line breaks', () => {
  test('adds soft line breaks', () => {
    expect(encode('abc jõgeva', { lineLength: 10 })).toBe('abc j=\r\n=C3=B5geva');
  });

  test('returns short input as is', () => {
    expect(encode('abc', { lineLength: 10 })).toBe('abc');
  });

  test('keeps every line within 76 characters by default', () => {
    const input = 'õ'.repeat(200) + ' ' + 'a'.repeat(300);
    const encoded = encode(input);
    for (const line of encoded.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
    expect(decodeText(encoded)).toBe(input);
  });

  test('breaks at a space near the end of the line', () => {
    expect(encode('aaaa bbbb cccc', { lineLength: 10 })).toBe('aaaa bbbb=\r\n cccc');
  });

  test('keeps existing line breaks', () => {
    const input = 'a'.repeat(10) + '\r\n' + 'b'.repeat(10) + '\n' + 'c'.repeat(5);
    expect(encode(input, { lineLength: 12 })).toBe(input);
  });

  test('never splits an escape sequence', () => {
    const input = new Uint8Array(100).fill(0xff);
    for (let lineLength = 4; lineLength < 20; lineLength++) {
      for (const line of encode(input, { lineLength }).split('=\r\n')) {
        expect(line).toMatch(/^(?:=FF)*$/);
      }
    }
  });

  test('never splits a UTF-8 sequence', () => {
    expect(encode('€€€', { lineLength: 20 })).toBe('=E2=82=AC=\r\n=E2=82=AC=E2=82=AC');
    for (const char of ['õ', '€', '😀']) {
      const input = char.repeat(50);
      for (let lineLength = 14; lineLength <= 80; lineLength++) {
        const encoded = encode(input, { lineLength });
        for (const line of encoded.split('=\r\n')) {
          expect(line.length).toBeLessThanOrEqual(lineLength);
          const decoded = decodeText(line);
          expect(decoded).toBe(char.repeat(decoded.length / char.length));
        }
        expect(decodeText(encoded)).toBe(input);
      }
    }
  });

  test('keeps a line that holds nothing but one UTF-8 sequence whole', () => {
    expect(encode('€€', { lineLength: 10 })).toBe('=E2=82=AC=\r\n=E2=82=AC');
  });

  test('keeps a UTF-8 sequence on the line of a hyphen escape that holds nothing else', () => {
    const input = latin1('\xf0\x90\x80\x80\t-\xf0\x90\x80\x80\x00');
    expect(encode(input, { lineLength: 16 })).toBe('=F0=90=80=80\t=\r\n=2D=F0=90=80=80=\r\n=00');
  });

  test('returns input exactly as long as the line length as is', () => {
    expect(encode('abcd e', { lineLength: 6 })).toBe('abcd e');
  });

  test('keeps the rest of a line whole when it fits', () => {
    expect(encode('abcdefghijk lm', { lineLength: 9 })).toBe('abcdefgh=\r\nijk lm');
    expect(encode('abcdefghijklm no', { lineLength: 9 })).toBe('abcdefgh=\r\nijklm no');
    expect(encode('abcdefghijklm no\nx', { lineLength: 9 })).toBe('abcdefgh=\r\nijklm no\nx');
  });

  test('starts the line after a hard line break with the full line length', () => {
    expect(encode('ab\r\n' + 'c'.repeat(12), { lineLength: 6 })).toBe(
      'ab\r\nccccc=\r\nccccc=\r\ncc',
    );
    expect(encode('abcd\nefghijklmnop', { lineLength: 6 })).toBe('abcd\nefghi=\r\njklmn=\r\nop');
  });

  test('cuts a UTF-8 sequence only at a lead byte', () => {
    expect(encode(latin1('a\xc3\xc0\xb5bbbbbbbb'), { lineLength: 10 })).toBe(
      'a=C3=\r\n=C0=B5bbb=\r\nbbbbb',
    );
  });

  test('does not count a line break towards the line length', () => {
    expect(encode('aaaaaaa\nbb', { lineLength: 7 })).toBe('aaaaaaa\nbb');
    expect(encode('aaaaaaa\r\nbb', { lineLength: 7 })).toBe('aaaaaaa\r\nbb');
    expect(encode('aaaaaa\r\nbb', { lineLength: 7 })).toBe('aaaaaa\r\nbb');
    expect(encode('ab\ncdefghi', { lineLength: 7 })).toBe('ab\ncdefghi');
    expect(encode('\n-- ', { lineLength: 7 })).toBe('\n=2D-=20');
    expect(encode('ab\n' + 'c'.repeat(12), { lineLength: 6 })).toBe('ab\nccccc=\r\nccccc=\r\ncc');
  });

  test('uses 76 characters by default', () => {
    const encoded = encode('a'.repeat(200));
    expect(encoded).toBe(encode('a'.repeat(200), { lineLength: 76 }));
    expect(encoded.split('\r\n')[0]!.length).toBe(76);
  });

  test('rejects a line length that is not an integer of at least 4', () => {
    for (const lineLength of [-5, 0, 1, 3, 7.5, Number.NaN, Infinity]) {
      expect(() => encode('a', { lineLength })).toThrow(RangeError);
    }
    expect(() => encode('a', { lineLength: 4 })).not.toThrow();
  });

  test('keeps every line within a line length of 4', () => {
    const inputs = [encode('tere jõgeva -x'), '-'.repeat(20), 'õõ', 'a'.repeat(30)];
    for (const input of inputs) {
      const encoded = encode(input, { lineLength: 4 });
      for (const line of encoded.split('\r\n')) {
        expect(line.length).toBeLessThanOrEqual(4);
      }
      expect(decodeText(encoded)).toBe(input);
    }
  });
});

describe('hyphens at the start of a line', () => {
  test('escapes a hyphen that starts a line', () => {
    expect(encode('--boundary\r\n-x')).toBe('=2D-boundary\r\n=2Dx');
    expect(encode('\n-')).toBe('\n=2D');
  });

  test('keeps a hyphen inside a line', () => {
    expect(encode('a-b --c')).toBe('a-b --c');
  });

  test('escapes a hyphen after a lone CR', () => {
    expect(encode('a\r--b')).toBe('a\r=2D-b');
    expect(encode(utf8('a\r--b'))).toBe('a\r=2D-b');
  });

  test('escapes a hyphen that a soft line break moves to the start of a line', () => {
    const input = 'a'.repeat(75) + '-x';
    const encoded = encode(input);
    expect(encoded).toBe('a'.repeat(75) + '=\r\n=2Dx');
    expect(decodeText(encoded)).toBe(input);
  });

  test('fills a line that starts with an escaped hyphen', () => {
    expect(encode('abcdef-ghijklmno', { lineLength: 7 })).toBe('abcdef=\r\n=2Dghi=\r\njklmno');
  });

  test('keeps every line within the line length when escaping', () => {
    for (const lineLength of [4, 5, 6, 7, 10, 76]) {
      const input = '-'.repeat(300);
      const lines = encode(input, { lineLength }).split('\r\n');
      expect(lines.length).toBeGreaterThan(3);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(lineLength);
        expect(line[0]).not.toBe('-');
      }
      expect(decodeText(lines.join('\r\n'))).toBe(input);
    }
  });

  test('escapes a hyphen that ends the input after a soft line break', () => {
    expect(encode('aaaaaaa-', { lineLength: 8 })).toBe('aaaaaaa-');
    expect(encode('aaaaaaaa-', { lineLength: 8 })).toBe('aaaaaaa=\r\na-');
    expect(encode('aaaaaaa-', { lineLength: 7 })).toBe('aaaaaa=\r\na-');
    expect(encode('aaaaa-a', { lineLength: 6 })).toBe('aaaaa=\r\n=2Da');
    expect(encode('aaa-a', { lineLength: 4 })).toBe('aaa=\r\n=2Da');
    expect(encode('aaa-ab', { lineLength: 4 })).toBe('aaa=\r\n=2D=\r\nab');
    expect(encode('aaa--', { lineLength: 4 })).toBe('aaa=\r\n=2D-');
  });

  test('the stream escapes a hyphen at the start of a chunk only when it starts a line', async () => {
    for (const options of [{}, unwrapped]) {
      expect(await encodeStream(['-a'], options)).toBe('=2Da');
      expect(await encodeStream(['ab\n', '-c'], options)).toBe('ab\n=2Dc');
      expect(await encodeStream(['ab', '-c'], options)).toBe('ab-c');
      expect(await encodeStream(['ab\n ', '-c'], options)).toBe('ab\n -c');
    }
  });

  test('the stream output never starts a line with a hyphen', async () => {
    const input =
      'text\r\n--boundary\r\nContent-Type: application/x-evil; name=evil.exe\r\n\r\n' +
      '-'.repeat(200) +
      '\r\n';
    for (const options of [{}, unwrapped, { binary: true }]) {
      const encoded = await encodeStream(split(utf8(input), 7), options);
      expect(encoded).not.toMatch(/(^|\n)-/);
      expect(decodeText(encoded)).toBe(input);
    }
  });
});

describe('EncoderStream', () => {
  test('encodes a stream', async () => {
    expect(await encodeStream([utf8('tere jõgeva')])).toBe('tere j=C3=B5geva');
  });

  test('encodes string chunks as UTF-8', async () => {
    expect(await encodeStream(['tere jõgeva'])).toBe('tere j=C3=B5geva');
  });

  test('encodes a surrogate pair split across string chunks', async () => {
    expect(await encodeStream(['a\ud83d', '\ude00b'])).toBe('a=F0=9F=98=80b');
  });

  test('produces no output for empty input', async () => {
    expect(await encodeStream([])).toBe('');
    expect(await encodeStream([new Uint8Array(0)])).toBe('');
  });

  test('wraps lines at 76 characters by default', async () => {
    const input = utf8('õ'.repeat(200));
    const encoded = await encodeStream(split(input, 13));
    expect(encoded).toBe(encode(input));
    for (const line of encoded.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  test('wraps lines at a custom length', async () => {
    const input = utf8('a'.repeat(100));
    expect(await encodeStream([input], { lineLength: 10 })).toBe(encode(input, { lineLength: 10 }));
  });

  test('does not wrap with lineLength false', async () => {
    expect(await encodeStream([utf8('a'.repeat(200))], unwrapped)).toBe('a'.repeat(200));
  });

  test('rejects an invalid line length', () => {
    expect(() => new EncoderStream({ lineLength: 2 })).toThrow(RangeError);
  });

  test('produces the same output however the input is split', async () => {
    const input = utf8('a \r\nb\t \nc  d \t' + ' '.repeat(10) + '\r\n-e õ\r\n \n ');
    for (const options of [
      unwrapped,
      { lineLength: false, binary: true } as const,
      {},
      { lineLength: 5 },
    ]) {
      const expected = encode(input, options);
      for (let size = 1; size <= input.length; size++) {
        expect(await encodeStream(split(input, size), options)).toBe(expected);
      }
    }
  });

  test('encodes whitespace at the end of the input', async () => {
    expect(await encodeStream(['a', ' ', '\t'])).toBe('a =09');
    expect(await encodeStream(['  '])).toBe(' =20');
    expect(await encodeStream(['a ', '\r\n'])).toBe('a=20\r\n');
  });

  test('wraps held back whitespace with the line it ends', async () => {
    expect(await encodeStream([utf8('\n-- ')], { lineLength: 7 })).toBe('\n=2D-=20');
  });

  test('wraps a CR at the end of a chunk once it is known whether LF follows', async () => {
    const input = utf8('-\0\r\n-\0\rx');
    const expected = encode(input, { lineLength: 6 });
    expect(expected).toBe('=2D=00\r\n=2D=\r\n=00\rx');
    expect(await encodeStream(split(input, 1), { lineLength: 6 })).toBe(expected);
    expect(await encodeStream(['abcdef', '\r'], { lineLength: 6 })).toBe(
      encode('abcdef\r', { lineLength: 6 }),
    );
  });

  test('ignores empty chunks', async () => {
    expect(await encodeStream(['a ', new Uint8Array(0), '', 'b'])).toBe('a b');
    expect(await encodeStream(['a ', new Uint8Array(0)])).toBe('a=20');
  });

  test('encodes a large chunk', async () => {
    const input = utf8('aõ -\r\n'.repeat(30 * 1024));
    const encoded = await encodeStream([input]);
    expect(encoded).toBe(encode(input));
    expect(decode(encoded)).toEqual(input);
    expect(await encodeStream([input], unwrapped)).toBe(encode(input, unwrapped));
  });

  test('encodes a long whitespace run', async () => {
    const input = utf8('a' + ' '.repeat(100 * 1024) + '\r\nb');
    const encoded = await encodeStream([input], unwrapped);
    expect(decode(encoded)).toEqual(input);
    expect(encoded.endsWith(' =20\r\nb')).toBe(true);
  });
});

describe('binary', () => {
  const binary = { binary: true } as const;

  test('encodes a CR or LF that is not part of a CRLF pair', async () => {
    expect(encode('a\rb\nc\r\nd\n\re', binary)).toBe('a=0Db=0Ac\r\nd=0A=0De');
    expect(await encodeStream(['a\rb\nc\r\nd\n\re'], binary)).toBe('a=0Db=0Ac\r\nd=0A=0De');
  });

  test('encodes a trailing CR', async () => {
    expect(await encodeStream(['a\r'], binary)).toBe('a=0D');
    expect(await encodeStream(['a\r', '\nb'], binary)).toBe('a\r\nb');
    expect(await encodeStream(['a\r', 'b'], binary)).toBe('a=0Db');
  });

  test('keeps CRLF pairs split across chunks', async () => {
    const input = utf8('a\r\nb \r\n\r\r\n\n');
    for (let size = 1; size <= input.length; size++) {
      expect(await encodeStream(split(input, size), { binary: true, lineLength: false })).toBe(
        'a\r\nb=20\r\n=0D\r\n=0A',
      );
    }
  });

  test('round trips arbitrary bytes', async () => {
    const input = Uint8Array.from(
      { length: 5000 },
      (_, i) => (i * 7919 + Math.floor(i / 256)) % 256,
    );
    const encoded = await encodeStream(split(input, 333), binary);
    expect(encoded).not.toMatch(/\r(?!\n)|(?<!\r)\n/);
    expect(decode(encoded)).toEqual(input);
  });
});

describe('DecoderStream', () => {
  test('decodes a stream', async () => {
    expect(text(await decodeStream([utf8(rfcEncoded)]))).toBe(rfcDecoded);
  });

  test('decodes string chunks', async () => {
    expect(text(await decodeStream([rfcEncoded]))).toBe(rfcDecoded);
  });

  test('produces no output for empty input', async () => {
    expect(await decodeStream([])).toEqual(new Uint8Array(0));
    expect(await decodeStream([new Uint8Array(0)])).toEqual(new Uint8Array(0));
  });

  test('decodes the same however the input is split', async () => {
    const input = utf8(rfcEncoded + '\r\nab=C3=A9=\r\ncd  \r\n=\nx=4=\r\n1 \t= \r\n=\r=');
    const expected = decode(input);
    for (let size = 1; size <= input.length; size++) {
      expect(await decodeStream(split(input, size))).toEqual(expected);
    }
  });
});

describe('round trips', () => {
  test('round trips text through the streams', async () => {
    const input = utf8(
      'Tere jõgeva! ' + '€'.repeat(100) + '\r\n--boundary\r\n' + 'a '.repeat(100) + '\r\n',
    );
    const encoded = await encodeStream(split(input, 17));
    expect(await decodeStream(split(utf8(encoded), 5))).toEqual(input);
  });
});
