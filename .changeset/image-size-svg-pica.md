---
'@portable/image-size': patch
---

`parse` and `parseStream` convert an SVG `pc` length at 16 pixels per pica. They used to convert it at about 0.11 pixels, so `width="2pc"` gave a width of 0 instead of 32.
