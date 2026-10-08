import axios, { AxiosResponse } from 'axios';
import { JIRA_PROXY_URL, IS_DEV } from '../../config/runtime';
import type { JiraConfig, JiraIssue, JiraIssueLink, ConfluenceMention, AutomationInputValue } from '../../types';
import { JiraReadinessObserver, isJiraReadRequest } from '../jiraReadiness';
import type { JiraReadiness } from '../jiraReadiness';

export interface JiraIssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export class JiraApiClient {
  config: JiraConfig | null = null;
  epicLinkFieldIdCache: string | null | undefined = undefined;
  cloudId: string | null = null;
  private readiness = new JiraReadinessObserver<JiraConfig>();

  subscribeReadiness(listener: (state: JiraReadiness) => void): () => void {
    return this.readiness.subscribe(listener);
  }

  setConfig(config: JiraConfig) {
    this.config = config;
    this.epicLinkFieldIdCache = undefined;
    this.cloudId = null;
    this.readiness.setConfig(config);
  }

  clearConfig() {
    this.config = null;
    this.epicLinkFieldIdCache = undefined;
    this.cloudId = null;
    this.readiness.setConfig(null);
  }

  async request<T>(endpoint: string, options: any = {}): Promise<T> {
    if (!this.config) {
      throw new Error('Jira configuration not set');
    }

    const url = `${this.config.baseUrl}/rest/api/3${endpoint}`;
    return this.performRequest<T>(url, options);
  }

  async requestRaw<T>(fullUrl: string, options: any = {}): Promise<T> {
    if (!this.config) {
      throw new Error('Jira configuration not set');
    }

    return this.performRequest<T>(fullUrl, options);
  }

