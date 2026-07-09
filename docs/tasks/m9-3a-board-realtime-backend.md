# Task: M9-3a 看板实时化后端（数据来源反转为名册 LEFT JOIN 活跃离岗记录 + 扩 `PlatformEmployeeLookupPort.listEmployeesByScope` + 实时部门 matchesScope + 看板响应随行下发 statusLabel；web/导出不在本切片）

## 状态

- 里程碑：M9（在位状态 v2，RFC `docs/rfc/m9-presence-v2.md` 已 Accepted 2026-07-01）
- 切片：M9-3a（RFC §16），依赖 M9-1（已合并 `85ea16d`）、M9-2（已合并 `9409bb0`）、M8-5a subject 授权范式
- **安全敏感**：扩 platform 读端口 + 改看板"过滤依据"（记录快照部门 → 实时组织归属）。RFC §13 指定 M9-3a 合并前过 security-reviewer。交付形态：`feat/m9-3a-board-realtime` 分支 + PR。

## 0. 任务定位

收口 §7.5 看板 follow-up：把 `getBoard` 从**记录优先**（只产出"有登记记录的人"、按记录快照 `department_id` 过滤）
**反转**为**名册优先**（RFC D4）——按 viewer 的 `presence` 数据范围取"范围内**全体**成员名册"，LEFT JOIN 当前
活跃离岗记录，无记录者显示"在岗（缺省态）"。过滤依据从记录快照部门改为**实时组织归属 + `matchesScope`**（对齐
M8-5a `getEmployeeStatus` 范式）。看板响应每行随行下发 `statusLabel`（web 消费 label，不再本地映射枚举）。

具体五件事：

1. **platform 读端口扩面（安全命门）**：`PlatformEmployeeLookupPort` 新增
   `listEmployeesByScope(enterpriseId, departmentIds?)`——`undefined` = 全企业名册（company），非空数组 = 限定
   部门（department / department_tree，`departmentIds` 已由 resolveScope 展开子树）。仅返回既有窄字段
   `EmployeeLookupDto`。platform-api `EmployeeLookupService` 实装（复用 `listEmployeesByIds` 的 active + 部门名
   映射范式）。
2. **presence 看板 DTO**：新增 `PresenceBoardEntryDto`（名册行语义：员工窄字段 + 实时部门 + `status` + `statusLabel`
   - `isDefault` + 可选记录字段）。`getBoard` 返回类型从 `{ items: PresenceStatusRecordDto[] }` 改为
     `{ items: PresenceBoardEntryDto[] }`。
3. **`getBoard` 反转**：resolve `presence` scope → 按 scope 取名册（self 复用 `listEmployeesByIds([userId])`；
   company `listEmployeesByScope(undefined)`；department/tree `listEmployeesByScope(departmentIds)`）→ 批量取名册
   成员的活跃记录 → 内存 join：有活跃记录=该离岗态行、无=在岗缺省态行 → 每行下发实时部门 + `statusLabel`。
4. **statusLabel 来源**：presence 自己的 `presence.status_types` 字典（`listStatusTypes`），先 `ensurePresetStatusTypes`
   保证新企业有缺省态；缺省 key/label 来自 `find(isDefault)`。不跨模块。
5. **security-reviewer**：读端口扩面 + 过滤依据变更（RFC §13）。

### 对 RFC 的显式设计决策（任务包决策，评审按此口径）

- **D-1 端口签名 = `listEmployeesByScope(enterpriseId: string, departmentIds?: string[])`**：RFC §9 建议的
  `listEmployeesByScope(enterpriseId, departmentIds?)` 原样采纳。`undefined` = company 全员，非空数组 = 限定部门。
  **self scope 不走此方法**（复用既有 `listEmployeesByIds(enterpriseId, [scope.userId])`，零新端口面）；理由：self
  是单人过滤，`listEmployeesByIds` 已精确覆盖，避免端口签名为 self 引入空数组歧义（`[]` 保留为"无部门范围→空
  名册"）。`department` / `department_tree` 统一传 `scope.departmentIds`（后者 resolveScope 已展开子树，
  `platform-scope.service.ts:46-56`），端口内部不需要区分两态、不做子树展开（子树是 platform scope 的职责，
  不下沉到读端口）。
