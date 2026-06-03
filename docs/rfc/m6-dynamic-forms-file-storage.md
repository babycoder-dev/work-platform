# RFC: M6 动态表单 mini + 文件存储

## 状态

Accepted

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
  attachFiles(actor: FileActorContext, input: AttachFilesInput, uow: UnitOfWork): Promise<FileObjectDto[]>;
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

### 5.2.1 输入硬上限

实现不得只依赖数据库列宽。DTO 与 service 必须在解析和持久化前应用以下默认硬上限：

| 项 | 上限 |
| -- | ---- |
| 每个 definition 字段数 | 100 |
| `fieldKey` 长度 | 64 characters |
| `label` 长度 | 128 characters |
| `description` 长度 | 512 characters |
| 单选 / 多选 options 数 | 100 |
| option key 长度 | 64 characters |
| option label 长度 | 128 characters |
| `text` 长度 | 512 characters |
| `textarea` 长度 | 10,000 characters |
| `multi_select` 选中项 | 100 |
| 单个 `file` / `image` 字段文件数 | 10 |
| 单个 `employee` 字段人员数 | 100 |
| 单条记录全部 values JSON 序列化后大小 | 256 KiB |

`number` 必须是有限 JSON number；`date` 必须是 ISO 8601 日期字符串。未知 DTO 字段、multipart
额外字段、重复 value key 和超过上限的输入统一返回 400。

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
  unique (enterprise_id, id)

form_fields
  id uuid pk
  enterprise_id uuid not null
  definition_id uuid not null
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
  foreign key (enterprise_id, definition_id)
    references forms.form_definitions(enterprise_id, id) on delete cascade

form_records
  id uuid pk
  enterprise_id uuid not null
  definition_id uuid not null
  slot_key varchar(128) not null
  definition_revision integer not null
  subject_type varchar(64) not null
  subject_id varchar(128) not null
  submitted_by uuid not null
  created_at timestamptz not null
  updated_at timestamptz not null
  unique (enterprise_id, id)
  foreign key (enterprise_id, definition_id)
    references forms.form_definitions(enterprise_id, id)

form_record_values
  id uuid pk
  enterprise_id uuid not null
  record_id uuid not null
  field_key varchar(64) not null
  field_label_snapshot varchar(128) not null
  field_type_snapshot varchar(32) not null
  value jsonb not null
  display_snapshot jsonb null
  sort_order_snapshot integer not null
  unique (record_id, field_key)
  foreign key (enterprise_id, record_id)
    references forms.form_records(enterprise_id, id) on delete cascade
```

`revision` 只用于并发更新检测和记录“提交时看到的 definition revision”，不是完整版本表。旧 definition
不保留全量历史；旧记录依靠 `form_record_values` 的 label / type / display 快照自描述。

### 5.4 记录写入

提交记录时，Forms service 必须在一个事务中：

1. 按认证租户和注册槽位读取 active definition 与字段。
2. 拒绝未知字段、重复字段、缺失必填字段和类型不匹配值。
3. 对 `file` / `image` 调用 `FILE_STORAGE_SERVICE.attachFiles(...)`；只允许绑定当前用户上传的
   `staged` 文件，并以 `forms / form_record / recordId` 原子写入引用。
4. 对 `employee` 调用 Platform Core 公开 employee lookup port，校验同租户员工并生成显示快照。
5. 写 `form_records` 和带 label / type / display 快照的 `form_record_values`。
6. 写审计并发布领域事件。

下游业务模块负责决定 `subjectType / subjectId` 是否可写、哪些记录可读。Forms service 只接受调用模块
通过公开 port 传入的 actor context，不自行猜测档案、在位、日报的数据范围语义。

M6 内嵌阶段用 opaque `UnitOfWork` 协调同一 PostgreSQL transaction：Forms repository 只写
`forms.*`，Files service 只写 `files.*`，双方不暴露 table 定义、不写跨 schema SQL。这样记录值与
`file_references` 要么一起提交，要么一起回滚。`UnitOfWork` 是内嵌阶段内部 port，不进入对外 HTTP
DTO。vNext 拆服务时，再在保持对外 API / DTO 稳定的前提下把内部协调替换为 reservation + outbox；
M6 不提前引入分布式事务。

### 5.5 HTTP API

M6 提供 definition 管理 API，用于后续管理 UI。controller 先通过 slot registry 解析 `slotKey`，
再按槽位族执行动态权限检查；不得只挂一个跨槽位的 manage 权限：

| 方法 + 路径 | 权限点 | 说明 |
| ----------- | ------ | ---- |
| `GET /api/forms/definitions/:slotKey` | 对应槽位族 `*:view` | 获取当前租户槽位定义 |
| `PUT /api/forms/definitions/:slotKey` | 对应槽位族 `*:manage` | 整组替换字段，revision 乐观并发 |

槽位族权限映射：

| 槽位族 | view | manage |
| ------ | ---- | ------ |
| `profile.employee` | `forms:profile-definition:view` | `forms:profile-definition:manage` |
| `report.daily` | `forms:report-definition:view` | `forms:report-definition:manage` |
| `presence.status.*`（M9 才启用） | `forms:presence-definition:view` | `forms:presence-definition:manage` |

未知或 reserved 槽位在权限判断前返回 404；持有另一槽位族 manage 权限不能读写当前槽位。
实现使用专用 `FormsDefinitionPermissionGuard`（或等价 guard）：先由 slot registry 解析 active 槽位，
再映射到唯一权限码并检查 `currentUser.permissions`。不得在 controller 内临时拼字符串判断，也不得
用一个静态 `forms:*` 权限覆盖全部槽位。

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
files.file_references
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
  staged_expires_at timestamptz not null
  deleted_at timestamptz null
  unique (provider, storage_key)
  unique (enterprise_id, id)

file_references
  id uuid pk
  enterprise_id uuid not null
  file_id uuid not null
  owner_module varchar(64) not null
  reference_type varchar(64) not null
  reference_id varchar(128) not null
  attached_by uuid not null
  created_at timestamptz not null
  unique (enterprise_id, file_id)
  unique (enterprise_id, file_id, owner_module, reference_type, reference_id)
  foreign key (enterprise_id, file_id)
    references files.file_objects(enterprise_id, id) on delete cascade
```

