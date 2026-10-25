import type { Instant } from '@portable/timers';
import { abortable, toDate } from '@portable/timers/internal';
import * as Dns from '@portable/dns';
import { Failure, permerror, temperror } from './errors.js';
import * as Ip from '@portable/ip';
import { dotted, isInNetwork, parseIp } from './ip.js';
import {
  expand,
  isTopLabel,
  parseMacroString,
  type Token,
  hasMacro,
  type Values,
} from './macro.js';
import { type Directive, parseRecord, type Qualifier } from './record.js';
import { hostToAscii } from '@portable/idna/internal';

/**
 * The DNS lookups SPF needs: a `Dns.Resolver` from `@portable/dns`, `node:dns/promises`, or a
 * plain object with these methods. `check` treats a rejection with `code` `ENOTFOUND`,
 * `ENODATA` or `EBADNAME` (an invalid name) as an empty answer, and any other rejection as a
 * temporary DNS error.
 */
export type Resolver = Pick<
  Dns.Resolver,
  'resolve4' | 'resolve6' | 'resolveMx' | 'resolvePtr' | 'resolveTxt'
>;

/**
 * The outcome of an SPF check.
 */
export type Result = {
  /** The RFC 7208 result. */
  result: Result.Code;
  /** The domain whose policy was checked: the MAIL FROM domain, or the HELO name for an empty sender. */
  domain: string;
  /** Which identity was checked, as Authentication-Results calls it (RFC 8601). */
  identity: 'mailfrom' | 'helo';
  /** The term that matched, as written in the record, such as `include:_spf.example.com`. */
  mechanism?: string | undefined;
  /** The SPF record that gave the result. After `redirect=`, the record of the redirect target. */
  record?: string | undefined;
  /** The domain owner's `exp=` text. Set only for `fail`. It is third-party text. */
  explanation?: string | undefined;
  /** Why the result is `none`, `temperror` or `permerror`. */
  reason?: string | undefined;
  /** The resolver's error behind a `temperror`. */
  cause?: unknown;
  /** DNS-querying terms evaluated. More than 10 gives `permerror`. */
  lookups: number;
  /** Lookups that found no records. More than 2 gives `permerror`. */
  voidLookups: number;
};

export declare namespace Result {
  type Code = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';
}

export declare namespace check {
  type Input = {
    /** The SMTP client's IPv4 or IPv6 address. An IPv4-mapped IPv6 address is checked as IPv4. */
    ip: string;
    /**
     * The MAIL FROM address. Empty or missing for a bounce, and then the HELO name is checked
     * instead.
     */
    sender?: string | undefined;
    /** The HELO or EHLO name. */
    helo?: string | undefined;
  };

  type Options = {
    /** Looks up DNS records. Pass `Dns.create()` or `node:dns/promises`. */
    resolver: Resolver;
    /** The checking host's name, for `%{r}` in explanations. @default 'unknown' */
    receiver?: string | undefined;
    /**
     * The time for `%{t}` in explanations, as a `Date` or a `Temporal.Instant`.
     * @default new Date()
     */
    now?: Instant | undefined;
    /** Rejects with `signal.reason` and cancels the pending lookups when aborted. */
    signal?: AbortSignal | undefined;
  };
}

type Outcome = Omit<Result, 'domain' | 'identity' | 'lookups' | 'voidLookups'>;

type Answers = { A: string[]; AAAA: string[]; MX: Dns.MxRecord[]; TXT: string[][]; PTR: string[] };

type Context = {
  resolver: Resolver;
  signal: AbortSignal | undefined;
  cache: { [key in keyof Answers]: Map<string, Promise<Answers[key]>> };
  client: Ip.Address;
  values: Values;
  asciiLocal: boolean;
  lookups: number;
  voidLookups: number;
};

type Target = { name: string } | { skip: 'local-part' | 'invalid' };

const results: Record<Qualifier, Result.Code> = {
  '+': 'pass',
  '-': 'fail',
  '~': 'softfail',
  '?': 'neutral',
};

type Lookup<value> = (
  resolver: Resolver,
  name: string,
  options: Dns.Resolver.CallOptions,
) => Promise<value>;

const methods: { [key in keyof Answers]: Lookup<Answers[key]> } = {
  A: (resolver, name, options) => resolver.resolve4(name, options),
  AAAA: (resolver, name, options) => resolver.resolve6(name, options),
  MX: (resolver, name, options) => resolver.resolveMx(name, options),
  TXT: (resolver, name, options) => resolver.resolveTxt(name, options),
  PTR: (resolver, name, options) => resolver.resolvePtr(name, options),
};

