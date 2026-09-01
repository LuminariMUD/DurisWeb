<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useSiteConfig } from '@/composables/useSiteConfig'
import type { WebSettingRow } from '@/types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import { Home, Image, Trash2, Upload } from 'lucide-vue-next'

const router = useRouter()
const { isOverlord, hasPermission } = useAuth()
const toast = useToast()
const { reloadConfig } = useSiteConfig()

const settings = ref<WebSettingRow[]>([])
const isLoading = ref(true)
const isSaving = ref<Record<string, boolean>>({})
const isUploadingHero = ref(false)
const isDeletingHero = ref(false)

const editedSettings = ref<Record<string, string>>({})
const heroFile = ref<File | null>(null)
const heroPreview = ref<string | null>(null)
const heroInputRef = ref<HTMLInputElement | null>(null)

// Get setting value by key
function getSettingValue(key: string): string {
  const setting = settings.value.find((s) => s.setting_key === key)
  return setting?.setting_value || ''
}

// Get hero image URL from settings
const currentHeroUrl = computed(() => getSettingValue('front_page_hero_image_url'))

// Hero enabled as boolean
const heroEnabled = computed({
  get: () => editedSettings.value.front_page_hero_enabled === 'true',
  set: (val: boolean) => {
    editedSettings.value.front_page_hero_enabled = val ? 'true' : 'false'
  },
})

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

    // Reload site config so front page updates
    await reloadConfig()

    toast.success('Setting updated successfully', 'Success')
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to update setting', 'Error')
  } finally {
    isSaving.value[key] = false
  }
}

function hasChanges(key: string): boolean {
  return editedSettings.value[key] !== getSettingValue(key)
}