- **D-2 看板行 = 新 `PresenceBoardEntryDto`，不复用 `PresenceStatusRecordDto`**：名册行的语义是"某成员当前
  状态"，而非"一条登记记录"——无记录者（在岗缺省）没有 `recordId`/`createdBy`/`createdAt`。复用记录 DTO 会
  逼迫为在岗者合成假记录（`recordId:''` 之类），语义污染且 web 难辨"真记录 vs 合成缺省"。新 DTO 显式表达
  名册行 + `isDefault` 标记 + 可选记录字段。
  - **⚠️ 已知回归窗口（务必执行）**：presence web **现在就消费** `GET /presence/board`，且按**旧形态**
    类型化——`modules/presence/web/src/api/presence-api-client.ts:8`（`getBoard(): Promise<PresenceStatusRecordDto[]>`）
    / `:16-19`（`http.get<{ items: PresenceStatusRecordDto[] }>('board')`）+ `PresenceBoardPage.tsx` 渲染。
    本切片改后端响应形态（`PresenceStatusRecordDto[]` → `PresenceBoardEntryDto[]`，含在岗缺省行、`id`→`recordId`、
    新增 `isDefault`/`statusLabel`）后:①**不会**触发编译错（web 端 `http.get<…>()` 是 web 本地类型断言，
    不从后端传导）；②M9-3a 单独部署会使 presence web 看板在 M9-3b 落地前**运行期坏掉**（React key `item.id`
    变 undefined、意外多出在岗行）；③web 现有 `PresenceBoardPage.spec.tsx` / `presence-api-client.spec.ts` mock
    旧形态，后端换新形态后 `pnpm verify` **看不到**该错配（web 测试假绿）。因此：**M9-3a 与 M9-3b 必须成对/
    紧接交付**（M9-3a 不单独上线到生产），M9-3b 负责迁移 web board 客户端类型 + 其 spec。"无迁移成本"仅对
    DTO **定义**成立，对 **live 端点**不成立——本切片 PR 描述与 verification-log 必须显式声明此窗口 + M9-3b 待办
    （见 §7）。M9-4 导出亦消费此 DTO。**交付约束（硬）**：M9-3b 须在 M9-3a **之前、或同一 PR 内、或紧接
    下一个 PR**完成 web board 迁移，**两者不得跨发布窗口**；若拆 PR，M9-3a PR 描述必须写明 M9-3b PR 链接与
    "本 PR 禁止单独合入生产/发布分支（待 M9-3b 客户端迁移）"。
  - **⚠️ 假绿自动化护栏（B2，人工约束的兜底）**：上面的"成对交付/不单独上线"是**流程约束**，无自动化护栏时
    `pnpm verify` 仍全绿而 web 运行时坏——正违背本任务包"假绿零容忍"。故 M9-3a **须**把 presence web 的
    `presence-api-client.spec.ts` / `PresenceBoardPage.spec.tsx`（现 mock 旧 `{items: PresenceStatusRecordDto[]}`
    形态）标 `describe.skip` + 顶部注释 `// M9-3b: unskip after board client migrates to PresenceBoardEntryDto`，
    使"web 看板未迁移"在 verify 输出里**以 skip 计数可见**、而非静默假绿；M9-3b 首步 unskip 并迁移。**这是 §0
    "本切片不做 web/UI"的唯一例外**——仅 `skip` 过期 spec + 注释，**不改** UI 渲染/客户端逻辑（那才是 M9-3b）。
- **D-3 过滤依据 = 实时部门（名册），冗余快照仅留审计/历史**：看板名册的部门归属一律用
  `listEmployeesByScope`/`listEmployeesByIds` 返回的**实时** `departmentId`，不再吃 `status_records.department_id`
  快照。`status_records` 的冗余快照列保留（历史可读），但**不再作为看板授权/过滤依据**——员工换部门后看板归属
  立即随实时组织变。**授权收敛方式（免字面主义误实现）**：看板**不逐 subject 调 `matchesScope`**——scope 收敛
  由 `listEmployeesByScope(scope.departmentIds)` 的名册过滤**等价达成**（名册本身已是 scope 内成员）。这忠实
  RFC §9 正文"授权以名册为准"；RFC §16 M9-3a 行的"matchesScope 批量"指的是按人查询端点（`getEmployeeStatus`
  已有）的口径，**不要**在 getBoard 里对名册再逐条 `matchesScope`（冗余且无意义，名册已收敛）。
- **D-4 `getBoard` 不再调 `listActiveRecords` 的 `departmentIds` 分支**：反转后 getBoard 只用 `userIds`（名册
  ids）取记录。`listActiveRecords` 的 `departmentIds` 过滤能力**保留在 repository 层**（通用查询、既有集成测试
  覆盖，非死代码化删除），只是 getBoard 不再传它。`PresenceBoardQuery`（`status.dto.ts` 陈旧无消费契约）其
  `status` 已是 `PresenceStatus`（=string，M9-1 放宽后）——**本切片不动、保留不删**（无消费者，非本切片关注）。

### 安全门禁判定（security-reviewer 重点，RFC §13）

1. **scope 参数不可伪造放大**：`listEmployeesByScope` 的 `departmentIds` 由 presence 服务端 `resolveScope` 得出，
   **绝不接受客户端传入**。getBoard 无任何请求 body/query 参与 scope 解析（controller 只传 `currentUser`）。
2. **读端口只返回窄字段**：`listEmployeesByScope` 返回 `EmployeeLookupDto`（id/employeeNo/name/departmentId/
   departmentName），不含密码/账号/敏感档案字段——与 `listEmployeesByIds` 同 DTO，无字段面扩大。
3. **越权不泄露**：名册严格按 scope 取——self 只本人、department/tree 只范围部门在职员工、company 只本企业在职；
   范围外 subject **不出现在名册**（不泄露存在性）。无部门员工只在 company 名册出现（与 `matchesScope`
   department 分支要求 `departmentId ∈ departmentIds` 一致，非回归）。
4. **批量无绕过 + 租户隔离**：`listEmployeesByScope` 内部 `enterprise_id === enterpriseId` + `status==='active'`
   严格过滤（同 `listEmployeesByIds`）；跨企业/停用员工不入名册。
5. **forms 填报值不随看板下发**（RFC §9-C）：`PresenceBoardEntryDto` 只含 presence 自有列（状态/时间/备注/
   实时部门 + statusLabel），**不含 `presence.status.<key>` 的 forms 填报值**——那些有 forms 自己的数据范围门，
   看板 `board:view` 只授权 presence 自有列。`form_record_id` 可下发（仅 opaque id，非填报内容），但**看板不
   代读 forms 记录**。
6. **无跨 schema**：presence 经 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 端口取名册，不读 `platform.*` 表；statusLabel
   来自 presence 自己的 `status_types`。
