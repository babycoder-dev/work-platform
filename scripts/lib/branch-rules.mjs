// "不要在 main 上干活" · 规则（纯函数，无 I/O）
//
// 理由（2026-10-07）：同一个会话里**两次**把改动直接提交到本地 main。两次都靠人工
// 「建分支引用 + reset --hard」补救成功，但这种"先提交再补救"完全没必要。
//
// 为什么不是 git pre-commit hook：本机 git 无法 spawn 那个 hook
// （`error: cannot spawn scripts/hooks/pre-commit: No such file or directory` —— 与 `bash` 解析到
// WSL 存根同类的机器问题）。一个我无法在本机验证的守卫，正是本仓一直在消灭的"配置存在但不生效"。
// 因此改为在 `pnpm check:repo` 里做**可移植、当场可验证**的检查：每次跑门禁时都会拦。
//
// 只在本地的 `main` 分支上判定；detached HEAD（CI）与非 main 分支一律跳过。

export const PROTECTED_BRANCH = 'main';

/**
 * @param {{ branch: string, detached: boolean, dirty: boolean, ahead: number }} state
 * @returns {string[]} 问题列表（空数组=通过）
 */
export function assess(state) {
  const problems = [];
  if (!state || state.detached) return problems;
  if (state.branch !== PROTECTED_BRANCH) return problems;

  if (state.dirty) {
    problems.push(
      `\`${PROTECTED_BRANCH}\` 上有未提交改动：先 \`git checkout -b <feat|fix|chore|docs>/<topic>\` 再继续`,
    );
  }
  if (state.ahead > 0) {
    problems.push(
      `\`${PROTECTED_BRANCH}\` 上有 ${state.ahead} 个未推送提交：` +
        '把它们移到分支上（`git branch <name>` 然后 `git reset --hard origin/main`，再 `git checkout <name>`）',
    );
  }
  return problems;
}
