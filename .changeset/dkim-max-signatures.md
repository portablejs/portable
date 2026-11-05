---
'@portable/dkim': minor
---

`Dkim.verify` takes a `maxSignatures` option, 10 by default, and reports each signature past the limit as `neutral` with the reason `too many signatures` instead of looking up its key and hashing the body. Selecting the header fields that `h=` lists now takes linear time, so a long `h=` list over many fields no longer takes quadratic time.
