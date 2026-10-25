/**
 * Converts between Node streams and web streams. This entry imports `node:stream`, so it runs in
 * Node, Bun and Deno, and not in browsers or Cloudflare Workers.
 * @module
 */
export { fromWeb, toWeb, toWebObjects } from '../node/readable.js';
export { fromWebTransform, toWebTransform } from '../node/transform.js';
export { fromWebWritable, toWebWritable } from '../node/writable.js';
