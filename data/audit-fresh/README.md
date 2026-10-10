# Fresh official tender revalidation

Verification session: 2026-10-09 20:57:22–20:59:33 UTC (clock tool).

- Flagged OPEN records audited: 30.
- Fresh official-source verification: 29 records (26 Etimad details, 3 reference-matched KSAU listing rows).
- Still OPEN by fresh source status/deadline: 29.
- Newly expired: 0.
- Failed fresh revalidation: 1 Taqeem record, reason `bot_blocked`.
- Tender-specific direct submission URLs verified: 0.
- Autonomous LIVE collectors demonstrated by this process: 0.

No search result or saved historical source was used as fresh evidence. Requests used free TinyFish `fetch_content` with exact URLs, `ttl=0`, body HTML and batches of at most 10 URLs. Five initial Etimad timeouts were retried once and succeeded. The blocked Taqeem page was not retried or bypassed.

`normalized.json` preserves all 30 original records, replaces verified fields only for 29 identity-matched fresh rows and preserves the Taqeem record's old `last_verified`. Its failed refresh attempt is recorded separately. A failed fresh revalidation must not be presented as a new successful verification.

`verification-checks.json` records comparison, source status, raw evidence path, body SHA-256 and result for every flagged record. `summary.json` contains counts. `batch0.json`, `batch10.json`, `batch20.json` and `retry.json` contain source HTML and connector metadata.

This process is a manual verified import path. It does not prove the deployed server's network access or daily schedule. Preserve this distinction in source-health display.

The KSAU record `260839002599` is currently tagged `manpower` in the seed; its verified title and description describe civil/architectural/electrical/mechanical installation. This source does not demonstrate a manpower service tender. Correct classification separately; no main project files were changed by this audit subtask.

