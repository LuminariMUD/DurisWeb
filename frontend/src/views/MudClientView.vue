<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMudStore } from '@/stores/mudStore'
import { useAuth } from '@/composables/useAuth'
import { useOfflineStatus } from '@/composables/useOfflineStatus'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import MudLoginPanel from '@/components/mud/MudLoginPanel.vue'
import MudCharacterSelect from '@/components/mud/MudCharacterSelect.vue'
import MudCharacterCreate from '@/components/mud/chargen/MudCharacterCreate.vue'
import MudGameClient from '@/components/mud/MudGameClient.vue'
import MudReturnToMenuDialog from '@/components/mud/MudReturnToMenuDialog.vue'
import MudReconnectDialog from '@/components/mud/MudReconnectDialog.vue'
import CopyoverBanner from '@/components/mud/CopyoverBanner.vue'
import { Loader2, WifiOff, RefreshCw, AlertCircle } from 'lucide-vue-next'

type ClientState = 'connecting' | 'auto_login' | 'login' | 'character_select' | 'character_create' | 'in_game' | 'disconnected' | 'error'

const { connect, disconnect, requestChargenOptions, rollStats, addBonus, swapStats, getHometowns, validateName, createCharacter } = useMudConnection()
const store = useMudStore()
const { accountName: webAccountName } = useAuth()
const { isOffline, onOnline } = useOfflineStatus()

// show reconnect dialog when coming back online (if was disconnected)
onOnline(() => {
  if (store.connectionState === 'disconnected' || store.connectionState === 'error') {
    store.openReconnectDialog()
  }
})

// Local state for character creation mode
const isCreatingCharacter = ref(false)

// Reset character creation mode when entering the game
watch(() => store.connectionState, (newState) => {
  if (newState === 'in_game') {
    isCreatingCharacter.value = false
  }
})

const clientState = computed<ClientState>(() => {
  // During copyover, maintain the current view (don't switch to login)
  if (store.copyoverInProgress) {
    // if was in game or has character, keep showing game
    if (store.connectionState === 'in_game' || store.character) {
      return 'in_game'
    }
    // otherwise show connecting state with banner
    return 'connecting'
  }

  // Check for character creation mode first
  if (isCreatingCharacter.value && store.connectionState === 'authenticated') {
    return 'character_create'
  }

  // Check for auto-login in progress
  if (store.autoLoginInProgress && store.connectionState === 'authenticating') {
    return 'auto_login'
  }

  switch (store.connectionState) {
    case 'disconnected':
      // if was in game, keep showing game view with reconnect dialog overlay
      if (store.character) {
        return 'in_game'
      }
      return 'login'
    case 'connecting':
      return 'connecting'
    case 'connected':
    case 'authenticating':
      return 'login'
    case 'authenticated':
      return 'character_select'
    case 'in_game':
      return 'in_game'
    case 'error':
      return 'error'
    default:
      return 'login'
  }
})

const handleAuthenticated = () => {
  // State is managed by store - nothing else needed
}

const handleEntered = () => {
  // State is managed by store - nothing else needed
}

const handleCreateNew = () => {
  isCreatingCharacter.value = true
  requestChargenOptions()
}

const handleChargenCancel = () => {
  isCreatingCharacter.value = false
  store.clearChargenState()
}

const handleChargenRequestOptions = () => {
  requestChargenOptions()
}

const handleChargenRollStats = (raceId: number) => {
  rollStats(raceId)
}

const handleChargenAddBonus = (stat: string) => {
  addBonus(stat)
}

const handleChargenSwapStats = (stat1: string, stat2: string) => {
  swapStats(stat1, stat2)
}

const handleChargenGetHometowns = (raceId: number) => {
  getHometowns(raceId)
}

const handleChargenValidateName = (name: string) => {
  validateName(name)
}

const handleChargenCreate = (data: {
  name: string
  race: number
  class: number
  sex: number
  alignment?: string
  hometown?: number
  hardcore?: boolean
  newbie?: boolean
}) => {
  console.log('[MudClient] handleChargenCreate received:', data)
  const race = store.chargenRaces.find(r => r.id === data.race)
  console.log('[MudClient] Found race:', race)
  if (race) {
    createCharacter(
      data.name,
      data.race,  // Send ID, not name
      data.class, // Send ID, not name
      data.sex,
      data.alignment || (race.faction === 'good' ? 'good' : 'evil'),
      data.hometown,
      data.hardcore,
      data.newbie
    )
  } else {
    console.error('[MudClient] Race not found in chargenRaces:', store.chargenRaces)
  }
}

const handleLogout = () => {
  disconnect()
}

const handleReconnect = () => {
  connect()
}

const handleReconnectDialogClose = () => {
  // User chose to stay disconnected
}

const handleReconnectDialogReconnect = () => {
  // User chose to reconnect - handled by dialog
}

// Don't auto-connect - wait for user to submit login
onMounted(() => {
  // connection will happen when user clicks login/register
})

