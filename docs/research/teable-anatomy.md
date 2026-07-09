# Teable 解剖报告（M17-M18 前置）

状态：已产出｜评审日期：2026-07-06｜时间盒：5 个工作日等效（按任务包优先级裁剪深度）

## 0. 结论摘要

1. **动态物理表路线没有发现需要翻案的重大反证。** Teable 的 base 对应 PostgreSQL schema，
   table 对应真实表，普通字段对应真实列；关系字段同时保留 JSONB 展示列，并用带真实外键的
   junction table 维护关系。这个模型适合 M17，但不能直接照搬其“应用运行账号拥有整个库 DDL
   权限”的部署姿态。
2. **建议搬运“MIT 内核 + 查询编译器的设计”，不要整体搬 apps。** `packages/core` 的字段类型、
   公式 parser/evaluator 和 OT op builder 是低至中等缝合成本；Nest/Prisma 下的 DDL、计算调度、
   ShareDB adapter 和 Next 页面是高耦合实现，适合按路径参考后自研或局部移植。
3. **M18 协同候选定为服务端中心化 OT，不选 CRDT，也不退化成只有版本号乐观锁。**
   Teable 使用 ShareDB JSON0 OT + 文档版本号 + PostgreSQL `ops`/实体 `version` + Redis pub/sub；
   APITable 同样是 OT，但把 Socket.IO/OT 编排放在独立 `room-server`。M18 优先采用
   “Teable/ShareDB 形态的嵌入式 OT adapter”，到独立扩缩容触发点再拆 room 服务。
4. **权限桥、审计、运行时 DDL 管理层、槽位兼容/迁移必须自研。** Teable 的
   `space/base/collaborator` 假设与本平台 enterprise/department/role/data-scope 不同，且权限矩阵
   在 CE 只是升级占位页。
5. **任务包中的企业边界先验有一项已漂移。** automation 与 authority matrix 在 CE 是明确的
   enterprise upgrade 占位；但 `v1.10.0` CE 源码和运行路由已包含 AI provider 配置、AI field
   UI、AI API。不能再写“AI 确不在 CE 代码里”，应改为“AI 基础能力已进入 CE，云计划和
   self-hosted 商业授权边界需在 M19 前重新核实”。

## 1. 评审对象与版本

### 1.1 锚点

| 项目           | 锚点                                                                                                        | 用途                    |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------- |
| Teable CE      | tag `v1.10.0`；commit `a8e451f1ffb74e065da95f837cff0fe5d04f7668`                                            | 源码与数据模型结论      |
| Teable CE 镜像 | `@teable/teable` `1.10.0`；digest `sha256:b14f386a22849d61706ef12fb2d2b3d055948da9f662142b76c0db81c8546b7a` | compose 运行实证        |
| APITable       | commit `88b24ce9f359cc434778be75d03603182882dc76`                                                           | room-server OT 定性对比 |

运行镜像从 Teable 官方中文部署文档指定的阿里云 registry 取得，compose 使用 digest 固定，
没有使用浮动 tag 启动。镜像内 `/app/package.json` 自证 `name=@teable/teable`、
`version=1.10.0`、`license=AGPL-3.0`。源码未 fork、未修改、未复制进本仓库。

保鲜期：本报告对 Teable 的路径与行为结论有效至 **2026-10-06**。M17 若在该日期后启动，
必须对上述 commit 到当时稳定 CE tag 做一次 tree/diff 刷新，重点检查 v2 engine、字段枚举、
ShareDB adapter 与许可边界。

### 1.2 活跃度实证

- 2026-07-06 查询时，官方 release 流仍有 2026-07-05 的发布 tag，仓库并非停滞项目。
- `v1.10.0` 是本次稳定 CE 锚点；最新 release 已继续推进 v2 engine，因此本报告不把最新云端
  release notes 的行为倒灌到 `v1.10.0`。
- APITable 对比锚点为当前 `develop` commit；其 room-server 包版本为 `1.13.0`，但整体架构包含
  Java backend + Nest room-server + MySQL，与本平台主栈不匹配。

### 1.3 许可证分层

| 目录                              | 锚点内证据                       | 结论                                               |
| --------------------------------- | -------------------------------- | -------------------------------------------------- |
| `apps/nestjs-backend`             | 根 `LICENSE` “Core Applications” | AGPL-3.0 + 根许可证的品牌附加条款                  |
| `apps/nextjs-app`                 | 同上                             | AGPL-3.0 + 品牌附加条款                            |
| `packages/*`                      | 根 `LICENSE` + 各包 `LICENSE`    | MIT；优先搬运区                                    |
| `packages/core`                   | `packages/core/LICENSE`          | MIT；字段、公式、OT op builder 的首选来源          |
| `packages/openapi`                | `packages/openapi/LICENSE`       | MIT；DTO/schema 可参考                             |
| `packages/sdk`、`packages/ui-lib` | 各包 `LICENSE`                   | MIT；但代码许可宽松不等于运行时解耦成本低          |
| `plugins`                         | `plugins/LICENSE`                | AGPL-3.0，不属于根文档所说的 `packages/*` MIT 例外 |

