# GitHub 与 CI/CD

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
