# Task: M3.5-B ADR-0003 Gateway 边界

## 状态

Ready for execution

## 0. 任务定位

本切片属于 **M3.5 收口** 阶段第 2 个切片，紧接已完成的 M3.5-A。

这是一个**纯文档切片**：产出一份 ADR，修正 `architecture.md` 中与实现漂移的 gateway 描述，并把 ADR 新增的 M7 交付项同步进 `foundation-blueprint.md`。**不改任何代码、不改测试、不改迁移、不改依赖。**

ADR 要记录的架构决策已经由项目负责人和架构审查共同拍板，本任务包 §4.1 给出 ADR 的**完整最终文本**。Codex 的职责是把这份文本落成文件、按 §4.2 精确修正 `architecture.md`、按 §7 更新进度文档——**不需要、也不应该自行做任何架构判断或改写 ADR 结论**。如对 ADR 文本有疑问，回来问，不要擅自改写。

跨进程鉴权机制（Phantom Token）是**另一个独立切片 M3.5-B2 / ADR-0004**，不在本切片范围内。本 ADR 只在"与其它决策的关系"一节引用它。

## 1. 背景

`apps/gateway-api/src/gateway.module.ts` 当前通过 `imports: [PresenceModule]` 把业务模块作为 Nest module 直接内嵌进 gateway-api 进程运行。但 `docs/architecture.md` 把 gateway 描述为"统一入口 / 鉴权 / 转发 / 限流"，暗示它是一个反向代理边缘层——这与实现（业务模块宿主）不一致。

M4 即将引入第一个真实业务模块（presence），M5/M6 会再引入 approval、report。如果不先把 gateway 的边界形态用 ADR 固定下来，会出现两个问题：

- 文档与实现持续漂移，新成员 onboarding 时困惑。
- M5/M6 每加一个业务模块，都要重新争论一次"现在该不该拆成独立服务"。

本切片用一份 ADR 固定结论：M4–M6 期间 gateway-api 是内嵌业务模块的"API 组合宿主"，M7 起拆为独立业务服务 + 纯边缘网关。

## 2. 必读

按顺序：

1. `AGENTS.md`
2. `docs/doc-index.md`（特别是 §1 文档优先级、§4 ADR 与 RFC 的区别）
3. `docs/adr/0001-openim-as-im-provider.md`（ADR 写法范例）
4. `docs/adr/0002-foundation-first-platform-plan.md`（ADR 写法范例）
5. `docs/constitution.md` §2（架构路线）、§8（模块边界）、§11（HTTP 与 API 版本）
6. `docs/foundation-blueprint.md` 第 2 节（分层目标架构）、第 10 节（M7 里程碑）
7. `docs/architecture.md` 第 1 节、第 3 节（需要修正的 gateway 描述所在处）
8. `docs/rfc/m4-presence-mvp.md` §6（对外 `/api/v1/presence` 与内部 `/api/presence` 的关系）
9. `apps/gateway-api/src/gateway.module.ts`、`apps/gateway-api/src/main.ts`（确认当前内嵌实现，只读，不改）
10. `docs/foundation-progress.md` §6、§6.1（需要更新的进度段落）
11. `docs/verification-log.md` 顶部（确认当天日期标题是否已存在，供 §7.2 日期去重判断）

## 3. 设计要点

1. ADR 的全部结论已在 §4.1 给出最终文本。Codex 不做架构决策，只做落地。
2. ADR 文件名固定为 `docs/adr/0003-gateway-boundary.md`。
3. ADR 编号 0003，状态 `Accepted`，与现有 ADR 风格（中文、状态/背景/决策/影响）一致。
4. 本切片**只**产出：1 份新 ADR + `architecture.md` 的 2 处修正 + `foundation-blueprint.md` M7 清单 1 行补充 + 2 份进度文档更新。不得有其它改动。
5. 跨进程鉴权细节属于 ADR-0004（M3.5-B2），本 ADR 仅在"与其它决策的关系"一节引用，不展开。

## 4. 文件清单与具体改动

### 4.1 新增：`docs/adr/0003-gateway-boundary.md`

整文件内容如下，逐字落地：

