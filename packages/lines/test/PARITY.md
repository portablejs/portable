# Test parity

Upstream suites: [split2 4.2.0 `test.js`](https://github.com/mcollina/split2/blob/master/test.js) and [byline 5.0.0 `test/tests.js`](https://github.com/jahewson/node-byline/blob/master/test/tests.js). Fixtures `empty.txt` and `rfc.txt` are copied from byline (MIT, John Hewson).

## split2

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| split two lines on end | `split2 > splits two lines on end` | |
| split two lines on two writes | `split2 > splits two lines on two writes` | |
| split four lines on three writes | `split2 > splits four lines on three writes` | |
| accumulate multiple writes | `split2 > accumulates multiple writes` | |
| split using a custom string matcher | `split2 > splits on a custom string separator` | |
| split using a custom regexp matcher | `split2 > splits on a custom regexp separator` | |
| supports Symbol.split | `split2 > splits on a custom Symbol.split separator` | |
| support an option argument | skipped | Tests Node's `highWaterMark`. Web streams take queuing strategies at `pipeThrough`, not in the transform's options. |
| support a mapper function | skipped | No mapper. See the README for the `TransformStream` equivalent. |
| do not end on undefined | skipped | Mapper only. |
| has destroy method | `DecoderStream > cancelling the output cancels the source` | Web streams cancel instead of `destroy()`. |
| support custom matcher and mapper | skipped | Mapper only. The matcher half is covered by the custom separator tests. |
| support custom matcher and options | skipped | Inspects Node stream internals (`_readableState`). |
| support mapper and options | skipped | Mapper and Node stream internals. |
| split lines windows-style | `split2 > splits windows-style lines` | |
| splits a buffer | `split2 > splits bytes` | |
| split utf8 chars | `split2 > splits multi-byte characters written one byte at a time` | |
| split utf8 chars 2by2 | `split2 > splits multi-byte characters written two bytes at a time` | |
| split lines when the \n comes at the end of a chunk | `split2 > splits when the newline ends a chunk` | |
| truncated utf-8 char | `split2 > replaces a truncated multi-byte character at the end` | |
| maximum buffer limit | `split2 > errors when a line exceeds maxLength` | |
| readable highWaterMark | skipped | Node stream internals. |
| maxLength < chunk size | `split2 > allows chunks longer than maxLength when every line fits` | |
| maximum buffer limit w/skip | `split2 > skips lines longer than maxLength` | |
| don't modify the options object | `split2 > does not modify the options object` | |
| mapper throws flush | skipped | Mapper only. |
| mapper throws on transform | skipped | Mapper only. |

## byline

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should pipe a small file | `byline > pipes a small file` | |
| should work with streams2 API | skipped | Node streams2 `readable` event. Every other test reads through a reader. |
| should ignore empty lines by default | `byline > ignores empty lines when skipEmpty is set` | Empty lines are kept by default, as in split2. |
| should keep empty lines when keepEmptyLines is true | `byline > keeps empty lines by default` | |
| should not split a CRLF which spans two chunks | `byline > does not split a CRLF that spans two chunks` | Upstream's `CRLF.txt` contains no CR, so the test builds a real CRLF at the 64 KiB chunk boundary instead. |
| should read a large file | `byline > reads a large file` | |
| should read a huge file | `byline > reads a file with more lines than the default high water mark` | Uses `rfc.txt` twice instead of the 844 KB `rfc_huge.txt`. |
| should handle encodings like fs | `DecoderStream > decodes bytes with the given encoding` | Output is always a string, so the `Buffer` type check does not apply. |
| should work with old-style streams | skipped | Node streams1 and a live HTTP request. |
| should pause() and resume() with a huge file | `byline > keeps every line when the reader is slow` | |

## Known upstream issues

| Issue | Test |
| --- | --- |
| split2 checks `maxLength` only against the unfinished line at the end of each chunk, so whether it catches a long line depends on how the input was chunked. | `split2 > applies maxLength to whole lines regardless of chunking` |
| byline drops empty lines unless `keepEmptyLines` is set, so in a format where blank lines matter, they are lost without an error. | `byline > keeps empty lines by default` |
| byline's own CRLF test uses a fixture with no CR, so a CRLF split across chunks was never tested upstream. | `byline > does not split a CRLF that spans two chunks` |

## Benchmarks

split2's `bench.js` compares split2, binary-split and `node:readline` on `package.json`. `DecoderStream.bench.ts` compares `DecoderStream`, split2, byline and `node:readline` on 1.7 MB of text and fails if split2 or byline is more than 25% faster.
