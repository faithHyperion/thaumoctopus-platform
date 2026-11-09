# Thaumoctopus Platform

Thaumoctopus（章鱼智能体）品牌化 DSH 底座。产品形态是「薄底座 + Workbench + Platform Bridge」，业务能力全部放在独立的插件仓库（`thaumoctopus-plugins`），不在本仓库堆业务代码。

完整实施方案见本仓库外层的 `thaumoctopus-platform-plan.md`（产品基准线，不是进度文档），关键决策记录见 `docs/internal/platform-decisions.md`。

## 目录

```text
thaumoctopus-platform/
  branding/                 品牌资产与产品配置（product.json、logo.svg）
  profiles/thaumoctopus/    Thaumoctopus 默认 DSH profile
  packages/thaumoctopus/    第一方产品插件（workbench、platform-bridge）
  scripts/thaumoctopus/     产品脚本（set-brand.mjs、start-web.mjs）
  docs/internal/            内部决策记录
```

## 当前状态

仓库已在干净的 DSH `master` 基线上重建，产品层（Phase 1 骨架）包含：

- 品牌配置与校验脚本；
- 默认 profile（cordis 根配置 + 补丁层 + bundle 清单）；
- 独立 `DSH_HOME` 启动器；
- `@thaumoctopus/workbench`、`@thaumoctopus/platform-bridge` 占位包（实现分别在 Phase 2 / Phase 3 落地）。

以下内容待补全：

- `favicon.ico`、`installer-banner.png` 等位图资产；
- Windows 安装器构建链路（Phase 1 后半段）；
- Web / Desktop 展示名的深度品牌化（当前仅 `DSH_CLIENT_TITLE`，桌面侧未接）。

注意：根目录的 `README.md`、`package.json`、`pnpm-workspace.yaml`、`.gitignore` 属于 DSH 底座，同步上游时保持原样；Thaumoctopus 产品层全部收敛在 `branding/`、`profiles/thaumoctopus/`、`packages/thaumoctopus/`、`scripts/thaumoctopus/`、`docs/internal/` 和本文件中。

## 脚本

```bash
node scripts/thaumoctopus/set-brand.mjs --check   # 校验 branding/product.json 产品配置
node scripts/thaumoctopus/start-web.mjs           # 独立 DSH_HOME + 默认 profile 启动 Web UI
pnpm run dev:thaumoctopus                         # 开发循环：重建 watcher + 品牌服务
pnpm run build:thaumoctopus                       # 本地验证构建（登录框预填管理员账号）
```

`start-web.mjs` 首次运行会把仓库里的 profile 复制到 `%LOCALAPPDATA%\Thaumoctopus\dsh-home\profiles\thaumoctopus`，之后用户态修改留在 dsh-home，不回写仓库。

本地验证时，`pnpm run build:thaumoctopus` 会把 `admin@example.com` 和本地开发密码写进 Workbench 登录框的默认值；生产构建不要使用这个脚本。

Workbench 会显示插件目录的安装、更新和已安装状态。刷新时会从 Plugin Manager 读取已安装版本；目录版本更新后，卡片会显示“更新”，更新失败时会尝试恢复原版本。

### 开发调试

边开发边看效果用 `pnpm run dev:thaumoctopus`：它同时跑仓库标准重建 watcher（tsc / tsdown / vite）和品牌 profile 服务，改 `src/client` 插件代码、品牌 slot 或 Web shell 后浏览器自动刷新。一次启动挂整个开发时段，不是每个功能一条命令。首次使用前先完整构建一次（`pnpm run build`），之后冷启动大改动加 `--full-build`。注意 dev 循环运行期间不要再跑 `pnpm run build`，两者写同一批 `lib/` 产物。

## 下一步

1. Phase 1 收尾：Windows 安装器链路、位图品牌资产。
2. Phase 2：Workbench MVP（插件目录、DSH Plugin Manager 集成）。
3. Phase 3：Platform Bridge + Control Plane MVP（登录、entitlement、配额）。
