# @portable/spf API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/spf

```ts
type Resolver = Pick<Dns.Resolver, 'resolve4' | 'resolve6' | 'resolveMx' | 'resolvePtr' | 'resolveTxt'>;

type Result = {
  result: Result.Code;
  domain: string;
  identity: 'mailfrom' | 'helo';
  mechanism?: string | undefined;
  record?: string | undefined;
  explanation?: string | undefined;
  reason?: string | undefined;
  cause?: unknown;
  lookups: number;
  voidLookups: number;
};
namespace Result {
  type Code = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';
}

function check(input: check.Input, options: check.Options): Promise<Result>;
namespace check {
  type Input = {
    ip: string;
    sender?: string | undefined;
    helo?: string | undefined;
  };
  type Options = {
    resolver: Resolver;
    receiver?: string | undefined;
    now?: Instant | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
