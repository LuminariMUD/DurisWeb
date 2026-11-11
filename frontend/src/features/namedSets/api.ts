import { apiClient as api } from '@/services/httpClient'

/** `one_minute` and `five_minutes` match the MUD's cooldown colors; null means none listed. */
export type NamedSetCooldown = 'one_minute' | 'five_minutes' | null

export interface NamedSetSpell {
  name: string
  pieces: number
  cooldown: NamedSetCooldown
}

export interface NamedSetZone {
  zone: number
  name: string
  /** Zone name with MUD color codes; render on ink only. */
  coloredName: string
  spells: NamedSetSpell[]
}

export interface NamedSetReport {
  /** Notes block from the in-game report, with MUD color codes. */
  notes: string
  zones: NamedSetZone[]
  fetchedAt: string
}

export const namedSetsApi = {
  /** The in-game `namedreport`: spells granted by each zone's named equipment set. */
  async getReport(): Promise<NamedSetReport> {
    const { data } = await api.get<NamedSetReport>('/api/named-sets')
    return data
  },
}
