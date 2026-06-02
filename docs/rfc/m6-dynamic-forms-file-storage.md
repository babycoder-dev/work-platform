# RFC: M6 动态表单 mini + 文件存储

## 状态

Proposed

## 1. 目标

M6 提供后续档案、在位状态 v2、日报复用的两项共享后端基建：

- **动态表单 mini**：固定槽位 + 类型化字段，不允许用户创建任意表单。
- **内网文件存储**：首期使用本地磁盘 provider，保存档案照片与表单文件 / 图片字段。

M6 采用“具体优先 + 前向兼容”的策略：数据模型使用 `表单定义 / 字段定义 / 记录 / 记录值`
通用子集，但本期不建设多维表格、自动化流程或任意表单生成器。业务需求单一事实源为
`docs/product-requirements.md` §4.2，路线决策见 `docs/adr/0005-product-replan-roadmap.md` 决策 2。

本 RFC 先冻结**后端契约、schema、安全边界和切片顺序**。Web 配置页与填报页等待产品原型确定，
不在 M6 后端切片中实现；后续以前端任务包单独进入审查。

## 2. 非目标

M6 不实现：

- 任意创建表单、拖拽式表单设计器、多维表格 UI。
- 条件显示、字段联动、公式、自动化动作。
- 完整表单版本化与历史 definition diff；旧记录通过值快照保持自描述。
- MinIO、S3、CDN、公网下载链接或匿名文件访问。
- 通用短链、外链分享、预览转码、病毒扫描、OCR。
- 跨模块业务页面：员工档案、在位状态 v2、日报页面分别归 M8 / M9 / M10。
- 把文件二进制写入 PostgreSQL。
- 允许业务模块跨 schema 查询 `forms.*` 或 `files.*`。

## 3. 现有约束

M6 必须继承以下已生效规则：

- `docs/constitution.md` §4：业务模块保持独立边界，跨模块只走公开 API、领域事件、平台 SDK。
- `docs/module-contract.md` §7.1：业务模块不得跨 schema join，不得 import 其他模块 repository / schema。
- `docs/security-baseline.md` §2 / §5 / §6 / §7 / §8：默认拒绝、后端鉴权、租户边界、审计、
  DTO 白名单校验、错误不泄露内部路径、迁移管理。
- `docs/adr/0003-gateway-boundary.md` 与 `docs/adr/0005-product-replan-roadmap.md`：当前仍由
  `gateway-api` 作为 API 组合宿主；服务拆分推迟到 vNext。
- M5 安全修复形成的不变量：租户边界必须来自 `request.currentUser.enterpriseId`，不得信任 body、
  path id 或客户端提供的租户字段。

## 4. 模块边界

### 4.1 两个共享后端模块

M6 新增两个业务中立的共享后端模块：

```text
modules/forms/contract
modules/forms/api

modules/files/contract
modules/files/api
```

它们在 M6 内嵌到 `gateway-api`：

```text
gateway-api
  -> FormsModule
  -> FilesModule
```

两个模块各自拥有独立 schema：

```text
forms.*
files.*
```

`platform-api` 继续只拥有 `platform.*`。不得为了“共享”把表单或文件表塞入 `platform.*`。

### 4.2 Web 延后但边界不变

`modules/forms/web` 在原型确认后的单独前端任务包创建。文件上传控件可以放在 forms Web 或后续
业务模块 Web 中，不新增独立文件管理页面。M6 后端阶段不注册 Shell 菜单，不在 Shell 硬编码入口。

这是后端优先的交付顺序，不改变 `docs/constitution.md` 的模块自治原则：一旦进入用户可见页面实现，
仍按 `contract / api / web` 完整边界落地。

### 4.3 公开 port

跨模块只允许依赖 contract 暴露的 port：

```ts
export const FILE_STORAGE_SERVICE = Symbol('FILE_STORAGE_SERVICE');

export interface FileStoragePort {
  assertAttachableFiles(actor: FileActorContext, fileIds: string[]): Promise<FileObjectDto[]>;
  openFile(actor: FileActorContext, fileId: string): Promise<ReadableFileObject>;
}

export const FORMS_SERVICE = Symbol('FORMS_SERVICE');

export interface FormsPort {
  getDefinition(actor: FormActorContext, slotKey: FormSlotKey): Promise<FormDefinitionDto>;
  createRecord(actor: FormActorContext, input: CreateFormRecordInput): Promise<FormRecordDto>;
  getRecord(actor: FormActorContext, recordId: string): Promise<FormRecordDto>;
}
```

