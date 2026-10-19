---
'@portable/dkim': patch
'@portable/exif': patch
'@portable/mail': patch
'@portable/oauth1': patch
'@portable/password': patch
'@portable/smtp': patch
'@portable/web-push': patch
---

Use `@portable/bytes` for `concat`, `equal`, `timingSafeEqual` and `toHex` instead of private copies. Output is unchanged.
