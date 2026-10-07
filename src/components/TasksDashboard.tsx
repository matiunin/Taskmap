import React, { useState, useEffect, useCallback } from 'react';
import { jiraApi } from '../utils/jiraApi';
import { JiraIssue, JiraConfig } from '../types';
import { useTranslation } from '../i18n';
import { getTypeIcon } from './MindMap/constants';
import './TasksDashboard.css';

interface TasksDashboardProps {
  config: JiraConfig | null;
  onLoadTask: (issueKey: string) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

type TabType = 'recent' | 'assigned';

// Иконка типа задачи (Lineicons)
const IssueTypeIcon: React.FC<{ type: string }> = ({ type }) => {
  const iconClass = getTypeIcon(type);
  const typeLower = type.toLowerCase();
  let variant = 'task';
  if (typeLower.includes('bug') || typeLower.includes('баг')) variant = 'bug';
  else if (typeLower.includes('epic') || typeLower.includes('эпик')) variant = 'epic';
  else if (typeLower.includes('story') || typeLower.includes('истор')) variant = 'story';
  else if (typeLower.includes('sub-task') || typeLower.includes('subtask') || typeLower.includes('подзадач')) variant = 'subtask';
  return <span className={`issue-type-icon ${variant}`}><i className={`lni ${iconClass}`} aria-hidden /></span>;
};

// Статус-бейдж
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const statusLower = status.toLowerCase();
  
  let className = 'status-badge';
  if (statusLower.includes('done') || statusLower.includes('готово') || statusLower.includes('closed') || statusLower.includes('закрыт')) {
    className += ' done';
  } else if (statusLower.includes('progress') || statusLower.includes('работе') || statusLower.includes('review')) {
    className += ' in-progress';
  } else if (statusLower.includes('block') || statusLower.includes('заблок')) {
    className += ' blocked';
  } else {
    className += ' todo';
  }
  
  return <span className={className}>{status}</span>;
};

// Вариант типа для data-атрибута (цвет бордера)
const getIssueTypeVariant = (type: string): string => {
  const t = type.toLowerCase();
  if (t.includes('bug') || t.includes('баг')) return 'bug';
  if (t.includes('epic') || t.includes('эпик')) return 'epic';
  if (t.includes('story') || t.includes('истор')) return 'story';
  if (t.includes('sub-task') || t.includes('subtask') || t.includes('подзадач')) return 'subtask';
  return 'task';
};

