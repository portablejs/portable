import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { apiReports, reportPath } from '../../../scripts/api-report.js';

const root = join(import.meta.dirname, '../../..');

// Each package's api.md lists the declarations its entry points export, so a pull request's diff
// shows every change to the public API. This test fails when a report doesn't match the source.

test('every api.md matches the exports', () => {
  const stale: string[] = [];
  for (const [name, text] of apiReports()) {
    const path = reportPath(name);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      stale.push(relative(root, path));
    }
  }
  expect(stale, 'Run `pnpm api` to rewrite these reports.').toEqual([]);
});