7. **读端点写副作用（GET 触发 INSERT）**：getBoard 为解析缺省态 label 需字典已 seed，但**不无条件 ensure**——
   先读字典、仅新企业（无 active default）才 `ensurePresetStatusTypes`（§2.3）。该写幂等
   （`INSERT ON CONFLICT DO NOTHING`）、并发无害、已 seed 企业零写入。security-reviewer 须确认高频看板读不产生
   持续写压力、无并发竞态。
8. **§16 变更门评估（确定性结论，免执行者犹豫）**：扩 `listEmployeesByScope` 是**平台进程内只读端口面扩面**
   （同 M7-2 `PLATFORM_ORG_PORT` 一类）。逐条定：**不改**数据范围模型（scope kind 不变）、**不改**授权规则、
   **不新增**敏感字段（`EmployeeLookupDto` 复用现契约）→ **§5 数据范围执行无变化，不需补 §5**；`docs/security-baseline.md`
   §16 变更清单（`:520-531`）**未把"只读端口扩面"列为强制触发项**，故基线更新非 §16 强制。本切片对基线的处置
   **分两级、明确强制性**（消除"必做两件却含建议"的歧义）：
   - **(a) 硬要求（写入退出标准 #9，必做）**：补 **§8.2「进程内平台只读端口基线」** 登记
     `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 的窄字段契约（§8.2 现只写 `PLATFORM_ORG_PORT`，其"不返回姓名"措辞
     **不适用**本端口——`EmployeeLookupDto` 有意含姓名/工号/部门名，见 §7 模板）。
   - **(b) 建议（可选，非阻断）**：给 §16 变更清单增一条触发项"扩 platform 进程内只读端口面"，使未来静默扩面
     被门禁捕获。采纳与否由实现者定。
     评估结论（含 (a) 已落实、(b) 采纳与否）写入 PR 描述与 verification-log。

### 本切片不做（越界即打回）

- 一切 web/UI（M9-3b：看板 v2 UI + `PresenceSection` 语义迁移 record:null→在岗缺省）。
- Excel 导出（M9-4）。
- 看板按状态筛选 / 分部门分组 / 更细展示（RFC §5.3【可后做】，数据就绪后展示层切片）。
- forms 填报值的看板聚合读取（§9-C：看板不代读 forms 记录，留 M9-4 导出时按 forms 门逐 subject 授权）。
- presence 新迁移 / 新 schema（本切片零 DDL）；forms 侧零改动。
- M4 遗留 follow-up（`cancelRecord` 仓库层 `enterprise_id` 复核）——已登记，不顺手修。
- 改 scope 模型 / 新增 data_type / 改 matchesScope 语义。

## 1. 必读（按顺序，引用条款不要凭记忆）

1. `AGENTS.md` —— 模块边界、统一错误信封、提交规范；`apps/platform-api/CLAUDE.md` §安全敏感面（scope/读端口
   属安全基线，改前引 `docs/security-baseline.md` 条款）。
2. `docs/rfc/m9-presence-v2.md` §4-D4（数据来源反转）、§5.3（看板实时化）、§9（数据范围/看板管线全文——名册
   LEFT JOIN、扩端口、C 项 forms 门）、§13（M9-3a security-reviewer 关注点）、§15-4（退出标准）。
3. `docs/security-baseline.md` §5（数据范围执行）、**§8.2（进程内平台只读端口基线，`:373-381`——读端口扩面
   最对口条款，现只写 `PLATFORM_ORG_PORT`）**、§16（变更门禁，`:520-532` 变更清单未把"读端口扩面"列为强制
   触发项）——§16 评估落文时锚定 §8.2（`PlatformEmployeeLookupPort` 窄字段契约 + scope 服务端 resolve +
   enterprise 圈定 + 不含 account/mobile/email/password/roles），不只提 §5。
4. `apps/platform-api/src/scope/platform-scope.service.ts` —— `resolveScope`（:23-66，四态 + tree 展开
   `:46-56` + 无部门降级 self `:32-37`）、`matchesScope`（:68-83）。**看板反转的授权范式源**。
5. `apps/platform-api/src/users/employee-lookup.service.ts` —— `listEmployeesByIds` 现实现（:9-33，active +
   部门名映射内存过滤），`listEmployeesByScope` 照此范式加。
6. `packages/platform-contract/src/users.ts` —— `EmployeeLookupDto`（:49-55）、`PlatformEmployeeLookupPort`
   （:57-59，本切片扩）、`scope.ts`（`PlatformScope` :8-15，四 kind）。
7. `modules/presence/api/src/status/presence-status.service.ts` —— `getBoard`（:59-74，**要反转**）、
   `getEmployeeStatus`（:76-105，**M8-5a 实时部门+matchesScope 范式，看板要对齐**）、createRecord 里
   `listStatusTypes` 取 default 的用法（M9-1，:125-132）。
8. `modules/presence/api/src/db/presence.repository.ts` + `postgres-presence.repository.ts:76-113`
   （`listActiveRecords` 现实现）+ `in-memory-presence.repository.ts` —— 反转后 getBoard 用 `userIds` 取记录。
9. `modules/presence/contract/src/status.dto.ts` —— `PresenceStatusRecordDto`、`PresenceBoardQuery`（陈旧）；
   `modules/presence/api/src/status/presence-board.controller.ts`（`GET /presence/board` + `boardView` 守卫）。
10. e2e 先例：`apps/gateway-api/src/people-aggregation.e2e-spec.ts`（`createAndLoginUser(permissions,
dataScopes, **account**)` + scope 隔离断言——**注意该 helper `:204-240` `POST /employees` body 不含
    `departmentId`、不建部门不挂人**）；**建部门挂人的先例在 `presence.e2e-spec.ts` 的 `createUserWithRole`
    （`:195-244`，先 INSERT department 再挂 `departmentId`）**——本切片看板 e2e 需要按实时部门过滤/换部门,
    必须用这条建部门挂人范式。`presence.e2e-spec.ts` 是 **PG-gated**（建部门/员工/登记链路先例，:202-227）。

## 2. 设计要点（严格遵守）

### 2.1 platform 读端口：`packages/platform-contract` + `apps/platform-api`

`users.ts`：

```ts
export interface PlatformEmployeeLookupPort {
  listEmployeesByIds(enterpriseId: string, ids: string[]): Promise<EmployeeLookupDto[]>;
  /**
   * 按数据范围列名册（看板实时化）。departmentIds:
   *   undefined → 全企业在职员工（company scope）
   *   非空数组  → 限定部门在职员工（department / department_tree；tree 的子树已由 resolveScope 展开）
   * 仅返回窄字段 EmployeeLookupDto。self scope 不用此方法（用 listEmployeesByIds([userId])）。
   */
  listEmployeesByScope(
    enterpriseId: string,
    departmentIds?: string[],
  ): Promise<EmployeeLookupDto[]>;
}
```

`employee-lookup.service.ts` 实装（照 `listEmployeesByIds` 范式）：

```
async listEmployeesByScope(enterpriseId, departmentIds?) {
  const departments = active 部门 id→name map（同 :14-18）
  return listEmployees()
    .filter(e => e.enterpriseId === enterpriseId && e.status === 'active'
              && (departmentIds === undefined
                  || (e.departmentId !== undefined && departmentIds.includes(e.departmentId))))
    .map(→ EmployeeLookupDto（含实时 departmentName）)
}
```

- `departmentIds` 为**空数组**时返回**空名册**（无部门范围）——与 `matchesScope` 的 department 分支
  （`scope.departmentIds` 空 → 无人匹配）一致，非 bug。
- 性能：一次 `listEmployees()` + 一次 `listDepartments()` 内存 join，避免 N+1（同现范式）。大企业优化留后续，
  本切片对齐既有实现即可（`listEmployeesByIds` 也是全表拉）。
- `employee-lookup.service.spec.ts` 补：company（undefined 全员）、department（限定 id）、跨企业隔离、停用
  排除、空数组空名册、无部门员工仅在 company 出现。

### 2.2 presence 看板 DTO：`modules/presence/contract/src/status.dto.ts`

```ts
export interface PresenceBoardEntryDto {
  userId: string;
  employeeNo: string;
  userName: string;
  departmentId?: string; // 实时部门（名册），非记录快照
  departmentName?: string; // 实时
  status: PresenceStatus; // 离岗态 key，或缺省态 key（在岗）
  statusLabel: string; // 字典 label，web 直接消费
  isDefault: boolean; // true = 在岗（缺省态，无活跃离岗记录）
  startAt?: string; // 有记录时的区间
  endAt?: string;
  remark?: string;
  recordId?: string; // 有记录时的记录 id；在岗缺省态为空
  formRecordId?: string; // opaque id；看板不代读 forms 记录（§9-C）
}
```

`getBoard` 返回类型 `{ items: PresenceBoardEntryDto[] }`。**保留** `PresenceStatusRecordDto`（登记/取消/按人
查询仍用）。`PresenceBoardQuery`（陈旧无消费）：其 `status` 已是 `PresenceStatus`（`status.dto.ts:36` +
`events.ts:14` `PresenceStatus = string`），**无需动**（本切片不给它接线，不新增消费者）。

### 2.3 presence `getBoard` 反转：`presence-status.service.ts`

```
async getBoard(currentUser): Promise<{ items: PresenceBoardEntryDto[] }> {
  const scope = await this.scopeService.resolveScope(currentUser, 'presence');
  await this.repository.ensurePresetStatusTypes(currentUser.enterpriseId);   // 新企业保证有缺省态（⚠️ GET 读路径产生写入，幂等，见「要点」末条）
  const types = await this.repository.listStatusTypes(currentUser.enterpriseId, { includeArchived: false });
  const defaultType = types.find(t => t.isDefault);
  if (!defaultType) throw new BadRequestException('企业缺少有效的缺省状态类型');   // 同 createRecord 守卫
  const labelByKey = new Map(types.map(t => [t.key, t.label]));

  // ① 取名册（按 scope）
  let roster: EmployeeLookupDto[];
  if (scope.kind === 'self') {
    roster = await this.employeeLookup.listEmployeesByIds(currentUser.enterpriseId, [scope.userId]);
  } else if (scope.kind === 'company') {
    roster = await this.employeeLookup.listEmployeesByScope(currentUser.enterpriseId);            // undefined = 全员
  } else {                                                                            // department / department_tree
    roster = await this.employeeLookup.listEmployeesByScope(currentUser.enterpriseId, scope.departmentIds);
  }

  // ② 批量取名册成员的活跃记录（当前时刻）
  const rosterIds = roster.map(e => e.id);
  const records = rosterIds.length === 0 ? []
    : await this.repository.listActiveRecords({ enterpriseId: currentUser.enterpriseId, at: new Date().toISOString(), userIds: rosterIds });
  const recordByUser = new Map<string, PresenceStatusRecordDto>();
  for (const r of records) if (!recordByUser.has(r.userId)) recordByUser.set(r.userId, r);  // 同一时刻单条活跃

  // ③ 内存 join：名册每人 → 离岗记录行 或 在岗缺省态行
  const items = roster.map(e => {
    const rec = recordByUser.get(e.id);
    if (rec !== undefined) {
      return { userId: e.id, employeeNo: e.employeeNo, userName: e.name,
               departmentId: e.departmentId, departmentName: e.departmentName,   // 实时部门
               status: rec.status, statusLabel: labelByKey.get(rec.status) ?? rec.status,
               isDefault: false, startAt: rec.startAt, endAt: rec.endAt, remark: rec.remark,
               recordId: rec.id, formRecordId: rec.formRecordId };
    }
    return { userId: e.id, employeeNo: e.employeeNo, userName: e.name,
             departmentId: e.departmentId, departmentName: e.departmentName,
             status: defaultType.key, statusLabel: defaultType.label, isDefault: true };
  });
  return { items };
}
```

要点：

- **default key 不会出现在 records**（M9-1/M9-2：`createRecord` 拒绝 `is_default` 登记），故"有活跃记录"必为
  离岗态，"无"必为在岗——无需在 records 里再滤 default。若历史脏数据出现 default key 活跃记录（理论不该有），
  按离岗态展示其 label（防御性、不崩）。
- **实时部门**：`departmentId`/`departmentName` 一律取名册（`EmployeeLookupDto`），**不取** `rec.departmentId`
  快照（D-3）。换部门后看板归属立即变。
- 同一成员同一时刻只应有一条活跃记录（区间不重叠，重叠 409 防）；`recordByUser` 取首条即可，`listActiveRecords`
  已 `ORDER BY start_at DESC`。
- 名册为空（self 无本人异常 / department 空 departmentIds）→ items 空，不查记录（省一次查询）。
- **⚠️ GET 读路径产生写入（副作用，须在 PR 描述与 security-reviewer 显式说明）**：`getBoard` 复用
  `createRecord` 的 `ensurePresetStatusTypes`（`INSERT ... ON CONFLICT DO NOTHING`，M9-1）保证新企业有缺省态
  → 只读看板端点每次请求**可能落库**。幂等且安全（并发无害、无越权面），但打破"GET 无写"直觉。可接受
  （替代方案"企业开通时种子化"依赖 platform 侧接线，超出本切片）；须在 PR 描述与安全评审中点明此副作用。

### 2.4 controller / 装配

- `presence-board.controller.ts` **零改动**（仍 `GET /presence/board` + `@RequirePermissions(boardView)` +
  传 `currentUser`）——返回类型变化对 controller 透明。
- 无新端点、无新权限点、无新迁移、无模块装配改动。

### 2.5 安全实现要求（对应 §0 门禁判定）

- getBoard **不接受任何客户端参数**参与 scope/名册解析（controller 不取 body/query）。
- `listEmployeesByScope` 的 `departmentIds` 只来自 `scope.departmentIds`（服务端 resolve）。
- 名册 + 记录都按 `enterpriseId` 圈定；越权 subject 不入名册。
- 看板 DTO 不含 forms 填报值；`formRecordId` 仅 opaque id。

## 3. 模块结构增量

### `packages/platform-contract`

```
src/users.ts     # PlatformEmployeeLookupPort +listEmployeesByScope
```

### `apps/platform-api`

```
src/users/employee-lookup.service.ts        # 实装 listEmployeesByScope
src/users/employee-lookup.service.spec.ts   # +scope 名册断言（company/department/隔离/停用/空/无部门）
```

> **⚠️ 端口新增非可选 `listEmployeesByScope` → 所有实现方/mock 缺则 `TS2741` 编译失败。** 清点用**裸类型名**
> `grep -rn "PlatformEmployeeLookupPort" --include=*.ts`（**不要**用 `implements …` 或 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE`
> 两条 grep——它们**命不中** `forms.service.spec.ts`，该文件用 `let …: PlatformEmployeeLookupPort` 类型标注 +
> 直接 `new FormsService(…)` 注入 mock、不走 DI token）。全仓恰 4 处需处理：
>
> 1. `apps/platform-api/src/users/employee-lookup.service.ts:6`（`implements`）—— **实装真逻辑**（§2.1）。
> 2. `modules/presence/api/src/status/presence-status.service.spec.ts:618`（`interface MockPlatformEmployeeLookupPort
extends PlatformEmployeeLookupPort`）的 mock 对象（`:25`）—— 补 `listEmployeesByScope: vi.fn()`（§4.2 scope
>    分派测试正需要它）。
> 3. **`modules/forms/api/src/forms/forms.service.spec.ts:18`**（`let employeeLookup: PlatformEmployeeLookupPort`
>    - `:46-58` 现只含 `listEmployeesByIds` 的 mock 对象）—— **补 `listEmployeesByScope` mock**（forms 不调它，
>      返回 `[]` / `vi.fn()` 即可，仅为满足类型；不补则 `pnpm typecheck`/`test` 编译期红）。
> 4. 纯消费方 `forms.service.ts`（:66/:588/:644）、`presence-status.service.ts`（:51）的注入类型 —— **只调
>    `listEmployeesByIds`、不实现端口，不破坏、不改**。

