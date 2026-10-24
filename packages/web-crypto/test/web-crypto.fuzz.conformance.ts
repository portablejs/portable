import { fc, fuzz, mutated, outcome } from '@portable/fuzz';
import * as WebCrypto from '@portable/web-crypto';
import { expect, test } from 'vite-plus/test';

const curves = { 'P-256': 32, 'P-384': 48, 'P-521': 66 } as const;
const curve = fc.constantFrom(...(Object.keys(curves) as (keyof typeof curves)[]));

test('derToRawEcdsa reads what rawToDerEcdsa writes', () => {
  fuzz(
    fc.property(
      curve.chain((namedCurve) =>
        fc.tuple(
          fc.constant(namedCurve),
          fc.uint8Array({ minLength: curves[namedCurve] * 2, maxLength: curves[namedCurve] * 2 }),
        ),
      ),
      ([namedCurve, raw]) => {
        const der = WebCrypto.rawToDerEcdsa(raw);
        expect(WebCrypto.derToRawEcdsa(der, { namedCurve })).toEqual(raw);
      },
    ),
  );
});

test('derToRawEcdsa throws only InvalidInputError for changed DER', () => {
  const der = WebCrypto.rawToDerEcdsa(new Uint8Array(64).map((_, i) => (i * 37 + 129) & 0xff));
  fuzz(
    fc.property(mutated(der), curve, (bytes, namedCurve) => {
      outcome([WebCrypto.InvalidInputError], () => WebCrypto.derToRawEcdsa(bytes, { namedCurve }));
    }),
  );
});

test('digest, hmac and hkdf give the same result for text and its UTF-8 bytes', async () => {
  const hash = fc.constantFrom<WebCrypto.Hash>('SHA-1', 'SHA-256', 'SHA-384', 'SHA-512');
  await fuzz(
    fc.asyncProperty(
      hash,
      fc.string({ maxLength: 40 }),
      fc.string({ maxLength: 40 }),
      async (hash, key, data) => {
        const utf8 = (text: string) => new TextEncoder().encode(text);
        expect(await WebCrypto.digest(hash, data)).toEqual(
          await WebCrypto.digest(hash, utf8(data)),
        );
        expect(await WebCrypto.hmac(hash, key, data)).toEqual(
          await WebCrypto.hmac(hash, utf8(key), utf8(data)),
        );
        expect(await WebCrypto.hkdf(hash, key, { info: data, length: 16 })).toEqual(
          await WebCrypto.hkdf(hash, utf8(key), { info: utf8(data), length: 16 }),
        );
      },
    ),
    { scale: 0.3 },
  );
});
