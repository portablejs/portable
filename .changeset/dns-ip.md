---
'@portable/dns': patch
---

`reverse` builds the `in-addr.arpa` and `ip6.arpa` name with `@portable/ip`. An IPv4 address with a leading zero, such as `01.2.3.4`, now rejects with `EINVAL` as in Node, instead of being read as `1.2.3.4`.
