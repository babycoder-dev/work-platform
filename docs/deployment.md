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

如宿主机已占用 PostgreSQL 或 Redis 默认端口，可在 `infra/release/.env.prod` 中覆盖宿主端口：

```env
POSTGRES_HOST_PORT=55432
REDIS_HOST_PORT=56379
PLATFORM_API_HOST_PORT=3001
```

M6-2 起，`gateway-api` 内嵌 FilesModule 并使用本地磁盘 provider。生产环境必须配置并挂载文件
volume，Compose 默认挂载 `files-data:/var/lib/work-platform/files`，关键环境变量如下：

```env
FILE_STORAGE_LOCAL_ROOT=/var/lib/work-platform/files
FILE_STORAGE_MAX_BYTES=20971520
FILE_STORAGE_TENANT_QUOTA_BYTES=10737418240
FILE_STORAGE_USER_QUOTA_BYTES=1073741824
FILE_STORAGE_UPLOADS_PER_MINUTE=20
FILE_STORAGE_UPLOAD_BYTES_PER_HOUR=209715200
FILE_STORAGE_MIN_FREE_BYTES=2147483648
FILE_STORAGE_MIN_FREE_RATIO=0.1
FILES_REPOSITORY_DRIVER=postgres
FILES_DATABASE_POOL_MAX=5
```

这些值可下调但不得关闭；生产环境缺少 `FILE_STORAGE_LOCAL_ROOT` 时服务启动失败。文件 volume
必须使用受限 ACL，不能挂到公开共享目录。

如果构建环境访问默认 npm registry 不稳定，可在有网构建机指定内部镜像或可信镜像：

```bash
NPM_REGISTRY=https://registry.npmjs.org/ docker compose -f infra/docker-compose.prod.yml build
```

Windows PowerShell:

```powershell
$env:NPM_REGISTRY="https://registry.npmjs.org/"
pnpm docker:build
```

`NPM_REGISTRY` 同时影响 Dockerfile 中 `pnpm@10.0.0` 的全局安装和后续 `pnpm install --frozen-lockfile`。内网构建镜像必须包含：

- `pnpm` 包本身。
- `pnpm-lock.yaml` 中锁定的所有依赖包和可选平台包。
- 构建所需的 Node/Nginx/PostgreSQL/Redis 基础镜像，或已导入的离线镜像。

