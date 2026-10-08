export interface JiraReadiness {
  ready: boolean;
  pendingRequests: number;
}

interface RequestTicket<Config> {
  config: Config;
  revision: number;
}

export class JiraReadinessObserver<Config> {
  private config: Config | null = null;
  private revision = 0;
  private verified = false;
  private failed = false;
  private pendingRequests = 0;
  private listeners = new Set<(state: JiraReadiness) => void>();

  private snapshot(): JiraReadiness {
    return { ready: this.verified && !this.failed, pendingRequests: this.pendingRequests };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try { listener(this.snapshot()); } catch { /* Optional observers cannot alter a Jira request. */ }
    }
  }

  subscribe(listener: (state: JiraReadiness) => void): () => void {
    this.listeners.add(listener);
    try { listener(this.snapshot()); } catch { /* Same isolation for the initial snapshot. */ }
    return () => { this.listeners.delete(listener); };
  }

  setConfig(config: Config | null): void {
    this.config = config;
    this.revision++;
    this.verified = false;
    this.failed = false;
    this.pendingRequests = 0;
    this.notify();
  }

  begin(config: Config): RequestTicket<Config> {
    const ticket = { config, revision: this.revision };
    if (config === this.config) { this.pendingRequests++; this.notify(); }
    return ticket;
  }

  private current(ticket: RequestTicket<Config>): boolean {
    return ticket.config === this.config && ticket.revision === this.revision;
  }

  success(ticket: RequestTicket<Config>, isRead: boolean): void {
    if (!this.current(ticket) || !isRead) return;
    this.verified = true;
    this.failed = false;
    this.notify();
  }

  finish(ticket: RequestTicket<Config>, failed: boolean): void {
    if (!this.current(ticket)) return;
    this.pendingRequests = Math.max(0, this.pendingRequests - 1);
    if (failed) this.failed = true;
    this.notify();
  }
}

export const isJiraReadRequest = (url: string, baseUrl: string, method: unknown, data: unknown): boolean => {
  try {
    const target = new URL(url);
    if (target.origin !== new URL(baseUrl).origin || !target.pathname.startsWith('/rest/api/3/')) return false;
    if (method === 'GET') return true;
    return method === 'POST' && target.pathname === '/rest/api/3/search/jql'
      && !!data && typeof data === 'object' && !Array.isArray(data)
      && typeof (data as Record<string, unknown>).jql === 'string';
  } catch {
    return false;
  }
};
