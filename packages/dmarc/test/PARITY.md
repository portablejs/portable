# Test parity

Upstream suite: the DMARC tests of [mailauth](https://github.com/postalsys/mailauth) 7.3.1 (MIT), `test/dmarc/*.js`, plus the DMARC cases in `test/tools/tools-test.js` (`getAlignment`), `test/tools/rfc-compliance-test.js` (`toALabel`, `isHostNameDomain`) and `test/mailauth-test.js`. No fixtures were copied, because every case builds its own zone.

The ported tests are in `check.conformance.ts`, in a `describe` block named after the upstream file, and run in Node and Chromium. `check.oracle.test.ts` compares the result, the policy, the policy domain and the first aligned SPF and DKIM identifier with mailauth 7.3.0's `dmarc()` in strict mode, on 400 random zones and on U-label From domains. 7.3.1 was published less than a day ago, so `minimumReleaseAge` refuses it. Its DMARC code differs from 7.3.0 only in From header parsing, which this package doesn't do.

mailauth has a default mode that case-folds tag names, uses the last of duplicate tags, and accepts whitespace before `v=DMARC1`. Its `strict: true` mode follows RFC 9989 and RFC 6376's tag-list rules. `check` follows the RFCs, so the oracle runs strict mode, and the ported tests of the default mode expect the strict result.

The input differs from mailauth's. mailauth's `dmarc()` takes the From header's addresses and extracts the Author Domain. `Dmarc.check` takes the domain, so From header parsing belongs to the caller (`@portable/mime-headers`, or `@portable/mail-auth`, which parses the From field). The tests that only parse addresses are listed as not applicable below.

## dmarc-verify-test.js

| Upstream test | Our test |
| --- | --- |
| Basic DMARC lookup > Should return pass when DKIM aligns | dmarc-verify-test.js > Basic DMARC lookup > pass when DKIM aligns |
| Should return pass when SPF aligns | pass when SPF aligns |
| Should return fail when neither DKIM nor SPF aligns | fail when neither aligns |
| Should return none when no DMARC record exists | none without a record |
| Should return temperror on DNS failure | temperror on a DNS failure |
| DMARC record parsing > Should parse all common tags | parses the common tags and leaves out pct |
| Should handle minimal DMARC record | a minimal record fails a message with no identifiers |
| Should handle split TXT records | joins the strings of a split TXT record |
| Policy evaluation > Should use p= policy for direct domain | p applies to the domain itself |
| Should use sp= policy for subdomain with org domain record | sp applies to a subdomain |
| Should use p= policy for subdomain when sp= not set | p applies to a subdomain without sp |
| Alignment modes > Should use relaxed DKIM alignment by default | DKIM alignment is relaxed by default |
| Should fail strict DKIM alignment when only the org domain matches | adkim=s fails a signature of the organizational domain |
| Should pass strict DKIM alignment when the signing domain is identical | adkim=s passes an identical signing domain |
| Should pass strict DKIM alignment when the signing domain matches a subdomain author | adkim=s passes an identical subdomain with its own record |
| Should fail strict DKIM alignment for different org domain | adkim=s fails another organizational domain |
| Should use relaxed SPF alignment by default | SPF alignment is relaxed by default |
| Should fail strict SPF alignment when only the org domain matches | aspf=s fails the organizational domain |
| Should pass strict SPF alignment when the SPF domain is identical | aspf=s passes an identical domain |
| Should pass when SPF aligns relaxed even though DKIM strict fails | relaxed SPF passes while strict DKIM fails |
| Organizational domain fallback > Should fallback to org domain when subdomain has no record | a subdomain without a record uses the organizational domain |
| Should not fallback when subdomain has its own record | a subdomain with its own record uses it |
| Edge cases > Should handle headerFrom without @ symbol | Not applicable: the input is always a domain. |
| Should handle headerFrom array with single element | Not applicable: no From header parsing. |
| Should evaluate several From addresses in the same domain | several From addresses in one domain: the caller passes the domain once (case and trailing dot) |
| Should return false for From addresses in different domains | Not applicable: the caller decides what to do with several Author Domains (RFC 9989 section 5.3.1). |
| Should handle IDN domains | IDN domains in A-label form |
| Should handle domains with string DKIM/SPF entries | Not applicable: identifiers are `{ result, domain }` objects. |
| Should include ARC result in comment when provided | Not applicable: no Authentication-Results comment. `@portable/mail-auth` adds the ARC result. |
| Should track undersized DKIM signatures | each signature is reported, so a caller can tell an l= signature apart |
| Should return raw record in rr field | the raw record is in record.text |
| Should generate formatted info string | Not applicable: no Authentication-Results text. |
| Reported identifiers > Should report the From domain as header.from, not the org domain | the From domain is reported, and the policy domain separately |
| Should report the author domain as header.d when it publishes its own record | the policy domain is the From domain when it has its own record |
| Should report an undersized DKIM signature even when strict alignment rejects it | each signature is reported, so a caller can tell an l= signature apart |

## dmarc-fixes-test.js

| Upstream test | Our test |
| --- | --- |
| C1 > Should not be fooled by an "@" in a quoted local-part | Not applicable: From address parsing. |
| C1 > Should use the mailbox domain of an obs-route address | Not applicable: From address parsing. |
| C1 > Should apply the policy through authenticate() | Not applicable: `authenticate()` is in `@portable/mail-auth`. |
| H6 > Should evaluate mailboxes that share one domain | Edge cases > several From addresses in one domain |
| H6 > Should report why evaluation is not possible, keeping the false response | Not applicable: several Author Domains are found by the caller. |
| H6 > Should evaluate through authenticate() | Not applicable: `authenticate()`. |
| I3 > Should not query "_dmarc." for an empty domain | I3: no query for an empty domain (the result is `permerror`) |
| F4 > Should fail an identifier that has no parent in common with the author domain | F4: an identifier with no common parent fails when the author walk fails |
| F4 > Should still give temperror for an identifier that could align | F4: an identifier that could align gives temperror when the author walk fails |
| F5 > Should give temperror, not fail, when an identifier is past the limit | F5: an identifier past the limit of 10 tree walks gives temperror, not fail |
| F5 > Should still pass when an identifier within the limit aligns | F5: an identifier within the limit still passes |
| F6 > Should add policy.dmarc with the evaluated policy and keep header.d by default | F6: t=y lowers the policy, and the policy domain is reported |
| F6 > Should leave out header.d in strict mode | Not applicable: no Authentication-Results properties. `policyDomain` is always reported. |
| F6 > Should not add policy.dmarc without a record | F6: no policy and no policy domain without a record |
| F6 > Should not expose the internal properties for BIMI in JSON | Not applicable: the result has no hidden properties. `record` is a documented field. |
| F7 > Should let the last duplicate win by default and warn | F7: a record with a duplicate tag is invalid (strict behavior only) |
| F7 > Should treat a record with a duplicate tag as invalid in strict mode | F7: a record with a duplicate tag is invalid |
| F7 > Should continue the Tree Walk past an invalid record in strict mode | F7: the tree walk continues past a record with a duplicate tag |
| F7 > Should case-fold tag names by default and warn | F7: an upper case tag name is an unknown tag (strict behavior only) |
| F7 > Should treat an upper case tag name as unknown in strict mode | F7: an upper case tag name is an unknown tag |
| F7 > Should not warn for records that strict mode reads the same way | F7: unknown tags and fragments are ignored. There are no warnings. |
| F7 > Should apply strict parsing in getDmarcRecord() | Not applicable: no separate record lookup function. |
| I4 > Should accept TXT records as plain strings from a custom resolver | Not applicable: `Resolver.resolveTxt` returns `string[][]`, which the types enforce. |

## get-dmarc-record-test.js

`getDmarcRecord` isn't exported here. Its cases are checked through `check` and the `record` and `policyDomain` it returns.

| Upstream test | Our test |
| --- | --- |
| DNS resolution > Should resolve DMARC record from _dmarc.domain.com | reads the record at _dmarc.\<domain\> |
| Should return false when no DMARC record exists | no record for ENOTFOUND, ENODATA, EBADNAME or an empty answer |
| Should return false for empty TXT response | same |
| Should return false for ENODATA error | same |
| Should throw on DNS server errors | temperror for a DNS server error |
| Record parsing > Should parse all standard tags | parses every tag (pct and ri are historic and left out) |
| Should handle whitespace around values | allows whitespace around "=" and ";" |
| Should handle split TXT records | dmarc-verify-test.js > joins the strings of a split TXT record |
| Should convert pct to integer | Not applicable: `pct` is historic in RFC 9989 (appendix A.6) and not reported. |
| Should convert ri to integer | Not applicable: `ri` is historic in RFC 9989 and not reported. |
| Should handle invalid pct value as 0 | Not applicable: `pct` isn't reported. |
| Should include raw record in rr field | dmarc-verify-test.js > the raw record is in record.text |
| Should handle tags with no value | ignores a fragment without "=" or without a name |
| Should handle tags starting with equals | same |
| Should lowercase tag names | accepts an upper case version tag name, and F7: an upper case tag name is an unknown tag (strict behavior) |
| Should only accept whitespace before the version tag in the default mode | ignores a record with whitespace before v=DMARC1; trims trailing whitespace from the record |
| Should discard a fragment without "=" instead of letting it override a tag | ignores a fragment without "=" or without a name |
| Org domain fallback > Should fallback to org domain when subdomain has no record | a subdomain falls back to its organizational domain |
| Should not fallback when subdomain has its own record | dmarc-verify-test.js > a subdomain with its own record uses it |
| Should set isOrgRecord to false for direct domain | the policy domain is the From domain when it has its own record |
| Should not query "_dmarc.null" or walk an address | a single label is queried once, and an address literal not at all |
| Should not fallback when org domain equals the domain | dmarc-verify-test.js > none without a record |
| Record validation > Should return false when no v=DMARC1 record | ignores records that are not DMARC records |
| Should return false when multiple DMARC records exist | discards several DMARC records |
| Should accept an upper-case tag name with an exact version value (V=DMARC1) | accepts an upper case version tag name, but not lower case DMARC1 |
| Should reject a version value that is not exactly DMARC1 (v=dmarc1) | same |
| Should filter non-DMARC records from response | picks the DMARC record among other TXT records |
| Domain existence test > Should treat a name with a dangling CNAME as existing | a dangling CNAME exists |
| Should query the CNAME after an NXDOMAIN and keep it when there is none | a name without an A record or a CNAME does not exist |
| Should keep the NXDOMAIN when a resolver has no answer for CNAME | Not applicable: `resolveCname` returns `string[]`, which the types enforce. |
| Should pass a failed CNAME query on to the caller | a failed CNAME query gives temperror for a failing message |

## rfc9989-compliance-test.js

| Upstream test | Our test |
| --- | --- |
| passes on identical strict alignment (adkim=s) | dmarc-verify-test.js > adkim=s passes an identical signing domain |
| passes on relaxed organizational-domain alignment via the org record | dmarc-verify-test.js > DKIM alignment is relaxed by default |
| returns none when no DMARC record exists | dmarc-verify-test.js > none without a record |
| discards the record set when multiple DMARC records are published | get-dmarc-record-test.js > discards several DMARC records |
| discards a multi-record set at the author domain and continues the walk | discards a set of several records at the From domain and keeps walking |
| continues to the org domain when the author domain publishes only non-DMARC TXT records | continues past TXT records that are not DMARC records |
| joins split (chunked) TXT records | dmarc-verify-test.js > joins the strings of a split TXT record |
| does not let pct change the pass/fail outcome | pct does not change the result |
| B.4.1: org domain and alignment for a simple hierarchy | B.4.1 and B.4.2: alignment in a simple and in a deep hierarchy |
| B.4.2: org domain for a deep author name resolves to example.com | same |
| #1 uses a record published at an intermediate label marked psd=n as the org domain | a record with psd=n is the organizational domain |
| #1 walks every label and caps a >8-label author at 8 queries in the exact RFC sequence | a long name is shortened to seven labels after the first query |
| #1 B.4.1: queries the author walk and each differing identifier walk once | B.4.1: walks for the author and for each differing identifier once |
| #1 B.4.2: an identifier walk reuses the names the author walk already queried | B.4.2: an identifier walk reuses the names the author walk queried |
| #1 shortens an author of exactly eight labels by one label and one of nine labels to seven | eight labels lose one label and nine lose two |
| #1 makes the author domain its own org domain when no record is published above it | the From domain is its own organizational domain with no record above it |
| #1 takes the policy of the record with the fewest labels, not an intermediate one | the record with the fewest labels applies, not an intermediate one |
| #1 inherits a policy from a name the Public Suffix List lists as a suffix | a public suffix that publishes a record is an organizational domain |
| #1 lets psd=n on the author record keep a parent from becoming its org domain | psd=n on the From domain stops the walk |
| #1 discards a multi-record set above the author domain and keeps walking | a set of several records above the From domain is discarded |
| #1 does not walk identifiers outside the author org domain | identifiers outside the organizational domain are not walked |
| #1 caps relaxed alignment walks per message and checks SPF before DKIM | SPF is walked before DKIM, within the limit of 10 walks |
| #1 does not query names that can not exist, and treats EBADNAME as no record | names that cannot exist are not queried; EBADNAME is no record; get-dmarc-record-test.js > a single label is queried once, and an address literal not at all |
| #1 ignores a trailing root dot on the author domain and identifiers | a trailing root dot is ignored on the From domain and identifiers |
| DNS failures > returns temperror when the policy can not be discovered | temperror when the policy cannot be discovered |
| keeps the author record when the walk above it fails and an identical identifier aligns | the From domain record applies when the walk above it fails |
| returns temperror with the policy when the walk above the author fails and only a differing identifier could align | same |
| returns temperror when an identifier walk fails and nothing else aligns | temperror when an identifier walk fails and nothing else aligns |
| passes when an identifier walk fails but another identifier aligns | pass when an identifier walk fails but another identifier aligns |
| does not turn a strict alignment failure into a temperror | strict alignment does not walk, so it fails instead of temperror |
| #3 applies np for a non-existent (NXDOMAIN) author subdomain | np applies to a subdomain that does not exist |
| #3 applies sp (not np) for an existing author subdomain | sp applies to a subdomain with an A record |
| #3 treats a name with any RR (NODATA on TXT) as existing | a name with other records exists |
| #3 treats a subdomain with a dangling CNAME as existing and applies sp | get-dmarc-record-test.js > a dangling CNAME exists |
| #3 does not apply np to the org domain itself and skips the existence query | np does not apply to the organizational domain, which is not queried |
| #3 does not query for existence when the record has no np | no existence query without np |
| #3 falls back to p for a non-existent subdomain without sp | p applies to an existing subdomain without sp |
| #3 applies a PSD np to a non-existent registration below it | a public suffix np applies to a name registered below it |
| #3 treats a name that can not exist as non-existent without querying it | a name that cannot exist does not exist, without a query |
| #3 passes an aligned message when the existence query fails | an aligned message passes when the existence query fails |
| #3 returns temperror for a failing message when the existence query fails | a failing message gives temperror when the existence query fails |
| #3 returns temperror for a failing message when the CNAME query after an NXDOMAIN fails | get-dmarc-record-test.js > a failed CNAME query gives temperror for a failing message |
| #3 ignores a failed existence query when np and sp are the same policy | a failed existence query does not matter when np and sp agree |
| #4 B.4.3: psd=y stops the walk and the org domain is one label below the PSD | B.4.3: psd=y stops the walk, and the organizational domain is one label below |
| #4 PSD policy is not used when the org domain publishes its own record | a public suffix policy is not used when the organizational domain has a record |
| #4 applies the PSD policy, with sp, when the org domain publishes no record | the public suffix policy applies, with sp, when the organizational domain has none |
| #4 does not align two registrants below the same PSD | two registrants below one public suffix do not align |
| #4 treats a PSD sending as itself as its own org domain | a public suffix sending as itself is its own organizational domain |
| #5 t=y downgrades reject to quarantine for a failing message | t=y lowers reject to quarantine and quarantine to none |
| #5 t=y downgrades quarantine to none for a failing message | same |
| #5 t=y keeps the published p and sp and reports testMode | t=y keeps the published tags |
| #5 t=n and an invalid t value apply the policy as published | t=n and an invalid t apply the policy as published |
| #6 does not expose a pct property on the result | dmarc-verify-test.js > parses the common tags and leaves out pct |
| #7 treats a record with no p but a valid rua as p=none | no p and a valid rua act as p=none |
| #7 applies no DMARC processing for a record with no p and no rua | no p and no rua mean no DMARC processing |
| #7 treats an invalid p with a valid rua as p=none, keeping other tags | an invalid p with a valid rua acts as p=none and keeps the other tags |
| #7 treats a valid p with an invalid sp or np as p=none when rua is valid | an invalid sp or np with a valid rua acts as p=none |
| #7 accepts any syntactically valid URI in rua, including an empty mailto: | any syntactically valid URI in rua counts |
| #7 applies no DMARC processing when rua has no syntactically valid URI | a rua without a valid URI means no DMARC processing |
| #7 does not continue the walk past an author record without a valid policy | the walk stops at a From domain record without a valid policy |
| #8 ignores a record whose version is not exactly DMARC1 | the version must be exactly DMARC1 |
| #8 ignores a record whose version value has trailing garbage (v=DMARC1x) | same |
| #8 accepts WSP around "=" in the version tag | whitespace around "=" in the version tag is allowed |
| #10 recognizes a policy value regardless of case | policy and alignment values are case-insensitive |
| #10 enforces strict alignment when adkim is upper-case | same |
| #10 allows whitespace around "=" in a tag | whitespace around "=" in a tag is allowed |
| #10 preserves the case of tag values that are not ABNF literals | report URIs keep their case |

## result-types-test.js

| Upstream test | Our test |
| --- | --- |
| Should not mark properties required that a none or temperror result does not have | `tsc` checks the result type, and Dmarc.check > reports why the result is none, temperror or permerror checks the fields those results have. |
| Should cite RFC 9989 for the dmarc ptype properties | Not applicable: a test of mailauth's `index.d.ts` comments. |

## author-domain-test.js and from-header-test.js

Address and header parsing don't apply, because the input is the domain. The domain normalization they test does.

| Upstream test | Our test |
| --- | --- |
| Single address > Should take the domain of a plain addr-spec | Not applicable: address parsing. |
| Should ignore an "@" inside a quoted local-part | Not applicable. |
| Should drop an obsolete source route | Not applicable. |
| Should still see the domain when a quoted string is not terminated | Not applicable. |
| Should return every candidate for an address with several unquoted "@" signs | Not applicable. |
| Should normalize case, trailing dot and U-labels | author-domain-test.js and from-header-test.js > converts U-labels to A-labels, in lower case and NFC; dmarc-verify-test.js > several From addresses in one domain |
| Should keep a domain literal and an "@" inside it | get-dmarc-record-test.js > a single label is queried once, and an address literal not at all |
| Should find no domain in an address without one | dmarc-fixes-test.js > I3: no query for an empty domain; rejects an address, a URL or an empty label instead of a domain |
| Should accept a bare domain, as dmarc() always has | Every test: the input is a bare domain. |
| Header field > every test | Not applicable: header parsing and several From fields. |
| parseFromHeader > every test | Not applicable: header parsing. |
| authenticate() > every test | Not applicable: header parsing in `authenticate()`. |
| dmarc() > Should honor fromSyntax | Not applicable: no `fromSyntax` input. |
| Should not evaluate a domain with a format character | rejects a domain with a control, format or space character, without a query |
| Should not evaluate a domain with a control character or DEL | same |
| Should still accept a U-label and the CONTEXTJ joiners | accepts the CONTEXTJ joiners U+200C and U+200D; converts U-labels to A-labels |

## tools-test.js getAlignment and rfc-compliance-test.js

| Upstream test | Our test |
| --- | --- |
| getAlignment > Should match exact domain / subdomain / org domain in relaxed mode | tools-test.js getAlignment > relaxed: same organizational domain aligns |
| Should match identical domain in strict mode | strict: only the identical domain aligns, ignoring case and a trailing dot |
| Should not match a host against its org domain in strict mode | same |
| Should not match two different hosts of the same org in strict mode | same |
| Should not match unrelated domains in strict mode | dmarc-verify-test.js > adkim=s fails another organizational domain |
| Should match identical domains case-insensitively in strict mode | strict: only the identical domain aligns, ignoring case and a trailing dot |
| Should match a host against its org domain in relaxed mode | relaxed: same organizational domain aligns |
| Should match two different hosts of the same org in relaxed mode | same |
| Should not match unrelated domains in relaxed mode | same |
| Should honor the legacy options object instead of treating it as truthy | Not applicable: the mode comes from the record. |
| Should ignore a trailing root dot in strict mode / relaxed mode | strict: only the identical domain aligns, ignoring case and a trailing dot; rfc9989 > a trailing root dot is ignored |
| Should not align a bare root label with anything | a domain with URL characters never aligns (`.` and empty) |
| Should not read a domain as a URL | a domain with URL characters never aligns |
| Should still compare IDN and underscore domains in relaxed mode | underscore labels align; author-domain-test.js > aligns a U-label identifier with an A-label From domain |
| Should return false when no match | relaxed: same organizational domain aligns |
| Should handle string domain entries / object domain entries | Not applicable: identifiers are `{ result, domain }` objects. |
| Should sort by underSized | Not applicable: every signature's alignment is reported in input order. |
| rfc-compliance-test.js > isHostNameDomain | rejects an address, a URL or an empty label instead of a domain; underscore labels align |
| rfc-compliance-test.js > toALabel and decomposed input | converts U-labels to A-labels, in lower case and NFC |

## mailauth-test.js

| Upstream test | Our test |
| --- | --- |
| Should report an org level signature as aligned under relaxed alignment | mailauth-test.js > a signature of the organizational domain aligns in relaxed mode only |
| Should not report an org level signature as aligned when the domain publishes adkim=s | dmarc-verify-test.js > adkim=s fails a signature of the organizational domain |
| Should not report an org level signature as aligned when the Tree Walk stops at the author domain | without a record above it the From domain is its own organizational domain |
| Should report a signature as aligned when the Tree Walk finds an org domain the Public Suffix List does not | rfc9989 > a public suffix that publishes a record is an organizational domain |
| strict option, header, authserv-id, author domain, trustReceived and ARC tests | Not applicable: DKIM verification and `authenticate()`. |

## Known upstream issues

These cases come from mailauth's issue tracker, read through its GitHub search page, and from comparing its strict and default modes. Each has a test of how `check` handles it.

| Issue | Our behavior | Test |
| --- | --- | --- |
| #74: strict alignment compared organizational domains, so `mail.example.com` aligned with `example.com` under `adkim=s`. Fixed in mailauth. | Strict alignment compares the domains as strings. | dmarc-verify-test.js > adkim=s fails a signature of the organizational domain |
| #60: the `psl` package mailauth used went unmaintained and returned wrong organizational domains. mailauth moved to tldts, then to the tree walk. | The tree walk is the default, and a caller who wants a public suffix list passes its function as `organizationalDomain`. | organizationalDomain option > uses the function instead of the tree walk; check.oracle.test.ts > the organizationalDomain option with tldts matches the tree walk |
| #142: a tag name without `=` overrode a valid tag. Fixed in mailauth. | A fragment without `=` is ignored. | get-dmarc-record-test.js > ignores a fragment without "=" or without a name |
| #143: strict mode accepted whitespace before `v=DMARC1`. Fixed in strict mode, but the default mode still accepts it. | Always rejected (RFC 9989 section 4.10 step 2). | ignores a record with whitespace before v=DMARC1 |
| The default mode uses the last of duplicate tags and case-folds tag names. | A duplicate tag invalidates the record and an upper case tag name is unknown (RFC 6376 section 3.2). | dmarc-fixes-test.js > F7 tests |
| `dmarc()` returns `false`, not a result, for a From domain that isn't a domain name. | `permerror` with a `reason`, so the caller always gets a result. | I3: no query for an empty domain; rejects a domain with a control, format or space character |
| mailauth walks above the From domain on every message with a record, even when every identifier is identical to the From domain, which costs a `_dmarc.<tld>` query. RFC 9989 section 4.10.2 says that walk isn't needed. | The walk runs only when a relaxed alignment check needs it. | known upstream issues > no tree walk above the From domain when every identifier is identical to it |
| mailauth queries whether the From domain exists whenever the record has `np`, even when `np` equals the policy that applies anyway. | No query in that case. | known upstream issues > no existence query when np is the policy that applies anyway |
