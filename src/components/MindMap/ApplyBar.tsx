import React, { useState, useContext } from 'react';
import { PendingChange } from '../../hooks/usePendingChanges';
import { HoveredChangeContext } from './contexts';
import { useTranslation } from '../../i18n';

interface ApplyBarProps {
  pendingChanges: PendingChange[];
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
  onCancelChange?: (index: number) => void;
  hasActionBar: boolean;
  refreshCountdown?: number;
}

export const ApplyBar: React.FC<ApplyBarProps> = ({
  pendingChanges, applying, onApply, onCancel, onCancelChange, hasActionBar, refreshCountdown = 0,
}) => {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const { setHoveredChange } = useContext(HoveredChangeContext);
  const pendingChangesCount = pendingChanges.length;

  if (pendingChangesCount === 0 && refreshCountdown === 0) return null;

  const isRefreshing = refreshCountdown > 0;

  const getChangesText = (count: number) => {
    if (count === 1) return t('mindmap.changes', { count });
    if (count >= 2 && count <= 4) return t('mindmap.changesPlural2', { count });
    return t('mindmap.changesPlural5', { count });
  };

  const getChangeDescription = (change: PendingChange): string => {
    switch (change.action) {
      case 'delete': return t('mindmap.changeDetail.delete', { key: change.issueKey, summary: change.issueSummary || '' });
      case 'change': return t('mindmap.changeDetail.change', { key: change.issueKey, from: change.oldLinkType || '?', to: change.newLinkType || '?' });
      case 'subtask-to-link': return t('mindmap.changeDetail.subtaskToLink', { key: change.issueKey, linkType: change.newLinkType || 'Relates' });
      case 'link-to-subtask': return t('mindmap.changeDetail.linkToSubtask', { key: change.issueKey });
      case 'create': return t('mindmap.changeDetail.create', { key: change.issueKey, linkType: change.newLinkType || '' });
      case 'add-child': return t('mindmap.changeDetail.addChild', { key: change.issueKey });
      case 'remove-parent': return t('mindmap.changeDetail.removeParent', { key: change.issueKey });
      case 'cross-link': return t('mindmap.changeDetail.crossLink', { key: change.issueKey, target: change.targetIssueKey || '?', linkType: change.newLinkType || '' });
      case 'change-type': return t('mindmap.changeDetail.changeType', { key: change.issueKey, from: change.oldIssueTypeName || '?', to: change.newIssueTypeName || '?' });
      default: return change.issueKey;
    }
  };

  const getChangeIcon = (action: PendingChange['action']): string => {
    switch (action) {
      case 'delete': return 'lni-trash-3';
      case 'change': return 'lni-refresh-circle-1-clockwise';
      case 'subtask-to-link': return 'lni-link-2-angular-right';
      case 'link-to-subtask': return 'lni-paperclip-1';
      case 'create': return 'lni-plus';
      case 'add-child': return 'lni-paperclip-1';
      case 'remove-parent': return 'lni-scissors-1-vertical';
      case 'cross-link': return 'lni-link-2-angular-right';
      case 'change-type': return 'lni-bookmark-1';
      default: return 'lni-file-pencil';
    }
  };

  return (
    <div className={`apply-bar ${hasActionBar ? 'with-action-bar' : ''} ${isRefreshing ? 'refreshing' : ''} ${showDetails ? 'expanded' : ''}`}>
      {showDetails && !isRefreshing && pendingChanges.length > 0 && (
        <div className="apply-bar-details">
          <ul className="apply-bar-details-list">
            {pendingChanges.map((change, idx) => (
              <li
                key={idx}
                className={`apply-bar-details-item action-${change.action}`}
                onMouseEnter={() => setHoveredChange(change)}
                onMouseLeave={() => setHoveredChange(null)}
              >
                <span className="apply-bar-details-icon"><i className={`lni ${getChangeIcon(change.action)}`} aria-hidden /></span>
                <span className="apply-bar-details-text">{getChangeDescription(change)}</span>
                {onCancelChange && (
                  <button
                    className="apply-bar-details-cancel"
                    onClick={(e) => { e.stopPropagation(); setHoveredChange(null); onCancelChange(idx); }}
                    title={t('mindmap.cancelDeletion')}
                  ><i className="lni lni-xmark" aria-hidden /></button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="apply-bar-content">
        <div className="apply-bar-info">
          <span className={`apply-bar-icon ${isRefreshing ? 'spinning' : ''}`}><i className={`lni ${isRefreshing ? 'lni-refresh-circle-1-clockwise' : 'lni-file-pencil'}`} aria-hidden /></span>
          <span className="apply-bar-text">
            {isRefreshing ? t('mindmap.refreshingLinks') : getChangesText(pendingChangesCount)}
          </span>
          {!isRefreshing && pendingChangesCount > 0 && (
            <button
              className={`apply-bar-details-toggle ${showDetails ? 'open' : ''}`}
              onClick={() => setShowDetails(!showDetails)}
              title={t('mindmap.showDetails')}
            >
              <span className="apply-bar-details-arrow"><i className="lni lni-chevron-down" aria-hidden /></span>
            </button>
          )}
        </div>
        <div className="apply-bar-actions">
          {!isRefreshing && (
            <button className="apply-bar-cancel" onClick={onCancel} disabled={applying} title={t('mindmap.cancel')}>
              {t('mindmap.cancel')}
            </button>
          )}
          <button
            className={`apply-bar-submit ${isRefreshing ? 'with-countdown' : ''}`}
            onClick={onApply}
            disabled={applying || isRefreshing}
          >
            {isRefreshing ? (
              <>
                <span className="countdown-text">{t('mindmap.refreshingIn')}</span>
                <span className="countdown-number">{refreshCountdown}</span>
                <div className="countdown-progress" style={{ width: `${(refreshCountdown / 5) * 100}%` }} />
              </>
            ) : applying ? t('mindmap.applying') : t('mindmap.apply')}
          </button>
        </div>
      </div>
    </div>
  );
};
