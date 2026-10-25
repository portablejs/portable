import { hostToAscii } from '@portable/idna/internal';

const invalidChars = /[\s"<>(),;:\\@[\]\p{Cc}]|[^\P{Cf}\u200c\u200d]/u;
const hostName = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/;
const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export type Domain = { kind: 'name'; name: string } | { kind: 'address' } | { kind: 'invalid' };

export function parseDomain(value: string): Domain {
  const domain = value.trim().toLowerCase();
  if (/^\[[^[\]\\]*\]$/.test(domain)) {
    return { kind: 'address' };
  }
  if (invalidChars.test(domain)) {
    return { kind: 'invalid' };
  }
  const name = hostToAscii(domain)?.replace(/\.$/, '');
  if (name === undefined || !hostName.test(name)) {
    return { kind: 'invalid' };
  }
  return ipv4.test(name) ? { kind: 'address' } : { kind: 'name', name };
}

export function canExist(name: string): boolean {
  return name.length <= 253 && name.split('.').every((label) => label.length && label.length <= 63);
}
