# Task: M9-3b 在位 web v2（看板 v2 消费 `PresenceBoardEntryDto`（label 驱动、在岗缺省行）+ 自助登记 v2（字典驱动状态 + 动态填报表单 + 本人信息块）+ 状态字典管理页（新路由/菜单）+ platform web `PresenceSection` 语义迁移 + 解除 M9-3a 两个 skip 的 web spec；唯一后端增点 = `getEmployeeStatus` 响应附 `statusLabel`）

## 状态

- 里程碑：M9（在位状态 v2，RFC `docs/rfc/m9-presence-v2.md` Accepted）
- 切片：M9-3b（RFC §16），依赖 **M9-3a（PR #33）合并后的 main**——`PresenceBoardEntryDto` 契约已定
  （双轨审查通过）。**成对交付义务**：M9-3a 声明了 web 回归窗口（看板响应形态已变、web 现按旧形态假绿
  skip），本切片就是窗口的关闭方——M9-3a 合并后应尽快合入本切片；M9-3b PR 开出后回填进 PR #33 的
  Release Gate 链接。
- 非安全敏感面（纯前端 + 一个只读响应附加字段），security-reviewer **非强制**；走**设计还原度门禁**
  （`docs/development-workflow.md` §7）。
- 交付形态：`feat/m9-3b-presence-web-v2` 分支 + PR。

## 0. 任务定位

把 M9 后端三切片（字典/登记 v2/看板反转）的能力接到用户面前，同时关闭 M9-3a 留下的 web 回归窗口。
五件事：

1. **看板 v2**（`PresenceBoardPage` 重写）：消费 `{ items: PresenceBoardEntryDto[] }`——名册语义
   （范围内全体成员）、在岗缺省行（`isDefault:true`）、**label 驱动显示**（服务端 `statusLabel`，
   删除本地枚举映射）、实时部门列。
2. **自助登记 v2**（`RegisterStatusPage` 重写）:状态选项从**字典**来（`GET /presence/status-types`
   active 列表、排除 `isDefault`），选中状态后拉取该状态的 forms 定义
   （`GET /api/forms/definitions/presence.status.<key>`）**动态渲染填报字段**，提交
   `form{definitionRevision, values}`；页首**本人信息只读块**（取自 runtime 缓存的
   `getCurrentUser()`，零 HTTP，见 D-2）；
   历史记录 label 经字典 map 解析。
3. **状态字典管理页**（新页 `/presence/status-types`，权限 `presence:status-type:manage`，新菜单）：
   列表（含 archived）+ 新建 + 改名/改序 + 设为缺省 + 停用/恢复，消费 M9-1 七端点。
4. **platform web `PresenceSection` 语义迁移**：`record:null` → **「在岗（缺省）」**（不再是"无在位
   记录"空态）；label 消费服务端 `statusLabel` 而非本地映射；自定义 key 颜色回退。
5. **解除 M9-3a 的两个 `describe.skip`**（`presence-api-client.spec.ts` / `PresenceBoardPage.spec.tsx`）
   并按新形态重写——这是 M9-3a 显式记账的假绿债，本切片必须清零。

### 任务包决策（对 RFC 的实现取态，评审按此口径）

- **D-1 唯一后端增点 = `getEmployeeStatus` 响应附 `statusLabel`**：`PresenceSection` 要显示 label，
  但按人查询响应（M8-5a）不带 label 且 platform web 无法读 presence 字典（`GET /presence/status-types`
  要 `presence:status:create`，查看者未必有；跨模块拉字典也引入无谓耦合）。M9-3a 任务包 §6 已预留
  此决定归 M9-3b。实现：响应形状从 `{ record }` 扩为 **`{ record, statusLabel? }`**（record 为 null 时
  statusLabel 省略——**注意是省略字段，不是 `statusLabel: null`**，下游 e2e 依赖此语义，见 §2.7）；
  `PresenceStatusRecordDto` 本体**不加字段**——它被 mine-records 等复用，避免语义污染）。presence
  service 侧按 getBoard 同款方式建字典 map，但**有意差异**：这里 `includeArchived: true`（历史记录
  状态可能已归档），getBoard 是 `false`——不是复用同一段逻辑；不 seed（M9-3a §6 口径）：label 查
  不到回退裸 key，`labelByKey.get(status) ?? status`，只读 `listStatusTypes` 一次。**已知展示不对称
  （接受并登记 §7）**：活跃记录的 key 被归档后，看板（active-only map）显裸 key、人页抽屉（含
  archived map）显 label——修齐要动 getBoard（越界），登记为已知项。这是本切片**唯一**后端改动，
  越此即打回。
