# Deployment

## Current Status

The repository has build scripts, reference nginx/PM2/systemd files, local
health endpoints, and a GitHub Actions code-quality workflow. It does not have a
verified staging/production platform, automated release workflow, committed
rollback procedure, production health-probe target, or named release owner.

Do not treat this page as authorization to deploy. The operator must reconcile
the target host, paths, users, secrets, database baseline, MUD branch, reverse
proxy, and rollback point.

## Build Artifacts

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend build
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
```

- Backend artifact: `backend/dist/`, started with `pnpm --dir backend start`.
- Frontend artifact: `frontend/dist/`, served as static SPA content.
- Frontend health artifact: `frontend/dist/health` after a production build.

Run the full matrix in [Development](development.md) before packaging. Current
CI does not run tests or builds.

## CI/CD Pipeline

`.github/workflows/quality.yml` runs a Node 22 and pnpm 10.15.1 matrix for
`backend` and `frontend` on relevant pushes and pull requests. Each job uses a
frozen lockfile and checks formatting, lint, and types. The workflow requests
read-only repository contents permission and cancels superseded runs.

No build/test, dependency-security, integration, artifact publishing, release,
or deployment workflow is configured.

## Reference Deployment Files

| File | Verified Content | Limitation |
|------|------------------|------------|
| `.spec_system/scripts/ecosystem.config.js` | PM2 starts `backend/dist/index.js` and restarts on failure/memory limit | Hardcoded user paths; no verified active host |
| `backend/durisweb-backend.service` | systemd delegates backend lifecycle to PM2 | Hardcoded `/home/resakse` paths and tool locations |
| `frontend/durisweb-frontend.service` | systemd serves `frontend/dist` with `npx serve` | Hardcoded user/path; runtime `serve` dependency is not declared in frontend manifest |
| `nginx-durisweb-initial.conf` | HTTP bootstrap and API/WebSocket proxy | Ko-fi intentionally refused before TLS; path/user must be reconciled |
| `nginx-durisweb.conf` | HTTPS static SPA plus API, browser WebSocket, and Ko-fi proxy | Uses `/home/duris`, conflicting with service files; certificate paths are host-specific |

These inconsistencies are documentation evidence for an unresolved operational
decision, not instructions to edit production in place.

## Health and Readiness

- Backend: `GET /health`; 200 only when MySQL and Redis both answer, otherwise
  503 with per-dependency status.
- Frontend: static `GET /health` after build.
- Local checks passed during the infrastructure audit. Configure real platform
  probes only after the hosting target and URLs are selected.
- Backend health does not validate the historical migration ledger or every MUD
  feature table.

## MUD Bridge Release Gate

The MUD feature branch is pushed and intentionally unmerged. Before a networked
production bridge:

1. The maintainer must explicitly land/deploy the intended DurisMUD commit.
2. The operator must configure an HTTPS/WSS reverse proxy on the MUD host while
   leaving the MUD listener loopback-only.
3. DurisWeb must use `wss:` and validate the certificate; never change
   `rejectUnauthorized` or permit remote plaintext to unblock release.
4. If rotating keys, deploy current plus previous keys according to
   `.spec_system/PRD/MUD_HANDOFF.md`, verify authentication, then remove the
   previous key.

## Database and Backup Gate

The schema and Knex ledger are not clean-room reproducible. A release that
changes schema requires an operator-approved backup, an explicit migration
baseline, disposable rehearsal, and verified rollback. Phase transition audit
proved the backup service can create/test/restore an archive using a disposable
database and fixed its non-default port handling; it did not authorize a
production restore.

## Release and Rollback Gaps

- Release authority, maintenance window, artifact destination, and production
  host are external decisions.
- A commit/tag promotion convention is not defined.
- Database and application rollback steps are not committed.
- `LICENSE` and `CODEOWNERS` are absent and require legal/organizational owners.

Until those decisions exist, releases and rollbacks remain maintainer/operator
procedures outside repository automation.
