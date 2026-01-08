<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter } from 'vue-router'
import {
  useAuctionDetail,
  useAuctionBidHistory,
  usePlaceBid,
  useBuyNow,
  useRemoveAuction,
  useAuctionWebSocket,
  formatPrice,
  formatPriceFull,
  formatTimeRemaining,
  getTimeUrgency,
} from '@/composables/useAuction'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Gavel, Clock, ArrowLeft, User, History, Tag, Loader2, ShoppingCart, Trash2, Info } from 'lucide-vue-next'
import AnsiText from '@/components/ui/AnsiText.vue'

const route = useRoute()
const router = useRouter()
const { user } = useAuth()
const { success, error: showError } = useToast()

const auctionId = computed(() => Number(route.params.id))
const { data: auction, isLoading, error, refetch } = useAuctionDetail(auctionId)
const { data: bidHistory } = useAuctionBidHistory(auctionId)

// Enable live updates via websocket
useAuctionWebSocket()

const placeBidMutation = usePlaceBid()
const buyNowMutation = useBuyNow()
const removeAuctionMutation = useRemoveAuction()

// Bid form state - platinum only (matches in-game)
const bidPlat = ref(0)
const selectedCharacterPid = ref<number | undefined>(undefined)

// Convert to copper for API
const bidAmountCopper = computed(() => bidPlat.value * 1000)

// Countdown timer
const timeRemaining = ref(0)
let countdownInterval: ReturnType<typeof setInterval> | null = null

// Update countdown every second and set default bid
watch(auction, (newAuction) => {
  if (newAuction) {
    timeRemaining.value = newAuction.secsRemaining

    // Set default bid to current price in plat (+ 1p if there's already a bidder)
    const curPricePlat = Math.floor(newAuction.curPrice / 1000)
    bidPlat.value = newAuction.winningBidderPid
      ? curPricePlat + 1  // current + 1 plat
      : curPricePlat      // starting price
  }
}, { immediate: true })

onMounted(() => {
  countdownInterval = setInterval(() => {
    if (timeRemaining.value > 0) {
      timeRemaining.value--
    }
  }, 1000)
})

onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
  }
})

// Set page title
useHead({
  title: computed(() => auction.value ? `Auction: ${auction.value.objShort.replace(/&[+nNL]?[a-zA-Z]/g, '')}` : 'Auction Details')
})

// Get user's characters for bidding
const userCharacters = computed(() => user.value?.characters || [])

// Minimum bid in plat (current price + 1p if has bidder, else starting price)
const minBidPlat = computed(() => {
  if (!auction.value) return 1
  const curPricePlat = Math.floor(auction.value.curPrice / 1000)
  if (auction.value.winningBidderPid) {
    return curPricePlat + 1  // must beat current by at least 1 plat
  }
  return curPricePlat || 1  // at least 1 plat
})

// Check if current bid meets minimum
const bidMeetsMinimum = computed(() => {
  return bidPlat.value >= minBidPlat.value
})

// Check if user can bid
const canBid = computed(() => {
  if (!user.value) return false
  if (!auction.value) return false
  if (auction.value.status !== 'OPEN') return false
  if (timeRemaining.value <= 0) return false
  return true
})

// Check if user is admin (immortal)
const isAdmin = computed(() => {
  return user.value?.permissions?.immortalLevel && user.value.permissions.immortalLevel >= 57
})

async function handlePlaceBid() {
  if (!bidPlat.value || !selectedCharacterPid.value || !auction.value) return

  try {
    const result = await placeBidMutation.mutateAsync({
      auctionId: auction.value.id,
      bidAmountCopper: bidAmountCopper.value,
      characterPid: selectedCharacterPid.value,
    })

    success(result.message)

    if (result.auctionClosed) {
      // Auction ended via buy-it-now, go back to list
      router.push({ name: 'auction-list' })
    } else {
      // Refresh auction data - watch will update bid defaults
      refetch()
    }
  } catch (err: any) {
    showError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to place bid')
  }
}