- **D-2 「档案自动补全」定形 = 本人信息只读块（零额外 HTTP），不做字段级注入**：RFC §5.2 的"部门/
  职务/手机等自动补全"——forms 定义字段 key 是自由命名，与档案字段**不存在映射契约**，字段级自动
  注入无据可依（魔法匹配 fieldKey 是脆约定）。定形为：登记页顶部渲染只读「本人信息」块（**姓名/
  工号/部门，全部取自 runtime 已缓存的 `getCurrentUser()`**——`CurrentUserDto` 含 `name/employeeNo/
departmentId?/departmentName?`（`packages/platform-contract/src/auth.ts:15-27`），且
  `departmentName` 已被登记链路后端依赖（`createRecord` 对缺部门 403），可靠；**零额外 HTTP、无需
  platform 镜像客户端**）。⚠️ **不要用 `GET /api/platform/employees/me`** 做这个块：它返回
  `EmployeeDto`（`users.ts:3-16`），**只有 `departmentId`（uuid）没有 `departmentName`**，"部门"
  会渲染不出来。RFC 列举的**职务/手机**不入本块（展示它们才需要 employees/me 镜像取 `title/mobile`
  ——非登记必需，列预留 §7）；字段级注入待未来定义映射契约后另做（预留，§7）。对 RFC §5.2 的实现
  方式声明。
- **D-3 动态表单只支持轻字段类型**（沿 M8-5b 先例）：`text/textarea/number/date/single_select/
multi_select` 六类渲染输入控件；`file/image/employee` 重类型渲染「暂不支持的字段类型」占位——若
  存在**必填**重字段，禁用提交并提示「该状态的填报模板包含暂不支持的字段，请联系管理员调整」。重字段
  支持结转（同 M8 结转项口径）。
- **D-4 定义读取失败优雅降级**：拉取 forms 定义 403/404/网络错时**不阻断登记**——按"无填报字段"处理
  - 内联提示「未能读取填报模板，仅提交基础信息」（后端 `form` 本就可选）。定义为空（revision 0 /
    fields 空 / 全 inactive）= 无填报字段，不显示表单块、不发 `form`。
- **D-5 label 供给分层 + 状态展示统一 `Tag`（拍板）**：看板行用**服务端** `statusLabel`（零客户端
  映射）；登记页下拉/历史用**字典接口**建 `labelByKey`（登记页持 `presence:status:create` 天然可调
  `GET /presence/status-types`；历史里 archived/未知 key 回退裸 key）。**展示组件实况与拍板**：
  presence web **现无任何 status-badge 样式**（全仓 grep `status-badge` 仅命中 `StatusBadge.tsx`
  组件本身，无 `.css` 定义五键类，也无 `.presence-board__*`/`.presence-register__*` 样式——类名
  一直裸挂）。故**不走**"补 CSS"路线：**删除 `StatusBadge` 组件整体**（连同 `STATUS_LABELS` 与
  `formatStatusLabel`——残留调用点编译红，编译期防回退），看板/登记历史/字典管理的状态展示统一
  `@work/ui` `Tag`（含 dot），色由本地 helper `statusTagColor(key)` 供给：预置五键（**用 contract
  已导出的 `presetPresenceStatusKeys` 判定**，`modules/presence/contract/src/events.ts:5-13`，防
  漂移）映射 `PresenceSection.presenceColor` 同款色板（working→green / business_trip→purple /
  field_research→cyan / 其余→orange），未知自定义 key → 中性色（如 `blue`）。与还原度门禁"组件库
  优先"一致。
- **D-6 字典管理页不含 forms 定义管理 UI**：RFC §16 M9-3b 行只列字典管理 UI；每状态填报模板
  （`presence.status.<key>` 定义）的配置沿用 forms API（`PUT /api/forms/definitions/:slotKey`，
  M9-2 已激活 + guard 生效），定义管理 UI 属后续切片（预留，§7 登记）。字典管理页可在行内展示
  「填报模板：X 个字段」只读提示（GET 定义，需 `forms:presence-definition:view`——仅持
  `statusTypeManage` 的管理员会 403/404，**实现时必须带降级**：读不到就不显示该提示，不报错）——
  **可选实现**，无则不扣。
- **D-7 新菜单**：`状态字典`（`/presence/status-types`，权限 `statusTypeManage`，sortOrder 120）——
  contract 双 manifest 同步（web `manifest.ts` menus/routes + seed 侧 `platform-manifest.ts` menus，
  新固定 uuid `...000000000106`，**先 grep 该 uuid 全仓未被占用**）。菜单经 permission 天然只对
  HR/管理员可见（拍板③）。

### 还原度门禁判定（development-workflow §7，先例：UI 收口切片）

- **设计稿实况**：`docs/design/ui-handoff/design/` 目录**无**在位看板/状态登记/字典管理专稿（现有
  专稿 = 工作台/组织成员/消息中心/待办/审批五页；登录/外壳是 `企业工作台设计规范.html` 内章节，
  见 README §4/§5.1）。
