# GitHub 与 CI/CD

> **归档于 2026-10-07**（原 `docs/github-cicd.md`）。归档理由：这是仓库**引导期**的文档
> （"是否需要上传 GitHub""初始化远程仓库"），其中 §3 的 CI 命令列表早已过期；仍未失效的两部分
> 已折进 `docs/development-workflow.md`（CI 步骤与分支保护要求）。保留原文以记录引导期取舍。
> 归档约定见 `docs/archive/README.md`。

## 1. 是否需要上传 GitHub

可以上传 GitHub，用 GitHub Actions 做 CI。若代码不能出企业网络，应改用内部 Git 服务与同等 CI 流水线。

## 2. 推荐仓库设置

- 默认分支：`main`
- 保护 `main`
- 必须通过 CI 才能合并
- 必须 PR Review
- 禁止直接 push 到 `main`

## 3. CI 检查

当前 `.github/workflows/ci.yml` 执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
docker compose -f infra/docker-compose.prod.yml build
```

## 4. 初始化远程仓库

```bash
git remote add origin git@github.com:<org>/<repo>.git
git push -u origin main
```

如果使用 GitHub App 或 GitHub CLI，后续可以自动创建 PR。

## 5. 当前发布前置条件

发布到 GitHub 前必须满足：

- 本地 `git remote -v` 已配置 `origin`。
- `gh auth status` 正常。
- GitHub App 或账号能访问目标仓库。
- 若目标仓库不存在，需要先由用户或管理员创建。

当前仓库不假设默认 GitHub 组织或仓库名，避免误推到错误位置。
