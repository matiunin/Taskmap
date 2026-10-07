import React, { useCallback, useMemo, useState, useEffect, createContext, useContext } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  MarkerType,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TaskCard } from './TaskCard';
import { JiraIssue, JiraIssueLink, GraphNode, GraphEdge } from '../types';
import './TaskGraph.css';

interface TaskGraphProps {
  rootIssue: JiraIssue;
  links: JiraIssueLink[];
}

// Контекст для передачи информации о подсвечиваемой задаче
interface HighlightContextType {
  highlightedKey: string | null;
  setHighlightedKey: (key: string | null) => void;
  duplicateKeys: Set<string>;
}

export const HighlightContext = createContext<HighlightContextType>({
  highlightedKey: null,
  setHighlightedKey: () => {},
  duplicateKeys: new Set(),
});

export const useHighlight = () => useContext(HighlightContext);

const nodeTypes: NodeTypes = {
  default: TaskCard,
};

export const TaskGraph: React.FC<TaskGraphProps> = ({ rootIssue, links }) => {
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  const { nodes: initialNodes, edges: initialEdges, duplicateKeys } = useMemo(() => {
    const nodesMap = new Map<string, GraphNode>();
    const edgesList: GraphEdge[] = [];

    // Добавляем корневую задачу
    nodesMap.set(rootIssue.key, {
      id: rootIssue.key,
      type: 'default',
      position: { x: 400, y: 100 },
      data: {
        label: rootIssue.key,
        issue: rootIssue,
        issueKey: rootIssue.key, // Для подсветки дубликатов
      },
    });

    // Группируем связи по типу и направлению
    const linkGroups = new Map<string, { links: typeof links, color: string, style: string, label: string, direction: 'outward' | 'inward' }>();

    links.forEach((link, index) => {
      let edgeColor = '#6b778c';
      let edgeStyle = 'solid';
      let edgeLabel = '';
      let groupKey = '';
      let direction: 'outward' | 'inward' = 'outward';

      const linkType = link.type.name.toLowerCase();
      const linkTypeId = link.type.id?.toLowerCase() || '';

      // Определяем направление связи и правильное название
      if (link.outwardIssue && link.outwardIssue.key !== rootIssue.key) {
        // Исходящая связь: текущая задача -> другая задача
        edgeLabel = link.type.outward || link.type.name;
        groupKey = `outward-${link.type.id}-${edgeLabel}`;
        direction = 'outward';
      } else if (link.inwardIssue && link.inwardIssue.key !== rootIssue.key) {
        // Входящая связь: другая задача -> текущая задача
        edgeLabel = link.type.inward || link.type.name;
        groupKey = `inward-${link.type.id}-${edgeLabel}`;
        direction = 'inward';
      } else {
        return; // Пропускаем связи с самим собой
      }

      // Для дочерних задач используем правильные названия из Jira
      const isChildLink = linkTypeId === 'subtask' || linkType.includes('sub-task') || linkType.includes('subtask') ||
                         linkType.includes('parent-child') || linkTypeId.includes('parent-child') ||
                         linkType.includes('child') || linkTypeId.includes('child') ||
                         linkTypeId === 'epic-link' || linkType.includes('epic') || linkType.includes('эпик');

      // Определяем цвет в зависимости от типа связи
      if (isChildLink) {
        edgeColor = '#36b37e';
        edgeStyle = 'solid';
      } else if (linkType.includes('blocks') || linkType.includes('блокирует') ||
                 linkType.includes('is blocked by') || linkType.includes('блокируется')) {
        edgeColor = '#de350b';
        edgeStyle = 'solid';
      } else if (linkType.includes('relates') || linkType.includes('связана') || linkType.includes('relates to')) {
        edgeColor = '#0052cc';
        edgeStyle = 'dashed';
      } else if (linkType.includes('duplicates') || linkType.includes('дублирует') ||
                 linkType.includes('is duplicated by') || linkType.includes('дублируется')) {
        edgeColor = '#ff5630';
        edgeStyle = 'dotted';
      } else if (linkType.includes('clones') || linkType.includes('клонирует') ||
                 linkType.includes('is cloned by') || linkType.includes('клонируется')) {
        edgeColor = '#ffab00';
        edgeStyle = 'dashed';
      } else if (linkType.includes('depends') || linkType.includes('зависит') ||
                 linkType.includes('is depended') || linkType.includes('зависимая')) {
        edgeColor = '#ff991f';
        edgeStyle = 'solid';
      }

      if (!linkGroups.has(groupKey)) {
        linkGroups.set(groupKey, { links: [], color: edgeColor, style: edgeStyle, label: edgeLabel, direction });
      }
      linkGroups.get(groupKey)!.links.push(link);
    });

    // 🎨 Улучшенная круговая система расположения для минимизации пересечений

    // Центральная задача в центре
    const centerX = 400;
    const centerY = 150;

    // Радиусы для расположения
    const groupRadius = 280; // Расстояние до промежуточных узлов групп
    const taskRadius = 450;  // Расстояние до задач

    // Распределяем группы равномерно по кругу
    let groupAngle = 0;
    const angleStep = linkGroups.size > 0 ? 360 / linkGroups.size : 0;

    linkGroups.forEach((group, groupKey) => {
      // Определяем тип группы
      const isSubtaskGroup = group.label.includes('child of') ||
                            group.label.includes('parent of') ||
                            group.label.includes('sub-task of') ||
                            group.label.includes('subtask') ||
                            group.label.includes('belongs to epic') ||
                            group.label.includes('has in epic') ||
                            group.label.includes('epic link') ||
                            group.label.includes('эпик');

      if (isSubtaskGroup) {
        // 🎯 Дочерние задачи: прямые плавные связи без промежуточных узлов

        group.links.forEach((link, linkIndex) => {
          const subtask = group.direction === 'outward' ? link.outwardIssue : link.inwardIssue;
          if (!subtask) return;

          // Располагаем задачи по кругу для равномерного распределения
          const taskAngle = groupAngle + (linkIndex * 25) - ((group.links.length - 1) * 12.5);
          const x = centerX + taskRadius * Math.cos((taskAngle * Math.PI) / 180);
          const y = centerY + taskRadius * Math.sin((taskAngle * Math.PI) / 180);

          // Уникальный id для узла (позволяет одной задаче появляться несколько раз)
          const nodeId = `child-${groupKey}-${link.id}-${subtask.key}`;
          
          nodesMap.set(nodeId, {
            id: nodeId,
            type: 'default',
            position: { x, y },
            data: {
              label: subtask.key,
              issue: subtask,
              issueKey: subtask.key, // Сохраняем оригинальный ключ для подсветки дубликатов
            },
          });

          // Плавная кривая напрямую к задаче
          edgesList.push({
            id: `edge-child-${rootIssue.key}-to-${nodeId}`,
            source: rootIssue.key,
            target: nodeId,
            type: 'smoothstep', // Плавная кривая
            label: group.label,
            style: {
              stroke: group.color,
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: group.color,
            },
          });
        });
      } else {
        // 📦 Другие связи: группировка через промежуточный узел

        // Создаем промежуточный узел группы на окружности
        const groupNodeId = `group-${groupKey}`;
        const groupX = centerX + groupRadius * Math.cos((groupAngle * Math.PI) / 180);
        const groupY = centerY + groupRadius * Math.sin((groupAngle * Math.PI) / 180);

        const groupNode: GraphNode = {
          id: groupNodeId,
          type: 'default',
          position: { x: groupX, y: groupY },
          data: {
            label: `${group.label}\n(${group.links.length})`,
            issue: {
              id: groupNodeId,
              key: group.label,
              summary: `${group.label} (${group.links.length} задач)`,
              status: '',
              issueType: 'Группа связей',
            },
            issueKey: null, // Группа не участвует в подсветке дубликатов
          },
        };

        nodesMap.set(groupNodeId, groupNode);

        // Плавная кривая от центра к группе (жирная линия)
        edgesList.push({
          id: `edge-center-to-group-${groupKey}`,
          source: rootIssue.key,
          target: groupNodeId,
          type: 'smoothstep',
          label: `${group.label} (${group.links.length})`,
          style: {
            stroke: group.color,
            strokeWidth: 4, // Толстая линия к группе
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: group.color,
          },
        });

        // Располагаем задачи группы по малому кругу вокруг узла группы
        const taskAngleStep = group.links.length > 1 ? 360 / group.links.length : 0;

        group.links.forEach((link, linkIndex) => {
          const targetIssue = group.direction === 'outward' ? link.outwardIssue : link.inwardIssue;
          if (!targetIssue) return;

          // Уникальный id для узла (позволяет одной задаче появляться несколько раз)
          const nodeId = `linked-${groupKey}-${link.id}-${targetIssue.key}`;
          
          // Малый круг вокруг группы
          const taskAngle = linkIndex * taskAngleStep;
          const taskX = groupX + 100 * Math.cos((taskAngle * Math.PI) / 180);
          const taskY = groupY + 100 * Math.sin((taskAngle * Math.PI) / 180);

          nodesMap.set(nodeId, {
            id: nodeId,
            type: 'default',
            position: { x: taskX, y: taskY },
            data: {
              label: targetIssue.key,
              issue: targetIssue,
              issueKey: targetIssue.key, // Сохраняем оригинальный ключ для подсветки дубликатов
            },
          });

          // Тонкая плавная линия от группы к задаче
          edgesList.push({
            id: `edge-group-${groupKey}-to-${nodeId}`,
            source: groupNodeId,
            target: nodeId,
            type: 'smoothstep',
            style: {
              stroke: group.color,
              strokeWidth: 1,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: group.color,
            },
          });
        });
      }

      groupAngle += angleStep;
    });

    // Вычисляем ключи задач, которые встречаются несколько раз (дубликаты)
    const keyCounts = new Map<string, number>();
    nodesMap.forEach((node) => {
      // Используем issueKey из data (или fallback на issue.key)
      const issueKey = node.data.issueKey || node.data.issue?.key;
      if (issueKey && !node.id.startsWith('group-')) {
        keyCounts.set(issueKey, (keyCounts.get(issueKey) || 0) + 1);
      }
    });
    
    const duplicateKeys = new Set<string>();
    keyCounts.forEach((count, key) => {
      if (count > 1) {
        duplicateKeys.add(key);
      }
    });

    return {
      nodes: Array.from(nodesMap.values()) as Node[],
      edges: edgesList as Edge[],
      duplicateKeys,
    };
  }, [rootIssue, links]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  // Обновляем данные узлов с информацией о подсветке
  const nodesWithHighlight = useMemo(() => {
    return nodes.map((node) => {
      // Используем issueKey из data (или fallback на issue.key)
      const issueKey = node.data.issueKey || node.data.issue?.key;
      const isHighlighted = highlightedKey !== null && issueKey === highlightedKey;
      const isDuplicate = issueKey && duplicateKeys.has(issueKey);
      
      return {
        ...node,
        data: {
          ...node.data,
          isHighlighted,
          isDuplicate,
          onMouseEnter: isDuplicate ? () => setHighlightedKey(issueKey) : undefined,
          onMouseLeave: isDuplicate ? () => setHighlightedKey(null) : undefined,
        },
      };
    });
  }, [nodes, highlightedKey, duplicateKeys]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const highlightContextValue = useMemo(() => ({
    highlightedKey,
    setHighlightedKey,
    duplicateKeys,
  }), [highlightedKey, duplicateKeys]);

  return (
    <HighlightContext.Provider value={highlightContextValue}>
      <div className="task-graph">
        <ReactFlow
          nodes={nodesWithHighlight}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { strokeWidth: 2 },
          }}
          fitView
          fitViewOptions={{
            padding: 0.2,
            includeHiddenNodes: false,
          }}
          attributionPosition="bottom-left"
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          maxZoom={3}
          panOnDrag={[1, 2]}
          selectionOnDrag={false}
          panOnScroll={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          preventScrolling={false}
        >
          <Background color="#cbd5e0" />
          <Controls
            position="bottom-left"
            showZoom
            showFitView
            showInteractive
          />
          <MiniMap
            position="bottom-right"
            nodeColor="#cbd5e0"
            maskColor="rgba(255, 255, 255, 0.8)"
            pannable
            zoomable
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            }}
          />
        </ReactFlow>
      </div>
    </HighlightContext.Provider>
  );
};

