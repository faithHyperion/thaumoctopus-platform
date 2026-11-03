/** Workbench panel copy. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workbench'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  panel: '工作台',
  intro: '从这里开始使用常用功能',
  empty: '还没有可用的功能',
} satisfies Record<string, string>

/** The workbench namespace key union. */
export type WorkbenchKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  panel: 'Workbench',
  intro: 'Start here with the features you use most',
  empty: 'No features are available yet',
} satisfies Record<WorkbenchKey, string>