根许可证另声明 Teable 名称、logo、icons 和 visual identity 不在 AGPL 授权内，并禁止修改、
替换或移除。这不是本 spike 的合规重议，但意味着即使内部搬运 apps，也不能把品牌资产一起
当作可搬源码处理。建议 M17 只搬 MIT 包或自行重写 apps 层。

## 2. 运行实证

### 2.1 compose 与资源基线

运行拓扑：

```text
Teable CE 1.10.0 (digest pinned) :3100
  -> PostgreSQL 15.4 :42346
  -> Redis 7.2.4
```

健康启动日志包含 database migration 完成、`WsGateway (SockJS) initialized`、
`V2ContainerService ... initialized` 和 `Ready on http://localhost:3000`。空闲后单次
`docker stats --no-stream`：

| 容器       |     CPU |        内存 |
| ---------- | ------: | ----------: |
| Teable     |   1.37% |     963 MiB |
| PostgreSQL |   0.39% |   39.05 MiB |
| Redis      |   0.14% |    3.95 MiB |
| 合计       | 约 1.9% | 约 1.01 GiB |

磁盘基线：

- CE image：约 3.09 GB；
- 初始化 PostgreSQL volume：约 50.04 MB；
- Redis volume：约 2.7 KB；
- assets volume：约 24.5 KB。

这是空库、单用户、无附件的评估基线，不可当生产容量承诺。官方 compose 文档建议至少
2 CPU / 4 GB RAM / 40 GB disk；本实测说明 M17-M18 开发 compose 可用 4 GB 门槛，但单机正式
部署仍须把 work-platform、Teable 搬运后的服务和 PG 连接池一起容量核算。

### 2.2 取证方法

1. 通过 UI 注册本地账号、创建 `Anatomy Lab` space、base 与第一张表。
2. PostgreSQL 设置 `log_statement=ddl`，每个动作后同时检查数据库日志、`field/table_meta/view`
   元数据、`information_schema.columns` 与 `pg_indexes`。
3. Canvas 列头的自动化无障碍层两次阻塞后，按时间盒规则把字段“逐 UI 点击”的深度裁为：
   已直接 UI 实证建表默认三字段；其余字段通过 Teable 自己的
   `POST /api/table/{tableId}/field` 等价业务入口创建。下表明确区分两种证据，不把 API 动作
   冒充鼠标动作。
4. 所有 SQL/DDL 均来自 PostgreSQL 真实日志或 catalog，不是从源码推断。

### 2.3 UI/API 动作 → SQL/DDL 对照

物理命名实证：

- base id `bsefzfyMZSLJSXWO10x` → 同名 PostgreSQL schema；
- 中文表名“表格” → `bsefzfyMZSLJSXWO10x."Biao_Ge"`；
- 默认中文字段名 → 拼音列名，如“单行文本”→`Dan_Xing_Wen_Ben`；
- API 显式 `dbFieldName` 原样保留且区分大小写，限制应收口为 `[A-Za-z0-9_]`、最长 63；
- 每条业务记录都有 `__id`、`__auto_number`、创建/修改时间与人、`__version` 系统列。

