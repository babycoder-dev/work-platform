# RFC: M9 在位状态 v2（基于人员管理，UX 一体）

## 状态

Accepted（两轮独立评审已修订 + 最终拍板）｜ 起草 2026-07-01、二审 + 三审修订 + 定稿 2026-07-01 ｜ 依据 `docs/product-requirements.md` §4.5、§7、§8，`docs/adr/0005-product-replan-roadmap.md`，承接 M4 presence MVP 与 M8 人员/组织/档案

> 阅读约定沿用需求文档：每项能力标 **【本期做】/【预留】/【不做(vNext)】**。预留项必须留好数据模型 /
> 接口 / 事件名并写清未来用途，不留无人知晓的空白字段。

> **2026-07-01 最终拍板**（§18）：①状态类型删除 = archive 停用（占用保护）、②"在岗" = 缺省态不强制登记
> （M10 日报据此判定）、③状态字典管理权限仅授 HR / 系统管理员。RFC 转 Accepted。

> 二审（独立 sub-agent）发现并已修订：**C1** 导出/看板聚合读 forms 填报值须过 forms 数据范围门（勿共享
> `board:view`）、**M1** `forms:presence-definition:*` 当前未 seed 且守护测试主动排除（M9-2 三步注册 + 翻转测试）、
> **M2** 事件放宽类型不破但运行时须改 M7 订阅器消费 `statusLabel`、**M3** `is_default` 企业内唯一须 partial unique
> index 强制、以及 DROP status 枚举 CHECK / M9-3 拆分等 Minor。详见 §3/§5/§6/§7/§8/§9/§11/§13/§15/§16。

> 三审（换模型独立 sub-agent，2026-07-01）发现并已修订两个 Critical 的"连带后果推演不足"：**C-1** 拍板②使看板
> 数据来源**反转为员工名册 LEFT JOIN 离岗记录**（无记录者=在岗），牵出 `PlatformEmployeeLookupPort.listEmployeesByScope`
> 扩面（platform 侧改点）与 M10 判定复用；**C-2** forms 记录 API 面硬编码 profile.employee 单例，M9-2 实为**激活 +
> API 泛化**（append 创建/按 id 读，非 upsert），记录门 = `forms:record:*` + data_type `'presence'`（`forms:presence-definition:*`
> 只管定义）。另修 **M-1** 重叠豁免硬编码 `'working'` 改键 `is_default` + 缺省态拒登、**M-2** 导出定为后端生成 +
> 依赖选型、**M-3** §15-9 扩为四切片过审，及 platform web `PresenceSection` 静默显示坏等 Minor。详见 §2–§9/§12/§13/§15–§17。

> 关键决策（§4）已由需求 §4.5 + 既有**预留基础设施**（forms `presence.status.${string}` 槽位、
> architecture.md 已列 `presence.status_types`、§7.5 看板实时化 follow-up）基本预决；三审勘误了其中"激活即用"
> 的两处过度乐观（见上），其余仍为落地口径。

## 1. 目标

把 M4 的在位 MVP 升级为**以人员管理为基座、UX 与人员域一体**的在位 v2。M4 交付了硬编码 5 状态、区间登记、
按数据范围看板、`presence.status.changed`→通知 一条链路；M9 在此之上补三件事，且**全部消费前面已建/已预留的
基建，不重造**：

1. **状态类型可自定义**【本期做】：把硬编码枚举升级为 **presence 拥有的状态字典**（预置 在岗/出差/外出调研/
   外出/休假；HR/管理员可增减改）。
2. **自助登记 v2 + 每状态填报字段**【本期做】：员工出发前自助登记状态；每个状态的填报字段由 **M6 动态表单**
   配置（**激活 forms 早已预留的 `presence.status.<typeKey>` 槽位家族**），其他信息由**档案自动补全**（前端聚合）。
3. **看板实时化**【本期做】：看板按**数据权限 + 实时组织归属**呈现成员当前状态，收口 §7.5——不再用登记记录里
   的**部门快照**过滤（M8-5a 已在按人查询端点用实时部门 + `matchesScope`，M9 把看板统一到同一口径）。
4. **Excel 导出**【本期做（基础）】：可选列导出，权限跟随查看权限；**导出体验细化**属【可后做】。

M9 是**第一个"用满"人员域（M8 档案/组织/数据范围）+ 动态表单（M6）+ 通知（M7）三块基建的业务闭环**，
验证"以人为中心"的一体 UX。

## 2. 非目标

- **不把 presence 并入人员域 schema**（延续 M8 §2 决策）：presence 保持**独立模块 / 独立 `presence.*` schema /
  独立迁移入口 `db:migrate:presence`**；人页与看板的"人 + 在位 + 档案"一体由**前端聚合**，不在后端合并 schema。
