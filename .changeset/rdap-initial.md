---
'@portable/rdap': minor
---

Added `domain`, `ip` and `asn`, which look up a domain name, an IP address or prefix, or an AS number over RDAP. They find the server in IANA's bootstrap files, which are cached for 24 hours, follow a registry's referral to the registrar, and return status, dates as `Date`s, nameservers and flattened contacts, with the response JSON in `raw`. A replacement for whoiser, whois-json and node-rdap.
