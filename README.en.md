# Taskmap

Self-hosted Jira task relationship visualization with an interactive map,
issue preview, local undo, and queued link changes applied to Jira.

This edition uses your own Jira and server. It contains no subscription,
payment, operator, feedback-bot, or user-database integration.
[Full Russian setup guide](README.md) · [MIT license](LICENSE) ·
[Security](SECURITY.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## Docker quick start

Clone the repository or extract the source archive, then run:

```sh
cp .env.example .env
```

Edit `.env`: set `TASKMAP_JIRA_HOSTS` to your exact Jira hostname, such as
`example.atlassian.net`. Use a comma-separated list for multiple hosts.
Do not include a scheme, path, wildcard, or Jira token.

```sh
docker compose up --build -d
curl --fail http://127.0.0.1:8080/api/health
```

Open **http://127.0.0.1:8080** and enter your Jira URL, email and Jira API
token. The container binds to loopback by default. A blank host allowlist
blocks all outbound requests.

For a server installation, place an HTTPS reverse proxy in front of
`127.0.0.1:8080`, preserve `Host`, and set `TASKMAP_PUBLIC_ORIGIN` to the
exact external origin, for example `https://taskmap.example.com`.
Host the app at the root of a dedicated domain. Protect access at the
reverse proxy when it is intended for a private team.

## Development

Use **Node.js 24** (`.nvmrc`). PHP 8.4+ with cURL is needed to run the full
backend checks; Docker is only needed for the production deployment.

```sh
npm ci
cp .env.example .env
# Edit TASKMAP_JIRA_HOSTS in .env.
npm run dev:with-proxy
```

Open **http://127.0.0.1:3000**. The development proxy binds to
`127.0.0.1:3004`. `npm run build` creates `dist/`; `npm run preview`
previews static files and does not run the PHP backend.

```sh
npm run check
npm audit
```

Tests use synthetic data and never access a real Jira account. The supported
deployment target is Jira Cloud API v3. Jira Server/Data Center and private
network Jira deployments have not been validated.

## Credentials and updates

Credentials live in the tab's `sessionStorage`; encoding is not encryption.
Your server forwards them to your allowlisted Jira over HTTPS and does not
store them. Cached issue data may remain in browser storage until you use
Disconnect. Never put credentials in a `VITE_*` variable: these values are
embedded in the browser build.

Keep `.env` and reverse proxy configuration outside version control.
After updating source, run `docker compose up --build -d`, check container
status, and request `/api/health`. Stop with `docker compose down`.
