import { describe, expect, test } from 'vite-plus/test'
import { parseAddresses, type Address } from '@portable/mime-headers'

// Ported from nodemailer 10.1.7 test/addressparser/addressparser-test.ts, the current home of
// addressparser. addressparser(input) is parseAddresses(input) here, and { flatten: true } is the
// same option. Where this package reads malformed input differently, the test asserts our result
// and its comment says why; PARITY.md lists those cases.

const parse = (input: string) => parseAddresses(input)
const flat = (input: string) => parseAddresses(input, { flatten: true })
const first = (input: string) => parseAddresses(input, { flatten: true })[0]!

/** Pairs each input with its result, so a failing diff shows which input it came from. */
function parseCases(cases: readonly (readonly [string, Address[]])[]) {
  return [
    cases.map(([input]) => ({ input, result: parse(input) })),
    cases.map(([input, result]) => ({ input, result })),
  ] as const
}

const deepGroup = (depth: number) =>
  Array.from({ length: depth }, (_, i) => `g${i}:`).join(' ') + ' user@example.com;'

describe('addressparser', () => {
  test('a single address', () => {
    expect(parse('andris@tr.ee')).toEqual([{ address: 'andris@tr.ee', name: '' }])
  })

  test('several addresses', () => {
    expect(parse('andris@tr.ee, andris@example.com')).toEqual([
      { address: 'andris@tr.ee', name: '' },
      { address: 'andris@example.com', name: '' },
    ])
  })

  test('an unquoted name', () => {
    expect(parse('andris <andris@tr.ee>')).toEqual([{ name: 'andris', address: 'andris@tr.ee' }])
  })

  test('a quoted name with a comma', () => {
    expect(parse('"reinman, andris" <andris@tr.ee>')).toEqual([
      { name: 'reinman, andris', address: 'andris@tr.ee' },
    ])
  })

  test('a quoted name with a semicolon', () => {
    expect(parse('"reinman; andris" <andris@tr.ee>')).toEqual([
      { name: 'reinman; andris', address: 'andris@tr.ee' },
    ])
  })

  test('an unquoted name before a bare address', () => {
    expect(parse('andris andris@tr.ee')).toEqual([{ name: 'andris', address: 'andris@tr.ee' }])
  })

  test('a colon inside an address literal', () => {
    expect(parse('user@[IPv6:2001:db8::1]')).toEqual([
      { name: '', address: 'user@[IPv6:2001:db8::1]' },
    ])
  })

  test('an unclosed address literal does not swallow later recipients', () => {
    expect(parse('alice@example.com, bob[@example.com, carol@example.com')).toEqual([
      { name: '', address: 'alice@example.com' },
      { name: '', address: 'bob[@example.com' },
      { name: '', address: 'carol@example.com' },
    ])
    expect(parse('a@[b, c@d')).toEqual([
      { name: '', address: 'a@[b' },
      { name: '', address: 'c@d' },
    ])
  })

  test('a colon inside an address literal that follows a comment', () => {
    expect(parse('user@(c)[IPv6:2001:db8::1]')).toEqual([
      { name: 'c', address: 'user@[IPv6:2001:db8::1]' },
    ])
    expect(parse('user(c)@[IPv6:2001:db8::1]')).toEqual([
      { name: 'c', address: 'user@[IPv6:2001:db8::1]' },
    ])
  })

  test('a "[" does not hide the comment, quoted string or angle address after it', () => {
    for (const input of [
      '[ ( ] <victim@good.com> ) <evil@evil.com>',
      'x [(<victim@good.com>)] evil@evil.com',
      '["] <victim@good.com> ["] <evil@evil.com>',
      'Name[x<evil@evil.com>]<victim@good.com>',
      'Name @[ ( ] <victim@good.com> ) <evil@evil.com>',
      '@[ ( ] <victim@good.com> ) <evil@evil.com>',
      'Name a@[ ( ] <victim@good.com> ) <evil@evil.com>',
      'x@(c)[ ( ] <victim@good.com> ) <evil@evil.com>',
      'x@\n[ ( ] <victim@good.com> ) <evil@evil.com>',
      '"x"@[ ( ] <victim@good.com> ) <evil@evil.com>',
      'Name @[ " ] <victim@good.com> " <evil@evil.com>',
    ]) {
      const result = flat(input)
      expect(result).toHaveLength(1)
      expect(result[0]!.address).toBe('evil@evil.com')
    }
  })

  test('an "@" inside a quoted string or a comment does not open an address literal', () => {
    for (const input of ['"x@"[IPv6:::1] <a@b.com>', '(x@)[IPv6:::1] <a@b.com>'])
      expect(flat(input).map((entry) => entry.address)).toEqual(['a@b.com'])
  })

  test('a group delimiter in a display name does not open an address literal', () => {
    expect(parse('x[:<victim@good.com>;] <evil@evil.com>')).toEqual([
      { name: 'x[', group: [{ name: '', address: 'victim@good.com' }] },
      { name: ']', address: 'evil@evil.com' },
    ])
  })

  test('an empty group', () => {
    expect(parse('Undisclosed:;')).toEqual([{ name: 'Undisclosed', group: [] }])
  })

  test('a group', () => {
    expect(parse('Disclosed:andris@tr.ee, andris@example.com;')).toEqual([
      {
        name: 'Disclosed',
        group: [
          { address: 'andris@tr.ee', name: '' },
          { address: 'andris@example.com', name: '' },
        ],
      },
    ])
  })

  test('a semicolon as a separator', () => {
    expect(parse('andris@tr.ee; andris@example.com;')).toEqual([
      { address: 'andris@tr.ee', name: '' },
      { address: 'andris@example.com', name: '' },
    ])
  })

  test('mailboxes and groups mixed', () => {
    expect(
      parse(
        'Test User <test.user@mail.ee>, Disclosed:andris@tr.ee, andris@example.com;,,,, Undisclosed:;',
      ),
    ).toEqual([
      { address: 'test.user@mail.ee', name: 'Test User' },
      {
        name: 'Disclosed',
        group: [
          { address: 'andris@tr.ee', name: '' },
          { address: 'andris@example.com', name: '' },
        ],
      },
      { name: 'Undisclosed', group: [] },
    ])
  })

  test('flattens mailboxes and groups mixed', () => {
    expect(
      flat(
        'Test User <test.user@mail.ee>, Disclosed:andris@tr.ee, andris@example.com;,,,, Undisclosed:; bob@example.com BOB;',
      ),
    ).toEqual([
      { address: 'test.user@mail.ee', name: 'Test User' },
      { address: 'andris@tr.ee', name: '' },
      { address: 'andris@example.com', name: '' },
      { address: 'bob@example.com', name: 'BOB' },
    ])
  })

  test('a semicolon separator does not break group parsing', () => {
    expect(
      parse(
        'Test User <test.user@mail.ee>; Disclosed:andris@tr.ee, andris@example.com;,,,, Undisclosed:; bob@example.com;',
      ),
    ).toEqual([
      { address: 'test.user@mail.ee', name: 'Test User' },
      {
        name: 'Disclosed',
        group: [
          { address: 'andris@tr.ee', name: '' },
          { address: 'andris@example.com', name: '' },
        ],
      },
      { name: 'Undisclosed', group: [] },
      { address: 'bob@example.com', name: '' },
    ])
  })

  test('a name from a comment', () => {
    expect(parse('andris@tr.ee (andris)')).toEqual([{ name: 'andris', address: 'andris@tr.ee' }])
  })

  test('a comment is skipped when there is a name', () => {
    expect(parse('andris@tr.ee (reinman) andris')).toEqual([
      { name: 'andris', address: 'andris@tr.ee' },
    ])
  })

  test('a missing address', () => {
    expect(parse('andris')).toEqual([{ name: 'andris', address: '' }])
  })

  test('an apostrophe in a name', () => {
    expect(parse("O'Neill")).toEqual([{ name: "O'Neill", address: '' }])
  })

  test('an unescaped colon in a name', () => {
    expect(parse('FirstName Surname-WithADash :: Company <firstname@company.com>')).toEqual([
      {
        name: 'FirstName Surname-WithADash',
        group: [{ address: 'firstname@company.com', name: 'Company' }],
      },
    ])
  })

  test('an invalid address is not made valid', () => {
    expect(parse('name@address.com@address2.com')).toEqual([
      { name: '', address: 'name@address.com@address2.com' },
    ])
  })

  test('an unexpected "<"', () => {
    expect(parse('reinman > andris < test <andris@tr.ee>')).toEqual([
      { name: 'reinman > andris', address: 'andris@tr.ee' },
    ])
  })

  test('escapes', () => {
    expect(parse('"Firstname \\" \\\\\\, Lastname \\(Test\\)" test@example.com')).toEqual([
      { address: 'test@example.com', name: 'Firstname " \\, Lastname (Test)' },
    ])
  })

  test('a quoted local part', () => {
    expect(parse('"test@subdomain.com"@example.com')).toEqual([
      { address: '"test@subdomain.com"@example.com', name: '' },
    ])
  })

  test('an address is not carved out of a quoted local part', () => {
    expect(parse('"xclow3n@gmail.com x"@internal.domain')).toEqual([
      { address: '"xclow3n@gmail.com x"@internal.domain', name: '' },
    ])
    expect(parse('"user@attacker.com"@legitimate.com')).toEqual([
      { address: '"user@attacker.com"@legitimate.com', name: '' },
    ])
    expect(parse('"a@b@c"@example.com')).toEqual([{ address: '"a@b@c"@example.com', name: '' }])
    expect(parse('"evil@attacker.com more stuff"@legitimate.com')).toEqual([
      { address: '"evil@attacker.com more stuff"@legitimate.com', name: '' },
    ])
  })

  test('a quoted display name without "@" is not made an address', () => {
    for (const [input, name] of [
      ['"a,b" <(x)>', 'a,b'],
      ['"a;b" <(x)>', 'a;b'],
      ['"a<b>c" <(x)>', 'a<b>c'],
      ['"Display Name" <(no address here)>', 'Display Name'],
    ] as const)
      expect(parse(input)).toEqual([{ address: '', name }])
  })

  test('a quoted display name with "@" is not made an address either', () => {
    // addressparser moves it into the address as '"victim@good.com, attacker"@evil.com' when the
    // angle brackets are empty. A display name never names the mailbox here.
    expect(parse('"victim@good.com, attacker@evil.com" <(x)>')).toEqual([
      { address: '', name: 'victim@good.com, attacker@evil.com' },
    ])
  })

  test('a quoted local part in angle brackets', () => {
    expect(parse('Name <"user@domain.com"@example.com>')).toEqual([
      { name: 'Name', address: '"user@domain.com"@example.com' },
    ])
  })

  test('escaped quotes and backslashes in a quoted local part', () => {
    expect(first('"test\\"quote"@example.com').address).toBe('"test\\"quote"@example.com')
    expect(first('"test\\\\backslash"@example.com').address).toBe('"test\\\\backslash"@example.com')
    expect(first('"test\\"nested\\"quotes"@example.com').address).toBe(
      '"test\\"nested\\"quotes"@example.com',
    )
  })

  test('an unclosed quote, angle bracket or comment', () => {
    expect(parse('"unclosed@example.com')).toEqual([{ address: 'unclosed@example.com', name: '' }])
    expect(parse('Name <user@example.com')).toEqual([{ address: 'user@example.com', name: 'Name' }])
    expect(parse('user@example.com (comment')).toEqual([
      { address: 'user@example.com', name: 'comment' },
    ])
  })

  test('empty input, whitespace and empty angle brackets', () => {
    expect(parse('')).toEqual([])
    expect(parse('   ')).toEqual([])
    expect(parse('<>')).toEqual([{ address: '', name: '' }])
  })

  test('special characters in the local part', () => {
    for (const input of [
      'user+tag@example.com',
      'user.name@example.com',
      'user_name@example.com',
      'user-name@example.com',
    ])
      expect(parse(input)).toEqual([{ address: input, name: '' }])
  })

  test('whitespace and comments around an address', () => {
    expect(parse('  user@example.com  ')).toEqual([{ address: 'user@example.com', name: '' }])
    expect(parse('(comment)user@example.com')).toEqual([
      { address: 'user@example.com', name: 'comment' },
    ])
    expect(parse('user@example.com(comment)')).toEqual([
      { address: 'user@example.com', name: 'comment' },
    ])
    expect(parse('(comment1)user@example.com(comment2)')).toEqual([
      { address: 'user@example.com', name: 'comment1 comment2' },
    ])
    expect(parse('user@example.com()')).toEqual([{ address: 'user@example.com', name: '' }])
    expect(parse('user@example.com (comment with @#$%)')).toEqual([
      { address: 'user@example.com', name: 'comment with @#$%' },
    ])
  })

  test('consecutive separators', () => {
    expect(parse('a@example.com,,,b@example.com')).toEqual([
      { address: 'a@example.com', name: '' },
      { address: 'b@example.com', name: '' },
    ])
    expect(parse('a@b.com' + ','.repeat(100) + 'c@d.com')).toHaveLength(2)
  })

  test('a quoted name before a bare address', () => {
    expect(parse('"quoted" unquoted@example.com')).toEqual([
      { name: 'quoted', address: 'unquoted@example.com' },
    ])
  })

  test('long local parts and domains', () => {
    const local = 'a'.repeat(100) + '@example.com'
    const domain = 'user@' + 'a'.repeat(100) + '.com'
    expect(first(local).address).toBe(local)
    expect(first(domain).address).toBe(domain)
  })

  test('many "@"', () => {
    expect(parse('@'.repeat(100))).toEqual([{ address: '@'.repeat(100), name: '' }])
  })

  test('a double "@"', () => {
    expect(parse('user@@example.com')).toEqual([{ address: 'user@@example.com', name: '' }])
  })

  test('a name without an address', () => {
    expect(parse('John Doe')).toEqual([{ name: 'John Doe', address: '' }])
  })

  test('nested comments', () => {
    expect(parse('user@example.com (outer (nested) comment)')).toEqual([
      { address: 'user@example.com', name: 'outer (nested) comment' },
    ])
  })

  test('flattens groups', () => {
    expect(flat('Group1:a@b.com, Group2:c@d.com;;').map((entry) => entry.address)).toEqual([
      'a@b.com',
      'c@d.com',
    ])
  })
})

