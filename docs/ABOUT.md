# Taskmap — a map of Jira issue relationships

Taskmap is an open-source application for working with Jira Cloud issue
relationships. It displays issues on an interactive map, lets you view
their descriptions and prepare link changes before applying them to Jira.

## Benefits

- **The full picture.** Parent, child and linked issues appear on one map.
- **Review before applying.** Prepare link changes, undo local edits and
  review them before applying them to Jira.
- **Your own deployment.** Deploy the app and proxy on your server and
  connect them to your Jira. No Taskmap subscription is required.

## Workflow

1. Deploy Taskmap and configure the allowed Jira hostname.
2. Connect Jira Cloud: enter its URL, your account email and an API token.
3. Add an issue by key or URL and explore its relationships and description.
4. Prepare changes on the map, review them and apply them to Jira.

Jira controls permissions for viewing and editing issues and remains
the source of persistent issue data.

## Self-hosting and data

Use Docker Compose for deployment and Node.js with the proxy for local
development. Your connection credentials are sent to your proxy for Jira
API requests and are not sent when creating donations. They are kept in
the browser tab's `sessionStorage`; encoding is not encryption.
Disconnect clears connection credentials, cached issues, local task history
and saved task colors.

## Optional support

With Robokassa configured, you can enable one-off donations of 490, 2,490
or 3,990 RUB. Donations are disabled by default. Choosing not to donate
or leaving a donation unpaid does not restrict the app's features or
create a subscription.

The project is distributed under the [MIT license](../LICENSE). Terms for
third-party resources are listed in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

For installation, Jira connection and donation setup instructions, see
the [English setup guide](../README.en.md).
