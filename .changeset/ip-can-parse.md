---
'@portable/ip': minor
'@portable/dns': patch
'@portable/spf': patch
---

`Ip.validate` is now `Ip.canParse`, after `URL.canParse`, because every other function named after a verb throws on bad input.