describe('nested groups are flattened into the outer one', () => {
  test('deeply nested', () => {
    expect(parse('Outer:Inner:deep@example.com;;')).toEqual([
      { name: 'Outer', group: [{ name: '', address: 'deep@example.com' }] },
    ])
  })

  test('several nested groups at the same level', () => {
    expect(parse('Main:Sub1:a@b.com;, Sub2:c@d.com;;')).toEqual([
      { name: 'Main', group: [{ name: '', address: 'a@b.com' }] },
      { name: 'Sub2', group: [{ name: '', address: 'c@d.com' }] },
    ])
  })

  test('nested and plain addresses in a group', () => {
    expect(parse('Group:x@y.com, Nested:a@b.com;, z@w.com;')).toEqual([
      {
        name: 'Group',
        group: [
          { name: '', address: 'x@y.com' },
          { name: '', address: 'a@b.com' },
        ],
      },
      { name: '', address: 'z@w.com' },
    ])
  })

  test('as before', () => {
    const [actual, expected] = parseCases([
      ['g1: g2: a@b.com;', [{ name: 'g1', group: [{ address: 'a@b.com', name: '' }] }]],
      [
        'g1: x@y.com, g2: a@b.com;',
        [
          {
            name: 'g1',
            group: [
              { address: 'x@y.com', name: '' },
              { address: 'a@b.com', name: '' },
            ],
          },
        ],
      ],
      [
        'g1: g2: a@b.com; c@d.com;',
        [
          { name: 'g1', group: [{ address: 'a@b.com', name: '' }] },
          { address: 'c@d.com', name: '' },
        ],
      ],
      [
        'Outer: Inner: deep@example.com; ;',
        [{ name: 'Outer', group: [{ address: 'deep@example.com', name: '' }] }],
      ],
    ])
    expect(actual).toEqual(expected)
  })

  test('at any depth', () => {
    for (const depth of [5, 10, 11, 100, 3000, 10000])
      expect(parse(deepGroup(depth))).toEqual([
        { name: 'g0', group: [{ address: 'user@example.com', name: '' }] },
      ])
    expect(parse(deepGroup(100) + ', ' + deepGroup(100))).toHaveLength(2)
    const mixed = parse('normal@example.com, ' + deepGroup(200) + ', another@test.com')
    expect(mixed.map((entry) => entry.name)).toEqual(['', 'g0', ''])
    expect(flat(deepGroup(100))).toEqual([{ address: 'user@example.com', name: '' }])
  })

  test('a large list behind many group openers', () => {
    for (const openers of [10, 1000, 100000])
      expect(flat('g: '.repeat(openers) + 'a@b.com, '.repeat(80000))).toHaveLength(80000)
  })
})