  private async performRequest<T>(url: string, options: any = {}): Promise<T> {
    if (!this.config) {
      throw new Error('Jira configuration not set');
    }
    const config = this.config;

    const proxyUrl = JIRA_PROXY_URL;

    const maxRetries = 3;
    const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout
    let lastError: any = null;
    const ticket = this.readiness.begin(config);
    let succeeded = false;

    try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let abortController: AbortController | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      try {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        // Create AbortController for additional timeout safety
        abortController = new AbortController();
        timeoutId = setTimeout(() => {
          abortController?.abort();
        }, REQUEST_TIMEOUT_MS);

        const response: AxiosResponse<T> = await axios.post(proxyUrl, {
          url,
          method: options.method || 'GET',
          auth: {
            username: config.email,
            password: config.apiToken,
          },
          data: options.data,
        }, {
          timeout: REQUEST_TIMEOUT_MS,
          signal: abortController.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);
        succeeded = true;
        this.readiness.success(ticket, response.data !== null && typeof response.data === 'object'
          && isJiraReadRequest(url, config.baseUrl, options.method || 'GET', options.data));
        return response.data;
      } catch (error: any) {
        if (timeoutId) clearTimeout(timeoutId);
        lastError = error;
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          if (attempt < maxRetries) continue;
          throw new Error('Запрос Jira истёк по времени. Прокси-сервер не отвечает.');
        }

        if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
          if (attempt < maxRetries) {
            continue;
          }
          throw new Error('Прокси-сервер недоступен. Запустите его командой: npm run proxy');
        }
        
        if (error.response?.status === 404) {
          if (error.response?.data?.fromProxy) {
            throw new Error('Ресурс не найден в Jira (404)');
          }
          
          const testUrl = JIRA_PROXY_URL;
          
          if (attempt < maxRetries) {
            try {
              const testResponse = await axios.get(testUrl, { timeout: 2000 });
              if (testResponse.status === 200) {
                continue;
              }
            } catch (testError: any) {
              // Игнорируем ошибку проверки
            }
            
            continue;
          }
          
          try {
            const testResponse = await axios.get(testUrl, { timeout: 2000 });
            if (testResponse.status === 200) {
              throw new Error('Прокси-сервер работает, но API запрос не удался. Проверьте настройки Jira.');
            }
          } catch (testError: any) {
            throw new Error(IS_DEV ? 'Прокси-сервер недоступен. Запустите его командой: npm run proxy' : 'Прокси-сервер недоступен. Проверьте настройки сервера.');
          }
          
          throw new Error('Прокси-сервер не найден. Проверьте настройки сервера.');
        }
        
        if (error.response?.status === 500) {
          throw new Error(`Ошибка прокси-сервера: ${error.response?.data?.error || error.message}`);
        }
        
        throw error;
      }
    }

    throw lastError;
    } finally {
      this.readiness.finish(ticket, !succeeded);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request('/myself');
      return true;
    } catch (error) {
      return false;
    }
  }

  async testApiEndpoints(): Promise<any> {
    const results: any = {};

    try {
      results.connection = await this.testConnection();
      results.user = await this.request('/myself');
      results.linkTypes = await this.request('/issueLinkType');
      results.search = await this.request('/search?jql=project=TEST&maxResults=1');
    } catch (error: any) {
      results.error = error.message;
    }

    return results;
  }

  // Declared here, implemented in jiraIssues.ts
  declare getIssue: (issueKey: string) => Promise<JiraIssue>;
  declare getIssuePreview: (issueKey: string) => Promise<JiraIssue & { descriptionText?: string; labels?: string[]; components?: string[]; fixVersions?: string[]; resolution?: string }>;
  declare getIssueComments: (issueKey: string) => Promise<{ id: string; author: string; authorAvatarUrl?: string; body: string; created: string; updated: string }[]>;
  declare searchIssues: (jql: string, fields?: string[]) => Promise<any[]>;
  declare getSubtasks: (issueKey: string) => Promise<JiraIssueLink[]>;
  declare getConfluenceMentions: (issueKey: string) => Promise<ConfluenceMention[]>;
  declare getIssueLinks: (issueKey: string) => Promise<JiraIssueLink[]>;
  declare getIssueMentions: (issueKey: string) => Promise<JiraIssueLink[]>;
  declare getAllRelatedIssues: (issueKey: string) => Promise<{ links: JiraIssueLink[]; confluenceMentions: ConfluenceMention[] }>;
  declare getParentChain: (issueKey: string) => Promise<string[]>;
  declare getRecentlyViewedIssues: (maxResults?: number) => Promise<JiraIssue[]>;
  declare getMyAssignedIssues: (maxResults?: number) => Promise<JiraIssue[]>;
  declare getProjects: () => Promise<{ key: string; name: string }[]>;
  declare getStatuses: () => Promise<{ category: string; statuses: { id: string; name: string }[] }[]>;
  declare getPriorities: () => Promise<{ id: string; name: string }[]>;
  declare searchUsers: (query: string) => Promise<{ accountId: string; displayName: string; avatarUrl?: string }[]>;

  // Declared here, implemented in jiraLinks.ts
  declare getLinkTypes: () => Promise<JiraIssueLinkType[]>;
  declare createIssueLink: (outwardIssueKey: string, inwardIssueKey: string, linkTypeName: string) => Promise<boolean>;
  declare deleteIssueLink: (linkId: string) => Promise<boolean>;
  declare deleteIssue: (issueKey: string, deleteSubtasks?: boolean) => Promise<{ success: boolean; error?: string }>;
  declare changeLinkType: (sourceKey: string, targetKey: string, oldLinkId: string, newLinkTypeName: string, oldLinkTypeName?: string) => Promise<boolean>;
  declare getProjectIssueTypes: (projectKey: string) => Promise<{ id: string; name: string; subtask: boolean }[]>;
  declare changeIssueType: (issueKey: string, issueTypeId: string) => Promise<{ success: boolean; error?: string }>;
  declare convertSubtaskToLink: (parentKey: string, subtaskKey: string, linkTypeName?: string) => Promise<{ success: boolean; error?: string }>;
  declare getEpicLinkFieldId: () => Promise<string | null>;
  declare convertLinkToSubtask: (parentKey: string, issueKey: string, linkId: string, linkTypeName?: string) => Promise<{ success: boolean; error?: string }>;
  declare addChildToEpic: (epicKey: string, childKey: string) => Promise<{ success: boolean; error?: string }>;
  declare removeParent: (issueKey: string) => Promise<{ success: boolean; error?: string }>;

  // Automation helpers (implemented in jiraAutomation.ts)
  declare getCloudId: () => Promise<string>;
  declare getManualRulesForIssue: (issueKey: string, issueId?: string) => Promise<any[]>;
  declare invokeManualRule: (
    ruleId: string,
    issueKey: string,
    options?: { issueId?: string; inputs?: Record<string, AutomationInputValue> }
  ) => Promise<{ result: Record<string, string>; issueAri: string }>;
}