- **判定：三页全部 L2**（锚设计系统），L1 项为空。锚点 = `tokens.css` 设计变量 + `企业工作台设计
规范.html` + **`组织成员.html` 的列表/工具栏/抽屉范式**（字典管理页、看板表格的结构参照）+
  `@work/ui` 组件库现役组件。
- **L2 还原断言（进 §4.2，验收可判）**：
  1. 三页交互控件一律用 `@work/ui`（`Table`/`Tag`/`Modal`/`ConfirmDialog`/`Select`/`Input`/
     `Textarea`/`Button`/`EmptyState`/`Toast`/`Segmented` 等）——**禁止**裸 `<button>/<select>/
<input>` 与手写弹窗（现两页的裸控件全部替换）。
  2. 颜色/间距/圆角/字号一律走 tokens CSS 变量，零硬编码色值。
  3. 页头结构（标题 + 操作区）、卡片容器、空态（`EmptyState`）、加载/错误态样式与工作台/组织成员
     页同范式。
  4. 状态标识用 `Tag`（含 dot），色板与 `PresenceSection` 的 presenceColor 家族一致（D-5 的
     `statusTagColor`）。
  5. **A2**：零 emoji 当图标，图标一律 `@work/ui` `Icon`（workflow §7 A 类原文）。
  6. **A5**：不删真实接线、不造假数据占位；不可用区域诚实置灰/占位并注明原因（如 D-3 重字段占位、
     D-6 可选提示降级）。
  - **A3 豁免说明**：三页无专稿 ⇒ "文案逐字对稿"退化为 spec 内自定文案断言（本任务包 §4.2 所列
    文案即基准），PR 描述写明此豁免依据。
- **L1/L2 边界**：若后续补出专稿，看板/登记升 L1 从严对稿——本切片按 L2 交付并在 §7 登记此边界。

### 本切片不做（越界即打回）

- 后端一切改动，**除 D-1 一项**（getEmployeeStatus 附 statusLabel）。不动 getBoard/字典七端点/
  登记链路/forms/权限/迁移/seed。
- Excel 导出与导出入口（M9-4——入口按钮随 M9-4 一起加，避免死按钮）。
- 看板按状态筛选/分部门分组/分页（RFC §5.3【可后做】）。
- forms 定义管理 UI（D-6 预留）；重字段类型支持（D-3 结转）。
- 桌面端（vNext）；`notification.created` 面；M9-3a 已交付面的任何回改。
- 新权限点（复用四个既有权限）；新 e2e 文件（web 断言走 `*.spec.tsx`，后端 e2e M9-3a 已覆盖）。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `docs/rfc/m9-presence-v2.md` §3 web 行（硬编码消费点清单）、§5.1/§5.2/§5.3（三页能力）、§16
   M9-3b 行、§18 拍板③。
2. `docs/tasks/m9-3a-board-realtime-backend.md` §0 D-2（回归窗口——本切片关闭它）+ §2.2
   （`PresenceBoardEntryDto` 契约）；`docs/tasks/m9-2-self-registration-forms-generalization.md`
   §2.5（登记请求 `form` 块）+ §0-7（员工角色三件套：`presence:status:create` + `forms:record:submit`
   - `forms:presence-definition:view`）。
3. `docs/development-workflow.md` §7（还原度门禁流程）+ `docs/design/ui-handoff/README.md` +
   `design/tokens.css`、`企业工作台设计规范.html`、`组织成员.html`（L2 锚）。
4. **presence web 现状（按 M9-3a 合并后 main 重核行号）**：
   - `modules/presence/web/src/pages/PresenceBoardPage.tsx`（旧 DTO 列表渲染，全重写）+
     `PresenceBoardPage.spec.tsx`（**describe.skip 状态**，解除并重写）。
   - `pages/RegisterStatusPage.tsx`（`STATUS_CHOICES` 硬编码 4 键 `:7`、裸控件表单）+ 其 spec。
   - `components/StatusBadge.tsx`（`STATUS_LABELS` 硬编码 `Record<PresenceStatus,string>` :3-9——
     类型放宽后对自定义 key 返回 `undefined` 渲染空白，**静默坏**）。
   - `api/presence-api-client.ts`（`getBoard(): Promise<PresenceStatusRecordDto[]>` 旧形态 :8）+
     其 spec（**describe.skip 状态**）。
   - `module.ts`（两路由）+ `runtime.ts`（`createHttpClient({ baseUrl })` 可开任意前缀 :9——forms/
     platform 镜像客户端的通路）。
5. **contract**：`modules/presence/contract/src/status.dto.ts`（`PresenceBoardEntryDto` 全字段 +
   `CreatePresenceStatusRecordInput.form`）、`status-type.dto.ts`（字典 DTO）、`manifest.ts`（web
   菜单/路由）、`platform-manifest.ts`（seed 菜单，现 id 104/105）。
