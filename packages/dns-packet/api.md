# @portable/dns-packet API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/dns-packet

```ts
type DecodedOptRecord = {
  type: 'OPT';
  name: '.';
  udpPayloadSize: number;
  extendedRcode: number;
  version: number;
  dnssecOk: boolean;
  options: EdnsOption[];
};

type DecodedPacket = {
  id: number;
  type: 'query' | 'response';
  opcode: Opcode;
  rcode: Rcode;
  flags: {
    [key in keyof Flags]-?: boolean;
  };
  questions: DecodedQuestion[];
  answers: DecodedResourceRecord[];
  authorities: DecodedResourceRecord[];
  additionals: DecodedResourceRecord[];
};

type DecodedQuestion = {
  name: string;
  type: RecordType;
  class: RecordClass;
  qu: boolean;
};

type DecodedRecordData = Omit<RecordData, 'TXT'> & {
  TXT: Uint8Array[];
};

type DecodedResourceRecord = {
  [key in KnownType]: DecodedFields & {
    type: key;
    data: DecodedRecordData[key];
  };
}[KnownType] | (DecodedFields & {
  type: UnknownType;
  data: Uint8Array;
}) | DecodedOptRecord;

type EdnsOption = {
  code: 'CLIENT_SUBNET';
  ip: string;
  sourcePrefixLength: number;
  scopePrefixLength?: number | undefined;
} | {
  code: 'TCP_KEEPALIVE';
  timeout?: number | undefined;
} | {
  code: 'PADDING';
  length: number;
} | {
  code: 'KEY_TAG';
  tags: readonly number[];
} | {
  code: Exclude<OptionCode, 'CLIENT_SUBNET' | 'TCP_KEEPALIVE' | 'PADDING' | 'KEY_TAG'>;
  data: Uint8Array;
};

type Flags = {
  aa?: boolean | undefined;
  tc?: boolean | undefined;
  rd?: boolean | undefined;
  ra?: boolean | undefined;
  ad?: boolean | undefined;
  cd?: boolean | undefined;
};

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Opcode = 'QUERY' | 'IQUERY' | 'STATUS' | 'NOTIFY' | 'UPDATE' | 'DSO' | `OPCODE${number}`;

type OptRecord = {
  type: 'OPT';
  name?: '.' | undefined;
  udpPayloadSize?: number | undefined;
  extendedRcode?: number | undefined;
  version?: number | undefined;
  dnssecOk?: boolean | undefined;
  options?: readonly EdnsOption[] | undefined;
};

type OptionCode = 'LLQ' | 'UL' | 'NSID' | 'DAU' | 'DHU' | 'N3U' | 'CLIENT_SUBNET' | 'EXPIRE' | 'COOKIE' | 'TCP_KEEPALIVE' | 'PADDING' | 'CHAIN' | 'KEY_TAG' | 'EDE' | 'DEVICEID' | `OPTION${number}`;

type Packet = {
  id?: number | undefined;
  type?: 'query' | 'response' | undefined;
  opcode?: Opcode | undefined;
  rcode?: Rcode | undefined;
  flags?: Flags | undefined;
  questions?: readonly Question[] | undefined;
  answers?: readonly ResourceRecord[] | undefined;
  authorities?: readonly ResourceRecord[] | undefined;
  additionals?: readonly ResourceRecord[] | undefined;
};

type Question = {
  name: string;
  type: RecordType;
  class?: RecordClass | undefined;
  qu?: boolean | undefined;
};

type Rcode = 'NOERROR' | 'FORMERR' | 'SERVFAIL' | 'NXDOMAIN' | 'NOTIMP' | 'REFUSED' | 'YXDOMAIN' | 'YXRRSET' | 'NXRRSET' | 'NOTAUTH' | 'NOTZONE' | 'DSOTYPENI' | `RCODE${number}`;

type RecordClass = 'IN' | 'CS' | 'CH' | 'HS' | 'NONE' | 'ANY' | `CLASS${number}`;

type RecordData = {
  A: string;
  AAAA: string;
  CNAME: string;
  DNAME: string;
  NS: string;
  PTR: string;
  MX: {
    preference: number;
    exchange: string;
  };
  SOA: {
    mname: string;
    rname: string;
    serial: number;
    refresh: number;
    retry: number;
    expire: number;
    minimum: number;
  };
  SRV: {
    priority: number;
    weight: number;
    port: number;
    target: string;
  };
  TXT: readonly (string | Uint8Array)[];
  NULL: Uint8Array;
  HINFO: {
    cpu: string;
    os: string;
  };
  CAA: {
    flags: number;
    tag: string;
    value: string;
  };
  NAPTR: {
    order: number;
    preference: number;
    flags: string;
    services: string;
    regexp: string;
    replacement: string;
  };
  TLSA: {
    usage: number;
    selector: number;
    matchingType: number;
    certificate: Uint8Array;
  };
  SSHFP: {
    algorithm: number;
    fingerprintType: number;
    fingerprint: Uint8Array;
  };
  DS: DigestData;
  CDS: DigestData;
  DNSKEY: KeyData;
  CDNSKEY: KeyData;
  RRSIG: {
    typeCovered: RecordType;
    algorithm: number;
    labels: number;
    originalTTL: number;
    expiration: number;
    inception: number;
    keyTag: number;
    signersName: string;
    signature: Uint8Array;
  };
  RP: {
    mbox: string;
    txt: string;
  };
  NSEC: {
    nextDomain: string;
    types: readonly RecordType[];
  };
  NSEC3: {
    algorithm: number;
    flags: number;
    iterations: number;
    salt: Uint8Array;
    nextHashedOwner: Uint8Array;
    types: readonly RecordType[];
  };
};

type RecordType = keyof typeof typeNumbers | `TYPE${number}`;

type ResourceRecord = {
  [key in KnownType]: Fields & {
    type: key;
    data: RecordData[key];
  };
}[KnownType] | (Fields & {
  type: UnknownType;
  data: Uint8Array;
}) | OptRecord;

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
}

type UnknownType = Exclude<RecordType, KnownType | 'OPT'>;

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
}

function decode(bytes: Uint8Array, options?: decode.Options): DecodedPacket;
namespace decode {
  type Options = {
    framing?: 'none' | 'tcp' | undefined;
  };
}

function encode(packet: Packet, options?: encode.Options): Uint8Array<ArrayBuffer>;
namespace encode {
  type Options = {
    compress?: boolean | undefined;
    framing?: 'none' | 'tcp' | undefined;
  };
}

// Not exported, but used by the exports above.

type DecodedFields = {
  name: string;
  ttl: number;
  class: RecordClass;
  flush: boolean;
};

type DigestData = {
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: Uint8Array;
};

type Fields = {
  name: string;
  ttl?: number | undefined;
  class?: RecordClass | undefined;
  flush?: boolean | undefined;
};

type KeyData = {
  flags: number;
  algorithm: number;
  key: Uint8Array;
};

type KnownType = keyof RecordData;

const typeNumbers: {
  readonly A: 1;
  readonly NS: 2;
  readonly CNAME: 5;
  readonly SOA: 6;
  readonly NULL: 10;
  readonly PTR: 12;
  readonly HINFO: 13;
  readonly MX: 15;
  readonly TXT: 16;
  readonly RP: 17;
  readonly AFSDB: 18;
  readonly SIG: 24;
  readonly KEY: 25;
  readonly AAAA: 28;
  readonly LOC: 29;
  readonly SRV: 33;
  readonly NAPTR: 35;
  readonly KX: 36;
  readonly CERT: 37;
  readonly DNAME: 39;
  readonly OPT: 41;
  readonly APL: 42;
  readonly DS: 43;
  readonly SSHFP: 44;
  readonly IPSECKEY: 45;
  readonly RRSIG: 46;
  readonly NSEC: 47;
  readonly DNSKEY: 48;
  readonly DHCID: 49;
  readonly NSEC3: 50;
  readonly NSEC3PARAM: 51;
  readonly TLSA: 52;
  readonly SMIMEA: 53;
  readonly HIP: 55;
  readonly CDS: 59;
  readonly CDNSKEY: 60;
  readonly OPENPGPKEY: 61;
  readonly CSYNC: 62;
  readonly ZONEMD: 63;
  readonly SVCB: 64;
  readonly HTTPS: 65;
  readonly SPF: 99;
  readonly TKEY: 249;
  readonly TSIG: 250;
  readonly IXFR: 251;
  readonly AXFR: 252;
  readonly ANY: 255;
  readonly URI: 256;
  readonly CAA: 257;
  readonly TA: 32768;
  readonly DLV: 32769;
};
```
