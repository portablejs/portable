import * as Arc from '@portable/arc';
import { describe, expect, test } from 'vite-plus/test';
import signSuite from './fixtures/arc-draft-sign-tests.json' with { type: 'json' };
import validationSuite from './fixtures/arc-draft-validation-tests.json' with { type: 'json' };
import { dnsError, encode } from './utils.js';

// ValiMail's ARC test suite (github.com/ValiMail/arc_test_suite, MIT), as mailauth runs it.

type Records = Record<string, string>;

const suiteResolver = (records: Records): Arc.Resolver => ({
  async resolveTxt(name) {
    const record = records[name.toLowerCase().trim()];
    if (record === undefined) {
      throw dnsError('ENOTFOUND', name);
    }
    // The signing suite's YAML splits the key with line breaks, which a TXT record can't contain.
    return [[record.replaceAll('\n', '')]];
  },
});

const crlf = (text: string): string => text.replace(/\r?\n/g, '\r\n');

// The suite was written against the ARC drafts. Where RFC 8617 says otherwise, these are the RFC
// results, as in mailauth's strict mode.
const rfcResults: Record<string, Arc.Result.Code> = {
  // RFC 8617 section 4.1.2 gives the AMS DKIM-Signature semantics, where h= must not be empty
  // and must include From (RFC 6376 sections 3.5 and 6.1.1).
  ams_fields_h_empty: 'fail',
  // An AMS without c= is simple/simple (RFC 6376 section 3.5), but the drafts used relaxed/relaxed.
  ams_fields_c_na: 'fail',
};

describe('ARC validation suite', () => {
  for (const file of validationSuite) {
    const resolver = suiteResolver(file['txt-records']);
    describe(`${file.description}`, () => {
      for (const [name, data] of Object.entries(
        file.tests as Record<string, { message?: string | undefined; cv?: string | undefined }>,
      )) {
        test(`${name}`, async () => {
          const result = await Arc.verify(crlf(data.message ?? ''), { resolver });
          const expected = rfcResults[name] ?? ((data.cv ?? '').toLowerCase() || 'fail');
          expect(result.result).toBe(expected);
        });
      }
    });
  }
});

type SignCase = {
  message: string;
  t: number;
  'sig-headers': string;
  'srv-id': string;
  AS?: string | undefined;
  AMS?: string | undefined;
  AAR?: string | undefined;
};

const bodyHashTag = (value: string): string =>
  (/(?:^|;)\s*bh=([^;]+)/.exec(value)?.[1] ?? '').replace(/\s+/g, '');

const tagValue = (value: string, tag: string): string | undefined =>
  new RegExp(`(?:^|;)\\s*${tag}=([^;]*)`).exec(value)?.[1]?.replace(/\s+/g, '');

describe('ARC signing suite', () => {
  for (const file of signSuite) {
    const resolver = suiteResolver(file['txt-records']);
    describe(`${file.description}`, () => {
      for (const [name, data] of Object.entries(file.tests as Record<string, SignCase>)) {
        test(`${name}`, async () => {
          const message = crlf(data.message);
          const arc = await Arc.verify(message, { resolver });
          const sealing = {
            domain: file.domain,
            selector: file.sel,
            privateKey: file.privatekey,
            now: new Date(data.t * 1000),
            headers: data['sig-headers'].split(':'),
            authResults: `${data['srv-id']}; arc=${arc.result}`,
            chainValidation: arc.result,
          };
          const fields = await Arc.seal(message, sealing).catch((error: unknown) => error);
          const outcome =
            typeof fields === 'string'
              ? 'sealed'
              : fields instanceof Arc.InvalidInputError && 'refused';
          expect(outcome).toBe(data.AS ? 'sealed' : 'refused');
          if (typeof fields !== 'string') {
            return;
          }
          const ams = /^ARC-Message-Signature:(.*(?:\r\n[ \t].*)*)/im.exec(fields)![1]!;
          const as = /^ARC-Seal:(.*(?:\r\n[ \t].*)*)/im.exec(fields)![1]!;
          expect(bodyHashTag(ams)).toBe(bodyHashTag(data.AMS!));
          expect(tagValue(as, 'cv')).toBe(tagValue(data.AS!, 'cv'));
          expect(tagValue(as, 'i')).toBe(tagValue(data.AS!, 'i'));

          const next = await Arc.verify(encode(fields + message), { resolver });
          expect(next.result).toBe(tagValue(data.AS!, 'cv') === 'fail' ? 'fail' : 'pass');
        });
      }
    });
  }
});
