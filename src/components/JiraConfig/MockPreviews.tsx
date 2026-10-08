import { useTranslation } from '../../i18n';
import './features.css';

export const MockGraphPreview = () => {
  const { t } = useTranslation();
  return (
    <div className="mock-preview mock-graph" role="img" aria-label={t('onboarding.demoLabel')}>
      <div className="mock-graph-viewport">
        <svg
          className="mock-graph-svg"
          viewBox="0 0 520 380"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: 'hidden' }}
        >
          <defs>
            <clipPath id="mockGraphClip">
              <rect x="0" y="0" width="520" height="380" />
            </clipPath>
            <filter id="cs" x="-6%" y="-8%" width="112%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="#000" floodOpacity="0.4"/>
            </filter>
            <filter id="rs" x="-6%" y="-8%" width="112%" height="124%">
              <feDropShadow dx="0" dy="3" stdDeviation="8" floodColor="#6C5CE7" floodOpacity="0.2"/>
            </filter>
            {/* Светлая тема: мягкие тени без грязного оттенка */}
            <filter id="csLight" x="-6%" y="-8%" width="112%" height="120%">
              <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.08"/>
            </filter>
            <filter id="rsLight" x="-6%" y="-8%" width="112%" height="124%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#6C5CE7" floodOpacity="0.06"/>
            </filter>
            <linearGradient id="parentGrad"><stop offset="0%" stopColor="#1a1a2a"/><stop offset="100%" stopColor="#111111"/></linearGradient>
            <clipPath id="rootClip"><rect x="172" y="14" width="178" height="134" rx="12"/></clipPath>
            <clipPath id="card1Clip"><rect x="16" y="252" width="136" height="112" rx="10"/></clipPath>
            <clipPath id="card2Clip"><rect x="168" y="252" width="136" height="112" rx="10"/></clipPath>
            <clipPath id="card3Clip"><rect x="340" y="252" width="136" height="112" rx="10"/></clipPath>
          </defs>
          <g clipPath="url(#mockGraphClip)">
        <rect width="520" height="380" className="mock-graph-bg-rect" />

        {/* === EDGES === */}
        <path d="M260 148 C 260 170, 190 170, 190 188" stroke="#34d399" strokeWidth="2" fill="none" className="mock-bezier" />
        <path d="M260 148 C 260 170, 400 170, 400 188" stroke="#fb923c" strokeWidth="2" fill="none" className="mock-bezier" />
        <path d="M155 216 C 155 232, 82 232, 82 252" stroke="#34d399" strokeWidth="1.5" fill="none" className="mock-bezier" />
        <path d="M210 216 C 210 232, 240 232, 240 252" stroke="#34d399" strokeWidth="1.5" fill="none" className="mock-bezier" />
        <path d="M400 216 C 400 232, 410 232, 410 252" stroke="#fb923c" strokeWidth="1.5" fill="none" className="mock-bezier" />

        {/* ROOT NODE */}
        <g className="mock-graph-root mock-graph-root-filter">
          <rect x="172" y="14" width="178" height="134" rx="12" className="mock-graph-panel mock-graph-stroke" strokeWidth="1"/>
        </g>
        <g clipPath="url(#rootClip)">
          <rect x="172" y="14" width="4" height="134" fill="#a78bfa"/>
        </g>

        {/* Parent section — заливка классом, градиент только для тёмной темы */}
        <rect x="176" y="14" width="174" height="44" rx="12" className="mock-graph-panel"/>
        <rect x="176" y="46" width="174" height="12" className="mock-graph-panel"/>
        <line x1="176" y1="56" x2="350" y2="56" stroke="rgba(167,139,250,0.1)" strokeWidth="1"/>
        <rect x="184" y="22" width="48" height="12" rx="6" fill="rgba(167,139,250,0.1)"/>
        <text x="208" y="31" textAnchor="middle" fontSize="8" fontWeight="600" fill="#a78bfa" fontFamily="Inter,system-ui">{t('onboarding.mock.parentLabel')}</text>
        <text x="236" y="27" fontSize="8" fill="#fb923c" fontFamily="Inter,system-ui" dominantBaseline="middle">🔥</text>
        <text x="246" y="31" fontSize="9" fontWeight="700" fill="#a78bfa" fontFamily="Inter,system-ui">{t('onboarding.mock.parentKey')}</text>
        <rect x="302" y="22" width="38" height="12" rx="6" fill="rgba(52,211,153,0.15)"/>
        <text x="321" y="31" textAnchor="middle" fontSize="7" fontWeight="700" fill="#34d399" fontFamily="Inter,system-ui">{t('onboarding.mock.statusProgress')}</text>
        <text x="184" y="49" fontSize="8" fill="#a78bfa" fontFamily="Inter,system-ui" opacity="0.5">{t('onboarding.mock.parentSummary')}</text>

        {/* Root section */}
        <text x="184" y="67" fontSize="9" fill="#a78bfa" fontFamily="Inter,system-ui" dominantBaseline="middle">⚡</text>
        <text x="196" y="71" fontSize="10" fontWeight="700" fill="#c4b5fd" fontFamily="Inter,system-ui">{t('onboarding.mock.epicKey')}</text>
        <rect x="260" y="62" width="38" height="12" rx="6" className="mock-graph-overlay"/>
        <text x="279" y="71" textAnchor="middle" fontSize="8" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.epicType')}</text>
        <rect x="302" y="62" width="40" height="12" rx="6" fill="rgba(52,211,153,0.15)"/>
        <text x="322" y="71" textAnchor="middle" fontSize="7" fontWeight="700" fill="#34d399" fontFamily="Inter,system-ui">{t('onboarding.mock.statusProgress')}</text>
        <text x="184" y="88" fontSize="10" fontWeight="500" className="mock-graph-text" fontFamily="Inter,system-ui">{t('onboarding.mock.epicSummary1')}</text>
        <text x="184" y="100" fontSize="10" fontWeight="500" className="mock-graph-text" fontFamily="Inter,system-ui">{t('onboarding.mock.epicSummary2')}</text>
        <circle cx="194" cy="122" r="10" fill="#6C5CE7"/>
        <text x="194" y="126" textAnchor="middle" fontSize="8" fontWeight="700" fill="white" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee1Short')}</text>
        <text x="210" y="126" fontSize="9" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee1Name')}</text>

        {/* GROUP PILL: Subtasks */}
        <rect x="132" y="192" width="114" height="24" rx="12" fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.25)" strokeWidth="1"/>
        <text x="148" y="204" fontSize="8" fill="#34d399" fontFamily="Inter,system-ui" dominantBaseline="middle">🔧</text>
        <text x="161" y="208" fontSize="10" fontWeight="700" fill="#34d399" fontFamily="Inter,system-ui">{t('onboarding.mock.subtasksLabel')}</text>
        <circle cx="232" cy="204" r="8" fill="rgba(52,211,153,0.2)"/>
        <text x="232" y="208" textAnchor="middle" fontSize="8" fontWeight="700" fill="#34d399" fontFamily="Inter,system-ui">4</text>

        {/* GROUP PILL: is blocked by */}
        <rect x="345" y="192" width="118" height="24" rx="12" fill="rgba(251,146,60,0.12)" stroke="rgba(251,146,60,0.25)" strokeWidth="1"/>
        <text x="360" y="204" fontSize="8" fill="#fb923c" fontFamily="Inter,system-ui" dominantBaseline="middle">🚫</text>
        <text x="375" y="208" fontSize="10" fontWeight="700" fill="#fb923c" fontFamily="Inter,system-ui">{t('onboarding.mock.blockedByLabel')}</text>
        <circle cx="450" cy="204" r="8" fill="rgba(251,146,60,0.2)"/>
        <text x="450" y="208" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fb923c" fontFamily="Inter,system-ui">1</text>

        {/* CHILD CARD 1 */}
        <g className="mock-graph-card-filter">
          <rect x="16" y="252" width="136" height="112" rx="10" className="mock-graph-panel mock-graph-stroke" strokeWidth="1"/>
        </g>
        <g clipPath="url(#card1Clip)">
          <rect x="16" y="252" width="4" height="112" fill="#34d399"/>
        </g>
        <text x="28" y="265" fontSize="9" fill="#34d399" fontFamily="Inter,system-ui" dominantBaseline="middle">✓</text>
          <text x="40" y="268" fontSize="10" fontWeight="700" fill="#a78bfa" fontFamily="Inter,system-ui">{t('onboarding.mock.card1Key')}</text>
          <text x="118" y="265" fontSize="8" className="mock-graph-text-dim" fontFamily="Inter,system-ui" dominantBaseline="middle">🔗</text>
          <rect x="28" y="276" width="36" height="10" rx="5" className="mock-graph-overlay"/>
          <text x="46" y="284" textAnchor="middle" fontSize="7" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.taskType')}</text>
          <rect x="68" y="276" width="44" height="10" rx="5" fill="rgba(251,191,36,0.15)"/>
          <text x="90" y="284" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fbbf24" fontFamily="Inter,system-ui">{t('onboarding.mock.statusChecked')}</text>
          <text x="28" y="300" fontSize="8" className="mock-graph-text-muted" fontFamily="Inter,system-ui">{t('onboarding.mock.card1Summary1')}</text>
          <text x="28" y="310" fontSize="8" className="mock-graph-text-muted" fontFamily="Inter,system-ui">{t('onboarding.mock.card1Summary2')}</text>
          <circle cx="38" cy="348" r="10" fill="#34d399"/>
          <text x="38" y="352" textAnchor="middle" fontSize="8" fontWeight="700" fill="white" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee2Short')}</text>
        <text x="52" y="351" fontSize="9" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee2Name')}</text>

        {/* CHILD CARD 2 */}
        <g className="mock-graph-card-filter">
          <rect x="168" y="252" width="136" height="112" rx="10" className="mock-graph-panel mock-graph-stroke" strokeWidth="1"/>
        </g>
        <g clipPath="url(#card2Clip)">
          <rect x="168" y="252" width="4" height="112" fill="#34d399"/>
        </g>
        <text x="180" y="265" fontSize="9" fill="#34d399" fontFamily="Inter,system-ui" dominantBaseline="middle">✓</text>
        <text x="192" y="268" fontSize="10" fontWeight="700" fill="#a78bfa" fontFamily="Inter,system-ui">{t('onboarding.mock.card2Key')}</text>
        <text x="270" y="265" fontSize="8" className="mock-graph-text-dim" fontFamily="Inter,system-ui" dominantBaseline="middle">🔗</text>
        <rect x="180" y="276" width="36" height="10" rx="5" className="mock-graph-overlay"/>
        <text x="198" y="284" textAnchor="middle" fontSize="7" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.taskType')}</text>
        <rect x="220" y="276" width="34" height="10" rx="5" fill="rgba(52,211,153,0.15)"/>
        <text x="237" y="284" textAnchor="middle" fontSize="6" fontWeight="700" fill="#34d399" fontFamily="Inter,system-ui">{t('onboarding.mock.statusDone')}</text>
        <text x="180" y="300" fontSize="8" className="mock-graph-text-muted" fontFamily="Inter,system-ui">{t('onboarding.mock.card2Summary1')}</text>
        <text x="180" y="310" fontSize="8" className="mock-graph-text-muted" fontFamily="Inter,system-ui">{t('onboarding.mock.card2Summary2')}</text>
        <circle cx="190" cy="348" r="10" fill="#6C5CE7"/>
        <text x="190" y="352" textAnchor="middle" fontSize="8" fontWeight="700" fill="white" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee3Short')}</text>
        <text x="204" y="351" fontSize="9" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee3Name')}</text>

        {/* CHILD CARD 3 */}
        <g className="mock-graph-card-filter">
          <rect x="340" y="252" width="136" height="112" rx="10" className="mock-graph-panel mock-graph-stroke" strokeWidth="1"/>
        </g>
        <g clipPath="url(#card3Clip)">
          <rect x="340" y="252" width="4" height="112" fill="#fb923c"/>
        </g>
        <text x="352" y="265" fontSize="9" fill="#34d399" fontFamily="Inter,system-ui" dominantBaseline="middle">✓</text>
        <text x="364" y="268" fontSize="10" fontWeight="700" fill="#a78bfa" fontFamily="Inter,system-ui">{t('onboarding.mock.card3Key')}</text>
        <text x="442" y="265" fontSize="8" className="mock-graph-text-dim" fontFamily="Inter,system-ui" dominantBaseline="middle">🔗</text>
        <rect x="352" y="276" width="36" height="10" rx="5" className="mock-graph-overlay"/>
        <text x="370" y="284" textAnchor="middle" fontSize="7" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.taskType')}</text>
        <rect x="392" y="276" width="44" height="10" rx="5" fill="rgba(251,191,36,0.15)"/>
        <text x="414" y="284" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fbbf24" fontFamily="Inter,system-ui">{t('onboarding.mock.statusChecked')}</text>
        <text x="352" y="300" fontSize="8" className="mock-graph-text-muted" fontFamily="Inter,system-ui">{t('onboarding.mock.card3Summary1')}</text>
        <text x="352" y="310" fontSize="8" className="mock-graph-text-muted" fontFamily="Inter,system-ui">{t('onboarding.mock.card3Summary2')}</text>
        <circle cx="362" cy="348" r="10" fill="#fb923c"/>
        <text x="362" y="352" textAnchor="middle" fontSize="8" fontWeight="700" fill="white" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee4Short')}</text>
        <text x="376" y="351" fontSize="9" className="mock-graph-text-dim" fontFamily="Inter,system-ui">{t('onboarding.mock.assignee4Name')}</text>
          </g>
        </svg>
      </div>
    </div>
  );
};

