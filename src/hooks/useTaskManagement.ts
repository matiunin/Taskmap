import { useState, useRef, useCallback } from 'react';
import { TaskData } from '../types';
import { jiraApi } from '../utils/jiraApi';
import { parseJiraUrl } from '../utils/issueParser';
import { addToHistory } from '../components/TaskInput';
import { useTranslation } from '../i18n';

export function useTaskManagement(
  addNotification: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void,
) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<TaskData[]>(() => {
    const saved = localStorage.getItem('jiraTasks');
    if (saved) {
      try { return JSON.parse(saved) as TaskData[]; } catch { return []; }
    }
    return [];
  });
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGeneration = useRef(0);

  const taskIdCounter = useRef<number>(0);
  const taskIdInitialized = useRef(false);
  if (!taskIdInitialized.current) {
    taskIdInitialized.current = true;
    const saved = localStorage.getItem('jiraTasks');
    if (saved) {
      try {
        const loaded = JSON.parse(saved) as TaskData[];
        taskIdCounter.current = loaded.reduce((max, t) => {
          const num = parseInt(t.id.replace('task-', ''), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
      } catch { /* keep 0 */ }
    }
  }
  const getNextTaskId = () => {
    taskIdCounter.current++;
    return `task-${taskIdCounter.current}`;
  };

  const handleLoadTask = useCallback(async (urlOrKey: string, taskId?: string) => {
    const generation = loadGeneration.current;
    const config = jiraApi.config;
    const isCurrent = () => config !== null && config === jiraApi.config && generation === loadGeneration.current;
    if (!isCurrent()) return;
    const issueKey = parseJiraUrl(urlOrKey);
    if (!issueKey) {
      addNotification('error', t('notification.taskNotRecognized'));
      return;
    }

    let targetTaskId = taskId;
    if (!targetTaskId) {
      const existingTask = tasks.find(t => t.rootIssue.key.toUpperCase() === issueKey.toUpperCase());
      if (existingTask) {
        addNotification('info', t('notification.taskAlreadyOpen', { key: issueKey }));
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        setHighlightedTaskId(existingTask.id);
        highlightTimerRef.current = setTimeout(() => {
          setHighlightedTaskId(null);
          highlightTimerRef.current = null;
        }, 2000);
        return;
      }
      targetTaskId = getNextTaskId();
    }

    setLoading(prev => ({ ...prev, [targetTaskId!]: true }));
    // Добавляем ключ в список загружаемых (для индикатора новых задач)
    if (!taskId) {
      setLoadingKeys(prev => [...prev, issueKey.toUpperCase()]);
    }
    try {
      const issue = await jiraApi.getIssue(issueKey);
      if (!isCurrent()) return;
      const { links: issueLinks, confluenceMentions: mentions } = await jiraApi.getAllRelatedIssues(issueKey);
      if (!isCurrent()) return;

      const newTaskData: TaskData = {
        id: targetTaskId!, rootIssue: issue, links: issueLinks, confluenceMentions: mentions,
      };

      setTasks(prev => {
        if (!isCurrent()) return prev;
        const existingIndex = prev.findIndex(t => t.id === targetTaskId);
        let updated;
        if (existingIndex >= 0) {
          updated = [...prev];
          updated[existingIndex] = newTaskData;
        } else {
          updated = [...prev, newTaskData];
        }
        localStorage.setItem('jiraTasks', JSON.stringify(updated));
        return updated;
      });

      addToHistory(issueKey, issue.summary);
    } catch (err: any) {
      if (isCurrent()) addNotification('error', err.message || t('notification.loadError'));
    } finally {
      if (isCurrent()) {
        setLoading(prev => isCurrent() ? ({ ...prev, [targetTaskId!]: false }) : prev);
        // Убираем ключ из списка загружаемых
        setLoadingKeys(prev => isCurrent() ? prev.filter(k => k !== issueKey.toUpperCase()) : prev);
      }
    }
  }, [tasks, addNotification, t]);

  const handleRemoveTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== taskId);
      localStorage.setItem('jiraTasks', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleRefreshAll = useCallback(() => {
    tasks.forEach(task => handleLoadTask(task.rootIssue.key, task.id));
  }, [tasks, handleLoadTask]);

  const handleLoadParentChain = useCallback(async (issueKey: string) => {
    const generation = loadGeneration.current;
    const config = jiraApi.config;
    const isCurrent = () => config !== null && config === jiraApi.config && generation === loadGeneration.current;
    if (!isCurrent()) return;
    try {
      const chain = await jiraApi.getParentChain(issueKey);
      if (!isCurrent()) return;
      if (chain.length === 0) {
        addNotification('info', t('notification.noParent', { key: issueKey }));
        return;
      }
      for (const parentKey of chain) handleLoadTask(parentKey);
      addNotification('success', t('notification.parentChainLoaded', { count: chain.length }));
    } catch (err: any) {
      if (isCurrent()) addNotification('error', err.message || t('notification.loadError'));
    }
  }, [addNotification, t, handleLoadTask]);

  const clearTasks = useCallback(() => {
    loadGeneration.current++;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = null;
    localStorage.removeItem('jiraTasks');
    setTasks([]);
    setLoading({});
    setLoadingKeys([]);
    setHighlightedTaskId(null);
  }, []);

  return {
    tasks, loading, loadingKeys, highlightedTaskId,
    handleLoadTask, handleRemoveTask, handleRefreshAll, handleLoadParentChain, clearTasks,
  };
}
