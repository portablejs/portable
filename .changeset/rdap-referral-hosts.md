---
'@portable/rdap': minor
---

`Rdap.domain` follows a registrar referral only if the link uses https and its host is a domain name, not an IP address or `localhost`, and it no longer follows redirects on the referral request.
