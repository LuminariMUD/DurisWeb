# Website changelog publishing

Use this reference when reading, preparing, or publishing entries. Paths below
are relative to the DurisWeb repository root. Recheck the source when contracts
change; this is the existing application workflow, not a separate publisher.

## Source map

| Contract | Source |
| --- | --- |
| Routes, permissions, write validation, publish transition | `backend/src/routes/changelog.ts` |
| Persistence, ordering, visibility, read receipts, notifications | `backend/src/services/changelogService.ts` |
| Schema and field sizes | `backend/migrations/20260106000000_website_changelog.ts` |
| Server HTML sanitization | `backend/src/utils/contentParser.ts` |
| Admin editor | `frontend/src/views/admin/ChangelogAdminView.vue` |
| Browser API client and CSRF header | `frontend/src/services/api.ts` (`changelogApi`) |
| Public display and browser sanitization | `frontend/src/components/changelog/ChangelogList.vue`, `frontend/src/utils/sanitizeChangelogContent.ts` |
| Session/CSRF contract | `docs/api/README_api.md`, “Authentication and CSRF” |

## Read and compare

| Method and path | Behavior |
| --- | --- |
| `GET /api/changelog?page=1&limit=20` | `{ entries, total }`, published entries newest creation time first; anonymous/ordinary readers receive only `public` |
| `GET /api/changelog/admin?page=1&limit=20` | All categories and drafts; requires authentication and `manage_news` (or the existing overlord bypass) |
| `GET /api/changelog/:id` | Entry object; unpublished/admin entries require a reader at immortal level 57+, otherwise 404 |

Page through the admin list to check for a matching draft or published entry.
`manage_news` and the level-57 reader filter are different checks; use the admin
list to verify drafts if the editor account cannot fetch their detail route.
Read responses contain `id`, `version`, `title`, `content`, `category`, `createdBy`,
`createdAt`, `updatedAt`, `isPublished`, and sometimes `isRead`. Record the intended
row's ID and existing values before an update.

## Prepare a payload

Only these write fields are accepted; unknown fields are rejected:

| Field | Contract |
| --- | --- |
| `version` | String, at most 50 characters; required and nonblank on create |
| `title` | String, at most 255 characters; required and nonblank on create |
| `content` | Nonempty HTML string, at most 50,000 characters; required on create; sanitized by `processContentForWrite` |
| `category` | `"public"` or `"admin"`; defaults to `"public"` on create |
| `isPublished` | JSON boolean; defaults to `false` on create |

The authenticated session supplies the author. Do not send `id`, `createdBy`,
timestamps, read status, database snake_case names, or a release SHA field in the
payload. The schema uses MySQL `TEXT` for content: the sanitized UTF-8 payload must
also fit its 65,535-byte capacity, particularly for non-ASCII catch-up posts.
Prefer several readable entries to a giant post. Keep the release SHA in operator
evidence.

Illustrative draft shape only; replace the text/date with verified facts:

```json
{
  "version": "2026.10.15",
  "title": "A short title describing this release",
  "content": "<h3>Website updates</h3><ul><li><strong>Verified change.</strong> Explain the visitor's next step or benefit.</li></ul>",
  "category": "public",
  "isPublished": false
}
```

## Save through the existing application

Prefer the authenticated browser editor at `/admin/changelog`: choose **New
Entry** or edit the identified row, fill version/title/category/content, and
explicitly choose its published state. It uses TipTap rich text; pasting raw HTML
as visible text is not an HTML import. Inspect the editor's resulting content, or
send the reviewed HTML through the API when direct HTML entry is needed.

For API use, reuse an authorized live session on the canonical site origin. The
backend expects its HTTP-only `access_token` cookie and an active session, plus
the `csrf_token` cookie with the same value in `X-CSRF-Token` for mutations. Use
the browser's credentialed client or a protected session cookie jar; never print
cookies/tokens, put them in a tracked file or command line, mint a JWT, or create
a database session to bypass authentication. Keep JSON in a file or structured
request body instead of interpolating HTML into a shell command.

| Method and path | Successful result |
| --- | --- |
| `POST /api/changelog` | Creates one row; HTTP 201 with `{ "id": number }` |
| `PUT /api/changelog/:id` | Updates supplied fields only; HTTP 200 with `{ "success": true }`; requires at least one field |

Use an explicit publication flag. To publish an already-reviewed saved draft,
`PUT` its ID with `{ "isPublished": true }`. Saving a draft first is useful before
a deployment; it is not mandatory when verified deployed news is ready to publish.
Avoid accidental toggles, concurrent publishing, and unnecessary updates. There
is no atomic compare-and-swap or retry deduplication; if readback differs from the
reviewed row, reconcile it instead of overwriting another editor's work.

## Notifications and readback

Creating a published row or changing an unpublished row to published invokes
`notifyChangelogPublished`. Updating an already-published row does not send a
new publication notification or reset read receipts. Notifications run asynchronously
and errors are swallowed by the route, so a successful write proves neither full
delivery nor that a retry is needed. Do not call the notification service manually
as a routine verification step.

Publication writes are immediately available to fresh API requests. The public
component caches queries for five minutes and starts entries collapsed. Open a
fresh anonymous page (or refresh its query), find the saved ID/title, expand it,
and verify readable headings, lists, links, and complete content. Expansion while
logged in marks that entry read for the current account; use anonymous verification
for public entries to avoid changing an operator's unread history.

On a timeout or error, first fetch the admin list and, where permitted, the target
ID. If the expected row exists, verify it rather than creating it again. If the
result is still unknown, leave the operation unresolved. No automatic SQL fallback,
bulk deletion/recreation, read-receipt reset, or publication toggle is a recovery
mechanism for this workflow.
