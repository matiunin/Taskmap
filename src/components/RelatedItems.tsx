import React from 'react';
import { JiraIssue, JiraIssueLink, ConfluenceMention } from '../types';
import { useTranslation } from '../i18n';
import { secureSessionStorage } from '../utils/secureStorage';
import { getTypeIcon } from './MindMap/constants';
import './RelatedItems.css';

interface RelatedItemsProps {
  rootIssue: JiraIssue;
  links: JiraIssueLink[];
  confluenceMentions: ConfluenceMention[];
}

interface GroupedLinks {
  parent: JiraIssueLink[];
  subtasks: JiraIssueLink[];
  issueLinks: JiraIssueLink[];
}

const IssueCard: React.FC<{ issue: JiraIssue; linkType?: string }> = ({ issue, linkType }) => {
  const statusColor = getStatusColor(issue.status);
  const typeIcon = getTypeIcon(issue.issueType);
  
  const handleClick = () => {
    // Открываем задачу в Jira
    const baseUrl = secureSessionStorage.getItem('jiraConfig');
    if (baseUrl) {
      const config = JSON.parse(baseUrl);
      window.open(`${config.baseUrl}/browse/${issue.key}`, '_blank');
    }
  };

  return (
    <div className="issue-card" onClick={handleClick}>
      <div className="issue-card-header">
        <span className="issue-type-icon"><i className={`lni ${typeIcon}`} aria-hidden /></span>
        <span className="issue-key">{issue.key}</span>
        <span className="issue-status" style={{ backgroundColor: statusColor }}>
          {issue.status}
        </span>
      </div>
      <div className="issue-card-body">
        <span className="issue-summary">{issue.summary}</span>
      </div>
      {issue.assignee && (
        <div className="issue-card-footer">
          {issue.assigneeAvatarUrl && (
            <img src={issue.assigneeAvatarUrl} alt="" className="assignee-avatar" />
          )}
          <span className="assignee-name">{issue.assignee}</span>
        </div>
      )}
      {linkType && <div className="link-type-badge">{linkType}</div>}
    </div>
  );
};

const ConfluenceCard: React.FC<{ mention: ConfluenceMention }> = ({ mention }) => {
  return (
    <a 
      href={mention.url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="confluence-card"
    >
      <div className="confluence-card-header">
        <span className="confluence-icon"><i className="lni lni-file-multiple" aria-hidden /></span>
        <span className="confluence-badge">Confluence</span>
      </div>
      <div className="confluence-card-body">
        <span className="confluence-title">{mention.title}</span>
      </div>
      {mention.space && (
        <div className="confluence-card-footer">
          <span className="confluence-space"><i className="lni lni-folder-1" aria-hidden /> {mention.space}</span>
        </div>
      )}
    </a>
  );
};

function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('done') || statusLower.includes('готово') || statusLower.includes('closed')) {
    return '#36b37e';
  }
  if (statusLower.includes('progress') || statusLower.includes('работе') || statusLower.includes('review')) {
    return '#0052cc';
  }
  if (statusLower.includes('blocked') || statusLower.includes('заблокирован')) {
    return '#de350b';
  }
  return '#6b778c';
}

function groupLinks(links: JiraIssueLink[]): GroupedLinks {
  const grouped: GroupedLinks = {
    parent: [],
    subtasks: [],
    issueLinks: [],
  };

  links.forEach(link => {
    const typeId = link.type.id.toLowerCase();
    const typeName = link.type.name.toLowerCase();
    
    // Parent - входящая связь типа parent-child
    if (link.id.startsWith('parent-') || 
        (typeName.includes('parent') && link.inwardIssue)) {
      grouped.parent.push(link);
    }
    // Subtasks - исходящие связи типа subtask
    else if (typeId === 'subtask' || 
             typeName.includes('sub-task') || 
             typeName.includes('subtask') ||
             link.id.startsWith('subtask-')) {
      grouped.subtasks.push(link);
    }
    // Все остальные - issue links
    else {
      grouped.issueLinks.push(link);
    }
  });

  return grouped;
}

export const RelatedItems: React.FC<RelatedItemsProps> = ({ rootIssue, links, confluenceMentions }) => {
  const { t } = useTranslation();
  const grouped = groupLinks(links);
  
  const totalCount = grouped.parent.length + grouped.subtasks.length + grouped.issueLinks.length + confluenceMentions.length;

  if (totalCount === 0) {
    return (
      <div className="related-items-empty">
        {t('related.noRelatedItems', { key: rootIssue.key })}
      </div>
    );
  }

  return (
    <div className="related-items">
      {/* Parent Section */}
      {grouped.parent.length > 0 && (
        <section className="related-section parent-section">
          <h3 className="section-title">
            <span className="section-icon"><i className="lni lni-user-4" aria-hidden /></span>
            {t('related.parentTask')}
            <span className="section-count">{grouped.parent.length}</span>
          </h3>
          <div className="section-cards">
            {grouped.parent.map(link => (
              <IssueCard 
                key={link.id} 
                issue={link.inwardIssue!} 
              />
            ))}
          </div>
        </section>
      )}

      {/* Subtasks Section */}
      {grouped.subtasks.length > 0 && (
        <section className="related-section subtasks-section">
          <h3 className="section-title">
            <span className="section-icon"><i className="lni lni-paperclip-1" aria-hidden /></span>
            {t('related.childTasks')}
            <span className="section-count">{grouped.subtasks.length}</span>
          </h3>
          <div className="section-cards">
            {grouped.subtasks.map(link => (
              <IssueCard 
                key={link.id} 
                issue={link.outwardIssue!}
              />
            ))}
          </div>
        </section>
      )}

      {/* Issue Links Section */}
      {grouped.issueLinks.length > 0 && (
        <section className="related-section links-section">
          <h3 className="section-title">
            <span className="section-icon"><i className="lni lni-link-2-angular-right" aria-hidden /></span>
            {t('related.linkedTasks')}
            <span className="section-count">{grouped.issueLinks.length}</span>
          </h3>
          <div className="section-cards">
            {grouped.issueLinks.map(link => {
              const issue = link.outwardIssue || link.inwardIssue;
              const linkType = link.outwardIssue ? link.type.outward : link.type.inward;
              return issue ? (
                <IssueCard 
                  key={link.id} 
                  issue={issue}
                  linkType={linkType}
                />
              ) : null;
            })}
          </div>
        </section>
      )}

      {/* Confluence Mentions Section */}
      {confluenceMentions.length > 0 && (
        <section className="related-section confluence-section">
          <h3 className="section-title">
            <span className="section-icon"><i className="lni lni-file-multiple" aria-hidden /></span>
            {t('related.confluenceMentions')}
            <span className="section-count">{confluenceMentions.length}</span>
          </h3>
          <div className="section-cards">
            {confluenceMentions.map(mention => (
              <ConfluenceCard key={mention.id} mention={mention} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
