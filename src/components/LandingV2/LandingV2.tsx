import React, { useState, useEffect, useRef } from 'react';
import { JiraConfig } from '../../types';
import { useTranslation } from '../../i18n';
import { LanguageSelector } from '../LanguageSelector';
import { normalizeJiraUrl } from '../../utils/jiraUrlUtils';
import { MockGraphPreview, MockBatchPreview, SecurityBenefitIllustration } from '../JiraConfig/MockPreviews';
import { secureSessionStorage } from '../../utils/secureStorage';
import './landing-v2.css';

interface LandingV2Props {
  onConfigSave: (config: JiraConfig) => void;
  initialConfig?: JiraConfig | null;
}

const BENEFIT_STEPS = [
  { key: 'feature1', titleKey: 'onboarding.feature1Title', descKey: 'onboarding.feature1Desc', preview: 'graph' },
  { key: 'security', titleKey: 'onboarding.securityTitle', descKey: 'onboarding.securityTagline', preview: 'security' },
  { key: 'feature4', titleKey: 'onboarding.feature4Title', descKey: 'onboarding.feature4Desc', preview: 'batch' },
] as const;

export const LandingV2: React.FC<LandingV2Props> = ({ onConfigSave, initialConfig }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<JiraConfig>({
    baseUrl: initialConfig?.baseUrl || '',
    email: initialConfig?.email || '',
    apiToken: initialConfig?.apiToken || '',
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [showApiToken, setShowApiToken] = useState(false);
  const [isApiTokenHelpExpanded, setIsApiTokenHelpExpanded] = useState(false);
  const [benefitIndex, setBenefitIndex] = useState(0);
  const [isFormModalOpen, setFormModalOpen] = useState(false);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = secureSessionStorage.getItem('jiraConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
        if (parsed.baseUrl) setCurrentStep(2);
        if (parsed.email) setCurrentStep(3);
      } catch (e) {
      }
    }
  }, []);

  useEffect(() => {
    if (config.baseUrl && config.baseUrl.length >= 10 && currentStep === 1) {
      const normalized = normalizeJiraUrl(config.baseUrl);
      try {
        new URL(normalized);
        if (config.baseUrl === normalized) setCurrentStep(2);
      } catch { /* not valid yet */ }
    }
    if (config.email && config.email.includes('@') && currentStep === 2) {
      setCurrentStep(3);
    }
  }, [config.baseUrl, config.email, currentStep]);

  useEffect(() => {
    const id = setInterval(() => {
      setBenefitIndex((i) => (i + 1) % BENEFIT_STEPS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isFormModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isFormModalOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeJiraUrl(config.baseUrl);
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'https:') { alert(t('config.urlMustStartWith')); return; }
    } catch { alert(t('config.invalidUrl')); return; }
    const finalConfig = { ...config, baseUrl: normalized };
    secureSessionStorage.setItem('jiraConfig', JSON.stringify(finalConfig));
    onConfigSave(finalConfig);
    setFormModalOpen(false);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    if (currentStep === 1) {
      e.preventDefault();
      const normalized = normalizeJiraUrl(config.baseUrl);
      try { new URL(normalized); setConfig({ ...config, baseUrl: normalized }); setCurrentStep(2); }
      catch { alert(t('config.invalidUrl')); }
    } else if (currentStep === 2) {
      e.preventDefault();
      if (config.email && config.email.includes('@')) setCurrentStep(3);
    }
  };

  const getButtonText = () => {
    if (currentStep === 1) return t('onboarding.nextEmail');
    if (currentStep === 2) return t('onboarding.nextApiToken');
    return t('config.save');
  };

  const isButtonEnabled = () => {
    if (currentStep === 1) return config.baseUrl.length >= 10;
    if (currentStep === 2) return config.email.includes('@');
    return config.apiToken.length > 0;
  };

  const handleChange = (field: keyof JiraConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [field]: e.target.value });
  };

  const handleUrlBlur = () => {
    const normalized = normalizeJiraUrl(config.baseUrl);
    if (normalized !== config.baseUrl) setConfig({ ...config, baseUrl: normalized });
  };

  const openFormModal = () => {
    setFormModalOpen(true);
  };

  return (
    <div className="landing-v2 landing-v2--light">
      {/* ===== NAV ===== */}
      <nav className="landing-v2__nav">
        <div className="landing-v2__nav-inner">
          <div className="landing-v2__nav-left">
            <TaskmapLogo />
          </div>
          <div className="landing-v2__nav-right">
            <LanguageSelector compact />
          </div>
        </div>
      </nav>

      {/* ===== HERO: только строка URL Jira ===== */}
      <section className="landing-v2__hero">
        <div className="landing-v2__hero-inner">
          <h1 className="landing-v2__title">{t('onboarding.heroDesc')}</h1>
          <p className="landing-v2__subtitle">{t('onboarding.heroSubtitle')}</p>
          <form
            className="landing-v2__hero-form"
            onSubmit={(e) => {
              e.preventDefault();
              const normalized = normalizeJiraUrl(config.baseUrl);
              try {
                new URL(normalized);
                setConfig({ ...config, baseUrl: normalized });
                setCurrentStep(2);
                openFormModal();
              } catch {
                alert(t('config.invalidUrl'));
              }
            }}
          >
            <div className="landing-v2__hero-input-wrap">
              <input
                type="text"
                value={config.baseUrl}
                onChange={handleChange('baseUrl')}
                onBlur={handleUrlBlur}
                placeholder={t('config.urlPlaceholder')}
                className="landing-v2__hero-input"
                required
              />
              <button type="submit" className="landing-v2__hero-submit" disabled={config.baseUrl.length < 10}>
                {t('onboarding.heroTryIt')}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ===== Meet Taskmap: преимущества с переключением ===== */}
      <section className="landing-v2__benefits">
        <div className="landing-v2__benefits-inner">
          <h2 className="landing-v2__benefits-heading">{t('onboarding.featuresTitle')}</h2>
          <div className="landing-v2__benefits-tabs">
            {BENEFIT_STEPS.map((step, i) => (
              <button
                key={step.key}
                type="button"
                className={`landing-v2__benefits-tab ${i === benefitIndex ? 'is-active' : ''}`}
                onClick={() => setBenefitIndex(i)}
              >
                {t(step.titleKey)}
              </button>
            ))}
          </div>
          <div className="landing-v2__benefits-content">
            {BENEFIT_STEPS.map((step, i) => (
              <div
                key={step.key}
                className={`landing-v2__benefits-panel ${i === benefitIndex ? 'is-active' : ''}`}
                aria-hidden={i !== benefitIndex}
              >
                <h3 className="landing-v2__benefits-panel-title">{t(step.titleKey)}</h3>
                <p className="landing-v2__benefits-panel-desc">{t(step.descKey)}</p>
                <div className="landing-v2__benefits-preview">
                  {step.preview === 'graph' && <MockGraphPreview />}
                  {step.preview === 'security' && <SecurityBenefitIllustration />}
                  {step.preview === 'batch' && <MockBatchPreview />}
                </div>
              </div>
            ))}
          </div>
          <div className="landing-v2__benefits-dots">
            {BENEFIT_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`landing-v2__benefits-dot ${i === benefitIndex ? 'is-active' : ''}`}
                onClick={() => setBenefitIndex(i)}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===== MODAL: форма подключения ===== */}
      {isFormModalOpen && (
        <div
          className="landing-v2__modal-overlay"
          onClick={() => setFormModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-v2-form-title"
        >
          <div
            ref={modalContentRef}
            className="landing-v2__modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="landing-v2__modal-close"
              onClick={() => setFormModalOpen(false)}
              aria-label={t('profile.close')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="landing-v2__form-box">
              <div className="landing-v2__form-header">
                <div className="landing-v2__form-icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h2 id="landing-v2-form-title" className="landing-v2__form-title">{t('config.title')}</h2>
              </div>

              <form onSubmit={handleSubmit} className="landing-v2__form">
              <div className={`landing-v2__field ${currentStep >= 1 ? '' : 'is-dimmed'}`}>
                <label htmlFor="v2-baseUrl" className="landing-v2__label">{t('config.urlLabel')}</label>
                <p className="landing-v2__hint">{t('onboarding.urlHint')}</p>
                <input
                  id="v2-baseUrl"
                  type="text"
                  value={config.baseUrl}
                  onChange={handleChange('baseUrl')}
                  onBlur={handleUrlBlur}
                  placeholder={t('config.urlPlaceholder')}
                  className="landing-v2__input"
                  required
                />
              </div>

              <div className={`landing-v2__field ${currentStep >= 2 ? '' : 'is-dimmed'}`}>
                <label htmlFor="v2-email" className="landing-v2__label">{t('config.emailLabel')}</label>
                <p className="landing-v2__hint">{t('onboarding.emailHint')}</p>
                <input
                  id="v2-email"
                  type="email"
                  value={config.email}
                  onChange={handleChange('email')}
                  placeholder={t('config.emailPlaceholder')}
                  className="landing-v2__input"
                  required
                />
              </div>

              <div className={`landing-v2__field ${currentStep >= 3 ? '' : 'is-dimmed'}`}>
                <label htmlFor="v2-apiToken" className="landing-v2__label">{t('config.apiTokenLabel')}</label>
                <p className="landing-v2__hint">
                  {t('onboarding.apiTokenHint')}{' '}
                  <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">
                    {t('onboarding.apiTokenLink')}
                  </a>
                </p>
                <div className="landing-v2__input-wrap">
                  <input
                    id="v2-apiToken"
                    type={showApiToken ? 'text' : 'password'}
                    value={config.apiToken}
                    onChange={handleChange('apiToken')}
                    placeholder={t('config.apiTokenPlaceholder')}
                    className="landing-v2__input"
                    required
                  />
                  <button type="button" onClick={() => setShowApiToken(!showApiToken)} className="landing-v2__toggle-password" aria-label={showApiToken ? 'Hide' : 'Show'}>
                    {showApiToken ? (
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setIsApiTokenHelpExpanded(!isApiTokenHelpExpanded)}
                    className="landing-v2__warning-toggle"
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                    {t('onboarding.apiTokenWarningTitle')}
                    <svg className={`landing-v2__chevron ${isApiTokenHelpExpanded ? 'is-open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  {isApiTokenHelpExpanded && (
                    <div className="landing-v2__warning-content">
                      <p>{t('onboarding.apiTokenWarningText')}</p>
                    </div>
                  )}
                </div>
              </div>

              {isButtonEnabled() && (
                <button
                  type={currentStep === 3 ? 'submit' : 'button'}
                  onClick={handleButtonClick}
                  className="landing-v2__submit"
                >
                  {getButtonText()}
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
      )}

      <footer className="landing-v2__footer">
        <a href="https://lineicons.com" target="_blank" rel="noopener noreferrer">{t('footer.iconsByLineicons')}</a>
      </footer>
    </div>
  );
};

const TaskmapLogo = () => (
  <svg width="120" height="24" viewBox="0 0 127 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.16667 8.33333L11.1667 5" stroke="#6366f1" strokeWidth="1.66667" strokeLinecap="round" opacity="0.6"/>
    <path d="M6.16667 11.6667L11.1667 15" stroke="#10b981" strokeWidth="1.66667" strokeLinecap="round" opacity="0.6"/>
    <circle cx="3.66667" cy="10" r="3.33333" fill="#6366f1"/>
    <circle cx="13.6667" cy="3.33333" r="2.5" fill="#8b5cf6"/>
    <circle cx="13.6667" cy="16.6667" r="2.5" fill="#10b981"/>
    <path d="M24.4953 4.32173V1.36364H38.4323V4.32173H33.237V18.3333H29.6906V4.32173H24.4953Z" fill="currentColor"/>
    <path d="M42.5587 18.5736C41.7467 18.5736 41.023 18.4328 40.3878 18.151C39.7525 17.8638 39.2498 17.4412 38.8797 16.8833C38.5152 16.3198 38.3329 15.6183 38.3329 14.7786C38.3329 14.0716 38.4627 13.4777 38.7223 12.9972C38.9819 12.5166 39.3355 12.1299 39.7829 11.8371C40.2303 11.5444 40.7386 11.3234 41.3075 11.1742C41.882 11.0251 42.4841 10.9201 43.1139 10.8594C43.8541 10.782 44.4507 10.7102 44.9036 10.6439C45.3566 10.5721 45.6853 10.4672 45.8897 10.3291C46.0941 10.191 46.1963 9.98659 46.1963 9.71591V9.66619C46.1963 9.14142 46.0305 8.7354 45.6991 8.44815C45.3732 8.16091 44.9092 8.01728 44.3071 8.01728C43.6718 8.01728 43.1664 8.15815 42.7907 8.43987C42.4151 8.71607 42.1665 9.06408 42.045 9.4839L38.7803 9.21875C38.946 8.44539 39.2719 7.77699 39.758 7.21354C40.2442 6.64457 40.8711 6.20818 41.639 5.90436C42.4123 5.59501 43.3072 5.44034 44.3236 5.44034C45.0307 5.44034 45.7074 5.5232 46.3537 5.68892C47.0055 5.85464 47.5828 6.11151 48.0855 6.45952C48.5937 6.80753 48.9942 7.25497 49.2869 7.80185C49.5797 8.3432 49.7261 8.99227 49.7261 9.74905V18.3333H46.3786V16.5684H46.2791C46.0747 16.9661 45.8013 17.3169 45.4588 17.6207C45.1163 17.919 44.7048 18.1538 44.2242 18.325C43.7436 18.4908 43.1884 18.5736 42.5587 18.5736ZM43.5696 16.1375C44.0889 16.1375 44.5473 16.0354 44.9451 15.831C45.3428 15.6211 45.6549 15.3393 45.8814 14.9858C46.1079 14.6323 46.2211 14.2318 46.2211 13.7843V12.4337C46.1106 12.5055 45.9587 12.5718 45.7654 12.6326C45.5776 12.6878 45.3649 12.7403 45.1274 12.79C44.8898 12.8342 44.6523 12.8756 44.4148 12.9143C44.1772 12.9474 43.9618 12.9778 43.7685 13.0054C43.3542 13.0662 42.9923 13.1629 42.683 13.2955C42.3737 13.428 42.1334 13.6076 41.9621 13.834C41.7909 14.055 41.7053 14.3312 41.7053 14.6626C41.7053 15.1432 41.8793 15.5106 42.2273 15.7647C42.5808 16.0133 43.0283 16.1375 43.5696 16.1375Z" fill="currentColor"/>
    <path d="M63.0541 9.23532L59.8226 9.43419C59.7673 9.15799 59.6486 8.90941 59.4663 8.68845C59.284 8.46196 59.0437 8.28243 58.7454 8.14986C58.4526 8.01176 58.1018 7.94271 57.6931 7.94271C57.1462 7.94271 56.6849 8.05871 56.3093 8.29072C55.9337 8.5172 55.7459 8.82102 55.7459 9.20218C55.7459 9.506 55.8674 9.76286 56.1104 9.97278C56.3535 10.1827 56.7706 10.3512 57.3616 10.4782L59.6651 10.9422C60.9025 11.1963 61.825 11.6051 62.4326 12.1686C63.0403 12.732 63.3441 13.4722 63.3441 14.3892C63.3441 15.2233 63.0983 15.9553 62.6067 16.585C62.1205 17.2147 61.4521 17.7064 60.6014 18.0599C59.7563 18.4079 58.7813 18.5819 57.6765 18.5819C55.9917 18.5819 54.6493 18.2311 53.6495 17.5296C52.6552 16.8225 52.0724 15.8613 51.9012 14.6461L55.373 14.4638C55.4779 14.9775 55.732 15.3697 56.1353 15.6404C56.5385 15.9055 57.055 16.0381 57.6848 16.0381C58.3035 16.0381 58.8006 15.9193 59.1763 15.6818C59.5574 15.4388 59.7507 15.1267 59.7563 14.7455C59.7507 14.4251 59.6154 14.1627 59.3503 13.9583C59.0851 13.7484 58.6763 13.5882 58.1239 13.4777L55.9199 13.0386C54.677 12.79 53.7517 12.3591 53.1441 11.746C52.5419 11.1328 52.2409 10.3512 52.2409 9.40104C52.2409 8.58349 52.4618 7.87918 52.9038 7.28812C53.3512 6.69705 53.9782 6.24132 54.7847 5.92093C55.5967 5.60054 56.5468 5.44034 57.6351 5.44034C59.2425 5.44034 60.5075 5.78007 61.43 6.45952C62.3581 7.13897 62.8994 8.06424 63.0541 9.23532Z" fill="currentColor"/>
    <path d="M65.5668 18.3333V1.36364H69.0966V18.3333H65.5668ZM68.7652 14.6709L68.7735 10.4368H69.2872L73.3639 5.60606H77.4158L71.9387 12.0028H71.1019L68.7652 14.6709ZM73.5214 18.3333L69.7761 12.79L72.1293 10.2959L77.6561 18.3333H73.5214Z" fill="currentColor"/>
    <path d="M79.1476 18.3333V5.60606H82.5117V7.85156H82.6608C82.926 7.10582 83.3679 6.51752 83.9866 6.08665C84.6053 5.65578 85.3455 5.44034 86.2072 5.44034C87.08 5.44034 87.823 5.65854 88.4361 6.09493C89.0493 6.52581 89.4581 7.11135 89.6625 7.85156H89.795C90.0547 7.1224 90.5242 6.53962 91.2037 6.10322C91.8886 5.6613 92.6979 5.44034 93.6315 5.44034C94.8191 5.44034 95.783 5.81874 96.5233 6.57552C97.269 7.32678 97.6419 8.39291 97.6419 9.77391V18.3333H94.1203V10.4699C94.1203 9.76286 93.9325 9.23256 93.5569 8.87903C93.1812 8.52549 92.7117 8.34872 92.1483 8.34872C91.5075 8.34872 91.0076 8.55311 90.6485 8.96189C90.2894 9.36514 90.1099 9.8982 90.1099 10.5611V18.3333H86.6878V10.3954C86.6878 9.77115 86.5083 9.27399 86.1492 8.90388C85.7957 8.53378 85.3289 8.34872 84.7489 8.34872C84.3567 8.34872 84.0031 8.44815 83.6883 8.64702C83.3789 8.84036 83.1331 9.1138 82.9508 9.46733C82.7685 9.81534 82.6774 10.2241 82.6774 10.6937V18.3333H79.1476Z" fill="currentColor"/>
    <path d="M104.059 18.5736C103.247 18.5736 102.524 18.4328 101.888 18.151C101.253 17.8638 100.75 17.4412 100.38 16.8833C100.016 16.3198 99.8335 15.6183 99.8335 14.7786C99.8335 14.0716 99.9633 13.4777 100.223 12.9972C100.483 12.5166 100.836 12.1299 101.284 11.8371C101.731 11.5444 102.239 11.3234 102.808 11.1742C103.383 11.0251 103.985 10.9201 104.615 10.8594C105.355 10.782 105.951 10.7102 106.404 10.6439C106.857 10.5721 107.186 10.4672 107.39 10.3291C107.595 10.191 107.697 9.98659 107.697 9.71591V9.66619C107.697 9.14142 107.531 8.7354 107.2 8.44815C106.874 8.16091 106.41 8.01728 105.808 8.01728C105.172 8.01728 104.667 8.15815 104.291 8.43987C103.916 8.71607 103.667 9.06408 103.546 9.4839L100.281 9.21875C100.447 8.44539 100.773 7.77699 101.259 7.21354C101.745 6.64457 102.372 6.20818 103.14 5.90436C103.913 5.59501 104.808 5.44034 105.824 5.44034C106.531 5.44034 107.208 5.5232 107.854 5.68892C108.506 5.85464 109.083 6.11151 109.586 6.45952C110.094 6.80753 110.495 7.25497 110.788 7.80185C111.08 8.3432 111.227 8.99227 111.227 9.74905V18.3333H107.879V16.5684H107.78C107.575 16.9661 107.302 17.3169 106.959 17.6207C106.617 17.919 106.205 18.1538 105.725 18.325C105.244 18.4908 104.689 18.5736 104.059 18.5736ZM105.07 16.1375C105.59 16.1375 106.048 16.0354 106.446 15.831C106.843 15.6211 107.156 15.3393 107.382 14.9858C107.609 14.6323 107.722 14.2318 107.722 13.7843V12.4337C107.611 12.5055 107.459 12.5718 107.266 12.6326C107.078 12.6878 106.866 12.7403 106.628 12.79C106.39 12.8342 106.153 12.8756 105.915 12.9143C105.678 12.9474 105.462 12.9778 105.269 13.0054C104.855 13.0662 104.493 13.1629 104.184 13.2955C103.874 13.428 103.634 13.6076 103.463 13.834C103.292 14.055 103.206 14.3312 103.206 14.6626C103.206 15.1432 103.38 15.5106 103.728 15.7647C104.081 16.0133 104.529 16.1375 105.07 16.1375Z" fill="currentColor"/>
    <path d="M113.965 23.1061V5.60606H117.445V7.74384H117.603C117.757 7.40136 117.981 7.05335 118.274 6.69981C118.572 6.34075 118.959 6.04246 119.434 5.80493C119.915 5.56187 120.511 5.44034 121.224 5.44034C122.152 5.44034 123.008 5.6834 123.792 6.16951C124.577 6.6501 125.204 7.3765 125.673 8.34872C126.143 9.31542 126.378 10.5279 126.378 11.9863C126.378 13.4059 126.148 14.6046 125.69 15.5824C125.237 16.5546 124.618 17.2921 123.834 17.7947C123.055 18.2919 122.182 18.5405 121.215 18.5405C120.531 18.5405 119.948 18.4272 119.467 18.2008C118.992 17.9743 118.603 17.6898 118.299 17.3473C117.995 16.9993 117.763 16.6485 117.603 16.295H117.495V23.1061H113.965ZM117.421 11.9697C117.421 12.7265 117.525 13.3866 117.735 13.95C117.945 14.5135 118.249 14.9527 118.647 15.2675C119.045 15.5769 119.528 15.7315 120.097 15.7315C120.671 15.7315 121.157 15.5741 121.555 15.2592C121.953 14.9388 122.254 14.4969 122.458 13.9335C122.668 13.3645 122.773 12.7099 122.773 11.9697C122.773 11.235 122.671 10.5887 122.467 10.0308C122.262 9.47285 121.961 9.03646 121.564 8.72159C121.166 8.40672 120.677 8.24929 120.097 8.24929C119.522 8.24929 119.036 8.4012 118.639 8.70502C118.246 9.00884 117.945 9.43971 117.735 9.99763C117.525 10.5556 117.421 11.2129 117.421 11.9697Z" fill="currentColor"/>
  </svg>
);