| 动作                   | 入口         | 实际 SQL/DDL 或存储结果                                                                                                           |
| ---------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 创建 base              | UI           | `create schema if not exists "bsefzfyMZSLJSXWO10x"`                                                                               |
| 创建表                 | UI           | `create table ... "Biao_Ge" ("__id" varchar(255) not null, "__auto_number" serial primary key, ... "__version" integer not null)` |
| 记录 id 约束           | UI 建表伴随  | `alter table ... add constraint "...__id_unique" unique ("__id")`                                                                 |
| 单行文本               | UI 默认字段  | `add column "Dan_Xing_Wen_Ben" text`                                                                                              |
| 数字                   | UI 默认字段  | `add column "Shu_Zi" double precision`                                                                                            |
| 单选                   | UI 默认字段  | `add column "Dan_Xuan" text`；选项只存在 `field.options` JSON                                                                     |
| 长文本                 | API 等价动作 | `add column "long_text" text`                                                                                                     |
| 复选框                 | API 等价动作 | `add column "checkbox" boolean`                                                                                                   |
| 多选                   | API 等价动作 | `add column "multi_select" jsonb`                                                                                                 |
| 日期                   | API 等价动作 | `add column "date_value" timestamptz`                                                                                             |
| 评分                   | API 等价动作 | `add column "rating_value" double precision`                                                                                      |
| 附件                   | API 等价动作 | `add column "attachment_value" jsonb`                                                                                             |
| 用户                   | API 等价动作 | `add column "user_value" jsonb`                                                                                                   |
| 创建时间               | API 等价动作 | `add column "created_time_value" TIMESTAMP GENERATED ALWAYS AS (__created_time) STORED`                                           |
| 最后修改时间           | API 等价动作 | `... GENERATED ALWAYS AS (__last_modified_time) STORED`                                                                           |
| 创建人 / 最后修改人    | API 等价动作 | 两列均为 `jsonb`，存 `{id,email,title}` 快照                                                                                      |
| 自动编号               | API 等价动作 | `INTEGER GENERATED ALWAYS AS (__auto_number) STORED`                                                                              |
| 公式                   | API 等价动作 | `add column "formula_value" double precision`；不是 PG generated column，由 Teable 计算后写回                                     |
| 按钮                   | API 等价动作 | `add column "button_value" jsonb`；配置存在 metadata                                                                              |
| 创建关联目标表         | API 等价动作 | 创建真实 `linked_target` 表及相同系统列                                                                                           |
| many-many 关联         | API 等价动作 | 主/目标表各加 JSONB 展示列，并创建 junction table                                                                                 |
| 关联外键               | API 等价动作 | junction 两列分别 FK 到两张用户表的 `__id`                                                                                        |
| 汇总 rollup            | API 等价动作 | `add column "rollup_value" double precision`，计算值物化写回                                                                      |
| 字段 DB 名重命名       | API 等价动作 | `alter table ... rename "long_text" to "long_text_renamed"`                                                                       |
| 文本转数字             | API 等价动作 | `DROP COLUMN ... CASCADE` 后 `add column ... double precision`；旧值清空，不是安全 cast                                           |
| 删除字段               | API 等价动作 | `DROP COLUMN IF EXISTS ... CASCADE`；metadata 行软删保留                                                                          |
| 创建记录               | API 等价动作 | 物理表插入，`__version=4`；公式立即得到 `84`                                                                                      |
| 删除记录               | API 等价动作 | 物理行删除；`record_trash` 写完整 field-id keyed JSON snapshot                                                                    |
| 视图 filter/sort/group | API 等价动作 | 只更新 `view` metadata；随后查询动态编译 SQL，没有为字段自动建索引                                                                |

锚点实际支持的字段类型为 19 类：

```text
singleLineText, longText, user, attachment, checkbox, multipleSelect,
singleSelect, date, number, rating, formula, rollup, link, createdTime,
lastModifiedTime, createdBy, lastModifiedBy, autoNumber, button
```

当前在线 API 文档还列 `conditionalRollup`，但 `v1.10.0`
`packages/core/src/models/field/constant.ts` 与 `options.schema.ts` 没有该类型，
`POST field` 也拒绝该 payload。这是文档相对锚点的版本漂移，不计为锚点遗漏字段。

### 2.4 索引、删除、undo/历史

用户表/关系表初始索引只有：

- 用户表 `__auto_number` primary key；
- 用户表 `__id` unique；
- junction table 自增 id primary key；
- 目标表同样两项。

创建普通字段、formula/rollup、view filter/sort/group 都**没有**自动为业务列创建索引。源码
`field.service.ts` 只在字段 `unique=true` 时创建字段 unique index；`view.service.ts` 的额外
索引针对 manual row order，不是为 filter/sort 自动做数据库调优。因此任务包中的“Teable
索引为自动管理”不能理解为“按视图自动索引所有查询列”。

记录删除为“物理行删除 + `record_trash.snapshot` 软恢复副本”，不是用户表 `deleted_at`。
字段删除为物理 `DROP COLUMN` + `field.deleted_time` metadata 软删。Undo/协同操作另存
`public.ops`；字段级历史另存 `public.record_history(before,after,field_id,created_by)`。

## 3. 五个关键子系统解剖

### 3.1 DDL 管理层

路径：

- `apps/nestjs-backend/src/features/field/field.service.ts`
- `apps/nestjs-backend/src/features/field/field-calculate/field-creating.service.ts`
- `apps/nestjs-backend/src/features/field/field-calculate/field-converting.service.ts`
- `apps/nestjs-backend/src/features/field/field-calculate/field-deleting.service.ts`
- `apps/nestjs-backend/src/db-provider/postgres.provider.ts`
- `packages/db-main-prisma/prisma/postgres/schema.prisma`

