# Contributing

Use Node.js 24 and run `npm ci`. Configure a local `.env` from the example,
then start `npm run dev:with-proxy`. See the README for the production stack.

Before proposing a change, run `npm run check` and `npm audit`. Test Jira
changes in a dedicated test project; queued writes modify the connected
Jira when applied. Keep examples and fixtures synthetic.

Never commit `.env`, access tokens, deployment account settings, user data,
internal screenshots or private URLs. Keep browser `VITE_*` settings public.
Do not add credentials or response bodies to logs. A security fix should
include a meaningful boundary or regression test.

Use the existing translation system for UI text and plain CSS for styles.
Keep documentation in `docs/`, with setup instructions in the root README.
