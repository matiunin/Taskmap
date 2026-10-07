import React, { useCallback, useMemo, useState, useEffect, useContext, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  ConnectionMode,
  MarkerType,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  SelectionMode,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { JiraIssue, JiraIssueLink, TaskData } from '../../types';
import { PendingChange } from '../../hooks/usePendingChanges';
import { useTranslation } from '../../i18n';
import { secureSessionStorage } from '../../utils/secureStorage';
import {
  SelectedCard, CardDragInfo,
  ZoomContext, DragContext, GhostDragContext, GhostDragContextType,
  LinkChangeContext, CollapsedGroupsContext, SelectionContext,
  DuplicateHighlightContext, HoverTaskContext, HighlightedTaskContext,
  HoveredChangeContext, HoveredEdgeContext, NodeColorContext,
  UndoRedoContext, UndoAction,
} from './contexts';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import {
  COLORS, getLinkTypeConfig, getDetailLevel, getLayoutDimensions,
  getStatusColor, getTypeIcon, type DetailLevel,
} from './constants';
import { ApplyBar } from './ApplyBar';
import { ActionBar } from './ActionBar';
import CustomControls from './CustomControls';
import './MindMap.css';


interface MindMapProps {
  tasks: TaskData[];
  onChangeLinkType?: (taskId: string, issueKey: string, newType: string, linkId: string) => void;
  onDeleteLink?: (taskId: string, linkId: string, issueKey: string) => void;
  onLoadTask?: (issueKey: string, taskId?: string) => void;
  onLoadParentChain?: (issueKey: string) => void;
  onHoverTask?: (taskId: string | null) => void;
  onDeleteIssue?: (taskId: string, issueKey: string) => void;
  onRestoreTask?: (taskId: string, issueKey: string) => void;
  onDropToGroup?: (taskId: string, issueKey: string, linkId: string, sourceType: string, targetType: string) => void;
  onCreateLink?: (taskId: string, targetKey: string, linkType: string, isOutward: boolean) => void;
  onCrossLink?: (sourceTaskId: string, sourceIssueKey: string, targetTaskId: string, targetIssueKey: string, linkType: string) => void;
  onAddChild?: (parentTaskId: string, parentKey: string, childKey: string) => void;
  onChangeIssueType?: (taskId: string, issueKey: string, newIssueTypeId: string, newIssueTypeName: string, oldIssueTypeName: string) => void;
  pendingChanges?: PendingChange[];
  onSelectionChange?: (selectedCards: SelectedCard[]) => void;
  onApplyChanges?: () => Promise<void>;
  onCancelAllChanges?: () => void;
  onCancelChange?: (index: number) => void;
  applying?: boolean;
  refreshCountdown?: number;
  onPreviewTask?: (issueKey: string) => void;
  highlightedTaskId?: string | null;
}

// Функция для создания простого пути без сложных кривых Безье
// Создаёт прямую линию или простую кривую без "ломания"
const getSimplePath = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position
): [string, number, number] => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const midX = sourceX + dx / 2;
  const midY = sourceY + dy / 2;
  
  // Определяем тип соединения на основе позиций
  const isVertical = (sourcePosition === Position.Top || sourcePosition === Position.Bottom) &&
                     (targetPosition === Position.Top || targetPosition === Position.Bottom);
  const isHorizontal = (sourcePosition === Position.Left || sourcePosition === Position.Right) &&
                       (targetPosition === Position.Left || targetPosition === Position.Right);
  
  let path: string;
  
  if (isVertical) {
    // Вертикальное соединение: source сверху/снизу, target сверху/снизу
    // Используем S-образную кривую через середину
    const controlOffset = Math.abs(dy) * 0.5;
    const cy1 = sourcePosition === Position.Bottom ? sourceY + controlOffset : sourceY - controlOffset;
    const cy2 = targetPosition === Position.Top ? targetY - controlOffset : targetY + controlOffset;
    
    path = `M ${sourceX} ${sourceY} C ${sourceX} ${cy1}, ${targetX} ${cy2}, ${targetX} ${targetY}`;
  } else if (isHorizontal) {
    // Горизонтальное соединение
    const controlOffset = Math.abs(dx) * 0.5;
    const cx1 = sourcePosition === Position.Right ? sourceX + controlOffset : sourceX - controlOffset;
    const cx2 = targetPosition === Position.Left ? targetX - controlOffset : targetX + controlOffset;
    
    path = `M ${sourceX} ${sourceY} C ${cx1} ${sourceY}, ${cx2} ${targetY}, ${targetX} ${targetY}`;
  } else {
    // Смешанное соединение - используем простую кривую Безье с фиксированным смещением
    // Контрольные точки располагаем на фиксированном расстоянии от источника и цели
    const offset = Math.min(Math.abs(dx), Math.abs(dy), 50);
    
    let cx1 = sourceX, cy1 = sourceY;
    let cx2 = targetX, cy2 = targetY;
    
    // Смещаем контрольные точки в направлении handle
    switch (sourcePosition) {
      case Position.Top: cy1 = sourceY - offset; break;
      case Position.Bottom: cy1 = sourceY + offset; break;
      case Position.Left: cx1 = sourceX - offset; break;
      case Position.Right: cx1 = sourceX + offset; break;
    }
    
    switch (targetPosition) {
      case Position.Top: cy2 = targetY - offset; break;
      case Position.Bottom: cy2 = targetY + offset; break;
      case Position.Left: cx2 = targetX - offset; break;
      case Position.Right: cx2 = targetX + offset; break;
    }
    
    path = `M ${sourceX} ${sourceY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${targetX} ${targetY}`;
  }
  
  return [path, midX, midY];
};

// Простой Edge с hover для z-index (mentions и др. default-типы)
const DefaultEdgeWithHover: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}) => {
  const { setHoveredEdgeId } = useContext(HoveredEdgeContext);
  const effectiveSourcePos = sourcePosition || Position.Bottom;
  const effectiveTargetPos = targetPosition || Position.Top;
  const [edgePath] = getSimplePath(sourceX, sourceY, targetX, targetY, effectiveSourcePos, effectiveTargetPos);

  return (
    <g
      onMouseEnter={() => setHoveredEdgeId(id)}
      onMouseLeave={() => setHoveredEdgeId(null)}
    >
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'default' }} />
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
    </g>
  );
};

// Кастомный Edge с кнопкой удаления
const DeletableEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const linkChangeCtx = useContext(LinkChangeContext);
  const { hoveredChange } = useContext(HoveredChangeContext);
  const { setHoveredEdgeId } = useContext(HoveredEdgeContext);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setHoveredEdgeId(id);
  }, [id, setHoveredEdgeId]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setHoveredEdgeId(null);
  }, [setHoveredEdgeId]);
  
  // Fallback для позиций
  const effectiveSourcePos = sourcePosition || Position.Bottom;
  const effectiveTargetPos = targetPosition || Position.Top;
  
  // Используем простой путь вместо getBezierPath
  const [edgePath, labelX, labelY] = getSimplePath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    effectiveSourcePos,
    effectiveTargetPos
  );

  // Можно удалять links, subtasks и parent
  // Не удаляем: группы, confluence и mentions (виртуальные связи)
  const canDelete = data?.linkId && 
                    !data.linkId.startsWith('group-') &&
                    !data.linkId.startsWith('confluence-') &&
                    !data.linkId.startsWith('mention-');
  
  const isPendingDelete = data?.isPendingDelete;

  // Подсветка edge при hover в ApplyBar
  const isChangeHovered = hoveredChange && data?.linkId === hoveredChange.linkId && data?.taskId === hoveredChange.taskId;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (linkChangeCtx && canDelete && data?.issueKey && data?.taskId) {
      linkChangeCtx.onDeleteLink(data.taskId, data.linkId, data.issueKey);
    }
  };

  // Если нет действий - просто рисуем линию без интерактивности (но с hover для z-index)
  if (!canDelete) {
    return (
      <g onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          style={{ cursor: 'default' }}
        />
        <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      </g>
    );
  }

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Невидимая широкая область для hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeDasharray: isPendingDelete ? '5,5' : undefined,
          opacity: isPendingDelete ? 0.5 : 1,
          stroke: isChangeHovered ? '#FFD700' : style.stroke,
          strokeWidth: isChangeHovered ? 3 : style.strokeWidth,
          filter: isChangeHovered ? 'drop-shadow(0 0 6px rgba(255, 215, 0, 0.8))' : undefined,
          transition: 'stroke 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease',
        }} 
      />
      {(isHovered || isPendingDelete) && (
        <EdgeLabelRenderer>
          <button
            className={`edge-delete-button ${isPendingDelete ? 'pending' : ''}`}
            style={{
              position: 'absolute',
              left: labelX,
              top: labelY,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'all',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleDelete}
            title={isPendingDelete ? 'Cancel deletion' : 'Delete link'}
          >
            {isPendingDelete ? <i className="lni lni-arrow-left" aria-hidden /> : <i className="lni lni-xmark" aria-hidden />}
          </button>
        </EdgeLabelRenderer>
      )}
    </g>
  );
};

// getFontScale убран — transform: scale() на отдельных карточках
// вызывал наложение, т.к. ReactFlow позиционирует по исходным размерам.
// Адаптация контента при зуме обеспечивается через detailLevel (minimal/compact/full).

interface IssueNodeData {
  issue: JiraIssue;
  isRoot: boolean;
  nodeType: 'root' | 'parent' | 'subtask' | 'link';
  linkId?: string;
  pendingConversion?: { sourceType: string; targetType: string } | null;
  isPending?: boolean;
  alsoLinked?: boolean;
  linkType?: string;
  taskId: string;
  parentIssue?: JiraIssue;
  isMention?: boolean;
  childCount?: number;
}

