/** Workbench panel copy. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workbench'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  panel: '工作台',
  intro: '从这里开始使用常用功能',
  empty: '还没有可用的功能',
  catalogTitle: '插件目录',
  email: '邮箱',
  password: '密码',
  signIn: '登录',
  signOut: '退出',
  loading: '加载中',
  refresh: '刷新',
  catalogEmpty: '当前套餐暂无可用插件',
  planLabel: '套餐',
  dshLabel: 'DSH',
  install: '安装',
  installing: '安装中',
  installed: '已安装',
  update: '更新',
  updating: '更新中',
  restartRequired: '重启后生效',
  retryInstall: '重试安装',
  retryUpdate: '重试更新',
} satisfies Record<string, string>

/** The workbench namespace key union. */
export type WorkbenchKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  panel: 'Workbench',
  intro: 'Start here with the features you use most',
  empty: 'No features are available yet',
  catalogTitle: 'Plugin catalog',
  email: 'Email',
  password: 'Password',
  signIn: 'Sign in',
  signOut: 'Sign out',
  loading: 'Loading',
  refresh: 'Refresh',
  catalogEmpty: 'No plugins are available for this plan',
  planLabel: 'Plan',
  dshLabel: 'DSH',
  install: 'Install',
  installing: 'Installing',
  installed: 'Installed',
  update: 'Update',
  updating: 'Updating',
  restartRequired: 'Restart required',
  retryInstall: 'Retry install',
  retryUpdate: 'Retry update',
} satisfies Record<WorkbenchKey, string>
