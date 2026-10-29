---
name: news-update
description: >-
  Maintain DurisWeb's Website Changelog and Mudlet Client Changelog when updating
  or deploying the website, preparing release notes, or catching up announcements.
  Reconcile deployed website changes through the changelog admin UI/API and refresh
  client history from LuminariMUD/duris-client. Not the separate MUD News stream.
---

# News Update

Keep **News → Website Changelog** (`/news?tab=changelog`) and
**News → Mudlet Client** (`/news?tab=client`) accurate and complete.
A normal `$news-update` request includes publishing missing website news for the
verified current deployment and checking the client history for missing changes.
Honor client-only, website-only, and draft/review-only scope.
When implementing a future release, prepare its entry; publish after that release
passes deployment acceptance. Reuse publication authority already given in the
session, including an authorized website deployment's changelog step.

Paths in backticks are relative to this repository unless stated otherwise.
Read `AGENTS.md`. Before website publication or deployment, also read
`docs/deployment.md` and confirm the intended environment using
the checkout's `.env` `ENVIRONMENT`, the effective backend `NODE_ENV`/`SITE_URL`,
and the selected release's deployment configuration. Inspect only needed values;
never print whole environment files or credentials. The directory name `staging`
and a loopback API address do not make this a staging system. Resolve conflicting
target evidence before a remote write, while continuing independent preparation.

Website news uses `website_changelog`, served by `/api/changelog` and edited
at `/admin/changelog`. Editing Markdown, building the website, or importing the
MUD's `lib/information/news` does not update it. Do not touch `mud_info`,
`/admin/news`, `/api/news`, or the separate MUD repository for this task.

## Refresh the Mudlet client history

Read [the client history reference](references/client-changelog.md) when checking
or updating the client tab. Its source is the separate public
`LuminariMUD/duris-client` repository, not the browser client or MUD server.
The tab uses reviewed frontend content, not `website_changelog`; it needs a
website release to become live. Fetch the complete pinned changelog and published
release inventory with `scripts/sync_client_changelog.py`, review the snapshot
diff, and account for client changes since its previous `sourceSha`. A version
heading alone does not establish a published package. Keep all historical notes
and their recorded dates, and exclude unreleased claims from release announcements.

For a PR-only request, include the refreshed snapshot and any website-news draft;
do not publish future website behavior to the live changelog. For a standalone
news update, report any client snapshot update that still needs deployment rather
than treating a local content edit as published. The website workflow below
applies to database-backed website entries; skip it for a client-only request.

## Establish the release and coverage

Read the existing entries and drafts using [the publishing reference](references/publishing.md).
Paginate until the relevant history is covered; use `total` to detect incomplete
reads. A public list cannot prove that a matching unpublished draft is absent.
Record entry IDs, versions, and substantive coverage before choosing create,
update, or no change.

Pin the full website release SHA and establish that it is actually deployed from
the release evidence, backend runtime, and served frontend asset identity described
in `docs/deployment.md`. Source `HEAD`, a GitHub merge, a build, and `/health` alone
do not prove deployment. An authorized upcoming deployment may supply the pinned
candidate for drafting, but publication waits for successful cutover and acceptance.
If artifacts include local edits, account for those exact deployed diffs separately;
never describe an arbitrary dirty working tree as shipped.

Find the last substantive coverage boundary by matching existing bullets to source
history and prior release evidence. Entry dates and version labels are clues, not
commit markers. Recheck the overlap for omissions and later changes on the same
day. If the baseline is uncertain, widen the review and state the uncertainty.
Discover the actual remote/branch instead of assuming a repository owner or branch.
Use GitHub/PR context when helpful, but cap published claims at the deployed release,
even when the remote branch has newer commits.

For a verified ancestral baseline and release:

```sh
git status --short
git rev-parse HEAD
git merge-base --is-ancestor BASE_SHA RELEASE_SHA
git rev-list --count BASE_SHA..RELEASE_SHA
git log --reverse --format='%H %cI %s' BASE_SHA..RELEASE_SHA
git diff --stat BASE_SHA RELEASE_SHA
```

Substitute the verified full SHAs. If ancestry fails (for example, a rollback),
compare the actual release trees and histories explicitly. Review patches and
merged branch changes, including merge resolutions, squash merges, follow-up fixes
and reversions. A date filter, first-parent log, latest-N list, or PR title alone
cannot account for the release.

