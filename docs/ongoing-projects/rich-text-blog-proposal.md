# Rich-text blog with search visibility and link previews

Prepared 2026-11-10. **Status: proposal; implementation and deployment have not started.**
Source inspected at checkout HEAD `8a1986b`; rechecked against source at `460edf8`
and anonymous production responses on 2026-11-10 (observations marked below).
This document proposes a website-owned blog with admin publishing, complete
article HTML in the initial response, social metadata, a sitemap, and RSS.

## Outcome and recommendation

An authorized editor can write, preview, publish, update, and unpublish articles
through `/admin/blog`. Visitors can browse `/blog` and read `/blog/:slug` without
an account. Publication takes effect without rebuilding or deploying the website.
Article text and metadata are available before JavaScript runs.

Reuse the installed Tiptap editor, existing authentication and `manage_news`
permission, DOMPurify, Vue components, and Express/MySQL infrastructure. Store
sanitized HTML as the content source of truth. A separate CMS service, Markdown
pipeline, and site-wide server-rendering migration are unnecessary for this scope.

The blog is a separate editorial stream. MUD News, Website Changelog, Mudlet
Client Changelog, and their notification behavior retain their existing roles.
No changes to the separate DurisMUD repository or game-owned tables are required.

## Existing implementation and reuse boundaries

- [Changelog administration](../../frontend/src/views/admin/ChangelogAdminView.vue)
  already combines Tiptap, validation, pagination, and publication controls.
  Reuse its patterns, not its release-specific version/category/read-tracking model.
- [TipTapEditor.vue](../../frontend/src/components/forum/editor/TipTapEditor.vue)
  accepts and emits HTML, supports rich formatting, and has optional mentions and
  widgets. Keep both disabled for blog articles.
- [Content processing](../../backend/src/utils/contentParser.ts) and
  [changelog display sanitization](../../frontend/src/utils/sanitizeChangelogContent.ts)
  provide existing safety boundaries. Blog preview, persistence, server HTML, and
  browser rendering must preserve the same supported content subset.
  `processContentForWrite` is the changelog's write boundary, but it is not a
  complete blog policy: it caps HTML at 50,000 characters, keeps `h1`, `div`,
  `class`, and the MUD-colour/column attributes, and accepts any `http(s)` or
  relative image `src`. Blog writes need their own explicit size bound plus the
  heading, HTTPS-image, and forum-image rules below, layered on that sanitizer.
- The editor's only feature switches are `enableMentions` and `enableWidgets`.
  File upload, carousel, columns, MUD colours, font size, and alignment are
  always shown, and the sanitizer strips `style`. Blog mode therefore needs a
  switch that hides whatever the blog contract does not keep.
- [The design guide](../DESIGN.md) and
  [main.css](../../frontend/src/assets/main.css) supply the eclipse palette,
  display typography, reading surfaces, and rich-text styling.
- [The server](../../backend/src/index.ts) serves the production Vue shell and
  adds crawler-specific metadata for PvP links. It does not currently render
  blog articles or provide a general article-rendering pipeline. The shell and
  its catch-all exist only when the backend runs in production mode, and the
  catch-all answers every unmatched path with the shell and HTTP 200: on
  2026-11-10 production returned the shell as `text/html` for both `/blog` and
  `/sitemap.xml`. In development the Vite server owns page routes and proxies
  only `/api` and `/maps`, so new document and XML handlers are unreachable
  there unless the proxy is extended or they are exercised against a build.
- [CSRF middleware](../../backend/src/middleware/csrf.ts) runs before every route
  and sets a `csrf_token` cookie on any response to a client without one. Only
  fingerprinted assets are registered ahead of it.
- [Frontend startup](../../frontend/src/main.ts) uses `createApp().mount()`, not
  SSR hydration, and installs `@unhead/vue`; views already set titles and
  descriptions with `useHead`. [The service worker configuration](../../frontend/vite.config.ts)
  currently falls back to `index.html` for non-API navigations and uses
  `registerType: 'prompt'`, so an installed client keeps its previous worker
  until the user accepts the update. These facts matter when adding readable
  initial HTML and publication freshness.
