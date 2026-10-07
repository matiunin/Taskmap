import React, { useState, useEffect } from 'react';
import { JiraConfig } from '../types';
import { useTranslation } from '../i18n';
import { LanguageSelector } from './LanguageSelector';
import { secureSessionStorage } from '../utils/secureStorage';
import './ProfileEditor.css';

interface ProfileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: JiraConfig) => void;
  currentConfig: JiraConfig | null;
  onDisconnect: () => void;
}

const normalizeJiraUrl = (input: string): string => {
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

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  currentConfig,
  onDisconnect,
}) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<JiraConfig>({
    baseUrl: '',
    email: '',
    apiToken: '',
  });
  const [showApiToken, setShowApiToken] = useState(false);

  useEffect(() => {
    if (isOpen && currentConfig) {
      setConfig(currentConfig);
    }
  }, [isOpen, currentConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeJiraUrl(config.baseUrl);
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'https:') {
        alert(t('config.urlMustStartWith'));
        return;
      }
    } catch {
      alert(t('profile.invalidUrl'));
      return;
    }
    if (!config.email || !config.apiToken) {
      alert(t('profile.fillAllFields'));
      return;
    }
    if (!validateEmail(config.email)) {
      alert(t('profile.invalidEmail') || 'Invalid email format');
      return;
    }
    const finalConfig = { ...config, baseUrl: normalized };
    secureSessionStorage.setItem('jiraConfig', JSON.stringify(finalConfig));
    onSave(finalConfig);
    onClose();
  };

  const handleChange = (field: keyof JiraConfig) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConfig({ ...config, [field]: e.target.value });
  };

  const handleUrlBlur = () => {
    const normalized = normalizeJiraUrl(config.baseUrl);
    if (normalized !== config.baseUrl) {
      setConfig({ ...config, baseUrl: normalized });
    }
  };

  const handleCancel = () => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="profile-editor-overlay" onClick={handleCancel}>
      <div className="profile-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-editor-header">
          <h2 className="profile-editor-title">{t('profile.settings')}</h2>
          <button className="close-button" onClick={handleCancel} aria-label={t('profile.close')}>
            ×
          </button>
        </div>

          <div className="profile-editor-form">
            <form onSubmit={handleSubmit}>
              <div className="form-group language-group">
                <label>{t('profile.languageLabel')}</label>
                <LanguageSelector />
              </div>
              <div className="form-group">
                <label htmlFor="profile-baseUrl">
                  {t('profile.urlLabel')} <span className="required">*</span>
                </label>
                <input
                  id="profile-baseUrl"
                  type="text"
                  value={config.baseUrl}
                  onChange={handleChange('baseUrl')}
                  onBlur={handleUrlBlur}
                  placeholder={t('config.urlPlaceholder')}
                  required
                />
                <small>{t('profile.urlHint')}</small>
              </div>
              <div className="form-group">
                <label htmlFor="profile-email">
                  {t('profile.emailLabel')} <span className="required">*</span>
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={config.email}
                  onChange={handleChange('email')}
                  placeholder={t('config.emailPlaceholder')}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="profile-apiToken">
                  {t('profile.apiTokenLabel')} <span className="required">*</span>
                </label>
                <div className="password-input-wrapper">
                  <input
                    id="profile-apiToken"
                    type={showApiToken ? 'text' : 'password'}
                    value={config.apiToken}
                    onChange={handleChange('apiToken')}
                    placeholder={t('config.apiTokenPlaceholder')}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowApiToken(!showApiToken)}
                    aria-label={showApiToken ? 'Hide token' : 'Show token'}
                  >
                    {showApiToken ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                <small>
                  <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">
                    {t('profile.getApiToken')}
                  </a>
                </small>
              </div>
              <button type="button" className="disconnect-button" onClick={onDisconnect}>
                {t('profile.disconnect')}
              </button>
              <div className="profile-editor-actions">
                <button type="button" className="cancel-button" onClick={handleCancel}>
                  {t('profile.cancel')}
                </button>
                <button type="submit" className="save-button">
                  {t('profile.save')}
                </button>
              </div>
            </form>
          </div>
      </div>
    </div>
  );
};
