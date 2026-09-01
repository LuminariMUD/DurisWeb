# durisweb - UX Requirements Document

**Companion to**: [PRD.md](PRD.md)
**Created**: 2026-09-01

> **Derivation note**: Generated autonomously from PRD.md, the existing frontend
> (Vue 3 + shadcn-vue "new-york", slate base, oklch tokens, lucide icons), and
> the current admin route tree. No design assets were supplied. Every decision
> below is opinionated and overridable -- Section 13 lists only what genuinely
> needs a human answer.

---

## 1. Design Brief

Scope note: this document covers the **operator surface** introduced by Phase 00
- the hook control console. It does not restyle the existing public site.

### Emotional Targets

**Calm authority + immediate legibility + earned confidence.**

The operator arrives at this screen when something is wrong, often at an
unsociable hour, and has to decide whether to cut a hook. The interface must
never add urgency of its own. State is unambiguous at a glance; destructive
actions are deliberate but never obstructive; nothing animates for decoration.
Confidence is earned by showing the operator what is true on *both* sides, not
by reassuring copy.

### Aesthetic Identity

- **Reference domain**: mission-control and aerospace ground stations - dense
  status boards where every element is a readout, colour means one thing only,
  and there is no ornament competing with signal.
- **Era / movement**: Swiss International - strict grid, typographic hierarchy
  over decoration, generous alignment discipline.
- **Material metaphor**: an anodized aluminium instrument panel. Matte, cool,
  finely machined. Toggles feel like sealed rocker switches with real detent -
  they move once, decisively, and report back.

*The intersection: a Swiss-gridded instrument panel. Dense but never cluttered,
monochrome until something needs attention.*

### Signature Moment

**The dual-state hook row.** Each hook shows two independent state lamps - WEB
and MUD - joined by a connector that renders the *effective* state between them.
When both ends agree and are on, the connector is a solid continuous rule and
the row is quiet. When the ends disagree, the connector breaks into a visible
gap with a diagonal hazard hatch, the row gains an amber left border, and a
`MISMATCH` badge appears. Disagreement is impossible to scan past. One glance
down the column tells the operator the entire integration's health.

This is the screenshot: a column of clean continuous rules with one broken link
in it.

### Micro-Narrative

- **Arrival**: a summary strip reads `N of M hooks active` with counts for off
  and mismatched. If everything is nominal the strip is monochrome.
- **Orientation**: hooks are grouped by channel (bridge, pub/sub, ingestion,
  process control, terminal) with the channel's transport state as a group
  header, so the operator sees whether a whole channel is down before reading
  rows.
- **Engagement**: the operator scans for hazard hatching, opens a row's detail
  drawer, reads last-activity and last-toggle provenance.
- **Action**: flips a toggle. The switch enters a pending state until both ends
  confirm; it does not lie about success.
- **Resolution**: the row settles into its new state, a toast confirms, and the
  summary strip recounts.

---

## 2. User Flows

### Flow 1: Disable a misbehaving hook during an incident

**Trigger**: Operator observes bad data or excessive load from one hook.
**Goal**: Stop that hook without affecting any other.

```
[Admin nav] --> [Hook Control] --> [scan rows] --> [flip WEB toggle off]
                                                          |
                                                          v
                                              [pending: awaiting both ends]
                                                          |
                                    +---------------------+---------------------+
                                    v                                           v
                            [confirmed OFF within 10s]                 [timeout / no ack]
                                    |                                           |
                                    v                                           v
                            [row settles, toast]              [toggle reverts, error banner,
                                                               "MUD did not acknowledge"]
```

**Happy path**: Toggle flips, pending state resolves inside the 10s propagation
budget, row shows OFF, toast confirms, summary recounts.
**Error states**: MUD unreachable - the toggle still applies web-side (fail
closed still stops delivery) but the row shows `MUD: UNKNOWN` and a mismatch
warning rather than claiming success.

### Flow 2: Diagnose a mismatch

**Trigger**: Operator sees hazard hatching on a row.
**Goal**: Understand which end disabled it and why.

```
[Hook Control] --> [click mismatched row] --> [Detail drawer]
                                                    |
                                                    v
                              [WEB state + who/when]  [MUD state + who/when]
                                                    |
                                                    v
                                        [reconcile: set both ends]
```

**Happy path**: Drawer shows both ends' state with provenance; operator picks
the intended state and applies it to both in one action.
**Error states**: MUD provenance unavailable (older MUD build) - show
`unknown source` rather than a fabricated actor.

### Flow 3: Verify transport security posture

