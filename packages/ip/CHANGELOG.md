# @portable/ip

## 0.1.0

### Minor Changes

- [`a4714cb`](https://github.com/portablejs/portable/commit/a4714cb62e489ff874e89125ab09d3cd433be632) - Initial release. `Ip.parse`, `canParse`, and `format` read and write IPv4 and IPv6 addresses strictly and in RFC 5952 form; `fromBytes`, `compare`, `unmap`, `toIpv6`, and `reverseName` convert and compare addresses; `parseCidr`, `formatCidr`, and `contains` handle CIDR blocks; and `range` returns the name of the IANA special-purpose block that contains an address, or `'unicast'`. Replaces ip, ipaddr.js, is-ip, ip-cidr, cidr-tools, and ip-range-check.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
