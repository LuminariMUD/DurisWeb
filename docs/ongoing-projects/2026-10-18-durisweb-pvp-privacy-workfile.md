# DurisWeb PvP privacy implementation workfile

Created 2026-10-18. **Status: website implementation and local verification complete. Not deployed.**

Scope: implement the DurisWeb side only. The owner is handling the MUD separately.
No MUD source, migrations, settings, player data, or running services were changed.
The [investigation](2026-10-18-pvp-webinfo-privacy-investigation.md) records the
original evidence. The permanent [API contract](../api/README_api.md#pvp-participant-snapshots)
describes the resulting behavior.

## Agreed MUD handoff

The owner explicitly accepted this contract on 2026-10-18:

- MUD-owned `pkill_info.webinfo_at_capture`: nullable `TINYINT`, default `NULL`.
  `1` permits publication, `0` records opt-out, and `NULL` is unknown.
- The field belongs to the individual participant's captured POV. It must be
  written atomically with that participant's battle snapshots.
- Only `1` can permit publication. Missing schema, null, and unexpected values
  withhold both log and equipment. Existing records without authoritative
  capture permission stay withheld; do not backfill from today's player flag.
- With `respect_webinfo_toggle=true`, a permitted capture also requires the
  current saved `player_data.act2` webinfo bit. Off hides the POV; a missing
  current privacy record makes it unavailable.
- With the admin setting false, only the capture-time gate applies. This never
  overrides a private or unknown capture. A missing current character does not
  veto an otherwise permitted capture when the current-state gate is disabled.
- Later opt-in cannot publish a capture recorded as off/unknown. It can restore
  a previously permitted POV hidden only by the current-state gate.
- `webinfo off` controls outgoing POV publication, not a reader's access to
  permitted opponents. There is no team-wide blackout or viewer-based gate.

The MUD implementation still needs to provide the column and correct capture,
private-message classification, off/on buffer transitions, and durable toggle
persistence. A value of `1` must mean that the captured payload is safe to publish;
it cannot merely reflect a current flag while retaining private/off-period text.
Website tests cannot prove those MUD guarantees. MUD revision, migration identity,
and sender/recipient/buffer test evidence remain the owner's separate handoff.

## Implemented website changes

- [x] Backend SQL gates **both log and equipment** before returning query results.
  The API adds `pov_status: public | private | unavailable`; empty public snapshots
  remain distinguishable from withheld snapshots.
- [x] Missing-column compatibility retains battle metadata and withholds POVs.
  Schema availability is checked on reads, with no cached permissive fallback.
  Metadata-query errors fail closed. A later column addition is detected without
  restarting the website.
- [x] Current-character lookup remains a left join. Deleted/missing characters
  do not remove participants or hide permitted opponents. Release delay,
  in-room filtering, team order, identities, and event metadata remain intact.
- [x] Stored comment quotes and their line/participant pointers use the same gate,
  including threaded replies. Deleted comments and missing quote origins expose
  no quote. New quote text is derived from the permitted log line rather than
  trusting client-supplied text; invalid/private quotes are rejected.
- [x] Traced snapshot consumers: the battle endpoint and social-preview caller
  use `getPvPEventDetail`; list/search/notifications expose metadata only. Stored
  comment quotes were the additional payload path and are covered. Freeform
  user-written comment bodies are not automatically rewritten.
- [x] Desktop, mobile tabs, equipment dialogs, and maximized logs use the same
  explicit publication state. Direct private POV links retain the requested
  participant and explain withholding. Defaults prefer a permitted POV.
- [x] Both-private battles keep metadata and participant selection. Missing
  snapshots and unknown permission have distinct messages. Legacy participants
  with the existing zero fallback ID can also be selected.
- [x] The UI stops rendering a formerly public payload when a refetch withholds
  it. Anonymous readers and readers who themselves opt out can still view
  permitted opponents.
- [x] PvP responses use `Cache-Control: no-store`. Service-worker PvP requests
  use the network before static/API cache rules. Activation removes PvP entries
  from the old `api-cache` while retaining unrelated cached news/forum responses.
  Battle queries refetch on mount and discard unused cached detail responses.
- [x] Admin wording uses `toggle webinfo on/off` and distinguishes current-state
  filtering from the mandatory capture-time gate.

Primary implementation files:

- [pvpService.ts](../../backend/src/services/pvpService.ts),
  [pvp routes](../../backend/src/routes/pvp.ts), and
  [backend types](../../backend/src/types/index.ts).
- [BattleDetailView.vue](../../frontend/src/views/BattleDetailView.vue),
  [frontend types](../../frontend/src/types/index.ts),
  [usePvPEvents.ts](../../frontend/src/composables/usePvPEvents.ts), and
  [WebSettingsView.vue](../../frontend/src/views/admin/WebSettingsView.vue).
- [Vite service-worker configuration](../../frontend/vite.config.ts) and
  [worker activation cleanup](../../frontend/public/push-sw.js).

No new dependency, service, environment setting, database migration, raw-log
redaction heuristic, private owner archive, or general permission framework was
needed. One publication predicate governs snapshots and stored quotes.

## Acceptance evidence

Synthetic fixtures reproduce the owner's sequence without copying private
messages or equipment from the live battles:

| Fixture | First participant at capture | Second participant at capture | Expected POVs | SQL and anonymous HTTP result |
| --- | --- | --- | --- | --- |
| Battle 3 equivalent | On | Off | First only | Pass |
| Battle 4 equivalent | On | On | Both | Pass |
| Battle 5 equivalent | Off | Off | Neither | Pass; metadata retained |

The matrix passes with both admin-setting values and with/without an
Authorization header. An off viewer's presence never gates the opponent's POV.
The SQL tests also cover later opt-in, current opt-out, missing characters,
unknown/invalid capture values, absence and later addition of the column,
missing snapshots, equipment embedded in withheld logs, quote redaction,
canonical quote creation, and existing delay/statistics/filter behavior.

- [Backend SQL/API suite](../../backend/src/services/__tests__/pvpService.test.ts)
  plus [route validation](../../backend/src/routes/__tests__/pvpIdValidation.test.ts):
  **97 tests passed**, no skipped SQL checks.
- [Mounted battle UI suite](../../frontend/src/views/__tests__/BattleDetailView.spec.ts):
  **14 tests passed**. Covers direct links, default selection, public/private
  switching, all-private state, unknown permission, zero fallback ID, dialogs,
  mobile equipment, refetch removal, and defensive handling of an inconsistent
  private payload.
- Browser verification: **16 POV checks passed** (eight desktop at 1440×1000,
  eight mobile at 390×844), covering both participants in public/private/unknown
  fixtures, direct links, log/maximized/equipment views, and default selection.
  Desktop/mobile private-state screenshots were inspected. No page exceptions.
  The actual generated service worker removed seeded old PvP cache entries,
  retained cached news, preferred network over a seeded static-cache collision,
  and refused cached private payloads during an actual fixture-server connection
  failure. Chromium offline emulation alone did not block worker requests, so
  that initial harness assertion was replaced with the real connection failure.
  These checks use the built frontend and synthetic HTTP fixtures; they do not
  prove the deployed site or the MUD writer.

## Verification commands and environment

Source base: `ade01ddcea70c0448825a0b4ab3e8ba77982aae4`, plus this task's uncommitted
website changes. Pre-existing investigation/audit documentation is preserved.

Tests use a new disposable MariaDB instance on port `50607`, database
`pvp_snapshot_test`. The suite creates/drops that synthetic database. Builds use
an isolated source copy with the installed dependencies and a synthetic frontend
origin. Neither production `dist/` directory was rebuilt or replaced.

All commands below passed. Run from the repository root unless noted:

```bash
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
NODE_ENV=test TEST_PVP_DB_PORT=50607 pnpm --dir backend test --runInBand src/services/__tests__/pvpService.test.ts src/routes/__tests__/pvpIdValidation.test.ts
pnpm --dir backend verify:mud-writes
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend test:unit --run src/views/__tests__/BattleDetailView.spec.ts
./frontend/scripts/check-palette-literals.sh
./scripts/check-config-literals.sh
git diff --check
```

Both package builds were run from the isolated source root:

```bash
pnpm --dir backend build
pnpm --dir frontend build
```

Targeted Biome `format --write` commands formatted only touched TypeScript/Vue
files. A Python check verifies local Markdown links. Temporary Node/Playwright
scripts serve the synthetic browser fixture and check desktop/mobile rendering
and actual generated service-worker behavior. Build/test/browser evidence stays
outside the repository. The dependency verifier attempted an install against the
isolated dependency symlinks and warned that they were not real directories;
the existing dependencies were used and both build scripts completed.

Not run: full backend/frontend suites, production migration/preflight acceptance,
MUD builds/tests, live gameplay/privacy toggles, service restarts, production
cutover, or changelog publication. These are outside this website implementation
request; the focused checks exercise the changed paths.

## Release follow-up owned by the coordinated deployment

- [ ] Record the independently completed MUD revision/migration and capture,
  private-message, and off/on buffer test results.
- [ ] Deploy the new website reader before enabling a writer that relies on
  this privacy contract. The new reader safely withholds all legacy POVs before
  the column exists. An old reader remains unsafe even with the new column.
- [ ] Keep unknown historical rows withheld unless the owner supplies
  authoritative per-capture classification. No live snapshots were edited,
  deleted, or reclassified by this task.
- [ ] Verify the exact website release and MUD handoff on the public site;
  activate the updated service worker and refresh open pages. Previously
  delivered/copied content cannot be recalled by a cache or API change.
- [ ] Publish and verify Website Changelog after deployment acceptance using
  the [news-update skill](../../.agents/skills/news-update/SKILL.md). The local
  draft below is not a published entry. Reconcile against existing entries/drafts
  at release time and use the actual release date/version.

Proposed public entry, title **“PvP point-of-view privacy”**, category `public`:

```html
<p>PvP battle pages now withhold a participant's combat log, equipment, and linked
comment quotes when their point of view is private. You can still view opponents
who have chosen to share.</p>
<p>Older points of view whose sharing permission cannot be verified are
unavailable. Battle details remain visible, and private or unavailable views
are explained consistently on desktop and mobile.</p>
```

This entry covers the website payload gate, quote handling, and presentation.
It does not claim that the separate MUD message-classification fix has shipped.
Publication is pending because this implementation has not been deployed.

## PR integration verification

On 2026-10-18 the owner authorized committing all pending website changes,
opening a PR, and merging it without a separate code-review pass. Integration
used current `master` at `dc468e62f4e611a4d25f33043c54385b23abd17c` in an isolated
worktree. The sole textual conflict was in the October 16 audit: both the
upstream Discord handoff and this privacy correction were preserved.

The integrated sources passed both packages' `format:check`, `lint`, `type-check`,
and `build`, the same backend SQL/API command above (**97 tests**), and the
battle UI suite (**14 tests**). The additional upstream Web Settings integration
checks passed **15 tests**:

```bash
pnpm --dir frontend test:unit --run src/views/__tests__/WebSettingsView.spec.ts src/router/__tests__/webSettingsAccess.spec.ts
```

The MUD-write verifier passed with an explicit manifest path because the
isolated worktree is not in the sibling-checkout layout. Configuration literals,
palette literals, and `git diff --check` passed again. The disposable MariaDB
instance was shut down after validation. The earlier browser evidence still
covers the unchanged battle-view and cache implementation; no new live-browser
or production acceptance is claimed. This PR integration is not a deployment.