**Trigger**: Pre-deployment check, or after moving the MUD to another host.
**Goal**: Confirm the bridge is authenticated and encrypted.

```
[Hook Control] --> [Transport panel]
                          |
                          v
        [scheme: ws/wss] [host: loopback?] [cert: valid/expiry] [secret: age]
                          |
              +-----------+-----------+
              v                       v
      [all nominal: quiet]   [non-loopback + ws: blocking error]
```

**Happy path**: Panel reads `wss`, certificate valid with expiry date, secret
age within policy - all monochrome.
**Error states**: Non-loopback host over plaintext `ws:` is a hard error, not a
warning - the panel states the connection is refused and why.

### Flow 4: Rotate the bridge secret

**Trigger**: Scheduled rotation or suspected compromise.
**Goal**: Rotate with zero dropped events.

```
[Transport panel] --> [Rotate secret] --> [confirm dialog: typed confirmation]
                                                    |
                                                    v
                              [grace window active: both secrets accepted]
                                                    |
                                                    v
                              [countdown + live event counter (proves no drops)]
                                                    |
                                                    v
                                          [old secret retired]
```

**Happy path**: Grace window opens, the event counter keeps incrementing
throughout, old secret retires cleanly.
**Error states**: Events stop during the window - surface immediately with an
abort action that restores the previous secret.

---

## 3. Screen Inventory

| Screen | Route/Path | Purpose | Key Components |
|--------|------------|---------|----------------|
| Hook Control | `/admin/mud/hooks` | Registry of all hooks, dual state, toggles | HookGroup, HookRow, DualStateLamp, Switch, Badge, Input (filter) |
| Hook Detail | drawer on `/admin/mud/hooks` | Per-hook provenance, activity, reconcile | Sheet, DescriptionList, Badge, Button |
| Transport Panel | section of `/admin/mud/hooks` | Scheme, host, cert, secret age | Card, Badge, AlertDialog |
| Secret Rotation | dialog on Transport Panel | Guided rotation with live counter | AlertDialog, Progress, Input |
| MUD Dashboard (existing) | `/admin/mud/dashboard` | Gains a hook-health summary card | StatCard, Badge |

New surface is deliberately one screen plus a drawer. Hook control is a
console, not a section.

---

## 4. Navigation Structure

```
/admin
|-- dashboard
|-- mud
|   |-- dashboard        (gains hook-health card, links to hooks)
|   |-- hooks            <-- NEW: Hook Control console
|   |-- control
|   |-- properties
|   |-- backup
|   |-- timers
|   \-- level-cap
|-- connections
|-- web-settings
\-- audit-log
```

**Navigation pattern**: existing admin sidebar; `hooks` slots into the `mud`
group beside `control` and `properties`.
**Deep linking**: `/admin/mud/hooks?hook=<hook_id>` opens that row's drawer
directly, so an incident note or log line can link straight to a hook.

---

## 5. Interaction Patterns

### Forms

- Toggles are the primary control - no save button, no form submission.
- Validation is server-authoritative; the UI never predicts the outcome.
- The only text input is the filter field and the rotation confirmation.

### Toggles (the core control)

- Three visual states: `ON`, `OFF`, `PENDING`. Pending is not a spinner
  overlay - the switch itself dims and locks until both ends report.
- A toggle never optimistically shows success. It shows pending, then truth.
- Disabling needs no confirmation (fail closed is the safe direction).
  **Enabling** a hook that the MUD reports as off requires confirmation, since
  it will produce a mismatch.
- The terminal hook toggle carries an explicit warning: it is the recovery path
  when other hooks fail.

### Modals/Dialogs

- `AlertDialog` for secret rotation only, with typed confirmation.
- Everything else is inline or in the detail `Sheet`.
- No modal ever blocks reading current hook state.

### Loading States

- First load: `Skeleton` rows matching final row height - no layout shift.
- Polling refresh: never a spinner. A small timestamp updates in place.
- MUD state unreachable: rows render with `MUD: UNKNOWN`, never blank or
  assumed-off.

### Notifications

- `sonner` toast for completed toggle actions (already in the UI kit).
- Inline row-level error for a failed toggle - stays attached to its row.
- Persistent banner only for the blocking transport error (non-loopback + `ws:`).

---

## 6. Motion and Animation Strategy

### Philosophy

Motion exists only to show state changing. Nothing moves to entertain, and
nothing moves that the operator did not cause.

### Entrance Choreography

- Page load: rows fade in over 120ms with no stagger. Staggered reveals imply
  sequence where none exists and slow down scanning.
