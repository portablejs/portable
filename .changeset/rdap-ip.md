---
'@portable/rdap': patch
---

IP lookups clear a prefix's host bits before the query, as `Ip.parseCidr` does, so `8.8.8.130/26` queries `8.8.8.128/26`.
