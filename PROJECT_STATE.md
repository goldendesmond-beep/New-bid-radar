# Actual project state — 9 October 2026

Continue this project in place; do not redo GitHub research or replace working files.

## Implemented and exercised

- Python WSGI API with SQLite, migrations 1–2, category registry, verification/version history, source health, collection/error/audit logs.
- 64 records imported and queryable: 54 real tenders/RFPs (30 open, 20 closed, 4 awarded), 9 supplier portals, 1 potential subcontract inquiry with verified award.
- Arabic RTL / English frontend, dashboard, tender and sector views, filter/search, detail dialog/deep links, CSV/XLSX, saved items, tracking, company profile and advisory fit.
- Public source adapters; safe refresh/import, persisted daily due-time scheduler and host cron example.
- MIT upstream files/licensing preserved. Production package built with source/data/evidence and hash manifest.
- GitHub Actions CI and daily collection workflows authored; CI starts real HTTP and Playwright with a temporary SQLite database containing actual source records. No remote CI run has been executed.
- API/database/security tests executed against temporary SQLite; live source extraction evidence retained. See TEST_REPORT for exact counts.

## External blockers and incomplete work

- Public hosting **not deployed**. No authorized independent host credentials. GitHub account/repository could not be reached from the sandbox, despite an environment token variable being present; validity not established.
- Default execution sandbox denies socket creation, including localhost listeners and Chromium crashpad. Browser E2E was invoked and failed before a page existed; no browser checks passed until a permitted rerun proves otherwise.
- Daily refresh attempted once; direct Python network access failed. Production cron/scheduler uptime not verified. Public TinyFish extractions are verified manual snapshots, not autonomous backend LIVE connections.
- Supplier automated refresh, complete discovery of new Etimad links, admin UI, cross-device authenticated accounts, persistent free-host database migration, neural AI, complete subcontract monitoring are not implemented.
- No Git remote exists. Network grants requested through the official command mechanism were interrupted before execution; do not repeat blocked default-sandbox launches. See docs/DEPLOYMENT.md for the exact remaining account/network/hosting requirements.

## Resume commands

```sh
cd /workspace/saudi-bidpilot
python3 -m unittest discover -s tests -p 'test*.py' -v
python3 -m app.server
python3 tests/e2e.py --url http://localhost:8080
python3 -m app.refresh
python3 scripts/build.py
```

Use existing permissions/credentials only, preserve proxy/CA, no paid service and no auth/CAPTCHA bypass. Network and local browser execution need supported sandbox permission. Verify the actual public URL and durable storage before claiming deployment. Configure runtime hostname/cookies/admin secret and persistent filesystem only on a host that supports them.

## Attached audit checkpoint

Latest source recheck: 29 confirmed open, 20 closed, 4 awarded and 1 unknown procurement record; 9 registrations and 1 contractor inquiry retained. Fifty regression tests pass. Known-detail refresh, honest per-record failure states, procurement-only sector pages and authenticated daily import bridge are implemented. See docs/AUDIT_IMPLEMENTATION.md for fresh evidence and unchanged deployment blockers.
