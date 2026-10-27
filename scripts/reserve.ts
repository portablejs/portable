/// <reference types="node" />
// Publishes a 0.0.0 placeholder of each package that isn't on npm yet, then adds the trusted publisher that lets
// changesets.yml publish it. npm can only add a trusted publisher to a package that already exists, so a new package
// needs this once before its first release. Run `npm login` first. Pass package names to reserve only those.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const names = process.argv.slice(2);
const dirs = names.length > 0 ? names : readdirSync('packages');

for (const dir of dirs) {
  const { name, license, repository } = JSON.parse(
    readFileSync(`packages/${dir}/package.json`, 'utf8'),
  );
  try {
    execFileSync('npm', ['view', name, 'name'], { stdio: 'ignore' });
    console.log(`${name} is already on npm`);
  } catch {
    const tmp = mkdtempSync(join(tmpdir(), 'reserve-'));
    const description = 'Reserves the name until the first release.';
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ name, description, version: '0.0.0', license, repository }, null, 2),
    );
    writeFileSync(
      join(tmp, 'README.md'),
      `# ${name}\n\n${description} See https://portablejs.com.\n`,
    );
    execFileSync('npm', ['publish', '--access', 'public'], {
      cwd: tmp,
      stdio: 'inherit',
    });
    rmSync(tmp, { recursive: true });
  }
  const trusted = JSON.parse(
    execFileSync('npm', ['trust', 'list', name, '--json'], { encoding: 'utf8' }) || '[]',
  );
  if (Array.isArray(trusted) && trusted.length > 0) {
    console.log(`${name} already has a trusted publisher`);
    continue;
  }
  execFileSync(
    'npm',
    [
      'trust',
      'github',
      name,
      '--file',
      'changesets.yml',
      '--repository',
      'portablejs/portable',
      '--environment',
      'npm',
      '--allow-publish',
      '--yes',
    ],
    { stdio: 'inherit' },
  );
}