6. **字典 API 面（M9-1）**：`modules/presence/api/src/status-type/presence-status-type.controller.ts`
   ——`GET /presence/status-types`（**statusCreate 即可**，登记页复用）、`GET /all`、`POST /`、
   `PATCH /:id`、`POST /:id/default`、`POST /:id/archive`、`POST /:id/restore`（后六个
   statusTypeManage）；`presence-status-type.dto.ts`（key 格式 `^[a-z][a-z0-9_]{1,63}$`、label 长度
   ——新建表单前端校验对齐后端）。
7. **按人查询现状（D-1 改点）**：`modules/presence/api/src/status/presence-status.service.ts`
   `getEmployeeStatus`（M9-3a 合并后行号自查）+ `presence-status.controller.ts`
   `GET /presence/status-records/by-employee/:employeeId`。
8. **platform web**：`modules/platform/web/src/pages/PresenceSection.tsx`（本地 `PRESENCE_LABELS`
   :7-14、`presenceColor` :101-112、`record:null` 空态 :73-75）+ `api/presence-types.ts`（本地镜像
   类型）+ `api/presence-api-client.ts`（platform web 侧的 presence 镜像客户端）。
9. **跨模块镜像先例（M8-5b）**：`modules/platform/web/src/api/forms-api-client.ts` + `forms-types.ts`
   （本地镜像类型 + 独立 baseUrl 客户端——presence web 照此建 forms/platform 镜像）+
   `pages/ProfileCustomFieldsForm.tsx`（轻字段动态渲染先例：字段类型→控件映射、必填校验、select
   options——登记页动态表单照此范式自建，**不得跨模块 import platform web 组件**）。
10. `packages/ui/src/index.ts`（24 个现役组件清单——L2 断言 1 的白名单）。
11. 本地跑 web 测试的环境坑（**不改代码，只影响本地验证**）：shell `NODE_ENV` 必须为 `test`；
    Node 25 本机需 `NODE_OPTIONS=--localstorage-file=<路径>` 绕过全局 localStorage 遮蔽 jsdom
    （CI Node 22 不受影响）。

## 2. 设计要点（严格遵守）

### 2.1 presence 契约与 api client

- `status.dto.ts` 新增按人查询响应类型：
  ```ts
  export interface PresenceEmployeeStatusDto {
    record: PresenceStatusRecordDto | null;
    statusLabel?: string; // record 非空时给（字典 label，查不到回退裸 key）；null 时省略
  }
  ```
- `presence-api-client.ts`（presence web）重写：
  - `getBoard(): Promise<PresenceBoardEntryDto[]>`（`http.get<{items}>('board')`）。
  - `listStatusTypes(): Promise<PresenceStatusTypeDto[]>`（`'status-types'`，active 列表）。
  - `listAllStatusTypes/createStatusType/updateStatusType/setDefaultStatusType/archiveStatusType/
restoreStatusType`（字典管理页用，路径见 §1-6）。
  - `createRecord(input)` 类型随 contract 已含 `form?`，无签名变化。
- presence web 新增**一个**镜像客户端（M8-5b 范式，**本地类型、零跨模块 import**）：
  - `api/forms-mirror.ts`：`createHttpClient({ baseUrl: '/api/forms/' })`；
    `getPresenceStatusDefinition(key): Promise<FormsDefinitionMirror>`（GET
    `definitions/presence.status.<key>`）；本地类型仅需 `{ revision: number; fields: Array<{
fieldKey; label; fieldType; required; description?; sortOrder; options?: Array<{key; label}>;
status }> }`。
  - ~~platform-mirror~~ **不建**（M-1 修正）：本人信息块取自 runtime 缓存的 `getCurrentUser()`
    （D-2），无需 `/api/platform/` 客户端。`runtime.ts` 相应只需新增 forms 镜像客户端的装配与
    getter（照 `setPresenceRuntime` 现范式 `:8-12` 加一个 `createHttpClient({ baseUrl:
'/api/forms/' })`）。

### 2.2 看板 v2：`PresenceBoardPage.tsx` 重写

- 数据：`getBoard()` → `PresenceBoardEntryDto[]`。**行 key 用 `entry.userId`**（旧 `record.id` 不存在了）。
- 渲染（L2）：`Card` 容器 + `Table`（列：成员（姓名+工号）/ 部门（实时）/ 状态（`Tag` 显示
  `entry.statusLabel`，色按 key 家族 + 未知回退）/ 起止时间（`isDefault` 行显示 `—`）/ 备注）；
  页头保留刷新（`Button`）；统计条（可选）：`在岗 X / 离岗 Y`（按 `isDefault` 计数，拍板②语汇）。
- 空名册（items 空 = scope 内无成员）→ `EmptyState`；错误 → 既有错误样式/`Toast`。
- **禁止**任何 `formatStatusLabel`/本地 label map 残留。

