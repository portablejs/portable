import { defineConfig } from 'vite-plus'
import type { Plugin } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'
import type { Reporter, Vitest } from 'vite-plus/test/node'

// Set PW_CHROMIUM_PATH to test against an installed Chromium only, such as
// /opt/pw-browsers/chromium in the cloud dev container, where Playwright's own browsers aren't
// installed.
const chromiumPath = process.env.PW_CHROMIUM_PATH

// `pnpm bench` sets BENCH_DIST=1 after building, so benchmarks import each package's built `dist/`
// and Node loads it directly. Vitest wraps every call between source modules in a getter.
const benchDist = process.env.BENCH_DIST === '1'
const src = benchDist ? [] : ['src']

const nodeBuiltins = [
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'dns',
  'events',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'string_decoder',
  'tls',
  'url',
  'util',
  'zlib',
]

// When a browser stops running a page's JavaScript, as WebKit does when a collection deadlocks, no
// timer on the page fires and the run waits forever. The watchdog exits when browser tests report
// nothing for 4 minutes, so a CI job fails with the stuck file's name before its time limit.
function watchdog(idle = 240_000): Plugin {
  let vitest: Vitest
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = 0
  const arm = () => {
    clearTimeout(timer)
    if (running === 0) return
    timer = setTimeout(() => {
      const stuck = vitest.state
        .getTestModules()
        .filter((module) => module.project.config.browser.enabled && module.state() === 'pending')
        .map((module) => `  ${module.project.name}: ${module.moduleId}`)
      vitest.logger.error(
        `Browser tests reported nothing for ${idle / 1000} s, so the run stops. Running:\n${stuck.join('\n')}`,
      )
      process.exit(1)
    }, idle)
  }
  const reporter = {
    onTestModuleStart(module) {
      if (!module.project.config.browser.enabled) return
      running++
      arm()
    },
    onTestModuleEnd(module) {
      if (!module.project.config.browser.enabled) return
      running--
      arm()
    },
    onTestCaseReady: arm,
    onTestCaseResult: arm,
    onHookStart: arm,
    onHookEnd: arm,
    onTestRunEnd: () => clearTimeout(timer),
  } satisfies Reporter
  return {
    name: 'portable:watchdog',
    configureVitest(context) {
      vitest = context.vitest
      if (!vitest.config.reporters.includes(reporter)) vitest.config.reporters.push(reporter)
    },
  }
}

