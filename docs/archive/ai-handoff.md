# AI Handoff —— 已废弃（2026-10-07）

> **归档于 2026-10-07**（原 `docs/ai-handoff.md`）。归档理由：手工维护的会话交接文档，
> 自 2026-05-24 起漂移约 4.5 个月无人察觉（停在 M3.5、最新提交写 `9c887bd`，而项目已到 M9 合并完成）。
> 职责由 `scripts/hooks/load-progress.mjs`（会话注入进度快照）、`docs/goal/`（长任务状态）与
> git 历史接管。归档约定见 `docs/archive/README.md`。

**本文件不再维护，其职责已被机制取代。** 保留这份说明只为留下废弃理由，避免有人再手写一份。

## 为什么废弃

这份文档是**手工维护**的会话交接：写「当前阶段是什么、最新提交是哪个、下一步做什么、工作区有哪些
未提交文件」。2026-10-07 复核时发现它停在 **M3.5 收口**、最新提交写 `9c887bd`
（2026-05-24），而项目当时已走到 M9 合并完成——**漂移约 4.5 个月，期间无人察觉**。

结论：手工维护的状态文档必然失真。同类信息必须由**机制**从单一事实源生成或注入。

## 取而代之的东西

| 原来靠这份文档提供的信息 | 现在的来源 |
| --- | --- |
| 当前里程碑状态、下一步、阻塞项 | `docs/foundation-progress.md`，由 SessionStart hook `scripts/hooks/load-progress.mjs` **自动注入**每个会话 |
| 跨多轮目标的推进状态与轮次预算 | `docs/goal/`（`node scripts/goal.mjs`，规则见 `docs/agent-workflow.md` §4） |
| 最新提交与工作区状态 | 现场跑 `git log --oneline -8`、`git status --short`，不看二手记录 |
| 交付前该跑什么 | `pnpm verify`（含 `pnpm fidelity`、`pnpm evidence`）；见 `docs/agent-workflow.md` §2 |
| 代码注意事项 / 踩坑 | 就近写进对应目录的 `CLAUDE.md` 与 `docs/agent-workflow.md`，而不是集中在一份会漂移的文档里 |

机制与约定总入口：`docs/agent-workflow.md`。
