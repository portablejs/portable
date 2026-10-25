---
'@portable/ip': minor
---

Initial release. `Ip.parse`, `canParse`, and `format` read and write IPv4 and IPv6 addresses strictly and in RFC 5952 form; `fromBytes`, `compare`, `unmap`, `toIpv6`, and `reverseName` convert and compare addresses; `parseCidr`, `formatCidr`, and `contains` handle CIDR blocks; and `range` returns the name of the IANA special-purpose block that contains an address, or `'unicast'`. Replaces ip, ipaddr.js, is-ip, ip-cidr, cidr-tools, and ip-range-check.
