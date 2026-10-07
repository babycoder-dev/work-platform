#!/usr/bin/env node
// PostToolUse(Write|Edit) hook: format the file Claude just touched with the
// repo's own Prettier + ESLint, so edits land matching house style.
//
// Reads the hook payload as JSON on stdin, extracts the edited file path, and
// runs `pnpm exec prettier --write` (+ `eslint --fix` for code files). All
// failures are swallowed — a formatter problem must never block an edit.
//
// jq is intentionally not used (not installed on this machine); Node parses the
// payload instead. Invoked from .claude/settings.json.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function readStdin(stream) {
  return new Promise((resolve) => {
    let data = '';
    stream.on('data', (c) => (data += c));
    stream.on('end', () => resolve(data));
    stream.on('error', () => resolve(''));
  });
}

const raw = await readStdin(process.stdin);

let file;
try {
  const payload = JSON.parse(raw || '{}');
  file = payload?.tool_input?.file_path ?? payload?.tool_response?.filePath;
} catch {
  process.exit(0);
}
if (!file) process.exit(0);

const repo = process.cwd();
const abs = path.resolve(repo, file);

// Guard rails: only touch real files inside this repo, never node_modules.
if (!existsSync(abs)) process.exit(0);
if (!abs.startsWith(repo)) process.exit(0);
if (abs.split(path.sep).includes('node_modules')) process.exit(0);

const run = (args) =>
  spawnSync('pnpm', ['exec', ...args, abs], {
    cwd: repo,
    stdio: 'ignore',
    shell: true,
    timeout: 60_000,
  });

// Prettier handles every supported type; --ignore-unknown skips the rest.
run(['prettier', '--write', '--ignore-unknown']);

const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
if (CODE.has(path.extname(abs).toLowerCase())) {
  run(['eslint', '--fix', '--no-warn-ignored']);
}

process.exit(0);
