# @portable/mail-auth API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/mail-auth

```ts
export { Hash, Hasher } from '@portable/web-crypto';

type Resolver = Spf.Resolver & Dmarc.Resolver & Dkim.Resolver;

type Result = {
  spf: Spf.Result;
  dkim: readonly Dkim.Result[];
  arc: Arc.Result;
  dmarc?: Dmarc.Result | undefined;
  dmarcSkipReason?: Result.DmarcSkipReason | undefined;
  authResults: string;
  headers: string;
  sealSkipReason?: string | undefined;
};
namespace Result {
  type DmarcSkipReason = SkipReason;
}

function authenticate(message: Dkim.Message, options: authenticate.Options): Promise<Result>;
namespace authenticate {
  type Options = {
    resolver: Resolver;
    authservId: string;
    ip: string;
    helo?: string | undefined;
    sender?: string | undefined;
    seal?: Seal | undefined;
    now?: Instant | undefined;
    minKeyBits?: number | undefined;
    maxSignatures?: number | undefined;
    hasher?: ((hash: Dkim.Hash) => Dkim.Hasher) | undefined;
    organizationalDomain?: Dmarc.check.Options['organizationalDomain'] | undefined;
    signal?: AbortSignal | undefined;
  };
  type Seal = Pick<Arc.seal.Options, 'domain' | 'selector' | 'privateKey' | 'headers' | 'now'>;
}

// Not exported, but used by the exports above.

type SkipReason = 'no-author-domain' | 'multiple-author-domains' | 'invalid-author-domain' | 'multiple-from-fields';
```
