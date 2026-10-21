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
  const reporter: Reporter = {
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
  }
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
    plugins: ['eslint', 'typescript', 'unicorn', 'vitest'],
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ['**/dist/**', '.agents/**', '**/fixtures/**'],
    rules: {
      'no-console': 'error',
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
        files: ['**/*.oracle.test.ts', '**/*.bench.ts', 'vite.config.ts'],
        rules: { 'no-restricted-imports': 'off', 'no-restricted-globals': 'off' },
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
        files: ['packages/*/scripts/**', 'scripts/**'],
        rules: {
          'no-restricted-imports': 'off',
          'no-restricted-globals': 'off',
          'no-console': 'off',
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