### `modules/presence/contract`

```
src/status.dto.ts    # +PresenceBoardEntryDto（PresenceBoardQuery 无需动，status 已是 string）
```

### `modules/presence/api`

```
src/status/presence-status.service.ts        # getBoard 反转
src/status/presence-status.service.spec.ts    # 看板反转单测（见 §4.2）；:618 mock 接口的对象补 listEmployeesByScope
```

### `modules/forms/api`（仅 mock 补方法，无功能改动）

```
src/forms/forms.service.spec.ts   # :18/:46-58 的 employeeLookup mock 补 listEmployeesByScope（否则 TS2741，见 §3 blockquote-3）
```

### `apps/gateway-api`

```
src/presence-board-realtime.e2e-spec.ts   # 新建：in-memory 看板反转 e2e，承载越权/换部门双向安全断言（见 §4.2）
src/presence.e2e-spec.ts                  # PG-gated：看板反转真库补充断言（可选，安全断言以上面 in-memory 为准）
```

### 根 `package.json`（⚠️ 必改，否则新 e2e 假绿）

`test:e2e` 是**显式文件枚举不是 glob**：**必须**把新建的 `presence-board-realtime.e2e-spec.ts` 追加进该 script
并确认 `pnpm test:e2e` 输出收集到它（文件数递增）。**为何强制新建 in-memory e2e**（m2 修正）：核心安全双向
断言（越权不泄露 / 换部门归属变）若只落在 PG-gated `presence.e2e-spec.ts`（在 `test:e2e:postgres`），默认
`pnpm verify`/CI 的 in-memory e2e 组**不跑它**，无本地 PG 时静默 skip = 安全断言假绿。按 M9-2 先例
（`presence-registration-forms.e2e-spec.ts`）新建 in-memory 看板 e2e 承载双向断言、并入默认 CI；PG-gated 仅
作真库补充。

