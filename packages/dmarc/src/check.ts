import { abortable } from '@portable/timers/internal';
import * as Dns from '@portable/dns';
import type * as Spf from '@portable/spf';
import { canExist, parseDomain } from './domain.js';
import { isDmarc, type Parsed, type Policy, parseRecord, type Record } from './record.js';

/**
 * The DNS lookups DMARC needs: a `Dns.Resolver` from `@portable/dns`, `node:dns/promises`, or a
 * plain object with these methods. `check` treats a rejection with `code` `ENOTFOUND`, `ENODATA`
 * or `EBADNAME` as no records, and any other rejection as a temporary DNS error. `resolve4` and
 * `resolveCname` are called only to find out whether a subdomain exists, for a record with an
 * `np` tag.
 */
export type Resolver = Pick<Dns.Resolver, 'resolveTxt' | 'resolve4' | 'resolveCname'>;

/**
 * The outcome of a DMARC check.
 */
export type Result = {
  /** The DMARC result, as Authentication-Results reports it (RFC 8601). */
  result: Result.Code;
  /** The From domain that was checked, in lower case with U-labels converted to A-labels. */
  domain: string;
  /**
   * The policy the domain owner asks for: `p` for the From domain's own record, otherwise `sp`, or
   * `np` when the From domain doesn't exist. With `t=y` it is one level lower. Set when a record
   * applies.
   */
  policy?: Policy | undefined;
  /** What to do with the message: `policy` when the result is `fail`, `'none'` otherwise. */
  disposition: Policy;
  /** The domain whose `_dmarc` record applies: the From domain, its organizational domain or its public suffix domain. */
  policyDomain?: string | undefined;
  /** The record that applies. */
  record?: Record | undefined;
  /** Whether the SPF result aligns. Set when `spf` was passed. */
  spf?: Alignment | undefined;
  /** Whether each DKIM signature aligns, in the order they were passed. */
  dkim: readonly Alignment[];
  /** Why the result is `none`, `temperror` or `permerror`. */
  reason?: string | undefined;
  /**
   * The resolver's error behind a `temperror`, or an `AggregateError` of them when more than one
   * lookup failed.
   */
  cause?: unknown;
};

export declare namespace Result {
  type Code = 'pass' | 'fail' | 'none' | 'temperror' | 'permerror';
}

/**
 * An authenticated identifier and whether it aligns with the From domain. Only a `pass` result can
 * align.
 */
export type Alignment = {
  /** The SPF domain or the signature's `d=` domain, normalized like `Result.domain`. */
  domain: string;
  aligned: boolean;
};

export declare namespace check {
  type Input = {
    /** The domain of the RFC5322.From address, such as `example.com`. */
    from: string;
    /** The SPF result of the MAIL FROM identity, as `Spf.check` returns it. */
    spf?: Pick<Spf.Result, 'result' | 'domain'> | undefined;
    /** One entry per DKIM signature, with the signature's result and its `d=` domain. */
    dkim?: readonly DkimResult[] | undefined;
  };

  type DkimResult = {
    /** Only `'pass'` counts. */
    result: string;
    /** The signature's `d=` domain. */
    domain: string;
  };

  type Options = {
    /** Looks up DNS records. Pass `Dns.create()` or `node:dns/promises`. */
    resolver: Resolver;
    /**
     * Returns the organizational domain of a domain from a public suffix list, as tldts'
     * `getDomain` does, and switches from RFC 9989's DNS tree walk to RFC 7489's lookups. A
     * missing result means the domain is its own organizational domain.
     */
    organizationalDomain?: ((domain: string) => string | null | undefined) | undefined;
    /** Stops the check, such as `AbortSignal.timeout(10_000)`. The promise rejects with `signal.reason`. */
    signal?: AbortSignal | undefined;
  };
}

type Context = {
  resolver: Resolver;
  signal: AbortSignal | undefined;
  records: Map<string, Promise<Parsed | undefined>>;
  walks: Map<string, Promise<Walk>>;
};

type Found = Parsed & { domain: string };

type Walk = { found: Found[]; error?: TempError | undefined };

// oxlint-disable-next-line portable/error-kind -- never leaves this module, and its message becomes the verdict's reason
class TempError extends Error {
  override name = 'Dmarc.TempError';
}

function failure(errors: readonly TempError[]): { reason: string; cause?: unknown } {
  const reason = errors.map((error) => error.message).join('; ');
  const causes = errors.flatMap((error) => (error.cause === undefined ? [] : [error.cause]));
  if (causes.length === 0) {
    return { reason };
  }
  return { reason, cause: causes.length === 1 ? causes[0] : new AggregateError(causes, reason) };
}

const maxWalkLabels = 7;
const maxAlignmentWalks = 10;