export const MockBatchPreview = () => (
  <div className="mock-preview mock-batch">
    <div className="mock-batch-toolbar">
      <div className="mock-batch-pill">
        <span className="mock-batch-dot" />
        3 changes
      </div>
      <div className="mock-batch-actions">
        <button className="mock-batch-btn cancel">Cancel</button>
        <button className="mock-batch-btn apply">Apply</button>
      </div>
    </div>
    <div className="mock-batch-list">
      <div className="mock-batch-item change">
        <div className="mock-batch-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M4 8h8M10 5l3 3-3 3"/></svg>
        </div>
        <div className="mock-batch-text">
          <strong>PROJ-102</strong> Subtask → Link (relates)
        </div>
      </div>
      <div className="mock-batch-item delete">
        <div className="mock-batch-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </div>
        <div className="mock-batch-text">
          Delete link with <strong>PROJ-106</strong>
        </div>
      </div>
      <div className="mock-batch-item create">
        <div className="mock-batch-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
        </div>
        <div className="mock-batch-text">
          Create blocks → <strong>PROJ-104</strong>
        </div>
      </div>
    </div>
  </div>
);

export const SecurityBenefitIllustration = () => {
  const { t } = useTranslation();
  return (
  <div className="security-benefit-illus">
    <svg
      className="security-benefit-svg"
      viewBox="0 0 320 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="securityGradShield" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
          <stop offset="100%" stopColor="#059669" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="securityGradDevice" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6C5CE7" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {/* Устройство (браузер/ноут) — силуэт */}
      <rect x="80" y="40" width="160" height="120" rx="12" className="security-device-bg" fill="url(#securityGradDevice)" />
      <rect x="88" y="48" width="144" height="80" rx="8" className="security-device-screen" />
      {/* Щит по центру экрана (широкий, без тени/glow) */}
      <g>
        <path
          d="M136 72 L184 80 L184 108 Q184 128 160 138 Q136 128 136 108 L136 80 Z"
          fill="url(#securityGradShield)"
          className="security-shield"
        />
        <path d="M152 98 L158 104 L168 92" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      {/* Переведённая подпись переносится внутри границ устройства. */}
      <rect x="80" y="148" width="160" height="44" rx="14" className="security-local-badge" />
      <foreignObject x="80" y="148" width="160" height="44">
        <div className="security-local-caption">
          <span dir="auto">{t('onboarding.securityLocal')}</span>
        </div>
      </foreignObject>
      {/* Декоративные точки — данные остаются */}
      <circle cx="60" cy="100" r="6" className="security-dot security-dot-1" />
      <circle cx="260" cy="85" r="5" className="security-dot security-dot-2" />
      <circle cx="255" cy="130" r="4" className="security-dot security-dot-3" />
    </svg>
  </div>
);
};
