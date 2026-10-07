/**
 * Рекурсивное извлечение текста из ADF (Atlassian Document Format)
 */
export function extractTextFromAdf(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text || '@unknown';
  if (node.type === 'emoji') return node.attrs?.shortName || '';
  if (node.type === 'inlineCard' || node.type === 'blockCard') return node.attrs?.url || '';
  
  if (!node.content || !Array.isArray(node.content)) return '';
  
  const parts = node.content.map((child: any) => extractTextFromAdf(child));
  
  if (['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'rule'].includes(node.type)) {
    return parts.join('') + '\n';
  }
  
  return parts.join('');
}

const ISSUE_KEY_REGEX = /\b[A-Z][A-Z0-9]+-\d+\b/g;
// URL может содержать /browse/KEY-123 с опциональным слэшем и query
const BROWSE_URL_REGEX = /\/browse\/([A-Z][A-Z0-9]+-\d+)(?:\/|\?|$)/;

/**
 * Извлечение ключей задач Jira из plain text
 */
export function extractIssueKeysFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(ISSUE_KEY_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractKeyFromUrl(url: string): string[] {
  if (!url || typeof url !== 'string') return [];
  const m = url.match(BROWSE_URL_REGEX);
  if (m) return [m[1]];
  return extractIssueKeysFromText(url);
}

/**
 * Рекурсивное извлечение ключей задач Jira из ADF.
 * Находит ключи в:
 * - inlineCard / blockCard URL (ссылки на задачи)
 * - ссылках (attrs.href, attrs.url)
 * - обычном тексте (PROJECT-123)
 * - корневой массив content (некоторые API отдают массив блоков)
 */
export function extractIssueKeysFromAdf(node: any): string[] {
  if (!node) return [];

  if (Array.isArray(node)) {
    const keys: string[] = [];
    for (const child of node) {
      keys.push(...extractIssueKeysFromAdf(child));
    }
    return [...new Set(keys)];
  }

  if (typeof node === 'string') {
    return extractIssueKeysFromText(node);
  }

  if (node.type === 'inlineCard' || node.type === 'blockCard') {
    const url: string = node.attrs?.url || node.attrs?.data?.url || '';
    return extractKeyFromUrl(url);
  }

  if (node.type === 'text') {
    return extractIssueKeysFromText(node.text || '');
  }

  if (node.attrs?.href) {
    const fromHref = extractKeyFromUrl(node.attrs.href);
    if (fromHref.length > 0) return fromHref;
  }
  if (node.attrs?.url) {
    const fromUrl = extractKeyFromUrl(node.attrs.url);
    if (fromUrl.length > 0) return fromUrl;
  }

  if (!node.content || !Array.isArray(node.content)) return [];

  const keys: string[] = [];
  for (const child of node.content) {
    keys.push(...extractIssueKeysFromAdf(child));
  }
  return [...new Set(keys)];
}

/**
 * Глубокий поиск ключей во всех строках объекта (fallback для нестандартных структур).
 */
export function extractIssueKeysFromObject(obj: any): string[] {
  if (!obj) return [];
  const keys: string[] = [];
  const seen = new Set<object>();

  function walk(val: any) {
    if (val == null) return;
    if (typeof val === 'string') {
      keys.push(...extractIssueKeysFromText(val), ...extractKeyFromUrl(val));
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(walk);
      return;
    }
    if (typeof val === 'object') {
      if (seen.has(val)) return;
      seen.add(val);
      for (const v of Object.values(val)) walk(v);
    }
  }
  walk(obj);
  return [...new Set(keys)];
}
