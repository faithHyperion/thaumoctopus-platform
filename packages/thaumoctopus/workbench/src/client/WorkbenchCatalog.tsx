/** Control Plane sign-in and the plugin catalog shown on the Workbench page. */
import { useEffect, useMemo, useState } from 'react'
import {
  IconCloseOutlineRegular,
  IconCordisPluginOutlineRegular,
  IconCodeOutlineRegular,
  IconDownloadOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconPauseOutlineRegular,
  IconPlayOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconTrashOutlineRegular,
  IconUserOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import semver from 'semver'
import type { CatalogItem } from './control-plane.ts'
import type {
  WorkbenchCatalogState, WorkbenchOperationState, WorkbenchPackageAction,
} from './catalog-controller.ts'
import css from './WorkbenchPage.module.css'

interface WorkbenchCatalogProps extends PropsLocale<'workbench'> {
  readonly useCatalog: <S>(selector: (state: WorkbenchCatalogState) => S) => S
  readonly openablePluginIds: ReadonlySet<string>
  readonly openTile: (pluginId: string) => void
  readonly login: (email: string, password: string) => Promise<void>
  readonly logout: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly install: (item: CatalogItem) => Promise<void>
  readonly update: (item: CatalogItem) => Promise<void>
  readonly setEnabled: (item: CatalogItem, enabled: boolean) => Promise<void>
  readonly uninstall: (item: CatalogItem) => Promise<void>
  readonly select: (pluginId: string | undefined) => Promise<void>
}

const DEFAULT_EMAIL = process.env.DSH_CLIENT_THAUMOCTOPUS_DEFAULT_EMAIL ?? ''
const DEFAULT_PASSWORD = process.env.DSH_CLIENT_THAUMOCTOPUS_DEFAULT_PASSWORD ?? ''

export function WorkbenchCatalog({
  useCatalog, openablePluginIds, openTile, login, logout, refresh, install, update, setEnabled, uninstall, select, t,
}: WorkbenchCatalogProps) {
  const state = useCatalog(snapshot => snapshot)
  const [email, setEmail] = useState(DEFAULT_EMAIL)
  const [password, setPassword] = useState(DEFAULT_PASSWORD)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [failedIcons, setFailedIcons] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => { void refresh() }, [refresh])

  const categories = useMemo(() => {
    const values = new Set<string>()
    for (const item of state.items) {
      for (const value of item.categories) values.add(value)
    }
    return [...values].sort((left, right) => left.localeCompare(right))
  }, [state.items])

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return state.items.filter((item) => {
      if (category !== 'all' && !item.categories.includes(category)) return false
      if (query === '') return true
      return item.displayName.toLowerCase().includes(query)
        || item.description.toLowerCase().includes(query)
        || item.packageName.toLowerCase().includes(query)
    })
  }, [category, search, state.items])

  const selectedItem = state.selectedPluginId === undefined
    ? undefined
    : state.items.find(item => item.pluginId === state.selectedPluginId)

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
          : (
            <>
              <div className={css.catalogFilters}>
                <label className={css.searchField}>
                  <IconSearchOutlineRegular size={14} />
                  <input
                    type="search"
                    value={search}
                    placeholder={t('searchPlaceholder')}
                    onChange={(event) => { setSearch(event.target.value) }}
                  />
                </label>
                <label className={css.categoryField}>
                  <span>{t('categoryLabel')}</span>
                  <select value={category} onChange={(event) => { setCategory(event.target.value) }}>
                    <option value="all">{t('allCategories')}</option>
                    {categories.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              {visibleItems.length === 0
                ? <p className={css.catalogHint}>{t('noMatchingPlugins')}</p>
                : (
                  <div className={css.catalogGrid}>
                    {visibleItems.map((item) => {
                      const installed = state.installedStates[item.packageName]
                      const action = packageAction(item.version, installed?.version)
                      const operation = state.operationStates[item.pluginId]
                      const running = operation?.phase === 'running'
                      const openable = installed?.enabled === true && openablePluginIds.has(item.pluginId)
                      return (
                        <article className={css.catalogCard} key={item.pluginId}>
                          <div className={css.cardHeader}>
                            <div className={css.cardIdentity}>
                              <span className={css.cardIcon}>
                                {item.icon !== '' && !failedIcons.has(item.pluginId)
                                  ? (
                                    <img
                                      src={item.icon}
                                      alt=""
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={() => { setFailedIcons(current => new Set([...current, item.pluginId])) }}
                                    />
                                  )
                                  : <IconCordisPluginOutlineRegular size={22} />}
                              </span>
                              <h3>{item.displayName}</h3>
                            </div>
                            <span>
                              {installed !== undefined && installed.version !== item.version
                                ? `${installed.version} → ${item.version}`
                                : installed?.version ?? item.version}
                            </span>
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

                          {installed !== undefined && (
                            <span className={`${css.stateTag} ${installed.enabled ? css.enabled : css.disabled}`}>
                              {installed.enabled ? t('enabled') : t('disabled')}
                            </span>
                          )}

                          <div className={css.cardActions}>
                            {openable && (
                              <button
                                type="button"
                                className={css.installButton}
                                disabled={running}
                                onClick={() => { openTile(item.pluginId) }}
                              >
                                <IconFolderOpenOutlineRegular size={14} />
                                <span>{t('open')}</span>
                              </button>
                            )}
                            {(action === 'install' || action === 'update') && (
                              <button
                                type="button"
                                className={css.installButton}
                                disabled={running}
                                onClick={() => { void (action === 'update' ? update(item) : install(item)) }}
                              >
                                <IconDownloadOutlineRegular size={14} />
                                <span>{operationLabel(action, operation, t)}</span>
                              </button>
                            )}
                            {installed !== undefined && (
                              <>
                                <button
                                  type="button"
                                  className={css.catalogAction}
                                  disabled={running}
                                  onClick={() => { void setEnabled(item, !installed.enabled) }}
                                >
                                  {installed.enabled
                                    ? <IconPauseOutlineRegular size={14} />
                                    : <IconPlayOutlineRegular size={14} />}
                                  <span>{installed.enabled ? t('disable') : t('enable')}</span>
                                </button>
                                <button
                                  type="button"
                                  className={css.catalogAction}
                                  disabled={running}
                                  onClick={() => { void uninstall(item) }}
                                >
                                  <IconTrashOutlineRegular size={14} />
                                  <span>{t('uninstall')}</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className={css.catalogAction}
                              onClick={() => { void select(state.selectedPluginId === item.pluginId ? undefined : item.pluginId) }}
                            >
                              <IconCodeOutlineRegular size={14} />
                              <span>{t('details')}</span>
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}

              {selectedItem !== undefined && (
                <PluginDetails
                  item={selectedItem}
                  state={state}
                  onClose={() => { void select(undefined) }}
                  t={t}
                />
              )}
            </>
          )}
    </section>
  )
}

function PluginDetails({
  item, state, onClose, t,
}: {
  readonly item: CatalogItem
  readonly state: WorkbenchCatalogState
  readonly onClose: () => void
  readonly t: PropsLocale<'workbench'>['t']
}) {
  const versions = state.versionHistories[item.pluginId] ?? []
  const logs = state.logs[item.pluginId] ?? []
  return (
    <section className={css.pluginDetails}>
      <header className={css.detailsHeader}>
        <div>
          <h3>{item.displayName}</h3>
          <p>{item.packageName}</p>
        </div>
        <button type="button" className={css.catalogAction} onClick={onClose}>
          <IconCloseOutlineRegular size={14} />
          <span>{t('close')}</span>
        </button>
      </header>

      <div className={css.detailsColumns}>
        <section>
          <h4>{t('releaseHistory')}</h4>
          {versions.length === 0
            ? <p className={css.catalogHint}>{t('loading')}</p>
            : (
              <ol className={css.versionList}>
                {versions.map(version => (
                  <li key={version.version}>
                    <div className={css.versionHead}>
                      <strong>{version.version}</strong>
                      <span>{version.channel}</span>
                      <time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleDateString()}</time>
                    </div>
                    <p>{version.releaseNotes || t('noReleaseNotes')}</p>
                  </li>
                ))}
              </ol>
            )}
        </section>

        <section>
          <h4>{t('installLogs')}</h4>
          {logs.length === 0
            ? <p className={css.catalogHint}>{t('noInstallLogs')}</p>
            : (
              <div className={css.logList}>
                {logs.map(run => (
                  <article key={run.jobId}>
                    <header>
                      <span>{run.command}</span>
                      {run.exitCode !== undefined && <span>{t('exitCode')} {run.exitCode ?? 'null'}</span>}
                    </header>
                    <pre>{run.output}</pre>
                  </article>
                ))}
              </div>
            )}
        </section>
      </div>
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

function operationLabel(
  action: WorkbenchPackageAction,
  operation: WorkbenchOperationState | undefined,
  t: PropsLocale<'workbench'>['t'],
): string {
  if (operation?.phase === 'running') {
    return operation.type === 'update' ? t('updating') : t('installing')
  }
  if (operation?.phase === 'failed') return action === 'update' ? t('retryUpdate') : t('retryInstall')
  if (operation?.phase === 'restart-required') return t('restartRequired')
  if (action === 'update') return t('update')
  if (action === 'installed') return t('installed')
  return t('install')
}