机制：

- Prisma 管 metadata 和事务上下文；Knex 仅作为 SQL builder；最终经
  `PrismaService.txClient().$executeRawUnsafe()` 执行 DDL。
- 创建、转换、删除 service 先构造依赖/补偿上下文，再在 `$tx` 内更新 metadata、物理列、
  reference 与 raw ops。事务失败由 PostgreSQL DDL 事务回滚。
- 类型转换并不统一使用 `ALTER TYPE USING`；本次 text→number 实证是 drop + add，属于明确的
  数据损失语义。
- `unique` 会生成命名 unique constraint；创建字段时 `notNull` 被拒绝，避免已有行无法回填；
  后续验证变更通过 `alterTableModifyFieldValidation`。
- 命名由 name conversion + metadata 唯一性校验处理；base schema、table、field 与关系表名称
  都是业务 id/可读名混合。

M17 判断：**设计搬、代码不整块搬。** 这里同时耦合 Prisma tx client、Knex、ShareDB raw ops、
计算依赖与 Teable 权限，直接接 Drizzle 的缝合成本高。M17 应自研
`BitableDdlManager`，但复用其“metadata + DDL + dependency + op 同事务”顺序和失败补偿测试集。

### 3.2 字段类型系统

路径：

- `packages/core/src/models/field/*`
- `packages/core/src/models/field/derivate/*`
- `packages/core/src/models/field/options.schema.ts`
- `apps/nestjs-backend/src/features/field/model/factory.ts`
- `apps/nestjs-backend/src/features/field/model/field-base.ts`
- `apps/nestjs-backend/src/features/field/model/field-dto/*`
- `packages/openapi/src/field/*`

机制：

- MIT `packages/core` 定义 field enum、options Zod schema、cell value type、db field type、
  OT op 与转换规则；
- Nest DTO 层负责 `cellValue ↔ DB value`，JSONB 类型在这里序列化/反序列化；
- `factory.ts` 把 raw metadata 实例化为具体 Field DTO，服务层依赖统一接口做查询和计算；
- metadata 中 `options/lookup_options/meta/ai_config` 为 JSON 字符串，物理列保持类型化。

M17 判断：**优先成块搬 `packages/core` 的字段模型与纯函数，重写 Nest DTO/DB adapter。**
目标落点为 `modules/bitable/contract/src/fields` 与
`modules/bitable/api/src/fields`。缝合成本中：TypeScript/Zod 同栈有利；但 ID、错误码、
OpenAPI DTO、用户字段和附件字段必须替换为平台 contract。

### 3.3 公式引擎

路径：

- `packages/core/src/formula/parser/Formula.g4`
- `packages/core/src/formula/parser/FormulaLexer.g4`
- `packages/core/src/formula/evaluate.ts`
- `packages/core/src/formula/field-reference.visitor.ts`
- `packages/core/src/formula/functions/*`
- `apps/nestjs-backend/src/features/calculation/reference.service.ts`
- `apps/nestjs-backend/src/features/calculation/field-calculation.service.ts`
- `apps/nestjs-backend/src/features/calculation/batch.service.ts`
- `packages/db-main-prisma/prisma/postgres/schema.prisma` 的 `Reference`

机制：

- parser/evaluator 在 MIT core，ANTLR grammar 解析，visitor 抽 field-id reference；
- `reference` 表保存 `from_field_id -> to_field_id`，递归 CTE 展开关联依赖；
- 记录 op 进入 `ReferenceService` 后建立 start zone/有向图、拓扑排序并计算受影响记录；
- `BatchService` 读取 `__version`，生成 OT ops，批量更新物化公式列并持久化 ops；
- 公式是应用层计算 + 物理列物化，不依赖 PostgreSQL generated expression。

M17 判断：**parser + evaluator + function library 整块搬；依赖图/增量调度按接口局部搬。**
parser 是低成本；reference/批量更新与 Prisma/ShareDB/用户字段耦合，属高成本。目标落点：
`packages/bitable-formula`（纯 MIT 衍生包）与
`modules/bitable/api/src/calculation`（平台实现）。

### 3.4 视图 = 查询编译

路径：

- `apps/nestjs-backend/src/db-provider/filter-query/*`
- `apps/nestjs-backend/src/db-provider/sort-query/*`
- `apps/nestjs-backend/src/db-provider/group-query/*`
- `apps/nestjs-backend/src/db-provider/aggregation-query/*`
- `apps/nestjs-backend/src/features/view/view.service.ts`
- `apps/nestjs-backend/src/features/record/*`