async function handleBuyNow() {
  if (!selectedCharacterPid.value || !auction.value) return

  try {
    const result = await buyNowMutation.mutateAsync({
      auctionId: auction.value.id,
      characterPid: selectedCharacterPid.value,
    })

    success(result.message)

    router.push({ name: 'auction-list' })
  } catch (err: any) {
    showError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to complete purchase')
  }
}

async function handleRemoveAuction() {
  if (!auction.value) return

  try {
    const result = await removeAuctionMutation.mutateAsync({
      auctionId: auction.value.id,
      reason: 'Removed by admin',
    })

    success(result.message)

    router.push({ name: 'auction-list' })
  } catch (err: any) {
    showError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to remove auction')
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button -->
    <Button variant="ghost" @click="router.push({ name: 'auction-list' })">
      <ArrowLeft class="h-4 w-4 mr-2" />
      Back to Auctions
    </Button>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12 text-red-500">
      Failed to load auction details. The auction may have ended or been removed.
    </div>

    <!-- Auction Detail -->
    <div v-else-if="auction" class="flex flex-col lg:grid lg:grid-cols-3 gap-6">
      <!-- Main Info -->
      <div class="lg:col-span-2 space-y-6 order-1">
        <!-- Item Card -->
        <Card>
          <CardHeader>
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <CardTitle class="text-xl lg:text-2xl break-words">
                  <AnsiText :text="auction.objShort" />
                </CardTitle>
                <CardDescription class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span v-if="auction.quantity > 1">
                    <Tag class="h-4 w-4 inline mr-1" />
                    Quantity: {{ auction.quantity }}
                  </span>
                  <span>
                    <User class="h-4 w-4 inline mr-1" />
                    Seller: {{ auction.sellerName }}
                  </span>
                </CardDescription>
              </div>
              <Badge
                :variant="getTimeUrgency(timeRemaining) === 'urgent' ? 'destructive' : getTimeUrgency(timeRemaining) === 'warning' ? 'secondary' : 'outline'"
                class="text-base lg:text-lg px-3 py-1 flex-shrink-0 self-start"
              >
                <Clock class="h-4 w-4 mr-2" />
                {{ formatTimeRemaining(timeRemaining) }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-sm text-muted-foreground">Current Bid</div>
                <div class="text-2xl font-bold">{{ formatPrice(auction.curPrice) }}</div>
                <div class="text-sm text-muted-foreground">{{ formatPriceFull(auction.curPrice) }}</div>
              </div>
              <div v-if="auction.buyPrice > 0">
                <div class="text-sm text-muted-foreground">Buy It Now</div>
                <div class="text-2xl font-bold text-green-500">{{ formatPrice(auction.buyPrice) }}</div>
                <div class="text-sm text-muted-foreground">{{ formatPriceFull(auction.buyPrice) }}</div>
              </div>
            </div>

            <Separator class="my-4" />

            <div class="flex items-center justify-between text-sm">
              <div>
                <span class="text-muted-foreground">Bids:</span>
                <span class="ml-2 font-medium">{{ auction.bidCount }}</span>
              </div>
              <div v-if="auction.winningBidderName">
                <span class="text-muted-foreground">High Bidder:</span>
                <span class="ml-2 font-medium">{{ auction.winningBidderName }}</span>
              </div>
            </div>

            <!-- Item Keywords -->
            <div v-if="auction.idKeywords" class="mt-4">
              <div class="text-sm text-muted-foreground mb-2">Item Keywords:</div>
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="keyword in auction.idKeywords.split(' ').filter(Boolean)"
                  :key="keyword"
                  variant="outline"
                  class="text-xs"
                >
                  {{ keyword }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Item Stats -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Info class="h-5 w-5" />
              Item Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="auction.objInfoText" class="overflow-x-auto">
              <pre class="text-xs lg:text-sm whitespace-pre-wrap font-mono bg-muted/50 p-3 lg:p-4 rounded-lg"><AnsiText :text="auction.objInfoText" /></pre>
            </div>
            <p v-else class="text-sm text-muted-foreground italic">
              Stats not available for this item. Items listed after the update will show detailed stats.
            </p>
          </CardContent>
        </Card>

        <!-- Bid History -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <History class="h-5 w-5" />
              Bid History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="!bidHistory || bidHistory.length === 0" class="text-center py-4 text-muted-foreground">
              No bids yet
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="bid in bidHistory"
                :key="bid.id"
                class="flex items-center justify-between py-2 border-b last:border-0 gap-3"
              >
                <div class="min-w-0 flex-1">
                  <div class="font-medium truncate">{{ bid.bidderName }}</div>
                  <div class="text-xs lg:text-sm text-muted-foreground">
                    {{ new Date(bid.date * 1000).toLocaleString() }}
                  </div>
                </div>
                <div class="text-right font-medium flex-shrink-0">
                  {{ formatPrice(bid.bidAmount) }}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Sidebar - Bid Form -->
      <div class="space-y-6 order-2">
        <!-- Bid Form Card -->
        <Card v-if="canBid">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Gavel class="h-5 w-5" />
              Place a Bid
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Character Selector -->
            <div class="space-y-2">
              <Label>Bidding Character</Label>
              <Select v-model="selectedCharacterPid">
                <SelectTrigger>
                  <SelectValue placeholder="Select character" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="char in userCharacters"
                    :key="char.pid"
                    :value="char.pid"
                  >
                    {{ char.name }} - {{ formatPrice(char.money) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Bid Amount - platinum only -->
            <div class="space-y-2">
              <Label>Bid Amount (Platinum)</Label>
              <div class="flex items-center gap-2">
                <Input
                  v-model.number="bidPlat"
                  type="number"
                  :min="minBidPlat"
                  class="text-center"
                />
                <span class="text-muted-foreground font-medium">p</span>
              </div>
              <p v-if="!bidMeetsMinimum" class="text-xs text-destructive">
                Minimum bid: {{ minBidPlat }}p
              </p>
            </div>
          </CardContent>
          <CardFooter class="flex flex-col gap-2">
            <Button
              class="w-full"
              :disabled="!bidMeetsMinimum || !selectedCharacterPid || placeBidMutation.isPending.value"
              @click="handlePlaceBid"
            >
              <Loader2 v-if="placeBidMutation.isPending.value" class="h-4 w-4 mr-2 animate-spin" />
              Place Bid
            </Button>

            <!-- Buy It Now Button -->
            <Button
              v-if="auction.buyPrice > 0"
              variant="secondary"
              class="w-full"
              :disabled="!selectedCharacterPid || buyNowMutation.isPending.value"
              @click="handleBuyNow"
            >
              <ShoppingCart class="h-4 w-4 mr-2" />
              <Loader2 v-if="buyNowMutation.isPending.value" class="h-4 w-4 mr-2 animate-spin" />
              Buy Now for {{ formatPrice(auction.buyPrice) }}
            </Button>
          </CardFooter>
        </Card>

        <!-- Login prompt -->
        <Card v-else-if="!user" class="border-dashed">
          <CardContent class="py-6 text-center">
            <Gavel class="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p class="text-muted-foreground">
              Log in to place bids on this auction.
            </p>
          </CardContent>
        </Card>

        <!-- Auction ended message -->
        <Card v-else-if="timeRemaining <= 0 || auction.status !== 'OPEN'" class="border-dashed">
          <CardContent class="py-6 text-center">
            <Clock class="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p class="text-muted-foreground">
              This auction has ended.
            </p>
          </CardContent>
        </Card>

        <!-- Admin Actions -->
        <Card v-if="isAdmin && auction.status === 'OPEN'">
          <CardHeader>
            <CardTitle class="text-sm text-muted-foreground">Admin Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" class="w-full">
                  <Trash2 class="h-4 w-4 mr-2" />
                  Remove Auction
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Auction?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the auction, return the item to the seller, and refund any bids.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    @click="handleRemoveAuction"
                    :disabled="removeAuctionMutation.isPending.value"
                  >
                    <Loader2 v-if="removeAuctionMutation.isPending.value" class="h-4 w-4 mr-2 animate-spin" />
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <!-- Pickup Reminder -->
        <Card class="bg-muted/50">
          <CardContent class="py-4">
            <p class="text-sm text-muted-foreground">
              <strong>Note:</strong> If you win an auction, pick up your item at any Auction House in-game using the <code class="bg-muted px-1 rounded">auction pickup</code> command.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