// Hero image upload handling
function handleHeroSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    toast.error('Only JPG, PNG, and WebP images are allowed', 'Invalid File')
    return
  }

  // Validate file size (1MB)
  if (file.size > 1 * 1024 * 1024) {
    toast.error('Hero image must be under 1MB', 'File Too Large')
    return
  }

  heroFile.value = file

  // Create preview URL
  const reader = new FileReader()
  reader.onload = (e) => {
    heroPreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

async function uploadHero() {
  if (!heroFile.value) return

  isUploadingHero.value = true

  try {
    const { heroUrl } = await adminApi.uploadHeroImage(heroFile.value)

    // Update local state
    const setting = settings.value.find((s) => s.setting_key === 'front_page_hero_image_url')
    if (setting) {
      setting.setting_value = heroUrl
      editedSettings.value.front_page_hero_image_url = heroUrl
    }

    // Clear preview
    heroFile.value = null
    heroPreview.value = null
    if (heroInputRef.value) {
      heroInputRef.value.value = ''
    }

    // Reload site config so front page updates
    await reloadConfig()

    toast.success('Hero image uploaded successfully', 'Success')
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to upload hero image', 'Error')
  } finally {
    isUploadingHero.value = false
  }
}

async function deleteHero() {
  isDeletingHero.value = true

  try {
    await adminApi.deleteHeroImage()

    // Update local state
    const setting = settings.value.find((s) => s.setting_key === 'front_page_hero_image_url')
    if (setting) {
      setting.setting_value = ''
      editedSettings.value.front_page_hero_image_url = ''
    }

    // Reload site config so front page updates
    await reloadConfig()

    toast.success('Hero image deleted successfully', 'Success')
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to delete hero image', 'Error')
  } finally {
    isDeletingHero.value = false
  }
}

function cancelHeroUpload() {
  heroFile.value = null
  heroPreview.value = null
  if (heroInputRef.value) {
    heroInputRef.value.value = ''
  }
}

// Save front page content
async function saveFrontPageContent() {
  await saveSetting('front_page_content')
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
        <Home class="w-8 h-8 text-primary" />
        <div>
          <h1 class="text-3xl font-bold">Front Page Editor</h1>
          <p class="text-muted-foreground mt-1">
            Configure the front page hero banner and content
          </p>
        </div>
      </div>
      <Button variant="outline" @click="router.push('/admin/web-settings')">
        Back to Settings
      </Button>
    </div>

    <div class="space-y-6">
      <!-- Hero Banner Card -->
      <Card>
        <CardHeader>
          <CardTitle>Hero Banner</CardTitle>
          <CardDescription>
            Configure the hero banner displayed at the top of the front page
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-40 w-full mt-4" />
        </CardContent>
        <CardContent v-else class="space-y-6">
          <!-- Hero Banner Toggle -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label>Show Hero Banner</Label>
              <p class="text-xs text-muted-foreground">
                Display a hero banner at the top of the front page
              </p>
            </div>
            <div class="flex items-center gap-2">
              <Switch
                :model-value="heroEnabled"
                @update:model-value="(val: boolean) => heroEnabled = val"
                :disabled="isSaving.front_page_hero_enabled"
              />
              <Button
                @click="saveSetting('front_page_hero_enabled')"
                :disabled="isSaving.front_page_hero_enabled || !hasChanges('front_page_hero_enabled')"
                size="sm"
              >
                {{ isSaving.front_page_hero_enabled ? 'Saving...' : 'Save' }}
              </Button>
            </div>
          </div>

          <!-- Hero Title -->
          <div class="space-y-2">
            <Label for="front_page_hero_title">Hero Title</Label>
            <div class="flex gap-2">
              <Input
                id="front_page_hero_title"
                v-model="editedSettings.front_page_hero_title"
                type="text"
                :disabled="isSaving.front_page_hero_title"
                class="flex-1"
                maxlength="200"
              />
              <Button
                @click="saveSetting('front_page_hero_title')"
                :disabled="isSaving.front_page_hero_title || !hasChanges('front_page_hero_title')"
                size="sm"
              >
                {{ isSaving.front_page_hero_title ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Main title text displayed in the hero banner
            </p>
          </div>

          <!-- Hero Subtitle -->
          <div class="space-y-2">
            <Label for="front_page_hero_subtitle">Hero Subtitle</Label>
            <div class="flex gap-2">
              <Input
                id="front_page_hero_subtitle"
                v-model="editedSettings.front_page_hero_subtitle"
                type="text"
                :disabled="isSaving.front_page_hero_subtitle"
                class="flex-1"
                maxlength="200"
              />
              <Button
                @click="saveSetting('front_page_hero_subtitle')"
                :disabled="isSaving.front_page_hero_subtitle || !hasChanges('front_page_hero_subtitle')"
                size="sm"
              >
                {{ isSaving.front_page_hero_subtitle ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Subtitle text displayed below the main title
            </p>
          </div>

          <!-- Hero Image Upload Section -->
          <div class="space-y-4 pt-4 border-t">
            <div class="flex items-center gap-2">
              <Image class="w-4 h-4" />
              <Label>Hero Background Image</Label>
            </div>

            <!-- Current Hero Image Display -->
            <div v-if="currentHeroUrl && !heroPreview" class="space-y-2">
              <div class="border rounded-lg overflow-hidden bg-muted/30">
                <img :src="currentHeroUrl" alt="Current hero image" class="w-full h-40 object-cover" />
              </div>
              <Button
                variant="destructive"
                size="sm"
                @click="deleteHero"
                :disabled="isDeletingHero"
              >
                <Trash2 class="w-4 h-4 mr-2" />
                {{ isDeletingHero ? 'Deleting...' : 'Delete Hero Image' }}
              </Button>
            </div>

            <!-- Hero Preview (when new file selected) -->
            <div v-if="heroPreview" class="space-y-2">
              <div class="border rounded-lg overflow-hidden bg-muted/30 border-primary">
                <img :src="heroPreview" alt="Hero preview" class="w-full h-40 object-cover" />
              </div>
              <div class="flex gap-2">
                <Button
                  size="sm"
                  @click="uploadHero"
                  :disabled="isUploadingHero"
                >
                  <Upload class="w-4 h-4 mr-2" />
                  {{ isUploadingHero ? 'Uploading...' : 'Upload' }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  @click="cancelHeroUpload"
                  :disabled="isUploadingHero"
                >
                  Cancel
                </Button>
              </div>
            </div>

            <!-- File Input -->
            <div v-if="!heroPreview" class="space-y-2">
              <input
                ref="heroInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                @change="handleHeroSelect"
                class="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
              />
              <p class="text-xs text-muted-foreground">
                Background image for the hero banner. Recommended size: 1920x350px or larger. Max size: 1MB. Supported formats: JPG, PNG, WebP.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Content Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Page Content</CardTitle>
              <CardDescription>
                The main content displayed on the front page below the hero banner
              </CardDescription>
            </div>
            <Button
              @click="saveFrontPageContent"
              :disabled="isSaving.front_page_content || !hasChanges('front_page_content')"
            >
              {{ isSaving.front_page_content ? 'Saving...' : 'Save Content' }}
            </Button>
          </div>
        </CardHeader>
        <CardContent v-if="isLoading">
          <Skeleton class="h-60 w-full" />
        </CardContent>
        <CardContent v-else>
          <div class="frontpage-editor">
            <TipTapEditor
              :model-value="editedSettings.front_page_content || ''"
              @update:model-value="(val: string) => editedSettings.front_page_content = val"
              :max-length="100000"
              placeholder="Enter front page content..."
              :enable-widgets="true"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.frontpage-editor :deep(.prose) {
  background-color: black;
}

.frontpage-editor :deep(.ProseMirror) {
  background-color: black;
}

.frontpage-editor :deep(.column) {
  background-color: black;
}

.frontpage-editor :deep(.widget-container) {
  background-color: black;
}

.frontpage-editor :deep(.top-fragger-widget .bg-gray-800\/50) {
  background-color: transparent;
}
</style>
