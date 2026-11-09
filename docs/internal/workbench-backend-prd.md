# 工作台后端 PRD

版本：v0.2 草案
日期：2026-11-03
状态：待评审
关联：外层 `thaumoctopus-platform-plan.md`（§7 工作台、§8 Control Plane、§10 授权、§11 registry）

## 1. 背景与目标

工作台前端壳（`packages/thaumoctopus/workbench`）已落地，插件目录页需要网络数据源。本文档定义独立部署的工作台后端（即方案中的 Control Plane MVP）：提供插件目录、用户认证、授权验证与安装授权，配套一个管理端页面，让运营能发布插件、管理用户。

目标：

1. 一个可独立部署到服务器的 Go 服务（单二进制 + PostgreSQL）；
2. 工作台页面能从服务端获取插件目录（按用户套餐过滤）；
3. 用户点击插件时，服务端实时判定是否有权使用/安装；
4. 管理员通过管理端页面发布插件、管理用户与可见性；
5. 交付可运行的 Docker 镜像与 Docker Compose 部署文件，`docker compose up -d` 即可完成单机部署；
6. 为方案 Phase 4（收费闭环）预留配额与用量接口。

非目标（本期不做）：支付与订单、管理后台的运营报表、离线 license、开放第三方插件上传、多租户。

## 2. 角色与系统边界

```text
终端用户（工作台 UI）──HTTPS──▶ 工作台后端（本服务）
管理员（管理端页面）──HTTPS──▶ 工作台后端
工作台后端 ──提供──▶ 插件下载（npm registry 协议，只读）
DSH Plugin Manager ◀──pnpm install── 用户机器
```

业务插件源码不在本服务内；本服务只管理插件元数据、可见性与分发授权。

## 3. 功能需求

### 3.1 用户与认证

- 邮箱 + 密码登录（MVP）；账号由管理端创建，自助注册后置；
- 签发短期 access token（JWT，默认 15 分钟）+ refresh token（默认 30 天）；
- `GET /v1/me`：当前用户、套餐、状态。

### 3.2 插件目录

- `GET /v1/workbench/catalog`：返回当前用户可见的插件目录（方案 §8.3 目录对象：pluginId、packageName、displayName、description、icon、version、plans、state 等）；
- 目录 = 管理端标记为"已发布 + 对该用户套餐可见"的插件集合；
- 未登录返回 401；工作台 UI 收到 401 时显示登录入口。

### 3.3 授权验证与安装授权

- `POST /v1/entitlements/validate`：插件执行收费能力前调用（方案 §10.3），入参 pluginId + feature，返回允许/拒绝与原因；
- `POST /v1/registry/install-grants`：用户点击"安装"后调用，校验套餐/授权后签发短期、单插件的下载凭证（方案 §8.4：绑定用户、可撤销、默认 10 分钟有效）；
- 安装授权返回 `registryUrl`、npm 包名、目标版本与一次性 registry token；
- DSH Plugin Manager 将 token 以 npm 标准的 `Authorization: Bearer <token>` 请求头发给 registry，不在 URL 中携带；
- Plugin Manager 为单次安装生成临时 npm 配置（`NPM_CONFIG_USERCONFIG` 指向临时 `.npmrc`），只在进程内保存，安装结束或失败后删除；
- `entitlements/validate` 由 Platform Bridge 代表用户调用，携带 Workbench 登录态中的短期 access token；插件自身不持有长期凭证。

### 3.4 插件包分发（registry 端点）

推荐方案：**本服务内建只读 npm registry 端点**，不额外部署 Verdaccio。

- 管理端上传插件 tarball（`npm pack` 产物）后，本服务存储并提供 npm 协议的两个只读接口：packument（版本元数据）与 tarball 下载；
- DSH Plugin Manager 以 `http://<server>/registry/` 为安装源，配合短期凭证完成 `pnpm install`；
- registry 授权使用 install-grants 签发的短期 token，兼容 npm `_authToken` 的 Bearer 语义；
- 版本发布后不可覆盖；tarball 上传时计算 SHA-256，下载时校验并记录审计事件；
- 好处：部署单元只有一个服务，发布链路全部收口在管理端，用户侧无需理解 npm。

