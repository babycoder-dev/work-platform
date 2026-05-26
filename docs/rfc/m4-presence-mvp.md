# RFC: M4 在位管理 MVP

## 状态

Accepted

## 1. 目标

M4 的目标是用“在位管理”验证平台基建能否承载第一个真实业务模块：

- 员工可以登记本人当前或未来一段时间的在位状态。
- 有权限的用户可以查看组织范围内的当前在位看板。
- 在位模块使用 Platform Core 的登录态、员工身份、权限、菜单、数据范围和审计链路。
- 在位模块拥有自己的 contract、API、Web、repository 和数据库 schema，不能把业务状态写入 `platform` schema。

M4 完成后，系统应具备可内部试用的最小在位管理能力，并为审批、日/周报模块提供可复用的业务模块落地模式。

通用术语以 `docs/domain-glossary.md` 为准；本文只定义在位管理在 M4 阶段的具体落地规则。

## 2. 非目标

M4 不实现：

- 复杂排班、考勤打卡或薪酬考勤统计。
- 与请假审批的自动联动。
- 日历视图、冲突提醒推送、IM 通知。
- 移动端或 Qt 原生客户端界面。
- 高级自定义状态类型管理后台。
- 多企业复杂隔离策略之外的租户运营后台。

这些能力在后续审批、通知、日历、客户端阶段继续扩展。

## 3. 当前基础

已有代码基础：

- `modules/presence/contract` 已定义 `presenceManifest`、权限点、状态 DTO 和 `presence.status.changed` 事件名。
- `modules/presence/api` 已在 M4-1/M4-2 实装 PostgreSQL repository、scope-aware service、审计和事件。
- `modules/presence/web` 已在 M4-3 实装看板和登记表单，接入真实 API。
- Web Shell 已从 Platform Core 获取权限菜单，并能加载 presence Web 模块。

M4 的首要任务是替换 mock 业务逻辑，同时保持这些模块边界不变。

## 4. 业务模型

### 4.1 状态类型

首期固定状态类型：

```text
working
business_trip
field_research
out
leave
```

含义：

| status | 中文 | 用途 |
| --- | --- | --- |
| `working` | 在岗 | 默认状态，通常不需要员工主动登记 |
| `business_trip` | 出差 | 跨城市或跨区域工作安排 |
| `field_research` | 外出调研 | 调研、拜访、现场走访 |
| `out` | 外出 | 短时间离开办公地点 |
| `leave` | 休假 | 已批准或允许登记的休假状态 |

状态类型首期写入 contract，不做数据库可配置。后续如果需要后台配置，再新增 `presence.status_types`，不得破坏已有枚举值。

### 4.2 状态记录

状态记录表示一个员工在一个时间区间内的在位状态：

```text
id
enterprise_id
user_id
employee_no
user_name
department_id
department_name
status
start_at
end_at
remark
created_by
created_at
updated_at
cancelled_at
```

时间字段使用 `timestamptz`，API 使用 ISO 8601 字符串。前端按用户浏览器时区展示，后端不保存本地化显示文本。

员工、部门快照字段用于在位记录历史回看。当前组织信息以 Platform Core 为准；历史记录不因员工改名或调部门而被改写。

### 4.3 当前状态计算

某个员工在某个查询时间点 `at` 的当前状态按以下规则计算：

- 只考虑 `cancelled_at IS NULL` 的记录。
- `start_at <= at` 且 `(end_at IS NULL OR end_at > at)` 的记录视为生效。
- 如果存在多条生效记录，使用 `created_at` 最新的一条。
- 如果没有生效记录，默认视为 `working`。

首期允许用查询计算当前状态，不强制维护物化表。若后续看板性能不足，再引入 `presence.current_statuses` 投影表。

### 4.4 冲突规则

创建本人状态记录时：

- `startAt` 必须小于 `endAt`；无 `endAt` 表示持续到手动取消或被下一条记录覆盖。
- 同一员工不允许存在时间区间重叠的未取消非 `working` 记录。
- 创建 `working` 记录不作为首期 UI 主流程；员工回到在岗状态优先通过结束或取消当前非在岗记录表达。
- 普通员工只能登记本人状态。
- `presence:status:manage` 可为数据范围内员工登记、取消或修正状态；该能力 M4 首期只预留，不做完整管理 UI。

## 5. 权限与菜单

沿用现有 presence 权限点：

```text
presence:board:view
presence:status:create
presence:status:manage
```

权限语义：

| 权限 | 语义 | M4 要求 |
| --- | --- | --- |
| `presence:board:view` | 查看在位看板 | 必须实现 |
| `presence:status:create` | 登记本人状态 | 必须实现 |
| `presence:status:manage` | 管理团队状态 | 预留接口能力，管理 UI 可延后 |

菜单：

```text
/presence/board    -> presence:board:view
/presence/register -> presence:status:create
```

菜单仍由 Platform Core 的 module manifest 派生，Shell 不直接维护 presence 菜单。

## 6. API 契约

服务内部前缀：

```text
/api/presence
```

对外稳定入口后续由 gateway 暴露：

```text
/api/v1/presence
```

首期 API：

```text
GET  /api/presence/board
GET  /api/presence/status-records/my
POST /api/presence/status-records
DELETE /api/presence/status-records/:id
```

查询参数：

```ts
interface PresenceBoardQuery {
  departmentId?: string;
  status?: PresenceStatus;
  at?: string;
}
```

返回：