### 2.3 登记 v2：`RegisterStatusPage.tsx` 重写

流程：

1. 挂载拉取：`listStatusTypes()`（active）。状态下拉 = 字典行**排除 `isDefault`**（在岗不可登记，
   与后端拒绝一致），显示 `label`，值为 `key`；字典为空/全 default → `EmptyState`「暂无可登记的
   状态类型」。
2. 本人信息块（只读）：姓名/工号/部门，**同步取自 `getCurrentUser()`**（D-2，零 HTTP、无失败态；
   `departmentName` 为 undefined 时该行隐藏）。
3. 选中状态 → `getPresenceStatusDefinition(key)`：active fields > 0 → 渲染动态字段（D-3 六类轻
   字段，控件用 `@work/ui`；必填标记与前端校验对齐 `required`；select 用 options）；失败/空 → D-4
   降级。切换状态时清空已填字段值。
4. 提交：`createRecord({ status, startAt, endAt?, remark?, form: fields>0 ? { definitionRevision:
def.revision, values: [已填字段] } : undefined })`。**只提交用户实际填写的字段**（空可选字段不进
   values——后端未知字段/必填缺失会 400，前端先校验必填）。错误信封 message 展示（400/409/404 文案
   服务端已中文）。
5. 历史区保留（listMyRecords + cancel），label 用 `labelByKey.get(status) ?? status`（字典 map 来自
   第 1 步，archived key 回退裸 key）。

- 时间语义保持现状（`datetime-local` → `toIsoString`；后端已有 `endAt<=startAt` 400，前端可加同款
  即时校验提升体验，非必须）。

### 2.4 `StatusBadge.tsx` 处置（D-5 拍板：删除组件，统一 `Tag`）

- **删除 `StatusBadge.tsx` 整个文件**（含 `STATUS_LABELS` 与 `formatStatusLabel`）——残留调用点
  编译红（防静默回退）。presence web 现无任何 status-badge CSS（类名一直裸挂，见 D-5 实况），
  没有"既有样式"可保。
- 新增 `components/statusTagColor.ts`：

```ts
import { presetPresenceStatusKeys } from '@work/presence-contract';

export function statusTagColor(statusKey: string): 'green' | 'purple' | 'cyan' | 'orange' | 'blue' {
  if (statusKey === 'working') return 'green';
  if (statusKey === 'business_trip') return 'purple';
  if (statusKey === 'field_research') return 'cyan';
  if ((presetPresenceStatusKeys as readonly string[]).includes(statusKey)) return 'orange'; // out/leave
  return 'blue'; // 未知自定义 key → 中性色
}
```

- 看板/登记历史/字典管理的状态展示一律 `<Tag color={statusTagColor(key)} dot>{label}</Tag>`；
  label 由调用方供给（服务端 statusLabel 或字典 map），组件层零映射。
- （若 `Tag` 的 color 联合类型与上述五色不完全一致，按 `@work/ui` `Tag` 实际 color 类型收敛取色，
  中性色选 Tag 支持的非语义色。）

### 2.5 字典管理页：`pages/StatusTypesPage.tsx`（新）

- 路由/菜单/权限见 D-7；`module.ts` routes + contract 双 manifest 同步（uuid 106 先 grep 占用）。
- 数据：`GET /status-types/all`（含 archived）。`Table` 列：label / key（等宽字体）/ 预置（`Badge`）/
  缺省（`Tag` dot）/ 状态（active/archived）/ 排序 / 操作。
- 操作（全部走 `ConfirmDialog` 或 `Modal`，错误信封 message 直显）：
  - 新建（`Modal`：key/label/sortOrder；key 前端校验 `^[a-z][a-z0-9_]{1,63}$` 同步后端、创建后不可改
    的提示文案）。
  - 编辑（`Modal`：label/sortOrder——key 不可改，disabled 展示）。
  - 设为缺省（`ConfirmDialog`，POST `:id/default`；当前缺省行操作禁用）。
  - 停用（`ConfirmDialog`，POST `:id/archive`；**isDefault 行禁用停用按钮**——后端也会拒，前端不给
    死路径；archived 行显示恢复）。
  - 恢复（POST `:id/restore`）。
- 服务端拒绝（409/400，如并发设缺省、key 冲突）→ `Toast`/内联错误，刷新列表。

### 2.6 platform web `PresenceSection` 迁移

- `presence-types.ts` 镜像类型：`EmployeePresence` 扩 `statusLabel?: string`（跟 D-1 响应）；
  **本地 `PresenceStatus` 从五键字面量 union 放宽为 `string`**（`presence-types.ts:3`——自定义 key
  运行时必然到达，union 已是类型谎言；RFC §3 web 行点名的硬编码消费点）。