- No scroll reveals. The whole console is meant to be read at once.

### Interaction Feedback

- Hover: row background shifts to `bg-muted/50` - matches the existing
  `PropertiesView` precedent.
- Toggle: the switch travels 150ms `cubic-bezier(0.4, 0, 0.2, 1)`, then the
  state lamp cross-fades once confirmed. The two are deliberately separate: the
  switch responds to the operator, the lamp responds to the system.
- Mismatch appearance: the hazard hatch fades in over 200ms. It never pulses,
  flashes, or loops - a permanently animating alarm becomes invisible.
- Focus rings: 2px solid `--ring` with 2px offset, square to match the panel
  metaphor.

### Scroll-Driven Moments

None. Deliberate.

### Animation Constraints

- Max 3 elements animating per viewport region.
- No looping animation anywhere in this console.
- No linear easing; use the token above.
- `prefers-reduced-motion`: cross-fades become instant swaps; the hazard hatch
  renders statically. No information is motion-dependent.
- 60fps target; verify under 6x CPU throttle with all rows rendered.

---

## 7. Layout Philosophy

### Composition Approach

Symmetric, strictly gridded, dense. This is a readout, not an editorial page.
Every row shares one column grid so the eye can scan a single axis for state
without re-anchoring.

### Visual Hierarchy

- Scale contrast is **low** - deliberately. Hook ids, state lamps, and toggles
  sit at similar weight so no hook looks more important than another. Hierarchy
  comes from grouping and colour, not size.
- Negative space is tight within a group, generous between groups.
- Section rhythm is uniform. Varying density would imply varying significance.

### Section Transitions

Hard rules between channel groups - a 1px `--border` line and a group header.
No gradients, no overlap zones.

---

## 8. Responsive Strategy

| Breakpoint | Target | Layout Approach |
|------------|--------|-----------------|
| < 640px | Mobile | Rows become stacked cards: hook id, then WEB/MUD lamps side by side, then toggle full-width. The connector rule rotates to vertical between the two lamps. Filter collapses into a sheet. |
| 640-1024px | Tablet | Two-column grid of hook cards within each channel group; transport panel moves above the list. |
| > 1024px | Desktop | Full table console. Transport panel is a right-hand rail so posture stays visible while scanning rows. |

**Approach**: desktop-first. This is an operator tool used primarily at a
workstation, but incident response happens on a phone - mobile is a real target,
not an afterthought.
**Touch targets**: minimum 44x44px; toggles get extra horizontal padding so a
mis-tap cannot flip the wrong hook.

---

## 9. Accessibility

**Target**: WCAG 2.1 AA.

- Keyboard navigation: full tab order through rows; `Space` toggles a focused
  switch; `Enter` opens the detail drawer; `Esc` closes it. Focus returns to the
  originating row on close.
- Screen reader: each toggle is labelled with the hook id and both ends' state
  (`auction_new, web enabled, mud disabled, effective off, mismatch`). State
  changes announce via `aria-live="polite"`; the blocking transport error uses
  `role="alert"`.
- Colour contrast: AA minimum against both light and dark tokens. **State is
  never conveyed by colour alone** - ON/OFF/MISMATCH each carry a text label and
  a distinct shape (solid rule, hollow rule, hatched gap). This matters more
  here than typical, since the entire console is a status readout.
- Focus management: opening the drawer traps focus; closing restores it.
- Reduced motion: see Section 6 - no information lives in motion.

---

## 10. Design System

Inherits the existing shadcn-vue "new-york" + slate oklch token set in
`frontend/src/assets/main.css`. **No new base palette.** Additions only:

### Colour Architecture

- **Dominant surface (60%)**: `--background` / `--card`. Unchanged.
- **Secondary (25%)**: `--muted` for group headers and row hover.
- **Accent (10%)**: reserved for the *active* state lamp only. One meaning, one
  place. Nothing else in this console may use accent.
- **Signal (5%)**:
  - `ON` - `--primary` solid lamp
  - `OFF` - `--muted-foreground` hollow lamp
  - `MISMATCH` - amber (new token `--warning`, required: slate set has no amber)
  - `ERROR` / blocked transport - `--destructive`
  - `UNKNOWN` - `--muted-foreground` with a dotted outline

Palette character: **cool, synthetic, quiet.** It goes loud only on mismatch.

### Typography

- **Display**: none. This console has no display type; headings are body font at
  increased weight. Introducing a display face would fight the instrument-panel
  metaphor.
