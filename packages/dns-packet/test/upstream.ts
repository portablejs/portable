// Translates packets decoded by dns-packet into this package's shape, for the oracle tests.

import { classes, optionCodes, opcodes, rcodes, types } from '../src/codes.js';
import type { DecodedPacket } from '@portable/dns-packet';
import { hex } from './utils.js';

type Loose = Record<string, any>;

const bytesOf = (value: Uint8Array) => new Uint8Array(value);
const canonicalIPv6 = (ip: string) => new URL(`http://[${ip}]`).hostname.slice(1, -1);
const typeName = (name: string) => types.name(types.value(name.replace(/^UNKNOWN_/, 'TYPE')));
const className = (name: string) => classes.name(classes.value(name.replace(/^UNKNOWN_/, 'CLASS')));

function upstreamData(type: string, data: any): unknown {
  switch (type) {
    case 'TXT':
      return data.map(bytesOf);
    case 'AAAA':
      return canonicalIPv6(data);
    case 'CAA':
      return { flags: data.flags, tag: data.tag, value: data.value };
    case 'SSHFP':
      return {
        algorithm: data.algorithm,
        fingerprintType: data.hash,
        fingerprint: hex(data.fingerprint),
      };
    case 'NSEC':
      return { nextDomain: data.nextDomain, types: data.rrtypes.map(typeName) };
    case 'NSEC3': {
      const { nextDomain, rrtypes, ...rest } = data;
      return {
        ...rest,
        salt: bytesOf(rest.salt),
        nextHashedOwner: bytesOf(nextDomain),
        types: rrtypes.map(typeName),
      };
    }
    case 'RRSIG':
      return {
        ...data,
        typeCovered: typeName(data.typeCovered),
        signature: bytesOf(data.signature),
      };
    case 'DS':
    case 'CDS':
      return { ...data, digest: bytesOf(data.digest) };
    case 'DNSKEY':
    case 'CDNSKEY':
      return { ...data, key: bytesOf(data.key) };
    case 'TLSA':
      return { ...data, certificate: bytesOf(data.certificate) };
  }
  return data instanceof Uint8Array ? bytesOf(data) : data;
}

function upstreamOption(option: Loose): unknown {
  const code = optionCodes.name(option.code);
  switch (option.code) {
    case 8:
      return {
        code,
        ip: option.family === 2 ? canonicalIPv6(option.ip) : option.ip,
        sourcePrefixLength: option.sourcePrefixLength,
        scopePrefixLength: option.scopePrefixLength,
      };
    case 11:
      return option.timeout === undefined ? { code } : { code, timeout: option.timeout };
    case 12:
      return { code, length: option.data.length };
    case 14:
      return { code, tags: option.tags };
  }
  return { code, data: bytesOf(option.data) };
}

function upstreamRecord(record: Loose): unknown {
  if (record.type === 'OPT') {
    return {
      type: 'OPT',
      name: record.name,
      udpPayloadSize: record.udpPayloadSize,
      extendedRcode: record.extendedRcode,
      version: record.ednsVersion,
      dnssecOk: record.flag_do,
      options: record.options.map(upstreamOption),
    };
  }
  const type = typeName(record.type);
  return {
    type,
    name: record.name,
    ttl: record.ttl,
    class: className(record.class),
    flush: record.flush,
    data: upstreamData(type, record.data),
  };
}

/** Translates a packet decoded by dns-packet into this package's shape. */
export function fromUpstream(packet: Loose): unknown {
  return {
    id: packet.id,
    type: packet.type,
    opcode: opcodes.name(Number(/\d+$/.exec(packet.opcode)?.[0] ?? opcodes.value(packet.opcode))),
    rcode: rcodes.name(Number(/\d+$/.exec(packet.rcode)?.[0] ?? rcodes.value(packet.rcode))),
    flags: {
      aa: packet.flag_aa,
      tc: packet.flag_tc,
      rd: packet.flag_rd,
      ra: packet.flag_ra,
      ad: packet.flag_ad,
      cd: packet.flag_cd,
    },
    questions: packet.questions.map((q: Loose) => ({
      name: q.name,
      type: typeName(q.type),
      class: className(q.class),
      qu: false,
    })),
    answers: packet.answers.map(upstreamRecord),
    authorities: packet.authorities.map(upstreamRecord),
    additionals: packet.additionals.map(upstreamRecord),
  };
}

/** Canonicalizes the IPv6 text in our own decoded packet, so both sides compare the same way. */
export function canonical(packet: DecodedPacket): unknown {
  const record = (r: Loose) =>
    r.type === 'AAAA'
      ? { ...r, data: canonicalIPv6(r.data) }
      : r.type === 'OPT'
        ? {
            ...r,
            options: r.options.map((o: Loose) =>
              o.code === 'CLIENT_SUBNET' && o.ip.includes(':')
                ? { ...o, ip: canonicalIPv6(o.ip) }
                : o,
            ),
          }
        : r;
  return {
    ...packet,
    answers: packet.answers.map(record),
    authorities: packet.authorities.map(record),
    additionals: packet.additionals.map(record),
  };
}
