# Verified delivery — 9 October 2026

## Production and GitHub

**No verified public website URL and no GitHub remote.** The application is saved in local Git with all source/data/license/test files. Browser execution and upload require a network/execution grant that has not completed; no external free Python hosting credential is connected. No public deployment or GitHub Actions success is claimed.

## Verified data

54 actual official procurement records: 30 open, 20 closed and 4 awarded; 9 vendor registrations; 1 additional verified-award inquiry lead. Original page snapshots and per-record source/deadline/status evidence are retained. No direct tender submission URL was verified (0); authentic detail links and published email instructions are shown instead.

- [Hotel investment/management/operation — Etimad 260939008348](https://tenders.etimad.sa/Tender/DetailsForVisitor?STenderId=Gj2Wg4iktxsmkimPf2wEbw%3D%3D), deadline 11 October 2026.
- [Taqeem building operation and maintenance — PRCOMP20260800034](https://taqeem.gov.sa/tenders/mshrw-tshgyl-wsyn-mbn-lhyy-ls-wdy-llmqymyn-166), deadline 27 October 2026; encrypted technical/financial submission instructions are published on the source, not a portal-apply URL.
- [KSAU-HS official competitions](https://ksau-hs.edu.sa/Arabic/UniversityBiddings/Pages/default.aspx), including references 260939001214, 260939003511 and 260839002599 with future final-offer dates.
- [Red Sea Global vendor interest form](https://www.redseaglobal.com/en/vendor-registration/), labelled supplier interest rather than tender application.
- [Saudi Aramco supplier registration instructions](https://www.aramco.com/en/what-we-do/suppliers/become-a-supplier).

14 source entries have successful public snapshot extraction evidence, including supplier sources; **0 autonomous backend LIVE connections**. Actual last runtime refresh tried 6 adapters and recorded network/proxy failure; existing data was preserved. The complete source registry currently contains 21 entries, including 11 manual imports and 10 unavailable/blocked runtime states. Snapshot public access and runtime health are separate fields.

## Features and storage

Arabic RTL/English interface, dashboard, tender and sector routes, search and filters, details/deep links, saved items, application tracking, source health, supplier portals, CSV/XLSX, private company profile and advisory matching. SQLite persistence/integrity, migrations, de-duplication, history and logs were exercised. Local database file is retained in `data/bidpilot.sqlite3`; private sessions/database files are intentionally excluded from public Git and the portable ZIP. The ZIP initializes a durable database from verified seeds.

Hotel records are available. Manpower and Housekeeping pages work and contain verified sector-relevant registrations/archived records where available; empty confirmed tender filters display an honest empty state. No invented sector tender is added. Rule classification and bilingual lexical matching operate without API keys; no neural model was run.

Daily scheduling code and a host cron example exist. Scheduler due/skip mechanics passed controlled tests. Continuous hosted operation and actual daily source extraction are **not verified**. GitHub scheduled collection currently generates artifacts only and is not connected to a hosted database.

## Test and security evidence

36 API/database/extraction/security checks pass after repairs; Python/JS checks, database integrity, production ZIP integrity and targeted secret-pattern scan pass. Final logs: `tests/final-unit-results.txt`. Playwright was invoked but Chromium failed before page load due forbidden socket operations; mobile/UI/browser XSS/production tests are Not Run. Workflows are authored, not executed remotely.

Executed controls include parameterized SQL, CSRF + origin validation, private session isolation, protected admin endpoints, request/body bounds, safe source allowlists/redirects/robots, CSP/escaping, CSV formula protection and XLSX inline-string protection. Full dependency vulnerability database audit and production penetration testing were not run.

Remaining work: authorized GitHub push/CI run; an actual free Python host with durable storage and HTTPS; browser validation/fixes; a tested hosted schedule; more complete automatic Etimad discovery; automated supplier refresh; admin UI, cross-device authentication and neural analysis. Exact permission/deployment instructions: `docs/DEPLOYMENT.md`.