### `docs`

见 §7。

## 4. 验证

### 4.1 命令（全过）

```bash
pnpm verify        # lint + typecheck + test + test:e2e + build
pnpm verify:full   # 有本地 Postgres：看板反转 e2e + 名册 join 真跑（别假绿）
```

PG 门确认：`presence.e2e-spec.ts` 在 `test:e2e:postgres` 内，**env-gated 静默 skip**——必须确认它实际执行
（断言数较基线增加），否则看板反转假绿。

### 4.2 断言（必须覆盖）

**platform 单测（`employee-lookup.service.spec.ts`）**

- `listEmployeesByScope(ent)`（undefined）→ 全企业在职员工；`listEmployeesByScope(ent, [deptA])` → 仅 deptA
  在职；跨企业员工不返回；停用员工不返回；空数组 → 空名册；无部门员工仅在 undefined（company）出现、不在
  `[deptA]` 出现；返回含实时 `departmentName`。

**presence 单测（`presence-status.service.spec.ts`，mock employeeLookup + repository）**

- **无记录者显示在岗缺省**：名册 3 人、1 人有活跃离岗记录 → items 3 行，2 行 `isDefault:true` +
  `status===defaultKey` + `statusLabel===defaultLabel`，1 行 `isDefault:false` + 离岗 label。