/**
 * Checks a message against the DMARC policy of its From domain (RFC 9989, which replaces RFC
 * 7489). It finds the policy record with a DNS tree walk and checks whether a passing SPF result or
 * DKIM signature is aligned with the From domain. DNS failures give `temperror`, and a From domain
 * that isn't a domain name gives `permerror`. The promise rejects only for a `resolver` without the
 * `Resolver` methods, or with `signal.reason` when `signal` aborts.
 *
 * @example
 * ```ts
 * import * as Dmarc from '@portable/dmarc';
 * import * as Dns from '@portable/dns';
 * import * as Spf from '@portable/spf';
 *
 * const resolver = Dns.create();
 * const spf = await Spf.check({ ip, sender, helo }, { resolver });
 * const dmarc = await Dmarc.check(
 *   { from: 'example.com', spf, dkim: [{ result: 'pass', domain: 'mail.example.com' }] },
 *   { resolver },
 * );
 * dmarc.result; // 'pass', 'fail', 'none', 'temperror' or 'permerror'
 * dmarc.disposition; // 'none', 'quarantine' or 'reject'
 * ```
 */
export async function check(input: check.Input, options: check.Options): Promise<Result> {
  assertResolver(options.resolver);
  options.signal?.throwIfAborted();
  const author = parseDomain(input.from);
  const domain = author.kind === 'name' ? author.name : input.from.trim().toLowerCase();
  const unaligned = {
    ...(input.spf && { spf: { domain: identifier(input.spf.domain), aligned: false } }),
    dkim: (input.dkim ?? []).map((entry) => ({ domain: identifier(entry.domain), aligned: false })),
  };
  const base = { domain, disposition: 'none', ...unaligned } as const;
  if (author.kind === 'invalid') {
    return { ...base, result: 'permerror', reason: `"${input.from}" is not a domain name` };
  }
  if (author.kind === 'address') {
    return { ...base, result: 'none', reason: 'The From domain is an address literal' };
  }

  const ctx = {
    resolver: options.resolver,
    signal: options.signal,
    records: new Map(),
    walks: new Map(),
  } satisfies Context;
  const psl = options.organizationalDomain;
  const orgDomain = psl
    ? async (name: string) => identifier(psl(name) ?? name)
    : async (name: string) => {
        const { found, error } = await walk(ctx, name);
        if (error) {
          throw error;
        }
        return selectOrgDomain(name, found);
      };

  let found: Found | undefined;
  try {
    found = psl ? await discoverByList(ctx, author.name, psl) : await discover(ctx, author.name);
  } catch (error) {
    if (!(error instanceof TempError)) {
      throw error;
    }
    return { ...base, result: 'temperror', ...failure([error]) };
  }
  if (!found) {
    return { ...base, result: 'none', reason: 'No DMARC record' };
  }
  const { record } = found;
  if (!record) {
    return {
      ...base,
      result: 'none',
      reason: `The record at _dmarc.${found.domain} has no valid policy and no valid rua`,
    };
  }

  const errors: TempError[] = [];
  let policy = record.p;
  if (found.domain !== author.name) {
    policy = record.sp ?? record.p;
    if (record.np && record.np !== policy) {
      try {
        if (!(await exists(ctx, author.name))) {
          policy = record.np;
        }
      } catch (error) {
        if (!(error instanceof TempError)) {
          throw error;
        }
        errors.push(error);
        if (strength[record.np] < strength[policy]) {
          policy = record.np;
        }
      }
    }
  }
  if (record.t === 'y') {
    policy = policy === 'reject' ? 'quarantine' : 'none';
  }

  const walked = new Set<string>();
  const aligns = async (name: string, strict: boolean): Promise<boolean> => {
    if (name === author.name) {
      return true;
    }
    if (strict) {
      return false;
    }
    if (psl) {
      return (await orgDomain(name)) === (await orgDomain(author.name));
    }
    let authorOrg: string;
    try {
      authorOrg = await orgDomain(author.name);
    } catch (error) {
      if (name.split('.').at(-1) !== author.name.split('.').at(-1)) {
        return false;
      }
      throw error;
    }
    if (name !== authorOrg && !name.endsWith(`.${authorOrg}`)) {
      return false;
    }
    if (!walked.has(name) && walked.size >= maxAlignmentWalks) {
      throw new TempError(
        `Alignment of ${name} not checked: more than ${maxAlignmentWalks} tree walks`,
      );
    }
    walked.add(name);
    return (await orgDomain(name)) === authorOrg;
  };
  const align = async (
    entry: { result: string; domain: string },
    alignment: Alignment,
    strict: boolean,
  ): Promise<Alignment> => {
    if (entry.result !== 'pass' || parseDomain(entry.domain).kind !== 'name') {
      return alignment;
    }
    try {
      return { ...alignment, aligned: await aligns(alignment.domain, strict) };
    } catch (error) {
      if (!(error instanceof TempError)) {
        throw error;
      }
      errors.push(error);
      return alignment;
    }
  };

  const spf =
    input.spf && unaligned.spf
      ? await align(input.spf, unaligned.spf, record.aspf === 's')
      : undefined;
  const dkim: Alignment[] = [];
  for (const [index, entry] of (input.dkim ?? []).entries()) {
    dkim.push(await align(entry, unaligned.dkim[index]!, record.adkim === 's'));
  }

  const pass = spf?.aligned || dkim.some((signature) => signature.aligned);
  const result = pass ? 'pass' : errors.length ? 'temperror' : 'fail';
  return {
    result,
    domain,
    policy,
    disposition: result === 'fail' ? policy : 'none',
    policyDomain: found.domain,
    record,
    ...(spf && { spf }),
    dkim,
    ...(result === 'temperror' && failure(errors)),
  };
}

