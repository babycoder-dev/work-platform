# 部署与内网迁移

## 1. 部署策略

开发可以在有网环境进行。交付到企业内网时，通过 Docker Compose 和二进制客户端安装包迁移。

```text
有网开发环境
  pnpm install
  pnpm verify
  docker compose build
  docker save images
  export release bundle

企业内网环境
  docker load images
  docker compose up -d
  install desktop client
```

## 2. Docker Compose

生产形态配置：

```bash
cp infra/release/.env.prod.example infra/release/.env.prod
docker compose --env-file infra/release/.env.prod -f infra/docker-compose.prod.yml build
docker compose --env-file infra/release/.env.prod -f infra/docker-compose.prod.yml up -d
```

首次部署或 schema 变更后执行数据库初始化：

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://work:<POSTGRES_PASSWORD>@localhost:5432/work_platform"
$env:NODE_ENV="production"
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="<initial-admin-password>"
pnpm db:setup
```

Bash:

```bash
DATABASE_URL="postgresql://work:<POSTGRES_PASSWORD>@localhost:5432/work_platform" \
NODE_ENV=production \
PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="<initial-admin-password>" \
pnpm db:setup
```

`db:setup` 会先执行迁移，再幂等写入默认企业、总部部门、平台权限、系统管理员角色和初始管理员身份。重复执行不会覆盖已有管理员密码，除非显式设置 `PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD=true`。

服务：

- `workbench-shell`
- `gateway-api`
- `platform-api`
- `notification-api`
- `im-adapter-api`
- `realtime-gateway`
- `postgres`
- `redis`

OpenIM 独立部署，不默认塞进主 compose。

## 3. 内网镜像迁移

有网环境打包镜像：

```bash
docker compose -f infra/docker-compose.prod.yml build
docker save -o work-platform-images.tar \
  work-platform-workbench-shell \
  work-platform-gateway-api \
  work-platform-platform-api \
  work-platform-notification-api \
  work-platform-im-adapter-api \
  work-platform-realtime-gateway \
  postgres:17 \
  redis:7
```

内网环境导入：

```bash
docker load -i work-platform-images.tar
docker compose --env-file infra/release/.env.prod -f infra/docker-compose.prod.yml up -d
```

也可以使用发布脚本生成迁移包：

Windows:

```powershell
pnpm release:bundle:win
```

Linux/macOS:

```bash
pnpm release:bundle:linux
```

## 3.1 依赖离线迁移

推荐优先迁移 Docker 镜像，而不是在内网服务器重新安装 Node 依赖。

如果内网也需要构建：

```bash
pnpm install
pnpm store path
```

将 pnpm store、`pnpm-lock.yaml`、源码一并导入内网，并配置内部 npm 镜像或离线缓存。

## 4. 客户端交付

Windows C/S 客户端首期只交付 x64 安装包或压缩包。

交付物：

```text
work-platform-desktop-win-x64.zip
work-platform-desktop-win-x64.sha256
release-notes.md
```

Linux 客户端后续优先 Ubuntu x64。

## 5. 发布前检查

发布前必须完成：

```bash
pnpm verify
pnpm docker:build
```

并确认：

- `.env.prod` 已替换默认密码。
- 已执行 `pnpm db:setup`，并确认生产环境没有使用 `admin123`。
- OpenIM 地址与密钥已配置。
- PostgreSQL 数据卷已规划备份。
- 管理员初始密码交付方式已确认。
- 内网服务器时间同步正常。
