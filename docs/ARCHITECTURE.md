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
| `server/donations.js`, `server/php/donations.php` | Optional donation configuration, signatures and private invoice registry. |
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

## Optional donations

Donations are voluntary one-off Robokassa payments of 490, 2,490 or 3,990 RUB.
No donation state changes feature access, Jira permissions or subscription
rights. The feature is disabled unless its server runtime configuration is
complete; merchant passwords are never exposed through frontend config or
build arguments.

Same-origin `GET /api/donations` (Node) or `/api/donations.php` (PHP) reports
availability and public presets. `POST` accepts only `{ preset, locale }`,
allocates an invoice and returns `{ url, invId }`. The server selects the
amount and signs checkout with password 1. Only `Shp_kind=donation` and
`Shp_preset` accompany it; Jira identity and issue data are excluded.
See [Robokassa's payment/signature interface](https://docs.robokassa.ru/ru/pay-interface).

`POST /api/donation-result.php` validates the form notification with password
2 and matches its signed kind, preset, amount and invoice to the local
registry. Valid callbacks mark that invoice paid and acknowledge it;
repeated notifications do not grant or extend anything. The browser's
`donation=returned` or `donation=cancelled` query is only navigation feedback,
not a verified payment status. See [Robokassa notifications](https://docs.robokassa.ru/ru/notifications-and-redirects).

Use a separate donation shop under the same Robokassa account so its
callback does not enter another shop's billing/access flow. The registry
contains only invoice ID, preset, amount, creation/payment timestamps and
mode. Docker retains it in `/var/lib/taskmap/donations` through a named
volume; Node defaults to `data/donations`. Neither MySQL nor a user database
is required.

Callbacks share an exclusive per-invoice `<invoice>.json.lock` file across
Node and PHP. A lock left after a crash fails closed with `409`. For recovery,
stop the instance, confirm no writer is active, remove only the leftover lock
and restart. Retain the invoice JSON so Robokassa's repeated notification can
be verified. Back up and retain the Docker volume across updates and rollbacks.
