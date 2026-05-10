# Desktop Qt Client

高性能 C/S 桌面客户端骨架。

目标平台：

- Windows 10+ x64
- Windows 11 x64
- Ubuntu x64，后续阶段

默认技术：

- Qt 6.8 LTS
- C++17
- Qt Widgets
- CMake

约束：

- 不直接连接数据库。
- 不使用 WebView 作为主界面。
- 只通过 `gateway-api` 调用平台能力。
- 性能优先于 Web UI 复用。
- 不支持 Windows 7 原生客户端；Windows 7 使用 Web UI 兼容模式。
- Windows 客户端只支持 64 位。
- 首期版本主要面向 Windows，Linux 先预留 Ubuntu x64。

## 目录

```text
clients/desktop-qt/
  CMakeLists.txt
  src/
    main.cpp
    app/
    auth/
    network/
    presence/
```

## 后续任务

- 接入 Qt 6.8 LTS 构建链路。
- 增加登录窗口。
- 增加服务地址配置。
- 增加 API client。
- 增加在位看板页面。
- 建立 Windows 10+/Windows 11 x64 性能基线。
