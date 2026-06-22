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

## 7. 设计还原度门禁（UI 类交付）

凡是实现或修改面向用户的界面（壳、登录、业务模块屏），都按对应设计稿做**像素级还原**，并过下面两层门禁。
依据与边界详见任务包 `docs/tasks/ui-foundation-fidelity.md` §2 与差距清单 `docs/design/ui-fidelity-gap-foundation.md`；
组件库 Modal 的还原 follow-up 见 `docs/design/ui-fidelity-gap-modal.md`（登记于 `docs/foundation-progress.md` §7.2）。
设计真源在 `docs/design/ui-handoff/`（只读基准，勿改）。

- **A 类 · 实现方交付前必须自证（可静态/机器核验）：**
  - A1 零硬编码 hex：`apps/**/src` 与 `packages/ui/src` 的颜色只引 `var(--*)`；唯一允许出现 hex 的是
    `packages/ui/src/styles/tokens.css`（token 唯一真源）。
  - A2 零 emoji 当图标：图标一律用线性 SVG（`@work/ui` 的 `Icon`），不得用 emoji/首字母占位。
  - A3 关键文案逐字一致：在 `*.spec.tsx` 断言渲染文本精确等于设计稿字符串。
  - A4 间距/圆角/阴影/字体只引 token 变量（`--sp-*`/`--r-*`/`--shadow-*`/`--font`/`--font-size-*`）；
    设计的非 4px 网格值用 `calc(token …)` 组合命中，不写裸魔法值。
  - A5 真实接线/诚实占位回归保留：不得把已交付的真实数据接线删除或替换为设计稿的虚构演示数据；
    未建功能用诚实 EmptyState/占位，不硬塞内容。
- **B 类 · 评审方人工抽查（不阻塞实现方交付，定稿前做）：** 渲染设计稿原型与实现并排比对，逐区块核对
  结构/间距/组件态差异并回交修正。**必须覆盖交互态**（报错 / hover / 下拉浮层展开 / 加载中 / 空态 vs 有数据），
  不能只看默认静态截图——长报错撑宽、浮层错位等只在交互态暴露。可用无头浏览器脚本对每个状态各截一张并排比。
- **L1/L2 边界：** 视觉系统（组件库）、外壳 chrome、登录页、真实存在的屏的版式 = L1 严格像素级；设计稿里
  本产品尚未建的功能内容 = L2 仅视觉参考，用设计的组件样式渲染真实数据，不为此造后端、不照搬虚构内容。
