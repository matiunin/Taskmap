import { JiraApiClient } from './jiraRequest';
import type { AutomationManualRule, AutomationInputPrompt, AutomationInputValue } from '../../types';

function buildIssueAri(cloudId: string, issueId: string) {
  return `ari:cloud:jira:${cloudId}:issue/${issueId}`;
}

function getAutomationBase(client: JiraApiClient, cloudId: string) {
  if (!client.config) {
    throw new Error('Jira configuration not set');
  }
  return `${client.config.baseUrl}/gateway/api/automation/public/jira/${cloudId}`;
}

JiraApiClient.prototype.getCloudId = async function (): Promise<string> {
  if (!this.config) {
    throw new Error('Jira configuration not set');
  }
  if (this.cloudId) {
    return this.cloudId;
  }

  const infoUrl = `${this.config.baseUrl}/_edge/tenant_info`;
  try {
    const data = await this.requestRaw<any>(infoUrl);
    if (data?.cloudId && typeof data.cloudId === 'string') {
      const id = data.cloudId;
      this.cloudId = id;
      return id;
    }
  } catch (error: any) {
  }

  throw new Error('Не удалось определить cloudId для Automation');
};

JiraApiClient.prototype.getManualRulesForIssue = async function (issueKey: string, issueId?: string): Promise<AutomationManualRule[]> {
  if (!issueKey) return [];

  const cloudId = await this.getCloudId();
  const issueData = issueId
    ? { id: issueId }
    : await this.getIssue(issueKey);

  const issueAri = buildIssueAri(cloudId, issueData.id);
  const url = `${getAutomationBase(this, cloudId)}/rest/v1/rule/manual/search`;

  try {
    const response = await this.requestRaw<any>(url, {
      method: 'POST',
      data: {
        objects: [issueAri],
        limit: 50,
      },
    });

    const rules = response?.data || [];
    return rules.map((rule: any) => ({
      id: String(rule.id),
      name: rule.name || 'Automation rule',
      userInputs: Array.isArray(rule.userInputs)
        ? rule.userInputs.map((input: any): AutomationInputPrompt => ({
            inputType: input.inputType,
            displayName: input.displayName,
            required: Boolean(input.required),
            variableName: input.variableName,
            defaultValue: input.defaultValue,
          }))
        : [],
    }));
  } catch (error: any) {
    throw new Error(error?.message || 'Не удалось загрузить автоматизации для задачи');
  }
};

JiraApiClient.prototype.invokeManualRule = async function (
  ruleId: string,
  issueKey: string,
  options?: { issueId?: string; inputs?: Record<string, AutomationInputValue> }
): Promise<{ result: Record<string, string>; issueAri: string }> {
  if (!ruleId) {
    throw new Error('Не указан идентификатор автоматизации');
  }

  const cloudId = await this.getCloudId();
  const issueData = options?.issueId
    ? { id: options.issueId }
    : await this.getIssue(issueKey);

  const issueAri = buildIssueAri(cloudId, issueData.id);
  const url = `${getAutomationBase(this, cloudId)}/rest/v1/rule/manual/${ruleId}/invocation`;

  const payload: any = {
    objects: [issueAri],
  };

  if (options?.inputs && Object.keys(options.inputs).length > 0) {
    payload.userInputs = options.inputs;
  }

  const result = await this.requestRaw<Record<string, string>>(url, {
    method: 'POST',
    data: payload,
  });

  return { result, issueAri };
};
