#!/usr/bin/env node
// 技能（Skill）格式门禁 — CLI
//
// 校验本仓的技能目录：`<root>/<name>/SKILL.md` 形态、frontmatter 必填项、name 与目录名一致、
// 正文非空，并拒绝**不受支持的嵌套** `**/SKILL.md`（DSH 刻意不支持嵌套——嵌套技能不会加载）。
//
// 为什么值得一道门禁：技能加载失败是静默的。缺 name/description 时技能只是"不出现"，
// 没有任何报错；等到发现"这个技能怎么没生效"时已经浪费了一轮。
//
// 用法：node scripts/check-skills.mjs [--verbose]
// 退出码：0 = 通过；1 = 有不合格技能。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateSkill } from './lib/skill-rules.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

/**
 * 本仓可能承载技能的根（按 DSH 的扫描约定；只需存在其一）。
 * 可用 WORK_SKILL_ROOTS（逗号分隔，允许绝对路径）覆盖，便于测试遍历逻辑。
 */
const ROOTS = (
  process.env.WORK_SKILL_ROOTS ?? '.agents/skills,.dsh/skills,.claude/skills'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// 只跳过真正的噪声目录。**不要**跳过 references/scripts/assets —— 嵌套的 SKILL.md 正是在这些目录里
// 会被漏掉（Codex P2），而门禁的职责恰恰是拦下不受支持的嵌套。
const SKIP_DIRS = new Set(['node_modules', '.git']);

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 收集某根下所有 SKILL.md 的相对段路径，[['name','SKILL.md'], ...]。 */
function collectSkillFiles(rootAbs, segments = []) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...collectSkillFiles(path.join(rootAbs, entry.name), [...segments, entry.name]));
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      found.push([...segments, entry.name]);
    }
  }
  return found;
}

const violations = [];
let checked = 0;
const rootsFound = [];

for (const relRoot of ROOTS) {
  const rootAbs = path.isAbsolute(relRoot) ? relRoot : path.join(REPO, relRoot);
  if (!isDir(rootAbs)) continue;
  rootsFound.push(relRoot);

  // 直接子目录必须有 SKILL.md，否则该技能不会加载。
  for (const entry of readdirSync(rootAbs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(rootAbs, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) {
      violations.push({
        at: `${relRoot}/${entry.name}`,
        reason: '该目录下没有 SKILL.md——技能不会被加载（目录 bundle 必须含 SKILL.md）',
      });
    }
  }

  for (const segments of collectSkillFiles(rootAbs)) {
    const rel = `${relRoot}/${segments.join('/')}`;
    if (segments.length !== 2) {
      violations.push({
        at: rel,
        reason: `不支持嵌套：技能必须是 ${relRoot}/<name>/SKILL.md，嵌套的 SKILL.md 不会被加载`,
      });
      continue;
    }
    checked++;
    const problems = validateSkill(segments[0], readFileSync(path.join(rootAbs, ...segments), 'utf8'));
    for (const problem of problems) violations.push({ at: rel, reason: problem });
  }
}

if (VERBOSE || violations.length > 0) {
  console.log(
    `技能根：${rootsFound.length > 0 ? rootsFound.join('、') : '（无）'}；校验 ${checked} 个 SKILL.md`,
  );
}

if (violations.length === 0) {
  console.log(`技能格式门禁：通过（${checked} 个技能）`);
  process.exit(0);
}

for (const v of violations) {
  console.log(`${v.at}  [S1] ${v.reason}`);
}
console.log(`技能格式门禁：失败，${violations.length} 处不合格。约定见 docs/agent-workflow.md §5。`);
process.exit(1);