```markdown
# ADR 0003: Gateway 边界与业务模块承载形态

## 状态

Accepted

## 背景

`apps/gateway-api` 当前通过 `imports: [PresenceModule]` 把业务模块作为 NestJS module 直接内嵌进 gateway-api 进程运行。`platform-api` 则是独立进程。

但 `docs/architecture.md` 把 gateway-api 描述为"统一入口 / 鉴权 / 转发 / 限流"，暗示它是一个反向代理边缘层。这与实现不一致：当前的 gateway-api 既是边缘入口，又是业务模块的运行宿主。

M4 即将引入第一个真实业务模块 presence，M5/M6 会再引入 approval 和 report。如果不先固定 gateway 的边界形态，会持续出现两个问题：

- 文档与实现长期漂移，新成员 onboarding 困惑。
- M5/M6 每接入一个业务模块，都要重新争论"现在是否应该拆成独立服务"。

本 ADR 固定 gateway 在各阶段的承载形态和拆分时点。

## 决策

### 1. M4–M6：gateway-api 作为 API 组合宿主

M4–M6 期间，业务模块（presence、approval、report）以 NestJS module 形式内嵌在 gateway-api 进程中运行。gateway-api 同时承担边缘职责：统一 `/api` 前缀、trace id、统一错误格式。

这是一种"模块化单体"承载形态：物理上单进程，逻辑上每个业务模块仍保持独立边界。

### 2. platform-api 保持独立进程

platform-api 不并入 gateway-api。理由：

- 数据边界：只有 platform-api 持有 `platform` schema 的写权限和数据库连接。
- 安全边界：认证、会话、审计集中在 platform-api。

这条边界在 M4–M6 与 M7 都不变。

### 3. M7：拆为独立业务服务 + 纯边缘网关

进入 M7（通知、实时、IM 基建）时，统一把内嵌的业务模块拆为独立进程，gateway-api 退化为纯边缘网关：反向代理、鉴权透传、限流、对外 API 版本映射。

### 4. 拆分触发条件：硬绑定 M7 里程碑

M4–M6 一律内嵌，不因单个模块的局部理由提前拆分。进入 M7 时统一拆。

## 关键取舍

### 为什么 M4–M6 内嵌，而不是一开始就微服务

- `constitution.md` 与 `foundation-blueprint.md` 已确立"模块自治边界优先，不以微服务运行时为第一目标"。
- 系统默认内网部署、低流量、小团队，过早引入多进程分布式只增加运维和调试成本。
- 模块边界由 contract、manifest、数据库 schema 保证，不依赖进程隔离。

### 为什么硬绑 M7，而不是按信号提前拆

- 按信号（独立发布需求、团队自治）提前拆，会让本 ADR 的边界变模糊，且 M5/M6 每次接入模块都要重新评估。
- M7 是 `foundation-blueprint.md` 已定义的里程碑，本来就要引入 notification-api、realtime-gateway 等独立进程和消息通道。在 M7 一次性完成业务服务拆分，代价最低、时点最清晰。

### 内嵌不等于可以走捷径

即使业务模块与 gateway-api 同进程运行，仍必须遵守 `constitution.md` 第 8 节的依赖规则：

- 业务模块之间不得直接 import 对方的内部实现。
- 业务模块之间通过公开 API、领域事件、platform-sdk 协作。
- 内嵌只是部署形态，不放松任何模块边界约束。

## 与其它决策的关系

- 跨进程、跨模块的鉴权机制不在本 ADR 范围内，由 ADR-0004（Phantom Token 跨进程认证）单独决定。
- 对外 API 版本：`constitution.md` 第 11 节已确定 gateway-api 对外暴露 `/api/v1/...`。M4–M6 内嵌阶段，服务内部前缀 `/api/<module>` 暂不强制映射到 `/api/v1`；`/api/v1` 对外映射在 M7 gateway-api 成为独立边缘层时一并落地。这与 `docs/rfc/m4-presence-mvp.md` §6 的约定一致。

## 影响

### 正向

- M4–M6 部署运维简单：进程少、配置少、故障面小，契合内网交付。
- 业务模块的 contract、manifest、schema 边界已经清晰，M7 拆分时业务代码基本不动，只改装配与部署。

### 代价

- gateway-api 进程会随 M5/M6 接入模块而变重。
- M7 拆分是一次明确的、需要规划的工作量：进程切分、鉴权透传、Docker Compose 调整。

### 文档影响

- `docs/architecture.md` 中 gateway 的描述需修正，明确"M4–M6 为 API 组合宿主，M7 起为纯边缘网关"。
- `docs/foundation-blueprint.md` 第 2 节的 edge 层描述保持不变，但 gateway 的实际承载形态以本 ADR 为准。
- 本 ADR 为 `docs/foundation-blueprint.md` 的 M7 里程碑新增一项交付：把内嵌的业务模块拆分为独立服务、gateway-api 退化为纯边缘网关。M7 交付清单需同步补充该项。
```

### 4.2 修改：`docs/architecture.md`

**改动点 1** —— 第 1 节"总览"的 code block 内，`gateway-api` 那两行。