```ts
interface PresenceBoardItemDto {
  userId: string;
  employeeNo: string;
  userName: string;
  departmentId: string;
  departmentName: string;
  status: PresenceStatus;
  sourceRecordId?: string;
  startAt?: string;
  endAt?: string;
  remark?: string;
}

interface PresenceBoardResponse {
  items: PresenceBoardItemDto[];
  at: string;
}
```

创建输入：

```ts
interface CreatePresenceStatusRecordInput {
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  remark?: string;
}
```

取消状态记录：

- 普通员工只能取消本人记录。
- 管理员只能取消数据范围内员工记录。
- 取消必须写审计。

## 7. 数据范围

在位看板必须使用 Platform Core 当前用户的数据范围：

```text
self
department
department_tree
company
custom
```

M4 首期规则：

- `self`：只能看到本人当前状态。
- `department`：看到当前部门员工。
- `department_tree`：看到当前部门及下级部门员工。
- `company`：看到企业全部 active 员工。
- `custom`：M4 不实现自定义范围编辑；遇到 `custom` 时按 `self` 降级，并记录后续任务。

在位模块不得直接读取 `platform.*` 表。员工列表来源有两种允许路径：

- 调用 Platform Core 公开员工查询 API。
- 后续通过 platform employee 事件维护只读投影表。

M4 首期优先使用 Platform Core API 或 SDK 获取员工列表，再叠加 `presence.status_records` 计算当前状态。

## 8. 数据库与 Repository

新增 schema：

```text
presence.status_records
```

首期表结构：

```text
id uuid primary key
enterprise_id uuid not null
user_id uuid not null
employee_no varchar(64) not null
user_name varchar(128) not null
department_id uuid not null
department_name varchar(128) not null
status varchar(32) not null
start_at timestamptz not null
end_at timestamptz null
remark text null
created_by uuid not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
cancelled_at timestamptz null
```

约束：

- `status` 必须属于 contract 中定义的枚举。
- `end_at IS NULL OR start_at < end_at`。
- 常用索引：`(enterprise_id, user_id, start_at)`, `(enterprise_id, department_id, start_at)`, `(enterprise_id, status, start_at)`。

Repository 边界：

```text
PresenceRepository
  listActiveRecords(query)
  listUserRecords(userId)
  createRecord(input)
  cancelRecord(recordId, actor)
  findOverlappingRecord(userId, startAt, endAt)
```

M4 不允许 controller 直接访问数据库客户端。

## 9. 审计与事件

写操作必须写入 Platform Core 审计或通过统一审计端口写入：

```text
presence.status.create
presence.status.cancel
```

审计 metadata 至少包含：

```text
targetUserId
status
startAt
endAt
```

创建或取消状态记录后发布领域事件：

```text
presence.status.changed
```

M4-M6 阶段只要求事件可追踪，不要求通知推送。notification、realtime 和 IM adapter 的真实推送在 M7 做闭环。

## 10. Web UI

M4 Web 首期只做工作台内页面：

- `/presence/board`：看板列表、状态筛选、部门筛选、查询时间点。
- `/presence/register`：本人状态登记表单。

交互要求：

- 表单必须有加载、成功、失败、校验错误状态。
- 看板必须能区分空状态、加载失败、无权限。
- 不在 Web 模块中硬编码菜单；菜单仍来自 Platform Core。
- 页面保持业务模块边界，不把 presence 页面实现塞进 Shell。

## 11. 切片计划

M4-0：RFC 与契约设计

- 完成本文档。
- 对齐现有 contract/API/Web 占位与首期 MVP 范围。

M4-1：contract、schema、repository

- 更新 `@work/presence-contract` DTO。
- 新增 presence migration。
- 实现 `PresenceRepository` 与 PostgreSQL repository。
- 保留内存 repository 作为测试 fixture。
- 覆盖 repository integration tests。

M4-2：API、权限、审计

- API 接入 Platform Auth 和 permission guard。
- 创建、取消状态写审计。
- Board 查询应用数据范围。
- E2E 覆盖成功、401、403、非法入参、冲突记录。

M4-3：Web 页面

- 实现看板和登记表单。
- 接入统一 HTTP client。
- 覆盖组件或路由状态测试。

M4-4：交付验证

- `pnpm verify`。
- `pnpm test:db`。
- PostgreSQL E2E。
- Docker Compose build。
- 浏览器 smoke。
- CI 通过。

## 12. 测试要求

M4 必须覆盖：

- 状态时间区间校验。
- 重叠状态拒绝。
- 当前状态计算规则。
- 默认 `working` 状态。
- 本人登记成功。
- 未登录返回 401。
- 无权限返回 403。
- 数据范围过滤。
- 审计写入。
- 事件发布。
- Web Shell 菜单进入 `/presence/board` 和 `/presence/register`。

## 13. 退出标准

M4 完成必须满足：

- 在位状态记录持久化到 `presence` schema。
- 看板从真实 API 读取当前状态。
- 员工状态登记从真实 API 写入记录。
- 权限、菜单、审计和数据范围全部走 Platform Core。
- 无 mock 用户、mock 部门或进程内数组参与生产路径。
- 本地验证、Docker build、浏览器 smoke 和 CI 均通过。

## 14. 已决定事项

- 当前状态计算首期使用查询计算，不引入投影表。
- `working` 是默认状态，不要求每个员工创建在岗记录。
- presence 模块不直接读取 `platform.*` 表。
- M4 不实现通知推送，只发布可追踪事件。
- `custom` 数据范围首期按 `self` 降级并记录后续任务。
