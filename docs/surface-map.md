# 28 October 2026 surface map snapshot

This is a **manually maintained**, locally hosted snapshot of Drevarr's map. It is **not**
automatically updated when the upstream page changes. Drevarr has granted permission
to host this copy, as confirmed by the site administrator.

- Original live map: https://drevarr.github.io/20261028_Wipe_Duris_Surface_Map.html
- Source repository: https://github.com/Drevarr/drevarr.github.io
- Snapshot commit: `49b4deb97f4b01c72e1ed755830184d062f1db87`
- Snapshot HTML: `20261028_Wipe_Duris_Surface_Map.html`
- Snapshot image: `20261028_Duris_Surface_Map1600x1600.wld.png`
- Icons: `dragon.png`, `helm.png`

## How to update it manually

1. Compare the upstream HTML and map image against the pinned commit above.
2. Update `frontend/public/surface-map/data.json` from the upstream `ferryRoutes`,
   `dragonRoutes` and `zones` arrays. Keep `upstreamCommit` and `source` current.
3. Replace the PNG image and icons in `frontend/public/surface-map/` if changed.
4. If the map grid (currently 400 by 400, 4px per room, starting VNUM 500000),
   search semantics or new interactive features changed, update the Vue page and
   `frontend/src/utils/surfaceMapCoordinates.ts` together.
5. Retain credit for Drevarr and the icon authors (Icongeek26 and Freepik via Flaticon).
6. Create a reviewed PR; do not automatically sync or merge upstream JavaScript.

The site serves this map at `/surface-map`, while the existing backend-driven
`/wiki/map` is deliberately unchanged. No MUD server or database changes are needed.

Validation:
- `cd frontend && pnpm format:check && pnpm lint && pnpm type-check`
- `cd frontend && pnpm test:unit -- --run src/utils/__tests__/surfaceMapCoordinates.spec.ts`
- Manually confirm map image, marker popups, search, duplicate zone names, VNUM
  coordinates, zooming and responsive layout at desktop and mobile widths.


## Illustrated atlas and local testing

The **Classic** view retains Drevarr's original image without edits. The **Illustrated**
view paints a separate PNG from the original bitmap in the browser. The transform is
deterministic, uses original source pixel positions, and clips decorative terrain
illustrations to the original terrain mask. The room-to-map conversion never changes.
The visual effect is an artistic interpretation of existing colour categories, not a
new surveyed map.

The illustrated view is algorithmic drawing with trees, mountains, dunes, coastline
shallows and ocean engravings. It is **not** the previously generated concept art,
which contained inaccurate coastlines and invented locations. Review its actual
artistic quality in a browser before merging. The renderer lives in
frontend/src/utils/surfaceMapIllustration.ts, loads only when Illustrated is chosen,
caches the first rendered PNG, and releases the object URL on unmount.

**All** zone names, ferry departures and dragon-flight markers come from the
manually pinned frontend/public/surface-map/data.json. No text from illustration
previews is rendered. Duplicate zone names remain separate by VNUM. Auto groups
nearby zone entries, All permits crowding, and None hides zone names while keeping
dots. Ferries and dragons have independent controls. Travel connection lines are
not invented: the pinned source identifies stops rather than verified full paths.

Verify all 267 zone entries, 11 ferry departures and 16 dragon-flight markers on
both backgrounds. Room/VNUM positions must remain aligned during switching,
panning, and zooming. Run the documented checks plus
pnpm test:unit --run src/utils/__tests__/surfaceMapIllustration.spec.ts.
