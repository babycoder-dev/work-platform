// 文档/脚本路径引用完整性 · 规则（纯函数，无 I/O）
//
// 立意：docs/agent-workflow.md §1「承诺必须落到会红的检查上」。
// 2026-10-07 的漂移审计确认：本仓真正反复出现的不是"命令写错"，而是**指针指向已移动/已删除的文件**
// （例：hook 从 `.claude/hooks/` 搬到 `scripts/hooks/` 后，文档仍指着旧路径；`ai-handoff.md` 废弃后
// 仍有引用）。这类问题**可机器核验**，所以给它一道门禁，而不是靠下次审计再发现。
//
// 只查两类高信号引用（避免把示例路径、代码片段误判）：
//   1. `docs/**` 下的 markdown 文件被提及时必须存在；
//   2. `scripts/**` 下的文件被提及时必须存在。
//
// **只报"曾经存在、后来被移走/删掉"的引用**（由调用方用 git 历史判定 wasRemoved），
// 而不是凡不存在的都报。理由：本仓大量引用是**前瞻性**的（`docs/testing-strategy.md` 这类
// "建议后续补充"的文档），还有的是**别的项目的**文档树（研究报告中引用被评项目的 `docs/...`）。
// 这两类都不是漂移；2026-10-07 实测：不区分会得到 32 处告警、其中绝大多数是误报，
// 那样的门禁只会训练人乱加豁免标记。
//
// 需要指向"尚未创建"的文件时，可在**同一行**加 `doc-ref-allow` 标记显式豁免（很少需要）。

const REF_RE = /\b((?:docs|scripts)\/[\w./@-]+\.(?:md|mjs|cjs|js|ps1|sh|json))/g;

/** 提取一行里提到的仓库内路径。 */
export function extractRefs(line) {
  const refs = [];
  for (const match of line.matchAll(REF_RE)) {
    refs.push(match[1]);
  }
  return refs;
}

/** 该行是否显式豁免。 */
export function isExempt(line) {
  return line.includes('doc-ref-allow');
}

/**
 * 校验一段文本里的路径引用。
 * @param {string} rel 文件相对路径（用于报表）
 * @param {string} text 文件内容
 * @param {{ exists: (ref: string) => boolean, wasRemoved: (ref: string) => boolean }} io
 * @returns {{ violations: {line:number, ref:string}[], planned: {line:number, ref:string}[] }}
 */
export function lintText(rel, text, io) {
  const violations = [];
  const planned = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isExempt(line)) continue;
    for (const ref of extractRefs(line)) {
      if (ref === rel) continue; // 自引用
      if (io.exists(ref)) continue;
      // 曾经存在过 → 这是被移动/删除后的悬空指针，是真漂移；
      // 从未存在过 → 前瞻引用或其他项目的路径，不作为违规（仅登记备查）。
      if (io.wasRemoved(ref)) violations.push({ line: i + 1, ref });
      else planned.push({ line: i + 1, ref });
    }
  }
  return { violations, planned };
}
