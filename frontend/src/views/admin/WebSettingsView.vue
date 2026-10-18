<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import type { WebSettingRow, DiscordDeliveryStatus } from '@/types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Cog,
  Globe,
  Image,
  Clock,
  Server,
  Trash2,
  Upload,
  Shield,
  Info,
  MessageSquare,
} from '@lucide/vue'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const router = useRouter()
const { isOverlord, isGreaterGod, hasPermission } = useAuth()
const toast = useToast()

const settings = ref<WebSettingRow[]>([])
const isLoading = ref(true)
const isSaving = ref<Record<string, boolean>>({})
const isUploadingLogo = ref(false)
const isDeletingLogo = ref(false)

const editedSettings = ref<Record<string, string>>({})
const logoFile = ref<File | null>(null)
const logoPreview = ref<string | null>(null)
const logoInputRef = ref<HTMLInputElement | null>(null)

// Get setting value by key
function getSettingValue(key: string): string {
  const setting = settings.value.find((s) => s.setting_key === key)
  return setting?.setting_value || ''
}

// Get logo URL from settings
const currentLogoUrl = computed(() => getSettingValue('site_logo_url'))

async function loadSettings() {
  isLoading.value = true

  try {
    settings.value = await adminApi.getWebSettings()
    // Initialize edited settings
    settings.value.forEach((setting) => {
      editedSettings.value[setting.setting_key] = setting.setting_value
    })
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to load settings', 'Error')
  } finally {
    isLoading.value = false
  }
}

async function saveSetting(key: string) {
  isSaving.value[key] = true

  try {
    const value = editedSettings.value[key] ?? ''
    await adminApi.updateWebSetting(key, value)

    // Update local state
    const setting = settings.value.find((s) => s.setting_key === key)
    if (setting) {
      setting.setting_value = value
    }

    toast.success(`Setting '${getSettingLabel(key)}' updated successfully`, 'Success')
    if (key === 'discord_webhook_enabled') await loadDiscordStatus()
  } catch (err: any) {
    if (key === 'discord_webhook_enabled') editedSettings.value[key] = getSettingValue(key)
    toast.error(err.response?.data?.error || 'Failed to update setting', 'Error')
  } finally {
    isSaving.value[key] = false
  }
}

/** Returns the operator-facing label for an editable public setting. */
function getSettingLabel(key: string): string {
  const labels: Record<string, string> = {
    pvp_delay_minutes: 'PvP Log Delay (minutes)',
    mud_host: 'MUD Server Host',
    mud_port: 'MUD Server Port',
    mud_port_tls: 'MUD Server TLS Port',
    mud_ws_url: 'MUD WebSocket URL',
    site_title: 'Website Title',
    site_logo_url: 'Website Logo URL',
    support_url: 'Support URL',
    respect_webinfo_toggle: 'Respect Player Webinfo Toggle',
  }
  return labels[key] || key
}

/** Explains the runtime effect and accepted shape of an editable public setting. */
function getSettingDescription(key: string): string {
  const descriptions: Record<string, string> = {
    pvp_delay_minutes:
      'How long to wait before showing new PvP battles on the website. Set to 0 for instant display.',
    mud_host: 'The hostname displayed on the website for players to connect.',
    mud_port: 'The port number displayed on the website for players to connect.',
    mud_port_tls:
      'Optional direct TLS/SSL MUD port displayed on the website. Leave blank when unavailable.',
    mud_ws_url: 'The complete wss: URL used by the browser-based MUD client.',
    site_title: 'The name of your website displayed in the navbar and browser tab.',
    site_logo_url: 'The logo image displayed before the site title in the navbar.',
    support_url: 'Optional public HTTP or HTTPS support/donation page.',
    respect_webinfo_toggle:
      'When enabled, a saved "toggle webinfo off" hides extended character details and previously permitted PvP logs, equipment, and quotes. "toggle webinfo on" enables sharing. PvP snapshots recorded as private or with unknown permission stay hidden even when this setting is disabled. This does not restrict which public battles a player can view. Refresh open pages after changes.',
  }
  return descriptions[key] || ''
}

