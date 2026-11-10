import { apiClient as api } from '@/services/httpClient'

// Public Statistics API
export interface FactionActivityPoint {
  timestamp: number
  goods: number
  evils: number
  neutrals: number
  undeads: number
}

export const publicStatsApi = {
  getFactionActivity: async (date: string) => {
    const response = await api.get(`/api/public/statistics/faction-activity`, {
      params: { date },
    })
    return response.data as { data: FactionActivityPoint[]; date: string }
  },

  getAvailableDates: async () => {
    const response = await api.get(`/api/public/statistics/available-dates`)
    return response.data as { dates: string[] }
  },

  getFactionOverlap: async (days: FactionOverlapDays) => {
    const response = await api.get(`/api/public/statistics/faction-overlap`, {
      params: { days },
    })
    return response.data as FactionOverlap
  },
}

export type FactionOverlapDays = 7 | 14 | 30

export interface FactionOverlapHour {
  /** Start of this dated UTC hour, in epoch seconds. */
  timestamp: number
  samples: number
  /** Samples with at least one goods and one evils player online. */
  bothSamples: number
  goodsPeak: number
  goodsAverage: number
  evilsPeak: number
  evilsAverage: number
  goodsAverageWhileBoth: number
  evilsAverageWhileBoth: number
}

export interface FactionOverlap {
  days: FactionOverlapDays
  firstDate: string | null
  lastDate: string | null
  samples: number
  hours: FactionOverlapHour[]
}
