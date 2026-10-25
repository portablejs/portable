/// <reference types="node" />
// Run by .vite-hooks/commit-msg. Rejects a commit message that has prose built around a made-up
// actor or a list without a serial comma. These are the same checks that
// tools/lint/src/prose.test.ts runs on files.
import { readFileSync } from 'node:fs';
import { findMadeUpActor, findMissingSerialComma } from './prose.ts';

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
const lists = lines.map(findMissingSerialComma).filter((list) => list !== undefined);
if (lists.length) {
  console.error(
    `Commit message has a list without a serial comma: ${lists.map((list) => `"${list}"`).join(', ')}.`,
  );
  console.error(
    'Put a comma before the last "and" or "or" (see the Writing section of AGENTS.md).',
  );
  process.exitCode = 1;
}