机制：

- view 的 filter/sort/group 只保存在 metadata；
- record query 装配 provider，Postgres adapter 按 cell value type 选择单值/多值 filter 与 sort；
- JSONB 多值、日期、关联值各有 adapter，不是拼一段通用 SQL；
- manual sort 才在用户表加 view-specific order column/index；
- filter/sort/group 配置不自动生成业务字段索引。

M17 判断：**搬设计和 adapter 测试矩阵，谨慎搬 apps 代码。** 该层大多是 Knex query builder，
迁 Drizzle SQL builder 为中高成本；但条件 AST、字段分派和各类型 SQL 语义可直接作为
验收 oracle。目标落点：`modules/bitable/api/src/query-compiler`。

### 3.5 实时协同

路径：

- `apps/nestjs-backend/src/share-db/share-db.service.ts`
- `apps/nestjs-backend/src/share-db/share-db.adapter.ts`
- `apps/nestjs-backend/src/share-db/sharedb-redis.pubsub.ts`
- `apps/nestjs-backend/src/share-db/readonly/*`
- `packages/core` 的 `*OpBuilder`
- `packages/db-main-prisma/prisma/postgres/schema.prisma` 的 `Ops` 与各实体 `version`

结论：**Teable 是 ShareDB JSON0 Operational Transformation，不是 CRDT。**

- `ShareDbService extends ShareDBClass`，配置 presence、DB adapter、`maxSubmitRetries=3`；
- adapter 从实体 snapshot/version 还原 ShareDB Snapshot，并用 `ops`/version 处理提交；
- PostgreSQL transaction 完成后才 publish ops，Redis pub/sub 用于多实例 fan-out；
- `__version`/metadata `version` 是 OT 的顺序与冲突输入，不是单独的“最后写入者胜出”锁；
- SockJS gateway 承载客户端长连接。

#### 与 APITable room-server 对比

| 维度       | Teable v1.10.0                                    | APITable 对比锚点                                                    |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| 算法       | ShareDB JSON0 OT                                  | 自有 Changeset/Operation/Action/Snapshot OT                          |
| 一致性     | 中心服务排序 + version + transform                | room-server 中心排序/transform + snapshot/change                     |
| 后端形态   | Nest backend 内嵌 ShareDB；Redis pub/sub 可多实例 | 独立 Nest `packages/room-server` + Socket.IO，Java backend 负责 CRUD |
| 存储       | 动态 PG 用户表 + metadata/ops                     | MySQL JSON snapshot/change 模型                                      |
| 客户端共享 | `packages/core` op builder                        | `@apitable/core` 客户端/room-server 共享                             |
| 富文本     | 表格 OT；不以 CRDT 为核心                         | room-server 另依赖 Yjs/Hocuspocus 处理富文本，不改变表格 OT 定性     |
| 搬运成本   | 同栈，ShareDB adapter 可局部移植                  | 双后端、MySQL schema 与大量自有 core，整体搬运成本高                 |

M18 建议：选 **Teable/ShareDB 风格的 OT**，把 transport、snapshot repository、auth、
presence、pub/sub 定义成 ports。首期可内嵌 gateway/bitable api，Redis fan-out；达到独立扩容
触发点再拆 room server。版本号必须保留为 OT revision，不把它误写成纯乐观锁方案。
不选 CRDT：表格由中心 PG 物理表承载，没有离线 peer-to-peer 合并需求，CRDT metadata/墓碑成本
没有得到相应收益。

本结论**不倾向搬运 APITable room-server 代码**，因此不触发
product-requirements §5.4 先翻案义务；只把 APITable 当独立 room 拓扑和 OT 测试用例的参考。

## 4. 可搬运清单