原文：

```text
gateway-api
  统一入口 / 鉴权 / traceId / 转发 / 限流 / API 版本
```

改为：

```text
gateway-api
  M4-M6：API 组合宿主，内嵌业务模块 + 边缘职责（前缀 / trace / 错误格式）
  M7 起：纯边缘网关（反向代理 / 鉴权透传 / 限流 / API 版本）
  边界详见 docs/adr/0003-gateway-boundary.md
```

**改动点 2** —— 第 3 节"后端架构"里的 gateway-api 列表项。

原文：

```text
- `gateway-api`：统一入口。
```

改为：

```text
- `gateway-api`：M4-M6 作为 API 组合宿主内嵌业务模块；M7 起退化为纯边缘网关。边界见 `docs/adr/0003-gateway-boundary.md`。
```

> `architecture.md` 其它内容一律不动。第 3 节中"业务模块后端必须保持自己的 module、controller、service、repository、contract"这段保持原样——它正好印证 ADR 中"内嵌不放松模块边界"的取舍。
>
> 改动点 1 和改动点 2 的 `old_string` 已经过审查者核对，在 `architecture.md` 中各自唯一匹配。若 Edit 工具报"非唯一/未匹配"，说明文件已变动，停下来回报，不要自行扩大匹配范围。

### 4.3 修改：`docs/foundation-blueprint.md`

ADR-0003 把"业务服务拆分"绑定到 M7，因此 blueprint 的 M7 交付清单必须同步补一项，避免 ADR 与 blueprint 漂移（doc-index §6 防冲突规则）。

定位第 10 节 "### M7：通知、实时、IM 基建" 下的 "交付：" 清单。

原文：

```text
交付：

- notification-api 可用。
- realtime-gateway 可用。
- OpenIM adapter 初版。
- 系统通知可进入站内通知和 IM。

退出标准：

- 业务模块只发布事件，不直接处理 IM 推送。
```

改为：

```text
交付：

- notification-api 可用。
- realtime-gateway 可用。
- OpenIM adapter 初版。
- 系统通知可进入站内通知和 IM。
- 内嵌业务模块（presence/approval/report）拆分为独立服务，gateway-api 退化为纯边缘网关。详见 `docs/adr/0003-gateway-boundary.md`。

退出标准：

- 业务模块只发布事件，不直接处理 IM 推送。
```

> blueprint 其它内容一律不动。第 2 节的分层目标架构保持原样。

## 5. 必须保持不变（避免越界）

- 任何 `.ts` / `.tsx` / `.json` 代码或配置文件。
- `apps/gateway-api/` 下的任何文件——本切片只记录决策，不实施重构。
- 数据库迁移、package.json、pnpm-lock.yaml。
- `docs/constitution.md`——ADR 引用它，但不修改它的条款。
- `docs/foundation-blueprint.md` 除 §4.3 指定的 M7 交付清单那一行之外，其它条款一律不动。
- 现有 ADR `0001` / `0002`。
- 本切片产出的 git diff 必须**只包含 `.md` 文件**。

## 6. 验证

本切片不改代码，验证以"未误伤仓库"+"ADR 内容自查"为主。

### 6.1 未误伤确认

```powershell
git status --short
```

预期改动文件**只有**：
- `docs/adr/0003-gateway-boundary.md`（new）
- `docs/architecture.md`（modified）
- `docs/foundation-blueprint.md`（modified）
- `docs/foundation-progress.md`（modified）
- `docs/verification-log.md`（modified）

如出现任何非 `.md` 文件改动，即为越界，必须回退。

可选：跑 `pnpm typecheck` 确认仓库代码未被误伤（应与改动前一致通过）。本切片不要求跑完整 `pnpm verify`。

### 6.2 内容自查清单

**A. ADR 内容**——逐条确认 `0003-gateway-boundary.md` 覆盖以下 8 个要点，缺一不可：

1. 状态为 `Accepted`。
2. 背景说明了"实现内嵌、文档却描述为反向代理"的漂移。
3. 决策点 1：M4–M6 gateway 作为 API 组合宿主，内嵌业务模块。
4. 决策点 2：platform-api 保持独立进程，并给出数据边界与安全边界两个理由。
5. 决策点 3：M7 拆为独立业务服务 + 纯边缘网关。
6. 决策点 4：拆分触发条件硬绑定 M7 里程碑。
7. "内嵌不等于可以走捷径"——重申 constitution §8 模块边界在同进程下仍然有效。
8. "与其它决策的关系"引用了 ADR-0004（鉴权）和 constitution §11（`/api/v1` 版本）。

