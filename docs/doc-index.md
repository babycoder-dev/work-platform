# 文档索引与审查规则

本文档定义仓库文档的职责、阅读顺序和审查规则。它的目标是避免架构文档、路线图、ADR、RFC 之间互相覆盖或长期漂移。

## 1. 文档优先级

当文档之间出现冲突时，按以下顺序判断：

1. `docs/adr/*.md`：已经接受的不可变架构决策。只能新增 ADR 修正，不直接改旧 ADR 结论。
2. `docs/constitution.md`：长期工程原则和开发宪法。
3. `docs/foundation-blueprint.md`：全局基建路线和阶段门禁。
4. `docs/foundation-progress.md`：基建当前进度、下一步和阻塞项。
5. `docs/product-requirements.md`：业务产品需求的单一事实源（要什么、给谁、边界），各 RFC 据此落地。
6. `docs/rfc/*.md`：某个阶段或重大能力的落地规格。
7. `docs/architecture.md`：当前目标架构说明。
8. `docs/module-contract.md`、`docs/platform-core.md`、`docs/im-foundation.md` 等专题文档。
9. `docs/tasks/*.md`：单切片任务包，自包含、可执行、可验收；不定义新规则，权威性低于 RFC 与专题文档。
10. `docs/runbooks/*.md`：可重跑的操作手册（部署、smoke、迁移演练等），自包含、可执行；不定义新规则。
11. `docs/verification-log.md`：验证记录，不定义新规则。

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

### 2.4 开始 M2 权限、菜单、审计闭环

```text
docs/foundation-blueprint.md
docs/foundation-progress.md
docs/rfc/m2-permission-menu-audit.md
docs/platform-core.md
docs/security-baseline.md
docs/module-contract.md
```

### 2.5 新增业务模块

```text
docs/foundation-blueprint.md
docs/module-contract.md
docs/platform-core.md
docs/security-baseline.md
docs/domain-glossary.md
模块自己的 contract/RFC
```

### 2.6 开始 M4 在位管理 MVP

```text
docs/foundation-progress.md
docs/rfc/m4-presence-mvp.md
docs/domain-glossary.md
docs/module-contract.md
docs/platform-core.md
modules/presence/contract
```

### 2.7 开始 M5 权限与角色管理

```text
docs/foundation-progress.md
docs/product-requirements.md
docs/adr/0005-product-replan-roadmap.md
docs/rfc/m5-roles-permissions-admin.md
docs/security-baseline.md
apps/platform-api/src/scope, apps/platform-api/src/rbac, packages/platform-contract
```

### 2.8 开始 M6 动态表单 mini + 文件存储

```text
docs/foundation-progress.md
docs/product-requirements.md
docs/adr/0005-product-replan-roadmap.md
docs/rfc/m6-dynamic-forms-file-storage.md
docs/security-baseline.md
docs/module-contract.md
modules/presence/api（共享模块接入模式参考）
```

### 2.9 开始 M8 人员 / 组织 / 档案

```text
docs/foundation-progress.md
docs/product-requirements.md（§4.4、§3、§8）
docs/adr/0005-product-replan-roadmap.md
docs/rfc/m8-people-org-profile.md
docs/security-baseline.md（§5 数据范围、§16 变更门禁——profile scope 首次用于写授权）
apps/platform-api/src/{org,users,scope}, packages/platform-contract
modules/forms/contract（profile.employee 槽位）, modules/notification/api（profile.updated 订阅）
```

## 3. 文档职责