export default defineConfig({
  // Exposes FUZZ_RUNS, FUZZ_SEED and FUZZ_PATH to tests as import.meta.env in Node and browsers.
  envPrefix: ['VITE_', 'FUZZ_'],
  fmt: {
    singleQuote: true,
    semi: false,
    trailingComma: 'all',
    printWidth: 100,
    ignorePatterns: [
      '**/*.md',
      '**/package.json',
      '**/CHANGELOG.md',
      '.agents/**',
      '**/fixtures/**',
    ],
  },
  lint: {
    plugins: ['eslint', 'typescript', 'unicorn', 'vitest', 'import', 'jsdoc', 'oxc'],
    categories: { suspicious: 'error', perf: 'error' },
    jsPlugins: ['./tools/lint/src/plugin.ts'],
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ['**/dist/**', '.agents/**', '**/fixtures/**'],
    rules: {
      'no-console': 'error',
      'portable/error-kind': 'error',
      'portable/import-extension': 'error',
      'portable/no-enum': 'error',
      'portable/no-private-symbol': 'error',
      'portable/optional-undefined': 'error',
      'portable/prefer-satisfies': 'error',
      'portable/type-parameter-name': 'error',
      // Turned off from the suspicious and perf categories. Streams and retries await in a loop on
      // purpose, and the other rules report a style the code uses everywhere.
      'eslint/no-await-in-loop': 'off',
      'eslint/no-shadow': 'off',
      'eslint/no-underscore-dangle': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'typescript/no-unsafe-type-assertion': 'off',
      // toSorted and toReversed are ES2023, newer than package code targets.
      'unicorn/no-array-sort': 'off',
      'unicorn/no-array-reverse': 'off',
      // Default imports of CommonJS libraries in oracle tests and benchmarks.
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      // A loop condition that a callback changes, early `return` in a void function, MessagePort's
      // postMessage without an origin, and String() on input typed string but unchecked at run time.
      'eslint/no-unmodified-loop-condition': 'off',
      'typescript/consistent-return': 'off',
      'unicorn/require-post-message-target-origin': 'off',
      'typescript/no-unnecessary-type-conversion': 'off',
      // JSON encoding tells boxed primitives (new Number(1)) apart with instanceof.
      'unicorn/no-instanceof-builtins': 'off',
      // Its fix turns a test title `${name}` into `name`, which vitest/valid-title then rejects.
      'typescript/no-unnecessary-template-expression': 'off',
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-duplicates': 'error',
      'import/no-default-export': 'error',
      'typescript/consistent-type-definitions': ['error', 'type'],
      'typescript/array-type': ['error', { default: 'array' }],
      'typescript/no-unnecessary-type-assertion': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/empty-tags': 'error',
      'jsdoc/no-defaults': 'error',
      'jsdoc/require-param-name': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'ReadableStream',
          property: 'from',
          message: 'Some supported browsers lack ReadableStream.from. Use Streams.fromIterable.',
        },
        {
          object: 'URL',
          property: 'parse',
          message: 'Safari 17 lacks URL.parse. Call new URL in a try block.',
        },
      ],
      // `fuzz` from @portable/fuzz asserts a property, like `expect`.
      'vitest/expect-expect': ['warn', { assertFunctionNames: ['expect', 'expect*', 'fuzz'] }],
      'no-irregular-whitespace': [
        'error',
        { skipStrings: false, skipRegExps: false, skipTemplates: false },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'portable packages use web-standard APIs only.' },
            {
              group: ['**/exports/*'],
              message: 'Import the source module. A file in src/exports is only a package entry.',
            },
          ],
          paths: nodeBuiltins.map((name) => ({
            name,
            message: 'portable packages use web-standard APIs only.',
          })),
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Buffer', message: 'Use Uint8Array.' },
        { name: 'process', message: 'Not available in every runtime.' },
        { name: 'global', message: 'Use globalThis.' },
        { name: 'require', message: 'ESM only.' },
        { name: '__dirname', message: 'Use import.meta.url.' },
        { name: 'window', message: 'Not available in every runtime.' },
        { name: 'document', message: 'Not available in every runtime.' },
        { name: 'navigator', message: 'Not available in every runtime.' },
        { name: 'localStorage', message: 'Not available in every runtime.' },
      ],
    },
    overrides: [
      {
        files: [
          '**/*.oracle.test.ts',
          '**/*.bench.ts',
          'vite.config.ts',
          'tools/lint/src/publicApi.test.ts',
        ],
        rules: { 'no-restricted-imports': 'off', 'no-restricted-globals': 'off' },
      },
      {
        files: ['vite.config.ts', 'tools/lint/src/plugin.ts'],
        rules: { 'import/no-default-export': 'off' },
      },
      {
        // Tests build fakes and measure constructors, so these patterns are deliberate there.
        files: ['packages/*/test/**', 'tools/*/src/**'],
        rules: {
          'eslint/no-new': 'off',
          'eslint/no-extend-native': 'off',
          'oxc/no-map-spread': 'off',
          'typescript/no-extraneous-class': 'off',
          'unicorn/no-array-fill-with-reference-type': 'off',
          'unicorn/prefer-add-event-listener': 'off',
          'jsdoc/require-yields': 'off',
          // These rules check the API a package publishes, not test helpers and fixtures.
          'portable/error-kind': 'off',
          'portable/no-private-symbol': 'off',
        },
      },
      {
        // The worker harness declares one test for each test it collects from the worker.
        files: ['tools/worker/src/*.browser.test.ts'],
        rules: {
          'vitest/expect-expect': 'off',
          'vitest/no-conditional-tests': 'off',
          'vitest/valid-title': 'off',
        },
      },
      {
        files: ['packages/*/scripts/**', 'scripts/**', 'tools/workers/src/run.ts'],
        rules: {
          'no-restricted-imports': 'off',
          'no-restricted-globals': 'off',
          'no-console': 'off',
          // Node runs these files directly, so their imports name the `.ts` file.
          'portable/import-extension': 'off',
          // readJson<value>() types a parsed file for its caller.
          'typescript/no-unnecessary-type-parameters': 'off',
        },
      },
    ],
  },
  // `src` resolves workspace packages to their TypeScript source, so tests need no build.
  resolve: { conditions: [...src, 'module', 'browser', 'development|production'] },
  ssr: { resolve: { conditions: [...src, 'module', 'node', 'development|production'] } },
  staged: {
    '*.{ts,js,json}': 'vp check --fix',
  },
  test: {
    // Heavy suites (PngSuite, big base64 inputs) take several seconds when other processes load the
    // machine, such as a pre-push hook running every package's tests.
    testTimeout: 30_000,
    // Vitest reruns every test when any package.json changes. Each new package adds one, so the
    // pre-push run of affected tests would otherwise test the whole repo.
    forceRerunTriggers: ['**/{vitest,vite}.config.*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.conformance.ts', '**/*.bench.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          server: { deps: { external: benchDist ? [/\/packages\/[^/]+\/dist\//] : [] } },
          benchmark: {
            include: ['packages/*/test/**/*.bench.ts', 'packages/*/src/**/*.bench.ts'],
          },
          include: [
            'packages/*/{test,src}/**/*.test.ts',
            'tools/lint/src/*.test.ts',
            'packages/*/{test,src}/**/*.conformance.ts',
            '!packages/*/{test,src}/**/*.browser.test.ts',
          ],
        },
      },
      {
        extends: true,
        // Only the worker harness imports this entry. Without it here, Vite finds it during the run
        // and reloads the page, and the browser test files that hadn't started yet fail to start.
        optimizeDeps: { include: ['vite-plus/test/internal/browser'] },
        plugins: [watchdog()],
        test: {
          name: 'browser',
          // rpc's window tests load a cross-origin iframe from whichever of `localhost` and
          // 127.0.0.1 the page isn't on. With Vite's default host, the page was on `localhost` and
          // the iframe at 127.0.0.1 never loaded on GitHub's runners.
          api: { host: '127.0.0.1' },
          benchmark: { include: [] },
          include: [
            'packages/*/{test,src}/**/*.browser.test.ts',
            'packages/*/{test,src}/**/*.conformance.ts',
            'tools/*/src/**/*.browser.test.ts',
          ],
          browser: {
            enabled: true,
            provider: playwright(
              chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {},
            ),
            headless: true,
            instances: chromiumPath
              ? [{ browser: 'chromium' }]
              : [
                  { browser: 'chromium' },
                  { browser: 'firefox' },
                  {
                    browser: 'webkit',
                    // When a worker deadlocks in garbage collection (see
                    // tools/worker/src/conformance.browser.test.ts), the JIT threads it paused and
                    // the marking helper threads it uses stay blocked. WebKit shares both sets of
                    // threads between the page and every worker, so the page stopped at its next
                    // collection, or later workers never exited and the page grew past WebKit's
                    // 8 GB limit. These options start neither set, so only the deadlocked worker
                    // stops.
                    provider: playwright({
                      launchOptions: {
                        env: {
                          ...process.env,
                          JSC_useConcurrentJIT: 'false',
                          JSC_numberOfGCMarkers: '1',
                        },
                      },
                    }),
                  },
                ],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
})
