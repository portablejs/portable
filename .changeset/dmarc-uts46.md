---
'@portable/dmarc': patch
---

A From domain written with fullwidth letters or an ideographic full stop, such as `ＥＸＡＭＰＬＥ.com`, now maps to `example.com` as SPF and `URL` map it, so DMARC looks up the right record. It mapped to `xn--mi7chab1aes7c.com` before.
