# Saudi BidPilot

Arabic RTL / English Saudi tender intelligence with official-source snapshots, real source adapters, SQLite persistence, saved opportunities, application tracking and company fit recommendations. Runs on Python 3.12+ with **no application dependencies or paid API keys**. `ZERO_COST_ONLY=true`.

## Current verified delivery

- 54 actual official tender/RFP records: **30 open, 20 closed, 4 awarded**, as checked 9 October 2026. Deadlines are re-evaluated on import and refresh. No job advertisements or demo rows enter production data.
- 9 real supplier registrations (8 Saudi organizations and IHG clearly labelled global); 1 verified award with potential contractor inquiry, explicitly **not** an advertised subcontract.
- **0 verified direct tender-submission URLs**. Official detail URLs and published submission instructions are shown. Registration links are labelled registration; no fake “apply” button.
- Data obtained through free public TinyFish search/fetch, original HTML retained under `data/verification`; autonomous Python refresh was attempted and failed under the execution sandbox’s socket restrictions. Sources remain MANUAL_IMPORT / DEGRADED / access failure until a real runtime extraction succeeds.
- Not deployed to a public host. No connected Cloudflare/Firebase/Vercel credential was available. GitHub identity access was not established. No billing, domain purchase or OpenAI-hosted deployment was used.

See [TEST_REPORT.md](TEST_REPORT.md), [PROJECT_STATE.md](PROJECT_STATE.md), [source evidence](data/tender-evidence.json), [GitHub comparison](docs/GITHUB_COMPARISON.md) and [third-party license notices](THIRD_PARTY_NOTICES.md).

GitHub Actions CI and daily collection definitions are included under `.github/workflows`; neither has executed on GitHub because no remote is connected. [DEPLOYMENT.md](docs/DEPLOYMENT.md) describes the account/network blockers and appropriate persistent Python hosting, without claiming a completed deployment.

## Run locally

```sh
cd /workspace/saudi-bidpilot
python3 -m app.refresh --seed-only
python3 -m app.server
```

Open `http://localhost:8080`. SQLite persists in `data/bidpilot.sqlite3`; restarting does not re-import unchanged seeds. Set `BIDPILOT_DB` to an absolute durable filesystem path on deployment. Environment keys are documented in `.env.example`; the application reads process variables, it does not automatically load `.env`.

```sh
python3 -m unittest discover -s tests -p 'test*.py' -v
python3 tests/e2e.py --url http://localhost:8080
python3 scripts/build.py
```

Build creates `dist/saudi-bidpilot-production.zip` and SHA256 manifest. Tests use temporary fixtures isolated from the production database.

## Persistence and deployment

This is a WSGI Python backend, not a static-only app. Use a host that supplies a long-running process, HTTPS reverse proxy and **persistent volume**. `Dockerfile` and `compose.yaml` retain SQLite in `bidpilot-data`; configure the real hostname in `BIDPILOT_ALLOWED_HOSTS` and `BIDPILOT_SECURE_COOKIE=true` behind HTTPS. Keep the service bound behind the proxy rather than directly exposing the development WSGI listener.

```sh
docker compose up --build -d
```

Container build/run was not executed in this environment. No free-hosting account has been provisioned. Do **not** deploy this SQLite app to ephemeral Vercel/Pages/serverless filesystems or assume a free persistent disk exists. Cloudflare D1/PostgreSQL migration would be required before using those platforms; that migration is not implemented or claimed.

Take SQLite backups through the SQLite backup API or while the app is stopped, not by copying only the main file during WAL writes. A host loss or deleted volume loses state. Profiles/saved items belong to a private, HttpOnly cookie workspace, expire after 90 days, and do not sync across devices; no user account/SSO system has been claimed.

## Refresh and manual import

`python3 -m app.refresh` performs an independent bounded attempt per source, logs runs/errors/audit events, preserves prior records on failure, closes expired deadlines and de-duplicates by source/reference. It respects exact host allowlists, TLS, redirects, robots and retry limits, and keeps configured environment proxy settings. Supplier portals currently support verified snapshots rather than unattended form scraping.

The server checks the persisted last-run time every minute and attempts a refresh when 24 hours are due. This works only while the process is running. No hosted daily schedule has been verified. `scripts/bidpilot.cron.example` provides an alternative actual host cron configuration; it has **not** been installed. Disable in-process scheduling if installing cron.

```sh
python3 -m app.refresh --import-json /absolute/path/to/verified-records.json
```

For server-admin API refresh/import, set a random `BIDPILOT_ADMIN_TOKEN` of at least 32 characters and send `Authorization: Bearer …` to POST `/api/admin/refresh` or `/api/admin/import` (`{"items":[...]}`). No default admin password; HTTP refresh/import is disabled without a strong credential. No admin upload UI or account management is implemented. Never put the token in a URL or public JavaScript.

## Source coverage and limitations

Official records include Etimad, Taqeem, KSAU-HS, GEOSA and DASC. The Etimad visitor list returns unresolved templates/unified-portal notices; indexed original detail pages were successfully extracted. Reference and hidden original deadline fields were checked. Discovery links from a public aggregator were verified against original Etimad pages before import. A list scraper does not yet discover all new Etimad opportunities unattended.

RCJY, NCP and several government pages failed with proxy errors, timeouts, 403 or bot blocks; none were bypassed. Aramco, RSG, NEOM, Qiddiya, Diriyah, PSFM, IFAS and Al Bawani registration paths were verified; dynamic Ariba/GEP portal shells are disclosed as degraded. No registration forms or bids were submitted.

Search includes Arabic/English lexical sector expansion, multi-field filters, deadline/publication dates and pagination. CSV and real XLSX export are supported (current export limit: 200 filtered rows). Core matching uses explainable rules and lexical overlap; no language/embedding model was downloaded or run. Scores do not establish legal, financial, workforce or technical eligibility. Unknown fields stay unknown.

## Security

Parameterized SQLite, SameSite/HttpOnly session cookies, Origin + CSRF-token write checks, exact outbound source hosts, validated redirects/robots, protected admin endpoints, bounded body/request rates, CSP, safe DOM escaping, escaped XLSX inline strings and CSV formula protection are implemented. External procurement text never executes commands or model/tool instructions. See executed security test boundaries in `TEST_REPORT.md`; this is not a comprehensive penetration test.

## Open-source reuse

Selected MIT BidPilot source files and license are preserved under `vendor/bidpilot`. The score presentation is adapted for a dependency-free frontend. The full paid-model/Mongo/Chroma upstream stack is not imported. Details and commit are in `vendor/bidpilot/UPSTREAM.json`.

## Latest attached-audit checkpoint

The earlier 30-open delivery is superseded by fresh official verification: **29 confirmed open and one failed/unknown Taqeem record**. Fifty regression tests pass. Sector routes now show procurement only, and daily collection has an authenticated import bridge that explicitly reports NOT_CONFIGURED until authorized host credentials exist. Fresh evidence and full limitations: [AUDIT_IMPLEMENTATION.md](docs/AUDIT_IMPLEMENTATION.md). No public deployment or GitHub Actions run is claimed.
