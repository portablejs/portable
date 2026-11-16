# @portable/ip API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/ip

```ts
type Address =
  | {
      version: 4;
      bytes: Uint8Array;
    }
  | {
      version: 6;
      bytes: Uint8Array;
      zone?: string | undefined;
    };

type Cidr = {
  address: Address;
  prefix: number;
};

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Range =
  | '6to4'
  | '6to4RelayAnycast'
  | 'amt'
  | 'as112'
  | 'benchmarking'
  | 'broadcast'
  | 'deprecatedOrchid'
  | 'deprecatedSiteLocal'
  | 'discard'
  | 'documentation'
  | 'droneRemoteIdProtocolEntityTags'
  | 'dummy'
  | 'ietfProtocolAssignments'
  | 'ipv4Ipv6Translation'
  | 'ipv4Mapped'
  | 'ipv4Translated'
  | 'linkLocal'
  | 'loopback'
  | 'multicast'
  | 'orchidV2'
  | 'private'
  | 'reserved'
  | 'segmentRouting'
  | 'sharedAddressSpace'
  | 'teredo'
  | 'thisNetwork'
  | 'uniqueLocal'
  | 'unicast'
  | 'unspecified';

function canParse(text: unknown, options?: canParse.Options): boolean;
namespace canParse {
  type Options = {
    version?: 4 | 6 | undefined;
  };
}

function compare(a: Address | string, b: Address | string): number;

function contains(cidr: Cidr | string, address: Address | string): boolean;

function format(address: Address | string): string;

function formatCidr(cidr: Cidr): string;

function fromBytes(bytes: Uint8Array): Address;

function parse(text: string): Address;

function parseCidr(text: string): Cidr;

function range(address: Address | string): Range;

function reverseName(address: Address | string): string;

function toIpv6(address: Address | string): Address;

function unmap(address: Address | string): Address;
```