- **实时部门**：名册返回的 `departmentId` 与记录快照 `departmentId` 不同 → 看板行取名册的（实时），非快照。
- **statusLabel 下发**：离岗态行 label 来自字典；字典缺该 key（防御）→ 回退裸 key。
- **scope 分派**：self → 调 `listEmployeesByIds([userId])` 且**不调** `listEmployeesByScope`；company → 调
  `listEmployeesByScope(undefined)`；department/tree → 调 `listEmployeesByScope(scope.departmentIds)`（三分支
  分别断言，防调用错端口）。
- **名册空**：department 且 `departmentIds` 空 → items 空且**不调** `listActiveRecords`。
- **无缺省态守卫**：字典无 active default → `BadRequestException`（同 createRecord）。
- **listActiveRecords 用 userIds 不用 departmentIds**：断言 `listActiveRecords` 调用参数含 `userIds`、
  `not.toHaveProperty('departmentIds')`。
- 现有 getBoard 单测（旧的记录优先断言）**改写**为反转后语义——`presence-status.service.spec.ts` 的
  `:387/:409/:430/:450/:470`（company/department/tree 旧的"返回 PresenceStatusRecordDto[]、按 departmentIds 查"
  断言）已过期，须逐一改为反转后语义（名册 + userIds 取记录）。**每个重写测试的 mock 三件套**（缺一则
  `.map(e=>e.id)` / `find(isDefault)` 对 `undefined` 抛错）：① `employeeLookup.listEmployeesByScope`（company/
  dept/tree 分支）或 `listEmployeesByIds`（self 分支）`mockResolvedValue(名册数组)`；② `repository.listStatusTypes`
  `mockResolvedValue(含 isDefault 的字典)`；③ `repository.listActiveRecords` `mockResolvedValue(记录数组)`。
  **补 mock 方法一律 `vi.fn().mockResolvedValue([])`，不要裸 `vi.fn()`**（返回 undefined 被 join 抛错；`:618`
  的 `MockPlatformEmployeeLookupPort` mock 对象同此要求）。不得保留假绿。**⚠️ 字段面全替换（非只改 mock）**：旧断言的 `toEqual`/`toHaveProperty` 校验的是
  `PresenceStatusRecordDto` 形态（`id`/`createdBy`/`createdAt`/`enterpriseId` 等），新 `PresenceBoardEntryDto`
  字段面不同（`id`→可选 `recordId`、去 `createdBy/createdAt/enterpriseId`、新增 `isDefault`/`statusLabel`）——
  每项 `toEqual` 必须按新字段面逐一重写，漏改字段导致假绿。
- **statusLabel 防御测试构造**：正常注册态 key 必有 label（`createRecord`/`getBoard` 都经字典），裸 key 回退
  **仅防御路径**。要测防御须**人为构造**：mock `listStatusTypes` 返回**不含**某活跃记录 key 的列表，断言该行
  `statusLabel === 裸 key`。不要写"未知 key 永不为裸 key"这类与服务行为冲突的断言。

**e2e（新建 `presence-board-realtime.e2e-spec.ts`，in-memory，承载双向安全断言；须并入根 `test:e2e` 枚举）**

