# @portable/rdap

## 0.1.0

### Minor Changes

- [`132c899`](https://github.com/portablejs/portable/commit/132c8991974b1e8e99d0822c13cddb8d4bc9dbfb) - Initial release. `Rdap.domain`, `ip`, and `asn` look up a domain name, an IP address (or prefix), or an AS number over RDAP. They find the server in IANA's bootstrap files, which are cached for 24 hours, follow a registry's referral to the registrar, and return status, dates as `Date`s, nameservers, and flattened contacts, with the response JSON in `raw`. Replaces whoiser, whois-json, and node-rdap.

### Patch Changes

- Updated dependencies [[`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`3a566ea`](https://github.com/portablejs/portable/commit/3a566ea00267d6c74313137345532bcc59227b35), [`a4714cb`](https://github.com/portablejs/portable/commit/a4714cb62e489ff874e89125ab09d3cd433be632), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/errors@0.1.0
  - @portable/idna@0.1.0
  - @portable/ip@0.1.0
  - @portable/timers@0.1.0