describe('international addresses', () => {
  test('Unicode, emoji and CJK display names', () => {
    expect(parse('Jüri Õunapuu <juri@example.com>')).toEqual([
      { name: 'Jüri Õunapuu', address: 'juri@example.com' },
    ])
    expect(parse('🤖 Robot <robot@example.com>')).toEqual([
      { name: '🤖 Robot', address: 'robot@example.com' },
    ])
    expect(parse('田中太郎 <tanaka@example.jp>')).toEqual([
      { name: '田中太郎', address: 'tanaka@example.jp' },
    ])
  })

  test('a Unicode domain', () => {
    expect(parse('user@münchen.de')).toEqual([{ name: '', address: 'user@münchen.de' }])
  })
})

describe('malformed input', () => {
  test('doubled angle brackets', () => {
    expect(parse('Name <<user@example.com>>')).toEqual([
      { address: 'user@example.com', name: 'Name>' },
    ])
  })

  test('a missing domain or local part', () => {
    expect(parse('user@')).toEqual([{ address: 'user@', name: '' }])
    expect(parse('@example.com')).toEqual([{ address: '@example.com', name: '' }])
  })

  test('mixed case in the domain', () => {
    expect(first('user@Example.COM').address).toBe('user@Example.COM')
  })

  test('tabs and line breaks between two addresses', () => {
    for (const input of [
      'user@example.com\t\tother@example.com',
      'user@example.com\nother@example.com',
      'user@example.com\r\nother@example.com',
    ])
      expect(parse(input)).toEqual([{ address: 'user@example.com', name: 'other@example.com' }])
  })
})