备选方案：独立 Verdaccio。仅在自建端点遇到协议兼容问题时启用。

### 3.5 用户管理（管理端）

- 用户列表：邮箱、套餐、状态、注册时间；
- 启用 / 禁用用户；
- 调整用户套餐（Free / Pro / Enterprise，MVP 手工指定）。

### 3.6 插件管理（管理端）

- 插件列表与详情：名称、displayName、描述、图标、分类、可见套餐；
- 版本管理：上传新版本 tarball、标记 latest、下架某版本；
- 目录可见性：发布 / 下架（下架后目录接口不再返回，已安装用户不影响使用，配合 §10 的服务端校验控制继续使用）。

## 4. 数据模型（草案）

```text
users            (id, email, password_hash, plan, role, status, created_at, updated_at)
refresh_tokens   (id, user_id, token_hash, expires_at, revoked_at, created_at)
plugins          (id, plugin_id, package_name, display_name, description, icon_url,
                  categories, state, created_at, updated_at)
plugin_versions  (id, plugin_id, version, channel, tarball_ref, tarball_sha256,
                  tarball_size, release_notes, state, created_at)
plan_visibility  (plugin_id, plan)
install_grants   (id, user_id, plugin_id, version, token_hash, expires_at,
                  revoked_at, created_at)
usage_events     (id, user_id, plugin_id, feature, event_type, occurred_at)
audit_events     (id, actor_type, actor_id, action, target, details, occurred_at)
```

说明：

- `users.role` 区分 `user` 与 `admin`；MVP 由管理端建号，首个管理员由部署时的 bootstrap 配置创建；
- `refresh_tokens` 只保存哈希，支持登出、撤销与设备/会话后续扩展；
- `tarball_ref` 指向本地持久卷中的对象路径；`tarball_sha256` 用于版本不可变校验；
- `usage_events` 预留配额与用量闭环，MVP 只写不查；
- `user_entitlements`（按用户覆盖套餐授权）暂不建表，Phase 4 收费闭环前再评估。

## 5. API 草案

```http
POST /v1/auth/register          -- MVP 可先由管理端建号，接口后置
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/me
GET  /v1/workbench/catalog
POST /v1/entitlements/validate
POST /v1/registry/install-grants
GET  /registry/:scope/:name     -- npm packument（需凭证）
GET  /registry/:scope/:name/-/:tarball -- tarball 下载（需凭证）
GET  /healthz                   -- 存活检查，不依赖数据库
GET  /readyz                    -- 就绪检查，校验数据库连接与迁移状态

-- 管理端（admin token）
GET    /admin/users             PATCH /admin/users/:id
GET    /admin/plugins           POST /admin/plugins
POST   /admin/plugins/:id/versions   -- 上传 tarball
PATCH  /admin/plugins/:id/visibility
```

约束：

- API 统一返回 JSON；业务错误包含稳定的 `code` 与用户可读的 `message`；
- 管理端接口要求 `users.role = admin`，与普通用户使用同一套 access token 机制；
- tarball 上传走 `multipart/form-data`，服务端限制单文件大小并校验 npm 包结构、包名与版本一致性。

## 6. 技术选型

| 项 | 选择 | 说明 |
|---|---|---|
| 语言/框架 | Go + Gin | 单二进制部署，团队指定 Go |
| 数据库 | PostgreSQL + pgx | 并发与管理端场景优于 SQLite |
| 数据库迁移 | golang-migrate | 版本化 SQL 迁移，服务启动前自动执行 |
| 认证 | access token 使用 JWT；refresh token 为不可猜测随机值 | 密码哈希使用 argon2id；refresh token 哈希前先加服务端密钥 |
| 管理端 | React + Vite + Ant Design | 位于独立后端项目的 `web/admin`，构建产物嵌入 Go 二进制 |
| 插件存储 | 本地文件系统持久卷 | MVP 不引入对象存储，`tarball_ref` 保留后续替换为 S3 的空间 |
| 部署 | Docker 镜像 + Docker Compose | 服务 + PostgreSQL，单机即可起步 |