| 来源路径                                               | 搬运内容                                            | 目标落点                                      | 缝合成本 | 决策                             |
| ------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------- | -------- | -------------------------------- |
| `packages/core/src/models/field/*`                     | field enum、options schema、value/db type、纯转换   | `modules/bitable/contract/src/fields`         | 低       | 成块搬，替换命名与错误契约       |
| `packages/core/src/formula/parser/*`                   | ANTLR grammar/parser                                | `packages/bitable-formula`                    | 低       | 成块搬                           |
| `packages/core/src/formula/functions/*`、`evaluate.ts` | 公式函数与 evaluator                                | `packages/bitable-formula`                    | 中       | 搬，补时区/locale/空值兼容测试   |
| `field-reference.visitor.ts`                           | field-id reference 提取                             | `packages/bitable-formula`                    | 低       | 搬                               |
| `features/calculation/reference.service.ts`            | dependency graph、递归 CTE、受影响记录算法          | `modules/bitable/api/src/calculation`         | 高       | 搬算法与测试，不直接搬 service   |
| `features/calculation/field-calculation.service.ts`    | topo/chunk/recalc orchestration                     | 同上                                          | 高       | 重写 adapter                     |
| `db-provider/{filter,sort,group,aggregation}-query/*`  | type-dispatched SQL semantics                       | `modules/bitable/api/src/query-compiler`      | 中-高    | 搬 AST/测试，Knex 改 Drizzle/SQL |
| `share-db/*`                                           | ShareDB adapter、post-commit publish、Redis fan-out | `modules/bitable/api/src/collaboration`       | 高       | M18 局部搬；auth/repository 自研 |
| `packages/core` 的 op builders                         | JSON0 op construction/detection                     | `packages/bitable-collab` 或 bitable contract | 中       | 与 ShareDB 方案一起搬            |
| `packages/sdk` 网格 primitives                         | canvas/virtualization/selection/editor 基础         | `modules/bitable/web/src/grid`                | 中       | 先做依赖切片，不搬 Next page     |

网格前端的事实边界：

- `apps/nextjs-app/.../GridView.tsx` 本身只是 Next 页面内的 provider composition；
- 真正可搬能力主要下沉在 MIT `packages/sdk`、`packages/ui-lib`；
- 但 provider 依赖 Teable query hooks、record context、personal view、task status 与 i18n，不能把
  一个组件文件复制进 Vite 就结束；
- 建议 M18 先产出 `packages/sdk` dependency graph，只抽 canvas model/renderer/virtualization/
  selection/editor，再用 `@work/http-client` 和 bitable contract 重建数据 provider。

## 5. 需自研清单

| 自研项                 | 需切断的 Teable 假设/路径                                                         | 本平台落点                                                          |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| DDL 单一入口与权限边界 | `field.service.ts` 可直接 `$executeRawUnsafe`；部署账号库级权限                   | `BitableDdlManager`；运行角色只可 DDL `bitable.*`，所有动作审计     |
| metadata repository    | `PrismaService.txClient()` 遍布 field/view/calculation/share-db                   | Drizzle repository + explicit transaction ports                     |
| 平台权限桥             | `space/base/collaborator` 与 `role_name/principal`；`share-db/auth.middleware.ts` | platform RBAC + `PlatformScopePort`，读/写/分享/DDL 分动作授权      |
| 权限矩阵               | CE `AuthorityMatrix.tsx` 只是 enterprise upgrade Alert                            | M17 自研 field/view/record policy 映射，不依赖 Teable EE            |
| 审计接入               | Teable ops/history 不等于平台 audit contract                                      | DDL、schema 变更、分享、批量导入、恢复都写 platform audit           |
| 槽位兼容层             | Teable 无 `profile.employee`/`presence.status.*` 固定槽位                         | bitable slot registry + forms dual-read/dual-write migration        |
| forms 数据迁移         | Teable 不认识 forms definition/record/value                                       | 按槽位迁 metadata/record/attachments，带校验与回滚                  |
| 跨模块引用迁移         | Teable link 是表内关系，不处理 `form_record_id`                                   | `presence.status_records.form_record_id` 语义迁到 bitable record id |
| files 引用迁移         | Teable attachment JSON/S3 语义不同                                                | 改写 `ownerModule/referenceType/referenceId`，保持 files 单引用模型 |
| 查询配额/安全          | Teable query compiler 不含本平台企业级 scope 注入                                 | AST 在编译前强制 scope predicate、take/timeout/复杂度上限           |
| 协同 token/auth        | ShareDB middleware 认 Teable cookie/share id                                      | gateway session、平台 user、trace、审计双主体                       |
| 自动化                 | CE 只有升级占位；M19 归 bitable 子域                                              | 使用 M12 event bus + `@work/scheduling` 自研                        |

### 5.1 Prisma → Drizzle 评估

元数据 schema 可翻译但不宜机械复制。可保留的核心实体关系是：

```text
base -> table_meta -> field/view
field -> reference(from_field_id,to_field_id)
ops(collection,doc_id,version,data)
record_history / record_trash / table_trash
```

需改写：

- 去掉 Teable `space/user/collaborator/invitation`，base 直接挂 platform enterprise 与 bitable owner；
- JSON string 字段改为 Drizzle `jsonb` 类型列，避免双重 stringify；
- 把 `version`、soft-delete 与 unique indexes 显式写进 migration；
- 把动态用户表 schema 固定在 `bitable`，不使用“一 base 一 PG schema”，否则运行角色授权与
  schema 数量运维成本放大；