- `record:null` 分支：`EmptyState("当前无在位记录")` → **在岗缺省展示**（绿色 `Tag` dot「在岗（缺省）」
  - 说明文案「当前无离岗登记」）。注意 M8-5a 语义：越权与无记录同为 null——都显示在岗缺省（RFC §5.3
    已接受，不泄露）；**error 态保持独立展示不混同**（现有 :66-71 分支保留）；**⚠️ hidden 分支
    （viewer 无 `presence:board:view`，`:60-62`）保持 `EmptyState` 不迁移**——对无权查看者显示
    「在岗（缺省）」等于向其谎报状态，`EmployeeProfileDrawer.spec.tsx:66` 的降级断言依赖此分支，
    §4.2 的 record:null 断言不得写成全局否定 EmptyState（会误伤 hidden 测试）。
- record 非空：label 用 `statusLabel ?? PRESENCE_LABELS 回退`？**不**——删除本地 `PRESENCE_LABELS`,
  label = `result.statusLabel ?? record.status`（裸 key 兜底）；`presenceColor` 加未知 key 回退
  （`default: 'orange'` 已隐式覆盖,显式化 known-key 判断即可）；**`:80` 的
  `employee-profile__presence-icon--${status}` 装饰 span 删除**（样式只覆盖五个预置键
  （`styles.css:283-313`），未知 key 图标裸奔；`Tag` dot 已承担状态色点，删除减少一处 key 耦合）。
- `platform web presence-api-client` 的 `getEmployeePresence` 返回类型同步 `{ record, statusLabel? }`。
- **既有 spec 破坏面**：`EmployeeProfileDrawer.spec.tsx:311-328` 的 `drawerGet` mock 返回
  `{ record: {status:'working',…} }` **无 statusLabel**——迁移后 `:49` 的 `findByText('在岗')` 会
  变成找 'working' 而红，**mock 须补 `statusLabel: '在岗'`**；`:66`（hidden 降级）与 `:145-160`
  （error 态）断言保持原样仍绿（分支未迁移）。

### 2.7 后端 D-1 增点（唯一）

- `presence-status.service.ts` `getEmployeeStatus`：**仅当 record 非空才查字典**（三条 null 早退
  路径——subject 不存在 / 越权 / 无活跃记录——都不触 `listStatusTypes`，与下方单测断言一致）：

  ```
  const record = ... ?? null;                       // 现有取数逻辑不动
  if (record === null) return { record: null };     // 无 statusLabel 字段（省略，非 null 值）
  const types = await this.repository.listStatusTypes(enterpriseId, { includeArchived: true });
  return { record, statusLabel: types.find(t => t.key === record.status)?.label ?? record.status };
  ```

  含 archived（历史记录状态可能已归档）；**不 seed**（M9-3a §6 口径；空字典 → 回退裸 key）。

- controller 返回类型注解随 contract `PresenceEmployeeStatusDto`；**新增单测五条**：非空 record 带
  label、archived key 带 label、字典缺失回退裸 key、null record 无 statusLabel 且不调
  listStatusTypes、越权仍 `{record:null}`。**改写既有两条非空断言**：
  `presence-status.service.spec.ts:711/:790` 的 `resolves.toEqual({ record })` 在响应多出
  statusLabel 后必红（默认 mock 字典 working-only → label 回退裸 key）——改为含 `statusLabel` 的
  toEqual；`:737/:757/:810` 的 `{record:null}` 断言因 toEqual 忽略 undefined 属性仍绿、不动。
- **既有消费方核查（已替核，给准话）**：platform web `getEmployeePresence` 是唯一 HTTP 消费方；
  `apps/gateway-api/src/people-aggregation.e2e-spec.ts` **无需适配**——`:184` 用
  `expect(response.body.record).toEqual(objectContaining({id}))` 只查 `.record`，加兄弟字段不破；
  `:192` 的 `toEqual({ record: null })` 精确比对发生在 **null 场景**，D-1 规定 null 时**省略**
  statusLabel（JSON 序列化后响应体仍是 `{"record":null}`）→ 仍绿。**前提约束：record 为 null 时
  不得返回 `statusLabel: null`**（必须是字段省略），实现照 §2.7 伪代码即天然满足。

## 3. 模块结构增量

### `modules/presence/contract`

```
src/status.dto.ts         # +PresenceEmployeeStatusDto
src/manifest.ts           # +状态字典 菜单/路由（statusTypeManage）
src/platform-manifest.ts  # +菜单 id 106（grep 占用后定）
```

### `modules/presence/api`（仅 D-1）

```
src/status/presence-status.service.ts       # getEmployeeStatus 附 statusLabel
src/status/presence-status.service.spec.ts  # D-1 单测五条（§2.7）
src/status/presence-status.controller.ts    # 返回类型注解（如有显式注解）
```

### `modules/presence/web`

