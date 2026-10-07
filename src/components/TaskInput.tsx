import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TaskData, JiraConfig, JiraIssue } from '../types';
import { useTranslation } from '../i18n';
import { jiraApi } from '../utils/jiraApi';
import { getTaskColors } from '../utils/jira/taskColors';
import './TaskInput.css';

interface SearchFilters {
  project: string;
  status: string;
  priority: string;
  assignee: string;
  labels: string;
}

interface ProjectOption {
  key: string;
  name: string;
}

interface StatusOption {
  id: string;
  name: string;
}

interface StatusGroup {
  category: string;
  statuses: StatusOption[];
}

interface PriorityOption {
  id: string;
  name: string;
}

interface UserOption {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
}

interface JiraSearchResult {
  id: string;
  key: string;
  fields: {
    summary: string;
    status?: { name: string };
    issuetype?: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string; avatarUrls?: { '24x24': string } };
  };
}

function buildJqlFromFilters(filters: SearchFilters): string {
  const parts: string[] = [];

  if (filters.project) {
    parts.push(`project = "${filters.project}"`);
  }
  if (filters.status) {
    parts.push(`status = "${filters.status}"`);
  }
  if (filters.priority) {
    parts.push(`priority = "${filters.priority}"`);
  }
  if (filters.assignee) {
    parts.push(`assignee = "${filters.assignee}"`);
  }
  if (filters.labels?.trim()) {
    const labels = filters.labels.split(',').map(l => l.trim()).filter(Boolean);
    if (labels.length > 0) {
      const labelsPart = labels.map(l => `"${l}"`).join(', ');
      parts.push(`labels in (${labelsPart})`);
    }
  }

  return parts.length > 0
    ? parts.join(' AND ') + ' ORDER BY updated DESC'
    : '';
}

interface HistoryItem {
  key: string;
  summary: string;
  timestamp: number;
}

interface TaskInputProps {
  tasks: TaskData[];
  onLoadTask: (issueKey: string, taskId?: string) => void;
  onRemoveTask: (taskId: string) => void;
  loading: Record<string, boolean>;
  loadingKeys?: string[];
  onRefreshAll?: () => void;
  hoveredTaskId?: string | null;
  onOpenSettings?: () => void;
  config?: JiraConfig | null;
}

const HISTORY_KEY = 'jiraTaskHistory';
const MAX_HISTORY = 5;

// Получить историю из localStorage
const getHistory = (): HistoryItem[] => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