- The repository has no `robots.txt`. On 2026-11-10 production served one made
  only of a Cloudflare managed block (content signals and AI-crawler rules) with
  no `Sitemap` line; it is edge configuration, not something this checkout owns.

### Image handling needs an explicit boundary

The editor currently calls the forum upload endpoint. The
[forum image service](../../backend/src/services/postImageService.ts) stores
uploads as orphans and attaches them to forum posts or threads; unattached images
are eligible for cleanup. Saving a URL into a blog does not establish that ownership.

For the first version, support durable public HTTPS image URLs and existing
site-owned assets for inline images and the optional cover. Add the narrow editor
option needed to insert those URLs and disable file-upload, paste-upload, and
drop-upload paths in blog mode. Require meaningful alt text and keep the existing
forum editor behavior intact. Reject forum-managed image URLs in blog content so
an article cannot depend on another content type's deletion lifecycle. Do not
proxy or fetch arbitrary image URLs on the backend.

Direct file uploads are an optional follow-up: they require blog-owned attachment
records, configured storage, ownership validation, and retention/removal behavior.
An upload button is not sufficient. No new media library is included here.

## First-version behavior

### Authoring and publication

- `/admin/blog` lists drafts and published articles, with pagination and edit actions.
- The editor contains title, suggested slug, plain-text summary, public author
  label, optional cover URL/alt text, and rich-text body. Support headings, emphasis,
  lists, links, quotations, tables, code, and inline images.
- Reserve H1 for the article title; constrain or normalize body headings consistently.
  Keep blog formatting within the editor/sanitizer intersection. Unsupported
  widgets, arbitrary embeds, and raw executable HTML are not part of the contract.
- Save creates or updates a draft. Preview displays the server-normalized saved
  content in the article layout within the authenticated admin area. Indicate
  unsaved changes and protect against accidental navigation away.
- Publish is explicit and requires a valid title, summary, slug, author label,
  and nonempty sanitized body. Set the original publication timestamp on first
  publication; preserve it through subsequent edits and republication.
- Saving changes to an already published article updates it immediately, with
  an explicit **Save changes to published article** action. There is no separate
  draft revision of a live article in this version.
- Unpublish removes the article from all public surfaces. Keep its content in
  the admin area. Keep slugs immutable after first publication, including after
  unpublishing, so existing URLs and feed identifiers stay stable.
- Handle duplicate slugs and stale concurrent edits with actionable conflicts;
  do not silently overwrite another editor's intervening save.
- Reuse `manage_news` for all blog writes and draft reads. Apply authorization
  server-side as well as to the admin menu and route. A separate author/editor
  role hierarchy is outside this proposal.

### Public reading

- `/blog` shows newest published articles first, with title, summary, author,
  date, optional cover, and crawlable pagination links. Use publication date
  plus ID for stable ordering.
- `/blog/:slug` shows the full article, author, publication date, a meaningful
  updated date when applicable, and a link back to the listing.
- Add Blog to the desktop navigation and mobile More menu; update admin navigation
  and breadcrumbs. Use existing shared components, gutters, and semantic colors.
- Use a readable prose width, responsive images, accessible links, and bounded
  overflow for tables and code. Validate both long articles and narrow screens.
- Provide loading, empty, error/retry, and missing-article states. Draft and
  unpublished URLs behave as missing public articles even for logged-in editors;
  draft viewing stays in the authorized preview path.

## Data and HTTP contract

Add one website-owned `blog_posts` table through a new reversible Knex migration.
Proposed fields are `id`, unique `slug`, `title`, `summary`, `content_html`,
`author_label`, nullable `cover_image_url`/`cover_image_alt`, `is_published`,
nullable `published_at`, `created_by`, `updated_by`, `created_at`, `updated_at`,
and a `revision` integer for edit-conflict detection. Audit identity comes from
the authenticated session; public author labels are separately editable text.
Public projections exclude internal actor and draft fields.

Index the public publication/order query. Validate field lengths, slug syntax,
URLs, pagination, and content size at the API boundary. Store dates with an
explicit UTC contract and serialize them consistently. Use parameterized queries
and an atomic revision check for writes. Do not edit historical migrations or
the pinned historical schema baseline; follow the existing forward-migration path.

