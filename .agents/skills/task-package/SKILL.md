---
name: task-package
description: Write or execute a self-contained Work Platform task package (docs/tasks/*.md) — the repo's unit of deliverable work. Use when starting a milestone slice, authoring a task package, or executing one.
whenToUse: 开始或执行一个切片任务、需要写任务包时
---

# 任务包（Task Package）

任务包是本仓的**可交付单元**：自包含、可执行、可验收。它**不定义新规则**（规则在 `docs/constitution.md` /
ADR / RFC），只讲清某个切片怎么落地。命名：`docs/tasks/m<里程碑>-<切片>-<主题>.md`。

## 先读

按 `docs/doc-index.md` 的优先级：该里程碑的 RFC → `docs/foundation-progress.md`（进度与阻塞）→
涉认证/权限/数据范围/审计时读 `docs/security-baseline.md` → 相关专题文档
（`docs/module-contract.md`、`docs/platform-core.md`、`docs/agent-workflow.md`）。

## 骨架（照此写）

| 节 | 内容 |
| --- | --- |
| `## 状态` | 里程碑、依赖（哪个切片/PR 先合）、风险级别（是否安全敏感、是否强制独立评审）、交付形态（分支 + PR） |
| `## 0. 任务定位` | 做什么、为什么现在做；**决策**（对 RFC 的实现取态，供评审按此口径）；**本切片不做**（越界即打回） |
| `## 1. 必读` | 按顺序列文件 + 具体条款；**引用条款，不要凭记忆** |
| `## 2. 设计要点` | 逐文件/逐模块的改动规格（含要删/要迁的东西） |
| `## 3. 模块结构增量` | 新增/修改/删除的文件清单，精确到路径 |
| `## 4. 验证` | 4.1 命令（必须全过）；4.2 断言（必须覆盖的行为，逐条可核） |
| `## 5. 退出标准` | 什么算完成 |
| `## 6. 必须保持不变` | 明确禁止顺手改动的东西 |
| `## 7. 完成后更新文档` | 需同步的文档（通常含 `foundation-progress` 与 `verification-log`） |
| `## 8. 提交规范` | Conventional Commits 的具体建议 |

## 执行纪律

- **不要静默增删文件**。任务包给了精确清单就以清单为准；要偏离先停下说明。
- 要求精确 old/new 替换时，**匹配失败就停下回报**，不要猜着改。
- `## 1. 必读` 要**真读**；`## 4. 验证` 要**真跑**，并按 `docs/agent-workflow.md` §2 贴出命令与结果
  （`pnpm evidence` 会校验 `verification-log` 新条目的形式）。
- 顺手发现的问题写进任务包 §7 或 `docs/foundation-progress.md` §7 的 follow-up 表，**不要在本切片里悄悄扩大范围**。