业务模块不得注入其他模块 repository，不得读取 `forms.*` / `files.*` table 定义。

## 5. 动态表单 mini

### 5.1 固定槽位

表单定义不是用户可自由创建的资源。定义只能绑定到 contract 注册的槽位：

| 槽位 | owner | M6 状态 | 用途 |
| ---- | ----- | ------- | ---- |
| `profile.employee` | `profile` | active | 员工档案自定义字段 |
| `presence.status.<statusTypeCode>` | `presence` | reserved pattern | 每种在位状态的补充填报字段 |
| `report.daily` | `report` | active | 日报字段 / 板块 |
| `report.weekly` | `report` | reserved | 周报预留，不开放配置入口 |

约束：

- controller 不提供 `POST /definitions` 任意创建接口。
- `PUT /definitions/:slotKey` 只接受注册槽位；未知槽位返回 404。
- `presence.status.<statusTypeCode>` 的 namespace 固定，但 M6 不开放写入；`statusTypeCode` 在 M9 由
  在位状态字典 validator 校验后才允许配置。M6 不自行拥有状态字典。
- `ownerModule` 由槽位 registry 推导，不信任 request body。

### 5.2 字段类型

contract 固定以下字段类型：

```ts
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'single_select'
  | 'multi_select'
  | 'file'
  | 'image'
  | 'employee';
```

字段公共属性：

```text
key
label
type
required
description?
sortOrder
options?        // single_select / multi_select only
```

输入规则：

- `key` 在同一 definition 内唯一，创建后不可静默改义；改义应新增 key、停用旧字段。
- `label`、`description`、选项标签做长度上限校验。
- 选择字段必须声明非空、key 唯一的 options；其他字段不得携带 options。
- `file` / `image` 值只保存 opaque `fileId` 列表，不保存磁盘路径。
- `employee` 值只接受员工 id；service 通过 Platform Core 公开 lookup port 校验同租户员工并生成快照。
- 每个 definition 限制字段数；默认最大 100，配置可下调，不允许请求绕过。

### 5.3 Schema

新增 `forms` schema：

```text
forms.form_definitions
forms.form_fields
forms.form_records
forms.form_record_values
forms.schema_migrations
```

核心结构：

```text
form_definitions
  id uuid pk
  enterprise_id uuid not null
  slot_key varchar(128) not null
  owner_module varchar(64) not null
  revision integer not null default 1
  status varchar(32) not null
  created_by uuid not null
  created_at timestamptz not null
  updated_at timestamptz not null
  unique (enterprise_id, slot_key)

form_fields
  id uuid pk
  enterprise_id uuid not null
  definition_id uuid not null references forms.form_definitions(id) on delete cascade
  field_key varchar(64) not null
  label varchar(128) not null
  field_type varchar(32) not null
  required boolean not null
  description varchar(512) null
  sort_order integer not null
  options jsonb null
  status varchar(32) not null
  created_at timestamptz not null
  updated_at timestamptz not null
  unique (definition_id, field_key)

form_records
  id uuid pk
  enterprise_id uuid not null
  definition_id uuid not null references forms.form_definitions(id)
  slot_key varchar(128) not null
  definition_revision integer not null
  subject_type varchar(64) not null
  subject_id varchar(128) not null
  submitted_by uuid not null
  created_at timestamptz not null
  updated_at timestamptz not null

form_record_values
  id uuid pk
  enterprise_id uuid not null
  record_id uuid not null references forms.form_records(id) on delete cascade
  field_key varchar(64) not null
  field_label_snapshot varchar(128) not null
  field_type_snapshot varchar(32) not null
  value jsonb not null
  display_snapshot jsonb null
  sort_order_snapshot integer not null
  unique (record_id, field_key)
```

`revision` 只用于并发更新检测和记录“提交时看到的 definition revision”，不是完整版本表。旧 definition
不保留全量历史；旧记录依靠 `form_record_values` 的 label / type / display 快照自描述。

### 5.4 记录写入

提交记录时，Forms service 必须在一个事务中：

