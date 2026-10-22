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
All snapshot assets use the configured `VITE_BASE_URL` prefix, including on
deployments under a path such as `/duris/`.

Zone labels appear one zoom level above the fitted overview, within the available
range on both desktop and phones. Resizing recalculates that range; **Reset view**
fits the whole image to the current container. Focus the map and use arrow keys
to pan, then tab to **Look up center room** and activate it for the center square's
coordinates and room VNUM. Pointer clicks use the same lookup. Dragon and ferry
markers have accessible route names and can be activated with the keyboard.
Search results include each entrance's room VNUM so same-named entrances can be
selected individually. Lookup tile coordinates use the world grid: room 500000
is `(0, 0)` and room 659999 is `(399, 399)`; pixel coordinates refer to the image.
On short phone screens the page scrolls vertically to retain a usable map pane.

The page validates every zone and travel marker before installing the snapshot.
If the data request fails or the payload is invalid, **Retry map data** sends a
fresh request without reloading the page. Requests stop when the page unmounts.
If the image fails, **Retry map image** requests a new image overlay independently
without reloading zone data or adding duplicate markers.

Validation:
- `pnpm --dir frontend format:check`
- `pnpm --dir frontend lint`
- `pnpm --dir frontend type-check`
- `pnpm --dir frontend test:unit --run src/utils/__tests__/surfaceMapCoordinates.spec.ts src/views/__tests__/SurfaceMapView.spec.ts`
- Manually confirm map image, marker popups, search, duplicate zone names, VNUM
  coordinates, zooming and responsive layout at desktop and mobile widths.
