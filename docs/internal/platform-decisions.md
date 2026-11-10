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

## 2026-11-03

### D7 工作台后端仓库

工作台后端作为独立项目放在 `workbench-backend`，不进入 `thaumoctopus-platform` 的 pnpm workspace。原因是它是 Go + PostgreSQL 的独立部署单元，依赖链、构建节奏和发布周期都与 DSH 前端/Host 工程不同。M-B1 已落地：Go 服务骨架、迁移、健康检查、Docker 镜像和 Compose 部署。

### D8 PostgreSQL 18 数据卷

官方 PostgreSQL 18 镜像要求将数据卷挂载到 `/var/lib/postgresql`，由镜像在其下创建版本化数据目录；不能再直接挂载 `/var/lib/postgresql/data`。Compose 部署按新约定配置。

### D9 M-B2 认证与用户管理

工作台后端 M-B2 采用 argon2id 密码哈希、HS256 JWT access token、服务端哈希存储的 opaque refresh token，并在 refresh 时轮换旧 token。首个管理员由环境变量 bootstrap，且只在用户不存在时创建。管理端用户页暂以内嵌静态页面提供，后续插件管理扩展时再评估是否切换到 React + Vite + Ant Design。

### D10 M-B3 插件目录与版本存储

插件版本只接受 `npm pack` 产物。上传时服务端解包校验 `package/package.json`，要求包名与插件记录一致、版本为 SemVer、`engines.dsh` 为有效约束且存在 `dsh.bundle`。tarball 按插件 ID、版本和 SHA-256 存入持久卷，数据库保存 SHA-256、npm SRI integrity、包元数据和发布状态。目录接口只返回已发布插件在该用户套餐下的最新已发布版本。

### D11 M-B4 registry 授权

registry 端点不接受用户 access token，只接受 install grant 签发的 Bearer token。grant 为服务端 HMAC-SHA256 哈希后存储的 opaque token，绑定用户、插件和版本，默认 10 分钟过期。packument 只返回该 grant 覆盖的版本；tarball 下载前重新校验 SHA-256，并记录 usage event。未授权套餐无法获得 install grant，也无法通过 entitlement 校验。

### D12 M-B5 Workbench 与 Plugin Manager

Workbench 目录通过 Control Plane 登录、刷新 token 并按套餐拉取目录。安装按钮先请求 install grant，再把 grant token 作为 Plugin Manager `installBundle` 的 `authToken` 传入；Plugin Manager 生成一次性 scope 级 `.npmrc`，通过 `NPM_CONFIG_USERCONFIG` 交给 pnpm，安装结束或失败后删除。后端上传插件时校验 `dsh.bundle.patch` 指向的 YAML 必须是顶层数组，避免坏 bundle 进入 registry 后才在安装阶段失败。

Workbench 刷新时会同时读取 Control Plane 目录和 Plugin Manager `listBundles()`，用包名对齐已安装版本；已安装版本低于目录最新版本时显示“更新”。更新前同时为目标版本和当前版本申请 install grant，分别传给 Plugin Manager 的 `authToken` 与 `restoreAuthToken`，目标版本安装失败时可用当前版本 grant 恢复。

### D13 Workbench 插件管理扩展

Workbench 通过 Plugin Manager Remote 支持已安装插件的启用、停用和卸载，并订阅 `plugin-manager/install-log` 在详情页展示最近一次安装命令与输出。目录端新增搜索、分类过滤和图标展示；Control Plane 提供当前套餐可见的用户侧版本历史接口，详情页按版本展示发布说明。
