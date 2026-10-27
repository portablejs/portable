# @portable/dmarc

## 0.1.0

### Minor Changes

- [`3bec687`](https://github.com/portablejs/portable/commit/3bec6876c6556c840e1509ecac335287dd8065dd) - Initial release. `Dmarc.check` takes a From domain and its SPF and DKIM results and evaluates DMARC (RFC 9989). It finds the policy and the organizational domain with the DNS tree walk, through any `Dns.Resolver`. Replaces mailauth's DMARC module.

### Patch Changes

- Updated dependencies [[`1e68c9b`](https://github.com/portablejs/portable/commit/1e68c9b19aed3bc1e6ed7368b05e335d01c51ff9), [`3a566ea`](https://github.com/portablejs/portable/commit/3a566ea00267d6c74313137345532bcc59227b35), [`529fd0b`](https://github.com/portablejs/portable/commit/529fd0b90f9ef2640986d2621e3c41c63fdde48f), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/dns@0.1.0
  - @portable/idna@0.1.0
  - @portable/spf@0.1.0
  - @portable/timers@0.1.0