文件 metadata 与磁盘对象分离。数据库只保存 opaque storage key，不保存用户可控绝对路径。上传完成后
对象先处于 `staged`；业务记录成功绑定时，由 Files service 参与 Forms 发起的同一个 opaque
`UnitOfWork`，写 `file_references` 并转为 `attached`。同一引用操作必须幂等。Forms service 负责先
生成 record id，再调用 `attachFiles` 校验并写引用；Forms 记录事务失败时引用也必须回滚。
`status` 只允许 `staged | attached | deleting | deleted`。M6 采用**单引用模型**：一个文件对象最多绑定
一个业务引用，不允许把已绑定到档案的文件再次绑定到日报等更宽可见范围。只有
`enterpriseId + fileId + ownerModule + referenceType + referenceId` 完全相同的 attach 重试才按幂等成功处理。

### 6.3 本地磁盘 provider

`LocalFileStorageProvider` 规则：

- 根目录来自 `FILE_STORAGE_LOCAL_ROOT`，生产环境缺失时启动失败。
- storage key 由服务端生成，例如 `<enterpriseId>/<yyyy>/<mm>/<uuid>`；禁止使用原始文件名拼路径。
- 写入先落临时文件，校验完成后原子 rename；失败时清理临时文件。
- 读取前按 metadata 解析 storage key，并断言解析后的绝对路径仍在 root 下。
- 默认单文件最大 20 MiB，由 `FILE_STORAGE_MAX_BYTES` 配置；必须存在硬上限。
- MIME 与扩展名都按 allowlist 校验；图片首期允许 `image/jpeg`、`image/png`、`image/webp`，
  普通附件 allowlist 在任务包中显式列出。
- MIME 不得只信任 multipart header 或扩展名；provider 必须读取 magic bytes 检测真实类型，
  伪造 MIME 或扩展名不一致统一拒绝。
- 原始文件名只用于展示和下载 header，必须清理控制字符并限制长度。
- 日志、错误信封和审计不得输出磁盘绝对路径。

Docker Compose 增加持久化 volume 挂载。部署文档必须把文件 volume 与 PostgreSQL 一并列为敏感
备份对象，要求受限 ACL、保留 / 删除策略、协调备份步骤，以及恢复后的 metadata-volume 完整性检查。

### 6.3.1 上传滥用治理

本地 volume 是有限资源。M6-2 必须同时实现：

- `staged` 文件 TTL 清理：默认 24 小时；只清理无 `file_references` 的对象和磁盘文件。
- 租户总配额：默认 10 GiB；用户总配额：默认 1 GiB；配置可下调，不能关闭。
- 用户上传速率限制：默认每分钟 20 次、每小时 200 MiB；超限返回 429。
- 磁盘剩余空间阈值：低于 10% 或 2 GiB（取更严格者）拒绝新上传，并记录可观测告警日志。
- 清理任务审计 / 指标：记录清理数量和释放字节数，不记录文件路径。

