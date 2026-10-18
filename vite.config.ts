import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

// Set PW_CHROMIUM_PATH to test against an installed Chromium only, such as /opt/pw-browsers/chromium
// in the cloud dev container, where Playwright's own browsers aren't installed.
const chromiumPath = process.env.PW_CHROMIUM_PATH

// `pnpm bench` sets BENCH_DIST=1 after building, so benchmarks import each package's built `dist/` and
// Node loads it directly. Source run through Vitest pays for a getter on every call between modules.
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

export default defineConfig({
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
        test: {
          name: 'browser',
          benchmark: { include: [] },
          include: [
            'packages/*/{test,src}/**/*.browser.test.ts',
            'packages/*/{test,src}/**/*.conformance.ts',
          ],
          browser: {
            enabled: true,
            provider: playwright(
              chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {},
            ),
            headless: true,
            instances: chromiumPath
              ? [{ browser: 'chromium' }]
              : [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
})
