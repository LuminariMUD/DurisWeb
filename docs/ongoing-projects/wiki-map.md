# Wiki map — blank on production

Investigated 2026-10-08 UTC on the single production deployment described in
[prod-deploy.md](prod-deploy.md#production-location-authoritative). The
`/wiki/map` page rendered an empty map with no error banner. The API answered;
the page had no data to draw and no background image to show.

## Progress

| Step | State |
| --- | --- |
| 1. Populate the map tables | Done 2026-10-08 13:11 UTC (see [Work log](#work-log)) |
| 2. Serve the background image | Code written (durable option), awaiting build and cutover |
| 3. Record it (deployment doc, preflight) | Docs and preflight written, awaiting the same cutover |

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

## Work log

### 2026-10-08 13:11 UTC — step 1, map tables populated

Authorized by the operator goal for this session. Release evidence (mode 0700,
logs mode 0600) is under
`~/.local/share/durisweb/releases/20261008-wikimap/` on the production host;
nothing from it is committed.

- Pre-change state recorded: web commit `c3b2977`, MUD checkout clean at
  `f4429104` (tree `8b4bb86e`), all six service PIDs and restart counters,
  served SPA asset `index-C7XknIZW.js`, and the zero bounds response.
- `pnpm --dir backend extract-map-data` from the live checkout with the
  production backend environment, exit 0 in 11.8 s. It mapped 442 zone files
  and 490,611 rooms, staged 266,083 map rooms and 546 zone entrances, and
  committed them in one transaction with all 14 continent centers.
- Rows after the run: layer `0` 160,004 rooms (0–399 × 0–399), layer `1`
  29,996 (0–299 × 0–99), layer `-1` 13,587 (0–399 × 0–399), layer `-2`
  2,645 (0–99 × 0–38); 546 entrances into 214 zones; 14 of 14 continents
  have centers. No MUD-owned table was touched.
- Stale private-cache entries (`wiki:mapImage:*`, `wiki:entrances:*`,
  `wiki:continents`) were removed with `SCAN` + `UNLINK`; the rendered Redis
  disables `FLUSHALL`. No `wiki:mapBounds*` key existed.
- Verified locally and through the public hostname: `/api/wiki/map/bounds` is
  `0–399 × 0–399` for layer 0 (`0–99 × 0–38` for `-2`, `0–299 × 0–99` for
  `1`); `/api/wiki/map/image?layer=0` is a 62,629-byte 1600×1600 PNG (layer
  `-1` 1600×1600, layer `-2` 400×156); a sample tile viewport returns 121
  tiles and the full surface viewport returns 370 entrances.
- Still failing at this point: `/duris/maps/layer-0.png` returns the SPA HTML,
  so the page draws entrances over a blank background until step 2 ships.

### 2026-10-08 13:15 UTC — steps 2 and 3, code and documentation written

- `frontend/src/utils/mapLayerImageUrl.ts` resolves the layer background:
  when `VITE_STATIC_URL` equals `VITE_API_URL` it returns
  `<api>/api/wiki/map/image?layer=<N>`; otherwise it keeps the static object
  path `<static>/duris/maps/layer-<N>.png`. `LeafletMap.vue` uses it. Unit
  spec added.
- `backend/src/routes/wiki.ts`: the image endpoint's `Cache-Control` drops
  from one week to one hour, matching the server-side image cache TTL, so a
  re-extraction becomes visible within the hour.
- `backend/src/services/wikiMapReadiness.ts` reads aggregate counts of
  `wiki_map_positions` (total and `z_coord = 0`) and `wiki_zone_entrances`;
  `productionPreflight.ts` requires those three tables plus `wiki_continents`
  and fails the dependency stage when the projection is empty. Unit test
  added.
- `docs/deployment.md` adds `extract-map-data` to the publishing sequence with
  its cache-flush note, a map acceptance bullet, and a fresh-installation
  paragraph; `docs/ARCHITECTURE.md` and `docs/environments.md` record the
  preflight check and the static-origin rule.
- Quality gates in the live checkout: backend readiness/preflight tests
  (15 passed), frontend helper spec (4 passed), and `format:check`, `lint`,
  `type-check` for both packages pass. DB-backed backend tests cannot run on
  this host (no test database user).

## Evidence

- Public probes of every `/api/wiki/map/*` endpoint and the static layer path,
  2026-10-08 12:32 UTC, after the clean rebuild recorded in the deployment
  journal.
- Row counts from the production database (read-only query).
- Backend journal lines for the 4x4 image generation at 12:32:33 UTC.