首次部署或 schema 变更后执行数据库初始化：

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://work:<POSTGRES_PASSWORD>@localhost:<POSTGRES_HOST_PORT>/work_platform"
$env:NODE_ENV="production"
$env:PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="<initial-admin-password>"
pnpm db:setup
```

Bash:

```bash
DATABASE_URL="postgresql://work:<POSTGRES_PASSWORD>@localhost:<POSTGRES_HOST_PORT>/work_platform" \
NODE_ENV=production \
PLATFORM_BOOTSTRAP_ADMIN_PASSWORD="<initial-admin-password>" \
pnpm db:setup
```

`db:setup` 会依次执行 platform、presence、files、forms、notification 迁移，再幂等写入默认企业、总部部门、平台权限、系统管理员角色和初始管理员身份。重复执行不会覆盖已有管理员密码，除非显式设置 `PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD=true`。
notification 迁移会自动发现并执行 `notification.schedule_config` 的调度配置迁移；无需单独新增入口，
也可以用 `pnpm db:migrate:notification` 单独重跑，迁移和 seed 均幂等。

M7-3 起，`gateway-api` 内嵌 notification 调度基建并由 `@nestjs/schedule` 在进程内注册 CronJob。当前生产假设是
单实例调度；如果横向扩展多个 `gateway-api` 副本，调度 job 会在每个副本各自触发，需先补分布式锁 / leader 选举 /
DB advisory lock 等多副本协调能力后再启用多副本调度。

M7-4a 起，`gateway-api` 还承载通知 SSE 端点 `GET /api/notification/stream`。反向代理必须允许
`text/event-stream` 长连接，并对该路径关闭响应缓冲、压缩聚合或过短 idle timeout；当前推送注册表为进程内单实例，
横向扩展前需补 PostgreSQL `LISTEN/NOTIFY` 或 Redis pub/sub 级别的跨副本 fan-out。
M7-4b 起，`workbench-shell` 通过 fetch + ReadableStream 消费 SSE，因此代理必须同时允许普通
`Authorization: Bearer ...` 头透传到 `/api/notification/stream`；前端断线会自动回退 REST 轮询，
但代理缓冲会导致实时通知退化为轮询体验。

服务：

- `workbench-shell`
- `gateway-api`
- `platform-api`
- `im-adapter-api`
- `realtime-gateway`
- `postgres`
- `redis`

OpenIM 独立部署，不默认塞进主 compose。

### 2.1 Compose Smoke

M1-M3 阶段的本地部署 smoke 先采用手动命令，M8 前必须自动化到发布验收流程。

前置条件：

- `infra/release/.env.prod` 已设置 `POSTGRES_PASSWORD`、`PLATFORM_BOOTSTRAP_ADMIN_PASSWORD`。
- 如宿主机 `5432` 或 `6379` 已被占用，已设置 `POSTGRES_HOST_PORT` 或 `REDIS_HOST_PORT`。
- 已执行 `pnpm db:setup` 初始化数据库。

最小 smoke：

```powershell
docker compose --env-file infra/release/.env.prod -f infra/docker-compose.prod.yml up -d postgres redis platform-api
Invoke-RestMethod http://localhost:3001/api/platform/health
```

完整 smoke：

```powershell
docker compose --env-file infra/release/.env.prod -f infra/docker-compose.prod.yml up -d
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3001/api/platform/health
```

当前 CI 已覆盖 `db:setup`、PostgreSQL repository integration、PostgreSQL E2E 和 production Docker build。服务启动后的 Compose API smoke 在 M8 前补为自动化 gate。

### 2.2 当前镜像边界

M1-M3 阶段的 Node 服务镜像共用 `infra/docker/Dockerfile.node-service`，通过 `SERVICE_NAME` 决定启动哪个服务。该 Dockerfile 会复制当前 monorepo 的 `apps`、`packages`、`modules` 目录，因此每个 Node 服务镜像包含完整工作区源码和依赖。

当前接受该策略的原因：

- M1 阶段优先验证可复现构建、迁移、seed、CI 和内网迁移链路。
- 统一 Dockerfile 可减少早期构建脚本分叉。
- `.dockerignore` 已排除本地依赖、构建产物、环境文件和缓存。

交付约束：

- 该策略不得作为 M8 最终交付边界。
- M8 前必须收敛为服务级构建产物或按服务裁剪镜像，避免镜像包含无关业务源码。
- 如果企业内网在 M8 前要求按服务隔离镜像源码，必须提前启动镜像裁剪切片。

## 3. 内网镜像迁移

有网环境打包镜像：

```bash
docker compose -f infra/docker-compose.prod.yml build
docker save -o work-platform-images.tar \
  work-platform-workbench-shell \
  work-platform-gateway-api \
  work-platform-platform-api \
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
- PostgreSQL 数据卷和 Files 本地文件 volume 已规划协调备份。
- 管理员初始密码交付方式已确认。
- 内网服务器时间同步正常。

## 6. 备份与恢复

生产部署必须在上线前确认 PostgreSQL 与 Files 文件 volume 的协调备份策略。文件 volume 与
PostgreSQL metadata 同属敏感数据：数据库记录 `files.file_objects.storage_key`，文件内容保存在
本地 volume；只备份其中一侧都会导致恢复后 metadata-volume 不一致。

最低要求：

- 每日一次逻辑备份或等效企业备份任务。
- 每次版本升级、迁移前手动触发一次备份。
- 备份文件按敏感数据处理，不得放入公开共享目录。
- 文件 volume 备份目录必须使用受限 ACL，并执行与数据库备份一致的保留 / 删除策略。
- 版本升级前必须先停止上传入口或进入维护窗口，协调备份 PostgreSQL 与文件 volume。
- 每季度至少做一次恢复演练，记录恢复耗时、恢复点和验证结果。
- 发布文档中必须写明 RPO/RTO 目标；未定义前默认目标为 RPO 24 小时、RTO 4 小时。

恢复演练至少验证：

- PostgreSQL 可从备份恢复到新实例。
- Files volume 可恢复到新挂载点，且应用进程只能在配置的 root 内读写。
- 抽样校验 `files.file_objects` 中未删除对象的 `storage_key` 在恢复后的 volume 中存在。
- `pnpm db:setup` 对已恢复实例保持幂等。
- 管理员登录、权限菜单和一个核心业务读路径可用。
