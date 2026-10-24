---
'@portable/ip': minor
---

Added `@portable/ip` for IPv4 and IPv6 addresses: strict `parse` and `canParse`, RFC 5952 `format`, `fromBytes`, `compare`, `unmap` and `toIpv6` for IPv4-mapped addresses, `reverseName`, `parseCidr`, `formatCidr` and `contains` for CIDR blocks, and `range`, which returns the IANA special-purpose block that contains an address. It replaces ip, ip-cidr, ipaddr.js, is-ip, cidr-tools and ip-range-check.