- ops 是否长期保留要由 M18 协同 RFC 定 TTL/compact，不直接复制无限增长模型。

综合缝合成本：**高**。问题不在 Prisma schema 语法，而在约 5 个子系统直接调用
`PrismaService.txClient()` 并把 after-transaction publish 语义绑在其 wrapper 上。

### 5.2 权限与审计切点

至少在以下入口注入平台授权：

- field/table/view create/update/delete；
- record list/get/create/update/delete/bulk；
- share/export/import；
- ShareDB submit 与 presence；
- DDL manager 内部二次校验（防 service 绕过）；
- calculation worker 以 system actor 执行，审计关联原始 user/operation。

不能把 scope predicate 只放 HTTP controller；ShareDB、worker、import 都会绕过 controller。

## 6. 企业版边界实证

| 能力               | CE 源码/运行证据                                                                                                 | 结论                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Automation         | `apps/nextjs-app/src/features/app/automation/Pages.tsx` 仅渲染 `enterpriseFeature` + `automationRequiresUpgrade` | 引擎不在 CE；只有导航/升级占位和少量 openapi facade |
| Authority Matrix   | `.../blocks/AuthorityMatrix.tsx` 同样仅升级 Alert；运行 UI 可见该入口                                            | 权限矩阵不在 CE                                     |
| AI provider/config | `apps/nestjs-backend/src/features/ai/{module,controller,service}.ts`；运行日志映射 `/api/:baseId/ai/*`           | 已在 CE                                             |
| AI field UI/schema | `apps/nextjs-app/.../field-ai-config/*`、`packages/core/src/models/field/ai-config/*`                            | 已在 CE/MIT 包部分存在                              |
| AI 商业能力        | 当前官方文档称 Cloud 全计划可用，self-hosted Business+                                                           | 代码存在不等于许可/服务计划免费；M19 前重核         |

因此 ADR/spec 中“automation、权限矩阵、AI 在闭源企业版”的合并陈述应拆开：前两项在
`v1.10.0` 有明确占位证据；AI 已发生边界迁移。这不改变 M17 自研权限和 M19 自研 automation
的结论，但影响风险表与可搬运范围。

## 7. 风险清单

| 风险                | 证据                                               | 缓解                                                            |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| AGPL/品牌条款       | apps AGPL，根 LICENSE 有品牌附加条款               | 优先 MIT packages；任何 apps 搬运做逐文件 notice/品牌资产排除   |
| 版本快速漂移        | 最新 release 已推进 v2，在线 API docs 超前于 v1.10 | 一季度保鲜期 + M17 启动 diff                                    |
| DDL 账号越权        | Teable service 可执行 raw DDL                      | 独立 DB role，仅授权 `bitable.*`；manager 二次校验              |
| 类型转换丢数据      | text→number 实测 drop/add                          | preview、dry-run、shadow column、回填校验、显式确认、可恢复快照 |
| 无自动查询索引      | filter/sort/group 后只有系统索引                   | M17 RFC 定配额、索引建议器/管理员动作，不承诺透明自动索引       |
| 关系表索引不足      | junction 仅 PK，FK 列未见独立 index                | M17 为两侧 FK + order 定显式索引                                |
| ops/history 增长    | `ops`、history、trash 多份存储                     | TTL/compact/archive、容量指标、恢复演练                         |
| Prisma/ShareDB 耦合 | tx client + afterTransaction publish               | ports 分离 transaction、op store、pubsub                        |
| Next 网格耦合       | provider/context/query hooks 较深                  | 先抽纯 canvas 内核，Vite adapter 重写                           |
| 权限绕过            | HTTP、ShareDB、worker 多入口                       | policy service 在 repository/use-case 层统一执行                |
| AI 边界漂移         | CE 已含 AI 代码但商业计划另限                      | M19 前按当时 tag + self-hosted license 再核                     |
| 低配内存            | 空闲 Teable 约 963 MiB                             | 搬运后按子系统拆包，不把整套 Teable runtime 纳入生产            |

## 8. 对 M17 RFC 的建议

### 8.1 DDL 管理层

M17 RFC 应规定：

1. 所有动态 DDL 只能经 `BitableDdlManager`；
2. DB role 仅能在 `bitable` schema 内 create/alter/drop；
3. metadata 变更、DDL、dependency 更新、outbox/audit 在同一 PG transaction；
4. 每次 DDL 带 enterprise/base/table/field/actor/trace/reason；
5. 命名采用稳定 id 派生物理名，display name 不触发物理 rename；允许显式 db name 但不作为
   默认 UI 行为；
