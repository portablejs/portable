import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';
import plugin from './plugin.js';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('optional-undefined', plugin.rules['optional-undefined'], {
  valid: [
    'type Options = { signal?: AbortSignal | undefined }',
    'type Options = { value?: unknown }',
    'type Options = { signal: AbortSignal }',
  ],
  invalid: [
    {
      code: 'type Options = { signal?: AbortSignal }',
      output: 'type Options = { signal?: AbortSignal | undefined }',
      errors: [{ messageId: 'optionalUndefined' }],
    },
    {
      code: 'type Options = { fetch?: (request: Request) => Promise<Response> }',
      output: 'type Options = { fetch?: ((request: Request) => Promise<Response>) | undefined }',
      errors: [{ messageId: 'optionalUndefined' }],
    },
  ],
});

tester.run('import-extension', plugin.rules['import-extension'], {
  valid: [
    "import { a } from './a.js'",
    "import * as Lines from '@portable/lines'",
    "export * from '../decode.js'",
    "import data from './fixture.json'",
    "const url = import('./image.png?url')",
  ],
  invalid: [
    { code: "import { a } from './a'", errors: [{ messageId: 'importExtension' }] },
    { code: "export { a } from '../a.ts'", errors: [{ messageId: 'importExtension' }] },
    { code: "const a = import('./a')", errors: [{ messageId: 'importExtension' }] },
  ],
});

tester.run('error-kind', plugin.rules['error-kind'], {
  valid: [
    "class MaxBytesError extends Errors.BaseError { static override readonly kind = 'A.MaxBytesError' }",
    "class BaseError extends Error { static readonly kind: string = 'BaseError' }",
    "class InvalidInputError extends BaseError { static override readonly kind = 'InvalidInput' }",
    'class Parser {}',
  ],
  invalid: [
    {
      code: 'class QueryError extends Errors.BaseError {}',
      errors: [{ messageId: 'errorKind' }],
    },
    {
      code: "class QueryError extends Errors.BaseError { static kind = 'Dns.QueryError' }",
      errors: [{ messageId: 'errorKind' }],
    },
    {
      code: "class TempError extends Error { override name = 'Dmarc.TempError' }",
      errors: [{ messageId: 'errorKind' }],
    },
    {
      code: "class QueryError extends Errors.BaseError { static override readonly kind = 'QueryError' }",
      errors: [{ messageId: 'kindFormat' }],
    },
    {
      code: "class QueryError extends Errors.BaseError { static override readonly kind = 'Dns.Query' }",
      errors: [{ messageId: 'kindFormat' }],
    },
    {
      code: 'const QueryError = class QueryError extends Errors.BaseError {}',
      errors: [{ messageId: 'errorKind' }],
    },
  ],
});

tester.run('no-enum', plugin.rules['no-enum'], {
  valid: ["type Mode = 'read' | 'write'"],
  invalid: [{ code: 'enum Mode { Read, Write }', errors: [{ messageId: 'noEnum' }] }],
});

tester.run('no-private-symbol', plugin.rules['no-private-symbol'], {
  valid: ["const brand = Symbol.for('portable.errors.kinds')"],
  invalid: [{ code: "const brand = Symbol('brand')", errors: [{ messageId: 'noPrivateSymbol' }] }],
});
