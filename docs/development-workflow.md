# 开发工作流

## 1. 本地安装

开发环境有网时：

```bash
corepack enable
pnpm install
```

`pnpm-lock.yaml` 必须提交到 Git，保证 CI、开发环境、内网构建使用一致依赖版本。

CI、本地交付检查和 Docker 构建必须使用：

```bash
pnpm install --frozen-lockfile
```

内网开发机应配置内部 npm 镜像或使用离线依赖包。

## 2. 每次交付前必须执行

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

等价命令：

```bash
pnpm verify
```

如果改动影响部署：

```bash
pnpm docker:build
```

如果当前环境无法安装依赖或无法联网，必须在交付说明中明确写出：

- 失败命令。
- 失败原因。
- 已完成的替代检查。
- 需要在 CI 或有网环境补跑的命令。

### 2.1 UI 设计还原度门禁

涉及 `apps/workbench-shell` 或 `packages/ui` 的 UI 类交付，除 `pnpm verify` 外必须对照
`docs/tasks/ui-foundation-fidelity.md` 与 `docs/design/ui-fidelity-gap-foundation.md` 执行设计还原度门禁：

- `packages/ui/src/**` 与 `apps/workbench-shell/src/**` 不得出现硬编码 hex 色值，颜色统一来自 token。
- 不得用 emoji 充当图标，占位图标必须来自统一线性 SVG 图标集。
- 登录页、外壳和工作台首页的设计稿关键文案必须在 `*.spec.tsx` 中逐字断言。
- 间距、圆角、阴影、字体等视觉参数优先使用 `--sp-*`、`--r-*`、`--shadow-*`、`--font*` token。
- 已接入的真实数据链路和诚实 EmptyState 占位必须回归保留，不得用原型演示数字或条目充版式。

交付记录需在 `docs/verification-log.md` 写明静态扫描、文案断言、真实接线回归和差距 ID 销项结果。

## 3. Git 规范

分支命名：

```text
feat/platform-core
feat/presence-mvp
fix/auth-login
chore/ci
docs/architecture
```

提交信息必须使用 Conventional Commits：

```text
feat: add platform employee api
test: add platform auth e2e coverage
chore: add docker compose deployment
docs: document delivery workflow
```

建议每完成一个可审查单元就提交一次，不把大量无关改动塞进一个提交。

禁止提交：

- `node_modules`
- `.env`
- 构建产物
- 本地日志
- 未经确认的第三方源码拷贝

## 4. 代码审查

PR 或交付前必须检查：

- 模块边界是否符合 `docs/constitution.md`。
- 是否更新 contract、schema、文档。
- 是否补充单元测试或 E2E 测试。
- 是否影响内网部署。
- 是否引入新的开源 License 风险。
- 是否影响权限、数据范围、审计、登录安全。

## 5. 测试分层

单元测试：

- 包级工具，例如 event-bus、errors、http-client。
- 服务级业务逻辑，例如 AuthService、RbacService。

E2E 测试：

- API 主流程，例如登录、组织、权限、通知。
- 后续 Web UI 成熟后再增加 Playwright 浏览器 E2E。

## 6. AI 协作要求

AI 每完成一个可交付片段，应执行或说明以下结果：

- 安装/依赖状态。
- lint 状态。
- typecheck 状态。
- unit test 状态。
- e2e test 状态。
- build 状态。
- Docker build 状态，如相关。
- Git diff 和建议提交信息。