| 文档                           | 职责                         | 什么时候更新                          |
| ------------------------------ | ---------------------------- | ------------------------------------- |
| `docs/constitution.md`         | 长期工程宪法                 | 原则变化、硬性规范变化                |
| `docs/foundation-blueprint.md` | 全局基建路线图和阶段门禁     | 里程碑调整、基建范围变化              |
| `docs/foundation-progress.md`  | 基建执行进度、下一步和阻塞项 | 每个基建交付切片完成后                |
| `docs/architecture.md`         | 当前目标架构和系统分层       | 架构拓扑、客户端/服务边界变化         |
| `docs/adr/*.md`                | 不可变架构决策记录           | 重大技术取舍、原则性决策              |
| `docs/rfc/*.md`                | 阶段或能力落地规格           | 每个里程碑开始前、重大功能前          |
| `docs/platform-core.md`        | Platform Core 接口和约定     | 平台核心 API、权限、认证变化          |
| `docs/module-contract.md`      | 业务模块接入规范             | 模块 manifest、contract、事件规范变化 |
| `docs/domain-glossary.md`      | 跨模块领域术语               | 进入新业务模块、核心术语变化          |
| `docs/security-baseline.md`    | 安全基线和强制要求           | 认证、授权、审计、密钥、部署安全变化  |
| `docs/deployment.md`           | 部署说明                     | Docker、环境变量、部署流程变化        |
| `docs/development-workflow.md` | 开发流程                     | Git、测试、代码审查流程变化           |
| `docs/runbooks/*.md`           | 可重跑操作手册               | 每个 runbook 主题首次落地时           |
| `docs/verification-log.md`     | 验证记录                     | 每个重要交付点后追加                  |

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
- 领域术语表：`docs/domain-glossary.md`
- M4 在位管理 MVP RFC：`docs/rfc/m4-presence-mvp.md`
- Presence MVP 交付 smoke runbook：`docs/runbooks/presence-mvp-smoke.md`（M4-4 首次落地，后续里程碑沿用 `docs/runbooks/` 目录）
- 产品需求规格：`docs/product-requirements.md`（2026-05 重规划，单一事实源）
- 产品重规划 ADR：`docs/adr/0005-product-replan-roadmap.md`（修正 ADR-0002 的 M5–M8 执行顺序）
- M5 权限与角色管理 RFC：`docs/rfc/m5-roles-permissions-admin.md`（按类型数据范围模型 B、角色管理、Scope 改造）
- M6 动态表单 mini + 文件存储 RFC：`docs/rfc/m6-dynamic-forms-file-storage.md`（固定槽位、快照值、本地磁盘 provider、私有文件访问边界）
- M7 通知基建 + 定时任务调度 RFC：`docs/rfc/m7-notification-scheduler.md`（modules/notification 共享模块、事件驱动+接收人可配、SSE 单实例推送、@nestjs/schedule、删 notification-api app）
- M8 人员 / 组织 / 档案 RFC：`docs/rfc/m8-people-org-profile.md`（核心留 platform 不新建模块、近况记录 `platform.status_logs`、消费 M6 forms `profile.employee` 槽位前端聚合、`profile.updated` 生产+notification 新增订阅、复用 `platform:org:*`、profile scope 首次用于写授权）
- 设计真源（Claude Design 交接包）：`docs/design/ui-handoff/`（README + `design/` 下 tokens.css + 登录/外壳/工作台/组织成员/消息中心/我的待办/审批中心 设计稿；UI 实现的**只读基准**，要求像素级还原）
- UI 还原度差距清单：`docs/design/ui-fidelity-gap-foundation.md`（地基三屏 设计 vs 实现逐项差距 L-_/S-_/W-\_ + L1/L2 边界 + 设计还原度门禁立意）
- UI 还原度差距清单（组件库 Modal）：`docs/design/ui-fidelity-gap-modal.md`（共享 `@work/ui` Modal vs 设计稿居中弹窗 5 处偏差 M-1..M-5；登记于 foundation-progress §7.2）
- UI 地基还原收口切片任务包：`docs/tasks/ui-foundation-fidelity.md`（M8 前；组件库+登录+外壳+工作台像素级还原 + 还原度门禁 A/B 两层；后续 UI 切片复用该门禁）
- M8-1 部门管理任务包：`docs/tasks/m8-1-department-management.md`（OrgService update/delete/移动/设负责人 + 占用删除 409 + 环路防护 + 双实现对齐(内存软删态) + `OrganizationPage` 部门树 UI；复用 `platform:org:manage`、无 DDL 迁移、不改数据范围模型、合并前过 security-reviewer）
- M8-2a 档案读写后端任务包：`docs/tasks/m8-2a-profile-read-write-backend.md`（`:id`/`me` 读 + 本人窄 DTO / 管理 DTO 经写收口 service + `profile` scope **首次用于写授权** + `registration_status` 预留增列；**§16 触发 → 同变更补 security-baseline §5.3**、复用 `platform:employee:{view,manage}`、不发 `profile.updated`(留 M8-3)、强制 security-reviewer）
- M8-2b 首登向导任务包：`docs/tasks/m8-2b-first-login-wizard.md`（**纯前端**：`mustChangePassword` 前端网关 → **不可关闭 Modal** 两步向导(强制改密 + 强制补全本人档案) → 重 bootstrap 入壳；复用 M8-2a `employees/me(/profile)` + 既有 `auth/change-password`，**不改后端/契约/迁移/权限点**；无专稿→还原基准锚定登录卡+Modal，过设计还原度门禁；非安全敏感面、security-reviewer 非强制）
- M8-3 `profile.updated` 事件任务包：`docs/tasks/m8-3-profile-updated-event.md`（platform-contract **新建事件契约**(payload 仅 id+变更字段名、零字段值) + platform 接 `EventBusModule` 在 M8-2a 写收口**「他人改且有变更才发」** + notification **新增订阅器**消费(接收人=本人直取、**恒发不经 RecipientResolver/trigger_config**)；点亮 M7 ④；**无迁移/无 schema/无新权限点/不改数据范围模型**，**§16 不触发**(不补 baseline)、仍过 security-reviewer；e2e 双向断言实证 EventBus 单例跨进程)

后续建议补充：

- `docs/testing-strategy.md`：建议在 M2 启动前完成，统一单元、集成、E2E、数据库测试、mock 边界和 CI 门禁。
- `docs/offline-deployment-runbook.md`：建议在 M8 启动前完成；其中 Docker 镜像导出、导入和数据库迁移演练可在 M1-M3 逐步补充。