1. 按认证租户和注册槽位读取 active definition 与字段。
2. 拒绝未知字段、重复字段、缺失必填字段和类型不匹配值。
3. 对 `file` / `image` 调用 `FILE_STORAGE_SERVICE.assertAttachableFiles(...)`。
4. 对 `employee` 调用 Platform Core 公开 employee lookup port，校验同租户员工并生成显示快照。
5. 写 `form_records` 和带 label / type / display 快照的 `form_record_values`。
6. 写审计并发布领域事件。

下游业务模块负责决定 `subjectType / subjectId` 是否可写、哪些记录可读。Forms service 只接受调用模块
通过公开 port 传入的 actor context，不自行猜测档案、在位、日报的数据范围语义。

### 5.5 HTTP API

M6 提供 definition 管理 API，用于后续管理 UI：

| 方法 + 路径 | 权限点 | 说明 |
| ----------- | ------ | ---- |
| `GET /api/forms/definitions/:slotKey` | `forms:definition:view` | 获取当前租户槽位定义 |
| `PUT /api/forms/definitions/:slotKey` | `forms:definition:manage` | 整组替换字段，revision 乐观并发 |

记录写入 / 读取优先通过 `FORMS_SERVICE` port 提供给 M8 / M9 / M10。M6 不开放“按任意 subject
列出所有记录”的通用 HTTP API，避免绕过下游模块的数据范围与业务授权。M6 后端 smoke 通过 service
测试和受控测试宿主验证记录存取。

## 6. 文件存储

### 6.1 选型

M6 首期采用：

```text
本地磁盘 + FilesModule + LocalFileStorageProvider
```

暂不引入 MinIO。理由：

- 当前是单机内网部署、几百人规模，本地 volume 足够满足照片与表单附件。
- MinIO 会新增独立服务、镜像、配置、凭据和备份面；在真实容量或多节点需求出现前不值得引入。
- provider 接口隔离 storage key 与物理实现，后续切换 MinIO 不改变 Forms contract 与业务模块 API。

### 6.2 Schema

新增 `files` schema：

```text
files.file_objects
files.schema_migrations
```

核心结构：

```text
file_objects
  id uuid pk
  enterprise_id uuid not null
  provider varchar(32) not null
  storage_key varchar(256) not null
  original_name varchar(255) not null
  media_type varchar(128) not null
  size_bytes bigint not null
  sha256 varchar(64) not null
  status varchar(32) not null
  uploaded_by uuid not null
  created_at timestamptz not null
  deleted_at timestamptz null
  unique (provider, storage_key)
```

文件 metadata 与磁盘对象分离。数据库只保存 opaque storage key，不保存用户可控绝对路径。

### 6.3 本地磁盘 provider

`LocalFileStorageProvider` 规则：

- 根目录来自 `FILE_STORAGE_LOCAL_ROOT`，生产环境缺失时启动失败。
- storage key 由服务端生成，例如 `<enterpriseId>/<yyyy>/<mm>/<uuid>`；禁止使用原始文件名拼路径。
- 写入先落临时文件，校验完成后原子 rename；失败时清理临时文件。
- 读取前按 metadata 解析 storage key，并断言解析后的绝对路径仍在 root 下。
- 默认单文件最大 20 MiB，由 `FILE_STORAGE_MAX_BYTES` 配置；必须存在硬上限。
- MIME 与扩展名都按 allowlist 校验；图片首期允许 `image/jpeg`、`image/png`、`image/webp`，
  普通附件 allowlist 在任务包中显式列出。
- 原始文件名只用于展示和下载 header，必须清理控制字符并限制长度。
- 日志、错误信封和审计不得输出磁盘绝对路径。

Docker Compose 增加持久化 volume 挂载；备份 / 恢复文档必须把文件 volume 与 PostgreSQL 一并列为备份对象。

### 6.4 私有访问模型

文件默认私有。M6 不提供“知道 fileId 就能下载”的通用公开内容接口：

- `POST /api/files`：认证用户上传，返回 `FileObjectDto`；权限 `files:object:upload`。
- 文件内容读取：由拥有业务授权语义的模块调用 `FILE_STORAGE_SERVICE.openFile(...)` 后通过自己的
  auth-aware API 代理。例如 M8 档案照片、M9 在位附件、M10 日报附件分别在各自 service 应用数据范围。
- Forms service 在记录提交时只允许绑定同租户、active、可附加的 fileId。
- 跨租户 fileId、未知 fileId、已删除 fileId 一律按不存在处理，不泄露存在性。

