export type { Digest, Hmac } from '@portable/web-crypto';
export { UnsupportedError } from '../errors.js';
export {
  authorization,
  type Credentials,
  sign,
  type SignatureMethod,
  type Token,
} from '../oauth1.js';