// Disconnect on unmount
onUnmounted(() => {
  // Keep connection alive - don't disconnect
  // disconnect()
})
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Copyover Banner (appears above all content) -->
    <CopyoverBanner />

    <!-- offline overlay -->
    <div
      v-if="isOffline"
      class="absolute inset-0 z-40 bg-gray-900/90 flex items-center justify-center"
    >
      <Card class="w-full max-w-96">
        <CardContent class="pt-6 text-center space-y-4">
          <WifiOff class="h-12 w-12 mx-auto text-amber-500" />
          <div>
            <p class="text-lg font-medium">you're offline</p>
            <p class="text-sm text-muted-foreground mt-1">
              the mud client requires an internet connection to play.
            </p>
          </div>
          <p class="text-xs text-muted-foreground">
            we'll automatically reconnect when you're back online.
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Connecting State -->
    <div
      v-if="clientState === 'connecting'"
      class="flex-1 flex items-center justify-center p-4"
    >
      <Card class="w-full max-w-80">
        <CardContent class="pt-6 text-center">
          <Loader2 class="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p class="text-lg font-medium">Connecting to NewDuris MUD...</p>
          <p class="text-sm text-muted-foreground mt-2">Please wait</p>
        </CardContent>
      </Card>
    </div>

    <!-- Auto-Login State -->
    <div
      v-else-if="clientState === 'auto_login'"
      class="flex-1 flex items-center justify-center p-4"
    >
      <Card class="w-full max-w-80">
        <CardContent class="pt-6 text-center">
          <Loader2 class="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p class="text-lg font-medium">Logging in as {{ webAccountName }}...</p>
          <p class="text-sm text-muted-foreground mt-2">Please wait</p>
        </CardContent>
      </Card>
    </div>

    <!-- Disconnected State -->
    <div
      v-else-if="clientState === 'disconnected'"
      class="flex-1 flex items-center justify-center p-4"
    >
      <Card class="w-full max-w-96">
        <CardContent class="pt-6 text-center space-y-4">
          <WifiOff class="h-12 w-12 mx-auto text-muted-foreground" />
          <div>
            <p class="text-lg font-medium">Disconnected</p>
            <p class="text-sm text-muted-foreground mt-1">
              Connection to the MUD server was lost.
            </p>
          </div>
          <Button @click="handleReconnect" class="w-full">
            <RefreshCw class="h-4 w-4 mr-2" />
            Reconnect
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- Error State -->
    <div
      v-else-if="clientState === 'error'"
      class="flex-1 flex items-center justify-center p-4"
    >
      <Card class="w-full max-w-96">
        <CardContent class="pt-6 space-y-4">
          <Alert variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>
              {{ store.connectionError || 'An error occurred while connecting to the server.' }}
            </AlertDescription>
          </Alert>
          <Button @click="handleReconnect" class="w-full">
            <RefreshCw class="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- Login State -->
    <div
      v-else-if="clientState === 'login'"
      class="flex-1 flex items-center justify-center p-4"
    >
      <MudLoginPanel @authenticated="handleAuthenticated" />
    </div>

    <!-- Character Select State -->
    <div
      v-else-if="clientState === 'character_select'"
      class="flex-1 flex items-center justify-center p-4"
    >
      <MudCharacterSelect
        @entered="handleEntered"
        @create-new="handleCreateNew"
        @logout="handleLogout"
      />
    </div>

    <!-- Character Creation State -->
    <div
      v-else-if="clientState === 'character_create'"
      class="flex-1 flex items-center justify-center p-4"
    >
      <MudCharacterCreate
        :races="store.chargenRaces"
        :stats="store.chargenStats"
        :loading="store.chargenLoading"
        :error="store.chargenError"
        :hometowns="store.chargenHometowns"
        :has-hometown-choice="store.chargenHasHometownChoice"
        :name-valid="store.chargenNameValid"
        :name-message="store.chargenNameMessage"
        @request-options="handleChargenRequestOptions"
        @roll-stats="handleChargenRollStats"
        @add-bonus="handleChargenAddBonus"
        @swap-stats="handleChargenSwapStats"
        @get-hometowns="handleChargenGetHometowns"
        @validate-name="handleChargenValidateName"
        @create-character="handleChargenCreate"
        @cancel="handleChargenCancel"
      />
    </div>

    <!-- In-Game State -->
    <MudGameClient
      v-else-if="clientState === 'in_game'"
      class="flex-1"
      @logout="handleLogout"
    />

    <!-- Return to Menu Dialog (overlays on game UI after death/rent/quit) -->
    <MudReturnToMenuDialog />

    <!-- Reconnect Dialog -->
    <MudReconnectDialog
      @reconnect="handleReconnectDialogReconnect"
      @close="handleReconnectDialogClose"
    />
  </div>
</template>

<style scoped>
/* Full height layout - use parent container height */
</style>
