# docs/goal/ —— 长任务（goal）状态

本目录承载**跨多轮/多会话的长任务**状态。规则见 `docs/agent-workflow.md` §4；纪律的**执行者**是
`node scripts/goal.mjs`（纯规则在 `scripts/lib/goal-rules.mjs`，有单测）。

它替代了此前的 `docs/archive/ai-handoff.md`——那份手工维护的会话交接文档漂移了 4.5 个月（还停在 M3.5），
证明**手工状态文档必然失真**。这里的状态由脚本读写、由 hook 注入会话，不靠人记得去改。

## 为什么需要它

短任务用 `docs/foundation-progress.md` + git 历史就够了。当一个目标要跨多轮推进、并且**可能被无限期
搁置**时，需要三样东西：轮次预算、阶段状态机、以及一条**防止"一遇到困难就标 blocked"的硬闸**。

## 文件格式

一个目标一个文件：`docs/goal/<id>.md`。机器状态藏在 HTML 注释块里（人可读，机器可解析）：

```markdown
# Goal: <目标一句话>

<!-- goal-state
{
  "id": "<id>",
  "objective": "<目标>",
  "phase": "active",            // active | paused | blocked | complete
  "roundsStarted": 0,
  "maxRounds": 12,
  "blocker": { "reason": null, "consecutiveRounds": 0 }
}
-->

## Rounds

- 2026-10-07 r1: <本轮做了什么>
```

## 用法

```bash
node scripts/goal.mjs create --id m10-daily-report --objective "把日报做完并交付" --max-rounds 12
node scripts/goal.mjs list
node scripts/goal.mjs round m10-daily-report --note "RPC 定稿"
node scripts/goal.mjs round m10-daily-report --blocked "等法务对 AGPL 的结论"
node scripts/goal.mjs block m10-daily-report      # 门槛不足会被拒绝
node scripts/goal.mjs pause|resume|complete m10-daily-report
node scripts/goal.mjs validate
```

## 三条规则（由脚本强制，不是约定）

1. **blocked 是硬闸**：同一阻塞必须**连续 ≥3 轮**才允许标 blocked。中间有任何进展就重新计数。
   脚本会用「还差 N 轮」拒绝你，并提示：难度大、不确定、还有事可做，都不是 blocked。
2. **轮次预算**：`roundsStarted` 达到 `maxRounds` 后拒绝继续记轮次，逼你要么提高预算、要么收束目标。
3. **不自复活**：`complete` 是终态；`blocked → active` 必须显式 `resume`，不会因会话重启自动恢复。

## 当前状态

**没有活跃 goal 文件。** 本机制为第一个真正的跨会话长任务准备；`docs/goal/README.md` 是目录占位，
不参与状态解析（hook 与 CLI 都会跳过它）。
