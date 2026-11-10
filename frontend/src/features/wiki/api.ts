import { MAP_IMAGE_REVISION } from '@/utils/mapLayerImageUrl'
import { apiClient as api } from '@/services/httpClient'
import type {
  WikiContinent,
  WikiMapTile,
  WikiZoneEntrance,
  WikiMapBounds,
  WikiMapSectors,
  WikiZone,
  WikiZoneDetail,
  WikiZoneMapData,
  WikiObject,
  WikiObjectDetail,
  WikiZoneFilters,
  WikiObjectFilters,
  WikiObjectType,
  WikiWearSlot,
  WikiAffectType,
  WikiMob,
  WikiMobDetail,
  WikiMobFilters,
  WikiMobClass,
  WikiMobRace,
  WikiActFlag,
  WikiZoneSpawns,
} from '@/types'

// Wiki API
export const wikiApi = {
  /**
   * Get wiki access level (public or registered)
   */
  async getAccessLevel(): Promise<{ accessLevel: 'public' | 'registered' }> {
    const { data } = await api.get('/api/wiki/access')
    return data
  },

  /**
   * Get all continents
   */
  async getContinents(): Promise<WikiContinent[]> {
    const { data } = await api.get<WikiContinent[]>('/api/wiki/map/continents')
    return data
  },

  /**
   * Get map bounds (optionally for a specific layer)
   */
  async getMapBounds(layer?: number): Promise<WikiMapBounds> {
    const params = layer !== undefined ? { layer } : {}
    const { data } = await api.get<WikiMapBounds>('/api/wiki/map/bounds', { params })
    return data
  },

  /**
   * Get world map as PNG image
   * @param layer - The map layer (0 = surface, -1 = underdark, etc.)
   * @returns PNG blob
   */
  async getWorldMapImage(layer: number = 0): Promise<Blob> {
    const response = await api.get(`/api/wiki/map/image`, {
      params: { layer, revision: MAP_IMAGE_REVISION },
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Get the sector of every room on a layer, for the painted map view
   */
  async getMapSectors(layer: number = 0): Promise<WikiMapSectors> {
    const { data } = await api.get<WikiMapSectors>('/api/wiki/map/sectors', { params: { layer } })
    return data
  },

  /**
   * Get available map layers
   */
  async getMapLayers(): Promise<{ id: number; name: string; description: string }[]> {
    const { data } =
      await api.get<{ id: number; name: string; description: string }[]>('/api/wiki/map/layers')
    return data
  },

  /**
   * Get map tiles for viewport
   */
  async getMapTiles(bounds: WikiMapBounds, layer: number = 0): Promise<WikiMapTile[]> {
    const params = new URLSearchParams({
      minX: bounds.minX.toString(),
      maxX: bounds.maxX.toString(),
      minY: bounds.minY.toString(),
      maxY: bounds.maxY.toString(),
      layer: layer.toString(),
    })
    const { data } = await api.get<WikiMapTile[]>(`/api/wiki/map/tiles?${params}`)
    return data
  },

  /**
   * Get zone entrances for viewport
   */
  async getZoneEntrances(bounds: WikiMapBounds, layer: number = 0): Promise<WikiZoneEntrance[]> {
    const params = new URLSearchParams({
      minX: bounds.minX.toString(),
      maxX: bounds.maxX.toString(),
      minY: bounds.minY.toString(),
      maxY: bounds.maxY.toString(),
      layer: layer.toString(),
    })
    const { data } = await api.get<WikiZoneEntrance[]>(`/api/wiki/map/entrances?${params}`)
    return data
  },

  /**
   * Search zones for autocomplete with infinite scroll support
   */
  async searchZones(
    query: string = '',
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ zones: { number: number; name: string }[]; hasMore: boolean }> {
    const { data } = await api.get<{ zones: { number: number; name: string }[]; hasMore: boolean }>(
      '/api/wiki/zones/search',
      {
        params: { q: query, limit, offset },
      },
    )
    return data
  },

  /**
   * Get paginated zone list
   */
  async getZones(
    filters: WikiZoneFilters = {},
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'number',
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<{
    zones: WikiZone[]
    total: number
    page: number
    limit: number
    totalPages: number
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    })

    if (filters.search) params.append('search', filters.search)
    if (filters.alignmentMin !== undefined)
      params.append('alignmentMin', filters.alignmentMin.toString())
    if (filters.alignmentMax !== undefined)
      params.append('alignmentMax', filters.alignmentMax.toString())
    if (filters.difficultyMin !== undefined)
      params.append('difficultyMin', filters.difficultyMin.toString())
    if (filters.difficultyMax !== undefined)
      params.append('difficultyMax', filters.difficultyMax.toString())
    if (filters.epicTypes && filters.epicTypes.length > 0)
      params.append('epicTypes', filters.epicTypes.join(','))
    if (filters.minLevel !== undefined) params.append('minLevel', filters.minLevel.toString())
    if (filters.maxLevel !== undefined) params.append('maxLevel', filters.maxLevel.toString())

    const { data } = await api.get(`/api/wiki/zones?${params}`)
    return data
  },

  /**
   * Get zone detail
   */
  async getZoneDetail(zoneNumber: number): Promise<WikiZoneDetail> {
    const { data } = await api.get<WikiZoneDetail>(`/api/wiki/zones/${zoneNumber}`)
    return data
  },

  /**
   * Get zone map data for Cytoscape.js
   */
  async getZoneMapData(zoneNumber: number): Promise<WikiZoneMapData> {
    const { data } = await api.get<WikiZoneMapData>(`/api/wiki/zones/${zoneNumber}/map-data`)
    return data
  },

  /**
   * Get object types for filters
   */
  async getObjectTypes(): Promise<WikiObjectType[]> {
    const { data } = await api.get<WikiObjectType[]>('/api/wiki/objects/types')
    return data
  },

  /**
   * Get wear slots for filters
   */
  async getWearSlots(): Promise<WikiWearSlot[]> {
    const { data } = await api.get<WikiWearSlot[]>('/api/wiki/objects/slots')
    return data
  },

  /**
   * Get affect types for filters
   */
  async getAffectTypes(): Promise<WikiAffectType[]> {
    const { data } = await api.get<WikiAffectType[]>('/api/wiki/objects/affects')
    return data
  },

  /**
   * Get paginated object list
   */
  async getObjects(
    filters: WikiObjectFilters = {},
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'vnum',
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<{
    objects: WikiObject[]
    total: number
    page: number
    limit: number
    totalPages: number
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    })

    if (filters.search) params.append('search', filters.search)
    if (filters.type !== undefined) params.append('type', filters.type.toString())
    if (filters.excludeTypes && filters.excludeTypes.length > 0) {
      params.append('excludeTypes', filters.excludeTypes.join(','))
    }
    if (filters.slot !== undefined) params.append('slot', filters.slot.toString())
    if (filters.minLevel !== undefined) params.append('minLevel', filters.minLevel.toString())
    if (filters.maxLevel !== undefined) params.append('maxLevel', filters.maxLevel.toString())
    if (filters.affectType !== undefined) params.append('affectType', filters.affectType.toString())
    if (filters.affects && filters.affects.length > 0) {
      params.append('affects', JSON.stringify(filters.affects))
    }
    if (filters.spellEffects && filters.spellEffects.length > 0) {
      params.append('spellEffects', filters.spellEffects.join(','))
    }
    if (filters.zone !== undefined) params.append('zone', filters.zone.toString())
    if (filters.allowedClass !== undefined)
      params.append('allowedClass', filters.allowedClass.toString())
    if (filters.allowedRace !== undefined)
      params.append('allowedRace', filters.allowedRace.toString())

    const { data } = await api.get(`/api/wiki/objects?${params}`)
    return data
  },

  /**
   * Get available spell effect types for filtering
   */
  async getSpellEffectTypes(): Promise<string[]> {
    const { data } = await api.get<string[]>('/api/wiki/objects/spell-effects')
    return data
  },

  /**
   * Get object classes for restriction filtering
   */
  async getObjectClasses(): Promise<{ id: number; name: string }[]> {
    const { data } = await api.get<{ id: number; name: string }[]>('/api/wiki/objects/classes')
    return data
  },

  /**
   * Get object races for restriction filtering
   */
  async getObjectRaces(): Promise<{ id: number; name: string }[]> {
    const { data } = await api.get<{ id: number; name: string }[]>('/api/wiki/objects/races')
    return data
  },

  /**
   * Get object detail
   */
  async getObjectDetail(vnum: number): Promise<WikiObjectDetail> {
    const { data } = await api.get<WikiObjectDetail>(`/api/wiki/objects/${vnum}`)
    return data
  },

  /**
   * Update wiki access level (admin only)
   */
  async setAccessLevel(accessLevel: 'public' | 'registered'): Promise<void> {
    await api.put('/api/wiki/settings/access', { accessLevel })
  },

  /**
   * Get mob classes for filters
   */
  async getMobClasses(): Promise<WikiMobClass[]> {
    const { data } = await api.get<WikiMobClass[]>('/api/wiki/mobs/classes')
    return data
  },

  /**
   * Get mob races for filters
   */
  async getMobRaces(): Promise<WikiMobRace[]> {
    const { data } = await api.get<WikiMobRace[]>('/api/wiki/mobs/races')
    return data
  },

  /**
   * Get act flags for legend
   */
  async getActFlags(): Promise<WikiActFlag[]> {
    const { data } = await api.get<WikiActFlag[]>('/api/wiki/mobs/flags')
    return data
  },

  /**
   * Get paginated mob list
   */
  async getMobs(
    filters: WikiMobFilters = {},
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'vnum',
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<{ mobs: WikiMob[]; total: number; page: number; limit: number; totalPages: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    })

    if (filters.search) params.append('search', filters.search)
    if (filters.minLevel !== undefined) params.append('minLevel', filters.minLevel.toString())
    if (filters.maxLevel !== undefined) params.append('maxLevel', filters.maxLevel.toString())
    if (filters.alignmentMin !== undefined)
      params.append('alignmentMin', filters.alignmentMin.toString())
    if (filters.alignmentMax !== undefined)
      params.append('alignmentMax', filters.alignmentMax.toString())
    if (filters.mobClass !== undefined) params.append('mobClass', filters.mobClass.toString())
    // New filters
    if (filters.race !== undefined) params.append('race', filters.race.toString())
    if (filters.flag !== undefined) params.append('flag', filters.flag.toString())
    if (filters.zone !== undefined) params.append('zone', filters.zone.toString())

    const { data } = await api.get(`/api/wiki/mobs?${params}`)
    return data
  },

  /**
   * Get mob detail (unique by zone + vnum)
   */
  async getMobDetail(zoneNumber: number, vnum: number): Promise<WikiMobDetail> {
    const { data } = await api.get<WikiMobDetail>(`/api/wiki/mobs/${zoneNumber}/${vnum}`)
    return data
  },

  /**
   * Get zone spawns (mobs and objects in each room)
   */
  async getZoneSpawns(zoneNumber: number): Promise<WikiZoneSpawns> {
    const { data } = await api.get<WikiZoneSpawns>(`/api/wiki/zones/${zoneNumber}/spawns`)
    return data
  },
}
