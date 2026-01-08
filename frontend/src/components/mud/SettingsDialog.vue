<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSettings } from '@/composables/useSettings'
import { useMudStore } from '@/stores/mudStore'
import { useMudChatNotifications } from '@/composables/useMudChatNotifications'
import { useFontSettings, FONT_FAMILIES } from '@/composables/useFontSettings'
import { useHotbarSettings, HOTBAR_ICONS } from '@/composables/useHotbarSettings'
import { useAliases } from '@/composables/useAliases'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Download, Upload, Settings, Bell, Type, Gamepad2, RotateCcw, Wifi } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import * as icons from 'lucide-vue-next'
import type { Component } from 'vue'
import { toast } from 'vue-sonner'

const isOpen = defineModel<boolean>('open', { default: false })

const store = useMudStore()
const { exportAllSettings, importAllSettings, getSettingsCounts } = useSettings()
const {
  settings: notificationSettings,
  hasPermission,
  requestPermission,
  isSupported,
} = useMudChatNotifications()
const { settings: fontSettings, applyFontSettings } = useFontSettings()
const { settings: hotbarSettings, updateButton, setButtonCount, setVisible, setOrientation, setButtonSize, resetPosition } =
  useHotbarSettings()
const { echoCommands, setEchoCommands } = useAliases()
// Proxy settings (per-user, stored in localStorage)
const PROXY_STORAGE_KEY = 'duris-ws-proxy'

interface ProxySettings {
  enabled: boolean
  host: string
  port: string
}

