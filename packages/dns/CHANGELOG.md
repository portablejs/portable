# @portable/dns

## 0.1.0

### Minor Changes

- [`1e68c9b`](https://github.com/portablejs/portable/commit/1e68c9b19aed3bc1e6ed7368b05e335d01c51ff9) - Initial release. `Dns.create` returns a resolver that looks up records over DNS-over-HTTPS (RFC 8484) with `fetch`. Its methods, results, and error codes match those of `node:dns/promises`. Both this resolver and `node:dns/promises` match the `Dns.Resolver` type, `QueryError` has the same `code` values as Node's errors, and `isNotFound` checks whether a code means the name has no records. Replaces tangerine and dohjs, and `node:dns/promises` in runtimes that don't have it.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`958d5db`](https://github.com/portablejs/portable/commit/958d5db02aeb52a4d2ca8c0c8293b0bbccc391a1), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`3a566ea`](https://github.com/portablejs/portable/commit/3a566ea00267d6c74313137345532bcc59227b35), [`a4714cb`](https://github.com/portablejs/portable/commit/a4714cb62e489ff874e89125ab09d3cd433be632)]:
  - @portable/base64@0.1.0
  - @portable/dns-packet@0.1.0
  - @portable/errors@0.1.0
  - @portable/idna@0.1.0
  - @portable/ip@0.1.0
