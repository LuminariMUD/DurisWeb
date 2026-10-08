# Wiki map — blank on production

Investigated 2026-10-08 UTC on the single production deployment described in
[prod-deploy.md](prod-deploy.md#production-location-authoritative). The
`/wiki/map` page renders an empty map with no error banner. The API answers;
the page has no data to draw and no background image to show. Nothing has been
changed or run yet; the fix below needs operator authorization because its
first step writes to the production database.

## Findings

### 1. The map tables were never populated

| Table | Rows |
| --- | --- |
| `wiki_map_positions` | 0 |
| `wiki_zone_entrances` | 0 |
| `wiki_continents` | 14 (all `center_x`/`center_y` null) |

The go-live (see the deployment journal) published builder flags, wiki
objects and mobs, and forum categories, but never ran the map extractor
`pnpm --dir backend extract-map-data` (`backend/src/scripts/extractMapData.ts`).

Observed consequences through the public hostname:

- `GET /api/wiki/map/bounds` returns `{"minX":0,"maxX":0,"minY":0,"maxY":0}`.
- `GET /api/wiki/map/image?layer=0` returns a valid 96-byte, 4x4 pixel PNG
  (the journal logs `Generating map image for layer 0: 4x4 pixels`).
- `/api/wiki/map/continents` and `/api/wiki/map/layers` return rows.
- `/api/wiki/map/tiles` and `/api/wiki/map/entrances` validate their viewport
  parameters correctly and would return nothing for any viewport.
- `WikiMapView.vue` fits the Leaflet map to the zero-sized bounds and shows
  nothing; because every request succeeds, the "Failed to load map data"
  state never triggers.

The extractor's inputs exist: the configured `MUD_DIR` has `areas/zon`
(442 `.zon` files) and `areas/wld` (446 `.wld` files). It stages the complete
generation in memory, then in one transaction deletes and re-inserts
`wiki_zone_entrances` and `wiki_map_positions`, preserves existing continent
assignments per room, and recomputes `wiki_continents` centers from each
continent's seed room. A parse or insert failure rolls back and leaves the
tables as they are. It writes only website-owned tables; no MUD-owned table is
touched.

### 2. The background layer image URL does not resolve

`frontend/src/components/wiki/LeafletMap.vue` builds the image overlay URL as
`${VITE_STATIC_URL}/duris/maps/layer-<N>.png`. That path layout matches the R2
object key written by `uploadMapImage` in `backend/src/services/r2Service.ts`
and was meant for a separate static asset origin.

On this deployment `R2_ENABLED=false` and `VITE_STATIC_URL` is the website's
own origin, so the browser requests `/duris/maps/layer-0.png` from the
backend. The backend does not serve that path: the request falls through to
the SPA fallback and returns HTTP 200 with `text/html`, which Leaflet cannot
render as an image.

Related code paths that do not help today:

- `generateStaticMapImages` in `backend/src/services/wikiService.ts` writes
  `public/maps/layer-<N>.png` under the backend working directory (served at
  `/maps/...`, a different path from the one the frontend requests), and
  nothing calls it: no route, script, or startup hook.
- `backend/public` does not exist in this checkout at all. The backend serves
  it with a 7-day `maxAge` when present. `.gitignore` already excludes
  `backend/public/maps/`.

## Proposed fix

1. **Populate the tables** (production database write; authorize first):

   ```bash
   pnpm --dir backend extract-map-data
   ```

   Run from the live checkout with the production backend environment. Then
   confirm `/api/wiki/map/bounds` is non-zero, `/api/wiki/map/image?layer=0`
   is a full-size PNG, and `/wiki/map` shows rooms and entrances. Re-run the
   extractor whenever the MUD area files change; it is idempotent.

2. **Serve the background image.** Choose one:

   - *No code change:* after step 1, generate the three layer PNGs (layers
     `0`, `-1`, `-2`) from `/api/wiki/map/image?layer=<N>` and place them at
     `backend/public/duris/maps/layer-<N>.png` so the existing frontend URL
     resolves. Add `backend/public/duris/maps/` to `.gitignore` alongside the
     existing `backend/public/maps/` entry. Drawback: the files and the 7-day
     cache header go stale after every re-extraction.
   - *Durable:* change `getMapImageUrl` in `LeafletMap.vue` to use the API
     image endpoint (`/api/wiki/map/image?layer=<N>`) when no separate static
     origin is configured, rebuild, and redeploy per
     [docs/deployment.md](../deployment.md). This removes the dependency on a
     generated file.

3. **Record it.** Add the extractor to the reference-data publishing sequence
   in [docs/deployment.md](../deployment.md#publish-wiki-reference-data) next to
   `sync-flags` and `wiki:publish`, and extend the dependency preflight's
   data-readiness checks to require non-empty map positions, so a fresh
   installation cannot pass acceptance with an empty map again.

## Evidence

- Public probes of every `/api/wiki/map/*` endpoint and the static layer path,
  2026-10-08 12:32 UTC, after the clean rebuild recorded in the deployment
  journal.
- Row counts from the production database (read-only query).
- Backend journal lines for the 4x4 image generation at 12:32:33 UTC.