- **不重造表单引擎**：每状态填报字段=消费 M6 forms `presence.status.<typeKey>` 槽位（已在 `slots.ts` 预留为
  `reserved`）。M9 **激活槽位并泛化 forms 记录 API 面**（现有记录 HTTP 面硬编码 profile.employee 单例，见 §3），
  但**不写第二套字段定义/记录表**——definition/record 存储与字段引擎全复用。
- **不做审批联动**（请假批准→自动登记在位）：那是 M11，通过领域事件/公开 API 完成；M9 只把状态字典与登记备好供其消费。
- **不做更细的状态筛选 / 分部门分组展示**【可后做】：属展示层，后端数据就绪后做（需求 §4.5 明标）。
- **不做导出体验细化**（模板/异步大导出/样式）【可后做】：本期做"可选列 + 同步导出"够用即可。
- **不做多层部门在看板的完整下钻**：延续两层展示约束（vNext）。
- **不改跨进程事件传输**：延续 M7/M8 的进程内 `EVENT_BUS`；服务拆分与可靠传输属既有 follow-up（不在 M9）。

## 3. 现状盘点（决定本期只补缺口 / 激活预留，不重造）

| 现状                                   | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `presence.status_records`（M4）        | 区间记录（15 列）：`status`(枚举**带 CHECK 约束**) + `startAt/endAt/remark` + **冗余快照** `userId/employeeNo/userName/departmentId/departmentName` + `createdBy/createdAt/updatedAt/cancelledAt`。**改点**：`status` 枚举→状态字典 key（须 DROP 现有 CHECK，见 §11）；看板过滤别再吃 `departmentId` 快照。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `PresenceStatus` 枚举                  | `working\|business_trip\|field_research\|out\|leave` 硬编码在 `presence-contract` `events.ts`；中文标签在 web `StatusBadge.tsx`。**改点**：升级为运行时字典，枚举退化为**预置种子 + 事件契约的开放字符串**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PresenceStatusService`                | `getBoard`（按 presence scope self/company/department，**吃快照 departmentId**，且**纯记录查询**——只能产出"有记录的人"，见 §9 数据来源反转）、`getEmployeeStatus`（M8-5a：**已用 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 实时部门 + `matchesScope`**，是看板要对齐的范式）、`listOwnRecords`、`createRecord`（本人自助登记 + 重叠 409 + 发事件 + 审计；**重叠豁免硬编码 `status <> 'working'`**——postgres `:169` / in-memory `:84`，字典化后须改键 `is_default`，见 §6）、`cancelRecord`。**M4 遗留（非 M9 范围，结转 §7 follow-up 登记）**：`cancelRecord` 仓库层 `WHERE id=$1` 无 `enterprise_id` 复核（单租户无现实攻击面，同 M8-S 一类）；`PresenceBoardQuery`（`status.dto.ts:27-31`）无 controller 消费属陈旧契约，其 `status` 类型放宽时顺手处理。**另注意 presence controller `@Body()` 裸接收、无 DTO 校验管道**——DROP CHECK 后服务层校验是唯一防线（§6/§12）。 |
| forms `presence.status.${string}` 槽位 | **槽位注册已在 `modules/forms/contract/src/slots.ts` 预留**：`resolveFormSlot` 对任意 `presence.status.<key>` 返回 `ownerModule:'presence'` / `cardinality:'append'` / 权限 `forms:presence-definition:{view,manage}`，但 `status:'reserved'`。**⚠️ 但记录 HTTP API 面并不通用**：`forms.service.ts:194/226` 经 `assertProfileEmployeeSlot`（`:478-482`）**硬编码 profile.employee，其他槽位一律 404**，且读写是 singleton 语义（`findRecordBySubject → saveRecord`）。presence 槽位是 **append**（每次登记一条新记录、需返回记录 id）。**故 M9-2 = 激活槽位 + 泛化 forms 记录 API**（新增 append 创建 / 按 id 读路径），不是"激活即用"；授权 data_type 用既有 `'presence'`（`seed-platform.ts:228` 三类之一，`resolveScope(currentUser,'presence')`），**不新增 data_type、不动 scope 模型**。                                                                     |
| `presence.status_types` 表             | **`docs/architecture.md` §4 已列该实体**但尚未建表。M9 落地。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| §7.5 看板 follow-up                    | 已登记：`getBoard` 仍按登记快照部门过滤，员工换部门短暂不一致，**待 M9 统一**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 权限                                   | 现有 `presence:board:view` / `presence:status:create` / `presence:status:manage`。`forms:presence-definition:{view,manage}` **当前未 seed**——只以字符串字面量存在于 `slots.ts:66-67`，不在 `forms/contract` 的 `formsPermissionDefinitions`（仅 6 条），且 `apps/platform-api/src/seeds/seed-data.spec.ts:84-89` 用 `.not.toContain` **主动断言 seed 里没有它们**（verification-log:2012 "kept reserved and unregistered"）。**M9-2 必做三步**：加进 `formsPermissionDefinitions` + 注册进 platform seed + **翻转该守护测试**（`.not.toContain`→`toContain`，否则 CI 红）。                                                                                                                                                                                                                                                                                         |
| 事件                                   | `presence.status.changed`（created/cancelled）→ M7 通知部门负责人已跑通；payload 带 `status`。**类型契约不会破**：notification 侧 `notification-event.subscriber.ts:10-19` **本地重定义** `PresenceStatusChangedPayload`（硬编码 union，不 import presence-contract），放宽 presence-contract 联合类型不触发其编译错误。**真回归在运行时**：`formatPresenceStatus`（`:109-118`）是枚举→中文穷举 + `?? status` 兜底，自定义 key 会显示原始 key（如"登记了 vip_visit"）。**改点**：payload 附 `statusLabel`（硬需求，非"倾向"）+ **M9-1 须改 M7 订阅器消费 statusLabel**（改本地 interface + `buildPresenceContent`，跨模块任务）。                                                                                                                                                                                                                                   |
| web                                    | `presence/web` 看板 + 登记（M4）。**改点**：状态字典管理 UI（新）、自助登记 v2（按状态动态表单 + 档案补全）、看板实时化 + 状态字典驱动的展示、导出入口。**⚠️ 硬编码消费点不止 presence web**：platform web `PresenceSection.tsx:3-14`（M8-5b 人页抽屉）本地镜像 `PresenceStatus` union + `PRESENCE_LABELS` + 按 status 的颜色/CSS class——字典化后显示裸 key / 颜色缺失；且 `StatusBadge.tsx:3` 的 `Record<PresenceStatus,string>` 在类型放宽为 string 后**退化为 `Record<string,string>`，不会编译报错**，是静默显示坏，**编译器不兜底、须主动改**。缓解：看板/按人查询响应**随行下发 `statusLabel`（+可选颜色/分类）**，两处 web 消费 label 而非本地映射；platform web 改点列入 M9-3b。                                                                                                                                                                            |

## 4. 关键决策（已基本预决，附理由）

- **D1 状态字典归属 = `presence.*`**：新建 `presence.status_types`，由 presence api 拥有 CRUD。理由：schema-per-module
  隔离下，状态字典是 presence 自身领域配置；放 platform 会让 presence 跨 schema 读配置、击穿边界。architecture.md
  早已把它列在 `presence.*`。
- **D2 每状态填报字段 = 激活 M6 `presence.status.<typeKey>` 槽位 + 泛化 forms 记录 API**：不新建字段定义/记录表
  （definition/record 存储与字段引擎全复用），但现有 forms 记录 HTTP 面硬编码 profile.employee 单例（§3），M9-2 须
  **新增 append 语义路径**（按槽位创建一条新记录并返回 id / 按 id 读；**不是 upsert**——append 下 upsert 会覆盖上次
  出差的填报值）。记录授权用既有 data_type `'presence'`（`resolveScope(currentUser,'presence')`），不新增 data_type、
  不动 scope 模型。**填报值落 forms 记录**，presence 记录只存**必要冗余**（状态 key、时间、`form_record_id`），读时前端聚合。
- **D3 presence 保持独立模块，人页/看板前端聚合**：延续 M8。人 + 在位 + 档案的一体感在**前端**完成；后端各守 schema。
- **D4 看板实时化 = 收口 §7.5，且数据来源反转（拍板②连带后果）**：在岗=缺省态意味着看板必须呈现"范围内**全体**
  成员"而非"有记录的人"——数据来源从"记录优先"反转为 **"范围内员工名册 LEFT JOIN 活跃离岗记录"**（无记录者显示
  在岗）。名册来自 platform：**需扩 `PlatformEmployeeLookupPort`**（现只有 `listEmployeesByIds`，无按范围列名册方法，
  见 §9）。授权/部门展示用**实时部门 + `matchesScope`**，与 `getEmployeeStatus` 同口径；冗余快照仍保留（审计/历史
  可读），但**不再作为授权与过滤依据**。
- **D5 记录模型渐进升级**：`status` 枚举 → 状态字典 key（迁移把现有 5 枚举值种子成 preset 状态类型，key 不变→**数据
  向后兼容**）；区间 + 重叠语义保留；新增可空 `form_record_id`（关联该次登记的 forms 记录，无填报字段时为空）。

## 5. 能力设计（本期做）

### 5.1 状态字典（presence.status_types）

- 字段（详见 §6）：`key`（稳定标识，创建后不可改）、`label`（可改显示名）、`isPreset`（预置不可删，可停用）、
  `isDefault`（"在岗"缺省态标记，见 §18-②）、`status`（active/archived）、`sortOrder`、审计列。
- 管理 API：列出 / 新建 / 改名改序 / 停用归档。**删除语义一律 archive、不提供硬删接口**（§18-① + 消除"占用检查与
  并发登记之间的 TOCTOU 孤儿 key"竞态——硬删与新登记并发会产生引用已删 key 的记录；archive-only 从根上避免）。
- 预置种子：在岗(working,default)/出差(business_trip)/外出调研(field_research)/外出(out)/休假(leave)——与 M4 枚举 key
  一致，保证记录与事件向后兼容（需求 §4.5 预置仅列"在岗/出差/休假"3 个，此处取 M4 已有 5 值**超集**，兼容既有数据）。
- 每个 active 状态类型可**可选**地在 M6 配一份 `presence.status.<key>` 表单定义（填报字段）；无定义=仅 `remark`。

### 5.2 自助登记 v2

- 员工在登记某状态时：前端读该状态的 `presence.status.<key>` forms 定义（若 active 且有定义）→ 渲染填报字段；
  **档案已有信息（部门/职务/手机等）由前端从人页聚合自动补全**——**仅读本人档案（`me`，profile self 范围）**，
  登记流程不因此扩大对他人档案的读面。
- 提交次序：**① 服务层校验状态 key 存在且 active**（未知/archived 拒绝；**缺省态（`is_default`）不可登记**——在岗
  即"无离岗记录"，登记接口对 default key 拒绝，web 也不提供该选项）→ **② 重叠 409 判定**（豁免键从硬编码
  `status <> 'working'` 改为**按 `is_default` 排除**，兼容历史 working 记录，见 §6）→ ③ presence 建区间记录 +
  若有填报字段则**创建一条 forms `append` 记录**（**非 upsert**——append 语义下 upsert 会覆盖上一次登记的填报值；
  创建后把返回的记录 id 写入 `form_record_id`）→ ④ 发 `presence.status.changed`。
- **写 forms 记录经 forms 的 `forms:record:submit` + data_type `'presence'` 数据范围门**（本人写自身 subject 记录，
  复用 M8-5a subject 授权范式；`forms:presence-definition:*` 只管**定义**的看/配，不是记录门），presence 不旁路直写 forms 表。
- `remark` 作为内建自由文本保留（所有状态可用），与 forms 填报字段并存。

### 5.3 看板（实时化）

- 按 viewer 的 `presence` 数据范围 + **实时组织归属**呈现范围内**全体**成员当前状态（D4 数据来源反转：员工名册
  LEFT JOIN 活跃离岗记录，无记录者=在岗）。看板响应 DTO 随行下发 `statusLabel`（web 消费 label，不再本地映射枚举）。
- "不在位" = 当前**有活跃非缺省态记录**的所有人（在岗为缺省态，§18-②）。
- **人页在位区语义随之变**：platform web `PresenceSection` 现对 `record:null` 显示"当前无在位记录"，拍板②后应显示
  **"在岗（缺省）"**。注意 M8-5a 语义下**越权与无记录同为 `record:null`（刻意不可区分=不泄露）**，故越权者的抽屉
  也会显示"在岗（缺省）"——可接受（不泄露且列表本就按 profile 范围过滤）；error（500/网络）仍另显错误态不混同。
- 【可后做】按状态筛选、分部门分组、更细展示——后端数据就绪，展示层后续切片做。

### 5.4 Excel 导出（基础）

- 导出当前看板范围的成员状态，**可选列**（姓名/工号/部门/状态/起止/备注）；presence 自有列（状态/时间/备注/
  快照）权限**跟随 `presence:board:view`**（有查看即可导出其可见范围，不额外加权限点）。
- **实现落点 = presence api 后端同步生成**（非前端拼 xlsx）：§10 要求导出审计记 actor/范围/列集/行数，只有后端
  端点能可靠审计；数据也须走后端授权管线。**依赖选型**：repo 当前无任何 xlsx 库，引入 **`exceljs`（MIT）**（或
  等价 MIT/Apache 许可库），按 AGENTS「不引入未审查三方源」先过依赖审查（许可证 + 供应链），选型结论记入 M9-4 任务包。
- **⚠️ forms 选填字段（`presence.status.<key>` 填报值）不得只凭 `board:view` 导出/展示**（见 §9 C 项）：这些值有
  forms 自己的数据范围门，导出含 forms 列时**每条按 forms slot 数据范围逐 subject 授权**，range 内无 forms 权限的
  字段列**留空 / 不导出**，不因"看板可见"就越权外发。
- 【可后做】导出模板、异步大导出、样式与本地化细化。

## 6. 数据模型 / schema（`presence.*`，并入 `db:migrate:presence`）

- **新表 `presence.status_types`**：`id`、`enterprise_id`、`key`(唯一/企业内)、`label`、`is_preset`(bool)、
  `is_default`(bool)、`status`('active'|'archived')、`sort_order`、`created_by`/`created_at`/`updated_at`、软删或
  archive 二选一（倾向 archive 位，见 §18-①）。唯一约束 `(enterprise_id, key)`。**`is_default` 企业内唯一必须靠
  DB 强制**（并发两个"设为缺省"事务不能同时成功）：用 **partial unique index `UNIQUE (enterprise_id) WHERE
