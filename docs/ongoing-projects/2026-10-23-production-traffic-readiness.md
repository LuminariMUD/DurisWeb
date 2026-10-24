# Production traffic assessment for the October 28 pwipe

Assessment date: 2026-10-23 UTC. Target event: 2026-10-28.

## Assessment

The live website passed the tested read workload: 100 requests/second directly
to the origin and 50 requests/second through Cloudflare in 30-second stages,
plus a five-minute public soak with 100 application WebSockets. The revised
primary run completed 11,450 scheduled requests with no errors or skipped starts.
The initial attempt separately demonstrated the privacy route's per-IP rate
limit. It must not be omitted from an account of the results.

There is no measured reason here to buy more hardware or raise database pool
limits for a modest read-traffic surge. The best immediate opportunities are
status refresh coalescing and better caching of fingerprinted assets, followed
by reducing initial frontend downloads. This is evidence for the specific
workload below, not unconditional production readiness or a predicted number
of visitors. In particular, larger datasets and a busy MUD remain unqualified.

## Scope and production safeguards

This assessment exercises the live website, including its required Cloudflare
tunnel, with bounded traffic. It is not a deployment or a full burn-in.
The only repository change is this report. No production build, dependency
installation, restart, migration, configuration change, cache flush, or MUD
operation is part of the assessment. Ordinary website logins use only the
supplied test account, with logout cleanup after each check.

Source and the protected deployed candidate both identify revision
`7147e6b1bece2e650dbe3cb312c904edfa43bf9d`. The active website unit selects
the compiled backend and frontend in this checkout. The backend entry point
and frontend HTML match the protected candidate byte for byte. Artifact hashes,
process identity, scripts, timestamps and sanitized measurements are retained
outside the checkout in the service account's private
`~/.local/share/durisweb/traffic-assessments/20261023-pwipe/` directory.
No credentials, cookies, tokens, request/response bodies, player identities, or
client IP addresses are included in that evidence or this report.

The host has eight logical CPUs and about 15.6 GiB RAM. Initial available RAM
was about 6 GiB; approximately 4 GiB of swap was already occupied. Occupied swap
is not itself proof of current memory pressure. The initial production unit
reported no automatic restarts.

The private harness uses persistent HTTP connections, gzip, response-body
consumption, JSON/content-type checks, and absolute request start times.
It limits outstanding requests to 48 and times each out after five seconds.
It samples backend CPU/RSS/open descriptors and host available memory every
five seconds, checks the origin's database/cache health every five seconds,
and checks public health every 15 seconds. It stops further traffic for:

- Two consecutive origin health failures or one public health failure.
- At least three failures in the most recent 100 workload responses.
- Rolling p95 above one second once 100 responses exist.
- Backend CPU over 90% of one core for three consecutive samples.
- Backend RSS over 1,200 MiB or host available RAM below 2 GiB.
- A missing backend process or failed resource sampling.

These bounds deliberately avoid finding the production system's failure point.
Reported CPU is the backend process only, including its threads; child `ps`/`df`
processes, the connector, database, generator and other host workloads are not
included. Host memory/load observations include all tenants.

## Workloads and interpretation

The capacity mix rotates through 13 request slots: homepage HTML, the main JS,
main CSS, site configuration, public status, two PvP event-list requests,
frag leaderboard, forum categories, MUD News, Website Changelog, anonymous
session status, and auction listings. Lists request 20 entries, except the
changelog's five. One request in five omits the CSRF cookie to exercise initial
visits. The other requests carry an inert CSRF-cookie value, not an authenticated
session. No forwarded client addresses are invented and no limiter is bypassed.

Origin stages target 1, 5, 10, 25, 50 and 100 requests/second. Public stages
target 5, 10, 25 and 50 requests/second through Cloudflare. The higher stages
last 30 seconds each. A separate five-minute public run targets 10 requests/second
while holding 100 application WebSockets open. Each socket sends only an
application ping every 30 seconds and discards other messages. This exercises
the website notification socket, not browser-game connections or the MUD bridge.

