# Architecture

## Runtime

- React 18, TypeScript and ReactFlow render the Jira map and editor.
- Vite builds static files; Inter and Lineicons are served locally.
- Development uses a loopback Node proxy.
- Production uses Apache/PHP with cURL. Docker builds the frontend with
  Node.js 24 and copies only its output into the runtime web directory.
- Jira is the source of persistent task and link data. There is no MySQL
  or application user database in this edition.

## Source map

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Jira setup, application state and main panels. |
| `src/components/MindMap/` | Graph, actions and pending-change controls. |
| `src/components/LandingV2/` | Setup form and fictional examples. |
| `src/components/ProfileEditor.tsx` | Connection settings and Disconnect. |
| `src/utils/jira/` | Issue conversion, requests, links and Automation. |
| `src/hooks/` | Task state, pending edits, notifications and undo. |
| `src/i18n/` | English, Russian, Spanish, Arabic and Chinese translations. |
| `src/config/runtime.ts` | Public build-time proxy endpoint selection. |
| `server/proxy-server.js`, `server/proxy-policy.js` | Node proxy and outbound-request policy. |
| `server/php/proxy.php` | Production handler, outside the web root. |
| `deploy/api/` | Minimal PHP entry points. |
| `deploy/apache-taskmap.conf` | API routing and response security headers. |
| `tests/` | Synthetic proxy contract and boundary checks. |
| `scripts/check-publication.mjs` | Metadata-only public-file checks. |

## Requests

The browser sends a JSON envelope to `/api/jira-proxy` during development
or `/api/jira-proxy.php` after a production build. An optional
`VITE_JIRA_PROXY_URL` overrides this public endpoint at build time.

The envelope supplies the HTTPS Jira URL, method, per-request credentials,
and optional data. Only configured exact hostnames and the supported Jira
REST/tenant/Automation paths are forwarded. Private/reserved IPs,
redirects, arbitrary outbound headers and other destinations are blocked.
Credentials are neither stored nor logged by the proxy.

GET on the proxy endpoint or `/api/health` reports local backend health.
Health does not validate a Jira token or perform an authenticated Jira call.
