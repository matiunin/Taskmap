import { useEffect, useId, useRef, useState } from 'react';
import { DONATIONS_URL } from '../config/runtime';
import { useTranslation } from '../i18n';
import { DONATION_SEEN_EVENT, DONATION_SEEN_KEY, getDonationPromptTracker } from '../utils/donationPrompt';
import './SupportAuthor.css';

type PresetId = 'small' | 'medium' | 'large';

interface DonationPreset {
  id: PresetId;
  amount: number;
}

interface DonationConfig {
  testMode: boolean;
  presets: DonationPreset[];
}

interface SupportAuthorProps {
  placement: 'footer' | 'settings' | 'prompt';
  ready?: boolean;
  blocked?: boolean;
}

const PRESETS: DonationPreset[] = [
  { id: 'small', amount: 490 },
  { id: 'medium', amount: 2490 },
  { id: 'large', amount: 3990 },
];

const readConfig = (value: unknown): DonationConfig | null => {
  if (!value || typeof value !== 'object') return null;
  const config = value as Record<string, unknown>;
  if (config.enabled !== true || config.currency !== 'RUB' || typeof config.testMode !== 'boolean') return null;
  if (!Array.isArray(config.presets) || config.presets.length !== PRESETS.length) return null;
  const presets = config.presets;
  if (!PRESETS.every((expected) => presets.some((preset) => (
    preset && typeof preset === 'object'
    && preset.id === expected.id && preset.amount === expected.amount
  )))) return null;
  return { testMode: config.testMode, presets: PRESETS };
};

const readCheckoutUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://auth.robokassa.ru'
      || url.pathname !== '/Merchant/Index.aspx'
      || url.username || url.password || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
};

const hasOtherDialog = (own: HTMLDialogElement | null): boolean => (
  Array.from(document.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"], .action-link-dialog, .automation-modal-overlay, .advanced-search-panel',
  )).some((element) => element !== own && !element.hidden && element.getClientRects().length > 0)
);

