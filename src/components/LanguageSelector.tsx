import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation, Language } from '../i18n';
import './LanguageSelector.css';

/** ISO 3166-1-alpha-2 country codes for flag-icons (https://flagicons.lipis.dev/) */
const LANGUAGE_FLAG_CODES: Record<Language, string> = {
  ru: 'ru',
  en: 'gb',
  zh: 'cn',
  ar: 'sa',
  es: 'es',
};

const MOBILE_BREAKPOINT = 640;

interface LanguageSelectorProps {
  compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false }) => {
  const { language, setLanguage, availableLanguages } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [dropdownAlignRight, setDropdownAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bsRef = useRef<HTMLDivElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value as Language);
  };

  const flagCode = (code: Language) => LANGUAGE_FLAG_CODES[code];

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const checkEdge = useCallback(() => {
    if (isMobile || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const dropdownWidth = 140;
    setDropdownAlignRight(rect.left + dropdownWidth > window.innerWidth - 8);
  }, [isMobile]);

  useEffect(() => {
    if (!open) return;

    checkEdge();

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(target) &&
          (!bsRef.current || !bsRef.current.contains(target))) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, checkEdge]);

  useEffect(() => {
    if (!open || !isMobile) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);

  const handleSelect = (code: Language) => {
    setLanguage(code);
    setOpen(false);
  };

  const renderOptions = () =>
    availableLanguages.map(lang => (
      <li
        key={lang.code}
        role="option"
        aria-selected={language === lang.code}
        className="language-selector-compact-option"
        onClick={() => handleSelect(lang.code)}
      >
        <span className={`language-selector-compact-option-flag fi fi-${flagCode(lang.code)}`} aria-hidden />
        <span>{lang.nativeName}</span>
      </li>
    ));

  if (compact) {
    return (
      <div className="language-selector-compact-wrap" ref={wrapRef}>
        <button
          type="button"
          className="language-selector-compact-trigger"
          onClick={() => setOpen(!open)}
          title="Select language"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Select language"
        >
          <span className={`language-selector-compact-display fi fi-${flagCode(language)}`} aria-hidden />
        </button>

        {open && !isMobile && (
          <ul
            className={`language-selector-compact-dropdown${dropdownAlignRight ? ' language-selector-compact-dropdown--right' : ''}`}
            role="listbox"
            aria-label="Language options"
          >
            {renderOptions()}
          </ul>
        )}

        {open && isMobile && createPortal(
          <div ref={bsRef} className="language-selector-bs-overlay" onClick={() => setOpen(false)}>
            <div
              className="language-selector-bs"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="language-selector-bs__handle" />
              <ul
                className="language-selector-bs__list"
                role="listbox"
                aria-label="Language options"
              >
                {renderOptions()}
              </ul>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <select 
      className="language-selector"
      value={language}
      onChange={handleChange}
    >
      {availableLanguages.map(lang => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeName}
        </option>
      ))}
    </select>
  );
};
