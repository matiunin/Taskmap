import { createContext } from 'react';
import { JiraIssue, TaskData } from '../../types';
import { PendingChange } from '../../hooks/usePendingChanges';

export interface SelectedCard {
  nodeId: string;
  taskId: string;
  issueKey: string;
  issue: JiraIssue;
  nodeType: 'root' | 'parent' | 'subtask' | 'link';
  linkId?: string;
  linkType?: string;
}

export interface CardDragInfo {
  issueKey: string;
  issue: JiraIssue;
  taskId: string;
  nodeType: string;
  linkId?: string;
}

export const ZoomContext = createContext<number>(1);

interface DragContextType {
  draggedNode: string | null;
  dropTarget: string | null;
  setDropTarget: (target: string | null) => void;
}
export const DragContext = createContext<DragContextType>({ draggedNode: null, dropTarget: null, setDropTarget: () => {} });

interface GhostDragContextType {
  onCardMouseDown: (e: React.MouseEvent, cardInfo: CardDragInfo) => void;
  isDragging: boolean;
}
export const GhostDragContext = createContext<GhostDragContextType>({ onCardMouseDown: () => {}, isDragging: false });
export type { GhostDragContextType };

interface LinkChangeContextType {
  onChangeLinkType: (taskId: string, issueKey: string, currentType: string, linkId: string) => void;
  onDeleteLink: (taskId: string, linkId: string, issueKey: string) => void;
  onLoadTask: (issueKey: string, taskId?: string) => void;
  onDeleteIssue: (taskId: string, issueKey: string) => void;
  onDropToGroup: (taskId: string, issueKey: string, linkId: string, sourceType: string, targetType: string) => void;
  onCreateLink: (taskId: string, targetKey: string, linkType: string, isOutward: boolean) => void;
  onCrossLink?: (sourceTaskId: string, sourceIssueKey: string, targetTaskId: string, targetIssueKey: string, linkType: string) => void;
  jiraBaseUrl: string;
  existingIssues: JiraIssue[];
  allTasks: TaskData[];
}
export const LinkChangeContext = createContext<LinkChangeContextType | null>(null);

interface CollapsedGroupsContextType {
  collapsedGroups: Set<string>;
  toggleGroup: (groupId: string) => void;
}
export const CollapsedGroupsContext = createContext<CollapsedGroupsContextType>({
  collapsedGroups: new Set(),
  toggleGroup: () => {},
});

interface SelectionContextType {
  selectedCards: SelectedCard[];
  toggleSelection: (card: SelectedCard, multi?: boolean) => void;
  clearSelection: () => void;
  isSelected: (nodeId: string) => boolean;
}
export const SelectionContext = createContext<SelectionContextType>({
  selectedCards: [],
  toggleSelection: () => {},
  clearSelection: () => {},
  isSelected: () => false,
});

interface DuplicateHighlightContextType {
  highlightedIssueKey: string | null;
  setHighlightedIssueKey: (key: string | null) => void;
  duplicateIssueKeys: Set<string>;
  duplicateCounts: Map<string, number>;
}
export const DuplicateHighlightContext = createContext<DuplicateHighlightContextType>({
  highlightedIssueKey: null,
  setHighlightedIssueKey: () => {},
  duplicateIssueKeys: new Set(),
  duplicateCounts: new Map(),
});

export const HoverTaskContext = createContext<(taskId: string | null) => void>(() => {});
export const HighlightedTaskContext = createContext<string | null>(null);

interface HoveredChangeContextType {
  hoveredChange: PendingChange | null;
  setHoveredChange: (change: PendingChange | null) => void;
}
export const HoveredChangeContext = createContext<HoveredChangeContextType>({
  hoveredChange: null,
  setHoveredChange: () => {},
});

interface HoveredEdgeContextType {
  hoveredEdgeId: string | null;
  setHoveredEdgeId: (id: string | null) => void;
}
export const HoveredEdgeContext = createContext<HoveredEdgeContextType>({
  hoveredEdgeId: null,
  setHoveredEdgeId: () => {},
});

export const NODE_COLOR_PALETTE = [
  '#6C5CE7', '#A29BFE', '#00B894', '#74B9FF',
  '#E17055', '#FDCB6E', '#FD79A8', '#00CEC9',
] as const;

interface NodeColorContextType {
  nodeColors: Record<string, string>;
  setNodeColor: (nodeId: string, color: string) => void;
  resetNodeColor: (nodeId: string) => void;
}
export const NodeColorContext = createContext<NodeColorContextType>({
  nodeColors: {},
  setNodeColor: () => {},
  resetNodeColor: () => {},
});

// === Undo/Redo Context ===
export interface UndoAction {
  type: 'delete-task';
  taskId: string;
  issueKey: string;
}

interface UndoRedoContextType {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  push: (action: UndoAction) => void;
}
export const UndoRedoContext = createContext<UndoRedoContextType>({
  canUndo: false,
  canRedo: false,
  undo: () => {},
  redo: () => {},
  push: () => {},
});