6. field type conversion 分为 lossless cast、shadow-copy conversion、destructive conversion；
   destructive 必须快照、预检、显式确认；
7. 配额至少含 base/table/field/index/row/attachment/DDL rate；
8. relation table 的两侧 FK、order、反向查询索引由 manager 显式创建；
9. filter/sort 只做 SQL 编译，不自动无界建索引；索引建议与管理员动作另设 API；
10. schema drift checker 与 repair command 必须在 M17 验收前具备。

### 8.2 元数据 schema

建议首版：

```text
bitable.bases
bitable.tables
bitable.fields
bitable.views
bitable.field_references
bitable.schema_operations
bitable.record_history
bitable.record_trash
bitable.collab_ops       -- M18 激活，M17 可先留表/port
bitable.slot_bindings
bitable.migration_jobs
```

用户数据表全部在 `bitable` schema，物理名以 table id 派生；field id 派生列名。display name 与
物理名解耦能避免 Teable 本次实证中的拼音 rename DDL，并降低 SQL injection/63 字符限制传播。

### 8.3 迁移建议

员工档案槽位首迁必须走：

```text
freeze definition changes
-> create bitable metadata/physical table
-> backfill records
-> migrate files references
-> dual-read compare
-> switch read
-> dual-write observation window
-> switch write
-> archive forms records
```

`presence.status_records.form_record_id` 和 files references 必须分别有可逆映射表，不能只改
字符串 id。`db:migrate:forms` 的退役属于全部槽位迁毕后的独立切片。

### 8.4 动态物理表路线反证检查

未发现翻案级反证。需要在 RFC 正面吸收的代价是：

- runtime DDL 与现行 security baseline 冲突；
- 类型转换可能锁表/丢数据；
- schema/object 数量、autovacuum、备份恢复和权限管理复杂；
- 用户查询索引不能靠视图透明生成。

这些是 DDL manager、配额、运维与迁移策略问题，不足以把存储模型改回 JSONB。ADR-0006 的
动态物理表结论维持。

## 9. 对 M18 RFC 的建议

1. 协同机制定为 **ShareDB-compatible JSON OT + revision/version**；
2. CRDT 不进入首版；版本号乐观锁只能作为 OT adapter 的组成，不能单独成为协同方案；
3. server-authoritative snapshot 仍是动态 PG 物理表，ops store 只存增量和恢复窗口；
4. Redis pub/sub 只做 fan-out，不做 durable truth；断线后按 version 从 PG ops/snapshot catch up；
5. UI 先抽 MIT sdk 的 canvas/virtualization primitives，数据/权限/HTTP provider 自研；
6. Chrome 109 降级为表单/只读分页视图，不要求完整 canvas 协同；
7. 在 M18 前补一个**深度 follow-up spike**：两浏览器并发编辑同 cell/不同行/字段变更、
   Redis 中断恢复、ops compact 与 100k 行虚拟滚动。原因是本次按时间盒裁了协同的并发运行
   压测深度，但机制结论与 APITable 对比已完成。

## 10. Open questions

1. Teable v2 engine 在 2026-Q3 稳定 tag 中是否替换了 v1 的 field/calculation/share-db 主路径？
2. M18 是否直接使用 upstream ShareDB，还是只采用 JSON0 协议并自研最小 adapter？
3. ops/history/trash 的默认 TTL 与 compact 阈值是多少？
4. shadow-column conversion 对百万行表的锁时间、WAL 与磁盘峰值是多少？
5. 自动索引是只做建议，还是允许在配额内异步创建？谁审批、谁审计？
6. 网格 sdk 的最小可独立构建包边界，需要 M18 前用 dependency graph + Vite POC 实测。
7. `conditionalRollup` 属于 v2 新类型还是在线文档误超前，M17 启动 diff 时重新核实。

## 11. 验收对账

- [x] commit 与镜像 digest 双锚定；
- [x] compose 起 CE，记录 CPU/内存/磁盘；
- [x] 建 base/表、锚点全部实际字段类型、视图、公式、关联；
- [x] 字段增删改、关系外键、中间表、索引、行删除、history/undo 位置有 PG 实证；
- [x] 五子系统均有路径级结论；
- [x] 可搬运项含来源、目标落点、成本；
- [x] 自研项覆盖权限桥、审计、槽位兼容与 files/forms 引用迁移；
- [x] 许可分层与 automation/authority/AI 企业边界有源码实证；
- [x] 协同机制 OT/CRDT/版本号结论与 APITable 对比不可裁项完成；
- [x] M17/M18 RFC 建议与动态物理表反证判断完成。
