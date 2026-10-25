import * as WebCrypto from '@portable/web-crypto';

const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' };

export async function rsaSha1(
  privateKey: CryptoKey | string,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const key = typeof privateKey === 'string' ? await importPem(privateKey) : privateKey;
  const { name, hash } = key.algorithm as Partial<RsaHashedKeyAlgorithm>;
  if (name !== algorithm.name || hash?.name !== algorithm.hash) {
    throw new RangeError(
      `RSA-SHA1 needs an RSASSA-PKCS1-v1_5 key with SHA-1, not ${name} with ${hash?.name}`,
    );
  }
  try {
    return new Uint8Array(await crypto.subtle.sign(algorithm.name, key, data));
  } catch (cause) {
    // A PEM key with inconsistent numbers is imported without error, and signing then fails here
    // with an OperationError.
    throw new RangeError('The RSA private key can not sign', { cause });
  }
}

async function importPem(text: string): Promise<CryptoKey> {
  try {
    return await WebCrypto.importPem(algorithm, text, { usages: ['sign'] });
  } catch (cause) {
    throw new RangeError('privateKey is not a PEM RSA private key', { cause });
  }
}
