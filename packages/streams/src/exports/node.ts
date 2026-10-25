/**
 * Converts Node `Readable` streams to web `ReadableStream`s. This entry imports `node:stream`, so it
 * runs in Node, Bun and Deno, and not in browsers or Cloudflare Workers.
 * @module
 */
export { toWeb, toWebObjects } from '../node/readable.js';