上传成功进入 `staged` 时必须写 `staged_expires_at = created_at + staged TTL`，不允许产生无到期时间的
staged 对象。配额统计必须计入所有尚未确认释放磁盘空间的状态（`staged | attached | deleting`），
不能通过不绑定文件或删除失败绕过。
M6-2 用 `FilesCleanupService` 在 gateway 进程内按默认 15 分钟周期清理，并提供可单独执行的
`files:cleanup-staged` 命令用于运维补跑；M7 调度基建落地后再把触发器切换到统一 scheduler。

attach 与 cleanup 必须按以下状态机竞争，不允许“先查再改”：

- attach 在 Forms 发起的 opaque `UnitOfWork` 内用行锁或等价条件更新 claim：
  `staged -> attached WHERE enterprise_id = ? AND id = ? AND uploaded_by = ? AND status = 'staged'`，
  同一事务写唯一 `file_references`。事务回滚时状态和引用一起回滚，磁盘对象保持不动。
- cleanup 用行锁或等价条件更新原子 claim 已过期且无引用的对象：
  `staged -> deleting WHERE staged_expires_at <= now()`。claim 成功后才允许删除磁盘对象。
- 磁盘删除成功后写 `deleted_at` 并转 `deleting -> deleted`；磁盘删除失败时保持 `deleting`，
  记录 bounded failure audit / 告警，并由后续 cleanup 重试。`deleting` 对象禁止 attach。重试时磁盘
  文件已经不存在视为幂等删除成功，继续收敛为 `deleted`；磁盘删除成功但数据库更新失败也按此路径恢复。
- 完全相同引用的 attach 幂等重试可返回已有 `attached` 对象；不同引用一律拒绝。

### 6.4 私有访问模型

文件默认私有。M6 不提供“知道 fileId 就能下载”的通用公开内容接口：

- `POST /api/files`：认证用户上传，返回 `FileObjectDto`；权限 `files:object:upload`。
- 文件内容读取：由拥有业务授权语义的模块调用 `FILE_STORAGE_SERVICE.openFile(...)` 后通过自己的
  auth-aware API 代理。例如 M8 档案照片、M9 在位附件、M10 日报附件分别在各自 service 应用数据范围。
- Forms service 在记录提交时只允许绑定同租户、`staged`、`uploadedBy === actor.userId` 的 fileId；
  委托绑定不在 M6 范围。绑定时由 Files service 原子写 `file_references`。
- 跨租户 fileId、未知 fileId、已删除 fileId 一律按不存在处理，不泄露存在性。

M6 不提供最终用户通用文件浏览器，不提供匿名链接。业务记录删除后的引用释放与 attached 文件保留
策略在首个真实业务接入时冻结；但 staged TTL 清理、引用表、配额和限流必须在 M6-2 完成。

### 6.5 上传 API

| 方法 + 路径 | 权限点 | 说明 |
| ----------- | ------ | ---- |
| `POST /api/files` | `files:object:upload` | multipart 上传单文件，返回 metadata |
| `GET /api/files/:id` | `files:object:view-own` | 仅上传者读取本人上传的 metadata，便于提交前预览 |

