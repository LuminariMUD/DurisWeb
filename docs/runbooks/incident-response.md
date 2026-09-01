# Incident Response

## Scope and Ownership

This runbook covers repository-verifiable diagnostics and safe containment. The
repository does not define an on-call roster, response-time policy, production
host, communications channel, or authority to deploy/restore. The incident
commander must supply those operational decisions.

Do not paste secrets, JWTs, webhook payloads, IP addresses, player data, full
paths, or database dumps into tickets or chat. Preserve timestamps, sanitized
hook ids/states, health output, commit ids, and process/container status.

## Initial Triage

1. Record the active DurisWeb and DurisMUD commits/branches independently.
2. Check dependency health:

   ```bash
   curl --fail-with-body http://127.0.0.1:3001/health
   docker compose -f podman-compose.yml ps
   ```

3. Check the frontend static health artifact on the actual deployed origin.
4. In the admin MUD dashboard, inspect hook summary, transport state, mismatch,
   unavailable reasons, and last observed activity. Do not infer enabled MUD
   state when the bridge reports unknown.
5. Decide whether the failure is browser/API, MySQL, Redis, bridge, flatfile,
   process-control, terminal, or MUD runtime. Controls differ by channel.

## Backend Health Is Degraded

**Symptoms:** `/health` returns 503 with `database: error` or `cache: error`.

1. Verify the selected environment and host/port without printing passwords.
2. Check the MySQL and Redis container/service status and recent service logs.
3. Restore connectivity or configuration, then repeat `/health`.
4. If MySQL connects but product endpoints fail with missing tables, stop. The
   health check does not certify schema or Knex-ledger correctness. Do not run
   bulk migrations or rewrite ledger rows during an incident without a tested,
   backup-first plan.

## Privileged MUD Bridge Is Unknown or Blocked

**Symptoms:** hooks with MUD owners show unknown/inactive; transport reports a
blocked URL, auth failure, disconnect, or stale report.

1. Confirm the MUD listener/reverse proxy is reachable from the backend host.
2. Keep plaintext `ws:` limited to loopback. For any remote host, require
   certificate-valid `wss:`; do not disable certificate verification.
3. Confirm both services have matching current secrets without displaying them.
4. During rotation, configure the previous key only for the bounded grace
   window. The backend retries it exactly once after current-key rejection.
5. After reconnect, wait for a fresh complete state frame. Never carry forward
   pre-disconnect state or reinterpret omitted ids as enabled.

## Hook Mismatch

**Symptoms:** website and MUD states disagree, or a reconcile action reports
partial completion.

1. Identify the exact registry id and whether it has a MUD-owned end.
2. For containment, disable the website end first.
3. Use the permissioned reconcile action. Disable remains website-first;
   enable sets/observes the MUD before opening the website gate.
4. Treat command acknowledgement as insufficient until observed state matches.
5. If the MUD cannot confirm, leave the website gate closed and investigate the
   bridge/property persistence path.
6. Terminal is not toggleable; its stronger permission/session controls are the
   recovery boundary.

## Flatfile Hook Is Unavailable

**Symptoms:** connection, flag, or zone parsing reports unavailable with a
sanitized reason and retry time.

1. Verify `MUD_DIR` is configured as an absolute path and the expected required
   roots are reachable by the backend service account.
2. Check ownership/mount status without copying source/player content into the
   incident record.
3. Do not bypass canonical containment, symlink, file-type, size, UTF-8, NUL,
   or complete-record validation.
4. Allow bounded recovery probes or restart only the responsible service after
   fixing the resource. Other hook channels should remain available.
5. Guild parsing is database-backed despite its compatibility-era hook name;
   MUD filesystem loss should not mark it unavailable.

## Suspected Session-Token Exposure

Raw refresh JWTs are currently stored in `web_sessions` (SEC-RT-1). A database
read exposure can therefore be an active session compromise.

1. Restrict database/backup access and preserve sanitized evidence.
2. Revoke affected/all web sessions using the existing authorized account/admin
   session paths or an operator-reviewed database procedure.
3. Rotate signing or integration credentials only when their exposure is
   confirmed; coordinate service restarts and user impact.
4. Track the event against
   `.spec_system/SECURITY-COMPLIANCE.md`; do not mark SEC-RT-1 resolved until
   digest-at-rest deployment is complete.

## Backup or Restore Incident

1. Do not restore over a shared database as an exploratory action.
2. Validate the exact archive and restore first into a disposable database.
3. Compare schema/object counts and required records before authorizing a target
   restore.
4. Record archive identity, source/target environment, operator, timestamps,
   and verification without including secrets or player rows.

## Recovery Verification

- Backend `/health` returns 200 and both checks are `ok`.
- Frontend health artifact and a representative page load succeed.
- Hook console reports a fresh bridge timestamp and expected effective states.
- Focused tests/contracts for the repaired boundary pass.
- The exact commits and any remaining deferred acceptance are recorded.

For release constraints and unresolved operations ownership, see
[Deployment](../deployment.md).