M6 不提供最终用户通用文件浏览器，不提供匿名链接。孤儿文件清理、引用计数与保留策略在实际业务接入
后按数据量另开切片。

### 6.5 上传 API

| 方法 + 路径 | 权限点 | 说明 |
| ----------- | ------ | ---- |
| `POST /api/files` | `files:object:upload` | multipart 上传单文件，返回 metadata |
| `GET /api/files/:id` | `files:object:view-own` | 仅上传者读取本人上传的 metadata，便于提交前预览 |

内容读取不从 controller 暴露通用路由；只经 `FILE_STORAGE_SERVICE` 给授权业务 service 使用。

## 7. Platform Core 扩出口

人员选择器需要 Platform Core 公开 lookup port。M6 新增：

```ts
export const PLATFORM_EMPLOYEE_LOOKUP_SERVICE = Symbol('PLATFORM_EMPLOYEE_LOOKUP_SERVICE');

export interface PlatformEmployeeLookupPort {
  listEmployeesByIds(enterpriseId: string, ids: string[]): Promise<EmployeeLookupDto[]>;
}
```

规则：

- `enterpriseId` 必须来自上游已认证 actor context。
- 返回同租户 active 员工的最小快照：`id / employeeNo / name / departmentId / departmentName`。
- 请求 ids 与返回 ids 集合不一致时，调用方按不存在处理。
- Forms service 只依赖 `@work/platform-contract` token，不 import `apps/platform-api/...`。
- 同步更新 `docs/module-contract.md` §7.1.6 已可用 platform 出口。

## 8. 权限、审计、事件

### 8.1 权限

两个 contract manifest 声明：

```text
forms:definition:view
forms:definition:manage
forms:record:submit
forms:record:view
files:object:upload
files:object:view-own
```

本期不自动给普通员工授予权限。seed 的系统管理员继续获得所有 active manifest 权限。

### 8.2 审计

必须记录：

| action | 触发 | metadata 最小集 |
| ------ | ---- | --------------- |
| `forms.definition.update` | 替换槽位字段 | `slotKey, revision, fieldKeys` |
| `forms.record.create` | 写表单记录 | `slotKey, recordId, subjectType, subjectId` |
| `files.object.upload` | 上传文件成功 / 失败 | `fileId?, mediaType, sizeBytes, result` |

不得在审计写入：

- 文件内容、磁盘路径、完整请求体。
- 表单字段值全文。
- 跨租户命中对象的 metadata。

### 8.3 事件

发布可追踪事件：

```text
forms.definition.updated
forms.record.created
files.object.uploaded
```

M6 只要求事件可追踪，不触发通知。真实通知消费归 M7。

## 9. 安全要求

M6 属安全敏感基建。实现时必须同步更新 `docs/security-baseline.md`，至少增加文件上传 / 私有读取基线：

- 所有租户边界从认证 actor context 派生。
- repository 所有读写带 `enterprise_id`；跨租户对象按不存在处理。
- 文件名不参与物理路径；路径解析必须防 traversal。
- 文件大小、MIME、扩展名、字段数量、字段值长度全部有硬上限。
- 不开放匿名下载，不在错误、日志、审计泄露磁盘路径。
- 文件内容读取必须由拥有业务授权语义的模块代理，不允许仅凭 fileId 读取。
- 写操作走审计；拒绝路径记录 bounded failure audit，不回写敏感值。
- PostgreSQL 与本地磁盘 volume 必须一并备份恢复。

M6-2 与 M6-3 完成前都必须跑 `security-reviewer` 独立二审。

## 10. Repository 与迁移

每个模块都提供：

```text
PostgreSQL repository
memory repository / temp-disk provider for non-env-gated tests
独立 migration runner
repository integration tests
```

根脚本追加：

```text
db:migrate:files
db:migrate:forms
db:setup = platform -> presence -> files -> forms -> seed
```

顺序原因：Forms service 依赖 Files port；数据库 schema 本身不跨 schema 建外键，不跨 schema join。

## 11. 测试要求

### 11.1 Forms

- 注册槽位可读写；未知槽位拒绝。
- 字段 key 唯一、类型白名单、options 约束、字段数量上限。
- revision 乐观并发冲突拒绝。
- 提交记录后 label / type / display 快照保持不变，即使 definition 后续修改。
- 必填、未知字段、重复字段、类型错误拒绝。
- `file` / `image` 只接受 Files port 认可的同租户 fileId。
- `employee` 只接受 Platform Core lookup 返回的同租户员工，显示快照正确。
- repository 所有 read / write 按 enterpriseId 隔离。

