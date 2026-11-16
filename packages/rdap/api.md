# @portable/rdap API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/rdap

```ts
type Autnum = Common & {
  name: string | undefined;
  start: number | undefined;
  end: number | undefined;
  type: string | undefined;
  country: string | undefined;
};

type Domain = Common & {
  name: string;
  unicodeName: string | undefined;
  nameservers: readonly string[];
  referral: Referral | undefined;
};

type Entity = {
  handle: string | undefined;
  roles: readonly string[];
  name: string | undefined;
  org: string | undefined;
  email: string | undefined;
  phone: string | undefined;
  address: string | undefined;
};

type Events = {
  registration: Date | undefined;
  expiration: Date | undefined;
  lastChanged: Date | undefined;
};

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Network = Common & {
  name: string | undefined;
  version: 4 | 6 | undefined;
  startAddress: string | undefined;
  endAddress: string | undefined;
  cidrs: readonly string[];
  type: string | undefined;
  country: string | undefined;
  parentHandle: string | undefined;
};

class NotFoundError extends Errors.ResponseError {
  static readonly kind: string;
  readonly url: string;
  constructor(
    options: Errors.ResponseError.Options & {
      url: string;
    },
  );
}

type Referral =
  | {
      url: string;
      raw: Record<string, unknown>;
      error?: undefined;
    }
  | {
      url: string;
      raw?: undefined;
      error: unknown;
    };

class ResponseError extends Errors.ResponseError {
  static readonly kind: string;
  readonly url: string;
  readonly body: unknown;
  constructor(
    options: Errors.ResponseError.Options & {
      url: string;
    },
  );
}

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
}

function asn(number: number, options?: asn.Options): Promise<Autnum>;
namespace asn {
  type Options = Shared;
}

function domain(name: string, options?: domain.Options): Promise<Domain>;
namespace domain {
  type Options = Shared & {
    follow?: boolean | undefined;
  };
}

function ip(address: string, options?: ip.Options): Promise<Network>;
namespace ip {
  type Options = Shared;
}

// Not exported, but used by the exports above.

type Common = {
  handle: string | undefined;
  status: readonly string[];
  events: Events;
  entities: readonly Entity[];
  raw: Record<string, unknown>;
};

type Fetch = (request: Request) => Promise<Response>;

type Shared = {
  fetch?: Fetch | undefined;
  signal?: AbortSignal | undefined;
  now?: Instant | undefined;
};
```
