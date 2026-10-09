# Taskmap — self-hosted deployment

Taskmap displays Jira issues and their relationships on an interactive map.
You can load issues, view descriptions, change links, undo local edits and
apply prepared changes to Jira.

This edition works with your own Jira and server. All features are available
without a subscription or payment; optional one-off support uses Robokassa.
There is no external feedback service, user database or operator automation.
The license is [MIT](LICENSE); terms for third-party resources are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

**[Project overview](docs/ABOUT.md) · [Quick start](README.en.md)**

## Docker quick start

You need Docker Engine with Compose or Docker Desktop, and access to Jira Cloud.
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

In `.env`, replace the example with your Jira hostname:

```dotenv
TASKMAP_JIRA_HOSTS=example.atlassian.net
```

Use exact hostnames without a scheme or path. For multiple Jira sites,
separate them with commas. This is the server's list of allowed destinations;
do not add unrelated hosts or use `*`.

```sh
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/api/health
```

Open **http://127.0.0.1:8080**. Enter your Jira URL, email and Jira API token.
Then load a test issue and open the map.

By default, the port is reachable only from the computer running Docker.
The container needs DNS and outbound HTTPS access to the allowed Jira site.

To stop:

```sh
docker compose down
```

## Connect to Jira

1. Sign in to the Atlassian account that can access your Jira projects.
2. Open [the account's API token settings](https://id.atlassian.com/manage-profile/security/api-tokens).
3. Choose **Create API token**, the standard token without scopes. Set a
   name and expiry date, create the token and copy its value.
4. Enter your Jira Cloud URL, the same account's email and the token in
   Taskmap. Load an issue that the account can access to check the connection.

Jira determines permissions for viewing and editing issues. Enter the token
in the app; keep it out of `.env`, source files and published examples.

This version calls the API through your Jira Cloud site URL. Tokens
**with scopes**, which require `api.atlassian.com/ex/jira/...`, are not
supported here. See [Atlassian's token guide](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account).

## Server deployment

1. Install Docker with Compose and transfer the application source.
2. Create `.env` from the example and set your `TASKMAP_JIRA_HOSTS`.
3. Configure an HTTPS reverse proxy to `127.0.0.1:8080` and preserve the
   `Host` header. The app is intended to run at the root of a dedicated domain.
4. Set the exact external origin, for example:

   ```dotenv
   TASKMAP_PUBLIC_ORIGIN=https://taskmap.example.com
   ```

5. Run `docker compose up --build -d` and check `/api/health`.

For a private team installation, restrict access at the reverse proxy using
authentication or the team's network. Users enter their Jira credentials in
the app; the server has no shared Jira token.

The image already includes Apache, PHP and the proxy restrictions. MySQL,
SMTP and an external bot are not required. A payment account is needed only
when optional support is enabled.
The web directory contains only the built interface and required API handlers;
server configuration and the main PHP code remain outside the web directory.

## Local development

You need **Node.js 24** with npm. The version is listed in `.nvmrc`. Docker
is not required for this mode; PHP is needed for separate production backend
checks.

```sh
npm ci
cp .env.example .env
```

Set `TASKMAP_JIRA_HOSTS`, then run:

```sh
npm run dev:with-proxy
```

Open **http://127.0.0.1:3000**. Vite forwards Jira requests to the local Node
proxy at `127.0.0.1:3004`; both processes stop together.

For another local hostname, set `DEV_ALLOWED_HOSTS` and, if needed, `DEV_HOST`.
Do not expose the development server to the internet.

```sh
npm run build
```

The output is `dist/`. `npm run preview` previews the interface but does not
run PHP/API. Use Docker for a full production check.

## Configuration

| Variable | Purpose |
| --- | --- |
| `TASKMAP_JIRA_HOSTS` | Exact list of allowed Jira hostnames; a blank value blocks outbound requests. |
| `TASKMAP_PUBLIC_ORIGIN` | External origin behind an HTTPS reverse proxy; no path or trailing `/`. |
| `TASKMAP_PROXY_PORT` | Development Node proxy port; the address is always loopback. |
| `DEV_HOST`, `DEV_ALLOWED_HOSTS` | Vite address and allowed hostnames for development. |
| `VITE_JIRA_PROXY_URL` | Optional same-origin API path for a local npm build of the interface. |
| `TASKMAP_DONATIONS_ENABLED` | Server runtime: enables voluntary donations; default `false`. |
| `TASKMAP_ROBOKASSA_MERCHANT_LOGIN` | Server runtime: identifier of a separate Robokassa donation shop. |
| `TASKMAP_ROBOKASSA_PASSWORD1`, `TASKMAP_ROBOKASSA_PASSWORD2` | Server runtime only: technical passwords for the selected shop and mode. |
| `TASKMAP_ROBOKASSA_TEST_MODE` | Server runtime: default `true`; uses the test password pair. |
| `TASKMAP_ROBOKASSA_HASH_ALGORITHM` | Server runtime: `md5`, `sha256` or `sha512`, matching the shop settings. |
| `TASKMAP_DONATION_DATA_DIR` | Optional donation registry directory: Docker `/var/lib/taskmap/donations`, Node `data/donations`. |

`TASKMAP_*` values come from the server's runtime environment. `.env` stays
on the deployment machine and is not copied into the builder or web directory.
Any `VITE_*` variable is embedded in the interface: **never put tokens,
passwords or private keys there**.
`VITE_JIRA_PROXY_URL` from `.env` is used by a local `npm run build`.
Docker uses the standard same-origin API routes and does not pass this override
to the builder. Standard routes are selected by build mode, so using your own
domain does not require source changes.

The supported scenario is Jira Cloud API v3. Jira determines permissions for
viewing and editing issues. Automation requires separate Jira permissions and
may be unavailable on some plans or in some organizations. Jira Server/Data
Center and Jira on a private network have not been validated for this deployment.

## Optional support

When enabled, the interface offers three **one-off** Robokassa donations:
**490, 2,490 and 3,990 RUB**. Support is voluntary, with no subscription,
recurring charge or access restriction. An unpaid or declined donation does
not change how the application works. Donations are disabled by default;
the buttons are hidden when configuration is incomplete.

The automatic offer starts on the third visit in which Jira successfully
returns data. A visit is a separate tab or new tab session: reload, reconnect
and saving settings do not increase the count. The prompt waits about
15 seconds of quiet use in a visible tab and defers during loading, settings,
other dialogs or unapplied changes. It does not open before connection or
when Jira requests are failing. Manual support buttons are available in the
footer and settings. After the first actual opening by any method, there are
no further automatic offers. The browser stores only a counter capped at
three and a shown flag for this rule; unavailable storage disables automatic
prompting.

Use a **separate shop under your Robokassa account** for donations.
Do not change settings for a shop that already handles other payments or
access rights. In the new shop's technical settings, enter your HTTPS URLs
and methods:

| Shop setting | URL | Method |
| --- | --- | --- |
| `ResultURL` | `https://taskmap.example.com/api/donation-result.php` | `POST` |
| `SuccessURL` | `https://taskmap.example.com/?donation=returned` | `GET` |
| `FailURL` | `https://taskmap.example.com/?donation=cancelled` | `GET` |

Replace the domain with your installation's address. A browser return is not
proof of payment: invoice status changes only after a verified server
notification. See [Robokassa notifications](https://docs.robokassa.ru/ru/notifications-and-redirects).

In your local `.env`, set `TASKMAP_PUBLIC_ORIGIN`, enable
`TASKMAP_DONATIONS_ENABLED=true` and fill in the merchant login and both
technical passwords. Start with `TASKMAP_ROBOKASSA_TEST_MODE=true`: use the
test password pair and a matching hash algorithm. Live passwords never replace
missing test passwords. Signature rules are described in the
[Robokassa payment interface](https://docs.robokassa.ru/ru/pay-interface).
After checking test mode, switching to live mode requires the corresponding
password pair and `TASKMAP_ROBOKASSA_TEST_MODE=false`.

```sh
docker compose up -d --build
```

For Node development, restart `npm run dev:with-proxy`. Donation settings
are read by the server at startup and **are not `VITE_*` variables or build
arguments**; passwords must never be included in the interface build.

The app submits only the selected preset and language when creating a
donation. Jira email, token and issue content are not sent to Robokassa.
The registry stores only the invoice ID, preset, amount, creation/payment
time and mode. Docker keeps it in a separate named volume; do not delete it
while payments are pending. MySQL and a user database are not required.

## Data and credentials

The API token is sent to your server only to perform a Jira request; the
server then contacts your Jira over HTTPS. On a public server, always use
HTTPS for the browser connection.

Connection settings are stored in the tab's `sessionStorage`. Encoding is
not encryption. Loaded issues and interface preferences may be stored
locally in the browser. Disconnect removes connection credentials, the
loaded issue cache, task history and saved task colors. Language, interface
preferences, the visit counter and the donation prompt's shown flag remain.

The server does not write Jira credentials or issue contents to its database.
Your reverse proxy logs must also avoid recording request bodies.
See [SECURITY.md](SECURITY.md).

## Updates and backups

Keep your `.env` and reverse proxy configuration separate from the repository.
When donations are enabled, also back up the `donations` named volume that
stores invoice records. Retain this volume across updates and rollbacks;
`docker compose down -v` deletes it. Stop the container while taking a
consistent backup.
Apply any important local map edits to Jira first: there is no server-side
database of user issues.

Update the source from your chosen repository and run:

```sh
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/api/health
```

To roll back, use the previous source version and rebuild the image.
Changes to server settings in `.env` require the container to be recreated.
Changes to `VITE_*` for a local npm build require a new `npm run build`;
Docker continues to use the standard API routes.

## Checks before changes and publication

```sh
npm ci
npm run check
npm audit
```

`npm run check` builds the interface, runs Node/PHP proxy tests and checks
PHP syntax and the public file set. These checks require Node.js 24 and
PHP 8.4+ with cURL. Tests use synthetic data and do not access a real Jira
account. Donation tests cover signatures, amount, mode and repeated
notifications on synthetic data without real payments.

File checks are an additional safeguard. Before publishing, also review
staged files and history and run a separate secret scanner. Do not add `.env`,
credentials, user exports or working screenshots. Do not copy another
repository's history or its `.git` directory.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `503`, Jira host not configured | Set `TASKMAP_JIRA_HOSTS` and recreate the container / restart the Node proxy. |
| `403`, host not allowed | The URL entered in the form must exactly match an allowed hostname. |
| `403`, origin mismatch | Check `TASKMAP_PUBLIC_ORIGIN`, the external HTTPS address and the reverse proxy's `Host` header. |
| `401` from Jira | Check the email, API token and its validity. |
| `403` from Jira | Check the user's permissions for the project, issues and Automation. |
| DNS error / timeout | Check outbound HTTPS, DNS and Jira availability. Private/reserved IPs are intentionally blocked. |
| `/api/health` works, but preview shows no issues | `npm run preview` does not include the backend; use development with the Node proxy or Docker. |
| Build fails to start | Check Node.js 24, run `npm ci`, then `npm run build`. |
| `409` on a donation notification after a crash | Stop the instance and confirm no invoice write is active. Remove only the leftover `<invoice>.json.lock` file from the donation directory, keep `<invoice>.json` and restart the instance to accept Robokassa's retried notification. |

Source structure and responsibilities are described in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