describe('group edge cases', () => {
  test('a group of whitespace', () => {
    expect(parse('EmptyGroup:   ;')).toEqual([{ name: 'EmptyGroup', group: [] }])
  })

  test('a group of names without addresses', () => {
    expect(parse('Group:not-an-email, another-invalid;')).toEqual([
      {
        name: 'Group',
        group: [
          { name: 'not-an-email', address: '' },
          { name: 'another-invalid', address: '' },
        ],
      },
    ])
  })

  test('group names with special characters or quotes', () => {
    expect(parse('Group-Name_123:user@example.com;')).toEqual([
      { name: 'Group-Name_123', group: [{ name: '', address: 'user@example.com' }] },
    ])
    expect(parse('"My Group":user@example.com;')).toEqual([
      { name: 'My Group', group: [{ name: '', address: 'user@example.com' }] },
    ])
  })
})

describe('domains', () => {
  test('subdomains', () => {
    for (const input of [
      'user@mail.server.company.example.com',
      'user@123.456.example.com',
      'user@mail-server.example.com',
    ])
      expect(first(input).address).toBe(input)
  })

  test('IP address literals', () => {
    expect(first('user@[192.168.1.1]').address).toBe('user@[192.168.1.1]')
    expect(first('user@[IPv6:2001:db8::1]').address).toBe('user@[IPv6:2001:db8::1]')
  })
})

