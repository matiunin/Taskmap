// Система локализации - импорт отдельных языковых файлов
import { Language, AllTranslations, LanguageInfo } from './types';
import { ru, en, zh, ar, es } from './locales';

// Реэкспорт типов
export type { Language, AllTranslations } from './types';
export type { Translations } from './types';

// Информация о языках (название в списке — «по-…» на соответствующем языке). Порядок ключей задаёт порядок в списке.
export const languageInfo: Record<Language, LanguageInfo> = {
  en: { name: 'English', nativeName: 'In English', direction: 'ltr' },
  ru: { name: 'Russian', nativeName: 'По-русски', direction: 'ltr' },
  zh: { name: 'Chinese', nativeName: '用中文', direction: 'ltr' },
  ar: { name: 'Arabic', nativeName: 'بالعربية', direction: 'rtl' },
  es: { name: 'Spanish', nativeName: 'En español', direction: 'ltr' },
};

// Все переводы - собираем из отдельных файлов
export const translations: AllTranslations = {
  ru,
  en,
  zh,
  ar,
  es,
};

// Функция для получения перевода
export function getTranslation(lang: Language, key: string, params?: Record<string, string | number>): string {
  let text = translations[lang][key];
  
  if (!text) {
    // Fallback to English
    text = translations.en[key];
  }
  
  if (!text) {
    return key;
  }
  
  // Replace placeholders like {key}, {count}, etc.
  if (params) {
    Object.entries(params).forEach(([param, value]) => {
      text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), String(value));
    });
  }
  
  return text;
}

// Функция для определения склонения числительных (для русского и других языков с формами множественного числа)
export function getPluralForm(count: number, lang: Language): 'one' | 'few' | 'many' {
  if (lang === 'en' || lang === 'es' || lang === 'zh' || lang === 'ar') {
    return count === 1 ? 'one' : 'many';
  }
  
  // Для русского и славянских языков
  const mod100 = count % 100;
  const mod10 = count % 10;
  
  if (mod10 === 1 && mod100 !== 11) {
    return 'one';
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'few';
  }
  return 'many';
}