```
src/api/presence-api-client.ts        # 看板新形态 + 字典七方法
src/api/presence-api-client.spec.ts   # 解除 skip + 重写
src/api/forms-mirror.ts / forms-mirror.spec.ts       # 新：定义读取镜像（本地类型）
src/components/StatusBadge.tsx        # 删除整个文件（D-5 拍板；残留调用点编译红）
src/components/statusTagColor.ts / .spec.ts    # 新：Tag 色 helper（§2.4；spec 断言未知 key→中性色）
src/components/DynamicFormFields.tsx / .spec.tsx  # 新：轻字段渲染（D-3，自建不跨模块）+ 组件 spec
src/pages/PresenceBoardPage.tsx / .spec.tsx    # 重写 + 解除 skip
src/pages/RegisterStatusPage.tsx / .spec.tsx   # 重写
src/pages/StatusTypesPage.tsx / .spec.tsx      # 新
src/module.ts                          # +/presence/status-types 路由
src/runtime.ts                         # +forms 镜像客户端装配与 getter（m-6；照 :8-12 现范式）
```

### `modules/platform/web`

```
src/api/presence-types.ts        # EmployeePresence +statusLabel?；PresenceStatus union→string（§2.6）
src/api/presence-api-client.ts   # 返回类型同步
src/pages/PresenceSection.tsx    # 语义迁移（§2.6，含 icon span 删除、hidden 分支不动）
src/pages/EmployeeProfileDrawer.spec.tsx  # 断言更新（:49 mock 补 statusLabel、record:null→在岗缺省;
                                          #  PresenceSection 无独立 spec——断言住这里；也可新增
                                          #  PresenceSection.spec.tsx 承载,二选一写明）
```

### 根 `package.json`

零改动（无新 e2e 文件；web spec 由 vitest.web.config 全局收集）。

### `apps/gateway-api`

零改动——`people-aggregation.e2e-spec.ts` 经核**无需适配**（§2.7 准话：`:184` 只查 `.record`，
`:192` 精确比对在 null 场景且 statusLabel 为字段省略）。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm verify   # 重点 skip 回收：web 组归零（M9-3a 的 1 file/4 tests）；unit 组回到 PG-gated 基线
              # （5 files/39 tests skip——M9-3a 的 6 files/43 里 4 条是 api-client 债、39 条是
              #  PG-gated 常态 skip，后者不归零、也不许为凑零去掉 PG 门）
