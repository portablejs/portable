import * as Dmarc from '@portable/dmarc';
import { dmarc } from 'mailauth/lib/dmarc/index.js';
import { getDomain } from 'tldts';
import { describe, expect, test } from 'vite-plus/test';
import { type Zone, zoneResolver } from './utils.js';

function mailauthResolver(resolver: Dmarc.Resolver) {
  return (name: string, type: string): Promise<string[][] | string[]> => {
    switch (type) {
      case 'TXT':
        return resolver.resolveTxt(name);
      case 'A':
        return resolver.resolve4(name);
      case 'CNAME':
        return resolver.resolveCname(name);
      default:
        return Promise.reject(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));
    }
  };
}

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roots = ['example.com', 'example.net', 'bank.example', 'blogspot.com', 'co.uk'];
const prefixes = ['', 'mail', 'a.b', 'sub', 'mail.sub', 'x.y.z.w.v.u.t'];
const records = [
  'v=DMARC1; p=reject',
  'v=DMARC1; p=quarantine; sp=none',
  'v=DMARC1; p=none; sp=reject; np=quarantine',
  'v=DMARC1; p=reject; adkim=s; aspf=s',
  'v=DMARC1; p=reject; aspf=s',
  'v=DMARC1; p=quarantine; t=y',
  'v=DMARC1; p=reject; psd=y',
  'v=DMARC1; p=none; psd=n',
  'v=DMARC1; p=reject; sp=quarantine; np=reject; psd=y',
  'v=DMARC1; rua=mailto:d@example.com',
  'v=DMARC1; adkim=s',
  'v=DMARC1; p=bogus; rua=mailto:d@example.com',
  'v=DMARC1; p=reject; p=none',
  'V=DMARC1; P=reject',
  ' v=DMARC1; p=reject',
  'v = DMARC1 ; p = Quarantine ; adkim = S',
  'v=dmarc1; p=reject',
  'v=spf1 -all',
];

function scenario(next: () => number) {
  const pick = <value>(list: readonly value[]): value => list[Math.floor(next() * list.length)]!;
  const root = pick(roots);
  const under = (base: string) => {
    const prefix = pick(prefixes);
    return prefix ? `${prefix}.${base}` : base;
  };
  const from = under(root);
  const related = () => (next() < 0.7 ? under(root) : under(pick(roots)));
  const labels = from.split('.');
  const ancestors = labels.map((_, index) => labels.slice(index).join('.'));
  const zone: Zone = {};
  for (let i = 1 + Math.floor(next() * 4); i > 0; i--) {
    const roll = next();
    zone[`_dmarc.${next() < 0.7 ? pick(ancestors) : related()}`] = {
      TXT:
        roll < 0.06 ? 'ESERVFAIL' : roll < 0.12 ? [pick(records), pick(records)] : [pick(records)],
    };
  }
  for (let i = Math.floor(next() * 3); i > 0; i--) {
    zone[related()] = next() < 0.15 ? { A: 'ESERVFAIL' } : { A: ['192.0.2.1'] };
  }
  const spf =
    next() < 0.7
      ? { result: next() < 0.8 ? ('pass' as const) : ('fail' as const), domain: related() }
      : undefined;
  const dkim = Array.from({ length: Math.floor(next() * 4) }, () => ({
    result: next() < 0.8 ? ('pass' as const) : ('fail' as const),
    domain: related(),
  }));
  return { zone, from, spf, dkim };
}

async function both(zone: Zone, input: Dmarc.check.Input) {
  const ours = await Dmarc.check(input, { resolver: zoneResolver(zone) });
  const theirs = await dmarc({
    headerFrom: input.from,
    spfDomains: input.spf?.result === 'pass' ? [input.spf.domain] : [],
    dkimDomains: (input.dkim ?? [])
      .filter((entry) => entry.result === 'pass')
      .map((entry) => ({ domain: entry.domain })),
    resolver: mailauthResolver(zoneResolver(zone)),
    strict: true,
  });
  if (!theirs) {
    throw new Error('mailauth found no From domain');
  }
  return {
    ours: {
      result: ours.result,
      policy: ours.policy,
      policyDomain: ours.policyDomain,
      spf: ours.spf?.aligned ? ours.spf.domain : undefined,
      dkim: ours.dkim.find((signature) => signature.aligned)?.domain,
    },
    mailauth: {
      result: theirs.status.result,
      policy: theirs.policy,
      policyDomain: theirs.policyDomain ?? undefined,
      spf: theirs.alignment?.spf.result || undefined,
      dkim: theirs.alignment?.dkim.result || undefined,
    },
  };
}

describe('matches mailauth strict mode', () => {
  const next = random(9989);
  for (let i = 0; i < 400; i++) {
    const { zone, ...input } = scenario(next);
    test(`random scenario ${i}: ${input.from}`, async () => {
      const { ours, mailauth } = await both(zone, input);
      expect(ours).toEqual(mailauth);
    });
  }
});

describe('matches mailauth on From domains it normalizes', () => {
  const zone = { '_dmarc.xn--bcher-kva.example': { TXT: ['v=DMARC1; p=reject'] } } satisfies Zone;
  for (const from of [
    'Bücher.example',
    'mail.BÜCHER.example.',
    `cafe${String.fromCharCode(0x301)}.example`,
  ]) {
    test(`${JSON.stringify(from)}`, async () => {
      const { ours, mailauth } = await both(zone, {
        from,
        dkim: [{ result: 'pass', domain: 'xn--bcher-kva.example' }],
      });
      expect(ours.result).toBe(mailauth.result);
      expect(ours.policy).toBe(mailauth.policy);
    });
  }
});

describe('the organizationalDomain option with tldts matches the tree walk', () => {
  test('when every organizational domain publishes a record', async () => {
    const zone = {
      '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject; sp=quarantine'] },
      '_dmarc.example.co.uk': { TXT: ['v=DMARC1; p=quarantine'] },
    } satisfies Zone;
    const next = random(7489);
    const names = ['example.com', 'mail.example.com', 'a.b.example.com', 'example.co.uk'];
    for (let i = 0; i < 50; i++) {
      const pick = () => names[Math.floor(next() * names.length)]!;
      const input = { from: pick(), dkim: [{ result: 'pass', domain: pick() }] };
      const walked = await Dmarc.check(input, { resolver: zoneResolver(zone) });
      const listed = await Dmarc.check(input, {
        resolver: zoneResolver(zone),
        organizationalDomain: (domain) => getDomain(domain),
      });
      expect(listed).toEqual(walked);
    }
  });
});