/**
 * Checks whether an SMTP client may send mail for a domain, as RFC 7208's `check_host()` does. It
 * reads the SPF record of the MAIL FROM domain, or of the HELO name when the sender is empty, and
 * evaluates it against the client's IP address, with the RFC's limits of 10 DNS-querying terms
 * and 2 void lookups. DNS failures give `temperror`, and broken records give `permerror`. The
 * promise rejects only for an `ip` that isn't an IP address or a `resolver` without the
 * `Resolver` methods, or with `signal.reason` when `signal` aborts.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns';
 * import * as Spf from '@portable/spf';
 *
 * const spf = await Spf.check(
 *   { ip: '192.0.2.10', sender: 'alice@example.com', helo: 'mail.example.com' },
 *   { resolver: Dns.create(), signal: AbortSignal.timeout(20_000) },
 * );
 * spf.result; // 'pass', 'fail', 'softfail', 'neutral', 'none', 'temperror' or 'permerror'
 * ```
 */
export async function check(input: check.Input, options: check.Options): Promise<Result> {
  if (typeof input.ip !== 'string') {
    throw new TypeError('Spf.check: ip must be a string');
  }
  const address = parseIp(input.ip.trim());
  if (!address) {
    throw new RangeError(`Spf.check: "${input.ip}" is not an IP address`);
  }
  assertResolver(options.resolver);
  const now = toDate(options.now);
  options.signal?.throwIfAborted();
  const client = Ip.unmap(address);
  const helo = stripDot(input.helo ?? '');
  const identity = input.sender ? 'mailfrom' : 'helo';
  const sender = input.sender || helo;
  const at = sender.lastIndexOf('@');
  const local = at > 0 ? sender.slice(0, at) : 'postmaster';
  const domain = toAscii(stripDot(sender.slice(at + 1)));
  const base = { domain, identity } as const;

  if (!isValidName(domain)) {
    return {
      ...base,
      result: 'none',
      reason: `"${domain}" is not a domain name`,
      lookups: 0,
      voidLookups: 0,
    };
  }

  const ctx = {
    resolver: options.resolver,
    signal: options.signal,
    cache: { A: new Map(), AAAA: new Map(), MX: new Map(), TXT: new Map(), PTR: new Map() },
    client,
    values: {
      s: `${local}@${domain}`,
      l: local,
      o: domain,
      d: domain,
      i: dotted(client),
      p: '',
      v: client.version === 4 ? 'in-addr' : 'ip6',
      h: helo,
      c: Ip.format(client),
      r: options.receiver ?? 'unknown',
      t: String(Math.floor(now.getTime() / 1000)),
    },
    asciiLocal: /^\p{ASCII}*$/u.test(local),
    lookups: 0,
    voidLookups: 0,
  } satisfies Context;

  let outcome: Outcome;
  try {
    outcome = await evaluate(ctx, domain, false);
  } catch (error) {
    if (!(error instanceof Failure)) {
      throw error;
    }
    outcome = {
      result: error.result,
      reason: error.message,
      ...(error.cause !== undefined && { cause: error.cause }),
    };
  }
  return { ...base, ...outcome, lookups: ctx.lookups, voidLookups: ctx.voidLookups };
}

const resolverMethods = ['resolve4', 'resolve6', 'resolveMx', 'resolvePtr', 'resolveTxt'] as const;

function assertResolver(resolver: Resolver): void {
  for (const method of resolverMethods) {
    if (typeof resolver?.[method] !== 'function') {
      throw new TypeError(`Spf.check: options.resolver must have a ${method} method`);
    }
  }
}

