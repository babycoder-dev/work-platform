#!/usr/bin/env node
// SessionStart hook: 把 docs/foundation-progress.md 里"会变化"的关键进度
// (总览 / 当前下一步 / 当前阻塞项) 动态注入到每个会话的上下文。
//
// 为什么用 hook 而不是写进 CLAUDE.md：
//   进度每个切片都在变，属于"动态上下文"；CLAUDE.md 应只保留稳定的"指针和关键
//   坑"，否则很快漂移成噪音。这正是 Claude Code 大型代码库最佳实践里 start hook
//   的定位——动态注入、按需加载，而不是一刀切塞进每个会话。
//
// 保持精简(lean)：只抽三节并在开头给出指针，不注入整篇 13KB 文档。
//   "上下文太多会拖慢、太少又让模型盲飞"——所以给快照 + 指针，细节按需自取。
//
// 机制：stdout 输出 {hookSpecificOutput:{additionalContext}}，Claude Code 会把
// additionalContext 注入会话。任何失败一律静默(exit 0)，绝不阻塞会话启动。
// 与 format-on-edit.mjs 一致：不用 jq，用 Node 解析；只读仓库内文件。

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const file = path.join(repo, 'docs', 'foundation-progress.md');

function emit(context) {
  if (context) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
        },
      }),
    );
  }
  process.exit(0);
}

if (!existsSync(file)) emit('');

let text;
try {
  text = readFileSync(file, 'utf8');
} catch {
  emit('');
}

const lines = text.split(/\r?\n/);

// 抽取以 `## ` 开头、标题含 keyword 的小节，到下一个 `## ` 或 `### ` 为止。
// 用标题文字(而非写死的章节号)匹配，文档重排时更稳。止于 `### ` 能让
// "当前下一步"自动停在 `### 6.1`(M3.5 历史长表)之前，保持快照精简。
function section(keyword) {
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(keyword));
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###?\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

const parts = [section('总览'), section('当前下一步'), section('当前阻塞项')].filter(Boolean);

if (parts.length === 0) emit('');

const context = [
  '# 基建进度快照（SessionStart hook 自动注入，源自 docs/foundation-progress.md）',
  '',
  '下面是当前里程碑状态、下一步与阻塞项。完整进度看 `docs/foundation-progress.md`，',
  '当前切片任务包在 `docs/tasks/`，验收记录在 `docs/verification-log.md`。',
  '',
  ...parts,
].join('\n');

emit(context);
