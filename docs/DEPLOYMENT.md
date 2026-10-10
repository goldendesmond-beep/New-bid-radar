# External deployment and permission status

## Confirmed state

The project is committed in a **local Git repository**. `git remote -v` is empty: no GitHub upload has been verified. The `GH_TOKEN` environment variable exists, but its identity, validity and repository permissions cannot be established without an allowed network execution. Never copy its value into files or output.

Repeated official additional-network permission requests were interrupted/aborted before execution when new user messages arrived. No automatic security-review rejection was returned. The default execution sandbox denies socket creation, including localhost HTTP and Chromium IPC, despite the managed outbound destination policy being unrestricted. These are different controls. Do not repeat default-sandbox browser launches expecting a different result.

## GitHub and CI handoff

The workflows in `.github/workflows/ci.yml` and `collect.yml` are ready. They have **not run on GitHub** because this project has no verified remote or push. Use an already authorized account with repository write permission and Actions enabled. Private repositories may consume the account’s included Actions allowance; do not activate billing or assume an unlimited allowance.

```sh
cd /workspace/saudi-bidpilot
gh api user --jq .login
gh repo list --limit 100 --json name,url,description
# Inspect an existing relevant repository before choosing it; do not overwrite it.
# For a new authorized repository:
gh repo create saudi-bidpilot --private --source . --remote origin --push
gh workflow run ci.yml
gh run list --workflow ci.yml
```

CI installs free Playwright/Chromium, starts the actual Python HTTP server with a temporary SQLite database containing the real seed records, executes browser checks, and uploads the production package plus results. CI failures must be fixed and rerun before claiming browser validation. The daily collection workflow exports an artifact only; it is **not** an active hosted-database updater.

## Suitable hosting for this architecture

Use Python WSGI with durable filesystem storage. A free **PythonAnywhere Beginner** account is a potential fit for the Python web application and SQLite disk, subject to the account’s actual available quota and outbound allowlist. Such an account/API credential is **not connected here**, and no availability, deployment or unrestricted collector networking has been verified. Free web apps can require renewal; free scheduled tasks are not assumed. CI collection is an alternative only after a tested authorized import-to-host bridge exists.

An existing free VM/container host with a persistent volume is also suitable if already available. `compose.yaml` preserves database data in `bidpilot-data`; protect it with HTTPS and a reverse proxy. There is no credential or ready VM in this session. Do not create a paid instance, enable billing or claim that an ephemeral free container is durable.

Cloudflare Pages static hosting and Vercel ephemeral filesystem deployments do not run this backend with persistent SQLite. Cloudflare Workers/D1 could be a future adapter; it is **not implemented** and cannot be presented as this project’s deployment path yet.

## Portable production delivery

`python3 scripts/build.py` produces `dist/saudi-bidpilot-production.zip` plus a SHA256 manifest. It includes Python API, frontend, verified seed/source files, original evidence, tests, CI definitions, deployment instructions and licensing. SQLite is initialized from seeds on the first run and stored at `BIDPILOT_DB`. The production package excludes private sessions, local live SQLite files, credentials and Git internals.

Required external authorization to finish: a verified repository-writing GitHub identity and network execution grant; and a free, already-authorized Python host with durable storage plus its deployment credential. Production DNS/HTTPS/allowed-hosts, actual source access and a real scheduler/import bridge must then be tested. No public production URL currently exists.
