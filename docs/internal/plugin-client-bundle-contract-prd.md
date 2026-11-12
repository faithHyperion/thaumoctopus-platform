# Plugin Client Bundle Contract PRD

## Background

`@thaumoctopus/plugin-thesis@0.1.1` installs successfully, but its Workbench entry does not load. The browser console reports:

```text
Uncaught Error: Dynamic require of "@deepseek-ai/dsh-client-store" is not supported
```

The Host provides `@deepseek-ai/dsh-client-store` in the browser module table. The failure is caused by the plugin's client artifact shape, not by Workbench installation or entitlement.

## Problem

The current thesis client build emits an esbuild IIFE:

```js
var __ThaumoctopusPluginThesisFactory = (() => {
  // ...
  var __require = /* fallback that throws */
  __require("@deepseek-ai/dsh-client-store")
  // ...
})()
```

DSH dynamic client bundles must instead register a factory that receives the platform `require` function:

```js
window.__ModuleLoader__.load({
  id: "@thaumoctopus/plugin-thesis",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    require("@deepseek-ai/dsh-client-store")
    // ...
    return module.exports
  }
})
```

The IIFE ignores the loader-provided `require` and falls back to a Node-style global `require`. Browsers do not provide that global, so the first external module request throws.

## Requirements

1. Replace the IIFE client output with the DSH dynamic-client bundle contract:
   - call `window.__ModuleLoader__.load`
   - provide the package name as `id`
   - provide `factory: (require) => { ... }`
   - return `module.exports` from the factory
2. Preserve external requests as direct `require("<specifier>")` calls.
3. Keep these baseline modules external; the shell provides them:
   - `react`
   - `react/jsx-runtime`
   - `react-dom`
   - `react-dom/client`
   - `@deepseek-ai/cordis`
   - `zod`
   - `@tanstack/react-virtual`
   - `@deepseek-ai/dsh-client-store`
   - `@deepseek-ai/dsh-client-ui-slots`
   - `@deepseek-ai/dsh-client-ui-primitives`
   - `@deepseek-ai/dsh-client-ui-dockkit`
4. Add exact entries under `dsh.client.external` only for non-baseline dynamic module rows that the plugin needs at runtime.
5. Do not use `dsh.client.inject` as the external-module declaration. `inject` is informational; `external` defines module-table requests.
6. Publish the fix as a new plugin version, for example `0.1.2`.

## Acceptance Criteria

1. `lib/client.js` starts with a `window.__ModuleLoader__.load` registration.
2. The registration contains `factory: (require) =>`.
3. `@deepseek-ai/dsh-client-store` is loaded through the loader-provided `require`, not an IIFE fallback.
4. Installing the new version from Workbench succeeds.
5. The Workbench card no longer shows `Entry not loaded`.
6. The Workbench card shows `Open`.
7. Clicking `Open` opens the thesis page.
8. The browser console no longer reports `Dynamic require of "@deepseek-ai/dsh-client-store" is not supported`.

## Verification

Run in the plugin repository:

```powershell
pnpm --filter @thaumoctopus/plugin-thesis build
pnpm --filter @thaumoctopus/plugin-thesis test
pnpm --filter @thaumoctopus/plugin-thesis pack
```

Inspect the generated `lib/client.js` before upload. Then upload the new tarball to Workbench, update the installed plugin, and verify the Workbench entry in the browser.
