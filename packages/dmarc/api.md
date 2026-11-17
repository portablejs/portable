# @portable/dmarc API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/dmarc

```ts
type Alignment = {
  domain: string;
  aligned: boolean;
};

type Policy = 'none' | 'quarantine' | 'reject';

type Record = {
  text: string;
  p: Policy;
  sp?: Policy | undefined;
  np?: Policy | undefined;
  adkim: 'r' | 's';
  aspf: 'r' | 's';
  t: 'y' | 'n';
  psd: 'y' | 'n' | 'u';
  rua: readonly string[];
  ruf: readonly string[];
  fo: string;
};

type Resolver = Pick<Dns.Resolver, 'resolveTxt' | 'resolve4' | 'resolveCname'>;

type Result = {
  result: Result.Code;
  domain: string;
  policy?: Policy | undefined;
  disposition: Policy;
  policyDomain?: string | undefined;
  record?: Record | undefined;
  spf?: Alignment | undefined;
  dkim: readonly Alignment[];
  reason?: string | undefined;
  cause?: unknown;
};
namespace Result {
  type Code = 'pass' | 'fail' | 'none' | 'temperror' | 'permerror';
}

function check(input: check.Input, options: check.Options): Promise<Result>;
namespace check {
  type Input = {
    from: string;
    spf?: Pick<Spf.Result, 'result' | 'domain'> | undefined;
    dkim?: readonly DkimResult[] | undefined;
  };
  type DkimResult = {
    result: string;
    domain: string;
  };
  type Options = {
    resolver: Resolver;
    organizationalDomain?: ((domain: string) => string | null | undefined) | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