Keep a temporary inventory mapping every commit and distinct website effect to:
new/corrected entry; already covered (entry ID and bullet); superseded/reverted;
no reader-visible effect (with a reason); or unresolved evidence. Group commits
into readable topics without dropping independent changes. Reconcile the reviewed
commit count with `git rev-list --count` and account separately for the overlap.
Inspect the pinned implementation and active settings for each claim: disabled
features, proposed issues, and changes only present in another environment are
not available features.

For a catch-up, split large periods into useful release/topic entries and preserve
dated history. Do not manufacture exact release dates or silently rewrite past
rules. If everything is already covered, leave entries and dates unchanged. If
the release only changes tests, internal refactors, or contributor instructions,
record a concrete no-news reason in the operator report instead of inventing a
public improvement.

## Write for website visitors

Explain what changed, who benefits or is affected, where to find it, and any
necessary action or limitation. Cover fixes and restrictions as well as features.
Use familiar page and button names; group by the experience, such as Play, Wiki,
Forums, account access, or phone layouts. A lively title is welcome when the facts
support it. Avoid implementation jargon, commit lists, unsupported speed/security
promises, internal paths, credentials, and player data.

Use the current entries as the style model. Write short, readable HTML with
paragraphs, topic headings, and lists, for example `<h3>Wiki</h3>` followed by
`<ul><li><strong>Practical change.</strong> Where to find it.</li></ul>`. The
renderer does not convert Markdown or literal MUD color tokens. Prefer simple
markup that survives both sanitizers; escape text/attribute values and use verified
links. Keep deployment status and technical coverage evidence in the operator
report rather than the entry.

Use `category: "public"` for visitor-facing website changes. Separate administrator
features into an `admin` entry when appropriate; that visibility requires immortal
level 57+ in the reader API. Never place secrets in either category. Follow the
existing version convention (currently `YYYY.MM.DD`); distinguish separate releases
on the same day with a consistent suffix. Versions are labels, not unique keys.
Use the verified release date, or clearly label a catch-up period when it is unknown.
The UI sorts and dates entries by their database creation time, so an old draft
will not move to the top when published. Do not backdate rows through SQL.

## Reconcile, publish, and verify

Use [the publishing reference](references/publishing.md) for fields, authentication,
visibility, and notification behavior. Prepare the complete title, version,
category, HTML, and intended entry ID before a write. Preserve a recovery copy of
an existing entry and the reviewed payload outside the checkout in a private
directory (0700, files 0600), alongside release evidence when available.

Re-read matching entries immediately before writing to catch concurrent edits.
Reuse the matching draft; correct the matching published entry when the task is
a correction; create an entry for distinct newly deployed changes. Preserve
unrelated entries and read history. Avoid rewriting a published entry just to
announce a later release to people who already read it.

Publish through an authorized `/admin/changelog` session or its authenticated API.
Ordinary publication uses the application's built-in notification path; no separate
email, Discord, push, or MUD announcement is part of this skill. Publication needs
the intended target and existing session authority. If either access or authority
is missing, finish the local draft and coverage review first, then report the exact
missing prerequisite; do not bypass login/permissions with SQL or forged sessions.
Creating a database draft is also a write; a draft-only request can be satisfied
with a local payload without touching the database.

For a deployment, publish after its normal acceptance and stability checks pass.
For a standalone update, verify the described behavior is already live. No build,
migration, cache flush, or service restart is needed for changelog content. If the
deployment fails or is rolled back, retain the unpublished draft and reconcile its
claims with the resulting live release before proceeding.

Stop on a failed or ambiguous write and read back state before retrying. There is
no create idempotency key or unique version constraint: blindly repeating `POST`
can duplicate entries and notifications. Do not toggle published → unpublished →
published to retry notifications. A rollback after publication needs a correction
or authorized unpublish of the affected entry; it cannot retract notifications.

Verify the saved fields through the API/admin list and compare the persisted,
sanitized HTML with the intended content. For a public entry, fetch both the public
list and `/api/changelog/:id` without authentication on the actual public origin.
Then open `/news?tab=changelog` in a fresh anonymous browser, expand the entry, and
read the whole new section and its links. For admin content, verify with a permitted
reader and confirm it is absent from anonymous reads. A successful save, origin-only
probe, or SPA shell HTTP 200 does not prove public rendering. Refresh stale browser
queries before diagnosing a missing entry; do not republish to clear a cache.

Reconcile the final text against the full inventory in both directions, then
confirm the deployed identity still matches the reviewed release. Report the
target, baseline and release SHA (plus any deployed local diff), entry IDs/versions,
coverage or no-news reason, publication state, and API/browser verification results.
State missing checks and unresolved ranges explicitly. Do not call a draft
published, claim notification delivery from an HTTP success, or mark release news
complete while relevant changes remain unaccounted for.
