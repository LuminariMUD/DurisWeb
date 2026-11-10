import { apiClient as api } from '@/services/httpClient'

export const builderValidationApi = {
  /**
   * Validate an exit (quick validation for real-time feedback)
   */
  async validateExit(
    zoneId: string,
    toRoom?: number,
    keyVnum?: number,
  ): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/validate/exit`, {
      toRoom,
      keyVnum,
    })
    return data
  },

  /**
   * Validate object values (quick validation for real-time feedback)
   */
  async validateObjectValues(
    zoneId: string,
    itemType: number,
    values: number[],
  ): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const { data } = await api.post(`/api/builder/zones/${zoneId}/validate/object-values`, {
      itemType,
      values,
    })
    return data
  },
}