- **Body**: existing system stack.
- **Monospace**: `ui-monospace` (already defined at `main.css:346`) for hook ids,
  timestamps, secret ages, and cert expiry. Every machine-readable value is
  monospace so columns align on the character grid.
- **Scale ratio**: 1.25 minor third. Body minimum 16px in dense table context
  (the console is desktop-primary and information-dense; 18px would force
  horizontal compromise), 18px for prose outside tables.

### Spacing Scale

Tailwind default: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px. Row vertical padding
`12px`, group gap `32px`.

### Elevation and Depth

**Flat with sharp borders.** 1px `--border` rules, no shadows, no blur, no
frosted glass. Depth appears exactly twice: the detail `Sheet` and the rotation
`AlertDialog`. An instrument panel has no drop shadows.

### Texture and Atmosphere

None. No gradients, no noise, no patterns. The only non-flat fill in the entire
console is the diagonal hazard hatch on a mismatch connector - which is why it
reads instantly.

---

## 11. Component Patterns

| Component | Used In | Behavior |
|-----------|---------|----------|
| `HookRow` | Hook Control | One hook: id, dual lamps, connector, toggle, last activity. Click opens drawer. |
| `DualStateLamp` | HookRow, MUD Dashboard card | Renders WEB + MUD + effective connector. Owns the hazard-hatch mismatch treatment. |
| `HookGroup` | Hook Control | Channel header with transport state, wrapping its rows. |
| `HookToggle` | HookRow, Hook Detail | Switch with ON/OFF/PENDING; confirms on enable-into-mismatch. |
| `TransportPanel` | Hook Control | Scheme, host, cert expiry, secret age. Blocking error state. |
| `SecretRotationDialog` | Transport Panel | Guided rotation, live event counter, abort. |
| `HookDetailSheet` | Hook Control | Provenance for both ends, activity history, reconcile action. |
| `HookHealthCard` | MUD Dashboard | Summary counts; links into the console. Reuses `StatCard`. |

All build on existing kit: `switch`, `badge`, `table`, `sheet`, `alert-dialog`,
`skeleton`, `tooltip`, `sonner`, `card`. **No new dependencies.**

---

## 12. Anti-Patterns to Avoid

- **No optimistic toggles.** Never show a hook as off before both ends confirm.
  The entire value of this console is that it does not lie about state.
- **No colour-only state.** Every state needs label + shape. A red/green console
  is unusable for a colour-blind operator at 3am.
- **No pulsing or looping alarm animation.** Constant motion becomes invisible
  and adds stress that contradicts "calm authority."
- **No decorative gradients, glass, or shadows.** They break the anodized-panel
  metaphor and add visual noise to a readout.
- **No dashboard-style charts on this screen.** Throughput charting is a
  deferred requirement; adding sparklines here dilutes the scan.
- **No confirmation dialog on disable.** Fail closed is the safe direction;
  friction there costs time during an incident.
- **No hiding a hook because its state is unknown.** Absent data renders as
  `UNKNOWN`, never as absent or assumed-off.

---

## 13. Resolved UX Decisions

No open UX questions remain.

- **Mismatch colour**: add an amber `--warning` token to the shared palette in
  both light and dark blocks. Reusing `--destructive` would conflate
  "misconfigured" with "broken" - the operator's first triage question is
  exactly which of those it is. Amber is used only for MISMATCH; nothing else
  in the console may claim it.
- **Vocabulary source** (was Q2): the MUD repository has an operations runbook
  and integration reference. Hook ids, labels, and console copy follow their
  vocabulary: `docs/operations/RUNBOOK.md`,
  `docs/operations/incident-response.md`,
  `docs/operations/CONFIGURATION.md`, and `docs/reference/api/durisweb.md`.
  Concretely: call the MUD port `DURIS_WEBSOCKET_PORT` (not `MUD_WS_PORT`), and
  name streams after the events that reference documents - auction,
  player-presence, shutdown, wholist.
- **Terminal row** (was Q2 in the earlier draft): resolved by PRD Resolved
  Decision 4. Not toggleable; renders with an `ALWAYS ON` badge and no switch.
- **MUD toggles editable from the console** (was Q3): yes. They are
  `duris.properties` keys and durisweb already edits properties via
  `manage_mud_properties` and `PropertyEditDialog.vue`.
- **`MUD: UNAVAILABLE` state**: required for flatfile hooks under split-host,
  visually distinct from both OFF and UNKNOWN.
- **Row count**: the console lists 13 toggleable hooks plus the always-on
  terminal row - `wholist` and `admin_delete_character` were added late (PRD
  Resolved Decision 9).