async function evaluate(ctx: Context, domain: string, included: boolean): Promise<Outcome> {
  const records = (await query(ctx, 'TXT', domain))
    .map((strings) => strings.join(''))
    .filter((text) => /^v=spf1(?: |$)/i.test(text));
  if (records.length === 0) {
    return { result: 'none', reason: `${domain} has no SPF record` };
  }
  if (records.length > 1) {
    throw permerror(`${domain} has ${records.length} SPF records`);
  }
  const record = records[0]!;
  if (/[^\x20-\x7e]/.test(record)) {
    throw permerror(`The SPF record of ${domain} has a character outside printable ASCII`);
  }
  const policy = parseRecord(record.slice(6).split(' ').filter(Boolean));
  const values = { ...ctx.values, d: domain };

  for (const directive of policy.directives) {
    if (!(await matches(ctx, directive, values))) {
      continue;
    }
    const outcome: Outcome = {
      result: results[directive.qualifier],
      mechanism: directive.text,
      record,
    };
    if (outcome.result === 'fail' && policy.exp && !included) {
      const explanation = await explain(ctx, policy.exp, values);
      if (explanation !== undefined) {
        outcome.explanation = explanation;
      }
    }
    return outcome;
  }

  if (!policy.redirect) {
    return { result: 'neutral', record };
  }
  countLookup(ctx);
  const target = await expandTarget(ctx, policy.redirect, values, true);
  if (!('name' in target)) {
    throw permerror(`The redirect target of ${domain} is not a domain name`);
  }
  const outcome = await evaluate(ctx, target.name, included);
  if (outcome.result === 'none') {
    throw permerror(`Redirect target ${target.name} has no SPF record`);
  }
  return outcome;
}

async function matches(ctx: Context, directive: Directive, values: Values): Promise<boolean> {
  const { client } = ctx;
  switch (directive.kind) {
    case 'all':
      return true;
    case 'ip4':
    case 'ip6':
      return isInNetwork(client, directive.network, directive.prefix);
    case 'include': {
      countLookup(ctx);
      const target = await expandTarget(ctx, directive.domain, values, true);
      if (!('name' in target)) {
        if (target.skip === 'local-part') {
          return false;
        }
        throw permerror(`The include target in "${directive.text}" is not a domain name`);
      }
      const { result } = await evaluate(ctx, target.name, true);
      if (result === 'none') {
        throw permerror(`Include target ${target.name} has no SPF record`);
      }
      return result === 'pass';
    }
    case 'exists': {
      countLookup(ctx);
      const target = await expandTarget(ctx, directive.domain, values, true);
      return 'name' in target && (await addresses(ctx, target.name, 'A', true)).length > 0;
    }
    case 'a':
    case 'mx': {
      countLookup(ctx);
      const target = directive.domain
        ? await expandTarget(ctx, directive.domain, values, true)
        : { name: values.d };
      if (!('name' in target)) {
        return false;
      }
      const prefix = client.version === 4 ? directive.cidr4 : directive.cidr6;
      const inRange = (ip: Ip.Address) => isInNetwork(client, ip, prefix);
      if (directive.kind === 'a') {
        return (await addresses(ctx, target.name, family(ctx), true)).some(inRange);
      }
      return mxMatches(ctx, target.name, inRange);
    }
    case 'ptr': {
      countLookup(ctx);
      const names = await reverseNames(ctx);
      if (names?.length === 0) {
        countVoidLookup(ctx);
      }
      const target = directive.domain
        ? await expandTarget(ctx, directive.domain, values, true)
        : { name: values.d };
      if (!('name' in target) || !names) {
        return false;
      }
      const wanted = target.name.toLowerCase();
      return (await validate(ctx, names)).some((name) => isSubdomain(name, wanted));
    }
  }
}

async function mxMatches(
  ctx: Context,
  name: string,
  inRange: (ip: Ip.Address) => boolean,
): Promise<boolean> {
  const records = await query(ctx, 'MX', name);
  if (records.length === 0) {
    countVoidLookup(ctx);
  }
  if (records.length > 10) {
    throw permerror(`${name} has more than 10 MX records`);
  }
  const hosts = records.map((mx) => stripDot(mx.exchange)).filter((host) => host && host !== '.');
  const answers = await Promise.allSettled(
    hosts.map((host) => addresses(ctx, host, family(ctx), false)),
  );
  if (answers.some((answer) => answer.status === 'fulfilled' && answer.value.some(inRange))) {
    return true;
  }
  const failed = answers.find((answer) => answer.status === 'rejected');
  if (failed) {
    throw failed.reason;
  }
  return false;
}

async function explain(
  ctx: Context,
  spec: readonly Token[],
  values: Values,
): Promise<string | undefined> {
  try {
    const target = await expandTarget(ctx, spec, values, false);
    if (!('name' in target)) {
      return undefined;
    }
    const records = await query(ctx, 'TXT', target.name);
    if (records.length !== 1) {
      return undefined;
    }
    const tokens = parseMacroString(records[0]!.join(''), true);
    const text = expand(tokens, await withPtr(ctx, tokens, values, false));
    return /^[\x20-\x7e]+$/.test(text) ? text : undefined;
  } catch (error) {
    if (error instanceof Failure) {
      return undefined;
    }
    throw error;
  }
}

