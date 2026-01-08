import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import { auctionApi } from '@/services/api'
import type {
  AuctionFilters,
  AuctionHistoryFilters,
  AuctionListItem,
  AuctionDetail,
  AuctionBidHistory,
  AuctionHistoryItem,
  AuctionStats,
  PaginatedResponse,
} from '@/types'
import type { Ref, ComputedRef } from 'vue'
import { computed, unref, onMounted, onUnmounted } from 'vue'
import { useWebSocket } from './useWebSocket'

// Constants
const COPPER_PER_PLAT = 1000

/**
 * Hook for fetching auction listings with filters
 */
export function useAuctionListings(filters: Ref<AuctionFilters>) {
  return useQuery<PaginatedResponse<AuctionListItem>>({
    queryKey: ['auction-listings', filters],
    queryFn: () => auctionApi.getListings(filters.value),
    staleTime: 1000 * 30, // 30 seconds - auctions change frequently
    refetchInterval: 1000 * 60, // Refetch every minute
    placeholderData: keepPreviousData,
  })
}

/**
 * Hook for fetching a single auction detail
 */
export function useAuctionDetail(auctionId: Ref<number | null> | ComputedRef<number | null>) {
  return useQuery<AuctionDetail>({
    queryKey: ['auction-detail', auctionId],
    queryFn: () => auctionApi.getAuctionDetail(unref(auctionId)!),
    enabled: () => !!unref(auctionId),
    staleTime: 1000 * 15, // 15 seconds
    refetchInterval: 1000 * 30, // Refetch every 30 seconds
  })
}

/**
 * Hook for fetching bid history for an auction
 */
export function useAuctionBidHistory(auctionId: Ref<number | null> | ComputedRef<number | null>) {
  return useQuery<AuctionBidHistory[]>({
    queryKey: ['auction-bid-history', auctionId],
    queryFn: () => auctionApi.getBidHistory(unref(auctionId)!),
    enabled: () => !!unref(auctionId),
    staleTime: 1000 * 30, // 30 seconds
  })
}

/**
 * Hook for fetching available filter keywords
 */
export function useAuctionKeywords() {
  return useQuery<string[]>({
    queryKey: ['auction-keywords'],
    queryFn: () => auctionApi.getKeywords(),
    staleTime: 1000 * 60 * 60, // 1 hour - keywords rarely change
  })
}

/**
 * Hook for fetching auction statistics
 */
export function useAuctionStats() {
  return useQuery<AuctionStats>({
    queryKey: ['auction-stats'],
    queryFn: () => auctionApi.getStats(),
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  })
}

/**
 * Hook for fetching auction history (completed sales)
 */
export function useAuctionHistory(filters: Ref<AuctionHistoryFilters>) {
  return useQuery<PaginatedResponse<AuctionHistoryItem>>({
    queryKey: ['auction-history', filters],
    queryFn: () => auctionApi.getHistory(filters.value),
    staleTime: 1000 * 60, // 1 minute
    placeholderData: keepPreviousData,
  })
}

/**
 * Hook for placing a bid
 */
export function usePlaceBid() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      auctionId,
      bidAmountCopper,
      characterPid,
    }: {
      auctionId: number
      bidAmountCopper: number
      characterPid: number
    }) => auctionApi.placeBid(auctionId, bidAmountCopper, characterPid),
    onSuccess: (_data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['auction-listings'] })
      queryClient.invalidateQueries({ queryKey: ['auction-detail', variables.auctionId] })
      queryClient.invalidateQueries({ queryKey: ['auction-bid-history', variables.auctionId] })
      queryClient.invalidateQueries({ queryKey: ['auction-stats'] })
    },
  })
}

/**
 * Hook for buy-it-now
 */
export function useBuyNow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      auctionId,
      characterPid,
    }: {
      auctionId: number
      characterPid: number
    }) => auctionApi.buyNow(auctionId, characterPid),
    onSuccess: () => {
      // Invalidate all auction queries
      queryClient.invalidateQueries({ queryKey: ['auction-listings'] })
      queryClient.invalidateQueries({ queryKey: ['auction-stats'] })
    },
  })
}

/**
 * Hook for admin removing an auction
 */
