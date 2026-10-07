/**
 * Нормализует URL Jira из любого формата в базовый URL
 * Примеры:
 * - "company.atlassian.net" → "https://company.atlassian.net"
 * - "https://company.atlassian.net/browse/TASK-123" → "https://company.atlassian.net"
 * - "company.atlassian.net/jira/software/projects/" → "https://company.atlassian.net"
 */
export const normalizeJiraUrl = (input: string): string => {
  let url = input.trim();
  
  if (!url) return '';
  
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url;
  }
  
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return input.trim();
  }
};
