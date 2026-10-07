## Summary

-

## Verification

> 贴**实际执行的命令与结果**，不要只勾选。本仓立场（`docs/agent-workflow.md` §1）：**写不出命令的「已完成」不算完成**。
> 涉及数据库加 `pnpm verify:full`；涉及部署加 `pnpm docker:build`。
> `docs/verification-log.md` 中 2026-10-01 起的条目由 `pnpm evidence` 校验「命令 + 结果」这一形式。

```text
$ pnpm verify
（粘贴结果，例如 exit 0 / 各套件通过数量）
```

- 未执行或无法执行的门禁（写清命令、原因、替代检查；见 `docs/development-workflow.md` §2）：

## Review Focus

- [ ] 模块边界（`docs/constitution.md`）：业务模块不依赖其他模块内部实现——由 `pnpm lint` 的 `@nx/enforce-module-boundaries` 兜底
- [ ] UI 类交付是否过还原度门禁：A 类 `pnpm fidelity`（自动）+ B 类人工并排比对（**必须覆盖交互态**）
- [ ] 公开 contract / schema / 迁移 / 文档是否同步
- [ ] 权限、数据范围、审计、登录安全影响
- [ ] 内网部署影响（不得引入公网 CDN / 外部字体图标依赖）
- [ ] 新增开源依赖的许可证风险

## Architecture Checklist

- [ ] 变更对应某个已记录里程碑，或已更新 `docs/foundation-progress.md`
- [ ] API 版本兼容性已保持或显式说明
- [ ] 数据库迁移与 seed 影响已考虑（**迁移文件一经登记即不可修订，只能前向新增**）
- [ ] 跨模块行为是否声明领域事件 / 通知意图
- [ ] TLS、密钥管理、备份恢复、连接池影响已考虑
- [ ] 业务代码未直接调用 OpenIM 或其他模块内部实现
