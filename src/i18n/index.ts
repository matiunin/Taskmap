// Экспорт системы локализации
export { translations, languageInfo, getTranslation, getPluralForm } from './translations';
export type { Language, Translations, AllTranslations } from './types';
export { LanguageProvider, useTranslation, usePluralTranslation } from './LanguageContext';
