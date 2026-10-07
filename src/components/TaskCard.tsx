import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { JiraIssue } from '../types';
import { useTranslation } from '../i18n';
import './TaskCard.css';

interface TaskCardData {
  label: string;
  issue: JiraIssue;
  issueKey?: string | null; // Для отслеживания дубликатов
  isHighlighted?: boolean;
  isDuplicate?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const TaskCardComponent: React.FC<NodeProps<TaskCardData>> = ({ data }) => {
  const { issue, isHighlighted, isDuplicate, onMouseEnter, onMouseLeave } = data;
  const { t } = useTranslation();

  const getStatusColor = (status: string): string => {
    const statusLower = status.toLowerCase();

    // Готово/Закрыто - зеленый
    if (statusLower.includes('done') || statusLower.includes('закрыт') ||
        statusLower.includes('готово') || statusLower.includes('completed') ||
        statusLower.includes('завершен')) return '#0e8750';

    // В работе/Выполняется - синий
    if (statusLower.includes('progress') || statusLower.includes('в работе') ||
        statusLower.includes('выполняется') || statusLower.includes('in progress')) return '#0052cc';

    // К выполнению/To Do - серый
    if (statusLower.includes('to do') || statusLower.includes('к выполнению') ||
        statusLower.includes('open') || statusLower.includes('новый')) return '#42526e';

    // По умолчанию - серый
    return '#6b778c';
  };

  const getPriorityColor = (priority?: string): string => {
    if (!priority) return '#6b778c';
    const priorityLower = priority.toLowerCase();
    if (priorityLower.includes('highest') || priorityLower.includes('критический')) return '#de350b';
    if (priorityLower.includes('high') || priorityLower.includes('высокий')) return '#ff5630';
    if (priorityLower.includes('medium') || priorityLower.includes('средний')) return '#ffab00';
    return '#6b778c';
  };

  // Формируем классы для карточки
  const cardClasses = [
    'task-card',
    isHighlighted ? 'task-card-highlighted' : '',
    isDuplicate ? 'task-card-duplicate' : '',
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={cardClasses}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Handle type="target" position={Position.Top} />
      <div className="task-card-header">
        <span className="task-key">{issue.key}</span>
        <span 
          className="task-status" 
          style={{ backgroundColor: getStatusColor(issue.status) }}
        >
          {issue.status}
        </span>
      </div>
      <div className="task-summary">{issue.summary}</div>
      <div className="task-meta">
        <div className="task-type">{issue.issueType}</div>
        {issue.priority && (
          <div 
            className="task-priority"
            style={{ color: getPriorityColor(issue.priority) }}
          >
            {issue.priority}
          </div>
        )}
      </div>
      <div className="task-assignee">
        {issue.assignee ? (
          <>
            {issue.assigneeAvatarUrl ? (
              <img
                src={issue.assigneeAvatarUrl}
                alt={issue.assignee}
                className="assignee-avatar"
                onError={(e) => {
                  // Fallback to icon if avatar fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const iconSpan = document.createElement('span');
                    iconSpan.textContent = '👤';
                    parent.insertBefore(iconSpan, parent.firstChild);
                  }
                }}
              />
            ) : (
              <span className="assignee-icon">👤</span>
            )}
            <span className="assignee-name">{issue.assignee}</span>
          </>
        ) : (
          <>
            <span className="assignee-icon">👤</span>
            <span className="assignee-name unassigned">{t('taskCard.unassigned')}</span>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const TaskCard = React.memo(TaskCardComponent);


