export const COLORS = {
  root: '#6C5CE7',
  parent: '#A29BFE',
  subtask: '#00B894',
  link: '#74B9FF',
  confluence: '#B2BEC3',
};

export const LINK_TYPE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  'relates': { color: '#74B9FF', icon: 'lni-link-2-angular-right', label: 'relates' },
  'relates to': { color: '#74B9FF', icon: 'lni-link-2-angular-right', label: 'relates to' },
  'is related to': { color: '#74B9FF', icon: 'lni-link-2-angular-right', label: 'is related to' },
  'relate': { color: '#74B9FF', icon: 'lni-link-2-angular-right', label: 'relate' },
  'blocks': { color: '#E17055', icon: 'lni-ban-2', label: 'blocks' },
  'is blocked by': { color: '#E17055', icon: 'lni-ban-2', label: 'is blocked by' },
  'blocked by': { color: '#E17055', icon: 'lni-ban-2', label: 'blocked by' },
  'clones': { color: '#A29BFE', icon: 'lni-clipboard', label: 'clones' },
  'is cloned by': { color: '#A29BFE', icon: 'lni-file-multiple', label: 'is cloned by' },
  'cloned by': { color: '#A29BFE', icon: 'lni-file-multiple', label: 'cloned by' },
  'duplicates': { color: '#FDCB6E', icon: 'lni-clipboard', label: 'duplicates' },
  'is duplicated by': { color: '#FDCB6E', icon: 'lni-clipboard', label: 'is duplicated by' },
  'duplicated by': { color: '#FDCB6E', icon: 'lni-clipboard', label: 'duplicated by' },
  'causes': { color: '#D63031', icon: 'lni-bolt-2', label: 'causes' },
  'is caused by': { color: '#E17055', icon: 'lni-bolt-2', label: 'is caused by' },
  'caused by': { color: '#E17055', icon: 'lni-bolt-2', label: 'caused by' },
  'epic-story link': { color: '#6C5CE7', icon: 'lni-book-1', label: 'Epic-Story link' },
  'epic link': { color: '#6C5CE7', icon: 'lni-book-1', label: 'Epic link' },
  'depends on': { color: '#E17055', icon: 'lni-ban-2', label: 'depends on' },
  'is dependency of': { color: '#D63031', icon: 'lni-ban-2', label: 'is dependency of' },
  'dependency of': { color: '#D63031', icon: 'lni-ban-2', label: 'dependency of' },
  'implements': { color: '#00CEC9', icon: 'lni-gear-1', label: 'implements' },
  'is implemented by': { color: '#00CEC9', icon: 'lni-gear-1', label: 'is implemented by' },
  'tests': { color: '#6C5CE7', icon: 'lni-microscope', label: 'tests' },
  'is tested by': { color: '#A29BFE', icon: 'lni-microscope', label: 'is tested by' },
  'mentions': { color: '#FD79A8', icon: 'lni-chat-bubble-2', label: 'Mentions' },
  'mentioned in': { color: '#FD79A8', icon: 'lni-chat-bubble-2', label: 'Mentioned in' },
};

export const getLinkTypeConfig = (typeName: string) => {
  const key = typeName.toLowerCase().trim();
  const config = LINK_TYPE_CONFIG[key];
  if (config) return config;
  return { color: '#74B9FF', icon: 'lni-link-2-angular-right', label: typeName };
};

export type DetailLevel = 'minimal' | 'compact' | 'full';

export function getDetailLevel(zoom: number): DetailLevel {
  if (zoom < 0.5) return 'minimal';
  if (zoom < 0.8) return 'compact';
  return 'full';
}

export function getLayoutDimensions(level: DetailLevel) {
  switch (level) {
    case 'minimal':
      return {
        NODE_WIDTH: 120, NODE_HEIGHT: 40, GROUP_WIDTH: 80, GROUP_HEIGHT: 26,
        LEVEL_GAP: 40, GROUP_TO_CARDS: 24, SPLIT_PARENT_EXTRA: 30, TASK_GAP: 50, SIDE_OFFSET: 60,
        NODE_SPACING_V: 8, NODE_SPACING_H: 10, GROUP_SPACING: 24,
      };
    case 'compact':
      return {
        NODE_WIDTH: 200, NODE_HEIGHT: 80, GROUP_WIDTH: 120, GROUP_HEIGHT: 30,
        LEVEL_GAP: 65, GROUP_TO_CARDS: 34, SPLIT_PARENT_EXTRA: 50, TASK_GAP: 80, SIDE_OFFSET: 100,
        NODE_SPACING_V: 12, NODE_SPACING_H: 16, GROUP_SPACING: 36,
      };
    default:
      return {
        NODE_WIDTH: 260, NODE_HEIGHT: 160, GROUP_WIDTH: 140, GROUP_HEIGHT: 35,
        LEVEL_GAP: 100, GROUP_TO_CARDS: 50, SPLIT_PARENT_EXTRA: 80, TASK_GAP: 120, SIDE_OFFSET: 140,
        NODE_SPACING_V: 18, NODE_SPACING_H: 24, GROUP_SPACING: 50,
      };
  }
}

export function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('готово') || s.includes('closed')) return '#00B894';
  if (s.includes('progress') || s.includes('работе') || s.includes('review')) return '#6C5CE7';
  if (s.includes('blocked') || s.includes('заблокирован')) return '#E17055';
  return '#636E72';
}

export function getTypeIcon(issueType: string): string {
  const t = issueType.toLowerCase();
  if (t.includes('bug') || t.includes('баг')) return 'lni-bug-1';
  if (t.includes('story') || t.includes('истори')) return 'lni-book-1';
  if (t.includes('epic') || t.includes('эпик')) return 'lni-bolt-2';
  if (t.includes('sub-task') || t.includes('subtask') || t.includes('подзадач')) return 'lni-paperclip-1';
  if (t.includes('task') || t.includes('задач')) return 'lni-check-circle-1';
  return 'lni-bookmark-1';
}
