import { apiClient as api } from '@/services/httpClient'
import type {
  PaginatedResponse,
  AuctionListItem,
  AuctionDetail,
  AuctionBidHistory,
  AuctionFilters,
  AuctionStats,
  AuctionHistoryItem,
  AuctionHistoryFilters,
} from '@/types'

export const auctionApi = {
  /**
   * Get auction listings with optional filters
   */
  async getListings(filters: AuctionFilters = {}): Promise<PaginatedResponse<AuctionListItem>> {
    const params = new URLSearchParams()
    if (filters.search) params.append('search', filters.search)
    if (filters.seller) params.append('seller', filters.seller)
    if (filters.minPrice !== undefined) params.append('minPrice', filters.minPrice.toString())
    if (filters.maxPrice !== undefined) params.append('maxPrice', filters.maxPrice.toString())
    if (filters.hasBuyNow) params.append('hasBuyNow', 'true')
    if (filters.keywords?.length) params.append('keywords', filters.keywords.join(','))
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.sortBy) params.append('sortBy', filters.sortBy)
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)

    const { data } = await api.get<PaginatedResponse<AuctionListItem>>(
      `/api/auction/listings?${params}`,
    )
    return data
  },

  /**
   * Get single auction detail
   */
  async getAuctionDetail(auctionId: number): Promise<AuctionDetail> {
    const { data } = await api.get<AuctionDetail>(`/api/auction/listings/${auctionId}`)
    return data
  },

  /**
   * Get bid history for an auction
   */
  async getBidHistory(auctionId: number): Promise<AuctionBidHistory[]> {
    const { data } = await api.get<AuctionBidHistory[]>(
      `/api/auction/listings/${auctionId}/history`,
    )
    return data
  },

  /**
   * Get available filter keywords
   */
  async getKeywords(): Promise<string[]> {
    const { data } = await api.get<string[]>('/api/auction/keywords')
    return data
  },

  /**
   * Get auction statistics
   */
  async getStats(): Promise<AuctionStats> {
    const { data } = await api.get<AuctionStats>('/api/auction/stats')
    return data
  },

  /**
   * Get auction history (completed sales from last 30 days)
   */
  async getHistory(filters: AuctionHistoryFilters): Promise<PaginatedResponse<AuctionHistoryItem>> {
    const params = new URLSearchParams()
    if (filters.search) params.append('search', filters.search)
    if (filters.seller) params.append('seller', filters.seller)
    if (filters.buyer) params.append('buyer', filters.buyer)
    if (filters.page) params.append('page', String(filters.page))
    if (filters.limit) params.append('limit', String(filters.limit))
    if (filters.sortBy) params.append('sortBy', filters.sortBy)
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)

    const { data } = await api.get<PaginatedResponse<AuctionHistoryItem>>(
      `/api/auction/history?${params.toString()}`,
    )
    return data
  },

  /**
   * Place a bid on an auction
   */
  async placeBid(
    auctionId: number,
    bidAmountCopper: number,
    characterPid: number,
  ): Promise<{ success: boolean; message: string; auctionClosed?: boolean }> {
    const { data } = await api.post(`/api/auction/listings/${auctionId}/bid`, {
      bidAmountCopper,
      characterPid,
    })
    return data
  },

  /**
   * Buy-it-now on an auction
   */
  async buyNow(
    auctionId: number,
    characterPid: number,
  ): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post(`/api/auction/listings/${auctionId}/buy`, {
      characterPid,
    })
    return data
  },

  /**
   * Admin: Remove an auction (returns item to seller, refunds bidder)
   */
  async removeAuction(
    auctionId: number,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete(`/api/auction/listings/${auctionId}`, {
      data: { reason },
    })
    return data
  },
}
