# Security & Compliance Report

**Session ID**: `phase00-session03-website-toggle-store`
**Package**: backend
**Reviewed**: 2026-09-01
**Result**: PASS

---

## Scope

**Files reviewed** (session deliverables only):
- `backend/src/hooks/hookResolution.ts`
- `backend/src/hooks/hookSettingsService.ts`
- `backend/src/hooks/hookGate.ts`
- `backend/src/routes/hooks.ts`
- `backend/migrations/20260901000000_hook_toggles.ts`
- `backend/migrations/016a_bootstrap_admin_permission_tables.ts`
- `backend/migrations/20251115000000_admin_permissions_system.ts` (guards only)

---

## Security Assessment

### Overall: PASS

| Category | Status | Severity | Details |
|----------|--------|----------|---------|
| Injection | PASS | -- | Every query is parameterized. Hook ids reaching a query are narrowed by `isHookId` against the registry first, so no caller-supplied string is interpolated. |
| Hardcoded Secrets | PASS | -- | None. Database access uses the existing pool and env configuration. |
| Sensitive Data Exposure | PASS | -- | Error responses are fixed strings; internal errors are logged, never returned. The audit row records the actor and hook id, deliberately not an IP. |
| Insecure Dependencies | PASS | -- | No dependencies added. |
| Security Misconfiguration | PASS | -- | Both endpoints require authentication and `manage_settings`. |
| Authorization | PASS | -- | Enforced at the route, the boundary closest to the resource. The write path also re-derives the actor from the session rather than trusting the body. |
| Database Security | PASS | -- | Parameterized throughout; the migration is additive with a working `down` limited to its own keys. |

### Findings

#### SEC-3-1: Fail-open on an unreadable settings table (accepted, deliberate)

- **Severity**: Low, accepted
- **File**: `backend/src/hooks/hookSettingsService.ts`
- **Description**: If reading `web_settings` throws, every hook resolves to
  *enabled* on the website side rather than disabled.
- **Rationale**: fail-closed governs a known disagreement between the two ends.
  An unreadable settings table is absence of knowledge. Defaulting it closed
  would let a single transient database error sever every MUD integration
  simultaneously - the "fail-closed lockout" risk named in PRD.md. The failure
  is logged at error level, and the MUD's own gate still applies independently.
- **Status**: Accepted by design, documented in code and in
  implementation-notes.md.

#### SEC-3-2: Audit write failure does not roll back the toggle

- **Severity**: Low
- **File**: `backend/src/hooks/hookSettingsService.ts`
- **Description**: If the toggle write succeeds and the audit insert then fails,
  the change stands without an audit record. The failure is logged at error
  level rather than swallowed.
- **Remediation**: wrapping both writes in one transaction would make them
  atomic. Not done here because losing the *toggle* during an incident is worse
  than losing its audit row, and the toggle is the safety control.
- **Status**: Open, accepted for now, worth revisiting in Session 07.

---

## GDPR Compliance Assessment

### Overall: PASS

| Category | Status | Details |
|----------|--------|---------|
| Data Collection & Purpose | PASS | The only personal data touched is the acting account name, recorded for accountability on an administrative action - the existing purpose of `admin_action_log` |
| Consent Mechanism | N/A | Administrative action by an authenticated operator |
| Data Minimization | PASS | The audit row stores the account name and hook id only. The table has an `ip_address` column and this session deliberately leaves it null, per the standing PII-in-logs finding |
| Right to Erasure | N/A | No new personal data store introduced |
| PII in Logs | PASS | Log statements name hook ids and setting keys. No account name, address, or token is logged |
| Third-Party Data Transfers | PASS | Improves them: this is the control surface that lets an operator stop a hook sending player data to durisweb |

### Personal Data Inventory

| Data Element | Source | Storage | Purpose | Deletion Path |
|-------------|--------|---------|---------|---------------|
| Acting account name | Authenticated session | `admin_action_log.account_name`, `web_settings.updated_by` | Accountability for an administrative change | Inherits the existing gap for `admin_action_log` - see the standing GDPR findings |

### Findings

No new GDPR findings. The erasure gap for `admin_action_log` is pre-existing and
already tracked.

---

## Environment Note

The test database was built by cloning the MUD schema **structure only**. Row
data was deliberately not copied, because the MUD database contains real player
accounts, emails, and IP addresses. The one fixture account is synthetic. This
procedure is documented in `dev-database.md` so it is not re-derived unsafely.

---

## Recommendations

- Session 07: consider making the toggle and its audit row atomic (SEC-3-2).
- SEC-TZ-1, found during this session's environment work, is recorded in
  SECURITY-COMPLIANCE.md as a High finding and needs an owner.

---

## Sign-Off

- **Result**: PASS
- **Reviewed by**: AI validation (`/validate`)
- **Date**: 2026-09-01
