// Типы для системы локализации

export type Language = 'ru' | 'en' | 'zh' | 'ar' | 'es';

export interface Translations {
  [key: string]: string;
}

export interface AllTranslations {
  ru: Translations;
  en: Translations;
  zh: Translations;
  ar: Translations;
  es: Translations;
}

export interface LanguageInfo {
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}
