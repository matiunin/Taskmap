// Регулярка для ключа Jira (регистронезависимая: proj-123, PROJ-123)
const ISSUE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
const ISSUE_KEY_IN_URL = /([A-Za-z][A-Za-z0-9]*-\d+)(?:\?|$)/;
// Извлечь ключ из строки (поддержка en-dash, em-dash, minus)
const ISSUE_KEY_EXTRACT = /([A-Za-z][A-Za-z0-9]*)[\-\u2013\u2014\u2212](\d+)/;

function normalizeKey(key: string): string {
  return key.toUpperCase();
}

function sanitizeInput(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // zero-width, BOM, nbsp
    .replace(/[\u2013\u2014\u2212]/g, '-')        // en-dash, em-dash, minus → hyphen
    .trim();
}

export function parseJiraUrl(url: string): string | null {
  const trimmed = sanitizeInput(url || '');
  if (!trimmed) return null;

  // Сначала проверяем plain key (task-3, PROJ-123) — без попытки парсить как URL
  if (trimmed.match(ISSUE_KEY_PATTERN)) {
    return normalizeKey(trimmed);
  }

  // Если не совпало — возможно нестандартный дефис или пробелы
  const extractMatch = trimmed.match(new RegExp('^' + ISSUE_KEY_EXTRACT.source + '$'));
  if (extractMatch) {
    return normalizeKey(`${extractMatch[1]}-${extractMatch[2]}`);
  }
  // Пробуем без пробелов: "task - 3" → "task-3"
  const noSpaces = trimmed.replace(/\s+/g, '');
  if (noSpaces.match(ISSUE_KEY_PATTERN)) {
    return normalizeKey(noSpaces);
  }

  try {
    const urlObj = new URL(trimmed);
    const pathParts = urlObj.pathname.split('/');
    const issueIndex = pathParts.findIndex(part => part === 'browse' || part.match(ISSUE_KEY_PATTERN));
    
    if (issueIndex !== -1) {
      if (pathParts[issueIndex] === 'browse' && pathParts[issueIndex + 1]) {
        return normalizeKey(pathParts[issueIndex + 1]);
      }
      if (pathParts[issueIndex].match(ISSUE_KEY_PATTERN)) {
        return normalizeKey(pathParts[issueIndex]);
      }
    }
    
    // Попытка найти ключ задачи в конце URL
    const match = trimmed.match(ISSUE_KEY_IN_URL);
    if (match) {
      return normalizeKey(match[1]);
    }
    
    return null;
  } catch {
    return null;
  }
}