### 11.2 Files

- multipart 单文件上传成功，metadata 与 sha256 正确。
- 超大小、非法 MIME、非法扩展名、空文件拒绝。
- 原始文件名不能改变 storage root；控制字符被清理。
- 临时写失败不留下 metadata 或残留临时文件。
- 同租户本人可读取 metadata；其他上传者、跨租户、未知 id 按不存在处理。
- `openFile` 只允许同租户 actor context；路径 traversal storage key 被拒绝。
- 审计不含内容、磁盘绝对路径或跨租户 metadata。

### 11.3 组合验证

- gateway 全局 auth / permission guard 对 forms 与 files 路由生效：401 / 403。
- PostgreSQL migrations 可从空库执行且重复执行幂等。
- `pnpm verify`、`pnpm verify:full`、`pnpm docker:build`。
- API smoke：配置固定槽位字段，上传文件，提交含文件与人员字段的记录，再读取快照。

## 12. 后端退出标准

M6 后端完成必须满足：

- 有权限者可经 API 配置注册槽位字段；不能创建任意表单。
- 填报记录可存取，旧记录保留字段 label / type / display 快照。
- 文件与人员字段均完成同租户校验；文件只保存 opaque fileId。
- 本地磁盘 provider 可持久化文件；Docker volume 与备份恢复文档就绪。
- 文件内容没有通用 UUID 下载入口；后续业务模块只能经公开 port 接入并在自己的 API 应用授权。
- 两个模块 schema、contract、repository、migration、manifest、审计、事件、测试齐全。
- 安全基线同步，`security-reviewer` 二审无未决 High / Medium。
- 本地 `pnpm verify`、有 PostgreSQL 时 `pnpm verify:full`、`pnpm docker:build` 和 API smoke 通过。

前端原型确认后的配置 / 填报 UI 作为单独任务包交付，不阻塞本 RFC 的后端基建实现；但 M8 / M9 / M10
进入用户可用验收前，相关页面必须接入真实 Forms / Files API。

## 13. 切片计划

| 切片 | 范围 | 安全审查 |
| ---- | ---- | -------- |
| **M6-0** | 本 RFC：冻结模块边界、slot、schema、文件 provider、安全边界和后端切片 | 文档审查 |
| **M6-1** | `forms` / `files` contract、manifest、权限 seed、schema、迁移、repository 双实现、gateway 装配、根脚本 | 建议 |
| **M6-2** | 本地磁盘 Files provider + 上传 API + Docker volume / 环境变量 / 部署备份文档 + tests | **必过 `security-reviewer`** |
| **M6-3** | Forms definition API、记录 service / port、快照值、文件 / 人员字段校验、Platform employee lookup port、审计、事件、tests | **必过 `security-reviewer`** |
| **M6-4** | 后端交付验证：`verify` / `verify:full` / Docker build / API smoke / verification-log 收口 | — |
| **M6-W** | 前端配置页、填报控件、上传交互；等待产品原型后另发任务包 | 待原型 |

## 14. 已决定事项

- M6 只做固定槽位，不做任意表单生成器。
- 表单与文件是两个独立共享后端模块，分别拥有 `forms.*` 与 `files.*`，不放入 `platform.*`。
- M6 仍内嵌 gateway，不提前拆独立服务。
- 文件首期用本地磁盘 provider；MinIO 保留为替换实现，不在本期引入。
- 文件默认私有；不提供仅凭 fileId 下载内容的通用路由。
- 表单记录保存 label / type / display 快照；不建完整 definition 版本历史。
- 人员选择器通过 Platform Core 公开 employee lookup port 校验与取快照，不跨 schema 查询。
- Web 等待产品原型，以独立任务包实现；后端先行。

## 15. 待审查项

- 普通附件 MIME / 扩展名 allowlist 的首期清单，在 M6-2 任务包冻结。
- `presence.status.<statusTypeCode>` 的 validator port 与 M9 状态字典契约，在 M9 RFC 最终落位；
  M6 期间保持 reserved，不接受写入。
- 孤儿文件清理与保留策略在 M8 / M9 / M10 首个真实接入后按数据量决定，不阻塞 M6。