function hasChanges(key: string): boolean {
  return editedSettings.value[key] !== getSettingValue(key)
}

// Logo upload handling
function handleLogoSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  if (!allowedTypes.includes(file.type)) {
    toast.error('Only JPG, PNG, WebP, and SVG images are allowed', 'Invalid File')
    return
  }

  // Validate file size (2MB)
  if (file.size > 2 * 1024 * 1024) {
    toast.error('Logo must be under 2MB', 'File Too Large')
    return
  }

  logoFile.value = file

  // Create preview URL
  const reader = new FileReader()
  reader.onload = (e) => {
    logoPreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

async function uploadLogo() {
  if (!logoFile.value) return

  isUploadingLogo.value = true

  try {
    const { logoUrl } = await adminApi.uploadSiteLogo(logoFile.value)

    // Update local state
    const setting = settings.value.find((s) => s.setting_key === 'site_logo_url')
    if (setting) {
      setting.setting_value = logoUrl
      editedSettings.value.site_logo_url = logoUrl
    }

    // Clear preview
    logoFile.value = null
    logoPreview.value = null
    if (logoInputRef.value) {
      logoInputRef.value.value = ''
    }

    toast.success('Logo uploaded successfully', 'Success')
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to upload logo', 'Error')
  } finally {
    isUploadingLogo.value = false
  }
}

async function deleteLogo() {
  isDeletingLogo.value = true

  try {
    await adminApi.deleteSiteLogo()

    // Update local state
    const setting = settings.value.find((s) => s.setting_key === 'site_logo_url')
    if (setting) {
      setting.setting_value = ''
      editedSettings.value.site_logo_url = ''
    }

    toast.success('Logo deleted successfully', 'Success')
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to delete logo', 'Error')
  } finally {
    isDeletingLogo.value = false
  }
}

function cancelLogoUpload() {
  logoFile.value = null
  logoPreview.value = null
  if (logoInputRef.value) {
    logoInputRef.value.value = ''
  }
}

// Discord bot testing
const isTestingDiscord = ref(false)
const discordStatus = ref<DiscordDeliveryStatus | null>(null)
const discordStatusError = ref('')
const isLoadingDiscord = ref(false)
const isRetryingDiscord = ref(false)
const discordRefreshButton = ref<{ $el: HTMLElement } | null>(null)

async function loadDiscordStatus() {
  isLoadingDiscord.value = true
  discordStatusError.value = ''
  try {
    discordStatus.value = await adminApi.getDiscordDeliveryStatus()
  } catch {
    discordStatus.value = null
    discordStatusError.value = 'Delivery status is unavailable. Refresh to check again.'
  } finally {
    isLoadingDiscord.value = false
  }
}

async function retryDiscordDeliveries() {
  if (isRetryingDiscord.value) return
  isRetryingDiscord.value = true
  try {
    await adminApi.retryFailedDiscordDeliveries()
    toast.success('Failed deliveries queued. Paused posting stays paused.', 'Success')
    await loadDiscordStatus()
  } catch {
    toast.error('Unable to queue failed deliveries. Refresh status before trying again.', 'Error')
    await loadDiscordStatus()
  } finally {
    isRetryingDiscord.value = false
    await nextTick()
    discordRefreshButton.value?.$el.focus()
  }
}

function discordErrorLabel(code: string | null): string {
  const labels: Record<string, string> = {
    unauthorized: 'Check the bot token, then retry failed deliveries.',
    forbidden: 'Check the bot channel permissions, then retry failed deliveries.',
    not_found: 'Check the configured channel, then retry failed deliveries.',
    not_configured: 'Configure the bot before retrying.',
    destination_changed: 'Delivery belongs to a different channel.',
    invalid_payload: 'Battle content needs attention before retrying.',
    http_error: 'Discord rejected the request. Check configuration before retrying.',
    rate_limited: 'Waiting for Discord rate limit to expire.',
    network_error: 'Connection failed; automatic retry is scheduled.',
    server_error: 'Discord is unavailable; automatic retry is scheduled.',
    invalid_response: 'Discord acceptance was not confirmed; retry is scheduled.',
    interrupted: 'An interrupted attempt will be retried.',
    busy: 'Another message is sending; retry is scheduled.',
  }
  return code ? labels[code] || 'Delivery needs attention.' : 'Waiting for delivery.'
}

function deliveryTime(value: string): string {
  return new Date(value).toLocaleString()
}

async function testDiscordBot() {
  isTestingDiscord.value = true
  try {
    const result = await adminApi.testDiscordBot()
    if (result.success) {
      toast.success('Test message sent to Discord!', 'Success')
    } else {
      toast.error(result.error || 'Failed to send test message', 'Error')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to test Discord bot', 'Error')
  } finally {
    isTestingDiscord.value = false
  }
}

onMounted(async () => {
  if (!isOverlord.value && !hasPermission('manage_front_page')) {
    router.push('/forum')
    return
  }
  await Promise.all([loadSettings(), loadDiscordStatus()])
})
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Cog class="w-8 h-8 text-primary" />
        <div>
          <h1 class="text-4xl md:text-5xl">Web Settings</h1>
          <p class="text-muted-foreground mt-1">
            Configure website branding, PvP display, and server information
          </p>
        </div>
      </div>
      <Button v-if="isGreaterGod" variant="outline" @click="router.push('/admin/dashboard')">
        Back to Dashboard
      </Button>
    </div>

    <div class="space-y-6">
      <!-- PvP Settings Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Clock class="w-5 h-5" />
            <CardTitle>PvP Log Display</CardTitle>
          </div>
          <CardDescription>
            Control when PvP battle logs appear on the website
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading">
          <Skeleton class="h-20 w-full" />
        </CardContent>
        <CardContent v-else class="space-y-4">
          <div class="space-y-2">
            <Label for="pvp_delay_minutes">{{ getSettingLabel('pvp_delay_minutes') }}</Label>
            <div class="flex gap-2">
              <Input
                id="pvp_delay_minutes"
                v-model="editedSettings.pvp_delay_minutes"
                type="number"
                min="0"
                max="1440"
                :disabled="isSaving.pvp_delay_minutes"
                class="flex-1 max-w-[200px]"
              />
              <Button
                @click="saveSetting('pvp_delay_minutes')"
                :disabled="isSaving.pvp_delay_minutes || !hasChanges('pvp_delay_minutes')"
                size="sm"
              >
                {{ isSaving.pvp_delay_minutes ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('pvp_delay_minutes') }}
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Privacy Settings Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Shield class="w-5 h-5" />
            <CardTitle>Privacy Settings</CardTitle>
          </div>
          <CardDescription>
            Control how player privacy preferences are handled on the website
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading">
          <Skeleton class="h-20 w-full" />
        </CardContent>
        <CardContent v-else class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <Label for="respect_webinfo_toggle">{{ getSettingLabel('respect_webinfo_toggle') }}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Info class="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" class="max-w-xs">
                      <p class="font-semibold mb-2">fields hidden when enabled:</p>
                      <p class="text-sm mb-1"><span class="font-medium">character profile:</span> money, balance, playtime, epics, forum posts, pvp k/d stats</p>
                      <p class="text-sm"><span class="font-medium">pvp battle detail:</span> combat log, equipment, and linked quotes</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p class="text-xs text-muted-foreground max-w-md">
                {{ getSettingDescription('respect_webinfo_toggle') }}
              </p>
            </div>
            <Switch
              id="respect_webinfo_toggle"
              :model-value="editedSettings.respect_webinfo_toggle !== 'false'"
              :disabled="isSaving.respect_webinfo_toggle"
              @update:model-value="(val: boolean) => {
                editedSettings.respect_webinfo_toggle = val ? 'true' : 'false'
                saveSetting('respect_webinfo_toggle')
              }"
            />
          </div>
        </CardContent>
      </Card>

      <!-- Discord Integration Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <MessageSquare class="w-5 h-5" />
            <CardTitle>Discord Integration</CardTitle>
          </div>
          <CardDescription>
            Post PvP battles to the configured Discord bot channel
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading">
          <Skeleton class="h-20 w-full" />
        </CardContent>
        <CardContent v-else class="space-y-4">
          <!-- Enable/Disable Toggle -->
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label for="discord_webhook_enabled">Auto-post battles to Discord</Label>
              <p class="text-xs text-muted-foreground">
                First enable starts with future battles. Pausing retains a backlog; resuming sends it after the visibility delay.
              </p>
            </div>
            <Switch
              id="discord_webhook_enabled"
              :model-value="editedSettings.discord_webhook_enabled === 'true'"
              :disabled="isSaving.discord_webhook_enabled"
              @update:model-value="(val: boolean) => {
                editedSettings.discord_webhook_enabled = val ? 'true' : 'false'
                saveSetting('discord_webhook_enabled')
              }"
            />
          </div>

          <section aria-label="Discord delivery status" class="space-y-3 border-t pt-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-lg font-semibold">Delivery status</h3>
              <Button ref="discordRefreshButton" variant="outline" size="sm" :disabled="isLoadingDiscord || isRetryingDiscord" @click="loadDiscordStatus">
                {{ isLoadingDiscord ? 'Refreshing...' : 'Refresh status' }}
              </Button>
            </div>
            <p v-if="discordStatusError" role="alert" class="text-destructive">{{ discordStatusError }}</p>
            <p v-else-if="!discordStatus" role="status">Loading delivery status...</p>
            <template v-else>
              <p v-if="!discordStatus.configured" role="status">Discord bot is not configured.</p>
              <template v-else>
                <p class="text-sm break-words">
                  Channel {{ discordStatus.channelId }} · {{ discordStatus.enabled ? 'Automatic posting enabled' : 'Automatic posting paused' }}
                </p>
                <p v-if="!discordStatus.activated" class="text-sm text-muted-foreground">This channel has not started automatic delivery. Existing battles will not be backfilled on first enable.</p>
                <p v-if="discordStatus.blockedReason" role="alert" class="text-destructive">
                  Automatic delivery is blocked. {{ discordErrorLabel(discordStatus.blockedReason) }}
                </p>
                <dl class="grid grid-cols-3 gap-3 text-sm">
                  <div><dt class="text-muted-foreground">Pending</dt><dd class="font-semibold">{{ discordStatus.pending }}</dd></div>
                  <div><dt class="text-muted-foreground">Failed</dt><dd class="font-semibold">{{ discordStatus.failed }}</dd></div>
                  <div><dt class="text-muted-foreground">Uncertain attempts</dt><dd class="font-semibold">{{ discordStatus.uncertain }}</dd></div>
                </dl>
                <p v-if="discordStatus.lastAutomaticSuccess" class="text-sm">
                  Last automatic success: <RouterLink :to="`/pvp/${discordStatus.lastAutomaticSuccess.eventId}`" class="underline">battle #{{ discordStatus.lastAutomaticSuccess.eventId }}</RouterLink>
                  · {{ deliveryTime(discordStatus.lastAutomaticSuccess.at) }}
                </p>
                <p v-else class="text-sm text-muted-foreground">No confirmed automatic delivery yet.</p>
                <p v-if="discordStatus.nextAttemptAt && discordStatus.pending" class="text-sm text-muted-foreground">Destination cooldown ends {{ deliveryTime(discordStatus.nextAttemptAt) }}. Individual attempts may have later deadlines. Checks run every 30 seconds while enabled.</p>
                <p v-if="discordStatus.uncertain" class="text-sm text-warning">An interrupted attempt may have reached Discord. Retrying can create a duplicate.</p>
                <Button v-if="discordStatus.failed || discordStatus.blockedReason" size="sm" :disabled="isRetryingDiscord || isLoadingDiscord" @click="retryDiscordDeliveries">
                  {{ isRetryingDiscord ? 'Queuing...' : 'Retry failed deliveries' }}
                </Button>
                <ul v-if="discordStatus.outstanding.length" class="space-y-2 text-sm">
                  <li v-for="delivery in discordStatus.outstanding" :key="delivery.eventId" class="border-t pt-2 break-words">
                    <RouterLink :to="`/pvp/${delivery.eventId}`" class="underline">Battle #{{ delivery.eventId }}</RouterLink>
                    · {{ delivery.status }} · {{ delivery.attempts }} attempts
                    <p>{{ delivery.errorCode ? discordErrorLabel(delivery.errorCode) : delivery.status === 'delivered' ? 'Delivery confirmed after an uncertain attempt.' : 'Waiting for delivery.' }}</p>
                    <p v-if="delivery.status === 'pending'" class="text-muted-foreground">Retry no earlier than {{ deliveryTime(delivery.nextAttemptAt) }}.</p>
                    <p v-else-if="delivery.status === 'sending'" class="text-muted-foreground">Attempt recovery no earlier than {{ deliveryTime(delivery.nextAttemptAt) }} if no receipt is saved.</p>
                  </li>
                </ul>
                <p v-else-if="discordStatus.pending" class="text-sm text-muted-foreground">Pending battles will appear here after the next delivery check.</p>
                <p v-else class="text-sm text-muted-foreground">No outstanding deliveries.</p>
                <p v-if="discordStatus.outstanding.length === 50" class="text-xs text-muted-foreground">Showing the 50 most recent entries requiring attention.</p>
              </template>
              <ul v-if="discordStatus.otherDestinations.length" class="text-sm text-muted-foreground space-y-1">
                <li v-for="destination in discordStatus.otherDestinations" :key="destination.channelId" class="break-words">Channel {{ destination.channelId }} retains {{ destination.outstanding }} outstanding deliveries. They will not be sent to the current channel.</li>
              </ul>
            </template>
          </section>

          <div class="space-y-2">
            <Button
              variant="outline"
              size="sm"
              @click="testDiscordBot"
              :disabled="isTestingDiscord"
            >
              {{ isTestingDiscord ? 'Sending...' : 'Send test message' }}
            </Button>
            <p class="text-xs text-muted-foreground">
              Sends a test message to the bot's configured channel. You can also post individual battles using the Discord button on a PvP log.
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- MUD Server Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Server class="w-5 h-5" />
            <CardTitle>MUD Server Address</CardTitle>
          </div>
          <CardDescription>
            The server address displayed on the website for players to connect
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-20 w-full mt-4" />
        </CardContent>
        <CardContent v-else class="space-y-6">
          <div class="space-y-2">
            <Label for="mud_host">{{ getSettingLabel('mud_host') }}</Label>
            <div class="flex gap-2">
              <Input
                id="mud_host"
                v-model="editedSettings.mud_host"
                type="text"
                :disabled="isSaving.mud_host"
                class="flex-1 max-w-[300px]"
              />
              <Button
                @click="saveSetting('mud_host')"
                :disabled="isSaving.mud_host || !hasChanges('mud_host')"
                size="sm"
              >
                {{ isSaving.mud_host ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('mud_host') }}
            </p>
          </div>

          <div class="space-y-2">
            <Label for="mud_port">{{ getSettingLabel('mud_port') }}</Label>
            <div class="flex gap-2">
              <Input
                id="mud_port"
                v-model="editedSettings.mud_port"
                type="number"
                min="1"
                max="65535"
                :disabled="isSaving.mud_port"
                class="flex-1 max-w-[150px]"
              />
              <Button
                @click="saveSetting('mud_port')"
                :disabled="isSaving.mud_port || !hasChanges('mud_port')"
                size="sm"
              >
                {{ isSaving.mud_port ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('mud_port') }}
            </p>
          </div>

          <div class="space-y-2">
            <Label for="mud_port_tls">{{ getSettingLabel('mud_port_tls') }}</Label>
            <div class="flex gap-2">
              <Input
                id="mud_port_tls"
                v-model="editedSettings.mud_port_tls"
                type="number"
                min="1"
                max="65535"
                :disabled="isSaving.mud_port_tls"
                class="flex-1 max-w-[150px]"
              />
              <Button
                @click="saveSetting('mud_port_tls')"
                :disabled="isSaving.mud_port_tls || !hasChanges('mud_port_tls')"
                size="sm"
              >
                {{ isSaving.mud_port_tls ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('mud_port_tls') }}
            </p>
          </div>

          <div class="space-y-2">
            <Label for="mud_ws_url">{{ getSettingLabel('mud_ws_url') }}</Label>
            <div class="flex gap-2">
              <Input
                id="mud_ws_url"
                v-model="editedSettings.mud_ws_url"
                type="url"
                :disabled="isSaving.mud_ws_url || !isOverlord"
                class="flex-1 max-w-[300px]"
              />
              <Button
                @click="saveSetting('mud_ws_url')"
                :disabled="isSaving.mud_ws_url || !isOverlord || !hasChanges('mud_ws_url')"
                size="sm"
              >
                {{ isSaving.mud_ws_url ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('mud_ws_url') }}
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Branding Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Globe class="w-5 h-5" />
            <CardTitle>Website Branding</CardTitle>
          </div>
          <CardDescription>
            Configure the website title and logo
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-40 w-full mt-4" />
        </CardContent>
        <CardContent v-else class="space-y-6">
          <div class="space-y-2">
            <Label for="site_title">{{ getSettingLabel('site_title') }}</Label>
            <div class="flex gap-2">
              <Input
                id="site_title"
                v-model="editedSettings.site_title"
                type="text"
                :disabled="isSaving.site_title"
                class="flex-1 max-w-[300px]"
              />
              <Button
                @click="saveSetting('site_title')"
                :disabled="isSaving.site_title || !hasChanges('site_title')"
                size="sm"
              >
                {{ isSaving.site_title ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('site_title') }}
            </p>
          </div>

          <div class="space-y-2">
            <Label for="support_url">{{ getSettingLabel('support_url') }}</Label>
            <div class="flex gap-2">
              <Input
                id="support_url"
                v-model="editedSettings.support_url"
                type="url"
                :disabled="isSaving.support_url"
                class="flex-1 max-w-[400px]"
              />
              <Button
                @click="saveSetting('support_url')"
                :disabled="isSaving.support_url || !hasChanges('support_url')"
                size="sm"
              >
                {{ isSaving.support_url ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('support_url') }}
            </p>
          </div>

          <!-- Logo Upload Section -->
          <div class="space-y-4 pt-4 border-t">
            <div class="flex items-center gap-2">
              <Image class="w-4 h-4" />
              <Label>Website Logo</Label>
            </div>

            <!-- Current Logo Display -->
            <div v-if="currentLogoUrl && !logoPreview" class="flex items-center gap-4">
              <div class="border rounded-lg p-2 bg-muted/30">
                <img :src="currentLogoUrl" alt="Current logo" class="h-16 max-w-[200px] object-contain" />
              </div>
              <Button
                variant="destructive"
                size="sm"
                @click="deleteLogo"
                :disabled="isDeletingLogo"
              >
                <Trash2 class="w-4 h-4 mr-2" />
                {{ isDeletingLogo ? 'Deleting...' : 'Delete Logo' }}
              </Button>
            </div>

            <!-- Logo Preview (when new file selected) -->
            <div v-if="logoPreview" class="flex items-center gap-4">
              <div class="border rounded-lg p-2 bg-muted/30 border-primary">
                <img :src="logoPreview" alt="Logo preview" class="h-16 max-w-[200px] object-contain" />
              </div>
              <div class="flex gap-2">
                <Button
                  size="sm"
                  @click="uploadLogo"
                  :disabled="isUploadingLogo"
                >
                  <Upload class="w-4 h-4 mr-2" />
                  {{ isUploadingLogo ? 'Uploading...' : 'Upload' }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  @click="cancelLogoUpload"
                  :disabled="isUploadingLogo"
                >
                  Cancel
                </Button>
              </div>
            </div>

            <!-- File Input -->
            <div v-if="!logoPreview" class="space-y-2">
              <input
                ref="logoInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                @change="handleLogoSelect"
                class="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
              />
              <p class="text-xs text-muted-foreground">
                {{ getSettingDescription('site_logo_url') }} Max size: 2MB. Supported formats: JPG, PNG, WebP, SVG.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
