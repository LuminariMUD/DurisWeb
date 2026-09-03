# Considerations

> Institutional memory for maintainers and AI assistants.
> **Line budget**: 600 max | **Last updated**: Production consolidation (2026-09-02)

---

## Active Concerns

Review these before planning another phase.

### Technical Debt

1. **[P00-backend] The schema cannot be rebuilt from the Knex chain.** DurisWeb
   shares the MUD database, whose core tables are created by the MUD C server.
   Numeric and timestamped TypeScript migrations sort in an invalid historical
   order, and `backend/migrations/*.sql` is intentionally excluded by the
   `extension: "ts"` Knex setting. The current development database also reports
   47 migrations pending even though portions of their schema exist. Treat a
   baseline/squash and ledger reconciliation as dedicated, backup-first work;
   never rewrite a shared ledger or claim fresh-database support incidentally.
2. **[P00-backend] Shared-schema access expands every database blast radius.**
   DurisWeb reads and alters MUD-owned tables as well as web-owned tables. Build
   disposable test databases from a schema-only MUD clone, never from player
   rows, and assess SQL injection, backups, credentials, and retention across
   both codebases.
3. **[P00-infra] Readiness is not release certification.** Local and public
   production health were exercised during the 2026-09-02 deployment, but a
   `/health` response proves only current MySQL/Redis reachability. It does not
   prove the expected migration ledger, served frontend release, bridge state,
   or absence of dependency restarts; retain the preflight and acceptance matrix
   in `docs/deployment.md`.

### External Dependencies

1. **[P00-external/DurisMUD] Cross-repository release state remains
   independent.** The authenticated hook delivery was merged to MUD `master`
   through PR #71 at `0e0649954`, and that merge is an ancestor of the verified
   MUD checkout. Future DurisWeb deployments must still record and validate both
   exact commits; one repository's branch or live state never proves the other.
2. **[P00-infra] Networked bridge acceptance is release-specific.** The current
   production WSS, direct TLS, and raw game endpoints passed live acceptance on
   2026-09-02. Repository tests still cannot certify a future proxy,
   certificate, DNS state, or listener; each deployment must repeat those live
   checks.
3. **[P00-backend] Personal data crosses third-party boundaries.** Google Gemini
   receives account/character names and IP data for suspicion analysis;
   ip-api.com receives visitor IPs; Ko-fi, Discord, Cloudflare R2, and browser
   push providers receive their feature payloads. No in-repo privacy notice or
   processing record documents these transfers.
4. **[production/host] Administrative terminal sandbox binary is absent.** The
   current production host does not provide the configured bubblewrap
   executable, so the web terminal remains unavailable even though public web,
   API, cache, database, and MUD bridge checks pass. Install and validate
   bubblewrap as a separate host change; never substitute an unsandboxed shell.
5. **[production/DurisMUD] Season-temperature data contains an invalid climate
   index.** Two controlled MUD starts on 2026-09-02 each emitted ten guarded
   `ARRAY temps index 11 >= 11 at world/db.c:856` warnings. Current source uses
   `season_temp[s]` as the `temps` index. Preserve the qualified runtime and
   investigate/fix this in the MUD repository; do not suppress it in DurisWeb.

### Performance / Security

1. **[P00-backend] SEC-DEP-1: production dependency advisories are untriaged.**
   The current `pnpm audit --prod` reports 65 backend advisories (1 critical,
   27 high) and 64 frontend advisories (20 high). The critical backend path
   includes `fast-xml-parser`; reachability and upgrades need dedicated work.
2. **[P00-backend] SEC-RT-1: refresh JWTs are stored replayably.**
   `web_sessions.refresh_token` contains the raw token in the shared MUD
   database. Digesting tokens is a small code change but invalidates all active
   sessions on deployment, so it needs an explicit rollout decision.
3. **[P00-backend] SEC-TZ-1: session expiry can fail open across timezones.** A
   JS-local timestamp is compared with database `NOW()`. Store/compare UTC or
   fail startup on timezone mismatch.
4. **[P00-backend] Filesystem trust is the flatfile authentication boundary.**
   Phase 00 added containment, symlink, size, encoding, record, retry, and
   per-hook availability controls, but any actor able to write beneath trusted
   MUD paths can still influence ingested data.
5. **[P00-backend] Privacy lifecycle controls are absent.** There is no consent
   gate for pre-login analytics, no account erasure/anonymization entry point,
   and no retention job for page views, connection history, or audit data. The
   admin terminal also deliberately retains network and shared-PID access for
   operational compatibility; do not describe it as a complete sandbox.

### Architecture

1. **[P00-cross-cutting] Five MUD/web channels have separate trust models:**
   authenticated WebSocket bridge, scoped Redis pub/sub, filesystem ingestion,
   process control, and interactive terminal. A control on one channel does not
   secure another.
2. **[P00-cross-cutting] Hook ownership is exactly 13/8/5/1.** The registry has
   13 website-toggleable hooks; eight also have MUD properties; five are
   website-only; terminal recovery is the always-on fourteenth row. Generate
   tests from the registry, then pin the exact cross-repo tuple separately.
