/** Control Plane sign-in and the plugin catalog shown on the Workbench page. */
import { useEffect, useState } from 'react'
import {
  IconCordisPluginOutlineRegular,
  IconDownloadOutlineRegular,
  IconRefreshOutlineRegular,
  IconUserOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import semver from 'semver'
import type { CatalogItem } from './control-plane.ts'
import type { WorkbenchCatalogState, WorkbenchInstallStatus, WorkbenchPackageAction } from './catalog-controller.ts'
import css from './WorkbenchPage.module.css'

interface WorkbenchCatalogProps extends PropsLocale<'workbench'> {
  readonly useCatalog: <S>(selector: (state: WorkbenchCatalogState) => S) => S
  readonly login: (email: string, password: string) => Promise<void>
  readonly logout: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly install: (item: CatalogItem) => Promise<void>
  readonly update: (item: CatalogItem) => Promise<void>
}

const DEFAULT_EMAIL = process.env.DSH_CLIENT_THAUMOCTOPUS_DEFAULT_EMAIL ?? ''
const DEFAULT_PASSWORD = process.env.DSH_CLIENT_THAUMOCTOPUS_DEFAULT_PASSWORD ?? ''

export function WorkbenchCatalog({ useCatalog, login, logout, refresh, install, update, t }: WorkbenchCatalogProps) {
  const state = useCatalog(snapshot => snapshot)
  const [email, setEmail] = useState(DEFAULT_EMAIL)
  const [password, setPassword] = useState(DEFAULT_PASSWORD)

  useEffect(() => { void refresh() }, [refresh])

  return (
    <section className={css.catalog} aria-labelledby="workbench-catalog-title">
      <div className={css.catalogHeader}>
        <h2 className={css.catalogTitle} id="workbench-catalog-title">
          <IconCordisPluginOutlineRegular size={16} />
          <span>{t('catalogTitle')}</span>
        </h2>
        {state.user !== undefined && (
          <div className={css.catalogAccount}>
            <span className={css.accountLabel}>
              <IconUserOutlineRegular size={14} />
              <span>{state.user.email}</span>
            </span>
            <span className={css.planTag}>{state.user.plan}</span>
            <button type="button" className={css.catalogAction} onClick={() => { void refresh() }}>
              <IconRefreshOutlineRegular size={14} />
              <span>{t('refresh')}</span>
            </button>
            <button type="button" className={css.catalogAction} onClick={() => { void logout() }}>
              <span>{t('signOut')}</span>
            </button>
          </div>
        )}
      </div>

      {state.message !== undefined && <p className={css.catalogMessage} role="alert">{state.message}</p>}

      {state.user === undefined
        ? (
          <form
            className={css.loginForm}
            onSubmit={(event) => {
              event.preventDefault()
              void login(email, password)
            }}
          >
            <label>
              <span>{t('email')}</span>
              <input type="email" value={email} onChange={(event) => { setEmail(event.target.value) }} required />
            </label>
            <label>
              <span>{t('password')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => { setPassword(event.target.value) }}
                autoComplete="current-password"
                required
              />
            </label>
            <button className={css.loginButton} type="submit" disabled={state.status === 'loading'}>
              <IconUserOutlineRegular size={14} />
              <span>{state.status === 'loading' ? t('loading') : t('signIn')}</span>
            </button>
          </form>
        )
        : state.status === 'loading'
          ? <p className={css.catalogHint}>{t('loading')}</p>
          : state.items.length === 0
            ? <p className={css.catalogHint}>{t('catalogEmpty')}</p>
            : (
              <div className={css.catalogGrid}>
                {state.items.map((item) => {
                  const installedVersion = state.installedVersions[item.packageName]
                  const action = packageAction(item.version, installedVersion)
                  return (
                    <article className={css.catalogCard} key={item.pluginId}>
                      <div className={css.cardHeader}>
                        <h3>{item.displayName}</h3>
                        <span>{installedVersion ?? item.version}</span>
                      </div>
                      <p>{item.description}</p>
                      <dl className={css.cardFacts}>
                        <div>
                          <dt>{t('planLabel')}</dt>
                          <dd>{item.plans.join(', ')}</dd>
                        </div>
                        <div>
                          <dt>{t('dshLabel')}</dt>
                          <dd>{item.minDsh}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className={css.installButton}
                        disabled={state.installStates[item.pluginId] === 'installing' || action === 'installed'}
                        onClick={() => { void (action === 'update' ? update(item) : install(item)) }}
                      >
                        <IconDownloadOutlineRegular size={14} />
                        <span>{actionLabel(action, state.installStates[item.pluginId], t)}</span>
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
    </section>
  )
}

function packageAction(
  catalogVersion: string,
  installedVersion: string | undefined,
): WorkbenchPackageAction {
  if (installedVersion === undefined) return 'install'
  return semver.lt(installedVersion, catalogVersion) ? 'update' : 'installed'
}

function actionLabel(
  action: WorkbenchPackageAction,
  status: WorkbenchInstallStatus | undefined,
  t: PropsLocale<'workbench'>['t'],
): string {
  if (status === 'installing') return action === 'update' ? t('updating') : t('installing')
  if (status === 'applied') return t('installed')
  if (status === 'restart-required') return t('restartRequired')
  if (status === 'failed') return action === 'update' ? t('retryUpdate') : t('retryInstall')
  if (action === 'update') return t('update')
  if (action === 'installed') return t('installed')
  return t('install')
}
