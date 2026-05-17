# AI Development Root Context

AI 在本仓库生成或修改代码时，必须先遵守以下规则。

## 1. 先读文档

优先阅读：

1. `docs/doc-index.md`
2. `docs/constitution.md`
3. `docs/foundation-blueprint.md`
4. `docs/foundation-progress.md`
5. 当前任务相关 RFC，例如 `docs/rfc/m1-platform-core-persistence.md`
6. `docs/security-baseline.md`
7. `docs/architecture.md`
8. 当前任务相关专题文档，例如 `docs/platform-core.md`
9. `docs/development-workflow.md`

## 2. 模块边界

当前推进策略是基建优先。进入完整业务模块开发前，必须优先完成 `docs/foundation-blueprint.md` 中的 M1/M2/M3 门槛。

开始 M1 Platform Core 持久化前，必须遵守 `docs/rfc/m1-platform-core-persistence.md` 与 `docs/security-baseline.md`。

业务模块不得直接依赖其他业务模块内部实现。

允许：

```text
业务模块 -> 自己的 contract
业务模块 -> packages/*
业务模块 -> platform-sdk
```

禁止：

```text
presence -> approval/internal
approval -> report/internal
report -> presence/internal
```

## 3. 新增业务模块时

必须创建：

```text
modules/<module>/contract
modules/<module>/web
modules/<module>/api
```

必须声明：

- manifest
- permissions
- events
- DTO/schema
- API prefix

## 4. API 与错误

所有 HTTP 请求使用 `@work/http-client`。

所有错误使用统一格式：

```json
{
  "success": false,
  "code": "MODULE_ERROR_CODE",
  "message": "可读错误信息",
  "traceId": "trace-id",
  "details": {}
}
```

## 5. 提交规范

提交信息必须使用 Conventional Commits。

示例：

```text
feat: add presence module shell integration
docs: add architecture constitution
chore: configure workspace lint rules
```

交付前必须优先运行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

如果变更影响部署，还必须检查 Docker 构建。

## 6. 桌面客户端

桌面客户端位于 `clients/desktop-qt`。

要求：

- Windows 10+/Windows 11 x64 首期优先。
- Linux 后续优先考虑 Ubuntu x64。
- 性能优先，低配机器可用。
- 不把 WebView 作为主界面。
- 不直接连接数据库。
- 只通过 gateway-api 和公开 API 契约访问业务能力。

Windows 7 不做原生桌面客户端，使用 Web UI 兼容模式。

## 7. IM 与 OpenIM

OpenIM 只能作为独立 IM Provider 接入。

要求：

- 通过 `apps/im-adapter-api` 调用 OpenIM REST API。
- 通过 `packages/im-provider` 暴露平台内部抽象。
- 业务模块不得直接调用 OpenIM。
- OpenIM 不得接管平台账号、组织、角色、权限。
- 不复制 OpenIM Demo 或客户端 SDK 代码。
- 客户端 SDK 接入前必须处理 AGPL 合规评估。
