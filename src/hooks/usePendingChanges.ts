import { useState, useCallback } from 'react';
import { TaskData } from '../types';
import { jiraApi } from '../utils/jiraApi';
import { useTranslation } from '../i18n';

export interface PendingChange {
  action: 'change' | 'delete' | 'subtask-to-link' | 'link-to-subtask' | 'create' | 'add-child' | 'remove-parent' | 'cross-link' | 'change-type';
  taskId: string;
  issueKey: string;
  linkId: string;
  newLinkType?: string;
  oldLinkType?: string;
  issueSummary?: string;
  sourceType?: string;
  targetType?: string;
  isOutward?: boolean;
  targetTaskId?: string;
  targetIssueKey?: string;
  newIssueTypeId?: string;
  newIssueTypeName?: string;
  oldIssueTypeName?: string;
}

export function usePendingChanges(
  tasks: TaskData[],
  addNotification: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void,
  handleLoadTask: (urlOrKey: string, taskId?: string) => Promise<void>,
) {
  const { t } = useTranslation();
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [applying, setApplying] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(0);

  const handleChangeLinkType = useCallback((taskId: string, issueKey: string, newLinkType: string, linkId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (linkId.startsWith('subtask-') || linkId.startsWith('parent-')) {
      addNotification('error', t('notification.subtaskCannotConvert'));
      return;
    }

    const link = task.links.find(l =>
      l.outwardIssue?.key === issueKey || l.inwardIssue?.key === issueKey
    );
    const summary = link?.outwardIssue?.summary || link?.inwardIssue?.summary;
    const oldLinkType = link?.type.name;

    setPendingChanges(prev => {
      const existing = prev.findIndex(c => c.linkId === linkId && c.taskId === taskId);
      const change: PendingChange = {
        action: 'change', taskId, issueKey, newLinkType, oldLinkType, linkId, issueSummary: summary,
      };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = change;
        return updated;
      }
      return [...prev, change];
    });
  }, [tasks, addNotification, t]);

  const handleDeleteLink = useCallback((taskId: string, linkId: string, issueKey: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const link = task.links.find(l =>
      l.outwardIssue?.key === issueKey || l.inwardIssue?.key === issueKey
    );
    const summary = link?.outwardIssue?.summary || link?.inwardIssue?.summary;

    const isSubtask = linkId.startsWith('subtask-');
    const isParent = linkId.startsWith('parent-');
    const action: PendingChange['action'] = (isSubtask || isParent) ? 'remove-parent' : 'delete';

    setPendingChanges(prev => {
      const existing = prev.findIndex(c => c.linkId === linkId && c.taskId === taskId);
      const change: PendingChange = {
        action, taskId,
        issueKey: isParent ? task.rootIssue.key : issueKey,
        linkId,
        issueSummary: isParent ? task.rootIssue.summary : summary,
      };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = change;
        return updated;
      }
      return [...prev, change];
    });
  }, [tasks]);

  const handleDropToGroup = useCallback((taskId: string, issueKey: string, linkId: string, sourceType: string, targetType: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || sourceType === targetType) return;

    const link = task.links.find(l => l.id === linkId);
    const issue = link?.outwardIssue || link?.inwardIssue;
    const summary = issue?.summary || issueKey;

    if (sourceType === 'subtask' && targetType === 'link') {
      setPendingChanges(prev => {
        const existing = prev.findIndex(c => c.linkId === linkId && c.taskId === taskId);
        const change: PendingChange = {
          action: 'subtask-to-link', taskId, issueKey, linkId,
          issueSummary: summary, sourceType: 'subtask', targetType: 'link', newLinkType: 'Relates',
        };
        if (existing >= 0) { const updated = [...prev]; updated[existing] = change; return updated; }
        return [...prev, change];
      });
      return;
    }

    if (sourceType === 'link' && targetType === 'subtask') {
      const oldLinkType = link?.type.name;
      setPendingChanges(prev => {
        const existing = prev.findIndex(c => c.linkId === linkId && c.taskId === taskId);
        const change: PendingChange = {
          action: 'link-to-subtask', taskId, issueKey, linkId,
          oldLinkType, issueSummary: summary, sourceType: 'link', targetType: 'subtask',
        };
        if (existing >= 0) { const updated = [...prev]; updated[existing] = change; return updated; }
        return [...prev, change];
      });
    }
  }, [tasks]);

  const handleCreateLink = useCallback((taskId: string, targetKey: string, linkType: string, isOutward: boolean) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const tempLinkId = `new-${Date.now()}-${targetKey}`;
    const isChild = linkType === 'Child';

    setPendingChanges(prev => {
      const existing = prev.findIndex(c =>
        (c.action === 'create' || c.action === 'add-child') && c.issueKey === targetKey && c.taskId === taskId
      );
      const change: PendingChange = {
        action: isChild ? 'add-child' : 'create',
        taskId, issueKey: targetKey, linkId: tempLinkId, newLinkType: linkType, isOutward, issueSummary: targetKey,
      };
      if (existing >= 0) { const updated = [...prev]; updated[existing] = change; return updated; }
      return [...prev, change];
    });
  }, [tasks]);

  const handleCrossLink = useCallback((
    sourceTaskId: string, sourceIssueKey: string,
    targetTaskId: string, targetIssueKey: string, linkType: string,
  ) => {
    const tempLinkId = `cross-${Date.now()}-${sourceIssueKey}-${targetIssueKey}`;
    setPendingChanges(prev => {
      const existing = prev.findIndex(c =>
        c.action === 'cross-link' && c.issueKey === sourceIssueKey && c.targetIssueKey === targetIssueKey
      );
      const change: PendingChange = {
        action: 'cross-link', taskId: sourceTaskId, issueKey: sourceIssueKey,
        linkId: tempLinkId, newLinkType: linkType, targetTaskId, targetIssueKey,
        issueSummary: `${sourceIssueKey} → ${targetIssueKey}`,
      };
      if (existing >= 0) { const updated = [...prev]; updated[existing] = change; return updated; }
      return [...prev, change];
    });
  }, []);

  const handleAddChild = useCallback((parentTaskId: string, parentKey: string, childKey: string) => {
    const tempLinkId = `add-child-${Date.now()}-${childKey}`;
    setPendingChanges(prev => {
      const existing = prev.findIndex(c =>
        c.action === 'add-child' && c.issueKey === childKey && c.taskId === parentTaskId
      );
      const change: PendingChange = {
        action: 'add-child', taskId: parentTaskId, issueKey: childKey,
        linkId: tempLinkId, issueSummary: `${childKey} → child of ${parentKey}`,
      };
      if (existing >= 0) { const updated = [...prev]; updated[existing] = change; return updated; }
      return [...prev, change];
    });
  }, []);

  const handleChangeIssueType = useCallback((taskId: string, issueKey: string, newIssueTypeId: string, newIssueTypeName: string, oldIssueTypeName: string) => {
    const tempLinkId = `change-type-${Date.now()}-${issueKey}`;
    setPendingChanges(prev => {
      const existing = prev.findIndex(c =>
        c.action === 'change-type' && c.issueKey === issueKey && c.taskId === taskId
      );
      const change: PendingChange = {
        action: 'change-type', taskId, issueKey, linkId: tempLinkId,
        newIssueTypeId, newIssueTypeName, oldIssueTypeName, issueSummary: issueKey,
      };
      if (existing >= 0) { const updated = [...prev]; updated[existing] = change; return updated; }
      return [...prev, change];
    });
  }, []);

  const handleApplyChanges = useCallback(async () => {
    if (tasks.length === 0 || pendingChanges.length === 0) return;

    setApplying(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];
    const tasksToReload = new Set<string>();

    for (const change of pendingChanges) {
      const task = tasks.find(t => t.id === change.taskId);
      if (!task) continue;

      tasksToReload.add(change.taskId);
      if (change.targetTaskId) tasksToReload.add(change.targetTaskId);

      try {
        let result: { success: boolean; error?: string } = { success: false };

        if (change.action === 'delete') {
          result = { success: await jiraApi.deleteIssueLink(change.linkId) };
        } else if (change.action === 'change' && change.newLinkType) {
          result = { success: await jiraApi.changeLinkType(task.rootIssue.key, change.issueKey, change.linkId, change.newLinkType, change.oldLinkType) };
        } else if (change.action === 'subtask-to-link') {
          result = await jiraApi.convertSubtaskToLink(task.rootIssue.key, change.issueKey, change.newLinkType || 'Relates');
        } else if (change.action === 'link-to-subtask') {
          result = await jiraApi.convertLinkToSubtask(task.rootIssue.key, change.issueKey, change.linkId, change.oldLinkType);
        } else if (change.action === 'create' && change.newLinkType) {
          const outwardKey = change.isOutward ? task.rootIssue.key : change.issueKey;
          const inwardKey = change.isOutward ? change.issueKey : task.rootIssue.key;
          result = { success: await jiraApi.createIssueLink(outwardKey, inwardKey, change.newLinkType) };
        } else if (change.action === 'add-child') {
          result = await jiraApi.addChildToEpic(task.rootIssue.key, change.issueKey);
        } else if (change.action === 'remove-parent') {
          result = await jiraApi.removeParent(change.issueKey);
        } else if (change.action === 'cross-link' && change.targetIssueKey && change.newLinkType) {
          result = { success: await jiraApi.createIssueLink(change.issueKey, change.targetIssueKey, change.newLinkType) };
        } else if (change.action === 'change-type' && change.newIssueTypeId) {
          result = await jiraApi.changeIssueType(change.issueKey, change.newIssueTypeId);
        }

        if (result.success) successCount++;
        else { failCount++; if (result.error) errors.push(`${change.issueKey}: ${result.error}`); }
      } catch (err: any) {
        failCount++;
        errors.push(`${change.issueKey}: ${err.message || 'Неизвестная ошибка'}`);
      }
    }

    setPendingChanges([]);

    if (failCount === 0) {
      addNotification('success', t('notification.changesApplied', { count: successCount }));
    } else {
      addNotification('warning', t('notification.changesWithErrors', { success: successCount, fail: failCount }));
      errors.forEach(e => addNotification('error', e));
    }

    if (tasksToReload.size > 0) {
      setRefreshCountdown(5);
      const countdownInterval = setInterval(() => {
        setRefreshCountdown(prev => {
          if (prev <= 1) { clearInterval(countdownInterval); return 0; }
          return prev - 1;
        });
      }, 1000);

      setTimeout(() => {
        clearInterval(countdownInterval);
        setApplying(false);
        setRefreshCountdown(0);
        for (const taskId of tasksToReload) {
          const task = tasks.find(t => t.id === taskId);
          if (task) handleLoadTask(task.rootIssue.key, taskId);
        }
      }, 5000);
    } else {
      setApplying(false);
    }
  }, [tasks, pendingChanges, addNotification, t, handleLoadTask]);

  const cancelAllChanges = useCallback(() => setPendingChanges([]), []);
  const cancelChange = useCallback((index: number) => setPendingChanges(prev => prev.filter((_, i) => i !== index)), []);

  return {
    pendingChanges, applying, refreshCountdown,
    handleChangeLinkType, handleDeleteLink, handleDropToGroup,
    handleCreateLink, handleCrossLink, handleAddChild,
    handleChangeIssueType,
    handleApplyChanges, cancelAllChanges, cancelChange,
    setPendingChanges,
  };
}
