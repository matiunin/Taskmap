import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Language } from './types';
import { languageInfo, getTranslation, getPluralForm } from './translations';

// Ключ для хранения языка в localStorage
const LANGUAGE_STORAGE_KEY = 'jiraViewerLanguage';

// Определение языка по умолчанию
const getDefaultLanguage = (): Language => {
  // Проверяем сохранённый язык
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved && ['ru', 'en', 'zh', 'ar', 'es'].includes(saved)) {
    return saved as Language;
  }
  
  // Определяем по языку браузера
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('ru')) return 'ru';
  if (browserLang.startsWith('zh')) return 'zh';
  if (browserLang.startsWith('ar')) return 'ar';
  if (browserLang.startsWith('es')) return 'es';
  
  // По умолчанию английский
  return 'en';
};

// Интерфейс контекста
interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  direction: 'ltr' | 'rtl';
  languageName: string;
  availableLanguages: { code: Language; name: string; nativeName: string }[];
}

// Создание контекста
const LanguageContext = createContext<LanguageContextType | null>(null);

// Props для провайдера
interface LanguageProviderProps {
  children: ReactNode;
}

// Провайдер языка
export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getDefaultLanguage);

  // Функция смены языка с сохранением
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    
    // Устанавливаем направление текста на документе
    document.documentElement.dir = languageInfo[lang].direction;
    document.documentElement.lang = lang;
  }, []);

  // Устанавливаем направление при инициализации
  useEffect(() => {
    document.documentElement.dir = languageInfo[language].direction;
    document.documentElement.lang = language;
  }, [language]);

  // Функция перевода
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    return getTranslation(language, key, params);
  }, [language]);

  // Информация о текущем языке
  const direction = languageInfo[language].direction;
  const languageName = languageInfo[language].nativeName;

  // Список доступных языков
  const availableLanguages = Object.entries(languageInfo).map(([code, info]) => ({
    code: code as Language,
    name: info.name,
    nativeName: info.nativeName,
  }));

  const value: LanguageContextType = {
    language,
    setLanguage,
    t,
    direction,
    languageName,
    availableLanguages,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

// Хук для использования переводов
export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};

// Хук для форматирования чисел с правильной формой множественного числа
export const usePluralTranslation = () => {
  const { language, t } = useTranslation();
  
  return useCallback((count: number, keyOne: string, keyFew?: string, keyMany?: string): string => {
    const form = getPluralForm(count, language);
    
    let key: string;
    if (form === 'one') {
      key = keyOne;
    } else if (form === 'few' && keyFew) {
      key = keyFew;
    } else {
      key = keyMany || keyFew || keyOne;
    }
    
    return t(key, { count });
  }, [language, t]);
};

export default LanguageContext;