describe('long lists', () => {
  test('1000 addresses', () => {
    const input = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`).join(', ')
    expect(parse(input)).toHaveLength(1000)
  })

  test('200000 addresses', () => {
    expect(parse('a@b.com,'.repeat(200000))).toHaveLength(200000)
  })

  test('80000 names split by commas', () => {
    const result = parse('a, b <c@d.com>,'.repeat(80000))
    expect(result).toHaveLength(80000)
    expect(result[0]).toEqual({ name: 'a, b', address: 'c@d.com' })
  })
})

describe('unquoted display names with commas', () => {
  test('are joined to the entry with the angle address', () => {
    const [actual, expected] = parseCases([
      ['Joe Foo, PhD <joe@example.com>', [{ name: 'Joe Foo, PhD', address: 'joe@example.com' }]],
      ['A, B, C <d@e.com>', [{ name: 'A, B, C', address: 'd@e.com' }]],
      [
        'Joe, PhD <j@e.com>, Jane, MD <jane@e.com>',
        [
          { name: 'Joe, PhD', address: 'j@e.com' },
          { name: 'Jane, MD', address: 'jane@e.com' },
        ],
      ],
      [
        'a@b.com, Foo, Bar <c@d.com>, e@f.com',
        [
          { name: '', address: 'a@b.com' },
          { name: 'Foo, Bar', address: 'c@d.com' },
          { name: '', address: 'e@f.com' },
        ],
      ],
      ['"Joe, PhD" <joe@example.com>', [{ name: 'Joe, PhD', address: 'joe@example.com' }]],
      ['a, b, c <x@y.com>', [{ address: 'x@y.com', name: 'a, b, c' }]],
      [
        'A <a@b.com>, B, C <c@d.com>',
        [
          { address: 'a@b.com', name: 'A' },
          { address: 'c@d.com', name: 'B, C' },
        ],
      ],
      [
        'a@b.com, c@d.com',
        [
          { address: 'a@b.com', name: '' },
          { address: 'c@d.com', name: '' },
        ],
      ],
    ])
    expect(actual).toEqual(expected)
  })

  test('are not joined to a bare address', () => {
    expect(parse('SomeName, joe@example.com')).toEqual([
      { name: 'SomeName', address: '' },
      { name: '', address: 'joe@example.com' },
    ])
  })

  test('are not joined to a group', () => {
    expect(parse('Title, Group: a@b.com;')).toEqual([
      { name: 'Title', address: '' },
      { name: 'Group', group: [{ name: '', address: 'a@b.com' }] },
    ])
  })

  test('are not joined across a group boundary', () => {
    expect(parse('g: a@b.com, c@d.com;')).toEqual([
      {
        name: 'g',
        group: [
          { address: 'a@b.com', name: '' },
          { address: 'c@d.com', name: '' },
        ],
      },
    ])
  })

  test('are joined inside a group', () => {
    expect(parse('G: Joe Foo, PhD <joe@example.com>;')).toEqual([
      { name: 'G', group: [{ address: 'joe@example.com', name: 'Joe Foo, PhD' }] },
    ])
  })
})

describe('an angle address holding unquoted whitespace', () => {
  test('the first address wins and the rest is the name', () => {
    const [actual, expected] = parseCases([
      [
        'lo@zillowgroup.com <lo@zillowgroup.com lo@zillowgroup.com>',
        [{ address: 'lo@zillowgroup.com', name: 'lo@zillowgroup.com lo@zillowgroup.com' }],
      ],
      [
        'lo@ <zillowgroup.com lo@zillowgroup.com>',
        [{ address: 'lo@zillowgroup.com', name: 'lo@ zillowgroup.com' }],
      ],
      [
        'lo@ <zillowgroup.com lo@zillowgroup.com>, other@example.com',
        [
          { address: 'lo@zillowgroup.com', name: 'lo@ zillowgroup.com' },
          { address: 'other@example.com', name: '' },
        ],
      ],
      [
        '<first@example.com second@example.net>',
        [{ address: 'first@example.com', name: 'second@example.net' }],
      ],
      ['<foo bar@example.com>', [{ address: 'bar@example.com', name: 'foo' }]],
      ['<no address here>', [{ address: '', name: 'no address here' }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('reads the same as without angle brackets', () => {
    for (const value of [
      'a@b@c.com junk',
      'notanaddress a@b.com',
      'lo@zillowgroup.com lo@zillowgroup.com',
    ])
      expect(first(`<${value}>`).address).toBe(first(value).address)
  })

  test('a quoted local part keeps its domain', () => {
    // addressparser returns the whole value as the address. The quoted string is one token here,
    // so the address is the quoted local part at good.com, and "junk" is the name.
    expect(parse('<junk "a@evil.com b"@good.com>')).toEqual([
      { address: '"a@evil.com b"@good.com', name: 'junk' },
    ])
    expect(parse('<junk "a b@evil.com c"@good.com>')).toEqual([
      { address: '"a b@evil.com c"@good.com', name: 'junk' },
    ])
    expect(parse('<"a b@evil.com c" x>')).toEqual([{ address: '', name: 'a b@evil.com c x' }])
  })

  test('well-formed quoted local parts', () => {
    const [actual, expected] = parseCases([
      [
        'Name <"a b@evil.com c"@good.com>',
        [{ address: '"a b@evil.com c"@good.com', name: 'Name' }],
      ],
      ['Nick <"user name"@example.com>', [{ address: '"user name"@example.com', name: 'Nick' }]],
      [
        '<"user name"@example.com junk here>',
        [{ address: '"user name"@example.com', name: 'junk here' }],
      ],
      ['<"user name"@example.com>', [{ address: '"user name"@example.com', name: '' }]],
    ])
    expect(actual).toEqual(expected)
  })
})

describe('free text', () => {
  test('an address is read out of it', () => {
    expect(parse('junk [x] a@b.com more')).toEqual([{ address: 'a@b.com', name: 'junk [x] more' }])
    expect(parse('   a@b.com   ')).toEqual([{ address: 'a@b.com', name: '' }])
    expect(parse('!a@b!')).toEqual([{ address: '!a@b!', name: '' }])
  })
})

describe('RFC 5322 comments', () => {
  test('a comment ends the domain', () => {
    expect(parse('user@good-corp.com(x)evil.com')).toEqual([
      { address: 'user@good-corp.com', name: 'evil.com' },
    ])
    for (const input of [
      'user@good-corp.com()evil.com',
      'user@good-corp.com(a)(b)evil.com',
      'user@good-corp.com(a)(b)(c)evil.com',
      'user@good-corp.com(a(b)evil.com',
    ])
      expect(first(input).address).toBe('user@good-corp.com')
  })

  test('a comment splitting a list keeps both recipients', () => {
    expect(
      parse('a@b.com(c)d.com, e@f.com').map((entry) => 'address' in entry && entry.address),
    ).toEqual(['a@b.com', 'e@f.com'])
  })

  test('a comment beside the "@" belongs to the address', () => {
    expect(first('user@(x)good-corp.com').address).toBe('user@good-corp.com')
    expect(first('user(x)@good-corp.com').address).toBe('user@good-corp.com')
    expect(first('(lead)user@good-corp.com').address).toBe('user@good-corp.com')
  })

  test('a quoted string and an angle address joined to text', () => {
    expect(first('"foo"bar@example.com').address).toBe('foobar@example.com')
    expect(first('<a@b.com>x').address).toBe('a@b.com')
  })

  test('a comment is the name when there is no other', () => {
    expect(parse('Foo (Bar) <foo@example.com>')).toEqual([
      { address: 'foo@example.com', name: 'Foo' },
    ])
    expect(parse('(Bar) <foo@example.com>')).toEqual([{ address: 'foo@example.com', name: 'Bar' }])
  })
})

describe('comments inside an angle address', () => {
  test('do not become part of the address', () => {
    expect(parse('Legit User <user@good-corp.com(x)evil.com>')).toEqual([
      { address: 'user@good-corp.com', name: 'Legit User evil.com' },
    ])
    expect(first('<user@good-corp.com(x)evil.com>').address).toBe(
      first('user@good-corp.com(x)evil.com').address,
    )
    for (const input of [
      'A <user@good-corp.com()evil.com>',
      'A <user@good-corp.com(a)(b)evil.com>',
      'A <user@good-corp.com((a) b)evil.com>',
      'A <user@good-corp.com(\\)x)evil.com>',
      'A <user@good-corp.com(x evil.com>',
      'A <user@good-corp.com(x)evil.com',
      'G: A <user@good-corp.com(x)evil.com>;',
    ]) {
      const result = flat(input)
      expect(result).toHaveLength(1)
      expect(result[0]!.address).toBe('user@good-corp.com')
    }
  })

  test('a quoted local part keeps its quotes only when it needs them', () => {
    // addressparser keeps '"user"' as written inside angle brackets and drops the quotes outside.
    // Both spellings name the same mailbox, so this package drops them in both places.
    expect(first('A <"user"@good-corp.com(x)evil.com>').address).toBe('user@good-corp.com')
    expect(first('A <"a b"@good-corp.com(x)evil.com>').address).toBe('"a b"@good-corp.com')
  })

  test('the text around a comment stays in the name', () => {
    expect(parse('Name <user@a.com (x) evil.com>')).toEqual([
      { address: 'user@a.com', name: 'Name evil.com' },
    ])
    expect(parse('Name <user@a.com> (x)')).toEqual([{ address: 'user@a.com', name: 'Name' }])
  })

  test('a comment beside the "@" or at either end', () => {
    for (const input of [
      'Name <user(c)@example.com>',
      'Name <user@(c)example.com>',
      'Name <(c)user@example.com>',
      'Name <user@example.com(c)>',
      'Name <user@example.com (c)>',
      'Name <(a@evil.com)user@example.com>',
    ])
      expect(parse(input)).toEqual([{ address: 'user@example.com', name: 'Name' }])
  })

  test('brackets holding only a comment read as empty ones', () => {
    for (const name of [
      '"a@evil.com, b@good.com"',
      '"a@evil.com; b@evil.com"',
      '"a@b@evil.com"',
      '(a@evil.com, b@evil.com)',
      'Name',
    ])
      expect(first(`${name} <(x)>`).address).toBe(first(`${name} <>`).address)
  })

  test('a comment is the name when there is no other', () => {
    expect(parse('<user@example.com(John Doe)>')).toEqual([
      { address: 'user@example.com', name: 'John Doe' },
    ])
    expect(parse('<(only a comment)>')).toEqual([{ address: '', name: 'only a comment' }])
  })

  test('parentheses inside a quoted local part or a domain literal stay', () => {
    expect(first('Name <"a(b)"@example.com>').address).toBe('"a(b)"@example.com')
    expect(first('Name <"a\\"(b)"@example.com(c)>').address).toBe('"a\\"(b)"@example.com')
    expect(first('Name <user@[a(b)c]>').address).toBe('user@[a(b)c]')
    expect(first('Name <user@[1.2.3.4](x)>').address).toBe('user@[1.2.3.4]')
  })
})

describe('comments after a quoted local part', () => {
  test('end the domain', () => {
    expect(parse('"user"@good-corp.com(x)evil.com')).toEqual([
      { address: 'user@good-corp.com', name: 'evil.com' },
    ])
    expect(parse('"a"@b.com(c)d.com(e)f.com')).toEqual([
      { address: 'a@b.com', name: 'd.com f.com' },
    ])
  })

  test('read the same as without quotes', () => {
    for (const tail of [
      '(x)evil.com',
      '()evil.com',
      '(x)(y)evil.com',
      '(x)a(y)b',
      '(x)evil.com(y)',
      '(x)evil@evil.com',
      ' junk here',
    ])
      expect(first(`"user"@good-corp.com${tail}`).address).toBe(
        first(`user@good-corp.com${tail}`).address,
      )
  })

  test('text after a quoted local part becomes the name', () => {
    expect(parse('"user@evil.com"@good-corp.com junk')).toEqual([
      { address: '"user@evil.com"@good-corp.com', name: 'junk' },
    ])
    expect(parse('"user name"@good-corp.com(x)evil.com')).toEqual([
      { address: '"user name"@good-corp.com', name: 'evil.com' },
    ])
  })

  test('an empty local part keeps its quotes', () => {
    expect(parse('""@good-corp.com(x)evil.com')).toEqual([
      { address: '""@good-corp.com', name: 'evil.com' },
    ])
    expect(parse('""@good-corp.com')).toEqual([{ address: '""@good-corp.com', name: '' }])
    expect(parse('""""@good-corp.com')).toEqual([{ address: '""@good-corp.com', name: '' }])
  })

  test('the first address wins over text collected before an empty quoted string', () => {
    // addressparser joins the first two into 'a@b.com@good-corp.com'. Each is a separate word here.
    expect(parse('a@b.com ""@good-corp.com evil@evil.com')).toEqual([
      { address: 'a@b.com', name: '""@good-corp.com evil@evil.com'.replace('""', '') },
    ])
    expect(first('a""@example.com').address).toBe('a@example.com')
    expect(parse('""x@[1.2.3.4] junk')).toEqual([{ address: 'x@[1.2.3.4]', name: 'junk' }])
  })

  test('well-formed quoted local parts lose only the quotes they do not need', () => {
    for (const [input, expected] of [
      ['"user"@example.com', 'user@example.com'],
      ['"user name"@example.com', '"user name"@example.com'],
      ['"user@evil.com"@good.com', '"user@evil.com"@good.com'],
      ['"a@b@c"@example.com', '"a@b@c"@example.com'],
      [
        '"evil@attacker.com more stuff"@legitimate.com',
        '"evil@attacker.com more stuff"@legitimate.com',
      ],
      ['"test\\"quote"@example.com', '"test\\"quote"@example.com'],
    ] as const)
      expect(parse(input)).toEqual([{ address: expected, name: '' }])
  })

  test('a quoted display name beside an address', () => {
    expect(parse('"John Doe" user@example.com')).toEqual([
      { address: 'user@example.com', name: 'John Doe' },
    ])
    expect(parse('"John Doe"')).toEqual([{ address: '', name: 'John Doe' }])
    expect(parse('"John Doe" nothing')).toEqual([{ address: '', name: 'John Doe nothing' }])
  })

  test('no address holds unquoted whitespace', () => {
    const wellFormed = /^"(?:[^"\\]|\\[\s\S])*"@\S*$/
    const malformed: string[] = []
    for (const lead of ['', '(c)', 'Name ', '"Name" '])
      for (const local of [
        'user',
        '"user"',
        '"user name"',
        '"a@b.com"',
        '"a@b.com c"',
        '"a\\"b"',
        '""',
      ])
        for (const tail of [
          '',
          '(x)evil.com',
          '(x)(y)evil.com',
          '(x)a(y)b',
          ' junk here',
          '(x)evil@evil.com',
          '(x)"evil"@evil.com',
          '(x)',
        ]) {
          const input = `${lead}${local}@good-corp.com${tail}`
          for (const { address } of flat(input))
            if (/\s/.test(address) && !wellFormed.test(address)) malformed.push(address)
        }
    expect(malformed).toEqual([])
  })

  test('an escaped parenthesis stays inside a comment', () => {
    expect(parse('(x\\) <b@evil.example>) Victim <a@victim.example>')).toEqual([
      { name: 'Victim', address: 'a@victim.example' },
    ])
    expect(parse('a@b.c (x\\) y)')).toEqual([{ address: 'a@b.c', name: 'x) y' }])
  })
})

describe('closers inside an angle address or a group', () => {
  test('">" inside a quoted string, a comment or a domain literal does not close the angle address', () => {
    const [actual, expected] = parseCases([
      ['<"a@evil.com>"@good.com>', [{ address: '"a@evil.com>"@good.com', name: '' }]],
      ['<"a\\>"@good.com>', [{ address: '"a>"@good.com', name: '' }]],
      ['<a@[>]>', [{ address: 'a@[>]', name: '' }]],
      ['<a@[;"]>', [{ address: 'a@[;"]', name: '' }]],
      ['<a@[x,y>]>', [{ address: 'a@[x,y>]', name: '' }]],
      ['Name <"x>"@evil.com>', [{ address: '"x>"@evil.com', name: 'Name' }]],
      ['<a@good.com(x>y)>', [{ address: 'a@good.com', name: 'x>y' }]],
      ['<a@b((x)>)>', [{ address: 'a@b', name: '(x)>' }]],
      ['<a@b(\\)>)>', [{ address: 'a@b', name: ')>' }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('";" inside a quoted string or a comment does not end a group', () => {
    const [actual, expected] = parseCases([
      [
        'G: (a; <evil@evil.com>) <v@victim.com>;',
        [{ name: 'G', group: [{ address: 'v@victim.com', name: 'a; <evil@evil.com>' }] }],
      ],
      [
        'G: "a;" "<evil@evil.com>" <v@victim.com>;',
        [{ name: 'G', group: [{ address: 'v@victim.com', name: 'a; <evil@evil.com>' }] }],
      ],
      ['G: "a;b" <x@y>;', [{ name: 'G', group: [{ address: 'x@y', name: 'a;b' }] }]],
      ['G: "a\\";" <x@y>;', [{ name: 'G', group: [{ address: 'x@y', name: 'a";' }] }]],
      ['G: <"a;"@good.com>;', [{ name: 'G', group: [{ address: '"a;"@good.com', name: '' }] }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('an escaped backslash ends the quoted string it is in', () => {
    const [actual, expected] = parseCases([
      [
        '<"a\\\\"@b.com>, c@d.com',
        [
          { address: '"a\\\\"@b.com', name: '' },
          { address: 'c@d.com', name: '' },
        ],
      ],
      [
        'G: "a\\\\" <x@y>; c@d.com',
        [
          { name: 'G', group: [{ address: 'x@y', name: 'a\\' }] },
          { address: 'c@d.com', name: '' },
        ],
      ],
    ])
    expect(actual).toEqual(expected)
  })

  test('an unclosed quoted string or comment runs to the end', () => {
    for (const input of [
      '<"a@b.com>, c@d.com',
      '<a@b.com(x>, c@d.com',
      'G: "a;, c@d.com',
      'G: (a;, c@d.com',
    ])
      expect(parse(input)).toHaveLength(1)
  })

  test('the closer outside them still ends the angle address and the group', () => {
    const [actual, expected] = parseCases([
      [
        '<a@b.com>, <c@d.com>',
        [
          { address: 'a@b.com', name: '' },
          { address: 'c@d.com', name: '' },
        ],
      ],
      [
        '"x" <a@b.com>, "y" <c@d.com>',
        [
          { address: 'a@b.com', name: 'x' },
          { address: 'c@d.com', name: 'y' },
        ],
      ],
      [
        '<"x"@b.com>, <(y)c@d.com>',
        [
          { address: 'x@b.com', name: '' },
          { address: 'c@d.com', name: 'y' },
        ],
      ],
      [
        'G: "x" <a@b.com>; c@d.com',
        [
          { name: 'G', group: [{ address: 'a@b.com', name: 'x' }] },
          { address: 'c@d.com', name: '' },
        ],
      ],
      ['<a@[IPv6:2001:db8::1]>', [{ address: 'a@[IPv6:2001:db8::1]', name: '' }]],
      [
        'G: a@[IPv6:2001:db8::1];',
        [{ name: 'G', group: [{ address: 'a@[IPv6:2001:db8::1]', name: '' }] }],
      ],
    ])
    expect(actual).toEqual(expected)
  })

  test('";" ends a group even inside a domain literal outside angle brackets', () => {
    expect(parse('G: a@[x;y];')).toEqual([
      { name: 'G', group: [{ address: 'a@[x', name: '' }] },
      { address: '', name: 'y]' },
    ])
  })

  test('an unclosed domain literal inside angle brackets runs to the end', () => {
    expect(parse('<a@[x, c@d.com>')).toEqual([{ address: 'a@[x, c@d.com>', name: '' }])
  })
})

describe('nested comments', () => {
  test('a comment ends only at the ")" that closes the outermost one', () => {
    const [actual, expected] = parseCases([
      [
        'Victim (x(y) <evil@evil.com>) <v@victim.com>',
        [{ address: 'v@victim.com', name: 'Victim' }],
      ],
      [
        '(a(b)c; <evil@evil.com>) <v@victim.com>',
        [{ address: 'v@victim.com', name: 'a(b)c; <evil@evil.com>' }],
      ],
      [
        'user@example.com (outer (nested) comment)',
        [{ address: 'user@example.com', name: 'outer (nested) comment' }],
      ],
      ['a@b.com (x((y)) z)', [{ address: 'a@b.com', name: 'x((y)) z' }]],
      ['G: (a(;)b) <x@y>;', [{ name: 'G', group: [{ address: 'x@y', name: 'a(;)b' }] }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('an escaped "(" does not open a nested comment', () => {
    expect(parse('a@b.com (x\\( y), c@d.com')).toEqual([
      { address: 'a@b.com', name: 'x( y' },
      { address: 'c@d.com', name: '' },
    ])
  })

  test('an unclosed nested comment runs to the end', () => {
    expect(parse('a@b.com (x(y), c@d.com')).toEqual([{ address: 'a@b.com', name: 'x(y), c@d.com' }])
  })
})

describe('an unexpected "<" inside an angle address', () => {
  test('inside a quoted string, a comment or a domain literal is kept', () => {
    const [actual, expected] = parseCases([
      ['<"a<b"@victim.com>', [{ address: '"a<b"@victim.com', name: '' }]],
      ['<"<"@good.com>', [{ address: '"<"@good.com', name: '' }]],
      ['<(x<y)a@victim.com>', [{ address: 'a@victim.com', name: 'x<y' }]],
      ['<(<)a@b.com>', [{ address: 'a@b.com', name: '<' }]],
      ['<a@[<]>', [{ address: 'a@[<]', name: '' }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('drops what comes before it', () => {
    const [actual, expected] = parseCases([
      ['<junk <a@b.com>', [{ address: 'a@b.com', name: '' }]],
      ['<a<b<c@d.com>', [{ address: 'c@d.com', name: '' }]],
      ['<(x) junk <a@b.com>', [{ address: 'a@b.com', name: '' }]],
      ['Name <<user@example.com>>', [{ address: 'user@example.com', name: 'Name>' }]],
      [
        'reinman > andris < test <andris@tr.ee>',
        [{ address: 'andris@tr.ee', name: 'reinman > andris' }],
      ],
      ['<victim@good.com <evil@evil.com>', [{ address: 'evil@evil.com', name: '' }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('many of them', () => {
    expect(parse('<' + '"b"(c)a<'.repeat(100000) + 'd@e.com>')).toEqual([
      { address: 'd@e.com', name: '' },
    ])
  })
})

describe('a domain literal holding "@"', () => {
  test('is the whole domain', () => {
    const [actual, expected] = parseCases([
      ['a@[x@evil.com]', [{ address: 'a@[x@evil.com]', name: '' }]],
      ['<a@[x@evil.com]>', [{ address: 'a@[x@evil.com]', name: '' }]],
      ['Name <a@[x@evil.com]>', [{ address: 'a@[x@evil.com]', name: 'Name' }]],
      ['a@[x@evil.com] (c)', [{ address: 'a@[x@evil.com]', name: 'c' }]],
      ['"a b"@[x@evil.com]', [{ address: '"a b"@[x@evil.com]', name: '' }]],
      ['a@[IPv6:2001:db8::1]', [{ address: 'a@[IPv6:2001:db8::1]', name: '' }]],
      ['"a@evil.com"@[127.0.0.1]', [{ address: '"a@evil.com"@[127.0.0.1]', name: '' }]],
    ])
    expect(actual).toEqual(expected)
  })
})

describe('whitespace and comments beside the "@"', () => {
  test('are read as nothing', () => {
    const [actual, expected] = parseCases([
      ['<a(x)(y)@b.com>', [{ address: 'a@b.com', name: 'x y' }]],
      ['<a (b) @c.com>', [{ address: 'a@c.com', name: 'b' }]],
      ['<a@ (b) c.com>', [{ address: 'a@c.com', name: 'b' }]],
      ['<"a" @good.com>', [{ address: 'a@good.com', name: '' }]],
      ['<"a@evil.com>"@ good.com>', [{ address: '"a@evil.com>"@good.com', name: '' }]],
      ['<"a\\"b@evil.com" @ good.com>', [{ address: '"a\\"b@evil.com"@good.com', name: '' }]],
      ['"a" @good.com', [{ address: 'a@good.com', name: '' }]],
      ['"a b" @c.com', [{ address: '"a b"@c.com', name: '' }]],
      ['"a@b" @c.com', [{ address: '"a@b"@c.com', name: '' }]],
      ['user @ good.com', [{ address: 'user@good.com', name: '' }]],
      ['Name user @ good.com', [{ address: 'user@good.com', name: 'Name' }]],
      ['"user" @good.com(x)evil.com', [{ address: 'user@good.com', name: 'evil.com' }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('a comment between two atoms still parts them', () => {
    expect(parse('<a(x)(y)b@c.com>')).toEqual([{ address: 'b@c.com', name: 'a' }])
    expect(parse('user@good.com(x)evil.com')).toEqual([
      { address: 'user@good.com', name: 'evil.com' },
    ])
  })

  test('with several "@" the first address wins', () => {
    expect(parse('<x@evil.com @good.com>')).toEqual([{ address: 'x@evil.com', name: '@good.com' }])
    expect(parse('<"a" @b.com @c.com>')).toEqual([{ address: 'a@b.com', name: '@c.com' }])
  })

  test('whitespace inside a quoted string stays', () => {
    expect(parse('<"a @ b">')).toEqual([{ address: '', name: 'a @ b' }])
  })
})

describe('obsolete route in an angle address', () => {
  test('is dropped', () => {
    const [actual, expected] = parseCases([
      ['<@evil.com,@x.com:user@good.com>', [{ address: 'user@good.com', name: '' }]],
      ['Name <@relay.example:user@good.com>', [{ address: 'user@good.com', name: 'Name' }]],
      ['<@a.com:"x:y"@b.com>', [{ address: '"x:y"@b.com', name: '' }]],
      ['<@a.com, @b.com: user@c.com>', [{ address: 'user@c.com', name: '' }]],
      ['<@[IPv6:2001:db8::1]:user@good.com>', [{ address: 'user@good.com', name: '' }]],
      ['<@a.com(x:y):user@good.com>', [{ address: 'user@good.com', name: 'x:y' }]],
    ])
    expect(actual).toEqual(expected)
  })

  test('is kept when no mailbox follows it', () => {
    expect(parse('<@a.com:user>')).toEqual([{ address: '@a.com:user', name: '' }])
    expect(parse('<"@a.com:x"@b.com>')).toEqual([{ address: '"@a.com:x"@b.com', name: '' }])
  })
})

describe('a mailbox is never read out of a comment', () => {
  test('a comment alone is only a name', () => {
    for (const input of [
      '(a@evil.com)',
      '<> (a@evil.com)',
      '"" (a@evil.com)',
      '<(a@evil.com)>',
      '(x) (a@evil.com)',
    ]) {
      const result = parse(input)
      expect(result).toHaveLength(1)
      expect(first(input).address).toBe('')
      expect(first(input).name).toContain('a@evil.com')
    }
    expect(parse('G: (a@evil.com);')).toEqual([
      { name: 'G', group: [{ address: '', name: 'a@evil.com' }] },
    ])
  })

  test('a comment still names a mailbox', () => {
    const [actual, expected] = parseCases([
      ['andris@tr.ee (andris)', [{ address: 'andris@tr.ee', name: 'andris' }]],
      ['andris@tr.ee (reinman) andris', [{ address: 'andris@tr.ee', name: 'andris' }]],
      ['<a@b.com> (Name)', [{ address: 'a@b.com', name: 'Name' }]],
      ['(Name) <a@b.com>', [{ address: 'a@b.com', name: 'Name' }]],
      ['(Name) a@b.com', [{ address: 'a@b.com', name: 'Name' }]],
      ['(Undisclosed recipients)', [{ address: '', name: 'Undisclosed recipients' }]],
    ])
    expect(actual).toEqual(expected)
  })
})

describe('several addresses in the display text', () => {
  test('the first one wins', () => {
    const [actual, expected] = parseCases([
      ['user@good.com (x) evil@evil.com', [{ address: 'user@good.com', name: 'evil@evil.com' }]],
      [
        'user@good.com (x) evil @ evil.com',
        [{ address: 'user@good.com', name: 'evil @ evil.com' }],
      ],
      ['a@b.com c@d.com', [{ address: 'a@b.com', name: 'c@d.com' }]],
      ['"user"@good.com (x) evil@evil.com', [{ address: 'user@good.com', name: 'evil@evil.com' }]],
      [
        '"user@evil.com"@good.com (x) a@b.com',
        [{ address: '"user@evil.com"@good.com', name: 'a@b.com' }],
      ],
      ['""@good.com (x) evil@evil.com', [{ address: '""@good.com', name: 'evil@evil.com' }]],
      ['Name (x) a@b.com', [{ address: 'a@b.com', name: 'Name' }]],
    ])
    expect(actual).toEqual(expected)
  })
})

describe('groups in one pass', () => {
  test('an angle address left open in a group ends at the group\'s ";"', () => {
    expect(parse('G: <a;b@c.com>; d@e.com')).toEqual([
      { name: 'G', group: [{ address: '', name: 'a' }] },
      { address: 'b@c.com>', name: '' },
      { address: 'd@e.com', name: '' },
    ])
  })

  test('";" inside a domain literal of an angle address does not end a group', () => {
    expect(parse('G: <a@[x;y]>; d@e.com')).toEqual([
      { name: 'G', group: [{ address: 'a@[x;y]', name: '' }] },
      { address: 'd@e.com', name: '' },
    ])
  })

  test('an angle address followed by a group reads as the group alone', () => {
    expect(parse('Name <a@b.com>: x@y.com;')).toEqual([
      { name: 'Name', group: [{ address: 'x@y.com', name: '' }] },
    ])
  })
})
