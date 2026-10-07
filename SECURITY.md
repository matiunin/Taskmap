# Security

Taskmap connects to a Jira account through a proxy. Use a Jira account with only the permissions needed for the intended projects, and keep its API token private.

## Operating an instance

- Serve the application and proxy over HTTPS when they are accessed over a network.
- Restrict access to your own instance and configure the proxy for your Jira host. Do not expose an unrestricted proxy to the internet.
- Keep deployment credentials and server configuration outside version control. Copy example configuration files locally and supply your own values.
- Do not publish task exports, browser storage, logs, feedback records or screenshots containing real Jira data.
- Revoke a credential if it has been disclosed, then update the affected installation.

Check the installation documentation for the configuration supported by each backend. Optional integrations need their own credentials and access controls.

## Preparing a public copy

Run `node scripts/check-publication.mjs` before committing or exporting a release. After creating Git commits, also run `node scripts/check-publication.mjs --git-history` to inspect reachable history.

The check reports paths, line numbers and rule names without printing matches. It rejects common secret formats, live configuration and runtime data files, and non-placeholder email/Jira references. In a Git repository it checks tracked files, staged content and nonignored untracked files; an ignored local `.env` is outside the publication candidate. Tracked or staged private files remain forbidden even if an ignore rule matches them. Pass `--include-local` to inspect ignored local configuration as well. An export without Git metadata is inspected directly. Generated dependency/build directories are skipped in the working-tree scan, while tracked generated files and requested Git history are inspected. Images still require a visual review.

To check names, hostnames, server addresses and identifiers specific to your installation, keep a JSON denylist **outside** the repository and pass its path with `--private-denylist`. Its optional `forbiddenLiterals` and `forbiddenPatterns` arrays contain strings. You can also set `PUBLICATION_DENYLIST_FILE`. The check never prints these values. Pattern checks do not prove that an artifact is free of confidential information.

## Reporting a vulnerability

Use the repository's private vulnerability reporting feature if its maintainers have enabled it. Otherwise, ask a maintainer for a private reporting channel before sharing sensitive details. Do not include credentials, real task content or an active exploit in a public issue.
