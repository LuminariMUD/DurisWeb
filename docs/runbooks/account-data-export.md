# Selected website data download

The prepared `/privacy` page offers a password-verified JSON download of selected
website data. This is a **partial website export**, not the complete account
request/erasure workflow in [issue #12](https://github.com/LuminariMUD/DurisWeb/issues/12).
See the [implementation plan](../ongoing-projects/plan.md) and
[data lifecycle inventory](../privacy-data-lifecycle.md) for remaining categories,
policy decisions and external ownership. No production release is implied.

## User flow and assistance

Sign in, open **Privacy & choices**, enter the current account password under
**Download your website data**, and choose **Download website data**. The page
clears the password after submission and creates a local JSON download only
after the response matches the signed-in account. A sign-out/account change or
page unmount cancels pending work. Passwords and export contents are not saved
in browser storage by this feature. Keep downloaded files private.

The page remains readable before login and links to sign-in. A person who cannot
sign in, needs the complete account information, has too much data for this
download, or wants removal should use the privacy contact already shown on the
page. Never send passwords by email. Staff must verify identity through an
approved assisted process and review third-party/staff information; this feature
does not automate or mark that process completed.

## API contract

`POST /api/privacy/export` requires an active signed access session, the normal
matching CSRF cookie/header, the configured site Origin and a fresh password.
The body accepts exactly `{ "password": "the current account password" }`.
The subject comes from authentication; a supplied account name or other extra
field is rejected. Staff roles do not grant another subject's download. The
limit is five attempts per account per 15 minutes per server process.

Fresh verification reads current account credentials and session status directly
from SQL, bypassing the ordinary account cache. Account comparisons preserve
case-insensitive identity while excluding accent/padding collation aliases.
Blocked, expired, revoked, mismatched and legacy-password accounts are refused.
After collecting the data, a fresh read checks that credentials, account state
and the session still permit delivery. A change during generation discards it.

Success is an `application/json` attachment with `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`. The response contains `schemaVersion: 1`, a
fresh `exportId`, UTC `generatedAt`, the canonical account name,
`scope: "partial-website-data"`, `completeAccountExport: false`, categories and
explicit omissions. Stored date strings retain the database's formatting;
`generatedAt` does not reinterpret historical naive timestamps.

The eleven categories are:

- Profile fields and profile statistics.
- Forum thread and post **metadata**; reactions and subscriptions.
- The subject's poll votes, without other voters or mixed vote history.
- Notification **metadata**, excluding message/link/actor/JSON payloads.
- Push subscription **metadata**, excluding endpoints and authentication keys.
- PvP favorites and likes.

The download explicitly omits credentials; mixed community text/titles/quotes,
mentions and notification payloads; image bytes/external copies; game-owned
data; and donations, analytics, security/moderation/staff/provider/backup/privacy
operation records pending assisted scope review. It never links anonymous
activity to an account by IP. These omissions are unfinished full-export work,
not an approved denial of access to those categories.

## Bounds and failure behavior

All selected website categories share one read-only REPEATABLE READ snapshot.
Only that transaction's isolation is changed; pooled session defaults remain
unchanged. Selectors use fixed source-owned tables/columns and parameterized
subject predicates. Each category is limited to 1,000 rows; total JSON output
is limited to 4 MiB. Exceeding either limit returns 413 before sending any
attachment, rather than silently truncating data.

SQL statements have a three-second client timeout, with a 15-second budget
checked between category reads. Pool checkout, password verification and final
authorization are outside that category budget; it is not a hard end-to-end
deadline. The browser aborts after 20 seconds using a local AbortController,
caller abort listener and timer through response-body reading. It does not
require AbortSignal.any/timeout, and removes the listener/timer on success or
failure. A failed/unknown query discards the SQL connection, its read transaction
and result. Errors never echo raw SQL,
credentials or source payloads. Retries start a new fresh verification and
snapshot; no mutation is performed and there is no reusable download URL.

The server creates no export file, public object, queue or durable request row.
The existing service worker has no privacy-API cache rule and does not cache
this POST. The browser's temporary object URL is revoked after starting the
download. The user's saved file remains under their control. Durable request
tracking, complete exports, approved erasure and restore replay remain P7/P6.

## Verification

`backend/src/services/__tests__/accountExportNative.test.ts` exercises the real
router/auth/query path against the explicitly guarded synthetic fixture on
MySQL and MariaDB. It covers two-account isolation for all eleven categories,
case/collation aliases, CSRF/origin, current credentials despite cache, expiry,
revocation/password/block changes during generation, consistent snapshots,
pool invariants, oversize refusal, error redaction and attempt limits.

Client tests cover safe request construction, account-bound responses, size and
format refusal, server-error redaction, cleared passwords, cancellation and
duplicate-submit prevention. The retained browser qualification uses the fresh
built frontend, compiled real API and disposable SQL/Redis fixture at desktop
and phone widths. See the plan for exact commands, logs and remaining limits.
