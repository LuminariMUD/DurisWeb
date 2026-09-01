# Session Specification

**Session ID**: `phase00-session06-hook-control-console`
**Phase**: 00 - hooks between website & mud server + security of those hooks
**Status**: Complete
**Created**: 2026-09-01
**Base Commit**: 5966bb465366f9389c8824c9745cac75283e7eff
**Work Window**: One coherent operator-control change spanning the Vue console, its truthful status/reconcile API, and the authenticated MUD acknowledgement needed for a toggle to settle only after both ends report the requested state.
**Package**: null
**Package Stack**: Vue 3 + TypeScript (`frontend`), Express + TypeScript (`backend`), C (external DurisMUD bridge)

---

## 1. Session Overview

This session turns the hook registry and state engine from Sessions 01-05 into
an operator console at `/admin/mud/hooks`. The console shows the website gate,
the MUD report, and the effective state independently; makes mismatch visually
impossible to confuse with off; and exposes transport posture without exposing
credentials.

The current backend can read both ends but can change only the website gate.
That is insufficient for the UX contract that a toggle stays pending until both
ends confirm and that the detail sheet can reconcile a mismatch. This session
therefore adds one narrow command to the already authenticated MUD bridge. It
sets only a registered `durisweb.hook.*` property, persists it on the MUD host,
pushes the existing state frame, and acknowledges the request. No new transport
or authentication surface is introduced.

The UI follows the approved PRD_UX direction: a flat, table-driven mission
control surface; continuous dual-state connectors in nominal rows; and a
broken amber hazard hatch only for mismatch. Desktop remains a dense list,
tablet becomes a two-column card grid, and mobile uses stacked cards with
44px controls.

---

## 2. Objectives

1. Render all 13 toggleable hooks plus the immutable terminal with truthful,
   non-colour-only WEB, MUD, and effective states.
2. Keep every toggle server-authoritative and pending until the requested
   state is confirmed, with failure behavior that never opens delivery.
3. Show website provenance, MUD report provenance, last activity, resource
   health, and a set-both-ends reconcile action in an accessible detail sheet.
4. Surface the bridge scheme, host, TLS certificate expiry when available, and
   configured secret age without returning URLs with credentials or any secret
   material.