That path has concrete requirements. A post-cutoff migration needs a reviewed
`NAME.schema.json` beside it, recording the migration checksum and the table's
metadata hashes after `up` on both MySQL 8 and MariaDB 11, with `up` and `down`
rehearsed on both families; `pnpm --dir backend schema:check` enforces it. Size
`content_html` for the validated maximum in bytes: `TEXT` holds 65,535 bytes,
which multi-byte content can exceed well before a 50,000-character limit. Restrict
slugs to lowercase letters, digits, and hyphens so none can shadow `/blog/rss.xml`.
Because `created_by`/`updated_by` hold account identity, add `blog_posts` to the
[data lifecycle inventory](../privacy-data-lifecycle.md) with its retention and
subject-request handling, as `website_changelog` is recorded today.

Proposed routes, with specific routes registered before parameterized routes:

- `GET /api/blog/posts` and `GET /api/blog/posts/:slug`: published-only data.
- `GET /api/blog/admin/posts` and `GET /api/blog/admin/posts/:id`: authorized data.
- `POST /api/blog/admin/posts`: create a draft.
- `PUT /api/blog/admin/posts/:id`: save with expected revision and explicit
  publication state. Server-owned fields cannot be supplied by clients.
- `GET /blog` and `GET /blog/:slug`: complete public HTML documents.
- `GET /sitemap.xml`, `GET /blog/rss.xml`, and the sitemap reference in `robots.txt`.

The same blog service owns publication filtering for APIs, HTML, sitemap, and
RSS. A draft's title, body, image, or metadata must never leak through another
representation. Admin responses are private and not cacheable. Existing session,
CSRF, validation, and rate-limit patterns apply to the new routes.

## Search visibility and link previews: included in the release

### Initial HTML and Vue integration

Register blog HTML/XML handlers before the production SPA catch-all. For every
visitor, return a semantic article or listing with working links, readable body
content, stylesheet/font references, and page-specific metadata in the initial
response. Do not make this depend on crawler user-agent detection. Preserve the
existing PvP behavior without expanding this task into a general SEO rewrite.

Use a small blog document renderer with the built frontend template/assets and
the sanitized service result. The Vue routes consume that same public contract.
An escaped, inert bootstrap payload can let the initial Vue mount reuse the
already-fetched article. Account-specific state must not enter the public document.

The existing application replaces initial markup when it mounts; this is not
hydration. Design and test the handoff so the same article remains visible, titles
are not duplicated, and JavaScript failure still leaves readable HTML. Keep the
server markup and Vue view aligned through shared styling and rendered-content
parity tests. Internal navigation must update and clean up canonical/social tags
as well as the visible article. Do not start SSR of the entire application.
The no-JavaScript document must provide its own usable scroll container, respecting
the existing viewport-height shell styles so a long article is not clipped.

Unknown, draft, and unpublished article requests return real HTTP 404 responses,
without article metadata. Dependency failures return an actionable 503 rather
than a successful empty shell. Support HEAD consistently with GET. Canonical
URLs use configured site origin/base settings, never the request Host header;
the backend value is `environment.siteUrl`, which the PvP metadata already uses.

The blog handlers must own their whole path space, because anything that falls
through reaches the catch-all and becomes a 200 shell. That includes malformed
slugs, out-of-range listing pages, and `/sitemap.xml` or `/blog/rss.xml` when a
query fails. Register the two XML handlers ahead of the CSRF middleware, as the
fingerprinted assets are, so feed readers and crawlers receive no cookie. The
document renderer reads the built template, so give it an injectable template
for tests and decide how the handlers are reached in development.

On the client, manage title, description, canonical, and social tags with the
existing `useHead` pattern. Tags written into the server document are not owned
by that head manager, so the handoff must adopt or remove them; otherwise the
first internal navigation leaves the previous article's tags beside the new ones.

### Metadata and discovery