pnpm verify:full  # D-1 触后端：PG 门照常真跑
```

本地跑 web 测试注意 §1-11 环境坑（NODE_ENV=test；Node25 需 localStorage-file 参数）。

### 4.2 断言（必须覆盖）

**看板（PresenceBoardPage.spec.tsx，解除 skip 重写）**

- mock `getBoard` 返回混合行（2 默认 + 1 离岗 + 1 自定义 key）→ 全员渲染、`statusLabel` 直显（自定义
  key 显示其 label 非裸 key）、`isDefault` 行时间列 `—`、实时部门列、行 key=userId 无 React 警告。
- 空 items → EmptyState；错误 → 错误态。

**登记（RegisterStatusPage.spec.tsx）**

- 下拉 = 字典 active 非 default 行（default 不出现）；本人信息块渲染（来自 mock 的
  `getCurrentUser()`，含 departmentName 缺失时隐藏该行）；
- 选中带字段的状态 → 定义拉取 + 六类轻字段渲染 + 必填校验拦截提交；
- 提交 payload 含 `form{definitionRevision, values(仅已填)}`；无字段状态提交**不含** `form`；
- 定义拉取 403 → D-4 降级提示且可提交基础信息；必填重字段 → 禁用提交 + 提示（D-3）；
- 历史 label：字典 key 显 label、archived/未知 key 显裸 key；取消流保留。

**字典管理（StatusTypesPage.spec.tsx）**

- /all 列表渲染（preset/default/archived 标识）；新建 Modal key 校验（非法 key 前端拦）；
- isDefault 行停用按钮禁用；archived 行显恢复；设缺省 ConfirmDialog 调 `:id/default`;
- 409（并发/占用）→ 错误展示 + 列表刷新。

**statusTagColor / PresenceSection**

- `statusTagColor.spec.ts`：五个预置 key 各映射既定色；未知自定义 key → 中性色；`StatusBadge` 模块
  与 `formatStatusLabel`/`STATUS_LABELS` 导出不存在（编译级——文件已删）。
- PresenceSection（断言宿主 = `EmployeeProfileDrawer.spec.tsx`，或新增 `PresenceSection.spec.tsx`）：
  `record:null` **且有权限** → 在岗（缺省）展示（断言限定在该分支，**不要**全局否定 EmptyState——
  hidden 分支仍用 EmptyState 且其 `:66` 断言必须保持绿）；error 态仍独立；record 非空 →
  `statusLabel` 直显（mock 补 `statusLabel: '在岗'`，`:49` 断言语义不变）；`statusLabel` 缺失 →
  裸 key 兜底；本地 `PRESENCE_LABELS` 已删。

**api client（presence-api-client.spec.ts 解除 skip 重写 + 两镜像 spec）**

- getBoard 新形态解包；字典七方法路径/动词各一条；forms 镜像客户端 baseUrl 正确（`/api/forms/`）。

**D-1 后端单测**：§2.7 五条。

**还原度门禁自查（PR 描述勾选）**：L2 断言 1-4 逐条（组件白名单/零硬编码色值/页头卡片空态范式/
Tag 色板），附三页截图。

## 5. 退出标准

1. 看板 v2 消费 `PresenceBoardEntryDto`：全员名册 + 在岗缺省行 + label 驱动（零本地映射）+ 实时部门。
2. 登记 v2：字典驱动状态选项（排除 default）+ 动态轻字段表单 + `form` 块提交 + 本人信息块 + D-3/D-4
   边界行为 + 历史 label 回退。
3. 字典管理页全操作闭环（新建/改名改序/设缺省/停用/恢复），guard 行为与后端一致（default 不可停用等）。
4. `PresenceSection`：`record:null`（有权限分支）→ 在岗（缺省）、hidden 分支不迁移；label 服务端
   供给；本地 `PRESENCE_LABELS`/`STATUS_LABELS`/`formatStatusLabel`/`StatusBadge` 文件全仓删净
   （grep 自证）。
5. M9-3a 两个 `describe.skip` 解除并按新形态重写，**skip 债回收到位**：web 组 skip 归零、unit 组
   回到 PG-gated 基线（5 files/39 tests——不归零、不许为凑零去掉 PG 门）。
6. D-1 落地且为唯一后端改动（diff 自证：`modules/presence/api` 外无后端文件变更；无迁移/权限/seed 变更
   ——菜单 id 106 属 contract manifest，seed 派生自动同步，守护测试若有菜单断言按实况翻转）。
7. 新菜单/路由权限接线正确（无权限者菜单不可见、直航 403/404 按 shell 既有行为）。
8. 还原度门禁 L2 断言 1-4 全过 + 截图归档;三页零裸控件。
9. `pnpm verify` 全绿（web 组含全部新 spec）；`verify:full` 全绿（D-1 后端断言真跑）。
10. PR 开出后回填 PR #33 Release Gate 的 M9-3b 链接（成对交付闭环）。

## 6. 必须保持不变（避免越界）

- 后端面（除 D-1）：getBoard/字典七端点/登记链路/forms/platform API 全部不动。
- DTO 契约面：`PresenceBoardEntryDto`/`CreatePresenceStatusRecordInput` 不动，仅新增
  `PresenceEmployeeStatusDto`；contract 的 manifest 双清单按 D-7 增菜单/路由（这不算契约变更，
  与本条不冲突）。
- 权限四点复用不新增；`presence.status.changed` 事件面不动。
- 首登向导/人页聚合其余分区/M8-5b 交付面不回改。
- 不引新依赖（动态表单自建轻实现,不装表单库）。

## 7. 完成后更新文档

- `docs/foundation-progress.md`：§6.6 M9-3b 行 → Done（PR 号/要点）；M9-3a 行的回归窗口标注**已关闭**
  （成对交付完成）；§7.6 结转清单补预留四条：「presence 登记重字段类型支持」「forms 定义管理 UI」
  「档案字段级自动注入（待映射契约）」「本人信息块职务/手机展示（需 employees/me 镜像取
  title/mobile，D-2）」；**已知展示不对称登记**：归档 key 的活跃记录看板显裸 key、人页抽屉显 label
  （D-1 有意差异，修齐需动 getBoard，结转）。
- `docs/module-contract.md`：presence 路由/菜单补 `/presence/status-types`；按人查询响应形态更新
  （`{record, statusLabel?}`）。
- `docs/architecture.md`：presence web 三页能力一句话更新（如该文档列 web 面）。
- `docs/verification-log.md`：新增「M9-3b Presence Web v2」小节（命令计数 + §4.2 矩阵 + 还原度门禁
  L2 判定与截图指针 + skip 债清零证明）。
- `docs/doc-index.md` §7：登记本任务包。

## 8. 提交规范

- 分支 `feat/m9-3b-presence-web-v2`；Conventional Commits（如
  `feat(presence-web): board v2 with roster semantics and label-driven display`、
  `feat(presence-web): dictionary-driven registration with dynamic form fields`、
  `feat(platform-web): presence section default-on-duty semantics`）。
- 零新依赖；不提交 node_modules/.env/构建产物。
- PR 描述含 §4.1 计数（web skip 归零必须体现）、§4.2 矩阵勾选、还原度门禁勾选 + 截图、D-1 唯一后端
  改动声明、与 PR #33 的成对交付互链。
