import React, { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';
import { jiraApi } from '../utils/jiraApi';
import { getTypeIcon } from './MindMap/constants';
import './JiraPreviewSidebar.css';

interface JiraPreviewSidebarProps {
  issueKey: string;
  jiraBaseUrl: string;
  onClose: () => void;
}

export const JiraPreviewSidebar: React.FC<JiraPreviewSidebarProps> = ({ issueKey, jiraBaseUrl, onClose }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issue, setIssue] = useState<{
    key: string;
    summary: string;
    status: string;
    issueType: string;
    priority?: string;
    assignee?: string;
    assigneeAvatarUrl?: string;
    descriptionText?: string;
  } | null>(null);
  const [comments, setComments] = useState<{ id: string; author: string; authorAvatarUrl?: string; body: string; created: string }[]>([]);

  const browseUrl = `${jiraBaseUrl.replace(/\/$/, '')}/browse/${issueKey}`;
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      jiraApi.getIssuePreview(issueKey),
      jiraApi.getIssueComments(issueKey),
    ])
      .then(([preview, commentList]) => {
        if (!cancelled) {
          setIssue(preview);
          setComments(commentList);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err.message || t('notification.loadError'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [issueKey, t, refreshKey]);

  return (
    <aside className="preview-sidebar">
      <div className="preview-sidebar-header">
        <h2 className="preview-sidebar-title">{issueKey}</h2>
        <div className="preview-sidebar-actions">
          <button
            type="button"
            className="preview-sidebar-refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            title={t('preview.refresh')}
            aria-label={t('preview.refresh')}
          >
            <i className={`lni lni-refresh-circle-1-clockwise preview-refresh-icon ${loading ? 'loading' : ''}`} aria-hidden />
          </button>
          <a
            href={browseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="preview-open-external"
            title={t('preview.openInNewTab')}
            aria-label={t('preview.openInNewTab')}
          >
            <i className="lni lni-arrow-angular-top-right" aria-hidden />
          </a>
          <button
            type="button"
            className="preview-sidebar-close"
            onClick={onClose}
            aria-label={t('preview.close')}
          >
            <i className="lni lni-xmark" aria-hidden />
          </button>
        </div>
      </div>

      <div className="preview-sidebar-body">
        {loading && (
          <div className="preview-loading">{t('mindmap.loading')}</div>
        )}
        {error && (
          <div className="preview-error">
            <span>{error}</span>
            <a href={browseUrl} target="_blank" rel="noopener noreferrer" className="preview-open-link">
              {t('preview.openInNewTab')}
            </a>
          </div>
        )}
        {!loading && !error && issue && (
          <>
            <div className="preview-issue-header">
              <span className="preview-issue-type">
                <i className={`lni ${getTypeIcon(issue.issueType)}`} aria-hidden />
                {issue.issueType}
              </span>
              {issue.priority && (
                <span className="preview-issue-priority">{issue.priority}</span>
              )}
            </div>
            <h3 className="preview-issue-summary">{issue.summary}</h3>
            <div className="preview-issue-meta">
              <span className="preview-issue-status">{issue.status}</span>
              {issue.assignee && (
                <div className="preview-issue-assignee">
                  {issue.assigneeAvatarUrl && (
                    <img src={issue.assigneeAvatarUrl} alt="" className="preview-assignee-avatar" />
                  )}
                  <span>{issue.assignee}</span>
                </div>
              )}
            </div>
            {issue.descriptionText && (
              <div className="preview-issue-description">
                <h4 className="preview-section-title">{t('preview.description')}</h4>
                <div className="preview-description-text">{issue.descriptionText}</div>
              </div>
            )}
            {comments.length > 0 && (
              <div className="preview-issue-comments">
                <h4 className="preview-section-title">
                  {t('preview.comments')}
                  <span className="preview-comments-count">{comments.length}</span>
                </h4>
                <div className="preview-comments-list">
                  {comments.map((c) => (
                    <div key={c.id} className="preview-comment">
                      <div className="preview-comment-header">
                        {c.authorAvatarUrl && (
                          <img src={c.authorAvatarUrl} alt="" className="preview-comment-avatar" />
                        )}
                        <span className="preview-comment-author">{c.author}</span>
                        <span className="preview-comment-date">
                          {new Date(c.created).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="preview-comment-body">{c.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