Requests/second are individual HTTP transactions, not page visits or concurrent
people. The mix includes only two static assets per cycle; a real new browser
can fetch substantially more. The generator runs on the website host and reaches
one nearby Cloudflare path, so these results do not establish worldwide latency,
edge capacity, saturation throughput, or a guaranteed user count.

### Rate-limit discovery retained separately

The first attempt also included `/api/privacy` in every 14-request cycle.
It completed the 1, 5 and 10 requests/second stages, then stopped automatically
during the 25 requests/second stage after four privacy HTTP 429 responses.
All 28 accompanying dependency-health probes passed. The stopped stage completed
408 requests; this is not a completed 25 requests/second capacity result.

[Privacy routes](../../backend/src/routes/privacy.ts) intentionally share a
30-requests/minute/IP allowance between status reads and choice writes. A single
generator reaches that limit even with ample server headroom. The subsequent
capacity run excludes this route; its results must not be presented as universal
throughput across all endpoints. Preserve this protection. A large shared-NAT
group or repeated page initialization can still exhaust the allowance; check
real 429 rates before changing policy or frontend request deduplication.

## Functional and data coverage

Both public hostnames initially returned structured healthy database/cache
responses. Homepage, site configuration, anonymous session restoration, privacy
status, public MUD status, PvP, frags, news, changelog, forum categories, guide
categories, wiki zones/objects/mobs, and auction listings returned their expected
content types and top-level response structures.

Three successful public login checks took 319–350 ms, including network and
response parsing. Authenticated `/auth/me`, WebSocket-token issuance, forum,
changelog and wiki-object reads returned 200. Every created session was logged
out successfully. These are smoke checks, not a login-storm benchmark.

A fourth login supported a separate 200-request authenticated read check at
five requests/second, rotating session status, forum categories, changelog and
WebSocket-token issuance. All passed; p95 was 30.79 ms. That session was also
logged out successfully. This exercises one account, not many independent
permission/session contexts.

Supplemental public checks also completed 30 wiki-list requests at one/second
(p95 66.79 ms) and six privacy reads at one per five seconds (p95 14.60 ms),
all without errors. Ten replays of the initial 50-asset set completed 500 requests
at 50/second with p95 41.87 ms. A replay of all 237 service-worker precache URLs
at 25/second had p95 41.74 ms and no failures. All 500 initial-asset requests and
235 precache requests returned `REVALIDATED`; the remaining two returned `DYNAMIC`.
These HTTP replays do not run a browser, render pages, or install the worker.

Short API bursts issued 8, 16 and 32 requests simultaneously, all successfully.
Their p95 values were 79.48, 128.36 and 229.22 ms; the largest single response
took 238.38 ms. Public dependency health passed before and after each burst.
Supplemental and burst checks ran during the socket soak, after the rate ramps;
their traffic is additional to the primary harness's ten requests/second.

Map checks returned a 400×400 sector grid, about 208 KiB decoded, in 165 ms on
the first observed request and 26 ms on the next. The first request is not proof
of a completely cold cache. A small tile viewport returned 200. An excessive
viewport and an invalid sector layer returned 400. Map responses retained
`Cache-Control: no-store`; sector/tile limit headers advertised 30 and 300
requests/minute respectively. Wiki list responses advertised 120/minute. The
PvP list clamped `limit=101` to 100.

The production dataset is small in several tested areas: exact read-only counts
were five PvP events, 11 participants, 150 frag entries, one forum thread and no
forum posts. Wiki API totals were 20,218 objects and 19,719 mobs. Empty forum
responses do not qualify active thread/post/search performance, and five PvP
events do not qualify a mature season. No synthetic records were inserted.

Read-only database observations found a ten-connection application pool,
151 server connection slots, and a 1 GiB InnoDB buffer pool. The server's slow
query log was off and `long_query_time` was ten seconds. Existing cumulative
slow-query counters are not evidence of slow queries caused by this assessment.
Simplified `EXPLAIN` probes showed an indexed frag sort and a scan/sort of the
four-estimated-row PvP event table. These are diagnostic probes, not plans for
the complete visibility/participant query or proof that an index is needed.