async function expandTarget(
  ctx: Context,
  tokens: readonly Token[],
  values: Values,
  counted: boolean,
): Promise<Target> {
  if (!ctx.asciiLocal && (hasMacro(tokens, 'l') || hasMacro(tokens, 's'))) {
    return { skip: 'local-part' };
  }
  let name = expand(tokens, await withPtr(ctx, tokens, values, counted)).replace(/\.$/, '');
  while (name.length > 253 && name.includes('.')) {
    name = name.slice(name.indexOf('.') + 1);
  }
  return isValidName(name) ? { name } : { skip: 'invalid' };
}

async function withPtr(
  ctx: Context,
  tokens: readonly Token[],
  values: Values,
  counted: boolean,
): Promise<Values> {
  if (!hasMacro(tokens, 'p')) {
    return values;
  }
  if (counted) {
    countLookup(ctx);
  }
  const names = await validate(ctx, (await reverseNames(ctx)) ?? []);
  const domain = values.d.toLowerCase();
  const p =
    names.find((name) => name === domain) ??
    names.find((name) => isSubdomain(name, domain)) ??
    names[0] ??
    'unknown';
  return { ...values, p };
}

async function reverseNames(ctx: Context): Promise<string[] | undefined> {
  try {
    return await query(ctx, 'PTR', Ip.reverseName(ctx.client));
  } catch (error) {
    if (error instanceof Failure) {
      return undefined;
    }
    throw error;
  }
}

async function validate(ctx: Context, names: readonly string[]): Promise<string[]> {
  const checked = await Promise.all(
    names.slice(0, 10).map(async (name) => {
      try {
        const found = await addresses(ctx, name, family(ctx), false);
        return found.some((ip) => Ip.compare(ip, ctx.client) === 0)
          ? stripDot(name).toLowerCase()
          : '';
      } catch (error) {
        if (error instanceof Failure) {
          return '';
        }
        throw error;
      }
    }),
  );
  return checked.filter(Boolean);
}

async function addresses(
  ctx: Context,
  name: string,
  type: 'A' | 'AAAA',
  countVoid: boolean,
): Promise<Ip.Address[]> {
  const answer = await query(ctx, type, name);
  if (answer.length === 0 && countVoid) {
    countVoidLookup(ctx);
  }
  return answer.flatMap((text) => {
    const ip = parseIp(text);
    return ip ? [ip] : [];
  });
}

async function query<key extends keyof Answers>(
  ctx: Context,
  type: key,
  name: string,
): Promise<Answers[key]> {
  const cache = ctx.cache[type] satisfies Map<string, Promise<Answers[key]>>;
  const key = name.toLowerCase();
  let answer = cache.get(key);
  if (!answer) {
    answer = Promise.resolve().then(() =>
      methods[type](ctx.resolver, name, { signal: ctx.signal }),
    );
    answer.catch(() => {});
    cache.set(key, answer);
  }
  try {
    return await abortable(answer, ctx.signal);
  } catch (error) {
    ctx.signal?.throwIfAborted();
    if (error instanceof Failure) {
      throw error;
    }
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (Dns.isNotFound(error)) {
      return [];
    }
    throw temperror(
      `${type} lookup of ${name} failed: ${typeof code === 'string' ? code : String(error)}`,
      error,
    );
  }
}

function countLookup(ctx: Context): void {
  if (++ctx.lookups > 10) {
    throw permerror('More than 10 DNS-querying terms');
  }
}

function countVoidLookup(ctx: Context): void {
  if (++ctx.voidLookups > 2) {
    throw permerror('More than 2 void lookups');
  }
}

function family(ctx: Context): 'A' | 'AAAA' {
  return ctx.client.version === 4 ? 'A' : 'AAAA';
}

function isSubdomain(name: string, domain: string): boolean {
  return name === domain || name.endsWith(`.${domain}`);
}

function stripDot(name: string): string {
  return /[^.]\.$/.test(name) ? name.slice(0, -1) : name;
}

function isValidName(name: string): boolean {
  if (name.length > 253) {
    return false;
  }
  const labels = name.split('.');
  return (
    labels.length > 1 &&
    labels.every((label) => /^[\x20-\x2d\x2f-\x7e]{1,63}$/.test(label)) &&
    isTopLabel(labels.at(-1)!)
  );
}

function toAscii(domain: string): string {
  if (/^\p{ASCII}*$/u.test(domain)) {
    return domain;
  }
  return hostToAscii(domain) ?? domain;
}
