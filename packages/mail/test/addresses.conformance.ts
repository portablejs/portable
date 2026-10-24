import * as Mail from '@portable/mail'
import { describe, expect, test } from 'vite-plus/test'
import { compose, head } from './utils.js'

const field = (raw: string, name: string) =>
  new RegExp(`^${name}: (.*(?:\\r\\n[ \\t].*)*)$`, 'm').exec(head(raw))?.[1]?.replace(/\r\n /g, ' ')

const to = async (value: Mail.Addresses) => field(await compose({ to: value }), 'To')

describe('address headers', () => {
  test('strings, mailboxes and lists of both give the same header', async () => {
    const expected = 'Mari <mari@example.com>, b@example.com'
    expect(await to('Mari <mari@example.com>, b@example.com')).toBe(expected)
    expect(
      await to([{ name: 'Mari', address: 'mari@example.com' }, { address: 'b@example.com' }]),
    ).toBe(expected)
    expect(await to(['Mari <mari@example.com>', 'b@example.com'])).toBe(expected)
  })

  test('a mailbox is not changed by encode', async () => {
    const mailbox = { name: 'Mari', address: 'MARI@EXAMPLE.COM' }
    await to(mailbox)
    expect(mailbox).toEqual({ name: 'Mari', address: 'MARI@EXAMPLE.COM' })
  })

  test('the domain is lowercased and the local part is kept', async () => {
    expect(await to('Mari@EXAMPLE.COM')).toBe('Mari@example.com')
  })

  test('a name with specials is quoted', async () => {
    expect(await to({ name: 'Tamm, Mari', address: 'mari@example.com' })).toBe(
      '"Tamm, Mari" <mari@example.com>',
    )
    expect(await to('"Tamm, Mari" <mari@example.com>')).toBe('"Tamm, Mari" <mari@example.com>')
  })

  test('each name gets its own Q or B encoding', async () => {
    expect(
      await to([
        { name: 'Jõgeva Ants', address: 'a@example.com' },
        { name: 'ÕÕÕ', address: 'b@example.com' },
      ]),
    ).toBe('=?UTF-8?Q?J=C3=B5geva_Ants?= <a@example.com>, =?UTF-8?B?w5XDlcOV?= <b@example.com>')
  })

  test('a group is written with its members', async () => {
    expect(await to('Team: a@example.com, B <b@example.com>;, c@example.com')).toBe(
      'Team: a@example.com, B <b@example.com>;, c@example.com',
    )
    expect(await to('Undisclosed recipients:;')).toBe('Undisclosed recipients:;')
  })

  test('a quoted local part is kept', async () => {
    expect(await to([{ address: '"a,b"@good.com' }, { address: '"c;d"@good.com' }])).toBe(
      '"a,b"@good.com, "c;d"@good.com',
    )
    expect(Mail.envelope({ to: '"a@evil.com"@good.com' }).to).toEqual(['"a@evil.com"@good.com'])
  })

  test('an unquoted special or second @ in the local part throws', () => {
    for (const address of ['a,b@good.com', 'c;d@good.com', 'a@evil.com@good.com'])
      expect(() => Mail.envelope({ to: { address } })).toThrow(Mail.InvalidInputError)
  })

  test('a domain literal is split off at the @ in front of it', () => {
    expect(Mail.envelope({ to: { address: 'a@[x@evil.com]' } }).to).toEqual(['a@[x@evil.com]'])
    expect(Mail.envelope({ to: { address: 'a@[IPv6:2001:db8::1]' } }).to).toEqual([
      'a@[ipv6:2001:db8::1]',
    ])
    expect(Mail.envelope({ to: { address: 'user@[127.0.0.1]' } }).to).toEqual(['user@[127.0.0.1]'])
  })

  test.each([
    'a@good.com,victim@evil.com',
    'a@good.com;victim@evil.com',
    'a@good.com victim@evil.com',
    'a\r\nBcc: x@evil.com',
    '"a"@evil.com"@good.com',
    '',
  ])('the address %j throws because it is not one addr-spec', (address) => {
    expect(() => Mail.encode({ to: { address } })).toThrow(Mail.InvalidInputError)
  })

  test('the header lists exactly the recipients of the envelope', async () => {
    const inputs = [
      [{ address: '"a,b"@good.com' }, { address: '"c;d"@good.com' }],
      'x@example.com, grp: y@example.com, "z, w" <z@example.com>;',
    ] satisfies Mail.Addresses[]
    for (const input of inputs)
      expect(Mail.envelope({ to: (await to(input))! }).to).toEqual(Mail.envelope({ to: input }).to)
  })
})

