/** `sidebar` namespace dictionaries for Story and Workspace navigation shells. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'story.new': '新故事',
  'story.new.label': '创建新故事',
  'session.new': '新会话',
  'session.new.label': '新建会话',
  'toggle.open': '打开侧边栏',
  'toggle.collapse': '收起侧边栏',
} satisfies Record<string, string>

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'story.new': 'New Story',
  'story.new.label': 'Create new story',
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
} satisfies Record<SidebarKey, string>