## 7. Docker 部署要求

### 7.1 交付物

- 独立项目 `workbench-backend/Dockerfile`：多阶段构建，先构建管理端静态资源与 Go 二进制，再产出最小运行镜像；
- `workbench-backend/deploy/docker-compose.yml`：包含 `workbench-backend` 与 `postgres` 两个服务；
- `workbench-backend/deploy/.env.example`：列出全部必需与可选环境变量；
- `workbench-backend/README.md`：部署、升级、备份与恢复操作说明；
- 镜像内不包含数据库数据、插件 tarball、JWT 密钥或管理员初始密码。

管理端静态资源通过 Go `embed` 打进二进制。容器内只有一个服务进程，API、管理端页面与 registry 端点共用 `8080` 端口。

### 7.2 运行拓扑

```text
浏览器 / DSH Plugin Manager
        │ HTTPS
        ▼
反向代理（生产环境，负责 TLS）
        │ HTTP
        ▼
workbench-backend ──/data/tarballs──▶ plugin-tarballs 卷
        │
        ▼
postgres ──/var/lib/postgresql/data──▶ postgres-data 卷
```

MVP Compose 不强制内置反向代理，默认将 `workbench-backend` 的 `8080` 端口映射到宿主机；生产环境必须由反向代理提供 HTTPS，并将 `X-Forwarded-For` / `X-Forwarded-Proto` 传给服务。若用户没有现成网关，可在部署文档中提供可选 Caddy 配置。

PostgreSQL 只在 Compose 网络内暴露，不映射宿主机端口。

### 7.3 持久化与不可变约束

- `postgres-data` 卷保存用户、插件元数据、授权与审计数据；
- `plugin-tarballs` 卷保存已发布 tarball，路径由 `tarball_ref` 引用；
- tarball 文件名包含包名、版本与 SHA-256，上传完成后不再修改或覆盖；
- 数据库迁移和服务升级不得删除卷；删除卷等同于清空平台数据；
- 备份必须同时覆盖 PostgreSQL 逻辑备份与 `plugin-tarballs` 卷，并在部署文档中给出恢复演练命令。

### 7.4 健康检查与启动顺序

- `postgres` 使用 `pg_isready` 作为容器 healthcheck；
- `workbench-backend` 设置 `depends_on: postgres: condition: service_healthy`；
- 服务启动时先执行数据库迁移，再启动 HTTP listener；
- 迁移使用 PostgreSQL advisory lock 防止多实例或重启时并发迁移；
- `GET /healthz` 用于容器存活检查，不访问数据库；
- `GET /readyz` 用于就绪检查，校验数据库连接与迁移状态。

### 7.5 配置项

| 环境变量 | 必填 | 默认值 | 说明 |
|---|---:|---|---|
| `PORT` | 否 | `8080` | HTTP 监听端口 |
| `DATABASE_URL` | 是 | - | PostgreSQL 连接串 |
| `PUBLIC_BASE_URL` | 是 | - | 对外访问地址，用于生成 registry URL，例如 `https://dsh.example.com` |
| `JWT_ACCESS_SECRET` | 是 | - | access token 签名密钥 |
| `REFRESH_TOKEN_SECRET` | 是 | - | refresh token 哈希 pepper |
| `PLUGIN_STORAGE_DIR` | 否 | `/data/tarballs` | tarball 持久卷路径 |
| `ACCESS_TOKEN_TTL` | 否 | `15m` | access token 有效期 |
| `REFRESH_TOKEN_TTL` | 否 | `720h` | refresh token 有效期 |
| `INSTALL_GRANT_TTL` | 否 | `10m` | 安装授权有效期 |
| `ADMIN_EMAIL` | 是 | - | 首个管理员邮箱，仅在用户不存在时创建 |
| `ADMIN_INITIAL_PASSWORD` / `ADMIN_INITIAL_PASSWORD_FILE` | 二选一 | - | 首个管理员初始密码；生产优先使用 `_FILE` |
| `MAX_TARBALL_SIZE` | 否 | `104857600` | 单个 tarball 上传上限，默认 100 MiB |
| `GIN_MODE` | 否 | `release` | Gin 运行模式 |
| `LOG_LEVEL` | 否 | `info` | 日志级别 |
| `TRUSTED_PROXIES` | 否 | 空 | 反向代理网段，用于正确解析客户端 IP |

