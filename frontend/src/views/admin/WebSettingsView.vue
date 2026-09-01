<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import type { WebSettingRow } from '@/types'
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
} from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const router = useRouter()
const { isOverlord, hasPermission } = useAuth()
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
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to update setting', 'Error')
  } finally {
    isSaving.value[key] = false
  }
}

function getSettingLabel(key: string): string {
  const labels: Record<string, string> = {
    pvp_delay_minutes: 'PvP Log Delay (minutes)',
    mud_host: 'MUD Server Host',
    mud_port: 'MUD Server Port',
    mud_port_tls: 'MUD Server TLS Port',
    mud_ws_port: 'MUD WebSocket Port',
    site_title: 'Website Title',
    site_logo_url: 'Website Logo URL',
    respect_webinfo_toggle: 'Respect Player Webinfo Toggle',
  }
  return labels[key] || key
}

function getSettingDescription(key: string): string {
  const descriptions: Record<string, string> = {
    pvp_delay_minutes:
      'How long to wait before showing new PvP battles on the website. Set to 0 for instant display.',
    mud_host: 'The hostname displayed on the website for players to connect.',
    mud_port: 'The port number displayed on the website for players to connect.',
    mud_port_tls: 'The TLS/SSL port number displayed on the website for secure connections.',
    mud_ws_port: 'The WebSocket port used by the web-based MUD client.',
    site_title: 'The name of your website displayed in the navbar and browser tab.',
    site_logo_url: 'The logo image displayed before the site title in the navbar.',
    respect_webinfo_toggle:
      'When enabled, hides extended character info (equipment, money, playtime, etc.) for players who have "tog web info" set to OFF. When disabled, all info is shown regardless of player preference. Note: existing pages need to be refreshed to see changes.',
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

// discord webhook testing
const isTestingWebhook = ref(false)

async function testDiscordWebhook() {
  const webhookUrl = editedSettings.value.discord_webhook_url
  if (!webhookUrl) {
    toast.error('Please enter a webhook URL first', 'Error')
    return
  }

  isTestingWebhook.value = true
  try {
    const result = await adminApi.testDiscordWebhook(webhookUrl)
    if (result.success) {
      toast.success('Test message sent to Discord!', 'Success')
    } else {
      toast.error(result.error || 'Failed to send test message', 'Error')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to test webhook', 'Error')
  } finally {
    isTestingWebhook.value = false
  }
}

onMounted(async () => {
  if (!isOverlord.value && !hasPermission('manage_front_page')) {
    router.push('/forum')
    return
  }
  await loadSettings()
})
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Cog class="w-8 h-8 text-primary" />
        <div>
          <h1 class="text-3xl font-bold">Web Settings</h1>
          <p class="text-muted-foreground mt-1">
            Configure website branding, PvP display, and server information
          </p>
        </div>
      </div>
      <Button variant="outline" @click="router.push('/admin/dashboard')">
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
                      <p class="text-sm"><span class="font-medium">pvp battle detail:</span> equipment</p>
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
            Post PvP battles to a Discord channel via webhook
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
                Automatically post new PvP battles to Discord
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

          <!-- Webhook URL Input -->
          <div class="space-y-2">
            <Label for="discord_webhook_url">Discord Webhook URL</Label>
            <div class="flex gap-2">
              <Input
                id="discord_webhook_url"
                v-model="editedSettings.discord_webhook_url"
                type="password"
                placeholder="https://discord.com/api/webhooks/..."
                :disabled="isSaving.discord_webhook_url"
                class="flex-1"
              />
              <Button
                @click="saveSetting('discord_webhook_url')"
                :disabled="isSaving.discord_webhook_url || !hasChanges('discord_webhook_url')"
                size="sm"
              >
                {{ isSaving.discord_webhook_url ? 'Saving...' : 'Save' }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                @click="testDiscordWebhook"
                :disabled="isTestingWebhook || !editedSettings.discord_webhook_url"
              >
                {{ isTestingWebhook ? 'Testing...' : 'Test' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Create a webhook in your Discord channel settings. The URL should start with https://discord.com/api/webhooks/
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
            <Label for="mud_ws_port">{{ getSettingLabel('mud_ws_port') }}</Label>
            <div class="flex gap-2">
              <Input
                id="mud_ws_port"
                v-model="editedSettings.mud_ws_port"
                type="number"
                min="1"
                max="65535"
                :disabled="isSaving.mud_ws_port"
                class="flex-1 max-w-[150px]"
              />
              <Button
                @click="saveSetting('mud_ws_port')"
                :disabled="isSaving.mud_ws_port || !hasChanges('mud_ws_port')"
                size="sm"
              >
                {{ isSaving.mud_ws_port ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ getSettingDescription('mud_ws_port') }}
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