const resolverMethods = ['resolveTxt', 'resolve4', 'resolveCname'] as const;

function assertResolver(resolver: Resolver): void {
  for (const method of resolverMethods) {
    if (typeof resolver?.[method] !== 'function') {
      throw new TypeError(`options.resolver must have a ${method} method.`);
    }
  }
}

const strength: { [params in Policy]: number } = { none: 0, quarantine: 1, reject: 2 };

function identifier(value: string): string {
  const parsed = parseDomain(value);
  return parsed.kind === 'name' ? parsed.name : value.trim().toLowerCase();
}

async function discover(ctx: Context, domain: string): Promise<Found | undefined> {
  const own = await lookup(ctx, domain);
  if (own) {
    return { domain, ...own };
  }
  const { found, error } = await walk(ctx, domain);
  if (error) {
    throw error;
  }
  const orgDomain = selectOrgDomain(domain, found);
  const last = found.at(-1);
  return (
    found.find((entry) => entry.domain === orgDomain) ?? (last?.psd === 'y' ? last : undefined)
  );
}

async function discoverByList(
  ctx: Context,
  domain: string,
  orgDomain: (domain: string) => string | null | undefined,
): Promise<Found | undefined> {
  const own = await lookup(ctx, domain);
  if (own) {
    return { domain, ...own };
  }
  const org = identifier(orgDomain(domain) ?? domain);
  if (org === domain) {
    return undefined;
  }
  const parent = await lookup(ctx, org);
  return parent && { domain: org, ...parent };
}

function walk(ctx: Context, domain: string): Promise<Walk> {
  let walked = ctx.walks.get(domain);
  if (!walked) {
    walked = (async () => {
      const found: Found[] = [];
      for (let labels = domain.split('.'); labels.length;) {
        const name = labels.join('.');
        let parsed: Parsed | undefined;
        try {
          parsed = await lookup(ctx, name);
        } catch (error) {
          if (!(error instanceof TempError)) {
            throw error;
          }
          return { found, error };
        }
        if (parsed) {
          found.push({ domain: name, ...parsed });
          if (parsed.psd !== 'u') {
            break;
          }
        }
        labels = labels.length > maxWalkLabels ? labels.slice(-maxWalkLabels) : labels.slice(1);
      }
      return { found };
    })();
    ctx.walks.set(domain, walked);
  }
  return walked;
}

function selectOrgDomain(domain: string, found: readonly Found[]): string {
  for (const entry of found) {
    if (entry.psd === 'n') {
      return entry.domain;
    }
    if (entry.psd === 'y' && entry.domain !== domain) {
      return domain
        .split('.')
        .slice(-(entry.domain.split('.').length + 1))
        .join('.');
    }
  }
  return found.at(-1)?.domain ?? domain;
}

function lookup(ctx: Context, domain: string): Promise<Parsed | undefined> {
  let answer = ctx.records.get(domain);
  if (!answer) {
    const name = `_dmarc.${domain}`;
    answer = canExist(name)
      ? query(ctx, `TXT lookup of ${name}`, () =>
          ctx.resolver.resolveTxt(name, { signal: ctx.signal }),
        ).then((answer) => {
          const records = 'value' in answer ? answer.value : [];
          const texts = records.map((strings) => strings.join('').trimEnd()).filter(isDmarc);
          return texts.length === 1 ? parseRecord(texts[0]!) : undefined;
        })
      : Promise.resolve(undefined);
    answer.catch(() => {});
    ctx.records.set(domain, answer);
  }
  return abortable(answer, ctx.signal);
}

async function exists(ctx: Context, domain: string): Promise<boolean> {
  if (!canExist(domain)) {
    return false;
  }
  const a = await query(ctx, `A lookup of ${domain}`, () =>
    ctx.resolver.resolve4(domain, { signal: ctx.signal }),
  );
  if ('value' in a || a.empty === 'ENODATA') {
    return true;
  }
  if (a.empty === 'EBADNAME') {
    return false;
  }
  const cname = await query(ctx, `CNAME lookup of ${domain}`, () =>
    ctx.resolver.resolveCname(domain, { signal: ctx.signal }),
  );
  return 'value' in cname && cname.value.length > 0;
}

async function query<value>(
  ctx: Context,
  what: string,
  run: () => Promise<value>,
): Promise<{ value: value } | { empty: string }> {
  try {
    return { value: await abortable(Promise.resolve().then(run), ctx.signal) };
  } catch (error) {
    ctx.signal?.throwIfAborted();
    if (error instanceof TempError) {
      throw error;
    }
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (Dns.isNotFound(error)) {
      return { empty: code as string };
    }
    throw new TempError(`${what} failed: ${typeof code === 'string' ? code : String(error)}`, {
      cause: error,
    });
  }
}
