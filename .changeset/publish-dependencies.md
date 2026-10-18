---
'@portable/dns': patch
'@portable/spf': patch
'@portable/dkim': patch
'@portable/dmarc': patch
---

List `dependencies` in the published `package.json`. They sat before zile's `[!start-pkg]` marker, so zile left them out.
