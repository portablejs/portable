import * as WebCrypto from '@portable/web-crypto';
import { describe, expect, test } from 'vite-plus/test';
import ecSec1 from './fixtures/pem/ec-sec1.pem.txt?raw';
import rsaPkcs1Public from './fixtures/pem/rsa-pkcs1-public.pem.txt?raw';
import rsaPkcs1 from './fixtures/pem/rsa-pkcs1.pem.txt?raw';
import rsaPkcs8 from './fixtures/pem/rsa-pkcs8.pem.txt?raw';
import rsaSpki from './fixtures/pem/rsa-spki.pem.txt?raw';
import { encode } from './utils.js';

const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const data = encode('hello');

function toPem(label: string, der: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN ${label}-----\n${base64.replace(/.{64}/g, '$&\n')}\n-----END ${label}-----\n`;
}

async function pkcs8Of(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('pkcs8', key);
}

describe('importPem', () => {
  test('imports a PKCS #8 and a PKCS #1 RSA private key to the same key', async () => {
    const fromPkcs8 = await WebCrypto.importPem(rsa, rsaPkcs8, { extractable: true });
    const fromPkcs1 = await WebCrypto.importPem(rsa, rsaPkcs1, { extractable: true });
    expect(fromPkcs8).toMatchObject({ type: 'private', extractable: true, usages: ['sign'] });
    expect(new Uint8Array(await pkcs8Of(fromPkcs1))).toEqual(
      new Uint8Array(await pkcs8Of(fromPkcs8)),
    );
  });

  test('imports a SubjectPublicKeyInfo and a PKCS #1 RSA public key that verify the signature', async () => {
    const privateKey = await WebCrypto.importPem(rsa, rsaPkcs1);
    const signature = await crypto.subtle.sign(rsa.name, privateKey, data);
    for (const pem of [rsaSpki, rsaPkcs1Public]) {
      const publicKey = await WebCrypto.importPem(rsa, pem);
      expect(publicKey).toMatchObject({ type: 'public', usages: ['verify'] });
      expect(await crypto.subtle.verify(rsa.name, publicKey, signature, data)).toBe(true);
    }
  });

  test('imports Ed25519, ECDSA, and ECDH keys with default usages', async () => {
    const ed = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ]);
    const edPem = toPem('PRIVATE KEY', await pkcs8Of(ed.privateKey));
    expect(await WebCrypto.importPem('Ed25519', edPem)).toMatchObject({ usages: ['sign'] });
    const edPublic = toPem('PUBLIC KEY', await crypto.subtle.exportKey('spki', ed.publicKey));
    expect(await WebCrypto.importPem('Ed25519', edPublic)).toMatchObject({ usages: ['verify'] });
    const ecPem = toPem('PRIVATE KEY', await pkcs8Of(ec.privateKey));
    const ecdsa = { name: 'ECDSA', namedCurve: 'P-256' };
    expect(await WebCrypto.importPem(ecdsa, ecPem)).toMatchObject({ usages: ['sign'] });
    const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
    expect(await WebCrypto.importPem(ecdh, ecPem)).toMatchObject({
      type: 'private',
      usages: expect.arrayContaining(['deriveBits', 'deriveKey']),
    });
  });

  test('takes usages and the PEM as bytes', async () => {
    const key = await WebCrypto.importPem({ name: 'RSA-OAEP', hash: 'SHA-256' }, encode(rsaPkcs8), {
      usages: ['decrypt'],
    });
    expect(key.usages).toEqual(['decrypt']);
  });

  test('skips text and other blocks before the key', async () => {
    const certificate = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';
    const key = await WebCrypto.importPem(rsa, `Bag Attributes\n${certificate}${rsaPkcs1}`);
    expect(key.type).toBe('private');
  });

  test('accepts CRLF line breaks and a block without line breaks', async () => {
    expect((await WebCrypto.importPem(rsa, rsaPkcs8.replace(/\n/g, '\r\n'))).type).toBe('private');
    const [, body] = /-----\n([^-]*)-----END/.exec(rsaPkcs8)!;
    const oneLine = `-----BEGIN PRIVATE KEY-----${body!.replace(/\s/g, '')}-----END PRIVATE KEY-----`;
    expect((await WebCrypto.importPem(rsa, oneLine)).type).toBe('private');
  });

  test('throws InvalidInputError without a PEM block, for bad base64 and for a key of another algorithm', async () => {
    for (const pem of [
      'secret',
      '-----BEGIN PRIVATE KEY-----\n!!!\n-----END PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PUBLIC KEY-----',
    ]) {
      await expect(WebCrypto.importPem(rsa, pem)).rejects.toThrow(WebCrypto.InvalidInputError);
    }
    await expect(WebCrypto.importPem('Ed25519', rsaPkcs8)).rejects.toThrow(
      WebCrypto.InvalidInputError,
    );
  });

  test('throws UnsupportedError for an SEC 1 EC key, a certificate, and an encrypted key', async () => {
    const encrypted =
      '-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,00\n\nAAAA\n-----END RSA PRIVATE KEY-----';
    for (const pem of [
      ecSec1,
      '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
      '-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----',
      encrypted,
    ]) {
      await expect(
        WebCrypto.importPem({ name: 'ECDSA', namedCurve: 'P-256' }, pem),
      ).rejects.toThrow(WebCrypto.UnsupportedError);
    }
  });

  test('throws a RangeError without usages for an algorithm it has no default for', async () => {
    await expect(WebCrypto.importPem('AES-GCM', rsaPkcs8)).rejects.toThrow(RangeError);
  });

  test('rejects with signal.reason once aborted', async () => {
    const reason = new Error('stop');
    await expect(
      WebCrypto.importPem(rsa, rsaPkcs8, { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
  });
});