**B. 跨文档一致性**——确认：

9. `docs/foundation-blueprint.md` M7 交付清单已新增"内嵌业务模块拆分为独立服务"一行，与 ADR-0003 决策点 3 一致。
10. `docs/architecture.md` 第 1 节与第 3 节的 gateway 描述均已修正，且都引用了 `docs/adr/0003-gateway-boundary.md`。

## 7. 完成后更新的文档

### 7.1 `docs/foundation-progress.md`

对 `docs/foundation-progress.md` 做一次精确替换：把下面【原文】所覆盖的整块（§6 全文 + §6.1 表，从 `## 6. 当前下一步` 到 §6.1 表最后一行 `| M3.5-G | ... |`）替换为【改为】。`## 7.` 及之后保持不动。

如果【原文】与当前文件不能逐字匹配（例如此前有人编辑过），停下来回报，不要自行猜测边界。

【原文】（`docs/foundation-progress.md` 当前 §6 与 §6.1 的逐字全文）：

````markdown
## 6. 当前下一步

当前建议执行：

```text
M3.5-B: ADR-0003 Gateway 边界
```

上一切片任务包：`docs/tasks/m3-5-a-manifest-single-source.md`。

M3.5-A 完成结果：

- `apps/platform-api/src/seeds/seed-data.ts` 从 `@work/presence-contract`、`@work/approval-contract`、`@work/report-contract` 导入各业务模块 manifest。
- 平台模块自身 manifest 拆到 `apps/platform-api/src/seeds/platform-module-manifest.ts`。
- approval / report manifest 落 `status='disabled'`，且不下发权限点和菜单。
- presence manifest 与 `docs/rfc/m4-presence-mvp.md` §5、§6 完全一致，包含 `status:manage` 权限和 `/presence/register` 菜单。
- 在已 seed 过的库上重跑 `pnpm db:seed` 保持幂等。
- verification-log 锚点：`M3.5-A Manifest Single Source`。

3.5-A 完成后顺序：

```text
M3.5-B  ADR-0003 Gateway 边界（保留内嵌、补 ADR 锁定 M4–M6 范围）
M3.5-C  登录失败审计 + 锁定策略落地
M3.5-D  首次登录改密 + 管理员重置密码端点
M3.5-E  Platform 数据范围 resolver（PlatformScopeService）
M3.5-F  Shell 引入 react-router-dom@6，路由拆组件
M3.5-G  跨 schema 数据访问规则文档化（module-contract.md 增加章节）
```

M3.5 全部退出后再启动 `M4-1: presence contract、schema、repository`。

本切片完成后，下一步为 `M3.5-B ADR-0003 Gateway 边界`。

### 6.1 M3.5 收口切片

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M3.5-A | 让模块 manifest 由各 contract 包统一供给 | Done | 2026-05-21 完成；业务模块平台侧 manifest 已迁回各 contract 包；详见 verification-log `M3.5-A Manifest Single Source` |
| M3.5-B | ADR-0003 Gateway 边界 | Pending | 保留内嵌，补 ADR 锁定 M4-M6 范围 |
| M3.5-C | 登录失败审计 + 锁定策略落地 | Pending | M3.5-B 后启动 |
| M3.5-D | 首次登录改密 + 管理员重置密码端点 | Pending | M3.5-C 后启动 |
| M3.5-E | Platform 数据范围 resolver | Pending | M3.5-D 后启动 |
| M3.5-F | Shell 引入 react-router-dom@6，路由拆组件 | Pending | M3.5-E 后启动 |
| M3.5-G | 跨 schema 数据访问规则文档化 | Pending | M3.5-F 后启动 |
````

【改为】（目标态；`YYYY-MM-DD` 填执行交付当天的实际日期）：

````markdown
## 6. 当前下一步

当前建议执行：

```text
M3.5-B2: ADR-0004 跨进程鉴权（Phantom Token）
```

上一切片任务包：`docs/tasks/m3-5-b-adr-gateway-boundary.md`。

M3.5-B 完成结果：

- 新增 `docs/adr/0003-gateway-boundary.md`：固定 gateway-api 在 M4–M6 作为 API 组合宿主内嵌业务模块，M7 起拆为独立业务服务 + 纯边缘网关，拆分时点硬绑定 M7 里程碑。
- 修正 `docs/architecture.md` 中与实现漂移的 gateway 描述。
- `docs/foundation-blueprint.md` M7 交付清单补充业务服务拆分项。
- verification-log 锚点：`M3.5-B Gateway Boundary ADR`。

M3.5 收口切片剩余顺序：

