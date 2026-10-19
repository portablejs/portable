---
'@portable/arc': patch
---

`seal` seals a message whose ARC fields are all malformed as `i=1` with `cv=fail`, instead of throwing a `RangeError`.
