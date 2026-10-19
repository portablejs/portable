# Parity with mailauth's authenticate

Upstream: mailauth 7.3.1's [`test/mailauth-test.js`](https://github.com/postalsys/mailauth/blob/master/test/mailauth-test.js), and the cases of `test/arc/` that go through `authenticate`, which `@portable/arc`'s PARITY.md leaves to this package. SPF, DKIM, DMARC and ARC each have their own package and PARITY.md, so this file covers what `authenticate` adds: finding the From domain, running the checks together, Authentication-Results, and sealing.

mailauth has a lenient default mode and a `strict: true` mode. `authenticate` has only RFC behavior, so each case maps to the strict expectation.

`authenticate.oracle.test.ts` runs in Node and checks that:

- on 400 generated messages, with every SPF result, DKIM signatures that pass, fail, use rsa-sha1 or have no key, DMARC records with each policy, alignment mode and `t=y`, ARC chains that pass and fail, and From fields with groups, several domains, several fields or none, `authenticate` gives mailauth's strict result for each method and the same `dmarcSkipReason`, and its Authentication-Results field has the same resinfos and properties once comments are removed;
- chains that alternate between `authenticate` with `seal` and mailauth's `authenticate` with `seal` pass in both, over four hops.

The oracle allows two differences that come from `@portable/dkim`: a key record problem gives `permerror` where mailauth gives `neutral`, and `policy.dkim-rules`, which RFC 8601 doesn't register, isn't written.

## mailauth-test.js

| Upstream | Here |
| --- | --- |
| reports an org level signature as aligned under relaxed alignment | `authenticate.conformance.ts` › "an organizational domain signature aligns under relaxed alignment" |
| not aligned when the domain publishes adkim=s | › "an organizational domain signature does not align when the record has adkim=s". mailauth also rewrites `status.aligned` on the DKIM result; here alignment is in `dmarc.dkim`. |
| not aligned when the Tree Walk stops at the author domain | › "the tree walk stops at the author domain when the parent publishes no record" |
| aligned when the Tree Walk finds an org domain the Public Suffix List does not | › "the tree walk finds an organizational domain the public suffix list would not" |
| strict option: accepts rsa-sha1 by default and marks it | Not applicable: no lenient mode. rsa-sha1 gives `dkim=policy`, in the oracle cases. |
| strict option: passes strict and rejectRsaSha1 to the DKIM verification | The oracle's rsa-sha1 cases: `dkim=policy` and `dmarc=fail`. |
| Authentication-Results above Received-SPF only in strict mode | › "writes only the Authentication-Results field without a seal, and no Received-SPF" |
| reports the AUID and SDID in strict mode | › "reports each method with its properties" |
| keeps every generated line within 998 octets | › "keeps every line within 998 octets and every comment balanced", with the same four senders and HELO name, and `mail-auth.fuzz.conformance.ts` for any From field, sender and HELO name. |
| quotes an mta value that is not a token (lax) | Deliberately different: `authservId` › "throws a RangeError when it is not a token", as mailauth's strict mode does. |
| refuses an mta value that is not a token in strict mode | › "throws a RangeError when it is not a token" |
| keeps a host name mta value as is | › "is written as given when it is a token" |
| evaluates DMARC for the mailbox of a group From (RFC 6854) | `Author domain` › "is the domain of the mailbox in a group (RFC 6854)" |
| says why DMARC was not evaluated | › "DMARC is skipped for …", with the same three From fields and the same reasons, plus an empty group. |
| does not evaluate DMARC for a message with several From fields | › "DMARC is skipped for …" with two From fields: `multiple-from-fields`. |
| still evaluates several mailboxes of one domain in a single From | › "several mailboxes of one domain in one From field are checked" |
| does not take header fields after a leading empty line as the header section | › "DMARC is skipped for …" with a leading CRLF and a leading LF. |
| trustReceived: 30 Received formats, HELO literals, HELO names | Not applicable: there is no `trustReceived`. The SMTP server passes `ip` and `helo`, which it knows for certain, and a Received field is text any earlier hop could have written. |
| ARC sealing: does not add a 51st ARC set | `ARC` › "does not add a 51st ARC set (RFC 8617 section 4.2.1)". The reason is in `sealSkipReason` instead of `arc.sealErrors`. |

## test/arc/ cases that go through authenticate

| Upstream | Here |
| --- | --- |
| arc-rfc-compliance-test.js: seals with an ed25519 key from authenticate() | `ARC` › "seals with an Ed25519 key" |
| arc=none and smtp.remote-ip in strict mode | `Authentication-Results` › "reports each method with its properties" |
| quotes an IPv6 smtp.remote-ip in strict mode | › "quotes an IPv6 smtp.remote-ip", and `ARC` › "reports what the newest sealer recorded in the arc=pass comment" |
| does not change the lax arc= entry | Not applicable: no lenient mode. |
| arc-hardening-test.js: crafted Authentication-Results values (5 cases) | `ARC` › "copies only keywords and host names from a crafted AAR", with the same 5 values and 5 more: a quoted value with a comment after it, a `header.d` with `/`, a comment inside a result, a comment before a value and a stray parenthesis. |
| checks a large authResults without running out of stack | › "reads a large AAR without running out of stack" |
| arc-seal-options-test.js: authenticate() seals a broken chain with cv=fail even if the seal options say cv=pass | › "seals a broken chain with cv=fail and its own results". `seal` has no `cv`, `authResults` or `i`, so the caller can't pass them. |
| authenticate() seals a new message with cv=none | › "seals a new message with cv=none and these results as the ARC-Authentication-Results" |
| seals concurrent messages sharing one seal object | `@portable/arc`'s seal tests. `authenticate` passes a new options object to `Arc.seal` each time. |
| does not seal a broken chain whose newest seal already says cv=fail | › "does not seal a chain whose newest seal says cv=fail, and says why" |

## Known upstream issues

| Issue | Here |
| --- | --- |
| In the default mode, an authserv-id that isn't a token is written as a quoted string, which readers that split on `;` misread. | `authservId` must be a token. |
| Crafted keys in the sealer's ARC-Authentication-Results were copied into the `arc=pass` comment as `[object Object]`, or threw on keys such as `toString` (fixed in [7eb9ea2](https://github.com/postalsys/mailauth/commit/7eb9ea24ed19032b63e9f9993971b77b8d77109e)). | The AAR is read into a `Map`, and only keywords and host names are copied: the "crafted AAR" cases. |
| A sender, HELO name or From field longer than 998 octets produced longer lines, and an unbalanced parenthesis in a comment could hide the results after it. | The 998-octet test and the fuzz test. |
| A prepended second From field borrowed the DMARC result of the signed one. | `multiple-from-fields`. |
| [#160](https://github.com/postalsys/mailauth/issues/160): `authenticate` sealed with the `cv` and `authResults` from the caller's seal options instead of the chain's result and its own. | `seal` takes neither: › "seals a broken chain with cv=fail and its own results". |
