# Saudi BidPilot — executed test report

Test date: 2026-10-09 UTC. This report records executed checks; it does not establish a production deployment, a continuously running scheduler, or current access to every upstream source.

## Results

| Check | Result | Evidence and scope |
|---|---|---|
| API/database/security regression suite | **Passed — 50 tests** | `python3 -m unittest discover -s tests -p 'test_*.py' -v`; final output: `tests/final-unit-results.txt`. WSGI requests exercise the actual application and isolated temporary SQLite databases. |
| Python production and test source compilation | **Passed** | `python3 -m compileall -q app tests`, exit 0. |
| Frontend JavaScript module syntax | **Passed** | `node --input-type=module --check < public/app.js` and corresponding `public/score-bars.js` check, exit 0. |
| Arabic dashboard HTML and static assets | **Passed** | WSGI returns dashboard and four static assets; RTL markup and security response headers checked. Browser layout is not covered by this check. |
| SQLite persistence and integrity | **Passed** | Reinitialization preserves records/company profiles; `PRAGMA integrity_check = ok`; no foreign-key violations in the tested database. |
| Tender listing, Arabic/English search, filters and details | **Passed** | Arabic terms, sector aliases, exact English translated title/issuer/description, cities, organization, type/status filters, details, pagination bounds, missing/invalid data cases. |
| Saved records, tracking and company profile | **Passed** | Database persistence and isolation between independent opaque server-stored cookie sessions; save/tracking validation and worker/sector bounds. |
| Deduplication and archive transitions | **Passed** | Same source/reference retains one identity, previous data is recorded in version history, expired dates close records, repeat closing is idempotent. |
| Verified seed import | **Passed** | Actual `data/seed.json` imported into a temporary database; second import performs zero insertions and migration/import hashes persist. |
| Recorded official HTML extraction | **Passed** | Stored Etimad snapshots parse 8 and 10 records; KSAU snapshot parses 5. Titles, issuer/reference, HTTPS sources, evidence hashes and `MANUAL_IMPORT` labels checked. This is extraction from saved evidence, not a fresh upstream network check. |
| Source refresh isolation and records | **Passed** | Isolated fixtures prove one failed source cannot stop another source, run/error/audit records persist, duplicates remain suppressed, refresh lock prevents concurrent runs. Fixture source states exist only in temporary test DBs. |
| Daily scheduling mechanism | **Passed** | One real scheduler loop with controlled persisted timestamps executes an overdue job and skips a recent one. Continuous operation for 24 hours and hosted scheduling have not been verified. |
| Source/application action semantics | **Passed** | Unverified submission links removed; supplier registration cannot become tender submission; no submission URLs invented by recorded parsers. |
| Playwright browser integration | **Not Run — launch attempted and blocked** | `python3 tests/e2e.py` invoked actual installed Playwright and `/usr/bin/chromium`. Chromium exits with SIGTRAP: `crashpad/util/linux/socket.cc:45 setsockopt: Operation not permitted`. No page loaded and no browser assertion passed. Evidence: `tests/e2e-results.json`. |
| Mobile interaction/layout, full language switching, UI save/details/filter clicks, browser error recovery | **Not Run** | Implemented in `tests/e2e.py`; Chromium sandbox restriction prevents execution. Static/API checks do not prove browser behavior. |
| Public production URL / persistent hosted database / hosted daily update | **Not Run** | No verified public deployment was supplied to QA. Use `python3 tests/e2e.py --url https://HOST` after authorized hosting is available. |
| Fresh source connectivity and source/application link HTTP verification | **Not Run by QA** | QA performed no network permission request and makes no LIVE connectivity claim. Source/network execution evidence must be recorded separately by the collector. |
| Lighthouse, axe and external vulnerability database audit | **Not Run** | Browser cannot start; external audit was not executed. Application runtime uses the Python standard library and local JavaScript. |
| Production packaging | **Passed** | `python3 scripts/build.py` executed; ZIP and SHA256 manifest generated from app/frontend/data/evidence/tests/licensing. CI definitions included in the final rebuilt package. |
| Actual server-side refresh attempt | **Failed / degraded** | Executed `python3 -m app.refresh`; all 6 adapters reported `network_or_proxy_failure`; collection/error/audit logs persisted and all 64 prior records retained. Evidence: `data/runtime-refresh-evidence.json`. No source marked LIVE. |
| GitHub Actions CI and daily workflow | **Not Run** | Workflows authored with actual HTTP browser runner, unit checks and production packaging; local Git has no remote, so no push or hosted CI run is claimed. |
| Active-record revalidation | **Passed** | `python3 scripts/revalidate_records.py` verified identities and deadlines for all 30 active records against preserved original official HTML, with zero mismatched deadlines. 51 of 54 total records have parser-based verification; 3 closed archival records retain manual source evidence. This is not a fresh HTTP request. |