内容读取不从 controller 暴露通用路由；只经 `FILE_STORAGE_SERVICE` 给授权业务 service 使用。
后续业务代理下载必须统一设置 `X-Content-Type-Options: nosniff`；普通附件强制
`Content-Disposition: attachment`。只有 magic-byte 检测通过且属于安全图片 allowlist 的对象才允许
业务模块按明确场景使用 `inline`。

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
forms:profile-definition:view
forms:profile-definition:manage
forms:report-definition:view
forms:report-definition:manage
forms:presence-definition:view      // M9 启用 presence.status.* 时注册
forms:presence-definition:manage    // M9 启用 presence.status.* 时注册
forms:record:submit
forms:record:view
files:object:upload
files:object:view-own
```

权限命名继续遵守 `<module>:<resource>:<action>`。本期不自动给普通员工授予权限。seed 的系统管理员
继续获得所有 active manifest 权限；reserved 的 presence definition 权限到 M9 启用槽位时再注册。

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
- 文件大小、magic-byte MIME、扩展名、字段数量、字段值长度全部有硬上限。
- staged 文件必须 owner-bound；绑定时写 Files 模块拥有的引用表。TTL 清理、租户 / 用户配额、
  上传限流、磁盘阈值拒绝和告警不能延后。
- attach 与 cleanup 必须用原子 claim 状态迁移防竞态；M6 文件采用单引用模型，不允许跨业务记录复用。
- 不开放匿名下载，不在错误、日志、审计泄露磁盘路径。
- 文件内容读取必须由拥有业务授权语义的模块代理，不允许仅凭 fileId 读取。
- 代理下载默认 `attachment` + `nosniff`；只有检测通过的安全图片允许按明确业务场景 inline。
- 写操作走审计；拒绝路径记录 bounded failure audit，不回写敏感值。
- PostgreSQL 与本地磁盘 volume 必须协调备份恢复，备份按敏感数据保护并做恢复完整性检查。

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
- 输入硬上限逐项验证：文本长度、options 数、数组元素数、file / employee 数、values JSON 总大小。
- profile / report 槽位权限交叉拒绝；reserved / 未知槽位在权限判断前 404。
- revision 乐观并发冲突拒绝。
- 提交记录后 label / type / display 快照保持不变，即使 definition 后续修改。
- 必填、未知字段、重复字段、类型错误拒绝。
- `file` / `image` 只接受 Files port 认可的当前上传者同租户 staged fileId，并产生幂等引用。
- `employee` 只接受 Platform Core lookup 返回的同租户员工，显示快照正确。
- repository 所有 read / write 按 enterpriseId 隔离。
- PostgreSQL 复合 FK 拒绝跨租户 definition / record 子表污染。

### 11.2 Files

- multipart 单文件上传成功，metadata 与 sha256 正确。
- 超大小、非法 MIME、伪造 MIME、非法扩展名、空文件和 multipart 附加字段拒绝。
- 原始文件名不能改变 storage root；控制字符被清理。
- 临时写失败不留下 metadata 或残留临时文件。
- 同租户本人可读取 metadata；其他上传者、跨租户、未知 id 按不存在处理。
- 同租户其他上传者的 staged fileId 不得被绑定。
- staged TTL 清理、租户 / 用户配额、速率限制和磁盘阈值拒绝可验证。
- attach 与 cleanup 并发时只有一个原子 claim 成功；磁盘删除失败保持 `deleting` 并可重试。
- staged 对象必须有 expiry；`deleting` 继续计入配额；删除成功但数据库更新失败可幂等恢复为 `deleted`。
- 单个文件最多一个引用；相同引用 attach 幂等，不同引用复用拒绝。
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
- staged TTL 清理、引用表、租户 / 用户配额、上传限流、磁盘阈值拒绝和可观测告警已落地。
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
| **M6-2** | 本地磁盘 Files provider + staged / attached 引用生命周期 + TTL 清理 + 配额 / 限流 / 磁盘阈值 + 上传 API + Docker volume / 环境变量 / 协调备份恢复文档 + tests | **必过 `security-reviewer`** |
| **M6-3** | Forms definition API、记录 service / port、快照值、文件 / 人员字段校验、Platform employee lookup port、审计、事件、tests | **必过 `security-reviewer`** |
| **M6-4** | 后端交付验证：`verify` / `verify:full` / Docker build / API smoke / verification-log 收口 | — |
| **M6-W** | 前端配置页、填报控件、上传交互；等待产品原型后另发任务包 | 待原型 |

## 14. 已决定事项

- M6 只做固定槽位，不做任意表单生成器。
- 表单与文件是两个独立共享后端模块，分别拥有 `forms.*` 与 `files.*`，不放入 `platform.*`。
- M6 仍内嵌 gateway，不提前拆独立服务。
- 文件首期用本地磁盘 provider；MinIO 保留为替换实现，不在本期引入。
- 文件默认私有；不提供仅凭 fileId 下载内容的通用路由。
- staged 文件 owner-bound；M6-2 必须落引用表、TTL 清理、配额、限流和磁盘阈值治理。
- 表单记录保存 label / type / display 快照；不建完整 definition 版本历史。
- 人员选择器通过 Platform Core 公开 employee lookup port 校验与取快照，不跨 schema 查询。
- Web 等待产品原型，以独立任务包实现；后端先行。

## 15. 待审查项

- 普通附件 MIME / 扩展名 allowlist 的首期清单，在 M6-2 任务包冻结。
- `presence.status.<statusTypeCode>` 的 validator port 与 M9 状态字典契约，在 M9 RFC 最终落位；
  M6 期间保持 reserved，不接受写入。
- attached 文件在业务记录删除后的释放与保留策略，在 M8 / M9 / M10 首个真实接入时冻结；M6-2
  已先落 staged TTL 清理和引用表。
