---
'@portable/rdap': minor
---

Initial release. `Rdap.domain`, `ip` and `asn` look up a domain name, an IP address or prefix, or an AS number over RDAP. They find the server in IANA's bootstrap files, which are cached for 24 hours, follow a registry's referral to the registrar, and return status, dates as `Date`s, nameservers and flattened contacts, with the response JSON in `raw`. Replaces whoiser, whois-json and node-rdap.
