export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority?: string;
  assignee?: string;
  assigneeAvatarUrl?: string;
  reporter?: string;
  reporterAvatarUrl?: string;
  created?: string;
  updated?: string;
}

export interface JiraIssueLink {
  id: string;
  type: {
    id: string;
    name: string;
    inward: string;
    outward: string;
  };
  inwardIssue?: JiraIssue;
  outwardIssue?: JiraIssue;
}

export interface ConfluenceMention {
  id: string;
  title: string;
  url: string;
  space?: string;
  iconUrl?: string;
}

export type AutomationInputType = 'TEXT' | 'PARAGRAPH' | 'NUMBER' | 'BOOLEAN' | 'DROPDOWN';

export interface AutomationInputPrompt {
  inputType: AutomationInputType;
  displayName: string;
  variableName: string;
  required: boolean;
  defaultValue?: string | number | boolean | string[];
}

export interface AutomationInputValue {
  inputType: AutomationInputType;
  value: string | number | boolean;
}

export interface AutomationManualRule {
  id: string;
  name: string;
  userInputs?: AutomationInputPrompt[];
}

// Данные одной задачи на холсте
export interface TaskData {
  id: string; // уникальный id для этого слота на холсте
  rootIssue: JiraIssue;
  links: JiraIssueLink[];
  confluenceMentions: ConfluenceMention[];
}

export interface GraphNode {
  id: string;
  type: 'input' | 'default' | 'output';
  position: { x: number; y: number };
  data: {
    label: string;
    issue: JiraIssue;
    issueKey?: string | null; // Для отслеживания дубликатов (null для групп связей)
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
  markerEnd?: {
    type: string;
    color?: string;
  };
}
