import * as Spf from '@portable/spf'
import { describe, expect, test } from 'vite-plus/test'
import { rfc7208, type SuiteTest, zoneResolver } from './utils.js'

const scenarios = new Map<string, SuiteTest[]>()
for (const suiteTest of rfc7208) {
  scenarios.set(suiteTest.scenario, [...(scenarios.get(suiteTest.scenario) ?? []), suiteTest])
}

// The suite writes %{i} of an IPv6 client in upper case, RFC 7208's own example in lower case.
const lower = (text: string | undefined) => text?.toLowerCase()

for (const [scenario, tests] of scenarios) {
  describe(`${scenario}`, () => {
    for (const suiteTest of tests) {
      test(`${suiteTest.name} (${suiteTest.spec})`, async () => {
        const result = await Spf.check(
          { ip: suiteTest.host, sender: suiteTest.mailfrom, helo: suiteTest.helo },
          { resolver: zoneResolver(suiteTest.zone) },
        )
        expect(suiteTest.result).toContain(result.result)
        const expected = suiteTest.explanation === 'DEFAULT' ? undefined : suiteTest.explanation
        const explanation = suiteTest.explanation === undefined ? undefined : result.explanation
        expect(lower(explanation)).toBe(lower(expected))
      })
    }
  })
}
