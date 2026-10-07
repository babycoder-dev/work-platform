#!/usr/bin/env node
// 文档/脚本路径引用完整性门禁 — CLI
//
// 校验文档与配置里提到的 `docs/**`、`scripts/**` 路径是否真实存在。规则与豁免见
// scripts/lib/doc-ref-rules.mjs。
//
// **只报"曾经存在、后来被移动/删除"的悬空指针**：用一次 `git log --all --diff-filter=DR` 建索引判定。
// 前瞻性引用（计划中的文档）与别的项目的文档树不算违规，只在 --verbose 下列出。
//
// 不扫"快照型"文件：`docs/verification-log.md`（按时间点记录）、`docs/archive/**`（归档）、
// `docs/superpowers/plans/**`（计划快照）——追改历史快照没有意义。
//
// 用法：node scripts/check-doc-refs.mjs [--verbose]
// 退出码：0 = 通过；1 = 有悬空指针。

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { lintText } from './lib/doc-ref-rules.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.nx', 'archive']);
/** 快照型文件：按当时事实写，不参与本门禁。 */
const SNAPSHOT_RELS = new Set(['docs/verification-log.md']);

/** 从 git 历史里取出"曾经存在过、现已不在工作树"的路径集合。 */
function removedPaths() {
  const result = spawnSync('git', ['log', '--all', '--name-status', '--diff-filter=DR', '--format='], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const removed = new Set();
  if (result.status !== 0) return removed;
  for (const line of (result.stdout ?? '').split(/\r?\n/)) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const [status, first] = parts;
    if (/^[DR]/.test(status) && first) removed.add(first);
  }
  return removed;
}

function collectFiles() {
  const files = [];
  const walk = (dir, relBase) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || rel.endsWith('superpowers/plans')) continue;
        walk(path.join(dir, entry.name), rel);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) files.push({ abs: path.join(dir, entry.name), rel });
    }
  };
  walk(path.join(REPO, 'docs'), 'docs');
  walk(path.join(REPO, '.agents'), '.agents');

  for (const rel of [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    '.claude/settings.json',
    '.github/pull_request_template.md',
  ]) {
    const abs = path.join(REPO, rel);
    if (existsSync(abs)) files.push({ abs, rel });
  }
  return files.filter((f) => !SNAPSHOT_RELS.has(f.rel));
}

const removed = removedPaths();
const files = collectFiles();
const violations = [];
let plannedCount = 0;

for (const { abs, rel } of files) {
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  const { violations: bad, planned } = lintText(rel, text, {
    exists: (ref) => existsSync(path.join(REPO, ref)),
    wasRemoved: (ref) => removed.has(ref),
  });
  for (const v of bad) violations.push({ rel, ...v });
  plannedCount += planned.length;
  if (VERBOSE && planned.length > 0) {
    for (const p of planned) {
      console.log(`（前瞻引用，不违规）${rel}:${p.line} → ${p.ref}`);
    }
  }
}

if (VERBOSE || violations.length > 0) {
  console.log(
    `扫描 ${files.length} 个文件；git 历史中已移除路径 ${removed.size} 个；前瞻性引用 ${plannedCount} 处（不算违规）`,
  );
}

if (violations.length === 0) {
  console.log(`文档路径引用门禁：通过（${files.length} 个文件，无悬空指针）`);
  process.exit(0);
}

for (const v of violations) {
  console.log(`${v.rel}:${v.line}  [D1] 悬空指针：${v.ref} 曾经存在，现已不在工作树`);
}
console.log(
  `文档路径引用门禁：失败，${violations.length} 处。文件被移动/删除时，引用它的活文档必须同步更新` +
    '（历史快照不追改）。',
);
process.exit(1);