// Компонент одной задачи в списке
const TaskItem: React.FC<{
  issue: JiraIssue;
  baseUrl: string;
  onClick: () => void;
}> = ({ issue, baseUrl, onClick }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${baseUrl}/browse/${issue.key}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`task-item task-item--${getIssueTypeVariant(issue.issueType)}`} onClick={onClick}>
      <div className="task-item-header">
        <IssueTypeIcon type={issue.issueType} />
        <span className="task-item-key">{issue.key}</span>
        <button 
          className={`copy-url-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopyUrl}
          title={copied ? t('mindmap.copied') : t('mindmap.copyUrl')}
        >
          {copied ? <i className="lni lni-check" aria-hidden /> : <i className="lni lni-link-2-angular-right" aria-hidden />}
        </button>
        <StatusBadge status={issue.status} />
      </div>
      <div className="task-item-summary">{issue.summary}</div>
      {issue.assignee && (
        <div className="task-item-assignee">
          {issue.assigneeAvatarUrl && (
            <img 
              src={issue.assigneeAvatarUrl} 
              alt={issue.assignee}
              className="assignee-avatar"
            />
          )}
          <span className="assignee-name">{issue.assignee}</span>
        </div>
      )}
    </div>
  );
};

// Skeleton для загрузки
const TaskItemSkeleton: React.FC = () => (
  <div className="task-item task-item--task skeleton">
    <div className="task-item-header">
      <div className="skeleton-icon" />
      <div className="skeleton-key" />
      <div className="skeleton-status" />
    </div>
    <div className="skeleton-summary" />
  </div>
);

const COLLAPSED_KEY = 'tasksDashboardCollapsed';

export const TasksDashboard: React.FC<TasksDashboardProps> = ({ config, onLoadTask, isCollapsed: externalCollapsed, onToggleCollapsed: externalToggle }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('recent');
  const [recentIssues, setRecentIssues] = useState<JiraIssue[]>([]);
  const [assignedIssues, setAssignedIssues] = useState<JiraIssue[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [errorRecent, setErrorRecent] = useState<string | null>(null);
  const [errorAssigned, setErrorAssigned] = useState<string | null>(null);
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    return saved === 'true';
  });

  // Используем внешнее состояние если передано, иначе внутреннее
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const toggleCollapsed = () => {
    if (externalToggle) {
      externalToggle();
    } else {
      setInternalCollapsed(prev => {
        const newValue = !prev;
        localStorage.setItem(COLLAPSED_KEY, String(newValue));
        return newValue;
      });
    }
  };

  // Загрузка недавно просмотренных
  const loadRecentIssues = useCallback(async () => {
    if (!config) return;
    
    setLoadingRecent(true);
    setErrorRecent(null);
    
    try {
      const issues = await jiraApi.getRecentlyViewedIssues(15);
      setRecentIssues(issues);
    } catch (err: any) {
      setErrorRecent(err.message || t('notification.loadError'));
    } finally {
      setLoadingRecent(false);
    }
  }, [config, t]);

  // Загрузка назначенных задач
  const loadAssignedIssues = useCallback(async () => {
    if (!config) return;
    
    setLoadingAssigned(true);
    setErrorAssigned(null);
    
    try {
      const issues = await jiraApi.getMyAssignedIssues(20);
      setAssignedIssues(issues);
    } catch (err: any) {
      setErrorAssigned(err.message || t('notification.loadError'));
    } finally {
      setLoadingAssigned(false);
    }
  }, [config, t]);

  // Загружаем данные при монтировании и смене таба
  useEffect(() => {
    if (config) {
      // Загружаем обе вкладки сразу для лучшего UX
      loadRecentIssues();
      loadAssignedIssues();
    }
  }, [config, loadRecentIssues, loadAssignedIssues]);

  const handleTaskClick = (issueKey: string) => {
    onLoadTask(issueKey);
  };

  const renderContent = () => {
    const isRecent = activeTab === 'recent';
    const issues = isRecent ? recentIssues : assignedIssues;
    const loading = isRecent ? loadingRecent : loadingAssigned;
    const error = isRecent ? errorRecent : errorAssigned;

    if (loading && issues.length === 0) {
      return (
        <div className="tasks-list">
          {[1, 2, 3, 4, 5].map(i => (
            <TaskItemSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="tasks-error">
          <i className="lni lni-ban-2 error-icon" aria-hidden />
          <p>{error}</p>
          <button 
            className="retry-button" 
            onClick={isRecent ? loadRecentIssues : loadAssignedIssues}
          >
            {t('tasksDashboard.retry')}
          </button>
        </div>
      );
    }

    if (issues.length === 0) {
      return (
        <div className="tasks-empty">
          <i className="lni lni-file-multiple empty-icon" aria-hidden />
          <p>{isRecent ? t('tasksDashboard.noRecentTasks') : t('tasksDashboard.noAssignedTasks')}</p>
        </div>
      );
    }

    return (
      <div className="tasks-list">
        {issues.map(issue => (
          <TaskItem
            key={issue.key}
            issue={issue}
            baseUrl={config?.baseUrl || ''}
            onClick={() => handleTaskClick(issue.key)}
          />
        ))}
      </div>
    );
  };

  if (!config) {
    return null;
  }

  return (
    <div 
      className={`tasks-dashboard ${isCollapsed ? 'collapsed' : ''}`}
      onClick={isCollapsed ? toggleCollapsed : undefined}
    >
      {/* Кнопка сворачивания */}
      <button 
        className="collapse-btn"
        onClick={(e) => {
          e.stopPropagation();
          toggleCollapsed();
        }}
        title={isCollapsed ? t('tasksDashboard.expand') : t('tasksDashboard.collapse')}
      >
        {isCollapsed ? (
          <svg className="collapse-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 6 15 12 9 18" />
          </svg>
        ) : (
          <svg className="collapse-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="15 6 9 12 15 18" />
          </svg>
        )}
      </button>

      {!isCollapsed && (
        <>
          <div className="tasks-tabs">
            <button
              className={`tasks-tab ${activeTab === 'recent' ? 'active' : ''}`}
              onClick={() => setActiveTab('recent')}
            >
              <i className="lni lni-alarm-1 tab-icon" aria-hidden />
              {t('tasksDashboard.recentlyViewed')}
              {recentIssues.length > 0 && (
                <span className="tab-count">{recentIssues.length}</span>
              )}
            </button>
            <button
              className={`tasks-tab ${activeTab === 'assigned' ? 'active' : ''}`}
              onClick={() => setActiveTab('assigned')}
            >
              <i className="lni lni-user-4 tab-icon" aria-hidden />
              {t('tasksDashboard.assignedToMe')}
              {assignedIssues.length > 0 && (
                <span className="tab-count">{assignedIssues.length}</span>
              )}
            </button>
          </div>
          
          <div className="tasks-content">
            {renderContent()}
          </div>
        </>
      )}
    </div>
  );
};
