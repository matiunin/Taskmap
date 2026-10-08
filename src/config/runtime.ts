/** Public build configuration. Never put credentials in VITE_* variables. */
export const IS_DEV = import.meta.env.DEV;

const configuredProxy = import.meta.env.VITE_JIRA_PROXY_URL?.trim();
if (configuredProxy && (
  !configuredProxy.startsWith('/')
  || configuredProxy.startsWith('//')
  || /[\\?#]/.test(configuredProxy)
)) {
  throw new Error('VITE_JIRA_PROXY_URL must be a path on this app’s origin, without a query or fragment');
}

export const JIRA_PROXY_URL = configuredProxy
  || (IS_DEV ? '/api/jira-proxy' : '/api/jira-proxy.php');

export const JIRA_MEDIA_URL = IS_DEV ? '/api/jira-media' : '/api/jira-media.php';

export const DONATIONS_URL = IS_DEV ? '/api/donations' : '/api/donations.php';