3. **[P00-backend] Fail-closed behavior is directional.** An unreadable local
   settings store defaults enabled so one database blip does not sever every
   integration. Missing foreign MUD state remains unknown/inactive so the site
   never fabricates an enabled state. Disable the website first and enable it
   last during reconciliation.
4. **[P00-backend] Bridge state is connection-scoped.** Accept state only after
   HMAC authentication, validate and replace frames wholesale, clear on
   disconnect, and require a fresh report after reconnect. An acknowledgement
   alone is not observed state.
5. **[P00-repository] This is a logical monorepo without a root workspace.**
   `backend/` and `frontend/` have independent manifests and lockfiles. The MUD
   is a separate checkout at `/home/duris/duris`; inspect both
   sides for integration work, but edit the MUD only when scope authorizes it.

---

## Lessons Learned

### What Worked

1. **[P00] One immutable registry plus generated behavior matrices** prevented
   hook ids, ownership, configuration, and enforcement sites from drifting.
2. **[P00] Exact cross-repository source and documentation contracts** caught
   mismatched whitelists, property rows, state frames, and handoff claims.
3. **[P00] Pure policy/state modules separated from transport clients** kept
   Jest from opening database, Redis, and socket resources during imports.
4. **[P00] Deterministic service-boundary fixtures** replaced ambient player
   data while preserving transaction, SQL-binding, bridge, and gate behavior.
5. **[P00] Validation at the filesystem boundary** made all flatfile consumers
   share containment, file-type, size, encoding, and complete-record rules.
6. **[P00] Source suppression before payload construction** made disabled MUD
   hooks emit nothing and reduced both data exposure and wasted work.
7. **[P00] Real disposable-database backup/restore testing** found the missing
   mysqldump port argument that unit-only checks had missed.
8. **[P00] Per-package Biome and a GitHub Actions matrix** supplied one
   reproducible non-mutating format/lint/type quality gate for both packages.

### What to Avoid

1. **[P00] Do not run or certify `migrate:latest` on a fresh/shared schema**
   until the historical chain and ledger have a designed baseline.
2. **[P00] Do not retain MUD state after disconnect, treat omission as enabled,
   or use an ack as state confirmation.**
3. **[P00] Do not add fake MUD properties to website-only hooks** merely to make
   "both ends" wording look uniform.
4. **[P00] Do not import side-effectful bridge/database clients into pure policy
   tests.** Extract the policy module first.
5. **[P00] Do not optimistically update the hook console.** Render server-
   observed website and MUD state, including mismatch and unknown states.
6. **[P00] Do not infer cross-repository delivery from local code.** Record
   exact commit, branch, pushed state, and merged state independently.
7. **[P00] Do not pipe build/test output through truncating commands** when the
   exit code is evidence; preserve the actual process status.

### Tool / Library Notes

1. **[P00] Biome 2.5.11 is pinned separately** in both packages. Use
   `format:check` in automation and `format` only for intentional rewrites.
2. **[P00] ESLint `lint` is non-mutating; `lint:fix` performs edits.** CI must
   never rely on a command that repairs the checkout while reporting success.
3. **[P00] Jest ESM mocks must be installed before dynamic imports.** Close
   Redis/socket resources explicitly in suites that intentionally instantiate
   clients.
4. **[P00] Source-text security contracts are guardrails, not behavior tests.**
   Pair them with executable tests and update deliberate refactors rather than
   deleting the contract.
5. **[P00] The root has no workspace manager.** Run dependency, test, build,
   lint, type, seed, and migration commands from the applicable package.

---

## Resolved

Items remain here for two phase transitions.

| Phase | Item | Resolution |
|-------|------|------------|
| P00-S02 | Admin-delete authorization ordering | MUD authenticates before parsing or acting; exact order is regression-tested. |
| P00-S02 | Donation-state concurrency | Disabled events are dropped before application and the path avoids partial application. |
| P00-S04 | Remote plaintext bridge transport | `ws:` is loopback-only; remote use requires `wss:` with certificate verification. |
| P00-S04 | Secret rotation asymmetry | Backend retries exactly once with `DURISWEB_SECRET_PREVIOUS`, matching MUD current/previous acceptance. |
| P00-S05 | Flatfile traversal and malformed input | Canonical-root, symlink, type, size, UTF-8, NUL, record, and bounded-work checks are centralized. |
| P00-S05 | Connection-sync IP logging | The ingestion path stores validated IP data where required but no longer emits it in application logs. |
| P00-S07 | Three ambient-data suites (33 tests) | Replaced live database/Redis assumptions with deterministic service-boundary fixtures. |
| P00-S07 | Admin overview stale mocks (7 tests) | Added complete current composable, transport, fetch, timer, and unmount fixtures. |
| P00-S07 | Review findings (1 Medium, 2 Low) | Corrected gate-order assertion and MUD handoff/commit evidence before validation. |
| P00-audit | Backup command ignored non-default DB port | `mysqldump` now receives validated `DB_PORT`; disposable backup, ZIP test, and restore passed. |

---

*Maintained as a durable project record.*
