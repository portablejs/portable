/// <reference types="node" />
// Run by .vite-hooks/commit-msg. Rejects a commit message with prose built around a made-up actor,
// the check that tools/lint/src/prose.test.ts makes for files.
import { readFileSync } from 'node:fs';
import { findMadeUpActor } from './prose.ts';

const lines = readFileSync(process.argv[2]!, 'utf8')
  .split('\n')
  .filter((line) => !line.startsWith('#'));
const found = lines.map(findMadeUpActor).filter((phrase) => phrase !== undefined);
if (found.length) {
  console.error(
    `Commit message describes a made-up actor: ${found.map((phrase) => `"${phrase.trim()}"`).join(', ')}.`,
  );
  console.error(
    'Talk to the reader or name the real thing that acts (see the Writing section of AGENTS.md).',
  );
  process.exitCode = 1;
}