is_default AND status='active'`**，服务层设默认时在单事务内先清后置。仅声明"至多一行"不够。
- **改表 `presence.status_records`**：`status` 由枚举列改为**开放文本 key**（引用 status_types.key，DB 层不强制 FK
  以免跨迁移耦合）；新增可空 `form_record_id`。**迁移把现有值原样保留**（key 未变）。**服务层校验是唯一防线**
  （presence controller 现为 `@Body()` 裸接收、无 DTO 校验管道，DROP CHECK 后 DB 也不再拦）：登记时校验 key 存在
  且 active、**拒绝缺省态登记**（`is_default` 不可登记，§5.2）；**重叠 409 豁免键从硬编码 `'working'` 改为按
  `is_default` 排除**（postgres `:169` / in-memory `:84` 两处同改，历史 working 记录因 working=default 天然兼容）。
  错误映射注意：`postgres-error.mapper.ts:22-24` 的 CHECK 违反分支将死代码化，顺手清理或改注释。
- **不新开迁移入口**：并入 presence 既有 `db:migrate:presence`；`db:generate` 同步 Drizzle；双实现 repository
  （in-memory + postgres）同步。
- **forms 侧**：① 把 `slots.ts` 中 `presence.status.<key>` 家族从 `reserved` **激活**（`resolveFormSlot` 已支持动态
  key）；② **注册 `forms:presence-definition:{view,manage}` 权限**（当前未 seed，见 §3/§7 三步）；③ **泛化记录 API 面**
  （现硬编码 profile.employee 单例 + singleton 语义，见 §3）——新增 **append 创建（返回记录 id）/ 按 id 读**路径，
  记录授权走 `forms:record:{submit,view}` + 既有 data_type `'presence'`（不新增 data_type、不动 scope 模型）。
  forms **不新建表**（复用 definition/record 现有表 + append cardinality）。
- 种子：`presence.status_types` 预置 5 行（§5.1）；幂等。

## 7. 权限

- **新增** `presence:status-type:manage`（状态字典管理；归属见 §18-③）。进 presence contract `permissions.ts` +
  manifest + platform seed。
- **新注册** `forms:presence-definition:view` / `forms:presence-definition:manage`（**定义级**：每状态填报字段
  模板的看/配，非记录门）——**当前未 seed**，M9-2 三步：① 加进 `forms/contract` `formsPermissionDefinitions`；
  ② 注册进 platform seed；③ **翻转守护测试** `seed-data.spec.ts:84-89`（`.not.toContain`→`toContain`）。
- **记录级** = forms 既有 `forms:record:submit`（写）/ `forms:record:view`（读）+ data_type `'presence'` 数据范围。
  **角色配置面变化**：普通员工要跑通自助登记 v2，需在角色里同时持有 `presence:status:create` + `forms:record:submit`
  （+ 读定义所需权限）——seed 的默认员工角色须相应补齐，写进 M9-2 任务包与验收。
- **复用**：看板 `presence:board:view`、自助登记 `presence:status:create`、团队管理 `presence:status:manage`。
- 导出**不新增权限**：presence 自有列跟随 `presence:board:view`；forms 填报列另过 forms 记录门（§5.4/§9-C）。

## 8. 事件

- `presence.status.changed` 契约**保持**，payload `status` 从**联合枚举**放宽为**开放字符串**（状态字典 key），
  并**附加 `statusLabel`（硬需求）**。预置 key 不变，历史事件不受影响。
- **类型兼容**：notification 订阅器**本地重定义** payload（`notification-event.subscriber.ts:10-19` 硬编码 union，
  不 import presence-contract），故放宽 presence-contract 联合类型**不会破坏 notification 编译**——原"订阅方类型契约会破"是伪命题。
- **真回归在运行时（须主动修）**：`formatPresenceStatus`（`:104-118`）是枚举→中文穷举 + `?? status` 兜底，自定义
  状态 key 会显示原始 key（如"登记了 vip_visit 状态"）。因此 **M9-1 必须改 M7 订阅器消费 `statusLabel`**（改本地
  interface + `buildPresenceContent`，跨模块任务），使通知文案显示字典 label 而非裸 key。
- 【预留】审批联动事件（M11 请假批准→登记在位）沿用同一 `presence.status.changed` 或新增 `presence.status.requested`
  —— M9 不实现，仅在此登记未来接线点。

## 9. 数据范围 / 看板实时化（§7.5 收口，安全相关）

- **看板管线（数据来源反转，D4）**：resolve viewer `presence` scope → **按 scope 取员工名册**（self=本人 /
  department=范围部门 / company=全企业）→ LEFT JOIN 当前活跃**非缺省态**记录 → 名册内每行给出"状态（有记录）或
  在岗（缺省）"。授权以**名册（实时组织归属）**为准，不再"从记录出发再过滤"。
- **需扩 `PlatformEmployeeLookupPort`**：现只有 `listEmployeesByIds`，**无按部门/企业列名册的方法**——M9-3a 须在
  `@work/platform-contract` 端口 + platform-api 实现新增（如 `listEmployeesByScope(enterpriseId, departmentIds?)`，
  仅返回名册所需窄字段），这是 **platform 侧改点**（触 platform 端口面，M9-3a security-reviewer 覆盖）。M10 日报
  "仅在岗需报"复用同一名册 + 缺省态判定，勿另造一套。
- 按人查询（M8-5a 端点）继续用实时部门 + `matchesScope`；self/company/department 三态语义不变；**过滤依据统一为
  "subject 实时部门"**，不再吃记录快照。
- 越权 subject **不出现在看板名册**（不泄露存在性）；按人查询延续 M8-5a 的 `record:null` 语义。
- 性能：名册与记录各一次批量查询后内存 join，避免逐条 N+1。
- **C. forms 填报值的读取不共享 `presence:board:view` 门**：看板/按人页/导出若展示 `presence.status.<key>` 的
  forms 填报值，**每条按 forms 记录门逐 subject 授权**（`forms:record:view` + data_type `'presence'` 数据范围，
  延续 M8-5a 范式；`forms:presence-definition:view` 只管定义模板），不得因"看板可见该人"就把其 forms 字段值一并
  读出。`board:view` 只授权 presence 自有列（状态/时间/备注/快照）。这道门是 M9-2/M9-4 security-reviewer 的重点。

## 10. 审计

- 状态字典增删改（archive）→ 审计（actor、type key、前后 label/status/default）。
- 自助登记 / 取消 → 沿用 M4 审计（已覆盖）；填报字段值属业务数据，审计记 metadata（slot、字段数/摘要），不整表复制。
- 导出 → 审计一条（actor、范围、列集、行数），便于追溯敏感数据外发。

## 11. 迁移 / schema 影响

- `presence.status_types` 建表（含 `is_default` 的 partial unique index，§6）+ 5 行预置种子；
  `presence.status_records.status` 列语义放宽（**须显式 DROP 现有 status 枚举 CHECK 约束**，否则新字典 key 写入被拒）
  - 新增可空 `form_record_id`；并入 `db:migrate:presence`，不动 `db:setup` 链顺序。
- 双实现 repository 同步；Postgres-gated 集成测试覆盖新表/改列（注意 env-gate 假绿）。
- forms 侧无新表，仅槽位激活 + seed 权限核对。

## 12. 测试要求

- **单元**：状态字典 CRUD（archive-only、preset 不可删、key 不可改、default 唯一含并发）、自助登记 v2（有/无填报
  字段、forms append 记录联动**不覆盖上次填报**、重叠 409 **按 `is_default` 豁免**、**未知/archived/缺省态 key
  登记被拒**——服务层是唯一防线的直接断言）、看板实时化（**无记录者显示在岗**、换部门后归属随实时组织变、越权
  不泄露）、导出列选择 + forms 列越权留空。
- **e2e（in-memory）**：建状态类型 → 配 `presence.status.<key>` 表单 → 员工自助登记带填报 → 看板**名册含无记录者
  （在岗）**且按实时部门过滤 → `presence.status.changed` 通知本人链路仍绿（文案用 `statusLabel` 非裸 key）。
  **双向断言**：换部门后看板归属变化、越权 subject 不出现。
- **web**：状态字典管理页、自助登记 v2（动态表单 + 档案补全）、看板 v2（label 驱动显示，自定义 key 不显示裸 key）、
  导出、**platform web `PresenceSection` 语义迁移**（`record:null`→"在岗（缺省）"，label 消费非本地映射）（`*.spec.tsx`）。
- **Postgres-gated**：presence repository 集成测试覆盖新表/改列（确认 gate 真跑，source-review 非裸 grep）。
- 验收禁止假数据/占位蒙混（延续历次门禁）。

## 13. 安全要求

presence 只读写自己 schema，不落 platform 安全基线子树；但 **M9 有两处安全相关面，合并前相应切片过 security-reviewer**：

- **看板实时化改了"过滤依据"且扩 platform 端口（§9）**：过滤从记录快照部门改为名册（实时组织归属），并**新增
  `PlatformEmployeeLookupPort.listEmployeesByScope`**——这是共享模块可调的 platform 读端口扩面（同 M7-2 §7 读端口
  一类），须 security-reviewer 复核：端口只返回名册窄字段、调用方 scope 参数不可伪造放大（scope 由 presence 服务端
  resolve、不接受客户端传入）、越权不泄露、批量查询无绕过。
- **状态字典管理是新授权面**：`presence:status-type:manage` 的 guard 接线、企业内隔离（`enterprise_id` 复核）、
  archive vs 硬删。
- forms `presence.status.<key>` 激活：填报读/写复用 forms 既有 slot 数据范围门（M8-5a 已为 subject 读写授权立范式）；
  确认激活不绕过 forms 权限。
- **【重点】导出 / 看板聚合读 forms 填报值不得越过 forms 数据范围门**（§9 C 项 / C1）：`presence:board:view` 只授权
  presence 自有列；forms 选填字段的读取与导出必须逐 subject 过 `forms:presence-definition:view` + record 数据范围。
  M9-2（登记聚合读）与 M9-4（导出）的 security-reviewer 必须专门核这条越权外发面。
- `presence.status.changed` payload 放宽为开放字符串**不得夹带敏感值**（延续最小披露；附 `statusLabel` 属展示信息，非敏感）。

## 14. 本期做 / 预留 / 不做

| 能力                                                               | 状态           | 说明                                                      |
| ------------------------------------------------------------------ | -------------- | --------------------------------------------------------- |
| 状态字典（presence.status_types + 管理 + 预置种子 + 占用 archive） | 本期做         | D1                                                        |
| 自助登记 v2 + 每状态 M6 填报字段（激活 `presence.status.<key>`）   | 本期做         | D2，消费 forms 预留槽位                                   |
| 档案信息自动补全（前端聚合）                                       | 本期做         | 复用 M8 人页聚合                                          |
| 看板按数据权限 + 实时组织归属（收口 §7.5）                         | 本期做         | D4/§9                                                     |
| Excel 导出（可选列，权限随查看）                                   | 本期做（基础） | §5.4                                                      |
| 按状态筛选 / 分部门分组 / 更细展示                                 | 可后做         | 展示层，数据就绪后切片                                    |
| 导出体验（模板/异步/样式）                                         | 可后做         | §5.4                                                      |
| 审批联动（请假批准→登记在位）                                      | 预留           | M11，走事件/公开 API，presence 不被直接写                 |
| 状态到期自动回落在岗 / 定时清理                                    | 预留           | 可接 M7 调度；本期靠区间 `endAt` 计算当前态，不做自动 job |
| 桌面端在位 UI                                                      | 不做(vNext)    | web/桌面一致性设计保留                                    |

## 15. 后端退出标准

1. `presence.status_types` 建表 + 双实现 + 迁移 + 预置种子；CRUD（含 preset 不可删、key 不可改、default 唯一、占用
   archive 保护）落地；`presence:status-type:manage` 进 manifest + seed。
2. `presence.status_records.status` 语义放宽为字典 key（DROP CHECK）+ `form_record_id` 增列；**现有数据向后兼容**
   （key 不变）；服务层校验落地：**未知/archived/缺省态 key 登记被拒**、重叠 409 豁免**按 `is_default`**（测试断言齐）。
3. 自助登记 v2 端到端：建类型 → 配 `presence.status.<key>` 表单 → 登记带填报 → forms **append** 记录创建（**不覆盖
   上次填报**）+ `form_record_id` 关联（e2e 绿，非 mock 蒙混）。
4. 看板实时化 + 数据来源反转：名册（`PlatformEmployeeLookupPort.listEmployeesByScope` 扩面）LEFT JOIN 活跃离岗记录，
   **无记录者显示在岗**；过滤依据实时部门 + `matchesScope`，换部门后归属正确、越权不泄露（e2e 双向断言）。
5. forms `presence.status.<key>` 槽位激活 + `forms:presence-definition:{view,manage}` **新注册进 seed 并翻转守护测试**
   （`seed-data.spec.ts` `.not.toContain`→`toContain`）；填报读/写授权不绕过；**导出/聚合读 forms 值不越 forms 门**（§9 C）。
6. `presence.status.changed` payload 放宽为开放 key **+ `statusLabel`**；**M7 订阅器已改为消费 `statusLabel`**（自定义
   状态不再显示裸 key），通知链向后兼容仍绿。
7. Excel 导出 = **presence api 后端同步生成**（依赖过三方审查，如 exceljs/MIT）：presence 列随 `presence:board:view`、
   **forms 列逐 subject 过 forms 记录门**（越权留空）+ 导出审计（actor/范围/列集/行数）。
8. 审计覆盖字典增删改 / 登记 / 导出；新权限点进 seed（含默认员工角色补 `forms:record:submit` 等，§7）。
9. security-reviewer 独立二审通过（**M9-1 字典管理 / M9-2 forms 读写门 / M9-3a 看板实时化+端口扩面 / M9-4 导出
   越权外发面，四切片各自过**）。
10. `pnpm verify` 全绿；涉 schema 变更确认迁移 + 双实现 + Postgres-gated 真跑。

## 16. 切片计划（初拟，定稿后可微调）

| 切片  | 范围                                                                                                                                                                                                                                                                                                                                                                                                                                            | 依赖            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| M9-1  | 状态字典后端：`presence.status_types` 建表（含 `is_default` partial unique index）+ 双实现 + 迁移 + 预置种子 + CRUD/**archive-only**（不提供硬删）+ `presence:status-type:manage` + 记录 `status` 放宽（**DROP 枚举 CHECK**，服务层校验：未知/archived/**缺省态拒登**）+ **重叠豁免改键 `is_default`**（postgres+in-memory 两处）+ `form_record_id` 增列 + 事件 payload 加 `statusLabel` + **改 M7 订阅器消费 statusLabel** + security-reviewer | —               |
| M9-2  | 自助登记 v2 + forms 槽位激活与 **API 泛化**：激活 `presence.status.<key>` + **注册 `forms:presence-definition:*` 权限并翻转 seed 守护测试** + **forms 记录 API 泛化**（解除 profile.employee 硬编码；append 创建返回 id / 按 id 读；授权 `forms:record:{submit,view}` + data_type `'presence'`）+ 登记消费每状态表单 + presence↔forms 关联 + **默认员工角色补记录权限**（§7）+ security-reviewer（forms 读写不越门）                            | M9-1、M6、M8-5a |
| M9-3a | 看板实时化后端（§7.5 收口，**安全敏感**）：**数据来源反转为名册 LEFT JOIN 活跃离岗记录**（无记录者=在岗）+ **扩 `PlatformEmployeeLookupPort.listEmployeesByScope`**（platform-contract 端口 + platform-api 实现，窄字段）+ `matchesScope` 批量 + 越权不泄露 + 看板响应随行下发 `statusLabel` + security-reviewer                                                                                                                                | M9-1、M9-2      |
| M9-3b | web v2（presence + platform 两处）：状态字典管理 UI + 自助登记 v2 UI（动态表单 + 档案补全）+ 看板 v2 UI（label 驱动，还原门禁）+ **platform web `PresenceSection` 语义迁移**（`record:null`→"在岗（缺省）"、消费 label 非本地映射——类型放宽不报编译错，须主动改）                                                                                                                                                                               | M9-3a           |
| M9-4  | Excel 导出：**presence api 后端同步生成**（xlsx 依赖选型过三方审查，如 exceljs/MIT）+ 可选列 + presence 列随 `board:view` / **forms 列逐 subject 过 forms 记录门（越权留空）** + 导出审计（actor/范围/列集/行数）+ 前端导出入口 + security-reviewer（越权外发面）                                                                                                                                                                               | M9-3b           |
| M9-5  | 交付验证门禁（verify/verify:full/docker + 假绿核查 + 浏览器 smoke + §14 对账 + 文档同步；类比 M8-6）                                                                                                                                                                                                                                                                                                                                            | M9-1..4         |

> 每切片自包含、独立验收、追加 verification-log；触及安全敏感面的切片合并前过 security-reviewer。
> web 切片走像素级还原门禁（development-workflow §7）：看板/登记有 M4 现状与设计稿则从严 L1，状态字典管理页无专稿则锚设计系统 L2。

## 17. 文档影响

- `docs/architecture.md`：`presence.status_types` 从"已列实体"补上 v2 说明（字典 + forms 槽位激活与记录 API 泛化 +
  看板名册反转）；`PlatformEmployeeLookupPort` 扩面（platform 读端口清单）。
- `docs/module-contract.md`：presence 权限点 + 路由补 `status-type` 管理与导出；forms 记录 API 泛化后的路由形态。
- `docs/security-baseline.md`：看板名册过滤口径 + `listEmployeesByScope` 读端口 + 状态字典管理授权（评估是否需补
  §5 数据范围执行说明）。
- `docs/foundation-progress.md`：M9 切片表 + §7.5 follow-up 在 **M9-3a**（看板实时化后端）收口后置 Done；**登记
  M4 遗留 follow-up**：`cancelRecord` 仓库层无 `enterprise_id` 复核（§3，单租户无现实攻击面，同 M8-S 一类，多租户
  启用前修）。
- `docs/doc-index.md` / `docs/verification-log.md`：各切片任务包与验收记录。

## 18. 最终拍板（2026-07-01，已决）

1. **状态类型删除语义 = archive 停用**：被历史记录引用的状态类型不可硬删，只能停用（archived，不可再选、历史记录
   仍可读）；preset 类型恒不可删、仅可停用。仿部门占用保护。
2. **"在岗" = 缺省态，不强制登记**：不要求人人登记在岗，看板对"当前无有效非在岗记录"者显示在岗；`is_default` 标记
   该类型。**M10 日报"仅在岗人员需报"直接用"无活跃离岗记录"判定在岗**——M10 RFC 据此口径。
3. **状态字典管理权限 = 仅 HR / 系统管理员**：`presence:status-type:manage` 只授系统管理员 / HR 角色；部门负责人
   不可改全局字典（全局枚举不被各部门私改）。

> 三项开放问题已拍板，本 RFC 转 **Accepted**，据 §16 切片计划从 M9-1 起。