- **⚠️ 建同部门多人的助手限制（B3）**：`presence.e2e-spec.ts` 的 `createUserWithRole:202` **每次
  `randomUUID()` 建独立部门挂一人，无法把多人放进同一部门**。本 e2e 要"D1 下多员工 / D1 viewer 看全 D1 /
  换部门"，**不能两次调该助手**（会得两个独立部门）——须**自建共享 department**（直接 `pool.query INSERT
platform.departments`，或 admin `POST /api/platform/departments`）拿到 `departmentId`，再用**接受该
  `departmentId` 的建员工变体**（`POST /api/platform/employees` body 带 `departmentId`）挂多名员工到同一部门。
  先落这个 helper 变体，否则 department/tree scope 与"换部门"断言构造不出。
- 建部门 D1（挂多员工）/D2 + 员工若干，部分登记离岗态、部分不登记：
  - department scope viewer（D1）看板 → D1 全体在册，无记录者显示在岗缺省、有记录者显示离岗态 label；D2 员工
    **不出现**（越权不泄露）。
  - company scope viewer → 全企业在册。
  - self scope viewer → 只本人一行。
  - **department_tree 跨子树（T3）**：建父部门 P + 子部门 C（C 是 P 的 descendant，`listDescendantDepartmentIds`
    覆盖）+ 另一棵树 Q，tree scope viewer（挂 P）→ 看板含 **P 与 C 的员工**（子树展开），**Q 的员工不出现**
    （越权不泄露）。单测已验 tree 分支，e2e 补真库子树验证。
  - **既有测试增强（B1）**：`presence.e2e-spec.ts:167 'filters board records by self scope'`（PG 真跑）反转后
    仍过，但**只验 self 兼容**（本人 employeeNo 在 / 他人不在）、**未验反转核心语义**——须**增强**：该 self viewer
    **本人无活跃记录时**，items 仍含本人且 `isDefault:true`（在岗缺省态），不只验 employeeNo 过滤。否则 PG 真库
    只回归了兼容、没回归反转。
- **换部门归属随实时组织变**：员工 X 登记时在 D1、之后经 **`PUT /api/platform/employees/:id/profile`**
  （`apps/platform-api/src/users/employee.controller.ts:98-105`，**权限 `platform:employee:manage`**——admin 有；
  body DTO 在 controller 侧是 **`UpdateEmployeeProfileDto`**，contract 侧类型是 `UpdateEmployeeProfileInput`，
  字段 `departmentId`）把 X 调到 D2 → D2 viewer 看板出现 X（实时部门），D1 viewer 看板不再有 X；X 的历史记录
  快照仍是 D1（不影响看板归属）。**⚠️ in-memory 可用性确认**：该端点须在 `PLATFORM_REPOSITORY_DRIVER=memory`
  下可用（memory 实现须支持 `updateEmployeeProfile` 改 `departmentId`）——实现前先跑通；**若 memory 不支持改
  部门，本条"换部门"断言移到 PG-gated `presence.e2e-spec.ts`**（in-memory e2e 仍承载越权/无记录→在岗断言）。
- **statusLabel（正常态）**：看板行 label 为字典 label——e2e 断言只覆盖"**已注册状态**显示其 label"（自定义 key
  显示 label 而非裸 key）；裸 key 回退是防御路径、由**单测**覆盖（见上），e2e **不**构造未知 key。
- **无 forms 填报值泄露**：登记带 form 的成员，看板行**不含**其 forms 填报字段值（只有 presence 自有列 +
  opaque `formRecordId`）；**在岗缺省行 `formRecordId` 为 `undefined`**（无记录）。

## 5. 退出标准

1. `PlatformEmployeeLookupPort.listEmployeesByScope` 落地（contract + platform-api 实装 + 单测），仅返回窄字段、
   按 enterprise+active+departmentIds 严格过滤，company/department/tree 名册正确。
2. `getBoard` 反转为名册 LEFT JOIN 活跃记录：**无记录者显示在岗缺省**、有记录者显示离岗态 + `statusLabel`；
   过滤依据实时部门 + scope，越权不泄露（单测 + PG e2e 双向断言齐）。
3. self/company/department/department_tree 四态名册分派正确（含 tree 子树、无部门降级 self、空名册短路）。
4. 看板响应为 `PresenceBoardEntryDto`（含实时部门 + statusLabel + isDefault），不含 forms 填报值。
5. `listActiveRecords` getBoard 侧改用 `userIds`；repository `departmentIds` 能力保留不删（集成测试仍绿）。
6. 换部门后看板归属随实时组织变（e2e 实证），记录快照不再作过滤依据。
7. 零新迁移 / 零新权限点 / 零 forms 改动；controller 与既有端点路由/守卫不变。
8. `pnpm verify` 全绿；本地 PG `verify:full` 全绿且 PG e2e 真跑（非 skip），PR 描述给出计数。
9. §16 变更门评估落文档（确定性）：`security-baseline.md` **§8.2 补 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 条目
   （含姓名"有意返回、区别于 org-port"的澄清）+ §16 增"只读端口扩面"触发项**；§5 无变化不补；评估结论进 PR
   描述与 verification-log。
10. security-reviewer 独立二审通过（§0 安全门禁判定 **8 条**逐条核，重点：scope 不可伪造、窄字段、越权不泄露、
    forms 值不随看板下发、读端点写副作用）。
11. **§7 所列全部文档 + 代码收尾项完成**（foundation-progress §6.6/§7.5、architecture、module-contract、
    security-baseline §8.2、verification-log、doc-index §7 + 根 `package.json` e2e 枚举），逐项不遗漏。

## 6. 必须保持不变（避免越界）

- `getEmployeeStatus` / `listOwnRecords` / `createRecord` / `cancelRecord` 行为不变（M8-5a/M9-1/M9-2 现状）。
  **注（回应"getEmployeeStatus 不 seed 字典、与 getBoard 不一致"的疑虑）**：`getEmployeeStatus` 返回
  `{ record: PresenceStatusRecordDto | null }`，**不返回 `statusLabel` 字段**——它不产 label，故"getBoard 按需
  seed / getEmployeeStatus 不 seed"对 label 无实际后果（不存在两端点 label 不一致）。看板与按人查询的 label
  供给对称（若要 getEmployeeStatus 也下发 label）属 **M9-3b web 消费层**，本切片**不**给 getEmployeeStatus 加
  seed / label（那是无谓改动且越 §6 边界）。
- `PresenceStatusRecordDto` 保留（非看板路径仍用）；`listActiveRecords` repository 签名/departmentIds 能力保留。
- `listEmployeesByIds` 行为不变（self 名册与既有 getEmployeeStatus/forms 授权仍依赖它）。
- scope 模型（kind/matchesScope/resolveScope）不变；不新增 data_type。
- `presence.status.changed` 事件、forms 集成、M9-2 登记链路不受影响（现有 e2e 全绿即证）。
- 不动 `db:setup`、无新迁移、无新权限点。

## 7. 完成后更新文档 / 代码收尾（非可选）

- **根 `package.json`（代码改动，勿只当文档）**：`test:e2e` script 追加
  `apps/gateway-api/src/presence-board-realtime.e2e-spec.ts`，确认 `pnpm test:e2e` 收集到它（文件数递增）。
- `docs/foundation-progress.md`：§6.6 M9-3a 行 Pending→Done（PR 号/要点）；§7.5 看板 follow-up 行（"§7.5 看板
  follow-up 在 M9-3a 收口后置 Done"，RFC §17）标注**已收口**；**并记已知性能上限**：company scope 走"全量员工 +
  全量活跃记录内存 join + 全员 id `user_id = ANY(...)` 下推 PG"，大规模企业（>10k 员工）未测、优化留后续。
- `docs/architecture.md`：presence 看板段补"数据来源反转（名册 LEFT JOIN 活跃离岗记录、实时部门过滤）"；
  `PlatformEmployeeLookupPort` 读端口清单补 `listEmployeesByScope`。
- `docs/module-contract.md`：presence 看板响应 DTO 形态（`PresenceBoardEntryDto` + statusLabel + isDefault）；
  platform 读端口 `listEmployeesByScope`。**并显式记 M9-3a→M9-3b 的 web 回归窗口**（见 §0 D-2）：`/presence/board`
  响应形态已变、presence web board 客户端（`presence-api-client.ts` + `PresenceBoardPage.tsx` + 其 spec）为
  M9-3b 待迁移项、现处假绿，M9-3a 不单独上生产、须与 M9-3b 成对/紧接。
- `docs/security-baseline.md`（**两处必改**）：
  1. **§8.2「进程内平台只读端口基线」**（`:373-381`）补 `PLATFORM_EMPLOYEE_LOOKUP_SERVICE` 条目。
     **⚠️ 关键：§8.2 现文对 `PLATFORM_ORG_PORT` 写"端口只返回 user id 等最小标识，不返回姓名、手机号…"——
     这条措辞不适用于 `PlatformEmployeeLookupPort`**：`EmployeeLookupDto` **有意**返回 name/employeeNo/
     departmentName（M6/M8 建立的、比 org-port 宽但仍受限的独立名册契约）。补文必须显式区分二者，否则新基线
     自相矛盾。文字模板：
     > `PLATFORM_EMPLOYEE_LOOKUP_SERVICE`（`PlatformEmployeeLookupPort`）：`listEmployeesByIds` /
     > `listEmployeesByScope` 仅返回 `EmployeeLookupDto`（id / employeeNo / name / departmentId /
     > departmentName——名册展示所需，**有意**含姓名/工号/部门名，区别于 `PLATFORM_ORG_PORT` 的"仅 id"口径），
     > **不含** account / mobile / email / password / roles。调用方 `scope`/`departmentIds` 由 platform 消费方
     > **服务端 resolve、不接受客户端传入**；每次查询 enterprise 边界圈定 + active 过滤；跨企业/停用/不存在按
     > 空结果处理，不泄露存在性。
  2. **§16 变更清单**（`:520-531`）**增一条触发项**"扩 platform 进程内只读端口面（`@work/platform-contract`
     暴露的进程内只读端口新增方法/字段）"——使未来静默扩面被门禁捕获（本切片自身按此新触发项走一遍：已在
     §8.2 登记）。
  - §5 数据范围执行**无变化、不补 §5**（§0 门禁判定 7 已定）。评估结论（含 §8.2/§16 两处改动）写进 PR 描述与
    verification-log。
- `docs/verification-log.md`：新增「M9-3a Board Realtime Backend」小节（命令计数 + 断言矩阵 + §16 评估结论 +
  security-reviewer 结论）。
- `docs/doc-index.md` §7：登记本任务包。

## 8. 提交规范

- 分支 `feat/m9-3a-board-realtime`；Conventional Commits（如
  `feat(platform): add listEmployeesByScope roster read port`、
  `feat(presence): invert board to roster LEFT JOIN active records with realtime scope`）。
- 不提交 `node_modules` / `.env` / 构建产物；本切片**零新依赖**，lockfile 无 diff。
- PR 描述给出 §4.1 命令输出计数（PG e2e 真跑证据必须体现）与 §4.2 矩阵勾选、§16 评估结论。
