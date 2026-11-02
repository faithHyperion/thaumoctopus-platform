# 平台决策记录

基准线来自仓库外层的 `thaumoctopus-platform-plan.md`（产品方案，不是进度文档）。本文件只记录已落地的关键决策，按时间追加。

## 2026-10-30

### D1 产品形态

Thaumoctopus = 品牌化 DSH 底座 + Workbench + Platform Bridge。业务能力一律放独立插件仓库 `thaumoctopus-plugins`，发布到私有 registry，不进入本仓库（方案 2.1、2.2）。

### D2 用户隔离

Thaumoctopus 使用独立 `DSH_HOME`，Windows 默认 `%LOCALAPPDATA%\Thaumoctopus\dsh-home`，不碰用户已有 `~/.dsh`。开发期由 `scripts/thaumoctopus/start-web.mjs` 注入，产品期由安装器/updater 注入（方案 2.4）。

### D3 仓库布局

第一方产品包嵌套在 `packages/thaumoctopus/{workbench,platform-bridge}`，而不是 `packages/` 直下。原因：DSH 构建链（pnpm workspace、tsdown、host 工程引用）按 `packages/*/*/package.json` 两层 glob 发现包，嵌套恰好满足该模式，且 `@thaumoctopus` scope 不与 `@deepseek-ai/*` 混淆。

### D4 品牌接入点

Web 展示名走 DSH 现成的 `DSH_CLIENT_TITLE` 构建环境变量（HTML title 与 AppFrame 共用），不在本仓库改 DSH 源码。桌面安装器、图标等 Phase 1 后续接入。

### D5 默认 profile

`profiles/thaumoctopus/` 提供 cordis 根配置（空列表）、补丁层（当前为空数组占位）和 bundle 清单（`dsh-base` + `dsh-web-app`）。首次启动由启动器复制到 `DSH_HOME/profiles/thaumoctopus/`，之后用户态文件留在 dsh-home，仓库不回写。

### D6 版本基准

产品版本 `0.1.0`，对齐 DSH `0.2.2-alpha.2` 基线。插件兼容性声明格式按方案 9.2（`engines.dsh`），在 Phase 2 插件接入时启用。
