---
'@portable/streams': minor
---

Added `tee(source, count, options)`, which splits a stream into any number of branches and stops reading the source while the slowest branch holds `highWaterMark` unread chunks or bytes.