```text
M3.5-B2 ADR-0004 跨进程鉴权（Phantom Token）
M3.5-C  登录失败审计 + 锁定策略落地
M3.5-D  首次登录改密 + 管理员重置密码端点
M3.5-E  Platform 数据范围 resolver（PlatformScopeService）
M3.5-F  Shell 引入 react-router-dom@6，路由拆组件
M3.5-G  跨 schema 数据访问规则文档化（module-contract.md 增加章节）
```

M3.5 全部退出后再启动 `M4-1: presence contract、schema、repository`。

### 6.1 M3.5 收口切片

| 切片 | 能力 | 状态 | 说明 |
| --- | --- | --- | --- |
| M3.5-A | 让模块 manifest 由各 contract 包统一供给 | Done | 2026-05-21 完成；业务模块平台侧 manifest 已迁回各 contract 包；详见 verification-log `M3.5-A Manifest Single Source` |
| M3.5-B | ADR-0003 Gateway 边界 | Done | YYYY-MM-DD 完成；ADR-0003 固定 gateway M4–M6 内嵌、M7 拆分；详见 verification-log `M3.5-B Gateway Boundary ADR` |
| M3.5-B2 | ADR-0004 跨进程鉴权（Phantom Token） | Pending | M3.5-B 后启动 |
| M3.5-C | 登录失败审计 + 锁定策略落地 | Pending | M3.5-B2 后启动 |
| M3.5-D | 首次登录改密 + 管理员重置密码端点 | Pending | M3.5-C 后启动 |
| M3.5-E | Platform 数据范围 resolver | Pending | M3.5-D 后启动 |
| M3.5-F | Shell 引入 react-router-dom@6，路由拆组件 | Pending | M3.5-E 后启动 |
| M3.5-G | 跨 schema 数据访问规则文档化 | Pending | M3.5-F 后启动 |
````

> 【原文】与【改为】两块最外层的 4 反引号围栏只是本任务包用来包住块内 ```text 三反引号围栏的外壳。匹配 old_string、写入 new_string 时都**不含**这对最外层 4 反引号；但块内的 ```text ... ``` 三反引号围栏是 `foundation-progress.md` 的真实内容，必须保留。替换只影响 §6 与 §6.1，`## 7.` 及之后一律不动。

### 7.2 `docs/verification-log.md`

顶部追加一条记录。**日期标题去重**：今天若已存在 `## 2026-05-22` 标题（M3.5-A 当天的记录），不要再新增一个同名日期标题，直接在该标题下追加 `### M3.5-B Gateway Boundary ADR` 小节；只有当顶部日期不是交付当天时才新增 `## YYYY-MM-DD`。

`### M3.5-B Gateway Boundary ADR` 小节至少包含：

- **Change set**：新增 `docs/adr/0003-gateway-boundary.md`；修正 `architecture.md` gateway 的两处描述；`foundation-blueprint.md` M7 交付清单补充业务服务拆分项。
- **Verification**：`git status --short` 确认改动仅 5 个 `.md` 文件；§6.2 自查清单 A 的 8 项与 B 的 2 项逐项确认通过。
- **Follow-up**：下一切片 `M3.5-B2 ADR-0004 跨进程鉴权（Phantom Token）`。

## 8. 提交规范

按 Conventional Commits 单次提交。使用显式 `git add <files>` 列出文件，不要用 `git add -A` / `git add .`。

包含在本次 commit 内的文件：

new:
- `docs/adr/0003-gateway-boundary.md`

modified:
- `docs/architecture.md`
- `docs/foundation-blueprint.md`
- `docs/foundation-progress.md`
- `docs/verification-log.md`

**不要**包含：
- `docs/tasks/m3-5-b-adr-gateway-boundary.md`（本任务包，由审查者维护）。
- `.tmp/` 或任何本地缓存。

Commit 模板：

```
docs: add ADR-0003 for gateway boundary

Record that gateway-api hosts business modules in-process during
M4-M6 (API composition host) and splits into standalone services
plus a thin edge gateway at M7. Fix the architecture.md gateway
description that drifted from the current implementation, and add
the business-service split to the M7 deliverables in the blueprint.
```

## 9. 完成确认

在交付说明里列出：

- `git status --short` 输出（确认只动上述 5 个 `.md` 文件）。
- §6.2 自查清单 A 的 8 项 + B 的 2 项逐项结论。
- commit hash 与 `git show --stat <hash>` 输出。
- 确认 `docs/foundation-progress.md` §6.1 表已新增 `M3.5-B2` 行，且 `M3.5-C` 启动条件已顺延为"M3.5-B2 后启动"。