## Security checks actually executed

- SQL injection payloads are treated as parameter values and do not expand queries or remove tables.
- Cross-origin and incorrect/missing CSRF tokens receive 403; refresh administration is disabled without a strong configured token and returns 401 for unauthorized tokens.
- Private workspace data remains isolated between session cookies. Cookies use HttpOnly and SameSite=Strict.
- Host allowlist validation, bounded JSON bodies, invalid profile/tracking values, read-rate limits and Retry-After were exercised.
- CSV cells beginning with formula operators are escaped; generated XLSX is a valid ZIP with well-formed XML and inline strings, without formula elements.
- Unsafe/private source URL values are rejected; connector exact-host allowlist, credentials/port checks, private DNS rejection before connection, redirect allowlist checks and robots denial were exercised without live networking.
- Authentication errors, access challenges and rate limiting produce appropriate source states. Empty extraction does not establish LIVE.
- External script/style text is ignored by HTML extraction. External tender text does not execute commands or instruct a model.
- API delivers injected strings as JSON data with a restrictive CSP; frontend escaping call sites were checked. Browser XSS execution tests remain **Not Run**.

These checks are targeted regression tests, not a claim that all vulnerabilities are eliminated. HTTPS deployment cookies, proxy policy, production rate limits, recovery, cross-device accounts and hosted infrastructure need production validation.

## Defect found and repaired

English search initially excluded `title_en`, `organization_en`, and `description_en`. An executed regression reproduced three failed search cases. The implementation was corrected and the final suite passed those cases. The migration test was updated for applied migrations 1–2 and passed. No remaining failed unit test is recorded in the final run.

Original Etimad deadlines were present in the hidden `lastOfferPresentationDate` field but omitted by the first reusable parser. The parser now reads that explicit original value, tests approved future/past statuses, and revalidation confirms all active deadlines.

Code review also found a first-visit session bootstrap race: concurrent `/api/session` and `/api/meta` could set different cookies and invalidate the CSRF token. WSGI reproduction returned 403 for that mismatched pair. Frontend initialization now obtains the session before requesting metadata. Browser validation of the correction is pending the permitted CI/browser run.

## Reproduction

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 -m compileall -q app tests
node --input-type=module --check < public/app.js
node --input-type=module --check < public/score-bars.js
python3 tests/e2e.py
# For authorized external hosting, test the actual HTTP production URL:
python3 tests/e2e.py --url https://YOUR-HOST --output tests/production-e2e-results.json
```

The Playwright runner exits 1 for assertion failures, 2 when required browser tests cannot run, and 0 only when its executed checks pass. Local browser mode copies the real SQLite database to a temporary DB, intercepts same-origin requests into the actual WSGI application, and never inserts demo opportunities into the persistent dataset. Production URL mode uses ordinary HTTP browser requests.

## Attached audit follow-up

The final 50-test run includes known official-detail refresh when discovery is degraded, per-record failed/successful verification, shallow-list failure handling, procurement-only sector/search/export boundaries, session tracking isolation, and authenticated daily import persistence/duplicate prevention against the actual WSGI API in a temporary database. Fresh external verification confirmed 29 of the 30 formerly open records; the blocked Taqeem record is unknown and its old successful timestamp is preserved. See data/audit-fresh/summary.json and docs/AUDIT_IMPLEMENTATION.md. GitHub, browser CI, public deployment and continuous hosted collection remain NOT RUN.
