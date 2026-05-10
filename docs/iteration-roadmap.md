# 迭代路径建议

## Phase 0: 工程基建

目标：让后续所有模块都能按统一方式开发。

交付：

- pnpm workspace
- Nx 基础配置
- ESLint / Prettier / TypeScript strict
- Conventional Commits
- Docker Compose: PostgreSQL / Redis
- 基础目录结构
- 架构宪法

## Phase 1: 平台基座

目标：工作台可以承载模块。

交付：

- workbench-shell
- platform-api
- gateway-api
- 内部账号登录
- 用户、部门、角色、权限模型
- 企业内部账号与本地身份模型
- 模块 manifest 注册
- 菜单与权限过滤
- platform-sdk
- http-client
- 密码策略、登录审计占位
- 事件总线骨架
- 通知中心骨架
- WebSocket Gateway 预留
- im-adapter-api
- OpenIM Provider 抽象
- OpenIM REST/Webhook POC

## Phase 2: 在位管理 MVP

目标：用一个轻业务模块验证基建。

交付：

- 状态登记
- 在位看板
- 部门筛选
- 数据范围权限
- 状态变更事件
- API 契约与 OpenAPI 文档

## Phase 2.5: C/S 客户端骨架与 Win7 Web 兼容

目标：验证 Windows 10+/Windows 11 x64 原生客户端可以复用平台账号、权限和在位管理 API，同时保证 Windows 7 可以通过 Web UI 使用核心功能。Linux 后续优先考虑 Ubuntu x64。

交付：

- Qt 6.8 LTS C++ 客户端工程
- Windows 10+/Windows 11 x64 构建链路说明
- Ubuntu x64 构建链路预留
- 登录页
- 服务地址配置
- Token 保存策略
- 在位看板只读页
- 状态登记页
- 启动耗时、内存占用、列表渲染性能基线：2 秒冷启动、空闲小于 120 MB、1000 人看板不卡顿
- Web UI legacy 构建目标
- Windows 7 浏览器兼容测试清单

## Phase 3: 审批 MVP

目标：验证跨模块事件协作。

交付：

- 请假审批
- 审批流配置简版
- 待办任务
- 审批通过后写入在位状态
- 审批事件

## Phase 4: 日/周报 MVP

目标：验证逐级汇总和组织数据范围。

交付：

- 日报/周报填写
- 直属领导查看
- 部门负责人汇总查看
- 未提交提醒

## Phase 5: 平台增强

目标：为长期协作平台打底。

交付：

- 通知中心
- 附件服务
- 审计日志
- 操作留痕
- 灰度发布
- OpenAPI SDK 生成
- 模块远程加载 POC
