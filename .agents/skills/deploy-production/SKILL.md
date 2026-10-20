---
name: deploy-production
description: >-
  Deploy DurisWeb production from the latest master: pull, rebuild both packages,
  run news-update, promote the release, and verify the public site is online.
  Use for routine website deployments with brief acceptance checks.
---

# Deploy Production

Complete a routine DurisWeb release promptly. A request to deploy with this skill
authorizes the website cutover and its Website Changelog publication; reuse that
authority without another confirmation. A request to create/edit this skill or
preview a deployment does not authorize a live deployment.

Use the six steps below. Do not invoke `$burnin`, add a ten-minute soak, run an
exhaustive feature/integration matrix, or repeat builds after unchanged inputs.
Reuse passing quality evidence for the exact candidate; if source repairs are
needed, follow the affected-package checks in `AGENTS.md` and rebuild what changed.
Keep existing deployment safeguards that apply to this release.

## 1. Identify production and retain recovery

Work in `/home/staging/durisweb` on `plesk.luminarimud.com` as `staging`.
Paths below are relative to that checkout. Read `AGENTS.md`, the build/cutover/
recovery sections in `docs/deployment.md`, and `docs/local-production.md`. Confirm
the environment and installed unit against the protected `.env`, `backend/.env`,
`frontend/.env`, and `deploy/deployment.env`; never print credentials or whole
environment files.

Production serves `duris.sbs` and `www.duris.sbs` through the required
`durisweb-cloudflared.service` tunnel to the website backend. Keep that ingress.
Inspect the loaded `durisweb-production.service`, its artifact paths and preflight
drop-in, and the configured render-output directory. Record the currently deployed
SHA, artifact hashes, service PID/restart counters, and a log timestamp.

Use a private release directory outside the checkout under
`~/.local/share/durisweb/releases/` (0700; sensitive files 0600). Preserve the
working backend/frontend artifacts, matching dependencies, configuration and unit
drop-in needed for rollback. Confirm the old preflight remains pinned to its
retained release before advancing source. Assess the deployment guide's legacy
temporary-copy preservation gate against the installed service; resolve any
applicable preservation requirement before stopping it.

## 2. Switch to master and pull

Inspect `git status --short` and the current branch. Require a clean checkout;
never discard, automatically stash, or commit someone else's changes to deploy.
Resolve a dirty checkout or conflicting worktree without changing live artifacts.

```bash
git switch master
git config --get branch.master.remote
git config --get branch.master.merge
```

Require the configured upstream to be the intended remote's `refs/heads/master`,
then run `git pull --ff-only <verified-remote> master` (replace the placeholder).
Require local `HEAD` to equal the fetched remote `master`; local-only commits or
divergence need resolution, not a forced reset, merge, or rebase on production.
Record the full candidate SHA and verify the checkout remains clean on `master`.
Re-read deployment instructions if the pull changed them.

## 3. Prepare news and rebuild

Run `$news-update` using
[the repository skill](/home/staging/durisweb/.agents/skills/news-update/SKILL.md).
Reconcile existing entries/drafts with the pinned candidate and prepare its news
now; publish only after step 5. Record a concrete no-news reason if already covered
or if there are no reader-visible changes.

Create a detached candidate worktree at the pinned SHA inside the private release
directory. Supply protected copies of the actual backend environment and effective
production frontend mode files; remove inherited application/Vite overrides so the
selected production inputs win. Never install or build over the running artifacts.
From the candidate root run:

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
pnpm --dir backend config:check
pnpm --dir frontend config:check
pnpm --dir backend build
pnpm --dir frontend build
```

Check the frontend's effective production endpoints separately: its config checker
validates development mode. Verify the built `index.html` and referenced assets.
From the candidate's `backend/`, with the selected production environment, run:

```bash
NODE_ENV=production node dist/scripts/productionPreflight.js --configuration
NODE_ENV=production node dist/scripts/productionPreflight.js --dependencies
```

The dependency check must accept the live schema and candidate migration bundle.
Do not run tests against production or automatically apply migrations to clear a
refusal. Pending migrations require explicit migration scope and the deployment
guide's backup/rehearsal procedure before continuing. Leave the current release
running on any unresolved build, preflight, or recovery failure.

## 4. Deploy the built release

Recheck that the checkout is clean on `master` at the candidate SHA; resolve any
concurrent source change before cutover. Record the cutover timestamp.
Pause the watchdog using its existing `pause` file;
do not disable its timer. Stop only the website application after the applicable
preservation gate is satisfied. Promote the complete staged `backend/dist`,
`frontend/dist`, and matching backend dependencies into the installed paths, using
directory swaps while the application is stopped. Retain the previous trees.

Update the release-preflight drop-in to the retained candidate's compiled checks
and matching migration bundle; preserve both configuration and dependency checks.
Reload the user service manager and inspect the resulting commands. Start the
website with `systemctl --user start durisweb-production.service`. Keep the
Cloudflare tunnel running; start that exact tunnel if it is inactive.

Do not restart the MUD, shared database, or Redis for an application release.
Changes to infrastructure or schema need their specific procedure and authority.
Retain the candidate directory while the unit's preflight pin references it.

## 5. Confirm we are online

Allow bounded startup retries (at most 60 seconds), then require:

- Application, private cache, and tunnel active with successful service results
  and no unexpected restart increase. Reuse
  `deploy/scripts/recover-deployment --accept-only <verified-render-output>` for
  its installed group/local/public checks; this command does not deploy artifacts.
- Structured `/health` success locally and through **both** public hostnames:
  `status == "ok"`, `service == "durisweb-backend"`, and database/cache checks `ok`.
  Use the configured local port, follow intended HTTPS canonical redirects, and
  bound request timeouts. An HTML page or HTTP 200 alone is insufficient.
- Public `/api/ping`, `/api/site-config`, the homepage, and a newly built JS/CSS
  asset work. Match served artifact hashes to the candidate and verify the running
  backend's path/PID/start time and deployed hashes identify this release.
- A fresh browser visit renders the homepage without a fatal load error. Check
  the release's affected page when relevant; review logs since cutover for new
  startup/runtime failures, keeping sensitive details out of the report.

Repeat health and service-state checks once after roughly 20–30 seconds. This is
the routine stability check. On failure, restore the retained compatible artifacts,
dependencies and preflight pin, reload/start the website, and verify public health.
Do not loop through redeployments or report a rollback as a successful release.
Remove the watchdog pause after successful acceptance or verified recovery; report
an unresolved recovery immediately.

## 6. Publish news and finish

Complete `$news-update`: publish through `/admin/changelog` or its authenticated
API, then verify saved fields, the public API, and the expanded entry on a fresh
`/news?tab=changelog` browser page. Read back an ambiguous write before retrying.
A draft alone is incomplete unless a verified no-news reason applies.

Confirm the deployed identity still matches the reviewed SHA and the source
checkout remains on `master`. Record the new pin/recovery location in the local
operator reference. Report the commit, build/preflight results, public URLs and
online checks, news entry IDs or no-news reason, and any omitted checks/blockers.
Keep the report brief; retain detailed commands/results privately. Call the
deployment complete only when cutover, online checks, and news reconciliation
have all succeeded.
