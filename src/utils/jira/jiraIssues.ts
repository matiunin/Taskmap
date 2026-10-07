import type { JiraIssueLink } from '../../types';
import { JiraApiClient } from './jiraRequest';
import { extractTextFromAdf, extractIssueKeysFromAdf, extractIssueKeysFromText, extractIssueKeysFromObject } from './jiraConversions';

JiraApiClient.prototype.getIssuePreview = async function (issueKey) {
  const data = await this.request<any>(`/issue/${issueKey}?fields=summary,status,issuetype,priority,assignee,reporter,created,updated,description,labels,components,fixVersions,resolution`);

  const assignee = data.fields.assignee;
  const reporter = data.fields.reporter;

  let descriptionText: string | undefined;
  if (data.fields.description) {
    try {
      descriptionText = extractTextFromAdf(data.fields.description);
    } catch {
      descriptionText = undefined;
    }
  }

  return {
    id: data.id,
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status.name,
    issueType: data.fields.issuetype.name,
    priority: data.fields.priority?.name,
    assignee: assignee?.displayName,
    assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'] || assignee?.avatarUrls?.['24x24'],
    reporter: reporter?.displayName,
    reporterAvatarUrl: reporter?.avatarUrls?.['32x32'] || reporter?.avatarUrls?.['24x24'],
    created: data.fields.created,
    updated: data.fields.updated,
    descriptionText,
    labels: data.fields.labels || [],
    components: data.fields.components?.map((c: any) => c.name) || [],
    fixVersions: data.fields.fixVersions?.map((v: any) => v.name) || [],
    resolution: data.fields.resolution?.name,
  };
};

JiraApiClient.prototype.getIssueComments = async function (issueKey) {
  try {
    const data = await this.request<any>(`/issue/${issueKey}/comment?orderBy=-created&maxResults=50`);
    
    if (!data.comments || !Array.isArray(data.comments)) return [];

    return data.comments.map((comment: any) => ({
      id: comment.id,
      author: comment.author?.displayName || 'Unknown',
      authorAvatarUrl: comment.author?.avatarUrls?.['32x32'] || comment.author?.avatarUrls?.['24x24'],
      body: extractTextFromAdf(comment.body),
      created: comment.created,
      updated: comment.updated,
    }));
  } catch (error) {
    return [];
  }
};

JiraApiClient.prototype.getIssue = async function (issueKey) {
  const data = await this.request<any>(`/issue/${issueKey}?fields=summary,status,issuetype,priority,assignee,reporter,created,updated`);

  const assignee = data.fields.assignee;
  const reporter = data.fields.reporter;

  return {
    id: data.id,
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status.name,
    issueType: data.fields.issuetype.name,
    priority: data.fields.priority?.name,
    assignee: assignee?.displayName,
    assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'] || assignee?.avatarUrls?.['24x24'],
    reporter: reporter?.displayName,
    reporterAvatarUrl: reporter?.avatarUrls?.['32x32'] || reporter?.avatarUrls?.['24x24'],
    created: data.fields.created,
    updated: data.fields.updated,
  };
};