5. Add route, navigation, dashboard summary, deep links, responsive behavior,
   keyboard/focus handling, and unit/browser coverage without new dependencies.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session03-website-toggle-store` - cached website state and API
- [x] `phase00-session04-bridge-state-and-transport-security` - real MUD state,
  TLS policy, and authenticated bridge
- [x] `phase00-session05-flatfile-ingestion-hardening` - per-hook UNAVAILABLE
  resource state and recovery metadata

### Required Tools Or Knowledge

- Existing shadcn-vue new-york components and Tailwind v4 semantic tokens
- Vue Test Utils/Vitest and backend Jest conventions
- DurisMUD property array and table-driven authenticated WebSocket handlers
- Browser verification at desktop, tablet, and mobile viewports

### Environment Requirements

- Existing dependencies only; no package installation
- MUD changes remain on `feat/durisweb-hook-toggles` and are pushed without a
  merge
- Browser validation may use a local authenticated test fixture or controlled
  API interception; production credentials are never copied into test assets

---

## 4. Scope

### In Scope (MVP)

- `/admin/mud/hooks` route and `Hook Control` item under MUD Settings, gated by
  `manage_mud_properties` with the existing overlord bypass.
- Summary counts, last refresh timestamp, filter, skeleton rows, polling without
  a spinner, row-level errors, and sonner completion/warning toasts.
- Channel groups for bridge, pub/sub, ingestion, process control, and terminal.
- `DualStateLamp`, `HookRow`, `HookGroup`, `HookToggle`, `TransportPanel`,
  `HookDetailSheet`, and `HookHealthCard` components.
- ON, OFF, MISMATCH, UNKNOWN, and UNAVAILABLE effective states; `MUD: N/A` for
  registry entries that intentionally have no MUD-side gate.
- Terminal rendered as `ALWAYS ON` with its permission-gate explanation and no
  switch or reconcile control.
- Enabling a known MUD-off hook requires confirmation; disabling does not.
- A reconcile endpoint that applies both ends with fail-closed ordering and
  returns the final observed state, including partial-failure detail.
- Exact-key MUD setter over the authenticated bridge, durable property write,
  state push, and request acknowledgement.
- Website last-toggle actor/time, MUD state report receipt time/source, and
  in-memory last-activity timestamps recorded at hook delivery boundaries.
- Sanitized transport posture: scheme, host, loopback status, connected/auth
  state, peer certificate expiry when observable, optional secret rotation age,
  and a blocking error for non-loopback `ws:`.
- `?hook=<id>` deep link, sheet focus restoration, keyboard operation,
  polite live announcements, role=alert blocking error, reduced-motion rules,
  and PRD_UX responsive layouts.
- Hook-health summary card on `/admin/mud/dashboard` linking to the console.

### Outside This Work Window

- Secret rotation UI or changing the deployed secret.
- Throughput charts, historical activity storage, scheduled re-enable, rate
  limits, or circuit breakers.
- Restyling another admin or public page.
- Replacing bridge, Redis, process, terminal, or flatfile transports.
- Treating website-only hooks as if the MUD reported a state it does not own.

---

## 5. Technical Approach

### Truthful State And Reconcile

Keep the existing `PATCH /api/hooks/:id` website-only contract for independent
local refusal. Add an explicit reconcile operation used by the console's main
toggle and detail actions. Website-only hooks reconcile through the cached
website store. MUD-gated hooks use the authenticated bridge command and settle
only after its acknowledgement and pushed state frame.

Ordering is directional:

- Disable: write the website gate first, then request MUD disable. If the MUD
  is unavailable, delivery is still stopped and the response reports partial
  completion rather than pretending both ends agreed.
- Enable: request and observe MUD enable first, then write the website gate. If
  either step fails, the website remains disabled.

The MUD command accepts only an exact registered gated hook id plus a boolean.
It updates the in-memory property, persists `lib/duris.properties` on the MUD
host, broadcasts the existing schema-v1 state frame, and returns a request-id
ack. Authentication is checked before parsing configuration so unauthorized
peers learn nothing.

### Observability

Extend hook status serialization with website provenance from `web_settings`,
MUD report receipt metadata, and an in-memory activity timestamp. Activity is
recorded only when a registered hook actually reaches its delivery/application
boundary, not merely when the status endpoint is read.

Expose transport metadata through a pure/sanitized policy surface. Never return
the secret, HMAC, URL credentials, path, query, or fragment. Certificate expiry
is read from the live TLS peer when connected; plaintext loopback shows `not
applicable`, and disconnected/unsupported cases show `unknown`. Secret age is
derived only from an optional `DURISWEB_SECRET_ROTATED_AT` deployment timestamp;
absence renders `unknown` rather than inventing a date.

### Frontend State Model

A focused hooks API module and composable own fetch, five-second polling,
per-hook pending/error state, reconcile calls, and query-driven selection. A
pending switch remains bound to the last server state and is disabled until the
reconcile response and subsequent authoritative refresh agree or the request
fails. Summary counts are computed from returned hook rows, never guessed.

Rows are grouped from the registry channel field. Desktop uses a single
table/list anatomy. Tablet changes each group to a two-column card grid. Mobile
uses stacked cards, a filter sheet, and full-width minimum-44px controls. The
detail Sheet owns provenance and reconcile actions; URL query state owns deep
linking and focus restoration.

### Design System And Visual Source Of Truth

- Desktop concept:
  `assets/hook-control-concept.png` (1536x1024)
- Mobile composition concept:
  `assets/hook-control-mobile-concept.png`
- Authoritative copy, grouping, states, and colors remain `PRD_UX.md`; generated
  content drift is not accepted.
- Locked tokens: existing cool slate semantic palette plus `--warning` and
  `--warning-foreground` in light/dark blocks, registered in `@theme inline`.
- Locked typography: system sans UI and `ui-monospace` machine values.
- Locked container model: flat list/table with 1px rules; no gradients, glow,
  noise, blur, or shadows except the existing Sheet overlay/elevation.
- Signature motif: continuous effective rule when nominal; hollow/dotted shapes
  for off/unknown; broken diagonal warning hatch plus label and border for
  mismatch.
- The mobile concept's green/red nominal controls and invented terminal content
  are explicitly rejected; semantic primary/muted tokens and the registry's
  actual terminal row win.

---

## 6. Deliverables

### Files To Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `backend/src/hooks/hookActivity.ts` | In-memory last-activity timestamps | ~90 |
| `backend/src/services/hookReconcileService.ts` | Directional set-both-ends orchestration | ~190 |
| `backend/src/services/mudTransportStatus.ts` | Sanitized transport/certificate/secret-age view | ~180 |
| `frontend/src/types/hooks.ts` | Hook API and UI state types | ~150 |
| `frontend/src/services/hooksApi.ts` | Typed status, website toggle, and reconcile client | ~90 |
| `frontend/src/composables/useHookControl.ts` | Polling, pending, error, filter, and selection state | ~260 |
| `frontend/src/components/admin/hooks/DualStateLamp.vue` | Dual lamps and effective connector | ~220 |
| `frontend/src/components/admin/hooks/HookToggle.vue` | ON/OFF/PENDING switch and enable confirmation | ~230 |
| `frontend/src/components/admin/hooks/HookRow.vue` | Accessible responsive hook row/card | ~250 |
| `frontend/src/components/admin/hooks/HookGroup.vue` | Channel group list/card wrapper | ~150 |
| `frontend/src/components/admin/hooks/TransportPanel.vue` | Sanitized posture and blocking alert | ~180 |
| `frontend/src/components/admin/hooks/HookDetailSheet.vue` | Provenance, activity, and reconcile sheet | ~260 |
| `frontend/src/components/admin/hooks/HookHealthCard.vue` | Dashboard summary and console link | ~120 |
| `frontend/src/views/admin/mud/HookControlView.vue` | Complete console composition | ~320 |
| `frontend/src/components/admin/hooks/__tests__/*.spec.ts` | State, toggle, sheet, and panel unit tests | ~600 |
| `frontend/src/views/admin/mud/__tests__/HookControlView.spec.ts` | Console integration/deep-link tests | ~350 |

### Files To Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `backend/src/hooks/hookSettingsService.ts` | Website provenance and activity in status rows | ~90 |
| `backend/src/hooks/mudHookStateClient.ts` | Report receipt metadata | ~40 |
| `backend/src/routes/hooks.ts` | Rich status/transport response and reconcile endpoint | ~120 |
| `backend/src/services/mudAuctionClient.ts` | Set ack dispatch and TLS peer metadata | ~80 |
| `backend/src/services/mudTransportPolicy.ts` | Shared safe URL parsing/status policy | ~80 |
| Hook owner services | Record activity at accepted delivery/application boundaries | ~80 total |
| `/home/aiwithapex/projects/duris/src/world/properties.c` | Exact hook setter and durable write | ~140 |
| `/home/aiwithapex/projects/duris/src/core/prototypes.h` | Setter declaration | ~10 |
| `/home/aiwithapex/projects/duris/src/net/ws_handlers.c/.h` | Authenticated set command and ack | ~150 |
| `frontend/src/assets/main.css` | Warning semantic token | ~8 |
| `frontend/src/router/index.ts` | Hook Control route and permission | ~8 |
| `frontend/src/components/layout/AdminMenu.vue` | MUD Settings navigation item | ~16 |
| `frontend/src/views/admin/mud/MudDashboardView.vue` | Hook-health summary card | ~18 |
| `backend/.env.example` | Optional secret rotation timestamp documentation | ~4 |

---

## 7. Success Criteria

### Functional Requirements

- [x] Exactly 14 registry rows render: 13 toggleable hooks and terminal.
- [x] WEB, MUD, and effective state are independent and mismatch never renders
  as plain off.
- [x] ON, OFF, MISMATCH, UNKNOWN, UNAVAILABLE, N/A, and ALWAYS ON have text and
  distinct non-colour shapes.
- [x] Terminal has no switch and cannot reach either mutation endpoint.
- [x] A reconcile toggle remains pending until the server reports observed
  state; it never paints the requested value optimistically.
- [x] Enabling a known MUD-off hook prompts; disabling does not.
- [x] Disable partial failure leaves the website gate off and exposes actual
  MUD UNKNOWN/mismatch detail; enable partial failure leaves website off.
- [x] The detail sheet shows website actor/time, MUD source/report time, last
  activity, current resource health, and explicit set-both-ends actions.
- [x] `?hook=<registered-id>` opens the sheet; invalid ids are removed/ignored.
- [x] Transport displays safe scheme/host/cert/secret-age state and a persistent
  blocking alert for non-loopback plaintext.
- [x] MUD dashboard shows active/off/mismatch counts and links to Hook Control.
- [x] Five-second refresh changes only values/timestamp and causes no spinner or
  layout shift.

### Testing Requirements

- [x] Backend tests cover provenance, report receipt, transport sanitization,
  terminal rejection, permission checks, and every reconcile success/failure
  ordering branch.
- [x] MUD contract/build checks cover authentication-first validation,
  exact registered ids, boolean validation, persistence, state push, and ack.
- [x] Vitest covers all state shapes/labels, terminal immutability, pending
  behavior, enable confirmation, no disable confirmation, transport blocking,
  deep links, focus restoration, and dashboard summary.
- [x] Browser verification covers the real rendered console at desktop, tablet,
  and mobile widths, keyboard flow, filter, sheet, reconcile controls, and
  blocking transport state.
- [x] Current backend hook/security suites, full frontend tests, type-check,
  lint, and production build pass or have exact baseline-independent failures.

### Accessibility Requirements

- [x] WCAG 2.1 AA contrast in light and dark themes.
- [x] Every switch has an accessible name containing hook id and both-end state.
- [x] State changes announce through `aria-live=polite`; blocking transport uses
  `role=alert`.
- [x] Enter opens a focused row, Escape closes the Sheet, and focus returns to
  the originating row.
- [x] Touch targets are at least 44x44px on mobile and reduced motion preserves
  all information.

### Non-Functional Requirements

- [x] No secret, credential, URL userinfo, query, fragment, source payload, IP,
  or player data is returned or logged by the new surfaces.
- [x] Hook activity/status reads remain in-memory apart from the existing
  settings/provenance query.
- [x] No new transport or runtime dependency is introduced.
- [x] MUD setter runs on the game thread and does not add a property data race.
- [x] All files are ASCII with Unix LF line endings.

---

## 8. Implementation Notes

### Working Assumptions

- `manage_mud_properties` is the console permission because it is the existing
  operator capability named by the PRD. Existing overlord bypass remains.
- A hook with `mudPropertyKey: null` is intentionally website-only. Its MUD lamp
  says N/A; reconcile updates only the website gate.
- MUD provenance may be `unknown source`; the current schema-v1 state frame has
  no actor. Its receipt timestamp is truthful and must not be promoted into an
  invented MUD toggle time.
- Certificate expiry is observable only on a live WSS peer. Unknown is a valid
  readout; fabricating a configured expiry is not.
- Secret age is unknown unless deployment supplies
  `DURISWEB_SECRET_ROTATED_AT`.

### Conflict Resolutions

- The Session 06 stub names only frontend/backend, but the required two-end
  pending and reconcile behavior cannot be implemented truthfully with the
  current one-end API. The authenticated MUD command is included as a discovered
  cross-repo prerequisite and keeps the session `Package: null`.
- PRD_UX says AlertDialog is reserved for secret rotation, while the Session 06
  success criteria require a prompt when enabling into known MUD-off state. The
  session success criterion wins; use one narrowly scoped confirmation dialog
  and no rotation UI.
- Existing `PATCH /api/hooks/:id` changes the website independently. Preserve
  that contract and add an explicit reconcile endpoint rather than silently
  changing existing API semantics.
- The desktop concept is accepted for composition, density, typography, and
  mismatch anatomy. Any generated row grouping/copy drift loses to the registry
  and PRD_UX. The mobile concept is accepted only for responsive composition.

### Key Risks

- Persisting a MUD runtime property without a player context must preserve the
  atomic `.new` + rename behavior and log a sanitized service actor.
- A bridge response may arrive before or after the pushed state frame; backend
  reconcile must wait for observed state rather than assuming ack equals state.
- Row click and embedded Switch controls can double-trigger without explicit
  event isolation and keyboard tests.
- Polling can overwrite pending/error UI unless pending state is keyed by hook
  and merged with server rows rather than copied into them.
