# Test parity

Upstream suites:

- The OpenSPF RFC 7208 test suite, release 2019.08, as `rfc7208-tests.yml` in [pyspf](https://github.com/sdgathman/pyspf/tree/master/test). It is copied into `fixtures/` with its BSD license (`rfc7208-tests.LICENSE`, Stuart D. Gathman, Julian Mehnle, Scott Kitterman). It has 203 tests: the 200 of release 2014.04 that mailauth runs, plus `null-text`, `badip4` and `cname-aliasing`.
- mailauth 7.3.0's [`test/spf/`](https://github.com/postalsys/mailauth/tree/master/test/spf): `spf-verify-test.js`, `macro-test.js`, `limited-resolver-test.js`, `dual-stack-resolver-test.js`, `rfc-compliance-test.js`, `syntax-test.js` and `rfc-suite-test.js`.

`rfc7208.conformance.ts` runs every suite test with a fake resolver built from the scenario's zone data, read the way pyspf's `testspf.py` reads it. The other tests are in `check.conformance.ts`, named after the upstream file they port. Both run in Node and Chromium. `check.oracle.test.ts` compares results and explanations with mailauth's strict mode on the whole suite and on 300 random records.

mailauth has two modes. Its default mode is lenient on purpose: it evaluates records lazily, and it does not count a void lookup when the host has records of the other address family. Its `strict: true` mode follows RFC 7208, and passes the whole suite. We follow RFC 7208, so the oracle compares with strict mode, and the ported tests of the default mode expect the strict result.

## RFC 7208 test suite

Every test is in `rfc7208.conformance.ts`, as `<scenario> > <test> (<spec>)`, and in `check.oracle.test.ts`. All 203 pass.

### Initial processing

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| toolonglabel | 4.3/1 | none |  |
| longlabel | 4.3/1 | fail |  |
| emptylabel | 4.3/1 | none |  |
| helo-not-fqdn | 4.3/1 | none |  |
| helo-domain-literal | 4.3/1 | none |  |
| nolocalpart | 4.3/2 | fail |  |
| domain-literal | 4.3/1 | none |  |
| non-ascii-policy | 3.1/1 | permerror |  |
| non-ascii-mech | 3.1/1 | permerror |  |
| non-ascii-result | 3.1/1 | permerror |  |
| non-ascii-non-spf | 4.5/1 | fail |  |
| control-char-policy | 4.6.1/2 | permerror |  |
| two-spaces | 4.6.1 | fail |  |
| trailing-space | 4.5/2 | fail |  |
| null-text | 3.3 | pass |  |
| badip4 | 4.6.1/2 | permerror |  |

### Record lookup

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| both | 4.4/1 | fail |  |
| txtonly | 4.4/1 | fail |  |
| spfonly | 4.4/1 | none |  |
| spftimeout | 4.4/1 | fail |  |
| txttimeout | 4.4/1 | temperror |  |
| nospftxttimeout | 4.4/1 | temperror |  |
| alltimeout | 4.4/2 | temperror |  |

### Selecting records

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| nospace1 | 4.5/4 | none |  |
| empty | 4.5/4 | neutral |  |
| nospace2 | 4.5/4 | pass |  |
| spfoverride | 4.5/5 | fail |  |
| multitxt1 | 4.5/5 | permerror |  |
| multitxt2 | 4.5/6 | permerror |  |
| multispf1 | 4.5/6 | permerror or fail | We give permerror. |
| multispf2 | 4.5/6 | pass |  |
| nospf | 4.5/7 | none |  |
| case-insensitive | 4.5/6 | softfail |  |

### Record evaluation

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| detect-errors-anywhere | 4.6 | permerror |  |
| modifier-charset-good | 4.6.1/2 | pass |  |
| modifier-charset-bad1 | 4.6.1/4 | permerror |  |
| modifier-charset-bad2 | 4.6.1/4 | permerror |  |
| redirect-after-mechanisms1 | 4.6.3 | softfail |  |
| redirect-after-mechanisms2 | 4.6.3 | fail |  |
| default-result | 4.7/1 | neutral |  |
| redirect-is-modifier | 4.6.1/4 | permerror |  |
| invalid-domain | 7.1/2 | permerror |  |
| invalid-domain-empty-label | 4.3/1, 4.8/5, 5/10/3 | fail or permerror |  |
| invalid-domain-long | 4.3/1, 4.8/5, 5/10/3 | fail or permerror |  |
| invalid-domain-long-via-macro | 4.3/1, 4.8/5, 5/10/3 | fail or permerror |  |

### ALL mechanism syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| all-dot | 5.1/1 | permerror |  |
| all-arg | 5.1/1 | permerror |  |
| all-cidr | 5.1/1 | permerror |  |
| all-neutral | 5.1/1 | neutral |  |
| all-double | 5.1/1 | pass |  |

### PTR mechanism syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| ptr-cidr | 5.5/2 | permerror |  |
| ptr-match-target | 5.5/5 | pass |  |
| ptr-match-implicit | 5.5/5 | pass |  |
| ptr-nomatch-invalid | 5.5/5 | fail |  |
| ptr-match-ip6 | 5.5/5 | pass |  |
| ptr-empty-domain | 5.5/2 | permerror |  |
| ptr-case-change | 5.5/2 | pass |  |
| ptr-cname-loop | 5.5/7 | neutral |  |

### A mechanism syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| a-cidr6 | 5.3/2 | fail |  |
| a-bad-cidr4 | 5.3/2 | permerror |  |
| a-bad-cidr6 | 5.3/2 | permerror |  |
| a-dual-cidr-ip4-match | 5.3/2 | pass |  |
| a-dual-cidr-ip4-err | 5.3/2 | permerror |  |
| a-dual-cidr-ip6-match | 5.3/2 | pass |  |
| a-dual-cidr-ip4-default | 5.3/2 | fail |  |
| a-dual-cidr-ip6-default | 5.3/2 | fail |  |
| a-multi-ip1 | 5.3/3 | pass |  |
| a-multi-ip2 | 5.3/3 | pass |  |
| a-bad-domain | 7.1/2 | permerror |  |
| a-nxdomain | 5.3/3 | fail |  |
| a-cidr4-0 | 5.3/3 | pass |  |
| a-cidr4-0-ip6 | 5.3/3 | fail |  |
| a-cidr6-0-ip4 | 5.3/3 | fail |  |
| a-cidr6-0-ip4mapped | 5.3/3 | fail |  |
| a-cidr6-0-ip6 | 5.3/3 | pass |  |
| a-ip6-dualstack | 5.3/3 | pass |  |
| a-cidr6-0-nxdomain | 5.3/3 | fail |  |
| a-null | 7.1/2 | permerror |  |
| a-numeric | 7.1/2 | permerror |  |
| a-numeric-toplabel | 7.1/2 | permerror |  |
| a-dash-in-toplabel | 7.1/2 | pass |  |
| a-bad-toplabel | 7.1/2 | permerror |  |
| a-only-toplabel | 7.1/2 | permerror |  |
| a-only-toplabel-trailing-dot | 7.1/2 | permerror |  |
| a-colon-domain | 7.1/2 | pass |  |
| a-colon-domain-ip4mapped | 7.1/2 | pass |  |
| a-empty-domain | 5.3/2 | permerror |  |

### Include mechanism semantics and syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| include-fail | 5.2/9 | softfail |  |
| include-softfail | 5.2/9 | pass |  |
| include-neutral | 5.2/9 | fail |  |
| include-temperror | 5.2/9 | temperror |  |
| include-permerror | 5.2/9 | permerror |  |
| include-syntax-error | 5.2/1 | permerror |  |
| include-cidr | 5.2/1 | permerror |  |
| include-none | 5.2/9 | permerror |  |
| include-empty-domain | 5.2/1 | permerror |  |

### MX mechanism syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| mx-cidr6 | 5.4/2 | fail |  |
| mx-bad-cidr4 | 5.4/2 | permerror |  |
| mx-bad-cidr6 | 5.4/2 | permerror |  |
| mx-multi-ip1 | 5.4/3 | pass |  |
| mx-multi-ip2 | 5.4/3 | pass |  |
| mx-bad-domain | 7.1/2 | permerror |  |
| mx-nxdomain | 5.4/3 | fail |  |
| mx-cidr4-0 | 5.4/3 | pass |  |
| mx-cidr4-0-ip6 | 5.4/3 | fail |  |
| mx-cidr6-0-ip4 | 5.4/3 | fail |  |
| mx-cidr6-0-ip4mapped | 5.4/3 | fail |  |
| mx-cidr6-0-ip6 | 5.3/3 | pass |  |
| mx-cidr6-0-nxdomain | 5.4/3 | fail |  |
| mx-null | 7.1/2 | permerror |  |
| mx-numeric-top-label | 7.1/2 | permerror |  |
| mx-colon-domain | 7.1/2 | pass |  |
| mx-colon-domain-ip4mapped | 7.1/2 | pass |  |
| mx-bad-toplab | 7.1/2 | permerror |  |
| mx-empty | 5.4/3 | neutral |  |
| mx-implicit | 5.4/4 | neutral |  |
| mx-empty-domain | 5.2/1 | permerror |  |

### EXISTS mechanism syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| exists-empty-domain | 5.7/2 | permerror |  |
| exists-implicit | 5.7/2 | permerror |  |
| exists-cidr | 5.7/2 | permerror |  |
| exists-ip4 | 5.7/3 | pass |  |
| exists-ip6 | 5.7/3 | pass |  |
| exists-ip6only | 5.7/3 | fail |  |
| exists-dnserr | 5/8 | temperror |  |

### IP4 mechanism syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| cidr4-0 | 5.6/2 | pass |  |
| cidr4-32 | 5.6/2 | pass |  |
| cidr4-33 | 5.6/2 | permerror |  |
| cidr4-032 | 5.6/2 | permerror |  |
| bare-ip4 | 5.6/2 | permerror |  |
| bad-ip4-port | 5.6/2 | permerror |  |
| bad-ip4-short | 5.6/4 | permerror |  |
| ip4-dual-cidr | 5.6/2 | permerror |  |
| ip4-mapped-ip6 | 5/9/2 | fail |  |

### IP6 mechanism syntax

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| bare-ip6 | 5.6/2 | permerror |  |
| cidr6-0-ip4 | 5/9/2 | neutral |  |
| cidr6-ip4 | 5/9/2 | neutral |  |
| cidr6-0 | 5/8 | pass |  |
| cidr6-129 | 5.6/2 | permerror |  |
| cidr6-bad | 5.6/2 | permerror |  |
| cidr6-33 | 5.6/2 | pass |  |
| cidr6-33-ip4 | 5.6/2 | neutral |  |
| ip6-bad1 | 5.6/2 | permerror |  |

### Semantics of exp and other modifiers

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| redirect-none | 6.1/4 | permerror |  |
| redirect-cancels-exp | 6.2/13 | fail |  |
| redirect-syntax-error | 6.1/2 | permerror |  |
| include-ignores-exp | 6.2/13 | fail |  |
| redirect-cancels-prior-exp | 6.2/13 | fail |  |
| invalid-modifier | A/3 | permerror |  |
| empty-modifier-name | A/3 | permerror |  |
| dorky-sentinel | 7.1/6 | fail |  |
| exp-multiple-txt | 6.2/4 | fail |  |
| exp-no-txt | 6.2/4 | fail |  |
| exp-dns-error | 6.2/4 | fail |  |
| exp-empty-domain | 6.2/4 | permerror |  |
| explanation-syntax-error | 6.2/4 | fail |  |
| exp-syntax-error | 6.2/1 | permerror |  |
| exp-twice | 6/2 | permerror |  |
| redirect-empty-domain | 6.2/4 | permerror |  |
| redirect-twice | 6/2 | permerror |  |
| unknown-modifier-syntax | A/3 | permerror |  |
| default-modifier-obsolete | 6/3 | neutral |  |
| default-modifier-obsolete2 | 6/3 | neutral |  |
| non-ascii-exp | 6.2/5 | fail |  |
| two-exp-records | 6.2/4 | fail |  |
| exp-void | 4.6.4/1, 6/2 | fail |  |
| redirect-implicit | 6.1/4 | pass |  |

### Macro expansion rules

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| trailing-dot-domain | 7.1/16 | pass |  |
| trailing-dot-exp | 7.1 | fail |  |
| exp-only-macro-char | 7.1/8 | permerror |  |
| invalid-macro-char | 7.1/9 | permerror |  |
| invalid-embedded-macro-char | 7.1/9 | permerror |  |
| invalid-trailing-macro-char | 7.1/9 | permerror |  |
| macro-mania-in-domain | 7.1/3, 7.1/4 | pass |  |
| exp-txt-macro-char | 7.1/20 | fail |  |
| domain-name-truncation | 7.1/25 | fail |  |
| v-macro-ip4 | 7.1/6 | fail |  |
| v-macro-ip6 | 7.1/6 | fail | Explanation compared ignoring case: the suite writes the `%{i}` nibbles in upper case, and RFC 7208 section 7.4 writes them in lower case. |
| undef-macro | 7.1/6 | permerror |  |
| p-macro-ip4-novalid | 7.1/22 | fail |  |
| p-macro-ip4-valid | 7.1/22 | fail |  |
| p-macro-ip6-novalid | 7.1/22 | fail |  |
| p-macro-ip6-valid | 7.1/22 | fail |  |
| p-macro-multiple | 7.1/22 | pass or softfail |  |
| upper-macro | 7.1/26 | fail |  |
| hello-macro | 7.1/6 | pass |  |
| invalid-hello-macro | 7.1/2 | fail |  |
| hello-domain-literal | 7.1/2 | fail |  |
| require-valid-helo | 7.1/6 | fail |  |
| macro-reverse-split-on-dash | 7.1/15, 7.1/16, 7.1/17, 7.1/18 | pass |  |
| macro-multiple-delimiters | 7.1/15, 7.1/16 | pass |  |

### Processing limits

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| redirect-loop | 4.6.4/1 | permerror |  |
| include-loop | 4.6.4/1 | permerror |  |
| mx-limit | 4.6.4/2 | permerror |  |
| ptr-limit | 4.6.4/3 | neutral or pass |  |
| false-a-limit | 4.6.4 | pass |  |
| mech-at-limit | 4.6.4/1 | pass |  |
| mech-over-limit | 4.6.4/1 | permerror |  |
| include-at-limit | 4.6.4/1 | pass |  |
| include-over-limit | 4.6.4/1 | permerror |  |
| void-at-limit | 4.6.4/7 | neutral |  |
| void-over-limit | 4.6.4/7 | permerror |  |

### Test cases from implementation bugs

| Upstream test | Spec | Expected | Notes |
| --- | --- | --- | --- |
| bytes-bug | 5.4/4 | pass | The suite's `strict: 2` is a pyspf setting and does not apply. |
| cname-aliasing | 3.2/1 | fail |  |

## mailauth

Tests in `check.conformance.ts` unless the row says otherwise.

### rfc-suite-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| SPF Suite (strict mode), every test | `rfc7208.conformance.ts` | |
| SPF Suite (default mode), every test | `rfc7208.conformance.ts` | We have one mode. The seven tests whose default-mode result differs (`bare-ip6`, `exp-syntax-error`, `exp-twice`, `exp-only-macro-char`, `invalid-hello-macro`, `hello-domain-literal`, `require-valid-helo`) expect the RFC result. |

### spf-verify-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Should pass all IPs | `spf-verify-test.js > passes all IPs` | |
| Should fail all IPs | `spf-verify-test.js > fails all IPs` | |
| Should pass A records | `spf-verify-test.js > passes A records` | |
| Should pass MX records | `spf-verify-test.js > passes MX records` | |
| Should pass MX/CIDR records | `spf-verify-test.js > passes MX records with a CIDR length` | |
| Should pass exists rule | `spf-verify-test.js > passes an exists rule with macros` | |
| Should expand macros in MX mechanism | `spf-verify-test.js > expands macros in the mx mechanism` | |
| Should not count IPv4-only MX hosts as void when checking IPv6 client | `spf-verify-test.js > does not count IPv4-only MX hosts as void lookups for an IPv6 client` | |
| Should not count IPv6-only MX hosts as void when checking IPv4 client | `spf-verify-test.js > does not count IPv6-only MX hosts as void lookups for an IPv4 client` | |
| Should not count IPv4-only A records as void when checking IPv6 client | `spf-verify-test.js > counts an a term with no record of the client family as a void lookup` | Different on purpose: RFC 7208 counts the empty AAAA answer, so three such terms give permerror, as in mailauth's strict mode. |
| Should match IPv6 client with dual-stack MX host | `spf-verify-test.js > matches a client of either family with a dual-stack MX host` | |
| Should match IPv4 client with dual-stack MX host | `spf-verify-test.js > matches a client of either family with a dual-stack MX host` | |
| Should count as void only when both A and AAAA are missing | `spf-verify-test.js > matches a host with an AAAA record after a host with only an A record` | The upstream test asserts only the pass, which we give too. We count the first term as void. |
| Should throw ETIMEOUT error when A query times out (with AAAA void) | `spf-verify-test.js > gives temperror when the lookup for the client family times out` | We return temperror instead of throwing. |
| Should throw ETIMEOUT error when AAAA query times out (with A void) | `spf-verify-test.js > gives temperror when the lookup for the client family times out` | |
| Should ignore A query EREFUSED error when AAAA has records (IPv6 client) | `spf-verify-test.js > ignores an error for the other address family of an MX host` | We never query the other family. |
| Should ignore AAAA query EREFUSED error when A has records (IPv4 client) | `spf-verify-test.js > ignores an error for the other address family of an MX host` | |
| Should handle both A and AAAA timing out | `spf-verify-test.js > gives temperror when both families time out` | |
| Should expand %{d} to the included domain in nested includes | `spf-verify-test.js > expands %{d} to the included domain in nested includes` | |
| Should keep %{o} on the sender domain in nested includes | `spf-verify-test.js > keeps %{o} on the sender domain in nested includes` | |
| Should expand %{d} to the redirect target domain after a redirect | `spf-verify-test.js > expands %{d} to the redirect target` | |

### macro-test.js

The macro function is private, so these tests read the expanded name from the `exists` query the check sends, or from the explanation.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Should render macro values | `macro-test.js > renders macro values`, `macro-test.js > renders %{i} of an IPv6 client as nibbles` | |
| Should expand %{d} using the currently evaluated domain, not the sender domain | `macro-test.js > expands %{d} to the domain being evaluated and %{o} to the sender domain` | |
| Should split on exactly the listed delimiters, in any order | `macro-test.js > splits on exactly the listed delimiters, in any order` | |
| Should evaluate a record with "-" between two other delimiters | `macro-test.js > evaluates a record with "-" between two other delimiters` | |
| Should read every digit of the transformer | `macro-test.js > reads every digit of the transformer` | |
| Should URL escape a byte below 0x10 with two hex digits | `macro-test.js > URL-escapes a byte below 0x10 with two hex digits` | |
| Should take the domain of a sender with an empty local-part | `macro-test.js > takes the domain of a sender with an empty local-part, and postmaster as its local-part` | mailauth's macro function expands `%{l}` to `''` here, but its check substitutes `postmaster` first, as RFC 7208 section 4.3 says. So do we. |
| Should expand %{t} to the current time in seconds | `macro-test.js > expands %{t} to the current time in seconds` | |

### limited-resolver-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Should allow up to 10 DNS lookups | `limited-resolver-test.js > allows 10 DNS-querying terms, not counting the first TXT lookup` | |
| Should return permerror when exceeding 10 DNS lookups | `limited-resolver-test.js > gives permerror for the 11th DNS-querying term` | |
| Should report lookup count and limit in result | `limited-resolver-test.js > reports the lookup count` | The limit is fixed at 10, so it isn't reported. |
| Should support custom maxResolveCount | skipped | No option for other limits. The RFC fixes them, and a receiver that raises them accepts records other receivers reject. |
| Should count ENOTFOUND as void lookup | `limited-resolver-test.js > counts ENOTFOUND and ENODATA as void lookups` | |
| Should count ENODATA as void lookup | `limited-resolver-test.js > counts ENOTFOUND and ENODATA as void lookups` | |
| Should return permerror when exceeding void lookup limit | `limited-resolver-test.js > gives permerror for the third void lookup` | |
| Should support custom maxVoidCount | skipped | No option for other limits. See `maxResolveCount`. |
| Should return temperror for ETIMEOUT | `limited-resolver-test.js > gives temperror for ETIMEOUT and EREFUSED in an include` | |
| Should return temperror for EREFUSED | `limited-resolver-test.js > gives temperror for ETIMEOUT and EREFUSED in an include` | |
| Should return permerror for invalid domain | `limited-resolver-test.js > gives none for an invalid sender domain` | The upstream test name says permerror, but it asserts none. |
| Should track subquery counts | skipped | Tests mailauth's per-mechanism lookup report, which we don't have. MX and PTR address lookups don't count toward either limit. |
| Should handle various domain formats | `Spf.check > returns the result with the matching term, the record and the lookup counts` | The upstream test checks one plain `a` term. |
| Should not count initial TXT lookup toward limit | `limited-resolver-test.js > allows 10 DNS-querying terms, not counting the first TXT lookup` | |

### dual-stack-resolver-test.js

mailauth queries A and AAAA together and uses the other family to decide whether a lookup was void. We query only the client's family, as RFC 7208 section 5.3 says, so the tests below assert the same results through `Spf.check`.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Should return only A records for IPv4 client | `dual-stack-resolver-test.js > matches an IPv4 client against A records only` | |
| Should not match IPv4 client against AAAA records | `dual-stack-resolver-test.js > matches an IPv4 client against A records only` | |
| Should ignore AAAA errors when A has records (IPv4 client) | `dual-stack-resolver-test.js > ignores errors and empty answers for the other family` | |
| Should ignore AAAA ENODATA when A has records | `dual-stack-resolver-test.js > ignores errors and empty answers for the other family` | |
| Should return only AAAA records for IPv6 client | `dual-stack-resolver-test.js > matches an IPv6 client against AAAA records only` | |
| Should not match IPv6 client against A records | `dual-stack-resolver-test.js > matches an IPv6 client against AAAA records only` | |
| Should ignore A errors when AAAA has records (IPv6 client) | `dual-stack-resolver-test.js > ignores errors and empty answers for the other family` | |
| Should ignore A ENODATA when AAAA has records | `dual-stack-resolver-test.js > ignores errors and empty answers for the other family` | |
| Should handle single host with both A and AAAA empty | `dual-stack-resolver-test.js > fails for a host with no addresses` | |
| Should propagate A timeout error for IPv4 client when both error | `spf-verify-test.js > gives temperror when both families time out` | |
| Should propagate AAAA timeout error for IPv6 client when both error | `dual-stack-resolver-test.js > gives temperror for an error in the client family even when the other is void` | |
| Should propagate A error for IPv4 client even when AAAA is void | `dual-stack-resolver-test.js > gives temperror for an error in the client family even when the other is void` | |
| Should propagate AAAA error for IPv6 client even when A is void | `dual-stack-resolver-test.js > gives temperror for an error in the client family even when the other is void` | |
| Should handle multiple hosts returning empty arrays | `dual-stack-resolver-test.js > fails for a host with no addresses` | |
| Should handle IPv4 client with IPv4-only MX hosts | `dual-stack-resolver-test.js > handles MX hosts of one family` | |
| Should handle IPv6 client with IPv6-only MX hosts | `dual-stack-resolver-test.js > handles MX hosts of one family` | |
| Should handle MX hosts with A records for IPv6 client | `dual-stack-resolver-test.js > handles MX hosts of one family` | |

### rfc-compliance-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| DNS errors inside include and redirect: permerror for an include target the resolver rejects as a bad name | `... > gives permerror for an include target the resolver rejects as a bad name` | |
| permerror for an include target with a label over 63 characters | `... > gives permerror for an include target with a label over 63 characters` | |
| temperror for each of ESERVFAIL, ECONNREFUSED, EBADRESP, ENOTIMP, ECANCELLED on an include target, a blocklist include, a redirect target and in an included record (20 tests) | `... > gives temperror for <code> on an include target` and the three tests after it, for each code | |
| Should keep the existing comment text for a top level DNS error | `... > names the failed lookup for a top-level DNS error` | We have `reason` instead of mailauth's comment. |
| Should propagate DNS errors from include in spfVerify without a limited resolver | skipped | Tests mailauth's internal `spfVerify`. The include cases above cover the behavior. |
| Should return temperror for a real SERVFAIL response from node:dns | `check.oracle.test.ts > gives temperror for a SERVFAIL from node:dns, as mailauth does` | Node only, because it runs a UDP server. |
| ptr lookup counting (6 tests) | `ptr lookup counting (RFC 7208 4.6.4)`, one test each | The `%{p}` test uses `a` terms, whose non-matching answers are not void. mailauth's fake resolver answers `exists` with an empty array and doesn't count it as void, but RFC 7208 does. |
| %{p} macro: "unknown" without a validated name, prefers a subdomain, skips a name that doesn't validate | `%{p} macro (RFC 7208 7.3)`, one test each | |
| Should render "unknown" in macro() without a validated name | `%{p} macro (RFC 7208 7.3) > expands to "unknown" when there is no validated name` | |
| Syntax validation: 16 invalid records | `Syntax validation (RFC 7208 4.6) > gives permerror for "<record>", even after the matching term` | Plus duplicate `redirect=` and a lone `%`. The default-mode half of each upstream test does not apply. |
| Should not add warnings for a valid record | `Syntax validation (RFC 7208 4.6) > accepts a valid record that uses every kind of term` | We have no warnings, only the strict result. |
| Should keep a syntax error before the matching term a permerror in both modes | `Syntax validation (RFC 7208 4.6) > gives permerror for "v=spf1 ip4:192.0.2.1 ip4:192.0.2.300 -all", even after the matching term` | |
| Macro syntax errors: the reason for `%{z}` and `50%` | `Syntax validation (RFC 7208 4.6)` rows for those records | Our `reason` wording differs. |
| Modifiers (4 tests) | `Modifiers (RFC 7208 6)`, one test each | Plus redirect beside `all`, and a redirect target without a record. |
| Trailing dots (8 tests) | `Trailing dots (RFC 7208 7.3)`, one test each | The null MX test also covers an exchange of `''`, as `Dns.create` and Node return it. |
| Fully qualified identities (5 tests) | `Fully qualified identities (RFC 7208 4.3)`, one test each | We don't build a Received-SPF header, so its half of the first test does not apply. |
| PTR DNS errors (4 tests) | `PTR DNS errors (RFC 7208 5.5)`, one test each | |
| Internationalized sender (4 tests) | `Internationalized sender (RFC 8616 4)`, one test each | We follow strict mode. The default mode's "warnings" do not apply. |
| Should truncate names over 253 characters from the left | `Long names (RFC 7208 7.3) > truncates names over 253 characters from the left` | |
| Should not query a name with a label over 63 characters in strict mode | `Invalid names after macro expansion (RFC 7208 4.8) > does not query a name with a label over 63 characters` | |
| Should give permerror for an EBADNAME resolver error in the default mode | `Invalid names after macro expansion (RFC 7208 4.8) > does not match a term whose name the resolver rejects as EBADNAME` | Different on purpose: an invalid name doesn't match, as strict mode does for names it rejects itself. `Dns.create` rejects names that are valid for SPF, such as `%{L}`'s `%2B`, so permerror would fail working records. |
| Uppercase macros (4 tests) | `Uppercase macros (RFC 7208 7.3)`, one test each | "Should keep the lenient transformer handling by default" is covered by the permerror rows for `%{d0}`, `%{d2x}` and `%{dr2}`. |
| Should split the sender at the last "@" | `Quoted local-part with "@" (RFC 5321 4.1.2) > splits the sender at the last "@"` | |
| Client IP address: IPv4-mapped (3), not mapped (3), IPv4-compatible network | `Client IP address (RFC 7208 4.1, 5)`, one test each | Plus `%{c}` formatting. |
| Should return temperror for the client IP (5 values) | `Spf.check > throws a TypeError for an ip that is not an IP address` | Different on purpose: a bad `ip` is a mistake in the call, so it throws. |
| ip4 and ip6 mechanisms (7 tests) | `ip4 and ip6 mechanisms (RFC 7208 5.6)`, one test each | |
| Void lookups: MX hosts, NODATA for the client family, repeated query, below the limit | `Void lookups (RFC 7208 4.6.4)`, one test each | |
| Should use an explicit limit of 0 | skipped | No option for other limits. |
| Record selection (3 tests) | `Record selection (RFC 7208 4.5)`, one test each | Plus case, two records, and non-SPF TXT records. |
| Received-SPF header (4 tests) | skipped | We don't build headers. `@portable/mail-auth` will, from the result. |
| Authentication-Results ptypes (6 tests) | skipped | We don't build headers. `identity` and `domain` say which `smtp.mailfrom` or `smtp.helo` to report. |
| Should return temperror when maxElapsedTime is exceeded | `Spf.check > rejects with the reason and aborts the lookup when the signal aborts before the DNS answers` | Pass `signal: AbortSignal.timeout(ms)`. The check rejects with its `TimeoutError`, which the caller reports as `temperror`, because every package in this repo rejects with `signal.reason` on abort. |
| Should return temperror when a DNS query never completes | `Spf.check > rejects with the reason and aborts the lookup when the signal aborts before the DNS answers` | As above. |
| Should not limit the time by default | `spf-verify-test.js` and others | No signal means no limit. |
| Explanation (13 tests) | `Explanation (RFC 7208 6.2)`, one test each | Plus a test that explanation lookups don't count toward the limits. |

### syntax-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| stripRootDot: Should remove a single trailing dot only | `Fully qualified identities (RFC 7208 4.3)` | Through the check: one trailing dot is removed, `example.test..` gives none. |

## Known upstream issues

From mailauth's issue tracker and from reading its source. Each has a test in `check.conformance.ts > known upstream issues` unless the row says otherwise.

| Issue | What we do |
| --- | --- |
| [#104](https://github.com/postalsys/mailauth/issues/104): IPv6 clients got permerror because MX hosts with only A records counted as void lookups. | Address lookups of MX and PTR names never count as void lookups. |
| mailauth's fix for #104 also stopped counting an `a` term as void when the host has records of the other family. RFC 7208 counts it. | We count it, as mailauth's strict mode does (`known upstream issues > after the mailauth #104 fix, an a term for an IPv6 client counts its empty AAAA answer`). |
| [#100](https://github.com/postalsys/mailauth/issues/100): `mx:%{o}` was queried without expanding the macro. | Every domain-spec is expanded before its lookup. |
| [#33](https://github.com/postalsys/mailauth/issues/33): upper-case MX host names gave permerror. | Names are compared without case. |
| [#7](https://github.com/postalsys/mailauth/issues/7): a non-SPF TXT record with a line break gave permerror. | Only the selected `v=spf1` record is checked for characters. |
| [#125](https://github.com/postalsys/mailauth/issues/125): `%{d}` in a nested include expanded to the sender domain. | `%{d}` is the domain being evaluated. |
| [#154](https://github.com/postalsys/mailauth/issues/154): a `%{p}` lookup counted as a void lookup. | It counts toward the 10 lookups only. |
| [#155](https://github.com/postalsys/mailauth/issues/155): the explanation was checked for US-ASCII before expansion. | It is checked after expansion. |
| [#157](https://github.com/postalsys/mailauth/issues/157), [#158](https://github.com/postalsys/mailauth/issues/158): limit options and error text. | No limit options. Every error has a `reason` (`Spf.check > reports why the result is none, temperror or permerror`). |
| [#87](https://github.com/postalsys/mailauth/issues/87): a Workers resolver returned TXT records with quotes. | Not ours to fix: the resolver must return each record's strings, as `Dns.create` does. The test shows the strings are joined with nothing between them. |
| [#49](https://github.com/postalsys/mailauth/issues/49): a UDP-only resolver dropped records from truncated answers. | Not ours to fix. `Dns.create` uses DNS-over-HTTPS, which has no truncation. No test. |
| mailauth returns temperror for a missing or invalid client IP. | We throw a `TypeError`, because the caller passed something that isn't an address (`Spf.check > throws a TypeError for an ip that is not an IP address`). |
| mailauth treats a resolver's empty array as a non-void answer. | An empty array is an empty answer, so it counts as void, as `ENODATA` does (`known upstream issues > counts an empty array from the resolver as a void lookup`). |
| mailauth's `EBADNAME` gives permerror in the default mode. | A name the resolver rejects doesn't match (`Invalid names after macro expansion`). |

## Benchmarks

mailauth has no SPF benchmark. `check.bench.ts` evaluates a record with nested includes, ip4 and ip6 ranges, `a`, `mx` and `exists` against mailauth in both modes, with the same fake resolver, and fails if either mode is more than 25% faster.