Each article's initial head includes a unique title, summary description,
canonical URL, Open Graph article fields, and Twitter card metadata. Use the
cover image or an existing suitable public site image; verify that the selected
image is accessible without login. Use absolute URLs and image alt metadata.
The [Open Graph protocol](https://ogp.me/) defines the core metadata contract.

Include `BlogPosting` JSON-LD with the visible headline, description, public
author label, canonical URL, publication/modification dates, and image when
available. Escape embedded JSON and HTML attributes correctly; use no executable
inline script. Metadata must describe the visible article. See
[Google's article guidance](https://developers.google.com/search/docs/appearance/structured-data/article).
This makes articles eligible for discovery and richer presentation; it does not
guarantee indexing, ranking, or a particular platform's preview.

`/sitemap.xml` initially covers the blog listing and all published article URLs;
this is not a site-wide sitemap project. Generate it from current publication
state, use real content modification dates, escape XML, and send the correct
content type. Follow the [Sitemap protocol](https://www.sitemaps.org/protocol.html).

Advertise the sitemap with an absolute `Sitemap:` line in a `text/plain`
`robots.txt` served by the origin, which has none today. The public file is
currently Cloudflare's managed block, so the line counts as delivered only when
it appears in the response fetched through `duris.sbs` alongside that block.
Do not weaken or duplicate the edge-managed crawler rules from the origin. If
the edge does not merge the origin file, changing that is a Cloudflare
configuration step needing its own authorization; record it rather than
assuming the origin file is what crawlers see.

`/blog/rss.xml` supplies the newest 50 published articles with channel metadata,
title, canonical link, stable GUID, publication date, and plain-text summary.
Use canonical article URLs as GUIDs because published slugs are immutable.
Add a feed link to the blog and HTML autodiscovery. Produce valid UTF-8 XML,
escape text, use the specified date format, and avoid using the RSS `author`
element for a public label because that field expects an email address. Follow
the [RSS 2.0 specification](https://www.rssboard.org/rss-specification).

### Freshness and service-worker behavior

Initially serve blog HTML, APIs, sitemap, and RSS with `Cache-Control: no-store`;
use bounded/paginated database queries and render only requested content. Reuse
immutable caching for built assets. This avoids a new cache invalidation system.

Exclude blog document navigations and discovery files from the service worker's
SPA fallback and article-response caches; use network-only handling for those
resources and blog APIs. Ensure internal Vue navigation refetches publication
state and successful admin writes invalidate affected queries. Verify the
service-worker update path for an already installed client, not only a fresh browser.
The concrete change is to `navigateFallbackDenylist`, which today lists only
`/api`: add the blog paths, `/sitemap.xml`, and `/robots.txt`. Because updates
are prompted, a client that has not yet accepted the new worker still receives
the previous precached shell for `/blog` navigations; state that expected
interim behavior in the release notes instead of treating it as a defect.

Acceptance is that the next network request reflects a successful publish,
edit, or unpublish operation across all representations. An already open page,
external feed reader, or social platform may retain a previously fetched copy;
unpublishing does not recall those copies. Recheck Cloudflare behavior during
release acceptance instead of assuming origin headers prove edge freshness.

## Scope boundaries and effort

The proposed release includes rich-text authoring, admin preview/publication,
public pages, initial article HTML, metadata, JSON-LD, sitemap, RSS, navigation,
documentation, and focused verification. No separate service or paid editor
extension is expected; reuse the installed editor packages.

Defer comments/reactions, tags and category management, full-text search,
scheduled publishing, revision history, concurrent live/draft versions,
newsletters, automatic social posting, arbitrary embeds, direct image uploads,
and site-wide SSR/SEO changes. Existing forums can continue to host discussions.

Planning estimate: **2–4 development days for the core rich-text blog, plus
1–2 days for initial HTML, discovery, and preview metadata; roughly 3–6 days
total.** These are engineering effort ranges including focused tests and normal
package gates, not a delivery commitment or a claim that work is complete.
Content writing, new artwork, provider setup, and deployment scheduling are
excluded. The upper range depends especially on the initial-HTML/Vue handoff,
service-worker behavior, and editor formatting compatibility. Direct uploads
would need a revised estimate after their ownership design is agreed.

## Implementation sequence and expected files

1. Define the post schema, public projection, validation, publication semantics,
   and permission reuse. Add the reversible migration, blog service, API routes,
   and isolated database/route tests.
2. Add the admin view, public Vue listing/detail views, API types/client calls,
   editor URL-image option, and desktop/mobile/admin navigation. Reuse styles
   and avoid changes to unrelated editor consumers.
3. Add the blog HTML renderer, initial data handoff, metadata, sitemap, RSS,
   robots discovery, and service-worker exclusions. Qualify public status codes
   and publication consistency through the actual HTTP handlers.
4. Complete browser qualification and package gates, update durable contributor/API
   documentation, and prepare release news. Deploy only under a later authorized
   deployment, then verify public behavior and publish the changelog entry.

Expected new code lives under `backend/src/routes/`, `backend/src/services/`,
`backend/migrations/`, and `frontend/src/views/` with colocated tests. Existing
integration points are [app.ts](../../backend/src/app.ts),
[main.ts](../../frontend/src/main.ts), [router](../../frontend/src/router/index.ts),
[news API](../../frontend/src/features/news/api.ts), [HTTP client](../../frontend/src/services/httpClient.ts), [App.vue](../../frontend/src/App.vue),
[BottomNavbar](../../frontend/src/components/layout/BottomNavbar.vue),
[AdminMenu](../../frontend/src/components/layout/AdminMenu.vue),
[breadcrumbs](../../frontend/src/components/layout/BreadcrumbsNav.vue), the editor,
main styles, and Vite service-worker configuration. Exact new filenames are an
implementation choice; this is not a request to refactor every listed file.

## Acceptance and verification

- An authorized editor completes create → save → preview → publish → edit →
  unpublish → republish. Permissions and CSRF are enforced; conflict and failed-save
  states preserve the editor's work. Public author labels do not disclose account IDs.
- Anonymous users can list/read published posts. Draft and unpublished data remain
  absent from APIs, raw HTML, metadata, bootstrap payloads, sitemap, and RSS.
- Supported rich text survives save, reload, preview, server render, and Vue render.
  Sanitization and escaping hold at each output boundary, including metadata and XML.
  Existing forum/changelog editor behavior remains covered by regression checks.
- With JavaScript disabled, a direct article URL returns the full readable body,
  correct metadata, navigation, and styles. With JavaScript enabled, direct and
  internal navigation converge without duplicate content or stale head tags.
- Invalid/missing/unpublished URLs return HTTP 404; backend failures return 503.
  No blog, sitemap, or feed path returns the generic 200 shell, and the sitemap
  and feed responses set no cookie. The `Sitemap` line is present in `robots.txt`
  as fetched through the public hostname.
  A successful publication change is reflected in the next network read of every
  public representation, including with an installed service worker.
- Validate sitemap and RSS with XML parsers; check canonical host, escaping,
  ordering, dates, stable GUIDs, feed bounds, and draft exclusion. Validate JSON-LD
  against the visible article and inspect social metadata in raw HTTP responses.
- Test editor and public views at phone, tablet, and desktop widths, keyboard-only
  operation, zoom, long content, broken images, and error states. Check public image
  accessibility and social previews during release qualification when tools permit.
- Run migration up/down on isolated data and verify the website-only ownership
  boundary. A production rollback should retain new content rather than casually
  execute the destructive schema `down`; follow the normal recovery procedure.

Implementation checks, run from the repository root with focused test paths filled in:

```bash
pnpm --dir backend test --runInBand <affected-test-paths>
pnpm --dir frontend test:unit --run <affected-test-paths>
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend schema:check
pnpm --dir backend verify:mud-writes
pnpm --dir backend build
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
./frontend/scripts/check-palette-literals.sh
pnpm --dir frontend build
```

`schema:check` is required here because the release adds a migration and its
`.schema.json` contract. Also run configuration checks if their owning inputs change, following
[development](../development.md) and [schema baseline guidance](../../backend/schema-baselines/README.md).
Report actual commands and results; this proposal records no passing runtime tests.
Build outside the live served directory and avoid concurrent heavy jobs on production.

For release, follow [deployment](../deployment.md) and the
[news-update skill](../../.agents/skills/news-update/SKILL.md). Draft reader-facing
news during implementation and publish it only after the described release is
verified live; verify both the saved entry and public rendering. The present
documentation-only proposal needs no public changelog entry.
