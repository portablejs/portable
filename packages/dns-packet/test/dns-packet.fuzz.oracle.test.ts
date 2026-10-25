import * as upstream from 'dns-packet';
import * as DnsPacket from '@portable/dns-packet';
import { fc, fuzz, mutated, outcome } from '@portable/fuzz';
import { expect, test } from 'vite-plus/test';
import responses from './fixtures/responses.json' with { type: 'json' };
import { canonical, fromUpstream } from './upstream.js';
import { hex } from './utils.js';

const errors = [DnsPacket.TruncatedError, DnsPacket.InvalidInputError, DnsPacket.UnsupportedError];
const corrupted = fc
  .constantFrom(...responses.map((response) => hex(response.hex)))
  .chain((bytes) => mutated(bytes));

test('decode reads a corrupted response as dns-packet does when both accept it', () => {
  fuzz(
    fc.property(corrupted, (bytes) => {
      const ours = outcome(errors, () => DnsPacket.decode(bytes));
      let theirs: unknown;
      try {
        theirs = fromUpstream(upstream.decode(Buffer.from(bytes)));
      } catch {
        return;
      }
      // decode escapes `.`, `\` and bytes that aren't UTF-8 in a label, and reads the top bit of a
      // question's class as mDNS's QU bit. dns-packet does neither, so those packets are left out.
      if (
        !('value' in ours) ||
        JSON.stringify(ours.value).includes('\\\\') ||
        ours.value.questions.some((question) => question.qu)
      ) {
        return;
      }
      expect(canonical(ours.value)).toEqual(theirs);
    }),
    { scale: 10 },
  );
});