describe('international domains', () => {
  test('a domain is punycoded when the local part is ASCII', async () => {
    expect(await to('safe@jõgeva.ee')).toBe('safe@xn--jgeva-dua.ee')
    expect(await to('safe@JÕGEVA.EE')).toBe('safe@xn--jgeva-dua.ee')
  })

  test('the domain is mapped with UTS #46 as browsers do', () => {
    expect(Mail.envelope({ to: 'victim@compa­ny.com' }).to).toEqual(['victim@company.com'])
    expect(Mail.envelope({ to: 'user@ｅｘａｍｐｌｅ.com' }).to).toEqual(['user@example.com'])
  })

  test('a domain is kept as UTF-8 when the local part is not ASCII', async () => {
    expect(await to({ name: 'Jõser', address: 'jõser@jõgeva.ee' })).toBe(
      '=?UTF-8?Q?J=C3=B5ser?= <jõser@jõgeva.ee>',
    )
    expect(Mail.envelope({ from: 'jõser@JÕGEVA.EE' }).from).toBe('jõser@jõgeva.ee')
  })

  test.each([
    'attacker.example/mail.corp.example',
    'attacker.example?mail.corp.example',
    'attacker.example#mail.corp.example',
    'attacker.example%2email.corp.example',
  ])('the URL delimiter in %j does not truncate the domain', (domain) => {
    expect(Mail.envelope({ to: { address: 'user@' + domain } }).to).toEqual(['user@' + domain])
  })

  test('a backslash in the domain throws', () => {
    expect(() =>
      Mail.envelope({ to: { address: 'user@attacker.example\\mail.corp.example' } }),
    ).toThrow(Mail.InvalidInputError)
  })

  test('a domain the URL parser rejects is kept as written', () => {
    expect(Mail.envelope({ to: 'user@ex_ample.com' }).to).toEqual(['user@ex_ample.com'])
  })
})

describe('envelope', () => {
  test('from is the first From address, else the first Sender address', () => {
    expect(
      Mail.envelope({ from: 'A <a@example.com>, b@example.com', sender: 's@example.com' }).from,
    ).toBe('a@example.com')
    expect(Mail.envelope({ sender: 'S <s@example.com>' }).from).toBe('s@example.com')
    expect(Mail.envelope({}).from).toBeUndefined()
  })

  test('to lists To, Cc and Bcc once each, in order', () => {
    expect(
      Mail.envelope({
        to: 'a@example.com, b@example.com',
        cc: 'b@example.com, c@example.com',
        bcc: 'a@example.com, d@example.com',
      }).to,
    ).toEqual(['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'])
  })

  test('a group is replaced by its members and deduped against the addresses around it', () => {
    expect(
      Mail.envelope({ to: 'x@example.com, grp: x@example.com, y@example.com;, y@example.com' }).to,
    ).toEqual(['x@example.com', 'y@example.com'])
  })

  test('the header keeps every entry while the envelope is deduped', async () => {
    const message = { to: 'A <a@example.com>, a@example.com, b@example.com' }
    expect(field(await compose(message), 'To')).toBe(
      'A <a@example.com>, a@example.com, b@example.com',
    )
    expect(Mail.envelope(message).to).toEqual(['a@example.com', 'b@example.com'])
  })

  test('the domain before a comment is used, not the text after it', () => {
    expect(Mail.envelope({ to: 'user@good-corp.com(x)evil.com' }).to).toEqual([
      'user@good-corp.com',
    ])
    expect(Mail.envelope({ to: 'user@(x)good-corp.com' }).to).toEqual(['user@good-corp.com'])
  })

  test.each([
    ['App <app@good-corp.com(x)evil.com>', ['app@good-corp.com']],
    ['<cc(c)@good-corp.com>', ['cc@good-corp.com']],
    ['Bcc <bcc@good-corp.com (note)>', ['bcc@good-corp.com']],
    ['G: (a; <evil@evil.com>) <v@victim.com>;', ['v@victim.com']],
    ['G: "a;" "<evil@evil.com>" <v@victim.com>;', ['v@victim.com']],
    ['<a@[x@evil.com]>', ['a@[x@evil.com]']],
    ['Name <a@[x@evil.com]>', ['a@[x@evil.com]']],
    ['<a (b) @c.com>', ['a@c.com']],
    ['"a" @good.com', ['a@good.com']],
    ['user @ good.com', ['user@good.com']],
    ['<@evil.com,@x.com:user@good.com>', ['user@good.com']],
    ['"user"@good-corp.com(x)evil.com', ['user@good-corp.com']],
    ['"user name"@good-corp.com(x)evil.com', ['"user name"@good-corp.com']],
    ['Victim (x(y) <evil@evil.com>) <v@victim.com>', ['v@victim.com']],
    ['user@good.com (x) evil@evil.com', ['user@good.com']],
    ['<"a@evil.com>"@good.com>', ['"a@evil.com>"@good.com']],
  ])('the recipients of %j are %j', (to, expected) => {
    expect(Mail.envelope({ to }).to).toEqual(expected)
  })

  test.each(['(a@evil.com)', '<(a@evil.com)>', 'G: (a@evil.com);'])(
    'a comment that stands alone in %j is not taken as a recipient',
    (to) => {
      expect(() => Mail.envelope({ to })).toThrow(Mail.InvalidInputError)
    },
  )

  test('an own __proto__ key cannot add a recipient', () => {
    const mailbox = JSON.parse(
      '{"address":"to@example.com","__proto__":{"group":[{"address":"exfil@attacker.test"}]}}',
    ) as Mail.Mailbox
    expect(Mail.envelope({ to: mailbox }).to).toEqual(['to@example.com'])
  })

  test('a bare name is not an address', () => {
    expect(() => Mail.envelope({ to: 'John Doe' })).toThrow(Mail.InvalidInputError)
    expect(() => Mail.envelope({ to: 'root' })).toThrow(Mail.InvalidInputError)
  })

  test('100,000 recipients finish within the test timeout, which a quadratic parser would not', () => {
    const list = Array.from({ length: 100_000 }, (_, i) => `user${i}@example.com`)
    expect(Mail.envelope({ to: list.join(', ') }).to).toHaveLength(100_000)
  })
})
