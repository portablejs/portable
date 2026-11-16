# @portable/dns API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/dns

```ts
type CaaRecord = {
  critical: number;
  issue?: string | undefined;
  issuewild?: string | undefined;
  iodef?: string | undefined;
  contactemail?: string | undefined;
  contactphone?: string | undefined;
};

type DohResolver = Resolver & {
  query(
    name: string,
    type: DnsPacket.RecordType,
    options?: Resolver.CallOptions,
  ): Promise<DnsPacket.DecodedPacket>;
};

type MxRecord = {
  exchange: string;
  priority: number;
};

type NaptrRecord = {
  flags: string;
  service: string;
  regexp: string;
  replacement: string;
  order: number;
  preference: number;
};

class QueryError extends Errors.BaseError {
  static readonly kind: string;
  readonly code: QueryError.Code;
  readonly syscall: string;
  readonly hostname: string;
  constructor(options: QueryError.Options);
}
namespace QueryError {
  type Code =
    | 'ENOTFOUND'
    | 'ENODATA'
    | 'ESERVFAIL'
    | 'EREFUSED'
    | 'ENOTIMP'
    | 'EFORMERR'
    | 'EBADRESP'
    | 'ETIMEOUT'
    | 'ECONNREFUSED'
    | 'EBADNAME'
    | 'EINVAL';
  type Options = ErrorOptions & {
    code: Code;
    syscall: string;
    hostname: string;
  };
}

type Resolver = {
  resolve4(name: string, options?: Resolver.CallOptions): Promise<string[]>;
  resolve6(name: string, options?: Resolver.CallOptions): Promise<string[]>;
  resolveCname(name: string, options?: Resolver.CallOptions): Promise<string[]>;
  resolveMx(name: string, options?: Resolver.CallOptions): Promise<MxRecord[]>;
  resolveNs(name: string, options?: Resolver.CallOptions): Promise<string[]>;
  resolvePtr(name: string, options?: Resolver.CallOptions): Promise<string[]>;
  resolveTxt(name: string, options?: Resolver.CallOptions): Promise<string[][]>;
  resolveSrv(name: string, options?: Resolver.CallOptions): Promise<SrvRecord[]>;
  resolveSoa(name: string, options?: Resolver.CallOptions): Promise<SoaRecord>;
  resolveCaa(name: string, options?: Resolver.CallOptions): Promise<CaaRecord[]>;
  resolveNaptr(name: string, options?: Resolver.CallOptions): Promise<NaptrRecord[]>;
  reverse(ip: string, options?: Resolver.CallOptions): Promise<string[]>;
};
namespace Resolver {
  type CallOptions = {
    signal?: AbortSignal | undefined;
  };
}

type SoaRecord = {
  nsname: string;
  hostmaster: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minttl: number;
};

type SrvRecord = {
  name: string;
  port: number;
  priority: number;
  weight: number;
};

function create(options?: create.Options): DohResolver;
namespace create {
  type Options = {
    endpoints?: readonly (string | URL)[] | undefined;
    fetch?: ((request: Request) => Promise<Response>) | undefined;
    timeout?: number | undefined;
  };
}

function isNotFound(error: unknown): boolean;
```
