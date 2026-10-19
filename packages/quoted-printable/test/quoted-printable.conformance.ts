import { describe, expect, test } from 'vite-plus/test'
import { decode, encode } from '@portable/quoted-printable'
import { decodeText, latin1, utf8 } from './utils.js'

// Ported from quoted-printable 1.0.1 tests/tests.js. That library works on byte strings: encode()
// takes one and decode() returns one. Here encode() takes bytes or text and decode() returns bytes,
// so the byte strings become `latin1()` bytes. Where line breaking differs, the comment says why.

const x = (count: number) => 'x'.repeat(count)
const decodeBytes = (input: string) => String.fromCharCode(...decode(input))

describe('encode()', () => {
  test('equals sign', () => {
    // quoted-printable breaks at exactly 75 characters. libqp, and so this package, prefers the
    // last space in the final third of the line.
    expect(
      encode(
        'If you believe that truth=beauty, then surely mathematics is the most beautiful branch of philosophy.',
      ),
    ).toBe(
      'If you believe that truth=3Dbeauty, then surely mathematics is the most =\r\nbeautiful branch of philosophy.',
    )
  })

  test('76-character line limit', () => {
    const input =
      'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat. Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et iusto odio dignissim qui blandit praesent luptatum zzril delenit augue duis dolore te feugait nulla facilisi. Nam liber tempor cum soluta nobis eleifend option congue nihil imperdiet doming id quod mazim placerat facer possim assum. Typi non habent claritatem insitam; est usus legentis in iis qui facit eorum claritatem. Investigationes demonstraverunt lectores legere me lius quod ii legunt saepius. Claritas est etiam processus dynamicus, qui sequitur mutationem consuetudium lectorum. Mirum est notare quam littera gothica, quam nunc putamus parum claram, anteposuerit litterarum formas humanitatis per seacula quarta decima et quinta decima. Eodem modo typi, qui nunc nobis videntur parum clari, fiant sollemnes in futurum.'
    const encoded = encode(input)
    const lines = encoded.split('=\r\n')
    expect(lines.length).toBeGreaterThan(15)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(75)
    expect(lines[0]).toBe(
      'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy ',
    )
    expect(decodeText(encoded)).toBe(input)
  })

  test('trailing space', () => {
    expect(encode('foo ')).toBe('foo=20')
  })

  test('trailing tab', () => {
    expect(encode('foo\t')).toBe('foo=09')
  })

  test('CRLF', () => {
    // quoted-printable escapes every CR and LF. Here line breaks are kept unless `binary` is set,
    // and `binary` keeps a CRLF pair, which a transport can't change, and escapes a lone CR or LF.
    expect(encode('foo\r\nbar')).toBe('foo\r\nbar')
    expect(encode('foo\r\nbar', { binary: true })).toBe('foo\r\nbar')
    expect(encode('foo\rbar\n', { binary: true })).toBe('foo=0Dbar=0A')
  })

  test('exactly 73 to 77 characters of which the last one is "="', () => {
    // For 74 characters, quoted-printable breaks the line because it keeps every line, even the
    // last, within 75. RFC 2045 allows 76 on a line without a soft line break, as libqp does.
    expect(encode(x(72) + '=')).toBe(x(72) + '=3D')
    expect(encode(x(73) + '=')).toBe(x(73) + '=3D')
    expect(encode(x(74) + '=')).toBe(x(74) + '=\r\n=3D')
    expect(encode(x(75) + '=')).toBe(x(75) + '=\r\n=3D')
    expect(encode(x(76) + '=')).toBe(x(75) + '=\r\nx=3D')
  })

  test('exactly 73 to 77 characters of which the last one is a space', () => {
    expect(encode(x(72) + ' ')).toBe(x(72) + '=20')
    expect(encode(x(73) + ' ')).toBe(x(73) + '=20')
    expect(encode(x(74) + ' ')).toBe(x(74) + '=\r\n=20')
    expect(encode(x(75) + ' ')).toBe(x(75) + '=\r\n=20')
    expect(encode(x(76) + ' ')).toBe(x(75) + '=\r\nx=20')
  })

  test('UTF-8 can be used for non-ASCII symbols', () => {
    // A soft line break never splits a UTF-8 sequence here, so the emoji moves to the next line.
    expect(encode(utf8('fooIñtërnâtiônàlizætiøn☃💩bar'))).toBe(
      'fooI=C3=B1t=C3=ABrn=C3=A2ti=C3=B4n=C3=A0liz=C3=A6ti=C3=B8n=E2=98=83=\r\n=F0=9F=92=A9bar',
    )
  })

  test('encodes a string as UTF-8 instead of rejecting characters above U+00FF', () => {
    expect(encode('fooIñtërnâtiônàlizætiøn☃💩bar')).toBe(
      encode(utf8('fooIñtërnâtiônàlizætiøn☃💩bar')),
    )
  })
})

describe('decode()', () => {
  const truth =
    'If you believe that truth=beauty, then surely mathematics is the most beautiful branch of philosophy.'

  test('equals sign', () => {
    expect(
      decodeText(
        'If you believe that truth=3Dbeauty, then surely =\r\nmathematics is the most beautiful branch of philosophy.',
      ),
    ).toBe(truth)
    expect(
      decodeText(
        'If you believe that truth=3Dbeauty, then surely mathematics is the most bea=\r\nutiful branch of philosophy.',
      ),
    ).toBe(truth)
  })

  test('hard line breaks', () => {
    expect(decodeText('foo\nbar')).toBe('foo\nbar')
  })

  test('trailing "="', () => {
    expect(decodeText('foo\r\nbar=')).toBe('foo\r\nbar')
  })

  test('76 * 2 characters', () => {
    expect(decodeText(x(75) + '=\r\n' + x(75) + '=\r\nxx')).toBe(x(152))
  })

  test('soft line break example from the RFC', () => {
    expect(
      decodeText("Now's the time =\r\nfor all folk to come=\r\n to the aid of their country."),
    ).toBe("Now's the time for all folk to come to the aid of their country.")
  })

  test('UTF-8 can be used for non-ASCII symbols', () => {
    expect(
      decodeText(
        'fooI=C3=B1t=C3=ABrn=C3=A2ti=C3=B4n=C3=A0liz=C3=A6ti=C3=B8n=E2=98=83=F0=9F=\r\n=92=A9bar',
      ),
    ).toBe('fooIñtërnâtiônàlizætiøn☃💩bar')
  })

  test('returns the bytes of a byte string', () => {
    expect(decode('caf=E9')).toEqual(latin1('caf\xe9'))
    expect(decodeBytes('caf=E9')).toBe('caf\xe9')
  })
})
