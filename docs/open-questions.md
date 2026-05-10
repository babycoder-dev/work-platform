# 待确认事项

以下事项不阻塞第一阶段基建，但会影响后续实现细节。

## 1. 登录与身份源

已确认：企业内部账号。

默认实现：

- platform-api 自持账号。
- 用户名/密码登录。
- 密码强哈希保存。
- 支持密码策略、账号锁定、登录审计。
- OIDC/LDAP 暂不作为第一阶段依赖，仅保留适配器接口。

待确认：

- 初始管理员账号和初始密码交付方式。
- 密码强度与过期策略是否需要按等保要求配置。
- 是否需要登录双因素认证。

## 2. UI 组件库

默认先按 React + Ant Design 方向预留。

待确认：

- Ant Design
- Arco Design
- shadcn/ui
- 自研组件库

## 3. 数据访问层

默认 PostgreSQL。

待确认 ORM/Query Builder：

- Prisma
- Drizzle
- TypeORM
- Kysely

## 4. 部署方式

默认先 Docker Compose，本地和内网服务器都容易启动。所有依赖需要支持内网镜像或离线包导入。

待确认：

- Docker Compose
- Kubernetes
- 现有公司 CI/CD 平台

## 5. 组织权限数据来源

默认 platform-api 自建基础模型。

待确认：

- 人员部门从 HR 系统同步
- 手工维护

## 6. C/S 客户端技术

已确认：

- 需要 Windows/Linux。
- Windows 7 使用 Web UI，不做原生 C/S 客户端。
- 原生 C/S 客户端首期面向 Windows 10+/Windows 11 x64。
- Windows 客户端只支持 64 位。
- Linux 后续优先考虑 Ubuntu x64。
- 性能基线已接受：冷启动 2 秒内、空闲内存小于 120 MB、1000 人在位看板不卡顿。

默认方案：

- Qt 6.8 LTS C++
- 优先 Qt Widgets
- 不默认使用 Electron/Tauri/Flutter
- 不默认使用 WebView 壳复用 Web UI

待确认：

- C/S 客户端是否需要离线草稿或离线可读缓存
- 客户端自动更新是否必须支持内网更新源
- Ubuntu 之外的 Linux 发行版优先级，例如统信/UOS、麒麟、RHEL/CentOS

## 7. OpenIM 接入

已确认：

- 可以使用 OpenIM 作为 IM 基础设施。
- OpenIM 作为独立 Provider 接入，不接管平台账号。
- 第一阶段只做服务端 REST/Webhook POC。
- 客户端 SDK 是否集成需要单独做 AGPL 合规评估。

待确认：

- OpenIM 是否由平台团队维护部署，还是由基础设施团队维护。
- IM 数据保留周期与审计要求。
- 是否需要敏感词过滤、消息归档、离职人员消息交接。
