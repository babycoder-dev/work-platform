# 文档索引与审查规则

本文档定义仓库文档的职责、阅读顺序和审查规则。它的目标是避免架构文档、路线图、ADR、RFC 之间互相覆盖或长期漂移。

## 1. 文档优先级

当文档之间出现冲突时，按以下顺序判断：

1. `docs/adr/*.md`：已经接受的不可变架构决策。只能新增 ADR 修正，不直接改旧 ADR 结论。
2. `docs/constitution.md`：长期工程原则和开发宪法。
3. `docs/foundation-blueprint.md`：全局基建路线和阶段门禁。
4. `docs/foundation-progress.md`：基建当前进度、下一步和阻塞项。
5. `docs/rfc/*.md`：某个阶段或重大能力的落地规格。
6. `docs/architecture.md`：当前目标架构说明。
7. `docs/module-contract.md`、`docs/platform-core.md`、`docs/im-foundation.md` 等专题文档。
8. `docs/verification-log.md`：验证记录，不定义新规则。

`README.md` 和 `AGENTS.md` 是入口文件，不承载详细设计。它们必须链接到权威文档，而不是复制复杂规则。

## 2. 推荐阅读路径

### 2.1 新开发者

```text
README.md
docs/doc-index.md
docs/constitution.md
docs/foundation-blueprint.md
docs/foundation-progress.md
docs/architecture.md
docs/development-workflow.md
```

### 2.2 AI 辅助开发

```text
AGENTS.md
docs/doc-index.md
docs/constitution.md
docs/foundation-blueprint.md
docs/foundation-progress.md
当前任务相关 RFC
当前任务相关专题文档
```

### 2.3 开始 M1 Platform Core 持久化

```text
docs/foundation-blueprint.md
docs/foundation-progress.md
docs/rfc/m1-platform-core-persistence.md
docs/security-baseline.md
docs/platform-core.md
docs/deployment.md
docs/development-workflow.md
```

### 2.4 新增业务模块

```text
docs/foundation-blueprint.md
docs/module-contract.md
docs/platform-core.md
docs/security-baseline.md
模块自己的 contract/RFC
```

## 3. 文档职责

| 文档 | 职责 | 什么时候更新 |
| --- | --- | --- |
| `docs/constitution.md` | 长期工程宪法 | 原则变化、硬性规范变化 |
| `docs/foundation-blueprint.md` | 全局基建路线图和阶段门禁 | 里程碑调整、基建范围变化 |
| `docs/foundation-progress.md` | 基建执行进度、下一步和阻塞项 | 每个基建交付切片完成后 |
| `docs/architecture.md` | 当前目标架构和系统分层 | 架构拓扑、客户端/服务边界变化 |
| `docs/adr/*.md` | 不可变架构决策记录 | 重大技术取舍、原则性决策 |
| `docs/rfc/*.md` | 阶段或能力落地规格 | 每个里程碑开始前、重大功能前 |
| `docs/platform-core.md` | Platform Core 接口和约定 | 平台核心 API、权限、认证变化 |
| `docs/module-contract.md` | 业务模块接入规范 | 模块 manifest、contract、事件规范变化 |
| `docs/security-baseline.md` | 安全基线和强制要求 | 认证、授权、审计、密钥、部署安全变化 |
| `docs/deployment.md` | 部署说明 | Docker、环境变量、部署流程变化 |
| `docs/development-workflow.md` | 开发流程 | Git、测试、代码审查流程变化 |
| `docs/verification-log.md` | 验证记录 | 每个重要交付点后追加 |

## 4. ADR 与 RFC 的区别

ADR 记录“为什么做这个决策”，不写完整实施计划。

RFC 记录“这个阶段具体怎么做”，必须可执行、可验收。

示例：

```text
ADR: 采用基建优先的平台推进策略。
RFC: M1 Platform Core 持久化的 schema、迁移、seed、session、测试方案。
```

## 5. 文档审查规则

以下变更必须做文档审查：

- 新增或变更平台基建。
- 新增业务模块。
- 调整认证、权限、数据范围。
- 调整数据库 schema 或迁移策略。
- 调整客户端支持范围。
- 引入或替换关键基础依赖。
- 改变内网部署方式。

审查时必须检查：

- 是否需要新增 ADR。
- 是否需要新增或更新 RFC。
- 是否影响 `foundation-blueprint.md` 的里程碑。
- 是否影响 `constitution.md` 的硬规则。
- 是否影响 `security-baseline.md`。
- 是否需要更新 `verification-log.md`。

## 6. 文档防冲突规则

- 不在多个文档重复维护同一份详细规则。
- 入口文件只放链接和摘要。
- 设计决策写 ADR。
- 阶段实施写 RFC。
- 已实现接口写专题文档。
- 验证结果写 verification log。
- 旧文档过时后必须明确标注替代文档或更新为新规则。

## 7. 当前文档缺口

已补齐：

- 全局基建蓝图：`docs/foundation-blueprint.md`
- 基建进度看板：`docs/foundation-progress.md`
- 基建优先 ADR：`docs/adr/0002-foundation-first-platform-plan.md`
- M1 持久化 RFC：`docs/rfc/m1-platform-core-persistence.md`
- 安全基线：`docs/security-baseline.md`

后续建议补充：

- `docs/testing-strategy.md`：建议在 M2 启动前完成，统一单元、集成、E2E、数据库测试、mock 边界和 CI 门禁。
- `docs/offline-deployment-runbook.md`：建议在 M8 启动前完成；其中 Docker 镜像导出、导入和数据库迁移演练可在 M1-M3 逐步补充。
- `docs/domain-glossary.md`：建议在 M4 启动前完成，至少覆盖在位状态、审批实例、工作汇报、数据范围、通知事件等核心概念。
