import type { Pool, RowDataPacket } from 'mysql2/promise';

interface WikiMapReadinessRow extends RowDataPacket {
  map_rooms: number | string;
  surface_rooms: number | string;
  zone_entrances: number | string;
}

export interface WikiMapReadiness {
  mapRooms: number;
  surfaceRooms: number;
  zoneEntrances: number;
}

/** Read only aggregate counts of the published map projection. */
export async function readWikiMapReadiness(
  database: Pick<Pool, 'query'>,
): Promise<WikiMapReadiness> {
  const [rows] = await database.query<WikiMapReadinessRow[]>(`
    SELECT
      (SELECT COUNT(*) FROM wiki_map_positions) AS map_rooms,
      (SELECT COUNT(*) FROM wiki_map_positions WHERE z_coord = 0) AS surface_rooms,
      (SELECT COUNT(*) FROM wiki_zone_entrances) AS zone_entrances
  `);
  return {
    mapRooms: Number(rows[0]?.map_rooms ?? 0),
    surfaceRooms: Number(rows[0]?.surface_rooms ?? 0),
    zoneEntrances: Number(rows[0]?.zone_entrances ?? 0),
  };
}

/**
 * The world map is ready only when the extractor has published a surface
 * generation with zone entrances; an empty projection renders a blank map
 * without any API error. See docs/ARCHITECTURE.md#generated-projections.
 */
export function validateWikiMapReadiness(readiness: WikiMapReadiness): string[] {
  const { mapRooms, surfaceRooms, zoneEntrances } = readiness;
  const counts = [mapRooms, surfaceRooms, zoneEntrances];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    return ['wiki map projection counts are not readable'];
  }
  if (mapRooms === 0 || surfaceRooms === 0) {
    return [
      'wiki map projection is empty (no published surface rooms); run pnpm --dir backend extract-map-data from the selected MUD checkout',
    ];
  }
  if (zoneEntrances === 0) {
    return [
      'wiki map projection has rooms but no zone entrances; rerun pnpm --dir backend extract-map-data',
    ];
  }
  return [];
}