// Сохранить в историю
export const addToHistory = (key: string, summary: string) => {
  const history = getHistory();
  // Удаляем дубликат если есть
  const filtered = history.filter(h => h.key !== key);
  // Добавляем в начало
  const newHistory = [{ key, summary, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
};

export const TaskInput: React.FC<TaskInputProps> = ({
  tasks,
  onLoadTask,
  onRemoveTask,
  loading,
  loadingKeys = [],
  onRefreshAll,
  hoveredTaskId,
  onOpenSettings,
  config,
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Advanced search state
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [searchMode, setSearchMode] = useState<'filters' | 'jql'>('filters');
  const [searchResults, setSearchResults] = useState<JiraIssue[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Filter values
  const [filters, setFilters] = useState<SearchFilters>({
    project: '',
    status: '',
    priority: '',
    assignee: '',
    labels: '',
  });
  const [jqlInput, setJqlInput] = useState('');

  // Dropdown options
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [statuses, setStatuses] = useState<StatusGroup[]>([]);
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);

  // User search
  const [userQuery, setUserQuery] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchRef = useRef<HTMLDivElement>(null);

  const isAnyLoading = Object.values(loading).some(Boolean);

  // Загружаем историю при монтировании
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  // Закрытие при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
      if (userSearchRef.current && !userSearchRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load filter options when advanced search is opened
  useEffect(() => {
    if (showAdvancedSearch && projects.length === 0 && config) {
      setOptionsLoading(true);
      Promise.all([
        jiraApi.getProjects(),
        jiraApi.getStatuses(),
        jiraApi.getPriorities(),
      ]).then(([p, s, pr]) => {
        setProjects(p);
        setStatuses(s);
        setPriorities(pr);
      }).finally(() => {
        setOptionsLoading(false);
      });
    }
  }, [showAdvancedSearch, projects.length, config]);

  // Debounced user search
  useEffect(() => {
    if (userQuery.length < 2) {
      setUserOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      jiraApi.searchUsers(userQuery).then(setUserOptions);
    }, 300);
    return () => clearTimeout(timer);
  }, [userQuery]);

  const handleSearch = useCallback(async () => {
    const jql = searchMode === 'jql' ? jqlInput.trim() : buildJqlFromFilters(filters);
    if (!jql) return;

    setSearchLoading(true);
    try {
      const issues = await jiraApi.searchIssues(jql);
      const mapped: JiraIssue[] = issues.slice(0, 50).map((issue: JiraSearchResult) => ({
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        issueType: issue.fields.issuetype?.name || 'Task',
        priority: issue.fields.priority?.name,
        assignee: issue.fields.assignee?.displayName,
        assigneeAvatarUrl: issue.fields.assignee?.avatarUrls?.['24x24'],
      }));
      setSearchResults(mapped);
    } catch (error) {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchMode, jqlInput, filters]);

  const handleAddFromSearch = (issueKey: string) => {
    onLoadTask(issueKey);
    // Remove from results
    setSearchResults(prev => prev.filter(r => r.key !== issueKey));
  };

  const handleSelectUser = (user: UserOption) => {
    setFilters(prev => ({ ...prev, assignee: user.accountId }));
    setUserQuery(user.displayName);
    setShowUserDropdown(false);
  };

  const handleClearFilters = () => {
    setFilters({ project: '', status: '', priority: '', assignee: '', labels: '' });
    setUserQuery('');
    setJqlInput('');
    setSearchResults([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      setShowHistory(false);
      onLoadTask(url.trim());
      setUrl('');
    }
  };

  const handleFocus = () => {
    setHistory(getHistory());
    if (history.length > 0 || getHistory().length > 0) {
      setShowHistory(true);
    }
  };

  const handleSelect = (item: HistoryItem) => {
    setShowHistory(false);
    onLoadTask(item.key);
  };

  // Фильтруем историю и результаты поиска - не показываем уже загруженные задачи
  const loadedKeys = new Set(tasks.map(t => t.rootIssue.key));
  const filteredHistory = history.filter(h => !loadedKeys.has(h.key));
  const filteredResults = searchResults.filter(r => !loadedKeys.has(r.key));

  return (
    <>
    <header className="task-header">
      {/* Первый этаж: поиск и кнопки */}
      <div className="task-header-row" ref={containerRef}>
        <form onSubmit={handleSubmit} className="task-input-form">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={handleFocus}
              placeholder={t('taskInput.placeholder')}
              disabled={isAnyLoading}
              className="task-url-input"
              autoComplete="off"
            />
            {showHistory && filteredHistory.length > 0 && (
              <div className="history-dropdown">
                <div className="history-header">{t('taskInput.recent')}</div>
                {filteredHistory.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    className="history-item"
                    onClick={() => handleSelect(item)}
                  >
                    <span className="history-key">{item.key}</span>
                    <span className="history-summary">{item.summary}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isAnyLoading || !url.trim()}
            className="add-button"
            aria-label={t('taskInput.addTask')}
          >
            <i className="lni lni-plus" aria-hidden />
          </button>
        </form>

        {/* Кнопка расширенного поиска */}
        <button
          type="button"
          className={`search-toggle-button ${showAdvancedSearch ? 'active' : ''}`}
          onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
          title={t('taskInput.advancedSearch')}
          aria-label={t('taskInput.advancedSearch')}
          disabled={!config}
        >
          <i className="lni lni-funnel-1" aria-hidden />
        </button>

        {/* Табы задач в шапке (при достаточной ширине экрана) */}
        {onRefreshAll && (
          <TaskTags
            tasks={tasks}
            loading={loading}
            loadingKeys={loadingKeys}
            onRemoveTask={onRemoveTask}
            onRefreshAll={onRefreshAll}
            hoveredTaskId={hoveredTaskId}
            className="task-tags-in-header"
          />
        )}

        {/* Кнопки управления */}
        <div className="action-controls">
          {/* Кнопка настроек */}
          {onOpenSettings && (
            <button
              className="settings-button"
              onClick={onOpenSettings}
              title={t('taskInput.settings')}
              aria-label={t('taskInput.settings')}
            >
              <i className="lni lni-gear-1 settings-button-icon" aria-hidden />
              {config ? config.baseUrl.replace('https://', '').split('.')[0] : t('taskInput.settings')}
            </button>
          )}
        </div>
      </div>

      {/* Панель расширенного поиска */}
      {showAdvancedSearch && (
        <div className="advanced-search-panel">
          {/* Переключатель режима */}
          <div className="search-mode-toggle">
            <button
              type="button"
              className={`mode-button ${searchMode === 'filters' ? 'active' : ''}`}
              onClick={() => setSearchMode('filters')}
            >
              {t('taskInput.filters')}
            </button>
            <button
              type="button"
              className={`mode-button ${searchMode === 'jql' ? 'active' : ''}`}
              onClick={() => setSearchMode('jql')}
            >
              JQL
            </button>
          </div>

          {searchMode === 'filters' ? (
            <div className="search-filters">
              {optionsLoading ? (
                <div className="filters-loading">{t('taskInput.loading')}</div>
              ) : (
                <>
                  <div className="filter-row">
                    <div className="filter-group">
                      <label>{t('taskInput.project')}</label>
                      <select
                        value={filters.project}
                        onChange={(e) => setFilters(prev => ({ ...prev, project: e.target.value }))}
                      >
                        <option value="">{t('taskInput.any')}</option>
                        {projects.map(p => (
                          <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-group">
                      <label>{t('taskInput.status')}</label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                      >
                        <option value="">{t('taskInput.any')}</option>
                        {statuses.map(group => (
                          <optgroup key={group.category} label={group.category}>
                            {group.statuses.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="filter-row">
                    <div className="filter-group">
                      <label>{t('taskInput.priority')}</label>
                      <select
                        value={filters.priority}
                        onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                      >
                        <option value="">{t('taskInput.any')}</option>
                        {priorities.map(p => (
                          <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-group" ref={userSearchRef}>
                      <label>{t('taskInput.assignee')}</label>
                      <div className="user-search-wrapper">
                        <input
                          type="text"
                          value={userQuery}
                          onChange={(e) => {
                            setUserQuery(e.target.value);
                            setShowUserDropdown(true);
                            if (!e.target.value) {
                              setFilters(prev => ({ ...prev, assignee: '' }));
                            }
                          }}
                          onFocus={() => userOptions.length > 0 && setShowUserDropdown(true)}
                          placeholder={t('taskInput.searchUser')}
                          className="user-search-input"
                        />
                        {showUserDropdown && userOptions.length > 0 && (
                          <div className="user-dropdown">
                            {userOptions.map(u => (
                              <button
                                key={u.accountId}
                                type="button"
                                className="user-option"
                                onClick={() => handleSelectUser(u)}
                              >
                                {u.avatarUrl && <img src={u.avatarUrl} alt="" className="user-avatar" />}
                                <span>{u.displayName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="filter-row">
                    <div className="filter-group filter-group-wide">
                      <label>{t('taskInput.labels')}</label>
                      <input
                        type="text"
                        value={filters.labels}
                        onChange={(e) => setFilters(prev => ({ ...prev, labels: e.target.value }))}
                        placeholder={t('taskInput.labelsPlaceholder')}
                        className="labels-input"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="search-jql">
              <input
                type="text"
                value={jqlInput}
                onChange={(e) => setJqlInput(e.target.value)}
                placeholder={t('taskInput.jqlPlaceholder')}
                className="jql-input"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          )}

          {/* Кнопки поиска */}
          <div className="search-actions">
            <button
              type="button"
              className="search-button"
              onClick={handleSearch}
              disabled={searchLoading || (searchMode === 'jql' ? !jqlInput.trim() : !Object.values(filters).some(Boolean))}
            >
              {searchLoading ? (
                <i className="lni lni-spinner-arrow spin" aria-hidden />
              ) : (
                <i className="lni lni-search-1" aria-hidden />
              )}
              {t('taskInput.search')}
            </button>
            <button
              type="button"
              className="clear-button"
              onClick={handleClearFilters}
            >
              {t('taskInput.clear')}
            </button>
          </div>

          {/* Результаты поиска */}
          {filteredResults.length > 0 && (
            <div className="search-results">
              <div className="search-results-header">
                {t('taskInput.resultsCount', { count: filteredResults.length })}
              </div>
              <div className="search-results-list">
                {filteredResults.map(issue => (
                  <div key={issue.key} className="search-result-item">
                    <span className="result-key">{issue.key}</span>
                    <span className="result-summary">{issue.summary}</span>
                    <span className={`result-status status-${issue.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {issue.status}
                    </span>
                    <button
                      type="button"
                      className="result-add-button"
                      onClick={() => handleAddFromSearch(issue.key)}
                      title={t('taskInput.addToCanvas')}
                    >
                      <i className="lni lni-plus" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
    </>
  );
};

// Экспортируем компонент тегов отдельно для использования в App.tsx
export const TaskTags: React.FC<{
  tasks: TaskData[];
  loading: Record<string, boolean>;
  loadingKeys?: string[];
  onRemoveTask: (taskId: string) => void;
  onRefreshAll: () => void;
  hoveredTaskId?: string | null;
  className?: string;
}> = ({ tasks, loading, loadingKeys = [], onRemoveTask, onRefreshAll, hoveredTaskId, className }) => {
  const { t } = useTranslation();
  const isAnyLoading = Object.values(loading).some(Boolean) || loadingKeys.length > 0;
  const [taskColors, setTaskColorsState] = useState<Record<string, string>>(getTaskColors);

  useEffect(() => {
    const handler = () => setTaskColorsState(getTaskColors());
    window.addEventListener('jiraTaskColorsChange', handler);
    return () => window.removeEventListener('jiraTaskColorsChange', handler);
  }, []);

  if (tasks.length === 0 && loadingKeys.length === 0) return null;

  return (
    <div className={`task-tags-bar ${className ?? ''}`.trim()}>
      <div className="task-tags-row">
        {/* Загружающиеся новые задачи */}
        {loadingKeys.map(key => (
          <span
            key={`loading-${key}`}
            className="task-tag loading"
            title={t('taskInput.loading')}
          >
            <i className="lni lni-cog task-tag-spinner" aria-hidden />
            <span className="task-tag-key">{key}</span>
          </span>
        ))}
        {/* Загруженные задачи */}
        {tasks.map(task => (
          <span
            key={task.id}
            className={`task-tag ${loading[task.id] ? 'loading' : ''} ${hoveredTaskId === task.id ? 'hovered' : ''}`}
            title={task.rootIssue.summary}
            style={{ position: 'relative' }}
          >
            {loading[task.id] && <i className="lni lni-cog task-tag-spinner" aria-hidden />}
            {taskColors[task.id] && (
              <span
                className="task-color-indicator"
                style={{ backgroundColor: taskColors[task.id] }}
              />
            )}
            <span className="task-tag-key">{task.rootIssue.key}</span>
            <button
              type="button"
              className="task-tag-remove"
              onClick={() => onRemoveTask(task.id)}
              disabled={loading[task.id] || isAnyLoading}
              title={t('taskInput.removeFromCanvas')}
              aria-label={t('taskInput.removeFromCanvas')}
            >
              <i className="lni lni-xmark" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <button
        className="refresh-button"
        onClick={onRefreshAll}
        disabled={isAnyLoading}
        title={t('taskInput.refreshAll')}
        aria-label={t('taskInput.refreshAll')}
      >
        <i className={`lni lni-refresh-circle-1-clockwise refresh-icon ${isAnyLoading ? 'loading' : ''}`} aria-hidden />
      </button>
    </div>
  );
};
