import axios from 'axios';
import { jiraApi } from '../jiraApi';
import { JIRA_MEDIA_URL } from '../../config/runtime';

/**
 * Загружает бинарный ресурс из Jira (например, изображение-вложение) через прокси
 * с учётом авторизации. Возвращает blob URL для использования в <img src>.
 */
export async function fetchJiraMedia(url: string): Promise<string> {
  const config = jiraApi.config;
  if (!config) throw new Error('Jira configuration not set');

  if (!config.email || !config.apiToken) throw new Error('Missing Jira credentials');
  const payload = {
    url,
    auth: { username: config.email, password: config.apiToken },
  };

  const response = await axios.post(JIRA_MEDIA_URL, payload, {
    responseType: 'blob',
    timeout: 30000,
  });
  return URL.createObjectURL(response.data);
}