`.env` 只用于本地和单机试用；生产环境建议通过部署平台的 secret 机制注入密钥。首次管理员 bootstrap 必须是幂等操作：用户已存在时不修改密码、不提升角色。

### 7.6 镜像与升级

- 运行镜像使用非 root 用户；
- 服务日志输出 stdout/stderr，不写容器内日志文件；
- Compose 为服务设置内存与 CPU 限制，数值在部署文档中给出可调示例；
- 升级流程为 `docker compose pull && docker compose up -d`；
- 升级验收必须验证：容器健康、迁移版本前进、旧用户可登录、旧 tarball 仍可按原 SHA-256 下载、已发布版本未被覆盖；
- 回滚镜像前先备份数据库；只允许回滚到兼容当前 schema 的版本。

### 7.7 部署验收

MVP 完成时必须在干净服务器上通过以下流程：

1. 准备 `deploy/.env`，填入域名、数据库连接、密钥与首个管理员配置；
2. 执行 `docker compose up -d`，两个容器均变为 healthy；
3. 通过反向代理访问管理端，使用 bootstrap 管理员登录并修改初始密码；
4. 上传一个测试插件版本，并用短期 install grant 从 `https://<domain>/registry/` 完成 `pnpm install`；
5. 执行 `docker compose restart`，确认用户、插件元数据与 tarball 均未丢失；
6. 执行一次镜像升级演练，确认迁移版本前进且旧版本插件仍可下载。

## 8. 里程碑

1. **M-B1 服务骨架（已完成）**：Go 工程 + PG 迁移 + 健康检查 + Dockerfile + Compose 部署；验收为干净机器上 Compose 启动后 `/healthz`、`/readyz` 通过，重启后卷数据保留；
2. **M-B2 认证 + 用户管理（已完成）**：bootstrap 管理员、argon2id 密码哈希、JWT access token、可轮换 refresh token、`/v1/me`、用户管理 API、审计事件与管理端用户页；
3. **M-B3 插件目录（已完成）**：插件/版本模型、tarball 结构校验、不可变存储、管理端插件页与 `catalog` 接口；
4. **M-B4 registry 端点 + 安装授权（已完成）**：tarball 上传/分发 + install-grants + validate；验收为容器化环境中可完成 `pnpm install`；
5. **M-B5 与工作台联调（已完成）**：按外层工作台计划第 5-6 步完成端到端闭环；验收从 Docker 部署环境登录、浏览目录、安装并运行测试插件。Workbench 会同步 Plugin Manager 的已安装版本，目录中按状态显示安装 / 更新 / 已安装，并通过短期 grant 调用 Plugin Manager 的更新与失败回滚链路。

## 9. 已定与待确认

已定：

1. 插件发布采用"管理端上传 tarball + 内建只读 registry 端点"，不部署 Verdaccio；
2. 管理端使用 React + Vite + Ant Design；
3. MVP 用户账号由管理端创建，自助注册接口后置；
4. MVP 必须交付 Docker 镜像与 Compose 部署，PostgreSQL 数据和 tarball 存储使用持久卷。

待确认：

1. 生产环境的对外域名与 TLS 终止方式（已有 Nginx/Caddy，还是希望 Compose 内置可选网关）；
2. 单机部署的资源规格与并发预期，用于确定 Compose 资源限制默认值；
3. 备份策略由部署方自行承担，还是后续增加管理端备份/恢复页面。
