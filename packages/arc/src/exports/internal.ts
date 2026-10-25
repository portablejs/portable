/**
 * The ARC steps that `@portable/mail-auth` reuses to hash a message's body once for DKIM, ARC and
 * the seal. It isn't public API and can change in any release.
 */
export { createSealer, type Sealer } from '../seal.js';
export { planVerify } from '../verify.js';