function loadProxySettings(): ProxySettings {
  try {
    const stored = localStorage.getItem(PROXY_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {}
  return { enabled: false, host: '', port: '' }
}

function saveProxySettings(settings: ProxySettings) {
  localStorage.setItem(PROXY_STORAGE_KEY, JSON.stringify(settings))
}

const proxySettings = ref<ProxySettings>(loadProxySettings())

// Watch and save on changes
watch(proxySettings, (newSettings) => {
  saveProxySettings(newSettings)
}, { deep: true })

// get icon component by name for preview
function getIcon(name: string): Component {
  const iconName = name as keyof typeof icons
  return (icons[iconName] as Component) || icons.CircleDot
}

function updateFontFamily(event: Event) {
  const target = event.target as HTMLSelectElement
  fontSettings.value.fontFamily = target.value
  applyFontSettings()
}

// Show god-only channels for level 57+ (Avatar+)
const showGodChannels = computed(() => store.character && store.character.level >= 57)

// File input ref for import
const fileInputRef = ref<HTMLInputElement | null>(null)

const counts = computed(() => getSettingsCounts())
const totalCount = computed(() => counts.value.aliases + counts.value.triggers + counts.value.groupActions)

function handleExport() {
  const json = exportAllSettings()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `duris-settings-${store.account || 'export'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success('Settings exported', {
    description: `Exported ${counts.value.aliases} aliases, ${counts.value.triggers} triggers, ${counts.value.groupActions} group actions.`,
  })
}

function handleImportClick() {
  fileInputRef.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const result = importAllSettings(text, 'merge')

    const parts: string[] = []
    if (result.aliases > 0) parts.push(`${result.aliases} aliases`)
    if (result.triggers > 0) parts.push(`${result.triggers} triggers`)
    if (result.groupActions > 0) parts.push(`${result.groupActions} group actions`)

    if (parts.length > 0) {
      toast.success('Settings imported', {
        description: `Imported ${parts.join(', ')} (duplicates skipped).`,
      })
    } else {
      toast.info('No new settings', {
        description: 'All items already exist (duplicates skipped).',
      })
    }
  } catch {
    toast.error('Import failed', {
      description: 'Invalid settings file format.',
    })
  }

  // Reset file input
  input.value = ''
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Settings class="h-5 w-5" />
          Settings
        </DialogTitle>
        <DialogDescription>
          Manage your client preferences
        </DialogDescription>
      </DialogHeader>

      <Tabs default-value="general" class="w-full">
        <TabsList class="grid w-full grid-cols-4">
          <TabsTrigger value="general" class="text-xs">
            <Settings class="h-3 w-3 mr-1" />
            General
          </TabsTrigger>
          <TabsTrigger value="notifications" class="text-xs">
            <Bell class="h-3 w-3 mr-1" />
            Notify
          </TabsTrigger>
          <TabsTrigger value="display" class="text-xs">
            <Type class="h-3 w-3 mr-1" />
            Display
          </TabsTrigger>
          <TabsTrigger value="hotbar" class="text-xs">
            <Gamepad2 class="h-3 w-3 mr-1" />
            Hotbar
          </TabsTrigger>
        </TabsList>

        <!-- General Tab - Export/Import -->
        <TabsContent value="general" class="space-y-4 mt-4">
          <!-- Current counts -->
          <div class="flex items-center justify-center gap-2 p-3 bg-muted/50 rounded-md">
            <Badge variant="secondary">
              {{ counts.aliases }} Aliases
            </Badge>
            <Badge variant="secondary">
              {{ counts.triggers }} Triggers
            </Badge>
            <Badge variant="secondary">
              {{ counts.groupActions }} Group Actions
            </Badge>
          </div>

          <!-- Export/Import buttons -->
          <div class="flex gap-2">
            <Button class="flex-1" @click="handleExport" :disabled="totalCount === 0">
              <Download class="h-4 w-4 mr-2" />
              Export All
            </Button>
            <Button variant="outline" class="flex-1" @click="handleImportClick">
              <Upload class="h-4 w-4 mr-2" />
              Import
            </Button>
            <input
              ref="fileInputRef"
              type="file"
              accept=".json"
              class="hidden"
              @change="handleImportFile"
            />
          </div>

          <!-- Help text -->
          <div class="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md space-y-1">
            <p><strong>Export:</strong> Saves all settings to a JSON file for backup or sharing.</p>
            <p><strong>Import:</strong> Merges settings from a file (skips duplicates).</p>
          </div>

          <!-- WebSocket Proxy -->
          <div class="pt-4 border-t space-y-3">
            <div class="flex items-center gap-2">
              <Wifi class="h-4 w-4" />
              <span class="text-sm font-medium">WebSocket Proxy</span>
            </div>

            <div class="flex items-center justify-between">
              <Label class="text-sm">Enable Proxy</Label>
              <Switch
                v-model="proxySettings.enabled"
              />
            </div>

            <div v-if="proxySettings.enabled" class="space-y-3">
              <div class="space-y-1">
                <Label class="text-xs text-muted-foreground">Proxy Host</Label>
                <Input
                  v-model="proxySettings.host"
                  type="text"
                  placeholder="proxy.example.com"
                  class="h-8 text-sm"
                />
              </div>

              <div class="space-y-1">
                <Label class="text-xs text-muted-foreground">Proxy Port (optional)</Label>
                <Input
                  v-model="proxySettings.port"
                  type="text"
                  placeholder="443"
                  class="h-8 text-sm w-24"
                />
              </div>
            </div>

            <p class="text-xs text-muted-foreground">
              Route MUD connection through your own proxy for lower latency. Reconnect to apply.
            </p>
          </div>
        </TabsContent>

        <!-- Notifications Tab -->
        <TabsContent value="notifications" class="space-y-3 mt-4">
          <!-- Permission prompt if not granted -->
          <div
            v-if="isSupported && !hasPermission"
            class="flex items-center gap-2 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 p-2 rounded"
          >
            <Button size="sm" variant="outline" @click="requestPermission">
              Enable Notifications
            </Button>
            <span>Required for browser notifications</span>
          </div>

          <!-- Not supported message -->
          <div
            v-if="!isSupported"
            class="text-xs text-muted-foreground"
          >
            Browser notifications are not supported in this browser.
          </div>

          <!-- Channel toggles -->
          <div v-if="hasPermission" class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-sm">PM (Tell)</Label>
              <Switch
                :model-value="notificationSettings.tell"
                @update:model-value="(val: boolean) => notificationSettings.tell = val"
              />
            </div>
            <div class="flex items-center justify-between">
              <Label class="text-sm">Guild</Label>
              <Switch
                :model-value="notificationSettings.gcc"
                @update:model-value="(val: boolean) => notificationSettings.gcc = val"
              />
            </div>
            <div class="flex items-center justify-between">
              <Label class="text-sm">Group</Label>
              <Switch
                :model-value="notificationSettings.gsay"
                @update:model-value="(val: boolean) => notificationSettings.gsay = val"
              />
            </div>
            <!-- God-only channels -->
            <template v-if="showGodChannels">
              <div class="flex items-center justify-between">
                <Label class="text-sm">Petition</Label>
                <Switch
                  :model-value="notificationSettings.petition"
                  @update:model-value="(val: boolean) => notificationSettings.petition = val"
                />
              </div>
              <div class="flex items-center justify-between">
                <Label class="text-sm">Wizchat</Label>
                <Switch
                  :model-value="notificationSettings.wizmsg"
                  @update:model-value="(val: boolean) => notificationSettings.wizmsg = val"
                />
              </div>
            </template>
          </div>

          <p class="text-xs text-muted-foreground">
            Notifications only show when the browser tab is not focused.
          </p>
        </TabsContent>

        <!-- Display Tab -->
        <TabsContent value="display" class="space-y-3 mt-4">
          <!-- Echo Commands -->
          <div class="flex items-center justify-between">
            <Label class="text-sm">Echo Commands</Label>
            <Switch
              :model-value="echoCommands"
              @update:model-value="(val: boolean) => setEchoCommands(val)"
            />
          </div>

          <!-- Font Family -->
          <div class="space-y-1">
            <Label class="text-xs text-muted-foreground">Font</Label>
            <select
              :value="fontSettings.fontFamily"
              @change="updateFontFamily"
              class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option
                v-for="font in FONT_FAMILIES"
                :key="font.value"
                :value="font.value"
              >
                {{ font.label }}
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <!-- Font Size -->
            <div class="space-y-1">
              <Label class="text-xs text-muted-foreground">Size (px)</Label>
              <input
                v-model="fontSettings.fontSize"
                @input="applyFontSettings"
                type="number"
                step="1"
                min="8"
                max="24"
                class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </div>

            <!-- Line Spacing -->
            <div class="space-y-1">
              <Label class="text-xs text-muted-foreground">Spacing</Label>
              <input
                v-model="fontSettings.lineHeight"
                @input="applyFontSettings"
                type="number"
                step="0.1"
                min="1"
                max="3"
                class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </div>
          </div>

          <p class="text-xs text-muted-foreground">
            Changes apply to the game terminal output.
          </p>
        </TabsContent>

        <!-- Hotbar Tab -->
        <TabsContent value="hotbar" class="space-y-3 mt-4">
          <!-- Show/Hide toggle -->
          <div class="flex items-center justify-between">
            <Label class="text-sm">Show Hotbar</Label>
            <Switch
              :model-value="hotbarSettings.visible"
              @update:model-value="(val: boolean) => setVisible(val)"
            />
          </div>

          <!-- Orientation -->
          <div class="flex items-center justify-between">
            <Label class="text-sm">Orientation</Label>
            <div class="flex gap-1">
              <button
                v-for="opt in ['auto', 'horizontal', 'vertical'] as const"
                :key="opt"
                class="px-2 py-1 text-xs rounded capitalize"
                :class="hotbarSettings.orientation === opt
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'"
                @click="setOrientation(opt)"
              >
                {{ opt === 'auto' ? 'Auto' : opt === 'horizontal' ? '━' : '┃' }}
              </button>
            </div>
          </div>

          <!-- Button Size -->
          <div class="flex items-center justify-between">
            <Label class="text-sm">Button Size</Label>
            <div class="flex gap-1">
              <button
                v-for="opt in ['small', 'medium', 'large'] as const"
                :key="opt"
                class="px-2 py-1 text-xs rounded capitalize"
                :class="hotbarSettings.buttonSize === opt
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'"
                @click="setButtonSize(opt)"
              >
                {{ opt.charAt(0).toUpperCase() }}
              </button>
            </div>
          </div>

          <!-- Button count -->
          <div class="space-y-1">
            <Label class="text-xs text-muted-foreground">
              Button Count: {{ hotbarSettings.buttons.length }}
            </Label>
            <input
              :value="hotbarSettings.buttons.length"
              @input="(e) => setButtonCount(Number((e.target as HTMLInputElement).value))"
              type="range"
              min="1"
              max="12"
              step="1"
              class="w-full"
            />
          </div>

          <!-- Button configuration -->
          <div class="space-y-2 max-h-[200px] overflow-y-auto pr-1">
            <div
              v-for="(btn, index) in hotbarSettings.buttons"
              :key="btn.id"
              class="flex items-center gap-2 p-2 bg-muted/30 rounded-md"
            >
              <!-- Icon picker popover -->
              <Popover>
                <PopoverTrigger as-child>
                  <button
                    class="h-8 w-8 rounded flex items-center justify-center text-white shrink-0 hover:brightness-125"
                    :style="{ backgroundColor: btn.color || '#6b7280' }"
                    :title="btn.icon"
                  >
                    <component :is="getIcon(btn.icon)" class="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-2" side="bottom" align="start">
                  <div class="grid grid-cols-6 gap-1">
                    <button
                      v-for="icon in HOTBAR_ICONS"
                      :key="icon.value"
                      :title="icon.name"
                      class="h-8 w-8 rounded flex items-center justify-center hover:bg-muted"
                      :class="btn.icon === icon.value ? 'bg-primary text-primary-foreground' : ''"
                      @click="updateButton(btn.id, { icon: icon.value })"
                    >
                      <component :is="getIcon(icon.value)" class="h-4 w-4" />
                    </button>
                  </div>
                </PopoverContent>
              </Popover>

              <!-- Color picker -->
              <input
                type="color"
                :value="btn.color || '#6b7280'"
                @input="(e) => updateButton(btn.id, { color: (e.target as HTMLInputElement).value })"
                class="h-7 w-7 rounded border-0 cursor-pointer shrink-0"
                title="Button color"
              />

              <!-- Command input -->
              <input
                :value="btn.command"
                @input="(e) => updateButton(btn.id, { command: (e.target as HTMLInputElement).value })"
                type="text"
                :placeholder="`Command ${index + 1}`"
                class="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
              />

              <!-- Enable toggle -->
              <Switch
                :model-value="btn.enabled"
                @update:model-value="(val: boolean) => updateButton(btn.id, { enabled: val })"
                class="shrink-0"
              />
            </div>
          </div>

          <!-- Reset position -->
          <Button variant="outline" size="sm" class="w-full" @click="resetPosition">
            <RotateCcw class="h-3 w-3 mr-2" />
            Reset Position
          </Button>

          <p class="text-xs text-muted-foreground">
            Drag the hotbar to reposition. It will snap to edges.
          </p>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
