# @portable/spf

## 0.1.0

### Minor Changes

- [`529fd0b`](https://github.com/portablejs/portable/commit/529fd0b90f9ef2640986d2621e3c41c63fdde48f) - Initial release. `Spf.check` evaluates SPF (RFC 7208) for a client IP, MAIL FROM address, and HELO name through any `Dns.Resolver`, and enforces the RFC's DNS lookup limits. Replaces mailauth's SPF module.

### Patch Changes

- Updated dependencies [[`1e68c9b`](https://github.com/portablejs/portable/commit/1e68c9b19aed3bc1e6ed7368b05e335d01c51ff9), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`3a566ea`](https://github.com/portablejs/portable/commit/3a566ea00267d6c74313137345532bcc59227b35), [`a4714cb`](https://github.com/portablejs/portable/commit/a4714cb62e489ff874e89125ab09d3cd433be632), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/dns@0.1.0
  - @portable/errors@0.1.0
  - @portable/idna@0.1.0
  - @portable/ip@0.1.0
  - @portable/timers@0.1.0
