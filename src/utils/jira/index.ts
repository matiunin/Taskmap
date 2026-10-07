export { JiraApiClient } from './jiraRequest';
export type { JiraIssueLinkType } from './jiraRequest';
export { extractTextFromAdf, extractIssueKeysFromAdf, extractIssueKeysFromText } from './jiraConversions';

import { JiraApiClient } from './jiraRequest';

// Register all methods on the prototype before creating the singleton
import './jiraIssues';
import './jiraLinks';
import './jiraAutomation';

export const jiraApi = new JiraApiClient();