## Performance opportunities

These are proposed follow-up changes, not fixes deployed by this assessment.
Use the normal isolated-build and production-release process for implementation.

| Priority | Finding and impact | Focused improvement and acceptance evidence |
| --- | --- | --- |
| Before pwipe if a release is scheduled | Each public status request calls the full host diagnostic service, including a process-list subprocess, a disk-usage shell pipeline, a database health query, two incident counts and presence reads. An unthrottled public poll therefore does much more work than a status snapshot needs. | Coalesce concurrent refreshes and reuse a short-lived public snapshot, while retaining current privacy projection and explicit unavailable behavior. Keep dependency `/health` suitable for availability checks. Re-run status-heavy traffic and compare parent/child CPU, subprocess starts and p95; test expiry, refresh failure and concurrent requests. Sources: [status route](../../backend/src/routes/status.ts), [health service](../../backend/src/services/serverHealthService.ts), [process monitor](../../backend/src/services/processMonitor.ts). |
| Before pwipe if a release is scheduled | Fingerprinted frontend files use default origin `max-age=0`. Repeated public JS/CSS probes returned `REVALIDATED`, not `HIT`, even though Cloudflare supplied a four-hour browser TTL. Browser caching and edge freshness are different. | Give only fingerprinted `/assets/` files a long immutable lifetime and serve them before CSRF issuance; retain promptly updateable HTML/service-worker files. Check origin headers, first anonymous requests, repeated edge `HIT`/`Age`, conditional requests and a new release's HTML. Never blanket-cache APIs, authenticated pages, PvP or permission-sensitive maps. Sources: [static serving](../../backend/src/index.ts), [CSRF](../../backend/src/middleware/csrf.ts), [Express static options](https://expressjs.com/en/resources/middleware/serve-static.html), [Cloudflare cache responses](https://developers.cloudflare.com/cache/concepts/cache-responses/). |
| Next performance release | The initial HTML references 47 JS files, one CSS file and two fonts: 2,254,236 raw bytes and about 672,348 gzip bytes, excluding HTML, images, API responses and route-specific imports. The main bundle alone understates initial cost. | Inspect the import/chunk graph and separate editing-only dependencies from initial shared UI. The initial set includes a 160,689-byte gzip editor chunk and ten icon chunks totaling 205,928 gzip bytes. Preserve full dynamic icon catalogs where needed, but load those catalogs/editor functionality on their actual routes. Verify total initial transfer and mobile browser performance, not just the main chunk size. Sources: [Vite chunk groups](../../frontend/vite.config.ts), served `index.html` and its referenced assets. |
| Next performance release | The generated service worker precaches 237 entries totaling 6,686,071 uncompressed bytes. Immediate registration can download optional routes in the background on a fresh browser. | Measure the complete installation waterfall, then restrict precaching to the shell and required offline assets or defer optional route caching. Preserve the offline/update behavior and the PvP `NetworkOnly` rule. These byte counts describe the manifest, not an observed browser transfer. Sources: [PWA configuration](../../frontend/vite.config.ts), [registration](../../frontend/src/composables/usePwaUpdate.ts). |
| Before larger public exposure | The WebSocket handler checks a 10 KiB message limit only after reception. The server is constructed without `maxPayload`; the installed `ws` default permits 100 MiB. There is no observed server heartbeat, connection admission cap, or outbound `bufferedAmount` check in this entry point. | Enforce the intended inbound bound at the transport, add bounded heartbeat/admission/backpressure behavior and verify normal subscriptions/terminal traffic. Do not send oversized payloads to production to demonstrate this source-visible gap. Sources: [socket setup/handling](../../backend/src/index.ts), [ws server options](https://github.com/websockets/ws/blob/master/doc/ws.md). |
| Next reliability release | Application sockets reconnect after a fixed five seconds. A shared network interruption can synchronize clients. | Add bounded exponential delay with jitter and reset it after a stable connection. Exercise a reconnect burst on an isolated target; do not disconnect the production tunnel to create a test. Source: [socket client](../../frontend/src/composables/useWebSocket.ts). |
| Next reliability release | The MySQL pool waits for connections with `queueLimit: 0`; common read queries have no explicit per-query deadline. Small-data success does not establish behavior under slow or growing queries. | Measure acquisition wait and query percentiles; test bounded admission/deadlines and friendly overload responses on an isolated representative dataset before changing the pool. Raising connection limits can transfer pressure to the shared database. Source: [database connection](../../backend/src/db/connection.ts). |
| Next maintenance release | `/api/changelog?limit=101` was accepted and returned all 23 public entries; its parser/service have no page-size cap. Unknown API paths, including an initial mistaken auction URL, returned 200 SPA HTML. | Apply the established pagination bounds and return JSON 404 for unmatched `/api` paths before the SPA fallback. Verify negative/large values, authorization and legitimate history-mode URLs. Sources: [changelog route](../../backend/src/routes/changelog.ts), [changelog service](../../backend/src/services/changelogService.ts), [fallback](../../backend/src/index.ts). |

The origin does issue a CSRF cookie to an anonymous static request because the
middleware precedes static serving. Public cached-asset probes did **not** return
that cookie. Cloudflare was already caching/revalidating these assets; it would
be inaccurate to describe the CDN as entirely bypassed. Cookie handling depends
on the origin/cache configuration, as documented in
[Cloudflare's cookie/cache behavior](https://developers.cloudflare.com/cache/concepts/cache-behavior/).

## Practical preparation for October 28

1. Treat the measured read workload as a reference point, not a visitor forecast.
   A hundred idle notification sockets is different from a hundred simultaneous
   game sessions, map streams or fresh mobile browsers. The shared host may have
   less spare capacity while the MUD is busy; that load was not generated here.
2. If shipping a performance release before the event, start with status refresh
   coalescing and immutable fingerprinted assets. Re-run these bounded checks
   against the verified release. Avoid speculative pool increases or a broad
   dependency upgrade based on this test.
3. Watch public and origin health separately, plus route p95, 5xx/timeouts,
   per-route 429 counts, backend RSS/CPU, host available RAM and active swap I/O.
   Distinguish a local per-IP policy limit from backend overload. Review the
   existing watchdog/tunnel rather than changing ingress for the event.
4. Review overlap with scheduled website backups and other heavy host work.
   This assessment does not measure backup/wipe/build overlap or authorize
   rescheduling MUD operations. Use the existing maintenance and incident
   procedures if a release or availability incident occurs.
5. Use an isolated, representative larger dataset for the next qualification:
   busy forum threads/search, mature PvP history, many distinct authenticated
   accounts, concurrent login, cold caches, slow consumers and reconnect bursts.
   Add a real mobile browser waterfall and service-worker installation check.

## Checks deliberately outside this assessment

- Destructive exhaustion, arbitrary payload floods, artificial client-IP rotation,
  database/cache failure injection, ingress restarts and failover drills.
- MUD load, game sessions, writes, season/wipe operations, privileged terminal,
  builder streaming, auctions bids, uploads and backup/restore execution.
- Many-account or concurrent-login load, mature-season query plans and concurrent
  forum mutations. A bounded single-account read test is reported separately.
- Global browser locations, mobile CPU/network throttling, rendering, LCP/INP/CLS,
  actual service-worker installation and a complete first-visit waterfall.
- Long-term memory growth, idle-timeout boundaries and continuous multi-hour load.

Backend/frontend formatting, lint, type checks, Jest/Vitest suites, builds,
configuration/dependency preflight, migrations and `verify:mud-writes` are not
run for this documentation-only change. They would not establish live capacity;
building this checkout would also replace served artifacts. No public Website
Changelog entry is needed: this task changes an internal assessment document,
not website behavior. This follows the [news-update guidance](../../.agents/skills/news-update/SKILL.md).

## Command and evidence inventory

All shell work runs from the repository root. The following records the executed
checks and investigative command groups; private scripts contain the full
request schedules and validation logic. Paths below `EVIDENCE` mean the private
assessment directory identified above. These are execution records, not a
recommendation to repeat production traffic without reviewing current load.
Copy scripts to a fresh evidence directory before reusing them: their output
paths are pinned and their summaries would otherwise be overwritten.

| Commands/checks executed | Result/evidence |
| --- | --- |
| `pwd`; `git status --short`; `git log -1 --format='%H %s'`; `git -C <protected-candidate> rev-parse HEAD` | Production checkout and candidate identity; clean starting worktree. |
| `cat`, `sed`, `rg`, `rg --files`, `wc -l`, `ls`, and `find` against agent instructions, the root/package READMEs, development/conventions/security/deployment/operator guides, route/services, client bootstrap, Vite configuration and existing output | Source/configuration inspection only; files supporting findings are linked above. Searches with no matches returned nonzero without changing state. |
| `node --version`; `pnpm --version`; `getconf _NPROCESSORS_ONLN`; `getconf CLK_TCK` | Node v26.11.1, pnpm 12.10.1, eight logical CPUs; actual Linux tick frequency used for sampling. |
| `systemctl --user list-units 'durisweb*' --no-pager`; `systemctl --user show` with explicit non-secret state/resource/path properties; `ps -p <backend-pid> -o pid,etime,pcpu,rss,nlwp` | Active production process, service paths, restart counts and resource limits. An initial lookup of `durisweb-backend.service` selected an inactive, incorrect unit name; subsequent checks use the discovered `durisweb-production.service`. |
| `free -m`; `df -h .`; `uptime`; Node reads of the selected process's `/proc` entries and host memory/swap counters | Initial capacity and periodic resource samples. |
| Inline Node `createRequire`/dotenv parsing with an explicit non-secret value allowlist and inherited-variable name inventory | Production mode/targets confirmed; no inherited application-variable overrides found. An initial direct `dotenv/lib/main.js` import failed before connecting; package-export resolution through `createRequire` fixed the probe. |
| Inline Node HTTP probes, cache/alias checks, artifact hashes/comparison and local gzip/manifest accounting | `functional-probes.json`, `cache-alias-probes.json`, `initial-assets.json`; baseline and hash checks also reported in the tool transcript. Alias website URLs returned canonical 308 redirects while alias APIs remained accessible. |
| Inline mysql2 read-only `SHOW GLOBAL STATUS`, selected `SHOW GLOBAL VARIABLES`, aggregate table metadata, exact aggregate counts inside `START TRANSACTION READ ONLY`/`ROLLBACK`, and simplified `EXPLAIN` | `database-during.json`, `database-plans.json`, final aggregate deltas. No migrations, data modifications or raw rows exported. |
| `node EVIDENCE/traffic.mjs` | First attempt stopped correctly on privacy 429s; `summary.json`, `observations.jsonl`, `run.log`. |
| `node EVIDENCE/capacity-run/traffic.mjs` | Revised mix, public/origin ramps and socket soak; corresponding files under `capacity-run/`. |
| `node EVIDENCE/auth-smoke.mjs` | Three successful login/read/logout checks; `auth-smoke.json`. |
| `node EVIDENCE/supplemental.mjs` | Initial assets, precache URL replay, one authenticated read session, wiki lists and normal privacy cadence; `supplemental-summary.json`, `supplemental.log`. |
| `node EVIDENCE/burst.mjs` | 8/16/32 simultaneous public API requests; `burst-summary.json`. |
| `node --check` for the first/revised traffic scripts, auth smoke, supplemental, burst and final-check scripts | Syntax checks passed. |
| Node wrapper around `journalctl --user -u <selected-unit> --since <assessment-start> --no-pager -o json` | Counts/categories only, without emitting raw log messages; interim and final log reviews. |
| `node EVIDENCE/final-checks.mjs` | Final service/log/health/artifact/served-asset and database-counter checks; `final-checks.json`. |
| `git diff --no-index --check /dev/null docs/ongoing-projects/2026-10-23-production-traffic-readiness.md`; inline Node local Markdown-link resolution | Whitespace and linked-file existence checks. |

## Measurements and final production state

The first attempt ran 22:26:21–22:27:57 UTC. The revised primary run ran
22:29:07–22:39:38 UTC. Values below are end-to-end response times, including body
receipt/decompression and validation, not server-only execution time.

| Primary stage | Target requests/s | Scheduled responses | Errors | p95 ms | p99 ms | Peak sampled backend CPU, % of one core |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Origin baseline, 20 starts | 1 | 20 | 0 | 41.92 | 45.63 | 1.2 |
| Origin, 30-second stage | 5 | 150 | 0 | 44.03 | 55.83 | 6.4 |
| Origin, 30-second stage | 10 | 300 | 0 | 44.46 | 54.66 | 7.8 |
| Origin, 30-second stage | 25 | 750 | 0 | 43.32 | 52.54 | 25.0 |
| Origin, 30-second stage | 50 | 1,500 | 0 | 42.56 | 51.23 | 35.0 |
| Origin, 30-second stage | 100 | 3,000 | 0 | 43.15 | 50.71 | 64.3 |
| Public, 30-second stage | 5 | 150 | 0 | 54.70 | 71.93 | 4.6 |
| Public, 30-second stage | 10 | 300 | 0 | 53.03 | 56.49 | 14.2 |
| Public, 30-second stage | 25 | 750 | 0 | 53.69 | 60.47 | 11.4 |
| Public, 30-second stage | 50 | 1,500 | 0 | 52.78 | 59.95 | 21.6 |
| Public soak, 100 sockets, five minutes | 10 | 3,000 | 0 | 53.62 | 62.48 | 10.4 |
| Origin health cooldown, 30 starts | 1 | 30 | 0 | 1.69 | 1.94 | 1.4 |

Achieved high-stage rates were 100.00 requests/second at the origin and 49.95
through Cloudflare. The primary HTTP stages reached six outstanding requests at
most; the 48-request setting was a safety cap, not measured concurrency. The
separate burst checks establish up to 32 simultaneously issued HTTP requests.
Supplemental traffic during the soak is described above and contributes to its
resource measurements.

All 178 primary health probes passed, including 42 public probes. All 100 socket
connections opened; none errored or closed unexpectedly. The harness observed
1,192 pongs, with median RTT 4.96 ms, p95 7.44 ms and maximum 257.03 ms.
Sockets remained connected through the following cooldown, then were closed
normally by the harness. The 973 supplemental scheduled requests and 56 burst
requests also completed without errors. These counts exclude login setup,
functional probes and their additional health checks.

Peak sampled backend RSS was 340 MiB; the minimum host available memory was
5,941 MiB. Peak open backend descriptors were 171 during the combined checks,
falling to 41 after cleanup. RSS plateaued near 340 MiB during the soak; this
short observation does not prove long-term leak freedom. Host-wide swap counters
increased by 2,994 input pages and 4,089 output pages during the revised run;
other host workloads prevent attributing that activity to the website.

Between the early database observation and final check, global slow-query,
aborted-connect and row-lock-wait counters did not increase. Maximum observed
server connections increased from 13 to 16 against the configured 151. Global
temporary-disk-table count increased by 3,602 and queries by 49,082. Those are
shared-server counters, not route attribution. Inspect statement-level plans
with representative data before proposing temp-table or index tuning.

Final checks at 22:39:45 UTC confirmed origin and both public hostnames healthy,
the same backend PID and start time, zero automatic application/connector/cache
restarts, all three services running and the availability-watchdog timer active.
Journal review from 22:26:21 through the final check found 318 application info
entries, no application warnings/errors/stall reports, no connector journal
entries, and 25 watchdog entries with no warning/error/recovery indications.

The backend entry-point and frontend HTML hashes remained unchanged, and the
public HTML referenced the expected main JS asset. A final complete comparison
at 22:40:22 found all 1,544 backend build files and all 239 frontend build files
byte-identical to the protected deployed candidate (`artifact-trees-cleanup.json`).
The ending source revision remains the starting revision, and the sole worktree
change is this report. All traffic generators finished; the production website
remains running. No performance change has been deployed by this assessment.
