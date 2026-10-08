export const DONATION_VISITS_KEY = 'taskmapDonationQualifiedVisits';
export const DONATION_SEEN_KEY = 'taskmapDonationPromptSeen';
export const DONATION_SESSION_KEY = 'taskmapDonationVisitCounted';
export const DONATION_SEEN_EVENT = 'taskmap:donation-prompt-seen';

interface PromptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// No identity or usage history is retained: only a capped count and two flags.
export class DonationPromptTracker {
  private disabled = false;
  private shown = false;
  private local: PromptStorage;
  private session: PromptStorage;

  constructor(local: PromptStorage, session: PromptStorage) {
    this.local = local;
    this.session = session;
  }

  private readVisits(): number {
    const raw = this.local.getItem(DONATION_VISITS_KEY);
    if (raw !== null && !/^[0-3]$/.test(raw)) throw new Error('Invalid visit count');
    return raw === null ? 0 : Number(raw);
  }

  private hasSeen(): boolean {
    const raw = this.local.getItem(DONATION_SEEN_KEY);
    if (raw !== null && raw !== 'true') throw new Error('Invalid shown flag');
    return this.shown || raw === 'true';
  }

  recordQualifiedVisit(): boolean {
    if (this.disabled) return false;
    try {
      if (this.hasSeen()) return false;
      const counted = this.session.getItem(DONATION_SESSION_KEY);
      if (counted !== null && counted !== 'true') throw new Error('Invalid session flag');
      const visits = this.readVisits();
      if (counted !== 'true') {
        // Mark the session first: a failed second write can only delay a prompt.
        this.session.setItem(DONATION_SESSION_KEY, 'true');
        this.local.setItem(DONATION_VISITS_KEY, String(Math.min(3, visits + 1)));
      }
      return this.shouldPrompt();
    } catch {
      this.disabled = true;
      return false;
    }
  }

  shouldPrompt(): boolean {
    if (this.disabled) return false;
    try {
      return !this.hasSeen() && this.session.getItem(DONATION_SESSION_KEY) === 'true'
        && this.readVisits() === 3;
    } catch {
      this.disabled = true;
      return false;
    }
  }

  markShown(): void {
    this.shown = true;
    try {
      this.local.setItem(DONATION_SEEN_KEY, 'true');
    } catch {
      this.disabled = true;
    }
  }
}

let browserTracker: DonationPromptTracker | undefined;
export const getDonationPromptTracker = (): DonationPromptTracker => {
  if (!browserTracker) {
    // Accessing storage itself may fail, for example in a restricted browser.
    const local: PromptStorage = {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    };
    const session: PromptStorage = {
      getItem: (key) => window.sessionStorage.getItem(key),
      setItem: (key, value) => window.sessionStorage.setItem(key, value),
    };
    browserTracker = new DonationPromptTracker(local, session);
  }
  return browserTracker;
};