export const SupportAuthor = ({ placement, ready = false, blocked = false }: SupportAuthorProps) => {
  const { t, language } = useTranslation();
  const [config, setConfig] = useState<DonationConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>(null);
  const [pendingPreset, setPendingPreset] = useState<PresetId | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [promptRevision, setPromptRevision] = useState(0);
  const [otherDialogOpen, setOtherDialogOpen] = useState(false);
  const openingAutomatically = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const newTabId = useId();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const loadConfig = async () => {
      try {
        const response = await fetch(DONATIONS_URL, {
          credentials: 'omit', cache: 'no-store', redirect: 'error',
          referrerPolicy: 'no-referrer', signal: controller.signal,
        });
        if (!response.ok) return;
        const donationConfig = readConfig(await response.json());
        if (!controller.signal.aborted) setConfig(donationConfig);
      } catch {
        // Optional support must never interrupt the Jira app.
      } finally {
        clearTimeout(timeout);
      }
    };
    void loadConfig();
    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (placement !== 'prompt') return;
    const update = () => setPromptRevision((value) => value + 1);
    const storageChanged = (event: StorageEvent) => {
      if (event.key === DONATION_SEEN_KEY || event.key === null) update();
    };
    const checkDialogs = () => setOtherDialogOpen(hasOtherDialog(dialogRef.current));
    const observer = new MutationObserver(checkDialogs);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'role', 'class', 'hidden'] });
    checkDialogs();
    window.addEventListener(DONATION_SEEN_EVENT, update);
    window.addEventListener('storage', storageChanged);
    document.addEventListener('visibilitychange', update);
    document.addEventListener('keydown', update);
    document.addEventListener('pointerdown', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      observer.disconnect();
      window.removeEventListener(DONATION_SEEN_EVENT, update);
      window.removeEventListener('storage', storageChanged);
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('keydown', update);
      document.removeEventListener('pointerdown', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [placement]);

  useEffect(() => {
    if (placement !== 'prompt' || !ready) return;
    getDonationPromptTracker().recordQualifiedVisit();
    if (!config || blocked || otherDialogOpen || isOpen || document.visibilityState !== 'visible'
      || !getDonationPromptTracker().shouldPrompt()) return;
    const timer = setTimeout(() => {
      if (document.visibilityState !== 'visible' || hasOtherDialog(dialogRef.current)
        || !getDonationPromptTracker().shouldPrompt()) return;
      const active = document.activeElement;
      if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.value.trim()) return;
      if (active instanceof HTMLElement && active.isContentEditable && active.textContent?.trim()) return;
      openingAutomatically.current = true;
      setIsOpen(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, [placement, ready, config, blocked, otherDialogOpen, isOpen, promptRevision]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    if (openingAutomatically.current && (!ready || blocked || !getDonationPromptTracker().shouldPrompt()
      || document.visibilityState !== 'visible' || hasOtherDialog(dialog))) {
      setIsOpen(false);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    try {
      dialog.showModal();
      if (!dialog.open) { setIsOpen(false); return; }
      getDonationPromptTracker().markShown();
      window.dispatchEvent(new Event(DONATION_SEEN_EVENT));
      document.body.style.overflow = 'hidden';
    } catch {
      setIsOpen(false);
      return;
    }
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const closeDialog = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setPendingPreset(null);
    setSelectedPreset(null);
    setCheckoutUrl(null);
    setHasError(false);
    setIsOpen(false);
  };

  const choosePreset = async (preset: PresetId) => {
    if (requestRef.current || (selectedPreset === preset && checkoutUrl)) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setSelectedPreset(preset);
    setPendingPreset(preset);
    setCheckoutUrl(null);
    setHasError(false);
    try {
      const response = await fetch(DONATIONS_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset, locale: language }),
        credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Checkout unavailable');
      const result = await response.json();
      const url = readCheckoutUrl(result?.url);
      if (!url || typeof result?.invId !== 'string' || !result.invId) throw new Error('Invalid checkout');
      if (requestRef.current === controller) setCheckoutUrl(url);
    } catch {
      if (requestRef.current === controller) setHasError(true);
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPendingPreset(null);
      }
    }
  };

  if (!config) return null;

  const formatAmount = (amount: number) => new Intl.NumberFormat(language, {
    style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
  }).format(amount);

  return (
    <div className={`support-author support-author--${placement}`}>
      {placement !== 'prompt' && <button type="button" className="support-author__trigger" onClick={() => {
        openingAutomatically.current = false;
        setIsOpen(true);
      }}>
        {t('donation.supportAuthor')}
      </button>}
      <dialog
        ref={dialogRef}
        className="donation-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeDialog();
        }}
        onClose={(event) => {
          event.stopPropagation();
          if (!dialogRef.current?.open) closeDialog();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.stopPropagation();
          if (event.key !== 'Tab') return;
          const dialog = event.currentTarget;
          const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
            'button:not(:disabled), a[href]',
          )).filter((control) => control.tabIndex >= 0 && control.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first || !last) return;
          const active = document.activeElement;
          if (!dialog.contains(active)) {
            event.preventDefault();
            first.focus();
          } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === dialogRef.current) closeDialog();
        }}
      >
        <div className="donation-dialog__content">
          <header className="donation-dialog__header">
            <h2 id={titleId}>{t('donation.title')}</h2>
            <button type="button" className="donation-dialog__close" onClick={closeDialog} aria-label={t('profile.close')} autoFocus>
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <p id={descriptionId} className="donation-dialog__description">{t('donation.description')}</p>
          {config.testMode && <p className="donation-dialog__test-note">{t('donation.testMode')}</p>}
          <div className="donation-dialog__presets" role="group" aria-label={t('donation.chooseAmount')}>
            {config.presets.map((preset) => (
              <div key={preset.id} className={`donation-preset ${selectedPreset === preset.id ? 'donation-preset--selected' : ''}`}>
                <h3>{t(`donation.${preset.id}Title`)}</h3>
                <p className="donation-preset__amount">{formatAmount(preset.amount)}</p>
                <p className="donation-preset__frequency">{t('donation.oneTime')}</p>
                <button
                  type="button"
                  className="donation-preset__select"
                  disabled={pendingPreset !== null}
                  aria-pressed={selectedPreset === preset.id}
                  aria-label={`${t('donation.select')} ${formatAmount(preset.amount)}`}
                  onClick={() => void choosePreset(preset.id)}
                >
                  {selectedPreset === preset.id && checkoutUrl ? t('donation.selected') : t('donation.select')}
                </button>
              </div>
            ))}
          </div>
          {pendingPreset && <p className="donation-dialog__status" role="status">{t('donation.preparing')}</p>}
          {hasError && (
            <div className="donation-dialog__error" role="alert">
              <p>{t('donation.error')}</p>
              <button type="button" onClick={() => selectedPreset && void choosePreset(selectedPreset)}>
                {t('donation.retry')}
              </button>
            </div>
          )}
          {checkoutUrl && (
            <div className="donation-dialog__checkout">
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-describedby={newTabId}>
                {t('donation.proceedToPayment')}
                <span aria-hidden="true"> ↗</span>
              </a>
              <p id={newTabId}>{t('donation.opensNewTab')}</p>
            </div>
          )}
          <div className="donation-dialog__footer">
            <button type="button" onClick={closeDialog}>{t('donation.notNow')}</button>
          </div>
        </div>
      </dialog>
    </div>
  );
};
