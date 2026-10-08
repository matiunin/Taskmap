import { useState, useEffect, useRef, useCallback } from 'react';
import { TaskInput, TaskTags } from './components/TaskInput';
import { MindMap } from './components/MindMap';
import { ProfileEditor } from './components/ProfileEditor';
import { Notification } from './components/Notification';
import { TasksDashboard } from './components/TasksDashboard';
import { JiraPreviewSidebar } from './components/JiraPreviewSidebar';
import { DeleteConfirmDialog, useDeleteConfirm } from './components/DeleteConfirmDialog';
import { LandingV2 } from './components/LandingV2';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SupportAuthor } from './components/SupportAuthor';
import type { JiraReadiness } from './utils/jiraReadiness';
import { jiraApi } from './utils/jiraApi';
import { secureSessionStorage } from './utils/secureStorage';
import { JiraConfig } from './types';
import { JIRA_PROXY_URL, IS_DEV } from './config/runtime';
import { useTranslation } from './i18n';
import { useNotifications } from './hooks/useNotifications';
import { useTaskManagement } from './hooks/useTaskManagement';
import { usePendingChanges } from './hooks/usePendingChanges';
import './App.css';

function App() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [configSaved, setConfigSaved] = useState(false);
  const [jiraReadiness, setJiraReadiness] = useState<JiraReadiness>({ ready: false, pendingRequests: 0 });
  const [proxyStatus, setProxyStatus] = useState<'unknown' | 'checking' | 'running' | 'stopped'>('unknown');
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [previewIssueKey, setPreviewIssueKey] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [canDeleteIssues, setCanDeleteIssues] = useState<boolean>(() => {
    const saved = localStorage.getItem('jiraCanDeleteIssues');
    return saved !== 'false';
  });

  // Состояние левого сайдбара
  const DASHBOARD_COLLAPSED_KEY = 'tasksDashboardCollapsed';
  const [dashboardCollapsed, setDashboardCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(DASHBOARD_COLLAPSED_KEY);
    return saved === 'true';
  });
  const autoCollapsedByPreview = useRef(false);
  const mainLayoutRef = useRef<HTMLDivElement>(null);

  // Хуки
  const { notifications, addNotification, removeNotification } = useNotifications();
  const {
    tasks, loading, loadingKeys, highlightedTaskId,
    handleLoadTask, handleRemoveTask, handleRefreshAll, handleLoadParentChain, clearTasks,
  } = useTaskManagement(addNotification);
  const {
    pendingChanges, applying, refreshCountdown,
    handleChangeLinkType, handleDeleteLink, handleDropToGroup,
    handleCreateLink, handleCrossLink, handleAddChild,
    handleChangeIssueType,
    handleApplyChanges, cancelAllChanges, cancelChange,
    setPendingChanges,
  } = usePendingChanges(tasks, addNotification, handleLoadTask);
  const { deleteConfirm, handleDeleteIssue, confirmDeleteIssue, dismissDeleteConfirm } = useDeleteConfirm({
    tasks, canDeleteIssues, onSetCanDeleteIssues: setCanDeleteIssues,
    addNotification, onLoadTask: handleLoadTask,
  });

  useEffect(() => jiraApi.subscribeReadiness(setJiraReadiness), []);

  const toggleDashboardCollapsed = useCallback(() => {
    setDashboardCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem(DASHBOARD_COLLAPSED_KEY, String(newValue));
      autoCollapsedByPreview.current = false;
      return newValue;
    });
  }, []);

  // Авто-сворачивание сайдбара при открытии превью
  const PREVIEW_SIDEBAR_WIDTH = 420;
  const DASHBOARD_WIDTH = 380;
  const MIN_GRAPH_WIDTH = 375;

  useEffect(() => {
    if (previewIssueKey) {
      if (!dashboardCollapsed && mainLayoutRef.current) {
        const layoutWidth = mainLayoutRef.current.offsetWidth;
        const graphWidth = layoutWidth - DASHBOARD_WIDTH - PREVIEW_SIDEBAR_WIDTH;
        if (graphWidth < MIN_GRAPH_WIDTH) {
          autoCollapsedByPreview.current = true;
          setDashboardCollapsed(true);
        }
      }
    } else {
      if (autoCollapsedByPreview.current) {
        autoCollapsedByPreview.current = false;
        setDashboardCollapsed(false);
      }
    }
  }, [previewIssueKey, dashboardCollapsed]);

  // Загрузка конфига при монтировании
  useEffect(() => {
    const savedConfig = secureSessionStorage.getItem('jiraConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
        jiraApi.setConfig(parsed);
        setConfigSaved(true);
      } catch (e) {
      }
    }
  }, []);

  const handleConfigSave = (newConfig: JiraConfig) => {
    setConfig(newConfig);
    jiraApi.setConfig(newConfig);
    setConfigSaved(true);
    const params = new URLSearchParams(window.location.search);
    if (params.has('landing')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    addNotification('success', t('notification.settingsSaved'));
    clearTasks();
    localStorage.removeItem('jiraCanDeleteIssues');
    setCanDeleteIssues(true);
  };

  const handleDisconnect = () => {
    secureSessionStorage.removeItem('jiraConfig');
    localStorage.removeItem('jiraConfig');
    clearTasks();
    setPendingChanges([]);
    setPreviewIssueKey(null);
    setHoveredTaskId(null);
    setConfig(null);
    jiraApi.clearConfig();
    setConfigSaved(false);
    setIsProfileEditorOpen(false);
  };

  // Проверка прокси
  const hasCheckedProxy = useRef(false);
  const checkProxyStatus = async () => {
    setProxyStatus('checking');
    const testUrl = JIRA_PROXY_URL;
    try {
      const response = await fetch(testUrl, { method: 'GET' });
      if (response.ok) { setProxyStatus('running'); return true; }
      setProxyStatus('stopped');
      addNotification('error', t('notification.proxyUnavailable'));
      return false;
    } catch {
      setProxyStatus('stopped');
      addNotification('error', IS_DEV ? t('notification.proxyNotRunning') : t('notification.proxyUnavailable'));
      return false;
    }
  };

  useEffect(() => {
    if (!hasCheckedProxy.current) { hasCheckedProxy.current = true; checkProxyStatus(); }
  }, []);

  // При удалении задачи — убираем pending changes
  const handleRemoveTaskWithCleanup = useCallback((taskId: string) => {
    handleRemoveTask(taskId);
    setPendingChanges(prev => prev.filter(c => c.taskId !== taskId));
  }, [handleRemoveTask, setPendingChanges]);

  const searchParams = new URLSearchParams(window.location.search);
  const isLandingForced = searchParams.has('landing');
  if (!configSaved || isLandingForced) {
    return (
      <div className="app">
        <LandingV2 onConfigSave={handleConfigSave} initialConfig={config} />
        <Notification notifications={notifications} onRemove={removeNotification} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`app ${previewIssueKey ? 'has-preview' : ''}`}>
      <TaskInput
        tasks={tasks}
        onLoadTask={handleLoadTask}
        onRemoveTask={handleRemoveTaskWithCleanup}
        loading={loading}
        loadingKeys={loadingKeys}
        onRefreshAll={handleRefreshAll}
        hoveredTaskId={hoveredTaskId}
        onOpenSettings={() => setIsProfileEditorOpen(true)}
        config={config}
      />

      {proxyStatus !== 'stopped' && (
        <div ref={mainLayoutRef} className={`main-layout ${tasks.length > 0 ? 'has-tasks' : ''}`}>
          <TasksDashboard
            config={config}
            onLoadTask={(issueKey) => handleLoadTask(issueKey)}
            isCollapsed={dashboardCollapsed}
            onToggleCollapsed={toggleDashboardCollapsed}
          />
          <div className="main-content">
            <div className="main-content-body">
              <div className="main-content-graph">
                <TaskTags
                  tasks={tasks}
                  loading={loading}
                  loadingKeys={loadingKeys}
                  onRemoveTask={handleRemoveTaskWithCleanup}
                  onRefreshAll={handleRefreshAll}
                  hoveredTaskId={hoveredTaskId}
                  className="task-tags-in-graph"
                />
                {tasks.length === 0 ? (
                  <div className="onboarding-hint">
                    <div className="hint-card">
                      <div className="hint-icon">
                        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                          <circle cx="32" cy="32" r="8" fill="#0052cc" className="node-center"/>
                          <circle cx="14" cy="20" r="5" fill="#36b37e" className="node-1"/>
                          <circle cx="50" cy="18" r="5" fill="#ff5630" className="node-2"/>
                          <circle cx="52" cy="44" r="5" fill="#6554c0" className="node-3"/>
                          <circle cx="16" cy="48" r="5" fill="#ffab00" className="node-4"/>
                          <line x1="26" y1="28" x2="18" y2="23" stroke="#0052cc" strokeWidth="2" strokeLinecap="round" className="link-1"/>
                          <line x1="38" y1="28" x2="46" y2="21" stroke="#0052cc" strokeWidth="2" strokeLinecap="round" className="link-2"/>
                          <line x1="38" y1="36" x2="48" y2="42" stroke="#0052cc" strokeWidth="2" strokeLinecap="round" className="link-3"/>
                          <line x1="26" y1="36" x2="20" y2="45" stroke="#0052cc" strokeWidth="2" strokeLinecap="round" className="link-4"/>
                        </svg>
                      </div>
                      <h3 className="hint-title">{t('onboarding.hintTitle')}</h3>
                      <p className="hint-text">{t('onboarding.hintText')}</p>
                      <form
                        className="hint-input-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const input = e.currentTarget.querySelector('input') as HTMLInputElement;
                          if (input?.value.trim()) { handleLoadTask(input.value.trim()); input.value = ''; }
                        }}
                      >
                        <input type="text" placeholder={t('taskInput.placeholder')} className="hint-task-input" autoFocus />
                        <button type="submit" className="hint-add-button"><i className="lni lni-plus" aria-hidden /></button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <MindMap
                    tasks={tasks}
                    onChangeLinkType={handleChangeLinkType}
                    onDeleteLink={handleDeleteLink}
                    onLoadTask={handleLoadTask}
                    onLoadParentChain={handleLoadParentChain}
                    onHoverTask={setHoveredTaskId}
                    onDeleteIssue={handleDeleteIssue}
                    onDropToGroup={handleDropToGroup}
                    onCreateLink={handleCreateLink}
                    onCrossLink={handleCrossLink}
                    onAddChild={handleAddChild}
                    onChangeIssueType={handleChangeIssueType}
                    pendingChanges={pendingChanges}
                    onApplyChanges={handleApplyChanges}
                    onCancelAllChanges={cancelAllChanges}
                    onCancelChange={cancelChange}
                    applying={applying}
                    refreshCountdown={refreshCountdown}
                    onPreviewTask={(issueKey: string) => setPreviewIssueKey(issueKey)}
                    highlightedTaskId={highlightedTaskId}
                  />
                )}
              </div>
              {previewIssueKey && config && (
                <JiraPreviewSidebar issueKey={previewIssueKey} jiraBaseUrl={config.baseUrl} onClose={() => setPreviewIssueKey(null)} />
              )}
            </div>
          </div>
        </div>
      )}

      <ProfileEditor
        isOpen={isProfileEditorOpen}
        onClose={() => setIsProfileEditorOpen(false)}
        onSave={handleConfigSave}
        currentConfig={config}
        onDisconnect={handleDisconnect}
      />
      <Notification notifications={notifications} onRemove={removeNotification} />

      {deleteConfirm?.show && (
        <DeleteConfirmDialog issueKey={deleteConfirm.issueKey} onConfirm={confirmDeleteIssue} onCancel={dismissDeleteConfirm} />
      )}
      <SupportAuthor
        placement="prompt"
        ready={jiraReadiness.ready}
        blocked={isProfileEditorOpen || !!deleteConfirm?.show || pendingChanges.length > 0
          || applying || refreshCountdown > 0 || loadingKeys.length > 0
          || Object.values(loading).some(Boolean) || jiraReadiness.pendingRequests > 0}
      />
      </div>
    </ErrorBoundary>
  );
}

export default App;