// Кастомный узел для задачи
const IssueNode: React.FC<{ data: IssueNodeData; id: string }> = ({ data, id }) => {
  const { issue, isRoot, nodeType, linkId, pendingConversion, isPending, alsoLinked, linkType, taskId, parentIssue, isMention, childCount } = data;
  const zoom = useContext(ZoomContext);
  const detailLevel = getDetailLevel(zoom);
  const dims = getLayoutDimensions(detailLevel);
  const linkChangeCtx = useContext(LinkChangeContext);
  const selectionCtx = useContext(SelectionContext);
  const duplicateCtx = useContext(DuplicateHighlightContext);
  const highlightedTaskId = useContext(HighlightedTaskContext);
  const { hoveredChange } = useContext(HoveredChangeContext);
  const hoverTask = useContext(HoverTaskContext);
  const ghostDragCtx = useContext(GhostDragContext);
  const { nodeColors } = useContext(NodeColorContext);
  const { t } = useTranslation();
  
  // Проверяем, выбрана ли карточка
  const isCardSelected = selectionCtx.isSelected(id);
  
  // Проверяем, нужно ли подсветить эту задачу (анимация при попытке открыть уже открытую)
  const isHighlighted = isRoot && highlightedTaskId === taskId;
  
  // Проверяем, является ли это дубликатом и подсвечена ли она
  const isDuplicate = duplicateCtx.duplicateIssueKeys.has(issue.key);
  const isDuplicateHighlighted = duplicateCtx.highlightedIssueKey === issue.key;
  const duplicateCount = duplicateCtx.duplicateCounts.get(issue.key) || 0;
  
  // Подсветка узла при hover в ApplyBar
  const isChangeHovered = hoveredChange && hoveredChange.issueKey === issue.key && hoveredChange.taskId === taskId;
  
  // Функция для получения правильного склонения
  const getDuplicateTooltip = (count: number): string => {
    if (count === 1) return t('mindmap.duplicateTooltip1', { count });
    if (count >= 2 && count <= 4) return t('mindmap.duplicateTooltip2', { count });
    return t('mindmap.duplicateTooltip5', { count });
  };
  
  const duplicateTooltip = isDuplicate ? getDuplicateTooltip(duplicateCount) : undefined;
  
  // Определяем цвет границы с учётом pending конвертации и типа связи
  const getNodeColor = () => {
    if (pendingConversion) {
      return pendingConversion.targetType === 'subtask' ? COLORS.subtask : COLORS.link;
    }
    if (isRoot) return COLORS.root;
    if (nodeType === 'parent') return COLORS.parent;
    if (nodeType === 'subtask') return COLORS.subtask;
    if (nodeType === 'link') {
      // Используем цвет конкретного типа связи
      if (linkType) {
        return getLinkTypeConfig(linkType).color;
      }
      return COLORS.link;
    }
    return COLORS.root;
  };
  
  const borderColor = nodeColors[id] ?? getNodeColor();

  const statusColor = getStatusColor(issue.status);
  const typeIcon = getTypeIcon(issue.issueType);
  const issueTypeName = issue.issueType; // Тип задачи (Task, Bug, Story, Epic и т.д.)

  // Parent данные для сплит-карточки (только у root)
  const parentStatusColor = parentIssue ? getStatusColor(parentIssue.status) : '';
  const parentTypeIcon = parentIssue ? getTypeIcon(parentIssue.issueType) : '';

  // Обработчики для подсветки дубликатов и тегов
  const handleMouseEnter = () => {
    if (isDuplicate) {
      duplicateCtx.setHighlightedIssueKey(issue.key);
    }
    if (taskId) {
      hoverTask(taskId);
    }
  };
  
  const handleMouseLeave = () => {
    if (isDuplicate) {
      duplicateCtx.setHighlightedIssueKey(null);
    }
    hoverTask(null);
  };

  // Клик на карточку - выбрать карточку
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isPending) return;
    if (ghostDragCtx.isDragging) return;
    
    const card: SelectedCard = {
      nodeId: id,
      taskId: taskId || '',
      issueKey: issue.key,
      issue,
      nodeType: isRoot ? 'root' : nodeType,
      linkId,
      linkType,
    };
    
    selectionCtx.toggleSelection(card, e.ctrlKey || e.metaKey);
  };

  // Ghost-drag: начало перетаскивания карточки на группу
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPending) return;
    if (e.button !== 0) return;
    ghostDragCtx.onCardMouseDown(e as unknown as React.MouseEvent, {
      issueKey: issue.key,
      issue,
      taskId: taskId || '',
      nodeType: isRoot ? 'root' : nodeType,
      linkId,
    });
  };

  // Копировать URL задачи
  const [copied, setCopied] = useState(false);
  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (linkChangeCtx?.jiraBaseUrl) {
      const url = `${linkChangeCtx.jiraBaseUrl}/browse/${issue.key}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  // Копировать URL parent задачи
  const [parentCopied, setParentCopied] = useState(false);
  const handleCopyParentUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (linkChangeCtx?.jiraBaseUrl && parentIssue) {
      const url = `${linkChangeCtx.jiraBaseUrl}/browse/${parentIssue.key}`;
      navigator.clipboard.writeText(url).then(() => {
        setParentCopied(true);
        setTimeout(() => setParentCopied(false), 1500);
      });
    }
  };

  // Клик на parent-секцию — выбрать parent как отдельную карточку
  const handleParentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!parentIssue) return;
    
    const parentCard: SelectedCard = {
      nodeId: `${id}-parent`,
      taskId: taskId || '',
      issueKey: parentIssue.key,
      issue: parentIssue,
      nodeType: 'parent',
      linkId: `parent-${parentIssue.key}`,
    };
    
    selectionCtx.toggleSelection(parentCard, e.ctrlKey || e.metaKey);
  };

  // Проверяем, выбран ли parent
  const isParentSelected = parentIssue ? selectionCtx.isSelected(`${id}-parent`) : false;

  // Handles для всех сторон с ID
  const handles = (
    <>
      <Handle id="top" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0 }} />
      {/* Дублируем для двунаправленных соединений */}
      <Handle id="top-source" type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left-source" type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right-target" type="target" position={Position.Right} style={{ opacity: 0 }} />
      {/* Диагональные handles для разветвлений */}
      <Handle id="bottom-left" type="source" position={Position.Bottom} style={{ opacity: 0, left: '25%' }} />
      <Handle id="bottom-right" type="source" position={Position.Bottom} style={{ opacity: 0, left: '75%' }} />
    </>
  );

  // Лейбл типа связи (только для parent, т.к. links теперь группируются)
  const typeLabel = nodeType === 'parent' ? (
    <div className="mind-node-type-label" style={{ backgroundColor: COLORS.parent }}>
      <i className="lni lni-user-4" aria-hidden /> {t('mindmap.parent')} {alsoLinked && <>+ <i className="lni lni-link-2-angular-right" aria-hidden /></>}
    </div>
  ) : null;

  // Лейбл pending конвертации
  const pendingLabel = pendingConversion ? (
    <div 
      className="mind-node-pending-label" 
      style={{ backgroundColor: pendingConversion.targetType === 'subtask' ? COLORS.subtask : COLORS.link }}
    >
      <i className="lni lni-hourglass" aria-hidden /> → {pendingConversion.targetType === 'subtask' ? 'Subtask' : 'Link'}
    </div>
  ) : null;

  // Стиль для pending конвертации
  const pendingStyle = pendingConversion ? {
    borderStyle: 'dashed' as const,
    opacity: 0.85,
  } : {};

  // Стиль для mention-карточек — приглушённые
  const mentionStyle = isMention ? { opacity: 0.55 } : {};

  // Фиксированная ШИРИНА карточки — совпадает с раскладкой.
  // Высоту НЕ ограничиваем, чтобы контент не обрезался.
  // Layout использует NODE_HEIGHT (с запасом) для расчёта зазоров между рядами.
  const sizeStyle = {
    boxSizing: 'border-box' as const,
    width: dims.NODE_WIDTH,
    minWidth: dims.NODE_WIDTH,
    maxWidth: dims.NODE_WIDTH,
  };

  // Minimal - только иконка и ключ
  if (detailLevel === 'minimal') {
    return (
      <div 
        className={`mind-node mind-node-minimal nopan ${isRoot ? 'root-node' : ''} ${parentIssue ? 'has-parent-split' : ''} ${nodeType}-node ${pendingConversion ? 'pending-conversion' : ''} ${isPending ? 'pending-node' : ''} ${isCardSelected ? 'selected-card' : ''} ${isDuplicate ? 'duplicate-node' : ''} ${isDuplicateHighlighted ? 'duplicate-highlighted' : ''} ${isHighlighted ? 'highlighted-task' : ''} ${isChangeHovered ? 'change-hovered' : ''}`}
        style={{ 
          borderColor, 
          cursor: isPending ? 'default' : 'pointer', 
          ...pendingStyle,
          ...mentionStyle,
          ...sizeStyle,
        }}
        data-issue-key={issue.key}
        data-task-id={taskId}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={duplicateTooltip || `${issueTypeName}: ${issue.summary}`}
      >
        {handles}
        {parentIssue && (
          <div className={`split-parent-section split-parent-minimal ${isParentSelected ? 'split-parent-selected' : ''}`} onClick={handleParentClick}>
            <span className="mind-node-icon"><i className={`lni ${parentTypeIcon}`} aria-hidden /></span>
            <span className="mind-node-key">{parentIssue.key}</span>
          </div>
        )}
        <div className="split-root-section split-root-minimal">
          {typeLabel}
          {pendingLabel}
          <span className="mind-node-icon"><i className={`lni ${typeIcon}`} aria-hidden /></span>
          <span className="mind-node-key">{issue.key}</span>
          {(childCount ?? 0) > 0 && <span className="mind-node-child-count">{childCount}</span>}
        </div>
      </div>
    );
  }

  // Compact - ключ, статус, короткое название
  if (detailLevel === 'compact') {
    return (
      <div 
        className={`mind-node mind-node-compact nopan ${isRoot ? 'root-node' : ''} ${parentIssue ? 'has-parent-split' : ''} ${nodeType}-node ${pendingConversion ? 'pending-conversion' : ''} ${isPending ? 'pending-node' : ''} ${isCardSelected ? 'selected-card' : ''} ${isDuplicate ? 'duplicate-node' : ''} ${isDuplicateHighlighted ? 'duplicate-highlighted' : ''} ${isHighlighted ? 'highlighted-task' : ''} ${isChangeHovered ? 'change-hovered' : ''}`}
        style={{ 
          borderColor, 
          cursor: isPending ? 'default' : 'pointer', 
          ...pendingStyle,
          ...mentionStyle,
          ...sizeStyle,
        }}
        data-issue-key={issue.key}
        data-task-id={taskId}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={duplicateTooltip || `${issueTypeName}: ${issue.summary}`}
      >
        {handles}
        {parentIssue && (
          <div className={`split-parent-section split-parent-compact ${isParentSelected ? 'split-parent-selected' : ''}`} onClick={handleParentClick}>
            <div className="split-parent-header">
              <span className="split-parent-badge"><i className="lni lni-user-4" aria-hidden /> {t('mindmap.parent')}</span>
              <span className="mind-node-icon" title={parentIssue.issueType}><i className={`lni ${parentTypeIcon}`} aria-hidden /></span>
              <span className="mind-node-key">{parentIssue.key}</span>
              <button 
                className={`mind-node-link-btn ${parentCopied ? 'copied' : ''}`}
                onClick={handleCopyParentUrl}
                title={parentCopied ? t('mindmap.copied') : t('mindmap.copyUrl')}
              >
                {parentCopied ? <i className="lni lni-check" aria-hidden /> : <i className="lni lni-link-2-angular-right" aria-hidden />}
              </button>
              <span className="mind-node-status" style={{ backgroundColor: parentStatusColor }}>
                {parentIssue.status}
              </span>
            </div>
            <div className="split-parent-summary">
              {parentIssue.summary.length > 50 ? parentIssue.summary.substring(0, 50) + '...' : parentIssue.summary}
            </div>
          </div>
        )}
        <div className="split-root-section split-root-compact">
          {typeLabel}
          {pendingLabel}
          <div className="mind-node-header">
            <span className="mind-node-icon" title={issueTypeName}><i className={`lni ${typeIcon}`} aria-hidden /></span>
            <span className="mind-node-key">{issue.key}</span>
            <button 
              className={`mind-node-link-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyUrl}
              title={copied ? t('mindmap.copied') : t('mindmap.copyUrl')}
            >
              {copied ? <i className="lni lni-check" aria-hidden /> : <i className="lni lni-link-2-angular-right" aria-hidden />}
            </button>
            <div className="mind-node-meta">
              <span className="mind-node-issue-type">{issueTypeName}</span>
              <span className="mind-node-status" style={{ backgroundColor: statusColor }}>
                {issue.status}
              </span>
              {(childCount ?? 0) > 0 && <span className="mind-node-child-count">{childCount}</span>}
            </div>
          </div>
          <div className="mind-node-summary-short">
            {issue.summary.length > 40 ? issue.summary.substring(0, 40) + '...' : issue.summary}
          </div>
        </div>
      </div>
    );
  }

  // Full - все детали
  return (
    <div 
      className={`mind-node nopan ${isRoot ? 'root-node' : ''} ${parentIssue ? 'has-parent-split' : ''} ${nodeType}-node ${pendingConversion ? 'pending-conversion' : ''} ${isPending ? 'pending-node' : ''} ${isCardSelected ? 'selected-card' : ''} ${isDuplicate ? 'duplicate-node' : ''} ${isDuplicateHighlighted ? 'duplicate-highlighted' : ''} ${isHighlighted ? 'highlighted-task' : ''} ${isChangeHovered ? 'change-hovered' : ''}`}
      style={{ 
        borderColor, 
        cursor: isPending ? 'default' : 'pointer', 
        ...pendingStyle,
        ...mentionStyle,
        ...sizeStyle,
      }}
      data-issue-key={issue.key}
      data-task-id={taskId}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={duplicateTooltip || `${issueTypeName}: ${issue.summary}`}
    >
      {handles}
      {parentIssue && (
        <div className={`split-parent-section ${isParentSelected ? 'split-parent-selected' : ''}`} onClick={handleParentClick}>
          <div className="split-parent-header">
            <span className="split-parent-badge"><i className="lni lni-user-4" aria-hidden /> {t('mindmap.parent')}</span>
            <span className="mind-node-icon" title={parentIssue.issueType}><i className={`lni ${parentTypeIcon}`} aria-hidden /></span>
            <span className="mind-node-key">{parentIssue.key}</span>
            <button 
              className={`mind-node-link-btn ${parentCopied ? 'copied' : ''}`}
              onClick={handleCopyParentUrl}
              title={parentCopied ? t('mindmap.copied') : t('mindmap.copyUrl')}
            >
              {parentCopied ? <i className="lni lni-check" aria-hidden /> : <i className="lni lni-link-2-angular-right" aria-hidden />}
            </button>
            <span className="mind-node-status" style={{ backgroundColor: parentStatusColor }}>
              {parentIssue.status}
            </span>
          </div>
          <div className="split-parent-summary">{parentIssue.summary}</div>
        </div>
      )}
      <div className="split-root-section">
        {typeLabel}
        {pendingLabel}
        <div className="mind-node-header">
          <span className="mind-node-icon" title={issueTypeName}><i className={`lni ${typeIcon}`} aria-hidden /></span>
          <span className="mind-node-key">{issue.key}</span>
          <button 
            className={`mind-node-link-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopyUrl}
            title={copied ? t('mindmap.copied') : t('mindmap.copyUrl')}
          >
            {copied ? <i className="lni lni-check" aria-hidden /> : <i className="lni lni-link-2-angular-right" aria-hidden />}
          </button>
          <div className="mind-node-meta">
            <span className="mind-node-issue-type">{issueTypeName}</span>
            <span className="mind-node-status" style={{ backgroundColor: statusColor }}>
              {issue.status}
            </span>
            {(childCount ?? 0) > 0 && <span className="mind-node-child-count">{childCount}</span>}
          </div>
        </div>
        <div className="mind-node-summary">{issue.summary}</div>
        {issue.assignee && (
          <div className="mind-node-assignee">
            {issue.assigneeAvatarUrl && (
              <img src={issue.assigneeAvatarUrl} alt="" className="mind-node-avatar" />
            )}
            <span>{issue.assignee}</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface GroupNodeData {
  label: string;
  count?: number;
  nodeType: string;
  linkType?: string;
}

// Кастомный узел для группы (drop-target)
const GroupNode: React.FC<{ data: GroupNodeData; id: string }> = ({ data, id }) => {
  const { label, count, nodeType } = data;
  const zoom = useContext(ZoomContext);
  const detailLevel = getDetailLevel(zoom);
  const groupSizeStyle = {
    boxSizing: 'border-box' as const,
  };
  const dragCtx = useContext(DragContext);
  const { collapsedGroups, toggleGroup } = useContext(CollapsedGroupsContext);
  const { t } = useTranslation();
  
  const isDropTarget = dragCtx.dropTarget === id;
  const canReceiveDrop = nodeType === 'subtask' || nodeType === 'link';
  const isConfluence = nodeType === 'confluence';
  const isMention = nodeType === 'mention';
  const isCollapsible = nodeType !== 'parent';
  const isCollapsed = collapsedGroups.has(id);
  
  // Переводим label на основе nodeType
  // Для link используем label напрямую (это реальный тип связи из Jira, например "relates to")
  const translatedLabel = nodeType === 'subtask' ? t('mindmap.subtasks') :
                          nodeType === 'confluence' ? t('mindmap.mentions') :
                          isMention ? t('mindmap.issueMentions') : label;
  
  // Confluence не получает inline цвет - стилизуется через CSS
  const bgColor = isConfluence ? undefined :
                  nodeType === 'parent' ? COLORS.parent :
                  nodeType === 'subtask' ? COLORS.subtask :
                  isMention ? getLinkTypeConfig(data.linkType || label).color :
                  nodeType === 'link' ? getLinkTypeConfig(data.linkType || label).color : COLORS.root;

  const handles = (
    <>
      <Handle id="top" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="top-source" type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="left-source" type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="right-target" type="target" position={Position.Right} style={{ opacity: 0 }} />
    </>
  );

  const dropHighlight = isDropTarget && canReceiveDrop ? 'drop-highlight' : '';
  
  // Обработчик клика для сворачивания/разворачивания
  const handleClick = () => {
    if (isCollapsible) {
      toggleGroup(id);
    }
  };

  const mentionStyle = isMention ? { opacity: 0.7 } : {};

  // Minimal - только счетчик
  if (detailLevel === 'minimal') {
    return (
      <div 
        className={`mind-group-node mind-group-minimal ${dropHighlight} ${isCollapsible ? 'clickable' : ''} ${isCollapsed ? 'collapsed' : ''} ${isMention ? 'mention-group' : ''}`} 
        style={{ backgroundColor: bgColor, ...groupSizeStyle, ...mentionStyle }}
        data-group-id={id}
        data-group-type={nodeType}
        onClick={handleClick}
      >
        {handles}
        <span className="mind-group-count">{count}</span>
        {isCollapsible && <span className="collapse-indicator">{isCollapsed ? <svg className="collapse-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 6 15 12 9 18" /></svg> : <i className="lni lni-chevron-down" aria-hidden />}</span>}
      </div>
    );
  }

  return (
    <div 
      className={`mind-group-node ${dropHighlight} ${isCollapsible ? 'clickable' : ''} ${isCollapsed ? 'collapsed' : ''} ${isMention ? 'mention-group' : ''}`} 
      style={{ backgroundColor: bgColor, ...groupSizeStyle, ...mentionStyle }}
      data-group-id={id}
      data-group-type={nodeType}
      onClick={handleClick}
    >
      {handles}
      <span className="mind-group-label">{translatedLabel}</span>
      <span className="mind-group-count">{count}</span>
      {isCollapsible && <span className="collapse-indicator">{isCollapsed ? <svg className="collapse-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 6 15 12 9 18" /></svg> : <i className="lni lni-chevron-down" aria-hidden />}</span>}
    </div>
  );
};

// Компонент для автоматического зума на все объекты (при загрузке и при изменении задач)
const FitViewOnTasksChange: React.FC<{ tasksCount: number; nodesCount: number }> = ({ tasksCount, nodesCount }) => {
  const { fitView } = useReactFlow();
  const prevTasksCountRef = useRef<number>(0);
  const prevNodesCountRef = useRef<number>(0);
  const hasFittedRef = useRef(false);
  
  useEffect(() => {
    const prevTasksCount = prevTasksCountRef.current;
    const prevNodesCount = prevNodesCountRef.current;
    
    // Вызываем fitView если:
    // 1. Первая загрузка с узлами (nodesCount > 0) — по умолчанию отзумить на всё содержимое
    // 2. Добавилась новая задача (tasksCount увеличился)
    // 3. Количество узлов значительно увеличилось (новые связи загружены)
    const isInitialLoad = !hasFittedRef.current && nodesCount > 0;
    const newTaskAdded = tasksCount > prevTasksCount;
    const significantNodesChange = nodesCount > prevNodesCount + 3; // Порог в 3 узла
    
    if (isInitialLoad || newTaskAdded || significantNodesChange) {
      hasFittedRef.current = true;
      // Задержка чтобы узлы успели отрисоваться
      const delay = nodesCount > 30 ? 300 : 200;
      
      const timer = setTimeout(() => {
        fitView({ 
          padding: 0.15, // Меньший padding чтобы узлы были крупнее
          duration: isInitialLoad ? 0 : 400, // Без анимации при первой загрузке
          maxZoom: 1,    // Не увеличивать больше 100%
        });
      }, delay);
      
      prevTasksCountRef.current = tasksCount;
      prevNodesCountRef.current = nodesCount;
      return () => clearTimeout(timer);
    }
    
    // Обновляем счётчики
    prevTasksCountRef.current = tasksCount;
    prevNodesCountRef.current = nodesCount;
  }, [tasksCount, nodesCount, fitView]);
  
  return null;
};

// Компонент для центрирования вида на подсвеченную задачу
const ScrollToHighlightedTask: React.FC = () => {
  const highlightedTaskId = useContext(HighlightedTaskContext);
  const { getNodes, setCenter } = useReactFlow();
  const prevHighlighted = useRef<string | null>(null);
  
  useEffect(() => {
    if (highlightedTaskId && highlightedTaskId !== prevHighlighted.current) {
      prevHighlighted.current = highlightedTaskId;
      
      // Находим root-узел подсвеченной задачи
      const nodes = getNodes();
      const targetNode = nodes.find(n => 
        n.data?.taskId === highlightedTaskId && n.data?.isRoot
      );
      
      if (targetNode) {
        const nodeWidth = targetNode.width || 260;
        const nodeHeight = targetNode.height || 160;
        setCenter(
          targetNode.position.x + nodeWidth / 2,
          targetNode.position.y + nodeHeight / 2,
          { duration: 500, zoom: 0.85 }
        );
      }
    } else if (!highlightedTaskId) {
      prevHighlighted.current = null;
    }
  }, [highlightedTaskId, getNodes, setCenter]);
  
  return null;
};


export const MindMap: React.FC<MindMapProps> = ({ 
  tasks,
  onChangeLinkType,
  onDeleteLink,
  onLoadTask,
  onLoadParentChain,
  onHoverTask,
  onDeleteIssue,
  onRestoreTask,
  onDropToGroup,
  onCreateLink,
  onCrossLink,
  onAddChild,
  onChangeIssueType,
  pendingChanges = [],
  onSelectionChange,
  onApplyChanges,
  onCancelAllChanges,
  onCancelChange,
  applying = false,
  refreshCountdown = 0,
  onPreviewTask,
  highlightedTaskId = null,
}) => {
  const nodeTypes = useMemo(() => ({
    issue: IssueNode,
    group: GroupNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    deletable: DeletableEdge,
    default: DefaultEdgeWithHover,
  }), []);

  // Состояние для выбранных карточек
  const [selectedCards, setSelectedCards] = useState<SelectedCard[]>([]);
  
  // Состояние для подсветки дубликатов
  const [highlightedIssueKey, setHighlightedIssueKey] = useState<string | null>(null);
  
  // Состояние для подсветки изменения при hover в ApplyBar
  const [hoveredChange, setHoveredChange] = useState<PendingChange | null>(null);

  // Состояние для поднятия связи над остальными при hover
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  
  // === Undo/Redo для удаления задач ===
  const undoRedo = useUndoRedo<UndoAction>();
  
  const handleUndo = useCallback(() => {
    undoRedo.undo();
    const prevAction = undoRedo.history[undoRedo.historyIndex - 1];
    if (prevAction && prevAction.type === 'delete-task' && onRestoreTask) {
      onRestoreTask(prevAction.taskId, prevAction.issueKey);
    }
  }, [undoRedo, onRestoreTask]);

  const handleRedo = useCallback(() => {
    const nextAction = undoRedo.history[undoRedo.historyIndex + 1];
    undoRedo.redo();
    if (nextAction && nextAction.type === 'delete-task' && onDeleteIssue) {
      onDeleteIssue(nextAction.taskId, nextAction.issueKey);
    }
  }, [undoRedo, onDeleteIssue]);

  const undoRedoContextValue = useMemo(() => ({
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
    undo: handleUndo,
    redo: handleRedo,
    push: undoRedo.push,
  }), [undoRedo.canUndo, undoRedo.canRedo, handleUndo, handleRedo, undoRedo.push]);

  // Обёртка для onDeleteIssue: сначала push в историю, потом удаляем
  const handleDeleteIssueWithUndo = useCallback((taskId: string, issueKey: string) => {
    undoRedo.push({ type: 'delete-task', taskId, issueKey });
    if (onDeleteIssue) {
      onDeleteIssue(taskId, issueKey);
    }
  }, [undoRedo, onDeleteIssue]);

  // Вычисляем дубликаты - задачи, которые появляются в нескольких графах
  // Считаем уникальные узлы (один ключ может появиться только один раз в каждом графе)
  const { duplicateIssueKeys, duplicateCounts } = useMemo(() => {
    const keyCounts = new Map<string, number>();
    
    // Для каждого графа (задачи) собираем уникальные ключи
    tasks.forEach(task => {
      const keysInThisGraph = new Set<string>();
      
      // Root задача
      keysInThisGraph.add(task.rootIssue.key);
      
      // Связанные задачи (каждый ключ считаем только один раз на граф)
      task.links.forEach(link => {
        if (link.outwardIssue) {
          keysInThisGraph.add(link.outwardIssue.key);
        }
        if (link.inwardIssue) {
          keysInThisGraph.add(link.inwardIssue.key);
        }
      });
      
      // Добавляем к общему счётчику
      keysInThisGraph.forEach(key => {
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      });
    });
    
    // Возвращаем только те ключи, которые встречаются больше одного раза
    const duplicates = new Set<string>();
    const counts = new Map<string, number>();
    keyCounts.forEach((count, key) => {
      if (count > 1) {
        duplicates.add(key);
        counts.set(key, count);
      }
    });
    
    return { duplicateIssueKeys: duplicates, duplicateCounts: counts };
  }, [tasks]);
  
  // Состояние для drag & drop (используется для drop-highlight на группах)
  const [draggedNode] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // === Ghost-drag: refs и state (не зависят от nodes) ===
  const GHOST_DRAG_THRESHOLD = 6;
  const ghostDragRef = useRef<{
    startX: number;
    startY: number;
    cards: CardDragInfo[];
    active: boolean;
  } | null>(null);
  const ghostElRef = useRef<HTMLDivElement>(null);
  const [ghostDragActive, setGhostDragActive] = useState(false);
  const [ghostCards, setGhostCards] = useState<CardDragInfo[]>([]);
  const ghostDropTargetGroupRef = useRef<string | null>(null);


  const handleCardMouseDown = useCallback((e: React.MouseEvent, cardInfo: CardDragInfo) => {
    // Если перетаскиваемая карточка входит в выбор — перетаскиваем все выбранные
    const cardsToDrag: CardDragInfo[] = selectedCards.some(c => c.issueKey === cardInfo.issueKey && c.taskId === cardInfo.taskId)
      ? selectedCards.map(c => ({
          issueKey: c.issueKey,
          issue: c.issue,
          taskId: c.taskId,
          nodeType: c.nodeType,
          linkId: c.linkId,
        }))
      : [cardInfo];
    ghostDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      cards: cardsToDrag,
      active: false,
    };
  }, [selectedCards]);

  // Состояние для перетаскивания root узла с его связями
  const rootDragRef = useRef<{
    isActive: boolean;
    rootId: string;
    taskId: string;
    startPos: { x: number; y: number };
    relatedNodeOffsets: Map<string, { x: number; y: number }>;
  } | null>(null);

  // Состояние для перетаскивания группы с её карточками
  const groupDragRef = useRef<{
    groupId: string;
    childOffsets: Map<string, { x: number; y: number }>;
  } | null>(null);


  // Состояние для свёрнутых групп
  // Mention-группы свёрнуты по умолчанию
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    tasks.forEach((task, taskIndex) => {
      const nodePrefix = taskIndex > 0 ? `${task.id}-` : '';
      task.links.forEach(link => {
        if (link.type.id === 'mention') {
          const typeName = link.type.outward || link.type.name;
          initial.add(`${nodePrefix}group-${typeName.replace(/\s+/g, '-').toLowerCase()}`);
        }
      });
    });
    return initial;
  });

  // Автоматически сворачиваем новые mention-группы при загрузке задач
  const prevTaskKeysRef = useRef<string>(tasks.map(t => t.id).join(','));
  useEffect(() => {
    const currentKeys = tasks.map(t => t.id).join(',');
    if (currentKeys !== prevTaskKeysRef.current) {
      prevTaskKeysRef.current = currentKeys;
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        tasks.forEach((task, taskIndex) => {
          const nodePrefix = taskIndex > 0 ? `${task.id}-` : '';
          const hasMention = task.links.some(l => l.type.id === 'mention');
          if (hasMention) {
            const mentionLink = task.links.find(l => l.type.id === 'mention')!;
            const typeName = mentionLink.type.outward || mentionLink.type.name;
            next.add(`${nodePrefix}group-${typeName.replace(/\s+/g, '-').toLowerCase()}`);
          }
        });
        return next;
      });
    }
  }, [tasks]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Функции для работы с выбором карточек
  const toggleSelection = useCallback((card: SelectedCard, multi = false) => {
    setSelectedCards(prev => {
      const existingIndex = prev.findIndex(c => c.nodeId === card.nodeId);
      
      if (existingIndex >= 0) {
        // Карточка уже выбрана - убираем из выбора
        return prev.filter(c => c.nodeId !== card.nodeId);
      } else {
        // Карточка не выбрана - добавляем
        if (multi) {
          // Мульти-выбор - добавляем к существующим
          return [...prev, card];
        } else {
          // Одиночный выбор - заменяем все
          return [card];
        }
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCards([]);
  }, []);

  const isSelected = useCallback((nodeId: string) => {
    return selectedCards.some(c => c.nodeId === nodeId);
  }, [selectedCards]);

  // Уведомляем родителя об изменении выбора
  useEffect(() => {
    onSelectionChange?.(selectedCards);
  }, [selectedCards, onSelectionChange]);

  // Zoom — для передачи текущего масштаба в ZoomContext (визуальная адаптация карточек)
  const [zoom, setZoom] = useState(1);

  // Цвет фоновой сетки React Flow по теме (prefers-color-scheme)
  const [flowBgColor, setFlowBgColor] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? '#3f3f46' : '#DFE6E9'
  );
  useEffect(() => {
    const m = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!m) return;
    const fn = () => setFlowBgColor(m.matches ? '#3f3f46' : '#DFE6E9');
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);

  // Уровень детализации для раскладки адаптируется к zoom:
  // при уменьшении масштаба карточки становятся меньше,
  // и расстояния между блоками графа пропорционально уменьшаются.
  const layoutDetailLevel: DetailLevel = getDetailLevel(zoom);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const allNodes: Node[] = [];
    const allEdges: Edge[] = [];

    // Размеры и расстояния адаптируются к текущему уровню детализации (zoom)
    const dims = getLayoutDimensions(layoutDetailLevel);

    // Динамическое позиционирование задач (графы не наслаиваются)
    let runningOffsetX = 0;

    tasks.forEach((task, taskIndex) => {
      const { rootIssue, links } = task;
      const taskId = task.id;
      // Группируем связи для этой задачи
      const parent: JiraIssueLink[] = [];
      const subtasks: JiraIssueLink[] = [];
      const issueLinks: JiraIssueLink[] = [];

      links.forEach(link => {
        const typeId = link.type.id.toLowerCase();
        const typeName = link.type.name.toLowerCase();
        
        if (link.id.startsWith('parent-') || (typeName.includes('parent') && link.inwardIssue)) {
          parent.push(link);
        } else if (typeId === 'subtask' || typeName.includes('sub-task') || link.id.startsWith('subtask-')) {
          subtasks.push(link);
        } else {
          issueLinks.push(link);
        }
      });

    // Префикс для уникальности id узлов между задачами
    const nodePrefix = taskIndex > 0 ? `${taskId}-` : '';

    // === РАСЧЁТ РАЗМЕРОВ И ПОЗИЦИЙ (адаптивные к detailLevel) ===
    const NODE_WIDTH = dims.NODE_WIDTH;
    const NODE_HEIGHT = dims.NODE_HEIGHT;
    const NODE_SPACING_V = dims.NODE_SPACING_V;
    const NODE_SPACING_H = dims.NODE_SPACING_H;
    const GROUP_SPACING = dims.GROUP_SPACING;
    const GROUP_WIDTH = dims.GROUP_WIDTH;
    const GROUP_HEIGHT = dims.GROUP_HEIGHT;
    const LEVEL_GAP = dims.LEVEL_GAP;
    const GROUP_TO_CARDS = dims.GROUP_TO_CARDS;
    
    // Группируем links по типу
    const linksByType = new Map<string, JiraIssueLink[]>();
    issueLinks.forEach(link => {
      let typeName: string;
      if (link.outwardIssue) {
        typeName = link.type.outward || link.type.name;
      } else {
        typeName = link.type.inward || link.type.name;
      }
      if (!linksByType.has(typeName)) {
        linksByType.set(typeName, []);
      }
      linksByType.get(typeName)!.push(link);
    });
    const typeGroups = Array.from(linksByType.entries())
      .sort(([, linksA], [, linksB]) => {
        const aMention = linksA[0]?.type.id === 'mention';
        const bMention = linksB[0]?.type.id === 'mention';
        if (aMention && !bMention) return 1;
        if (!aMention && bMention) return -1;
        return 0;
      });

    // === Собираем все ветки ПЕРЕД расчётом позиций (чтобы знать ширину графа) ===
    const branches: Array<{
      type: 'subtask' | 'link';
      typeName: string;
      items: JiraIssueLink[];
      cols: number;
      gridWidth: number;
      config: { label: string; icon: string; color: string };
      isMention?: boolean;
    }> = [];

    if (subtasks.length > 0) {
      const cols = Math.min(3, Math.max(1, subtasks.length));
      const gridWidth = cols * (NODE_WIDTH + NODE_SPACING_H) - NODE_SPACING_H;
      branches.push({
        type: 'subtask',
        typeName: 'Subtasks',
        items: subtasks,
        cols,
        gridWidth,
        config: { label: 'Subtasks', icon: 'lni-paperclip-1', color: COLORS.subtask },
      });
    }

    typeGroups.forEach(([typeName, linksOfType]) => {
      const isMention = linksOfType[0]?.type.id === 'mention';
      const cols = Math.min(3, Math.max(1, linksOfType.length));
      const gridWidth = cols * (NODE_WIDTH + NODE_SPACING_H) - NODE_SPACING_H;
      const linkConfig = getLinkTypeConfig(typeName);
      branches.push({
        type: 'link',
        typeName,
        items: linksOfType,
        cols,
        gridWidth,
        config: { label: linkConfig.label, icon: linkConfig.icon, color: linkConfig.color },
        isMention,
      });
    });

    // Рассчитываем ширину каждой ветки (максимум из ширины группы и ширины карточек)
    // Свёрнутые ветки занимают только ширину группы
    const branchWidths = branches.map(b => {
      const gId = b.type === 'subtask'
        ? `${nodePrefix}group-subtasks`
        : `${nodePrefix}group-${b.typeName.replace(/\s+/g, '-').toLowerCase()}`;
      if (collapsedGroups.has(gId)) return GROUP_WIDTH;
      return Math.max(GROUP_WIDTH, b.gridWidth);
    });
    const totalBranchesWidth = branchWidths.reduce((sum, w) => sum + w, 0)
      + Math.max(0, branches.length - 1) * GROUP_SPACING;

    // === Динамический centerX на основе реальной ширины графа ===
    const SIDE_OFFSET = dims.SIDE_OFFSET;
    const pendingCreates = pendingChanges.filter(c => c.action === 'create' && c.taskId === taskId);
    const pendingLeftExtra = pendingCreates.length > 0 ? (NODE_WIDTH / 2 + SIDE_OFFSET + NODE_WIDTH) : 0;
    const leftExtent = Math.max(totalBranchesWidth / 2, NODE_WIDTH, pendingLeftExtra);
    const rightExtent = Math.max(totalBranchesWidth / 2, NODE_WIDTH);
    const centerX = runningOffsetX + leftExtent;
    const centerY = 200; // Root ближе к верху

    // === Корневой узел (центр) — если есть parent, объединяем в сплит-карточку ===
    const parentIssue = parent.length > 0 ? parent[0].inwardIssue! : null;

    // Сплит-карточка (parent + root) выше обычной: доп. высота зависит от detailLevel
    const SPLIT_PARENT_EXTRA = dims.SPLIT_PARENT_EXTRA;
    const rootHeight = parentIssue ? NODE_HEIGHT + SPLIT_PARENT_EXTRA : NODE_HEIGHT;

    allNodes.push({
      id: `${nodePrefix}${rootIssue.key}`,
      type: 'issue',
      draggable: false,
      position: { x: centerX - NODE_WIDTH / 2, y: centerY - rootHeight / 2 },
      data: {
        issue: rootIssue,
        isRoot: true,
        nodeType: 'root',
        taskId,
        // Сплит: parent данные для объединённой карточки
        parentIssue,
        childCount: subtasks.length + issueLinks.length,
      },
    });

    // === Уровень 2: ВСЕ ГРУППЫ ГОРИЗОНТАЛЬНО ===
    // Используем rootHeight чтобы группы не наслаивались на сплит-карточку
    const childrenY = centerY + rootHeight / 2 + LEVEL_GAP;

    // Центрируем все ветки относительно root
    let currentBranchX = centerX - totalBranchesWidth / 2;
    const existingNodeIds = new Set(allNodes.map(n => n.id));

    branches.forEach((branch, branchIndex) => {
      const branchCenterX = currentBranchX + branchWidths[branchIndex] / 2;
      const groupX = branchCenterX - GROUP_WIDTH / 2;
      const groupY = childrenY;

      const groupId = branch.type === 'subtask'
        ? `${nodePrefix}group-subtasks`
        : `${nodePrefix}group-${branch.typeName.replace(/\s+/g, '-').toLowerCase()}`;

      const isMentionBranch = !!branch.isMention;
      const isBranchCollapsed = collapsedGroups.has(groupId);

      allNodes.push({
        id: groupId,
        type: 'group',
        draggable: true,
        position: { x: groupX, y: groupY },
        data: {
          label: branch.config.label,
          count: branch.items.length,
          nodeType: isMentionBranch ? 'mention' : branch.type,
          icon: branch.config.icon,
          ...(branch.type === 'link' ? { linkType: branch.typeName } : {}),
          taskId,
        },
      });

      // Соединяем от root к группе
      allEdges.push({
        id: `${nodePrefix}edge-root-to-${groupId}`,
        source: `${nodePrefix}${rootIssue.key}`,
        target: groupId,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'default',
        style: {
          stroke: branch.config.color,
          strokeWidth: isMentionBranch ? 1.5 : 2,
          opacity: isMentionBranch ? 0.4 : 0.7,
          strokeDasharray: isMentionBranch ? '6,4' : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: branch.config.color },
      });

      // Пропускаем карточки для свёрнутых mention-веток
      if (isBranchCollapsed) {
        currentBranchX += branchWidths[branchIndex] + GROUP_SPACING;
        return;
      }

      // Карточки под группой
      const cardsStartY = groupY + GROUP_HEIGHT + GROUP_TO_CARDS;
      const totalWidth = branch.cols * (NODE_WIDTH + NODE_SPACING_H) - NODE_SPACING_H;
      const cardsStartX = branchCenterX - totalWidth / 2;

      branch.items.forEach((link, i) => {
        const issue = branch.type === 'subtask'
          ? link.outwardIssue!
          : (link.outwardIssue || link.inwardIssue);
        if (!issue) return;

        const col = i % branch.cols;
        const row = Math.floor(i / branch.cols);
        const x = cardsStartX + col * (NODE_WIDTH + NODE_SPACING_H);
        const y = cardsStartY + row * (NODE_HEIGHT + NODE_SPACING_V);

        const nodeId = `${nodePrefix}${issue.key}`;
        const nodeAlreadyExists = existingNodeIds.has(nodeId);

        const pendingConv = pendingChanges.find(
          c => (c.action === 'subtask-to-link' || c.action === 'link-to-subtask') && c.linkId === link.id && c.taskId === taskId
        );

        if (branch.type === 'subtask') {
          const subtaskLinkId = `subtask-${issue.key}`;
          const isSubtaskPendingDelete = pendingChanges.some(
            c => c.linkId === subtaskLinkId && c.action === 'remove-parent' && c.taskId === taskId
          );

          allNodes.push({
            id: nodeId,
            type: 'issue',
            draggable: false,
            position: { x, y },
            data: {
              issue,
              nodeType: 'subtask',
              linkId: subtaskLinkId,
              taskId,
              pendingConversion: pendingConv ? {
                sourceType: pendingConv.sourceType,
                targetType: pendingConv.targetType,
              } : null,
            },
          });
          existingNodeIds.add(nodeId);

          allEdges.push({
            id: `${nodePrefix}edge-subtask-${issue.key}`,
            source: groupId,
            target: nodeId,
            sourceHandle: 'bottom',
            targetHandle: 'top',
            type: 'deletable',
            style: { stroke: COLORS.subtask, strokeWidth: 1.5, opacity: 0.7 },
            data: {
              linkId: subtaskLinkId,
              issueKey: issue.key,
              taskId,
              isPendingDelete: isSubtaskPendingDelete,
            },
          });
        } else {
          // Link cards
          const isMention = link.type.id === 'mention';
          const isPendingDelete = !isMention && pendingChanges.some(
            c => c.action === 'delete' && c.linkId === link.id && c.taskId === taskId
          );

          if (!nodeAlreadyExists) {
            allNodes.push({
              id: nodeId,
              type: 'issue',
              draggable: false,
              position: { x, y },
              data: {
                issue,
                nodeType: 'link',
                linkId: link.id,
                linkType: branch.typeName,
                taskId,
                isMention,
                pendingConversion: pendingConv ? {
                  sourceType: pendingConv.sourceType,
                  targetType: pendingConv.targetType,
                } : null,
              },
            });
            existingNodeIds.add(nodeId);
          }

          allEdges.push({
            id: `${nodePrefix}edge-link-${link.id}`,
            source: groupId,
            target: nodeId,
            sourceHandle: 'bottom',
            targetHandle: 'top',
            type: isMention ? 'default' : 'deletable',
            style: {
              stroke: branch.config.color,
              strokeWidth: isMention ? 1 : 1.5,
              opacity: isMention ? 0.4 : 0.7,
              strokeDasharray: isMention ? '6,4' : undefined,
            },
            data: isMention
              ? { linkId: link.id, issueKey: issue.key, taskId }
              : { linkId: link.id, issueKey: issue.key, taskId, isPendingDelete, linkType: branch.typeName },
          });
        }
      });

      currentBranchX += branchWidths[branchIndex] + GROUP_SPACING;
    });

    // Confluence mentions перенесены в сайдбар превью задачи

    // === PENDING CREATE LINKS (новые связи ожидающие применения) ===
    // pendingCreates уже вычислен выше для расчёта ширины графа
    if (pendingCreates.length > 0) {
      // Позиционируем pending связи слева от root
      const pendingX = centerX - NODE_WIDTH / 2 - SIDE_OFFSET - NODE_WIDTH;
      const pendingStartY = centerY - (pendingCreates.length * (NODE_HEIGHT + NODE_SPACING_V)) / 2;
      
      pendingCreates.forEach((pending, i) => {
        const nodeId = `${nodePrefix}pending-${pending.linkId}`;
        const y = pendingStartY + i * (NODE_HEIGHT + NODE_SPACING_V);
        
        // Создаём узел для pending связи
        allNodes.push({
          id: nodeId,
          type: 'issue',
          draggable: false,
          position: { x: pendingX, y },
          data: { 
            issue: {
              id: pending.linkId,
              key: pending.issueKey,
              summary: pending.issueSummary || pending.issueKey,
              status: 'Pending',
              issueType: 'Task',
            },
            nodeType: 'pending',
            linkId: pending.linkId,
            taskId,
            isPending: true,
          },
        });

        // Создаём edge от root к pending узлу
        const direction = pending.isOutward;
        allEdges.push({
          id: `${nodePrefix}edge-pending-${pending.linkId}`,
          source: direction ? `${nodePrefix}${rootIssue.key}` : nodeId,
          target: direction ? nodeId : `${nodePrefix}${rootIssue.key}`,
          sourceHandle: 'left-source',
          targetHandle: 'right-target',
          type: 'default',
          style: { 
            stroke: '#FF9800', 
            strokeWidth: 1.5, 
            strokeDasharray: '8,4',
            opacity: 0.7,
          },
          label: `+ ${pending.newLinkType}`,
          labelStyle: { 
            fontSize: 10, 
            fontWeight: 600, 
            fill: '#ff991f',
          },
          labelBgStyle: { 
            fill: 'white', 
            fillOpacity: 0.9,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ff991f' },
        });
      });
    }

    // Обновляем offset для следующей задачи (чтобы графы не наслаивались)
    runningOffsetX = centerX + rightExtent + dims.TASK_GAP;

    }); // Конец tasks.forEach

    return { nodes: allNodes, edges: allEdges };
  }, [tasks, pendingChanges, collapsedGroups, layoutDetailLevel]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  
  // Для обратной совместимости - используем первую задачу
  const rootIssue = tasks[0]?.rootIssue;

  // Обновляем nodes и edges при изменении данных задач или уровня детализации.
  // Визуальная адаптация карточек идёт через ZoomContext.
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  // Функция для расчёта оптимальных handles на основе позиций узлов
  // Линии должны выходить из стороны, направленной к целевому узлу
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      // Проверяем начало перетаскивания root узла
      const rootDragChange = changes.find(c => 
        c.type === 'position' && 
        c.dragging && 
        c.position &&
        nds.find(n => n.id === c.id)?.data?.isRoot
      );
      
      if (rootDragChange && rootDragChange.type === 'position' && rootDragChange.position) {
        const draggedRootId = rootDragChange.id;
        const draggedRoot = nds.find(n => n.id === draggedRootId);
        
        if (draggedRoot) {
          const draggedTaskId = draggedRoot.data.taskId;
          
          // Инициализируем состояние перетаскивания если ещё не начато
          if (!rootDragRef.current || rootDragRef.current.rootId !== draggedRootId) {
            const relatedNodeOffsets = new Map<string, { x: number; y: number }>();
            
            // Сохраняем смещения всех узлов относительно root
            nds.forEach(node => {
              const nodeTaskId = node.data?.taskId;
              if (node.id !== draggedRootId && nodeTaskId === draggedTaskId) {
                relatedNodeOffsets.set(node.id, {
                  x: node.position.x - draggedRoot.position.x,
                  y: node.position.y - draggedRoot.position.y,
                });
              }
            });
            
            rootDragRef.current = {
              isActive: true,
              rootId: draggedRootId,
              taskId: draggedTaskId,
              startPos: { ...draggedRoot.position },
              relatedNodeOffsets,
            };
          }
          
          // Перемещаем все связанные узлы на основе сохранённых смещений
          const newRootPos = rootDragChange.position;
          
          const updatedNodes = nds.map(node => {
            if (node.id === draggedRootId) {
              return { ...node, position: { x: newRootPos.x, y: newRootPos.y } };
            }
            
            const offset = rootDragRef.current?.relatedNodeOffsets.get(node.id);
            if (offset) {
              return {
                ...node,
                position: {
                  x: newRootPos.x + offset.x,
                  y: newRootPos.y + offset.y,
                },
              };
            }
            
            return node;
          });
          
          return updatedNodes;
        }
      }
      
      // Проверяем перетаскивание группы (group node)
      const groupDragChange = changes.find(c => 
        c.type === 'position' && 
        c.dragging && 
        c.position &&
        nds.find(n => n.id === c.id)?.type === 'group'
      );
      
      if (groupDragChange && groupDragChange.type === 'position' && groupDragChange.position) {
        const draggedGroupId = groupDragChange.id;
        const draggedGroup = nds.find(n => n.id === draggedGroupId);
        
        if (draggedGroup) {
          // Инициализируем состояние перетаскивания группы если ещё не начато
          if (!groupDragRef.current || groupDragRef.current.groupId !== draggedGroupId) {
            const childOffsets = new Map<string, { x: number; y: number }>();
            
            // Находим все карточки связанные с этой группой через edges
            edges.forEach(edge => {
              if (edge.source === draggedGroupId) {
                const childNode = nds.find(n => n.id === edge.target);
                if (childNode && childNode.type !== 'group') {
                  childOffsets.set(childNode.id, {
                    x: childNode.position.x - draggedGroup.position.x,
                    y: childNode.position.y - draggedGroup.position.y,
                  });
                }
              }
            });
            
            groupDragRef.current = {
              groupId: draggedGroupId,
              childOffsets,
            };
          }
          
          // Перемещаем все связанные карточки вместе с группой
          const newGroupPos = groupDragChange.position;
          
          const updatedNodes = nds.map(node => {
            if (node.id === draggedGroupId) {
              return { ...node, position: { x: newGroupPos.x, y: newGroupPos.y } };
            }
            
            const offset = groupDragRef.current?.childOffsets.get(node.id);
            if (offset) {
              return {
                ...node,
                position: {
                  x: newGroupPos.x + offset.x,
                  y: newGroupPos.y + offset.y,
                },
              };
            }
            
            return node;
          });
          
          return updatedNodes;
        }
      }
      
      // Проверяем конец перетаскивания группы
      const groupDragEndChange = changes.find(c => 
        c.type === 'position' && 
        !c.dragging &&
        groupDragRef.current?.groupId === c.id
      );
      
      if (groupDragEndChange && groupDragRef.current) {
        const groupId = groupDragRef.current.groupId;
        const childOffsets = groupDragRef.current.childOffsets;
        
        const finalGroupPos = groupDragEndChange.type === 'position' && groupDragEndChange.position
          ? groupDragEndChange.position
          : nds.find(n => n.id === groupId)?.position;
        
        if (finalGroupPos) {
          const finalNodes = nds.map(node => {
            if (node.id === groupId) {
              return { ...node, position: { x: finalGroupPos.x, y: finalGroupPos.y } };
            }
            
            const offset = childOffsets.get(node.id);
            if (offset) {
              return {
                ...node,
                position: {
                  x: finalGroupPos.x + offset.x,
                  y: finalGroupPos.y + offset.y,
                },
              };
            }
            
            return node;
          });
          
          groupDragRef.current = null;
          return finalNodes;
        }
        
        groupDragRef.current = null;
      }

      // Проверяем конец перетаскивания root (dragging стало false)
      const rootDragEndChange = changes.find(c => 
        c.type === 'position' && 
        !c.dragging &&
        rootDragRef.current?.rootId === c.id
      );
      
      if (rootDragEndChange && rootDragRef.current) {
        // Получаем последние позиции из ref и применяем их к узлам
        const rootId = rootDragRef.current.rootId;
        const offsets = rootDragRef.current.relatedNodeOffsets;
        
        // Находим финальную позицию root из changes
        const finalRootPos = rootDragEndChange.type === 'position' && rootDragEndChange.position
          ? rootDragEndChange.position
          : nds.find(n => n.id === rootId)?.position;
        
        if (finalRootPos) {
          // Применяем финальные позиции ко всем узлам группы
          const finalNodes = nds.map(node => {
            if (node.id === rootId) {
              return { ...node, position: { x: finalRootPos.x, y: finalRootPos.y } };
            }
            
            const offset = offsets.get(node.id);
            if (offset) {
              return {
                ...node,
                position: {
                  x: finalRootPos.x + offset.x,
                  y: finalRootPos.y + offset.y,
                },
              };
            }
            
            return node;
          });
          
          rootDragRef.current = null;
          return finalNodes;
        }
        
        rootDragRef.current = null;
      }
      
      // Обычная обработка для не-root узлов
      const newNodes = applyNodeChanges(changes, nds);
      
      // НЕ обновляем edges во время перетаскивания - это вызывает "ломание" линий
      // Обновление handles теперь происходит в onNodeDragStop
      
      return newNodes;
    });
  }, [rootIssue?.key, tasks, edges]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  // === Ghost-drag: callbacks и effects (зависят от nodes) ===
  interface DropTarget {
    kind: 'group' | 'card';
    elementId: string;
    taskId: string;
    groupType?: string;
    linkType?: string;
    issueKey?: string;
  }

  const findDropTargetUnderCursor = useCallback((clientX: number, clientY: number, sourceIssueKeys: Set<string>): DropTarget | null => {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const htmlEl = el as HTMLElement;

      // Сначала проверяем группу
      const groupEl = htmlEl.closest?.('[data-group-id]') as HTMLElement | null;
      if (groupEl) {
        const groupId = groupEl.getAttribute('data-group-id') || '';
        const groupType = groupEl.getAttribute('data-group-type') || '';
        const node = nodes.find(n => n.id === groupId);
        const taskId = node?.data?.taskId || '';
        const linkType = node?.data?.linkType;
        return { kind: 'group', elementId: groupId, taskId, groupType, linkType };
      }

      // Затем проверяем карточку задачи
      const cardEl = htmlEl.closest?.('[data-issue-key]') as HTMLElement | null;
      if (cardEl) {
        const issueKey = cardEl.getAttribute('data-issue-key') || '';
        const taskId = cardEl.getAttribute('data-task-id') || '';
        if (sourceIssueKeys.has(issueKey)) continue;
        return { kind: 'card', elementId: issueKey, taskId, issueKey };
      }
    }
    return null;
  }, [nodes]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ref = ghostDragRef.current;
      if (!ref) return;

      if (!ref.active) {
        const dx = e.clientX - ref.startX;
        const dy = e.clientY - ref.startY;
        if (Math.sqrt(dx * dx + dy * dy) < GHOST_DRAG_THRESHOLD) return;
        ref.active = true;
        setGhostDragActive(true);
        setGhostCards(ref.cards);
      }

      if (ghostElRef.current) {
        ghostElRef.current.style.left = `${e.clientX}px`;
        ghostElRef.current.style.top = `${e.clientY}px`;
      }

      const sourceKeys = new Set(ref.cards.map(c => c.issueKey));
      const target = findDropTargetUnderCursor(e.clientX, e.clientY, sourceKeys);
      const newHighlight = target ? target.elementId : null;
      // Подсветка группы через DragContext
      setDropTarget(target?.kind === 'group' ? target.elementId : null);
      // Подсветка карточки через DOM-класс
      const prevHighlight = ghostDropTargetGroupRef.current;
      if (prevHighlight !== newHighlight) {
        if (prevHighlight) {
          document.querySelector(`[data-issue-key="${prevHighlight}"]`)?.classList.remove('ghost-drop-card-highlight');
        }
        if (target?.kind === 'card' && target.issueKey) {
          document.querySelector(`[data-issue-key="${target.issueKey}"]`)?.classList.add('ghost-drop-card-highlight');
        }
        ghostDropTargetGroupRef.current = newHighlight;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const ref = ghostDragRef.current;
      if (!ref) return;

      if (ref.active) {
        const sourceKeys = new Set(ref.cards.map(c => c.issueKey));
        const target = findDropTargetUnderCursor(e.clientX, e.clientY, sourceKeys);
        if (target && target.taskId && onCreateLink) {
          const targetTask = tasks.find(t => t.id === target.taskId);
          if (targetTask) {
            const linkType = target.kind === 'group' && target.groupType === 'subtask'
              ? 'Child'
              : target.linkType || 'Relates';
            // Перетаскиваемые задачи — конечные (связь идёт от target к ним)
            const isOutward = true;
            ref.cards.forEach(card => {
              onCreateLink(target.taskId, card.issueKey, linkType, isOutward);
            });
            clearSelection();
          }
        }

        setTimeout(() => {
          setGhostDragActive(false);
          setGhostCards([]);
          // Убираем подсветку карточки
          document.querySelectorAll('.ghost-drop-card-highlight').forEach(el => el.classList.remove('ghost-drop-card-highlight'));
          ghostDropTargetGroupRef.current = null;
          setDropTarget(null);
        }, 50);
      }

      ghostDragRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [findDropTargetUnderCursor, tasks, onCreateLink, clearSelection]);

  // Контекст для drag & drop
  const dragContextValue = useMemo(() => ({
    draggedNode,
    dropTarget,
    setDropTarget,
  }), [draggedNode, dropTarget]);

  // Контекст для ghost-drag карточек
  const ghostDragContextValue = useMemo<GhostDragContextType>(() => ({
    onCardMouseDown: handleCardMouseDown,
    isDragging: ghostDragActive,
  }), [handleCardMouseDown, ghostDragActive]);

  // Состояние пользовательских цветов узлов (nodeId → hex-цвет)
  const [nodeColors, setNodeColorsMap] = useState<Record<string, string>>({});

  const setNodeColor = useCallback((nodeId: string, color: string) => {
    setNodeColorsMap(prev => ({ ...prev, [nodeId]: color }));
  }, []);

  const resetNodeColor = useCallback((nodeId: string) => {
    setNodeColorsMap(prev => {
      const { [nodeId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const nodeColorContextValue = useMemo(() => ({
    nodeColors,
    setNodeColor,
    resetNodeColor,
  }), [nodeColors, setNodeColor, resetNodeColor]);

  // Для совместимости - используем первую задачу
  const allLinks = tasks.flatMap(t => t.links);

  // Получаем baseUrl из конфигурации текущей вкладки
  const jiraBaseUrl = useMemo(() => {
    try {
      const config = secureSessionStorage.getItem('jiraConfig');
      return config ? JSON.parse(config).baseUrl : '';
    } catch {
      return '';
    }
  }, []);

  // Собираем все задачи на экране для быстрого выбора
  const existingIssues = useMemo(() => {
    const issues: JiraIssue[] = [];
    allLinks.forEach(link => {
      if (link.outwardIssue) issues.push(link.outwardIssue);
      if (link.inwardIssue) issues.push(link.inwardIssue);
    });
    // Добавляем root issues всех задач
    tasks.forEach(t => issues.push(t.rootIssue));
    // Убираем дубликаты
    const seen = new Set<string>();
    return issues.filter(i => {
      if (seen.has(i.key)) return false;
      seen.add(i.key);
      return true;
    });
  }, [allLinks, tasks]);

  const linkChangeContextValue = useMemo(() => ({
    onChangeLinkType: onChangeLinkType || (() => {}),
    onDeleteLink: onDeleteLink || (() => {}),
    onLoadTask: onLoadTask || (() => {}),
    onDeleteIssue: onDeleteIssue || (() => {}),
    onDropToGroup: onDropToGroup || (() => {}),
    onCreateLink: onCreateLink || (() => {}),
    onCrossLink: onCrossLink,
    jiraBaseUrl,
    existingIssues,
    allTasks: tasks,
  }), [onChangeLinkType, onDeleteLink, onLoadTask, onDeleteIssue, onDropToGroup, onCreateLink, onCrossLink, jiraBaseUrl, existingIssues, tasks]);

  // Динамические рёбра между дубликатами при наведении —
  // соединяем от ближайших рёбер по минимальной траектории
  const duplicateEdges = useMemo<Edge[]>(() => {
    if (!highlightedIssueKey) return [];
    const dims = getLayoutDimensions(getDetailLevel(zoom));
    const matchingNodes = nodes.filter(
      n => n.type === 'issue' && n.data?.issue?.key === highlightedIssueKey
    );
    if (matchingNodes.length < 2) return [];

    // Вычисляем центры 4-х сторон узла
    const getSideCenters = (n: Node) => {
      const w = n.width || dims.NODE_WIDTH;
      const h = n.height || dims.NODE_HEIGHT;
      const cx = n.position.x + w / 2;
      const cy = n.position.y + h / 2;
      return {
        top:    { x: cx, y: n.position.y,     handleSrc: 'top-source', handleTgt: 'top' },
        bottom: { x: cx, y: n.position.y + h, handleSrc: 'bottom',    handleTgt: 'bottom-target' },
        left:   { x: n.position.x, y: cy,     handleSrc: 'left-source', handleTgt: 'left' },
        right:  { x: n.position.x + w, y: cy, handleSrc: 'right',     handleTgt: 'right-target' },
      };
    };

    // Для каждой пары находим ближайшие стороны
    const dupEdges: Edge[] = [];
    for (let i = 0; i < matchingNodes.length; i++) {
      for (let j = i + 1; j < matchingNodes.length; j++) {
        const sidesA = getSideCenters(matchingNodes[i]);
        const sidesB = getSideCenters(matchingNodes[j]);

        let bestDist = Infinity;
        let bestSrcHandle = 'bottom';
        let bestTgtHandle = 'top';

        const sideKeysA = Object.keys(sidesA) as Array<keyof typeof sidesA>;
        const sideKeysB = Object.keys(sidesB) as Array<keyof typeof sidesB>;

        for (const sA of sideKeysA) {
          for (const sB of sideKeysB) {
            const dx = sidesA[sA].x - sidesB[sB].x;
            const dy = sidesA[sA].y - sidesB[sB].y;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
              bestDist = dist;
              bestSrcHandle = sidesA[sA].handleSrc;
              bestTgtHandle = sidesB[sB].handleTgt;
            }
          }
        }

        dupEdges.push({
          id: `duplicate-edge-${matchingNodes[i].id}-${matchingNodes[j].id}`,
          source: matchingNodes[i].id,
          target: matchingNodes[j].id,
          sourceHandle: bestSrcHandle,
          targetHandle: bestTgtHandle,
          type: 'default',
          animated: true,
          style: {
            stroke: '#FF9800',
            strokeWidth: 1.5,
            strokeDasharray: '8,4',
            opacity: 0.7,
          },
          zIndex: 1000,
        });
      }
    }
    return dupEdges;
  }, [highlightedIssueKey, nodes, zoom]);

  // Ноды и рёбра для отображения
  const visibleNodes = nodes;
  const visibleEdges = useMemo(() => {
    const all = [...edges, ...duplicateEdges];
    if (!hoveredEdgeId) return all;
    return all.map((e) => (e.id === hoveredEdgeId ? { ...e, zIndex: 1000 } : e));
  }, [edges, duplicateEdges, hoveredEdgeId]);

  const collapsedContextValue = useMemo(() => ({
    collapsedGroups,
    toggleGroup,
  }), [collapsedGroups, toggleGroup]);

  const selectionContextValue = useMemo(() => ({
    selectedCards,
    toggleSelection,
    clearSelection,
    isSelected,
  }), [selectedCards, toggleSelection, clearSelection, isSelected]);

  const duplicateHighlightContextValue = useMemo(() => ({
    highlightedIssueKey,
    setHighlightedIssueKey,
    duplicateIssueKeys,
    duplicateCounts,
  }), [highlightedIssueKey, duplicateIssueKeys, duplicateCounts]);

  const hoveredChangeContextValue = useMemo(() => ({
    hoveredChange,
    setHoveredChange,
  }), [hoveredChange]);

  const hoveredEdgeContextValue = useMemo(() => ({
    hoveredEdgeId,
    setHoveredEdgeId,
  }), [hoveredEdgeId]);

  // Обработчик клика на пустую область - сброс выбора
  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const { t } = useTranslation();

  return (
    <NodeColorContext.Provider value={nodeColorContextValue}>
    <ZoomContext.Provider value={zoom}>
      <DragContext.Provider value={dragContextValue}>
      <GhostDragContext.Provider value={ghostDragContextValue}>
        <LinkChangeContext.Provider value={linkChangeContextValue}>
          <CollapsedGroupsContext.Provider value={collapsedContextValue}>
            <SelectionContext.Provider value={selectionContextValue}>
              <DuplicateHighlightContext.Provider value={duplicateHighlightContextValue}>
              <HighlightedTaskContext.Provider value={highlightedTaskId}>
              <HoveredChangeContext.Provider value={hoveredChangeContextValue}>
              <HoveredEdgeContext.Provider value={hoveredEdgeContextValue}>
              <HoverTaskContext.Provider value={onHoverTask || (() => {})}>
              <UndoRedoContext.Provider value={undoRedoContextValue}>
                <div className="mindmap-container">
                
                {/* Контейнер для нижних панелей */}
                <div className={`bottom-bars-container ${(pendingChanges.length > 0 || refreshCountdown > 0) && selectedCards.length > 0 ? 'split-bars' : ''}`}>
                  {(pendingChanges.length > 0 || refreshCountdown > 0) && onApplyChanges && onCancelAllChanges && (
                    <ApplyBar
                      pendingChanges={pendingChanges}
                      applying={applying}
                      onApply={onApplyChanges}
                      onCancel={onCancelAllChanges}
                      onCancelChange={onCancelChange}
                      hasActionBar={selectedCards.length > 0}
                      refreshCountdown={refreshCountdown}
                    />
                  )}
                  
                  {selectedCards.length > 0 && (
                    <ActionBar
                      selectedCards={selectedCards}
                      onClearSelection={clearSelection}
                      onLoadTask={onLoadTask}
                      onLoadParentChain={onLoadParentChain}
                      onDeleteLink={onDeleteLink}
                      onDeleteIssue={handleDeleteIssueWithUndo}
                      onCreateLink={onCreateLink}
                      onCrossLink={onCrossLink}
                      onAddChild={onAddChild}
                      onChangeIssueType={onChangeIssueType}
                      existingIssues={existingIssues}
                      jiraBaseUrl={jiraBaseUrl}
                      hasApplyBar={pendingChanges.length > 0}
                      onPreviewTask={onPreviewTask}
                    />
                  )}
                </div>
                
                  <ReactFlow
                  nodes={visibleNodes}
                  edges={visibleEdges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onPaneClick={handlePaneClick}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  connectionMode={ConnectionMode.Loose}
                  fitView
                  fitViewOptions={{ padding: 0.15 }}
                  minZoom={0.2}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  onMove={(_, viewport) => setZoom(viewport.zoom)}
                  panOnDrag={true}
                  selectionOnDrag={false}
                  selectionMode={SelectionMode.Partial}
                  multiSelectionKeyCode="Control"
                  selectionKeyCode="Shift"
                  deleteKeyCode={null}
                  selectNodesOnDrag={false}
                >
                  <FitViewOnTasksChange tasksCount={tasks.length} nodesCount={initialNodes.length} />
                  <ScrollToHighlightedTask />
                  <Background color={flowBgColor} gap={24} size={1.5} />
                  <CustomControls />
                </ReactFlow>

                {/* Ghost-элемент при перетаскивании карточки */}
                {ghostDragActive && ghostCards.length > 0 && (
                  <div
                    ref={ghostElRef}
                    className="ghost-drag-card"
                    style={{ borderColor: ghostCards[0].nodeType === 'subtask' ? COLORS.subtask : ghostCards[0].nodeType === 'link' ? COLORS.link : COLORS.root }}
                  >
                    <div className="ghost-drag-header">
                      <span className="ghost-drag-icon"><i className={`lni ${getTypeIcon(ghostCards[0].issue.issueType)}`} aria-hidden /></span>
                      <span className="ghost-drag-key">
                        {ghostCards.length > 1
                          ? `${ghostCards[0].issueKey} +${ghostCards.length - 1}`
                          : ghostCards[0].issueKey}
                      </span>
                      <span className="ghost-drag-status" style={{ backgroundColor: getStatusColor(ghostCards[0].issue.status) }}>
                        {ghostCards[0].issue.status}
                      </span>
                    </div>
                    <div className="ghost-drag-summary">
                      {ghostCards.length > 1
                        ? t('mindmap.dragCardsCount', { count: ghostCards.length }) || `${ghostCards.length} карточек`
                        : ghostCards[0].issue.summary.length > 50
                          ? ghostCards[0].issue.summary.substring(0, 50) + '...'
                          : ghostCards[0].issue.summary}
                    </div>
                  </div>
                )}

                </div>
              </UndoRedoContext.Provider>
              </HoverTaskContext.Provider>
              </HoveredEdgeContext.Provider>
              </HoveredChangeContext.Provider>
              </HighlightedTaskContext.Provider>
              </DuplicateHighlightContext.Provider>
            </SelectionContext.Provider>
          </CollapsedGroupsContext.Provider>
        </LinkChangeContext.Provider>
      </GhostDragContext.Provider>
      </DragContext.Provider>
    </ZoomContext.Provider>
    </NodeColorContext.Provider>
  );
};