export function useRemoveAuction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      auctionId,
      reason,
    }: {
      auctionId: number
      reason?: string
    }) => auctionApi.removeAuction(auctionId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auction-listings'] })
      queryClient.invalidateQueries({ queryKey: ['auction-stats'] })
    },
  })
}

// ==================== Helper Functions ====================

/**
 * Format copper amount as platinum string
 */
export function formatPrice(copper: number): string {
  const plat = Math.floor(copper / COPPER_PER_PLAT)
  return `${plat.toLocaleString()}p`
}

/**
 * Format copper amount with full denomination breakdown
 */
export function formatPriceFull(copper: number): string {
  const plat = Math.floor(copper / 1000)
  const gold = Math.floor((copper % 1000) / 100)
  const silver = Math.floor((copper % 100) / 10)
  const cop = copper % 10

  const parts: string[] = []
  if (plat > 0) parts.push(`${plat}p`)
  if (gold > 0) parts.push(`${gold}g`)
  if (silver > 0) parts.push(`${silver}s`)
  if (cop > 0 || parts.length === 0) parts.push(`${cop}c`)

  return parts.join(' ')
}

/**
 * Format remaining time as human-readable string
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Ended'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

/**
 * Get urgency level for auction ending soon
 * Returns 'urgent' (<1h), 'warning' (<6h), 'normal' (>6h)
 */
export function getTimeUrgency(seconds: number): 'urgent' | 'warning' | 'normal' {
  if (seconds <= 0) return 'urgent'
  if (seconds < 3600) return 'urgent' // < 1 hour
  if (seconds < 21600) return 'warning' // < 6 hours
  return 'normal'
}

/**
 * Create a computed countdown timer value
 * Returns reactive seconds remaining that updates every second
 */
export function useCountdown(endTimeRef: Ref<number>) {
  return computed(() => {
    const now = Math.floor(Date.now() / 1000)
    return Math.max(0, unref(endTimeRef) - now)
  })
}

/**
 * Convert platinum to copper
 */
export function platToCopper(plat: number): number {
  return plat * COPPER_PER_PLAT
}

/**
 * Convert copper to platinum
 */
export function copperToPlat(copper: number): number {
  return Math.floor(copper / COPPER_PER_PLAT)
}

// ==================== WebSocket Handling ====================

/**
 * Hook for auction websocket events
 * Shows notifications when user is outbid
 * Invalidates queries when auction data changes
 */
export function useAuctionWebSocket() {
  const queryClient = useQueryClient()
  const {
    onAuctionNew,
    offAuctionNew,
    onAuctionBid,
    offAuctionBid,
    onAuctionClose,
    offAuctionClose,
  } = useWebSocket()

  // Handler for new auction listings
  const handleAuctionNew = (_data: { id: number; seller: string; item: string }) => {
    // Refresh auction listings
    queryClient.invalidateQueries({ queryKey: ['auction-listings'] })
    queryClient.invalidateQueries({ queryKey: ['auction-stats'] })
  }

  // Handler for bids - refresh data (notifications handled by unified notification system)
  const handleAuctionBid = (data: {
    id: number
    bidder: string
    amount: number
    prevBidderPid: number
    prevBidder: string
  }) => {
    // Refresh auction data
    queryClient.invalidateQueries({ queryKey: ['auction-listings'] })
    queryClient.invalidateQueries({ queryKey: ['auction-detail', data.id] })
    queryClient.invalidateQueries({ queryKey: ['auction-bid-history', data.id] })
  }

  // Handler for auction close - refresh data (notifications handled by unified notification system)
  const handleAuctionClose = (data: {
    id: number
    winner: string
    winnerPid: number
    price: number
    reason: string
    sellerPid: number
    seller: string
  }) => {
    // Refresh auction data
    queryClient.invalidateQueries({ queryKey: ['auction-listings'] })
    queryClient.invalidateQueries({ queryKey: ['auction-stats'] })
    queryClient.invalidateQueries({ queryKey: ['auction-detail', data.id] })
  }

  onMounted(() => {
    onAuctionNew(handleAuctionNew)
    onAuctionBid(handleAuctionBid)
    onAuctionClose(handleAuctionClose)
  })

  onUnmounted(() => {
    offAuctionNew(handleAuctionNew)
    offAuctionBid(handleAuctionBid)
    offAuctionClose(handleAuctionClose)
  })
}
