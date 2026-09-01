<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import type { ForumSettings, AuditLogEntry } from '@/types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ROLE_OPTIONS, getRoleLabel } from '@/utils/roleMapping'
import { Shield, Lock, Users, Settings, History } from 'lucide-vue-next'

const router = useRouter()
const { isOverlord } = useAuth()
const toast = useToast()

const settings = ref<ForumSettings | null>(null)
const auditLog = ref<AuditLogEntry[]>([])
const isLoading = ref(true)
const isSaving = ref<Record<string, boolean>>({})

const editedSettings = ref<Record<string, string>>({})

async function loadSettings() {
  isLoading.value = true

  try {
    settings.value = await adminApi.getSettings()
    // Initialize edited settings
    if (settings.value) {
      editedSettings.value = {
        min_level_to_moderate: settings.value.min_level_to_moderate.toString(),
        min_level_to_ban: settings.value.min_level_to_ban.toString(),
        min_level_to_pin: settings.value.min_level_to_pin.toString(),
        min_level_to_lock: settings.value.min_level_to_lock.toString(),
        min_level_to_delete_any_post: settings.value.min_level_to_delete_any_post.toString(),
        min_level_immortal_forum: settings.value.min_level_immortal_forum.toString(),
        min_level_god_forum: settings.value.min_level_god_forum.toString(),
        allow_mortal_posts: settings.value.allow_mortal_posts ? '1' : '0',
        post_rate_limit: settings.value.post_rate_limit.toString(),
        thread_rate_limit: settings.value.thread_rate_limit.toString(),
      }
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to load settings', 'Error')
  } finally {
    isLoading.value = false
  }
}

async function loadAuditLog() {
  try {
    auditLog.value = await adminApi.getAuditLog(50)
  } catch {}
}

async function saveSetting(key: string) {
  isSaving.value[key] = true

  try {
    const value = editedSettings.value[key]
    if (!value) {
      toast.error('Setting value is required', 'Error')
      return
    }

    await adminApi.updateSetting(key, value)

    // Update only the specific setting in local state
    if (settings.value) {
      const numValue = Number(value)
      if (!isNaN(numValue)) {
        ;(settings.value as any)[key] = numValue
      } else {
        ;(settings.value as any)[key] = value === '1' ? true : value === '0' ? false : value
      }
    }

    toast.success(`Setting '${getSettingLabel(key)}' updated successfully`, 'Success')

    // Reload audit log to show the change
    await loadAuditLog()
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to update setting', 'Error')
  } finally {
    isSaving.value[key] = false
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString()
}

function getSettingLabel(key: string): string {
  const labels: Record<string, string> = {
    min_level_to_moderate: 'Minimum Level to Moderate',
    min_level_to_ban: 'Minimum Level to Ban',
    min_level_to_pin: 'Minimum Level to Pin Threads',
    min_level_to_lock: 'Minimum Level to Lock Threads',
    min_level_to_delete_any_post: 'Minimum Level to Delete Any Post',
    min_level_immortal_forum: 'Minimum Level for Immortal Forum',
    min_level_god_forum: 'Minimum Level for God Forum',
    allow_mortal_posts: 'Allow Mortal Posts',
    post_rate_limit: 'Post Rate Limit (per minute)',
    thread_rate_limit: 'Thread Rate Limit (per hour)',
  }
  return labels[key] || key
}

function isBooleanSetting(key: string): boolean {
  return key.startsWith('allow_')
}

// Grouped settings for better organization
const moderationSettings = computed(() => [
  'min_level_to_moderate',
  'min_level_to_ban',
  'min_level_to_pin',
  'min_level_to_lock',
  'min_level_to_delete_any_post',
])

const forumAccessSettings = computed(() => ['min_level_immortal_forum', 'min_level_god_forum'])

const generalSettings = computed(() => [
  'allow_mortal_posts',
  'post_rate_limit',
  'thread_rate_limit',
])

onMounted(async () => {
  if (!isOverlord.value) {
    router.push('/forum')
    return
  }
  await loadSettings()
  await loadAuditLog()
})
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Shield class="w-8 h-8 text-primary" />
        <div>
          <h1 class="text-3xl font-bold">Admin Panel</h1>
          <p class="text-muted-foreground mt-1">
            Manage forum permissions and settings (Overlord only)
          </p>
        </div>
      </div>
      <Button variant="outline" @click="router.push('/forum')">
        Back to Forum
      </Button>
    </div>

    <div class="space-y-6">
      <!-- Quick Actions Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Settings class="w-5 h-5" />
            <CardTitle>Quick Actions</CardTitle>
          </div>
          <CardDescription>
            Admin tools and management pages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button
              variant="outline"
              class="h-auto py-4 flex flex-col items-start gap-2"
              @click="router.push('/admin/moderation-log')"
            >
              <History class="w-5 h-5" />
              <div class="text-left">
                <div class="font-semibold">Moderation Log</div>
                <div class="text-xs text-muted-foreground">
                  View moderation actions and audit trail
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Moderation Permissions Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Lock class="w-5 h-5" />
            <CardTitle>Moderation Permissions</CardTitle>
          </div>
          <CardDescription>
            Configure minimum immortal levels required for moderation actions
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading" class="space-y-4">
          <Skeleton v-for="i in 5" :key="i" class="h-20 w-full" />
        </CardContent>
        <CardContent v-else class="space-y-4">
          <div
            v-for="key in moderationSettings"
            :key="key"
            class="space-y-2 pb-4 border-b last:border-b-0"
          >
            <Label :for="key">{{ getSettingLabel(key) }}</Label>
            <div class="flex gap-2">
              <Select
                :model-value="editedSettings[key] || ''"
                @update:model-value="(val) => editedSettings[key] = val as string"
              >
                <SelectTrigger class="flex-1">
                  <SelectValue :placeholder="getRoleLabel(Number(editedSettings[key]))" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in ROLE_OPTIONS"
                    :key="option.value"
                    :value="option.value.toString()"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                @click="saveSetting(key)"
                :disabled="isSaving[key] || editedSettings[key] === (settings?.[key as keyof ForumSettings]?.toString() || '')"
                size="sm"
              >
                {{ isSaving[key] ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Current: {{ getRoleLabel(Number(settings?.[key as keyof ForumSettings])) }}
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Forum Access Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Users class="w-5 h-5" />
            <CardTitle>Forum Access</CardTitle>
          </div>
          <CardDescription>
            Configure minimum levels required to access restricted forums
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading" class="space-y-4">
          <Skeleton v-for="i in 2" :key="i" class="h-20 w-full" />
        </CardContent>
        <CardContent v-else class="space-y-4">
          <div
            v-for="key in forumAccessSettings"
            :key="key"
            class="space-y-2 pb-4 border-b last:border-b-0"
          >
            <Label :for="key">{{ getSettingLabel(key) }}</Label>
            <div class="flex gap-2">
              <Select
                :model-value="editedSettings[key] || ''"
                @update:model-value="(val) => editedSettings[key] = val as string"
              >
                <SelectTrigger class="flex-1">
                  <SelectValue :placeholder="getRoleLabel(Number(editedSettings[key]))" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in ROLE_OPTIONS"
                    :key="option.value"
                    :value="option.value.toString()"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                @click="saveSetting(key)"
                :disabled="isSaving[key] || editedSettings[key] === (settings?.[key as keyof ForumSettings]?.toString() || '')"
                size="sm"
              >
                {{ isSaving[key] ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Current: {{ getRoleLabel(Number(settings?.[key as keyof ForumSettings])) }}
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- General Settings Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Settings class="w-5 h-5" />
            <CardTitle>General Settings</CardTitle>
          </div>
          <CardDescription>
            Configure general forum behavior and rate limits
          </CardDescription>
        </CardHeader>
        <CardContent v-if="isLoading" class="space-y-4">
          <Skeleton v-for="i in 3" :key="i" class="h-20 w-full" />
        </CardContent>
        <CardContent v-else class="space-y-4">
          <div
            v-for="key in generalSettings"
            :key="key"
            class="space-y-2 pb-4 border-b last:border-b-0"
          >
            <Label :for="key">{{ getSettingLabel(key) }}</Label>
            <div class="flex gap-2">
              <Input
                :id="key"
                v-model="editedSettings[key]"
                :type="isBooleanSetting(key) ? 'text' : 'number'"
                :disabled="isSaving[key]"
                class="flex-1"
              />
              <Button
                @click="saveSetting(key)"
                :disabled="isSaving[key] || editedSettings[key] === (settings?.[key as keyof ForumSettings]?.toString() || '')"
                size="sm"
              >
                {{ isSaving[key] ? 'Saving...' : 'Save' }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Current: {{ settings?.[key as keyof ForumSettings] }}
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Audit Log Card -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <History class="w-5 h-5" />
            <CardTitle>Recent Changes</CardTitle>
          </div>
          <CardDescription>
            Audit log showing recent permission changes
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-2 max-h-[600px] overflow-y-auto">
          <div
            v-for="entry in auditLog"
            :key="entry.id"
            class="text-sm border-b pb-2 last:border-b-0"
          >
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="text-xs">
                {{ entry.change_type }}
              </Badge>
              <span class="font-medium">{{ entry.changed_by }}</span>
            </div>
            <div class="text-muted-foreground mt-1">
              <span class="font-mono text-xs">{{ entry.target_key }}</span>
              <span v-if="entry.old_value"> from {{ entry.old_value }}</span>
              → {{ entry.new_value }}
            </div>
            <div class="text-xs text-muted-foreground mt-1">
              {{ formatDate(entry.changed_at) }}
            </div>
          </div>

          <div v-if="auditLog.length === 0" class="text-center text-muted-foreground py-4">
            No changes recorded yet
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