JiraApiClient.prototype.searchIssues = async function (jql, fields) {
  if (!fields) {
    fields = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated'];
  }
  try {
    const response = await this.request<any>('/search/jql', {
      method: 'POST',
      data: {
        jql,
        fields,
        maxResults: 100
      }
    });
    return response.issues || [];
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.getSubtasks = async function (issueKey) {
  const issues = await this.searchIssues(`parent = ${issueKey}`);
  
  if (issues.length === 0) {
    return [];
  }
  return issues.map((issue: any) => {
    const assignee = issue.fields.assignee;
    const reporter = issue.fields.reporter;
    
    return {
      id: `subtask-${issue.key}`,
      type: {
        id: 'subtask',
        name: 'Sub-task',
        inward: 'parent of',
        outward: 'sub-task of',
      },
      outwardIssue: {
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        issueType: issue.fields.issuetype?.name || 'Sub-task',
        priority: issue.fields.priority?.name,
        assignee: assignee?.displayName,
        assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'] || assignee?.avatarUrls?.['24x24'],
        reporter: reporter?.displayName,
        reporterAvatarUrl: reporter?.avatarUrls?.['32x32'] || reporter?.avatarUrls?.['24x24'],
        created: issue.fields.created,
        updated: issue.fields.updated,
      },
    };
  });
};

JiraApiClient.prototype.getConfluenceMentions = async function (issueKey) {
  try {
    const remoteLinks = await this.request<any[]>(`/issue/${issueKey}/remotelink`);
    
    if (!Array.isArray(remoteLinks) || remoteLinks.length === 0) {
      return [];
    }
    
    const confluenceLinks = remoteLinks.filter((link: any) => {
      const url = link.object?.url || '';
      const appName = link.application?.name?.toLowerCase() || '';
      return url.includes('confluence') || 
             url.includes('/wiki/') || 
             appName.includes('confluence');
    });
    return confluenceLinks.map((link: any) => ({
      id: link.id?.toString() || link.globalId || `confluence-${Date.now()}`,
      title: link.object?.title || 'Confluence страница',
      url: link.object?.url || '',
      space: link.object?.summary || undefined,
      iconUrl: link.object?.icon?.url16x16 || link.object?.icon?.url32x32 || undefined,
    }));
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.getIssueLinks = async function (issueKey) {
  try {
    const data = await this.request<any>(`/issue/${issueKey}?fields=issuelinks,parent`);
    const links: JiraIssueLink[] = [];

    if (data.fields?.parent) {
      try {
        const parentData = await this.request<any>(`/issue/${data.fields.parent.key}?fields=summary,status,issuetype,priority,assignee,reporter,created,updated`);
        const assignee = parentData.fields.assignee;
        const reporter = parentData.fields.reporter;

        links.push({
          id: `parent-${data.fields.parent.key}`,
          type: {
            id: 'parent-child',
            name: 'Parent-Child',
            inward: 'child of',
            outward: 'parent of',
          },
          inwardIssue: {
            id: parentData.id,
            key: parentData.key,
            summary: parentData.fields.summary,
            status: parentData.fields.status?.name || 'Unknown',
            issueType: parentData.fields.issuetype?.name || 'Task',
            priority: parentData.fields.priority?.name,
            assignee: assignee?.displayName,
            assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'],
            reporter: reporter?.displayName,
            reporterAvatarUrl: reporter?.avatarUrls?.['32x32'],
            created: parentData.fields.created,
            updated: parentData.fields.updated,
          },
        });
      } catch (error) {
      }
    }
    if (data.fields?.issuelinks && Array.isArray(data.fields.issuelinks)) {
      data.fields.issuelinks.forEach((l: any, i: number) => {
      });

      const linkedIssuePromises = data.fields.issuelinks.map(async (link: any) => {
        const linkData: JiraIssueLink = {
          id: link.id,
          type: {
            id: link.type.id,
            name: link.type.name,
            inward: link.type.inward,
            outward: link.type.outward,
          },
        };

        if (link.outwardIssue) {
          try {
            const fullIssueData = await this.request<any>(`/issue/${link.outwardIssue.key}?fields=summary,status,issuetype,priority,assignee,reporter,created,updated`);
            const assignee = fullIssueData.fields.assignee;
            const reporter = fullIssueData.fields.reporter;

            linkData.outwardIssue = {
              id: fullIssueData.id,
              key: fullIssueData.key,
              summary: fullIssueData.fields.summary,
              status: fullIssueData.fields.status.name,
              issueType: fullIssueData.fields.issuetype.name,
              priority: fullIssueData.fields.priority?.name,
              assignee: assignee?.displayName,
              assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'] || assignee?.avatarUrls?.['24x24'],
              reporter: reporter?.displayName,
              reporterAvatarUrl: reporter?.avatarUrls?.['32x32'] || reporter?.avatarUrls?.['24x24'],
              created: fullIssueData.fields.created,
              updated: fullIssueData.fields.updated,
            };
          } catch (error) {
            linkData.outwardIssue = {
              id: link.outwardIssue.id,
              key: link.outwardIssue.key,
              summary: link.outwardIssue.fields?.summary || 'Связанная задача',
              status: link.outwardIssue.fields?.status?.name || 'Unknown',
              issueType: link.outwardIssue.fields?.issuetype?.name || 'Task',
            };
          }
        }

        if (link.inwardIssue) {
          try {
            const fullIssueData = await this.request<any>(`/issue/${link.inwardIssue.key}?fields=summary,status,issuetype,priority,assignee,reporter,created,updated`);
            const assignee = fullIssueData.fields.assignee;
            const reporter = fullIssueData.fields.reporter;

            linkData.inwardIssue = {
              id: fullIssueData.id,
              key: fullIssueData.key,
              summary: fullIssueData.fields.summary,
              status: fullIssueData.fields.status.name,
              issueType: fullIssueData.fields.issuetype.name,
              priority: fullIssueData.fields.priority?.name,
              assignee: assignee?.displayName,
              assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'] || assignee?.avatarUrls?.['24x24'],
              reporter: reporter?.displayName,
              reporterAvatarUrl: reporter?.avatarUrls?.['32x32'] || reporter?.avatarUrls?.['24x24'],
              created: fullIssueData.fields.created,
              updated: fullIssueData.fields.updated,
            };
          } catch (error) {
            linkData.inwardIssue = {
              id: link.inwardIssue.id,
              key: link.inwardIssue.key,
              summary: link.inwardIssue.fields?.summary || 'Связанная задача',
              status: link.inwardIssue.fields?.status?.name || 'Unknown',
              issueType: link.inwardIssue.fields?.issuetype?.name || 'Task',
            };
          }
        }

        return linkData;
      });

      const resolvedLinks = await Promise.all(linkedIssuePromises);
      links.push(...resolvedLinks.filter(l => l.outwardIssue || l.inwardIssue));
    }
    return links;
  } catch (error) {
    return [];
  }
};

const MAX_MENTION_ISSUES = 20;

JiraApiClient.prototype.getIssueMentions = async function (issueKey) {
  try {
    const [issueData, commentsData] = await Promise.all([
      this.request<any>(`/issue/${issueKey}?fields=description`),
      this.request<any>(`/issue/${issueKey}/comment?orderBy=-created&maxResults=50`),
    ]);

    const allKeys = new Set<string>();

    if (issueData.fields?.description) {
      const desc = issueData.fields.description;
      if (typeof desc === 'string') {
        for (const key of extractIssueKeysFromText(desc)) {
          allKeys.add(key);
        }
      } else if (desc && typeof desc === 'object') {
        extractIssueKeysFromAdf(desc).forEach(k => allKeys.add(k));
        extractIssueKeysFromObject(desc).forEach(k => allKeys.add(k));
      }
    }

    if (commentsData.comments && Array.isArray(commentsData.comments)) {
      for (const comment of commentsData.comments) {
        const body = comment.body;
        if (!body) continue;
        if (typeof body === 'string') {
          for (const key of extractIssueKeysFromText(body)) {
            allKeys.add(key);
          }
        } else {
          const fromAdf = extractIssueKeysFromAdf(body);
          if (fromAdf.length > 0) {
            fromAdf.forEach(k => allKeys.add(k));
          } else {
            const text = extractTextFromAdf(body);
            if (text) {
              for (const key of extractIssueKeysFromText(text)) {
                allKeys.add(key);
              }
            }
          }
        }
      }
    }

    allKeys.delete(issueKey);

    if (allKeys.size === 0) {
      return [];
    }

    const keysToFetch = [...allKeys].slice(0, MAX_MENTION_ISSUES);
    const results = await Promise.allSettled(
      keysToFetch.map(key => this.getIssue(key))
    );

    const mentionLinks: JiraIssueLink[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const issue = result.value;
        mentionLinks.push({
          id: `mention-${issue.key}`,
          type: {
            id: 'mention',
            name: 'Mention',
            inward: 'mentioned in',
            outward: 'mentions',
          },
          outwardIssue: issue,
        });
      }
    }
    return mentionLinks;
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.getAllRelatedIssues = async function (issueKey) {
  const [subtasks, issueLinks, confluenceMentions, issueMentions] = await Promise.all([
    this.getSubtasks(issueKey),
    this.getIssueLinks(issueKey),
    this.getConfluenceMentions(issueKey),
    this.getIssueMentions(issueKey),
  ]);

  const links: JiraIssueLink[] = [...subtasks, ...issueLinks];

  const seen = new Set<string>();
  const uniqueLinks = links.filter(link => {
    const ik = link.outwardIssue?.key || link.inwardIssue?.key;
    const uniqueKey = `${link.id}-${ik}`;
    if (!ik || seen.has(uniqueKey)) return false;
    seen.add(uniqueKey);
    return true;
  });

  // Добавляем все упоминания (в т.ч. те, что уже есть как связи — показываем в обеих группах)
  const uniqueMentions = issueMentions.filter(m => {
    const key = m.outwardIssue?.key || m.inwardIssue?.key;
    return !!key;
  });

  uniqueLinks.push(...uniqueMentions);

  const subtaskCount = uniqueLinks.filter(l => l.type.id === 'subtask').length;
  const parentCount = uniqueLinks.filter(l => l.id.startsWith('parent-')).length;
  const mentionCount = uniqueLinks.filter(l => l.type.id === 'mention').length;
  const issueLinkCount = uniqueLinks.length - subtaskCount - parentCount - mentionCount;
  return { links: uniqueLinks, confluenceMentions };
};

JiraApiClient.prototype.getParentChain = async function (issueKey) {
  const chain: string[] = [];
  let currentKey = issueKey;
  const visited = new Set<string>();

  while (currentKey && !visited.has(currentKey)) {
    visited.add(currentKey);
    try {
      const data = await this.request<any>(`/issue/${currentKey}?fields=parent`);
      if (data.fields?.parent?.key) {
        chain.push(data.fields.parent.key);
        currentKey = data.fields.parent.key;
      } else {
        break;
      }
    } catch (error) {
      break;
    }
  }
  return chain;
};

JiraApiClient.prototype.getRecentlyViewedIssues = async function (maxResults) {
  if (maxResults === undefined) maxResults = 10;
  try {
    const issues = await this.searchIssues(
      'issuekey in issueHistory() ORDER BY lastViewed DESC',
      ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated']
    );
    
    const result = issues.slice(0, maxResults).map((issue: any) => {
      const assignee = issue.fields.assignee;
      const reporter = issue.fields.reporter;
      
      return {
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        issueType: issue.fields.issuetype?.name || 'Task',
        priority: issue.fields.priority?.name,
        assignee: assignee?.displayName,
        assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'] || assignee?.avatarUrls?.['24x24'],
        reporter: reporter?.displayName,
        reporterAvatarUrl: reporter?.avatarUrls?.['32x32'] || reporter?.avatarUrls?.['24x24'],
        created: issue.fields.created,
        updated: issue.fields.updated,
      };
    });
    return result;
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.getMyAssignedIssues = async function (maxResults) {
  if (maxResults === undefined) maxResults = 20;
  try {
    const issues = await this.searchIssues(
      'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
      ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated']
    );

    const result = issues.slice(0, maxResults).map((issue: any) => {
      const assignee = issue.fields.assignee;
      const reporter = issue.fields.reporter;

      return {
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        issueType: issue.fields.issuetype?.name || 'Task',
        priority: issue.fields.priority?.name,
        assignee: assignee?.displayName,
        assigneeAvatarUrl: assignee?.avatarUrls?.['32x32'] || assignee?.avatarUrls?.['24x24'],
        reporter: reporter?.displayName,
        reporterAvatarUrl: reporter?.avatarUrls?.['32x32'] || reporter?.avatarUrls?.['24x24'],
        created: issue.fields.created,
        updated: issue.fields.updated,
      };
    });
    return result;
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.getProjects = async function () {
  try {
    const projects = await this.request<any[]>('/project');

    const result = projects.map((p: any) => ({
      key: p.key,
      name: p.name,
    }));
    return result;
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.getStatuses = async function () {
  try {
    const statuses = await this.request<any[]>('/status');

    // Group by category and deduplicate by name
    const categoryOrder = ['To Do', 'In Progress', 'Done'];
    const seen = new Set<string>();
    const grouped: { category: string; statuses: { id: string; name: string }[] }[] = [];

    for (const catName of categoryOrder) {
      const categoryStatuses: { id: string; name: string }[] = [];
      for (const s of statuses) {
        const cat = s.statusCategory?.name || 'Other';
        if (cat === catName && !seen.has(s.name)) {
          seen.add(s.name);
          categoryStatuses.push({ id: s.id, name: s.name });
        }
      }
      if (categoryStatuses.length > 0) {
        grouped.push({ category: catName, statuses: categoryStatuses });
      }
    }

    // Add "Other" category for uncategorized
    const otherStatuses: { id: string; name: string }[] = [];
    for (const s of statuses) {
      const cat = s.statusCategory?.name || 'Other';
      if (!categoryOrder.includes(cat) && !seen.has(s.name)) {
        seen.add(s.name);
        otherStatuses.push({ id: s.id, name: s.name });
      }
    }
    if (otherStatuses.length > 0) {
      grouped.push({ category: 'Other', statuses: otherStatuses });
    }
    return grouped;
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.getPriorities = async function () {
  try {
    const priorities = await this.request<any[]>('/priority');

    const result = priorities.map((p: any) => ({
      id: p.id,
      name: p.name,
    }));
    return result;
  } catch (error: any) {
    return [];
  }
};

JiraApiClient.prototype.searchUsers = async function (query) {
  if (!query || query.length < 2) return [];
  try {
    const users = await this.request<any[]>(`/user/search?query=${encodeURIComponent(query)}&maxResults=10`);

    const result = users.map((u: any) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrls?.['24x24'] || u.avatarUrls?.['32x32'],
    }));
    return result;
  } catch (error: any) {
    return [];
  }
};
