# Taskmap

Self-hosted Jira task relationship visualization with an interactive map,
issue preview, local undo, and queued link changes applied to Jira.

This edition uses your own Jira and server. All features are available
without a subscription or payment. Optional one-off support uses Robokassa;
there is no operator, feedback-bot, or user-database integration.
[Full setup guide](README.md) · [MIT license](LICENSE) ·
[Security](SECURITY.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## Docker quick start

Get the source:

```sh
git clone https://github.com/matiunin/Taskmap.git
cd Taskmap
```

Alternatively, download and extract the GitHub source archive, then open its
project directory. Create your local configuration:

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

## Connect to Jira

1. Sign in to the Atlassian account that can access your Jira projects.
2. Open [the account's API token settings](https://id.atlassian.com/manage-profile/security/api-tokens).
3. Choose **Create API token**, the standard token without scopes. Set a
   name and expiry date, create the token and copy its value.
4. Enter your Jira Cloud URL, the same account's email and the token in
   Taskmap. Load an issue that the account can access to check the connection.

Jira determines the account's view and edit permissions. Enter the token in
the app; keep it out of `.env`, source files and published examples.

This version calls the API through your Jira Cloud site URL. Tokens
**with scopes**, which require `api.atlassian.com/ex/jira/...`, are not
supported here. See [Atlassian's token guide](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account).

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

`VITE_JIRA_PROXY_URL` can set an optional same-origin API path for a local
`npm run build`. Docker uses the standard same-origin API routes; its builder
does not receive this override from `.env`. Changing a local `VITE_*` value
requires a new npm build. Never put credentials in these public build values.

```sh
npm run check
npm audit
```

Tests use synthetic data and never access a real Jira account or make a real
payment. Donation checks cover signatures, amount/mode checks and repeated
notifications. The supported deployment target is Jira Cloud API v3.
Jira Server/Data Center and private
network Jira deployments have not been validated.

## Optional one-off support

Robokassa support offers **490, 2,490 or 3,990 RUB**, with no subscription,
recurring charge or access restriction. A cancelled or unpaid donation never
blocks the application. The feature is off by default and hidden when its
server configuration is incomplete.

The automatic offer starts on the third qualified visit: a separate tab or
new tab session in which Jira successfully returns data. Reload, reconnect
and saving settings do not add visits. The prompt waits about 15 seconds of
quiet use in a visible tab and defers during loading, settings, other dialogs
or unapplied edits. It does not open before connection or while Jira requests
are failing. Manual support buttons remain available in the footer and
settings. After the first actual opening, including a manual opening, there
are no further automatic offers. Only a counter capped at three and shown
flags are stored in the browser; unavailable storage disables auto prompting.

Use a **separate donation shop under your Robokassa account**, leaving any
shop that handles other payments/access rights unchanged. Set its callbacks
to your own public HTTPS host:

| Shop setting | URL | Method |
| --- | --- | --- |
| `ResultURL` | `https://taskmap.example.com/api/donation-result.php` | `POST` |
| `SuccessURL` | `https://taskmap.example.com/?donation=returned` | `GET` |
| `FailURL` | `https://taskmap.example.com/?donation=cancelled` | `GET` |

A browser return is not proof of payment; only the verified server callback
marks an invoice paid. See [Robokassa notifications](https://docs.robokassa.ru/ru/notifications-and-redirects).

Set `TASKMAP_PUBLIC_ORIGIN` and these **server runtime** values in your local
`.env`:

| Variable | Setting |
| --- | --- |
| `TASKMAP_DONATIONS_ENABLED` | `true` to enable; default `false`. |
| `TASKMAP_ROBOKASSA_MERCHANT_LOGIN` | Your separate donation shop identifier. |
| `TASKMAP_ROBOKASSA_PASSWORD1`, `TASKMAP_ROBOKASSA_PASSWORD2` | The technical password pair for that shop and mode. |
| `TASKMAP_ROBOKASSA_TEST_MODE` | Start with `true` and its test passwords; live mode uses `false` and live passwords. |
| `TASKMAP_ROBOKASSA_HASH_ALGORITHM` | `md5`, `sha256` or `sha512`, matching the shop. |
| `TASKMAP_DONATION_DATA_DIR` | Optional registry directory; Docker uses `/var/lib/taskmap/donations`, Node uses `data/donations`. |

Test passwords never fall back to live passwords. Follow the
[Robokassa payment interface](https://docs.robokassa.ru/ru/pay-interface)
signature rules, then restart with `docker compose up -d --build`, or restart
`npm run dev:with-proxy` for Node development. These values are not `VITE_*`
variables or build arguments; `.env` is never copied into the builder or
web directory. Keep passwords out of the frontend.

The app submits only a preset and locale, with no Jira email, credentials or
issue content. The registry stores only invoice ID, preset, amount,
creation/payment time and mode. Docker keeps it in a named volume; retain
that volume while payments are pending. No MySQL or user database is needed.

## Credentials and updates

Credentials live in the tab's `sessionStorage`; encoding is not encryption.
Your server forwards them to your allowlisted Jira over HTTPS and does not
store them. Disconnect removes connection credentials, the loaded issue
cache, task history and saved task colors. UI language and preferences,
the donation visit counter and the prompt's shown flag remain. Never put
credentials in a `VITE_*` variable: these values are embedded in the browser
build.

Keep `.env` and reverse proxy configuration outside version control.
When donations are enabled, back up and retain the `donations` named volume
across updates and rollbacks; `docker compose down -v` deletes it. Stop the
container while taking a consistent volume backup.
After updating source, run `docker compose up --build -d`, check container
status, and request `/api/health`. Stop with `docker compose down`.

After a crash, a leftover per-invoice lock can make donation callbacks return
`409`. Stop the instance and confirm no writer is active before removing only
the `<invoice>.json.lock` file. Keep the invoice JSON, restart the instance,
and accept the provider's retried notification.
