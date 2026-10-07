import React, { useState, useCallback } from 'react';
import { TaskData } from '../types';
import { jiraApi } from '../utils/jiraApi';
import { useTranslation } from '../i18n';

interface DeleteConfirmDialogProps {
  tasks: TaskData[];
  canDeleteIssues: boolean;
  onSetCanDeleteIssues: (val: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
  onLoadTask: (urlOrKey: string, taskId?: string) => Promise<void>;
}

export function useDeleteConfirm({ tasks, canDeleteIssues, onSetCanDeleteIssues, addNotification, onLoadTask }: DeleteConfirmDialogProps) {
  const { t } = useTranslation();
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; issueKey: string; show: boolean } | null>(null);

  const handleDeleteIssue = useCallback((taskId: string, issueKey: string) => {
    setDeleteConfirm({ taskId, issueKey, show: true });
  }, []);

  const confirmDeleteIssue = useCallback(async () => {
    if (!deleteConfirm) return;
    const { taskId, issueKey } = deleteConfirm;
    const task = tasks.find(t => t.id === taskId);
    setDeleteConfirm(null);
    if (!task) return;

    try {
      const result = await jiraApi.deleteIssue(issueKey);
      if (result.success) {
        addNotification('success', t('notification.taskDeleted', { key: issueKey }));
        onLoadTask(task.rootIssue.key, taskId);
      } else {
        const noPermissionErrors = ['Нет прав на удаление', 'permission', 'forbidden'];
        const isPermissionError = noPermissionErrors.some(msg =>
          result.error?.toLowerCase().includes(msg.toLowerCase())
        );
        if (isPermissionError) {
          onSetCanDeleteIssues(false);
          localStorage.setItem('jiraCanDeleteIssues', 'false');
          addNotification('warning', t('notification.noDeletePermission'));
        } else {
          addNotification('error', result.error || t('notification.deleteError', { key: issueKey }));
        }
      }
    } catch {
      addNotification('error', t('notification.deleteFailed', { key: issueKey }));
    }
  }, [deleteConfirm, tasks, addNotification, t, onLoadTask, onSetCanDeleteIssues]);

  return { deleteConfirm, handleDeleteIssue: canDeleteIssues ? handleDeleteIssue : undefined, confirmDeleteIssue, dismissDeleteConfirm: () => setDeleteConfirm(null) };
}

export const DeleteConfirmDialog: React.FC<{
  issueKey: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ issueKey, onConfirm, onCancel }) => (
  <div className="confirm-dialog-overlay" onClick={onCancel}>
    <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
      <h3>Удалить задачу?</h3>
      <p>Вы уверены, что хотите удалить задачу <strong>{issueKey}</strong>?</p>
      <p className="warning">Это действие нельзя отменить. Задача будет удалена вместе со всей историей.</p>
      <div className="confirm-dialog-buttons">
        <button className="cancel-btn" onClick={onCancel}>Отмена</button>
        <button className="delete-btn" onClick={onConfirm}>Удалить</button>
      </div>
    </div>
  </div>
);
