<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import FlagPicker from '@/components/builder/FlagPicker.vue'
import ExitEditor from '@/components/builder/ExitEditor.vue'
import ExtraDescEditor from '@/components/builder/ExtraDescEditor.vue'
import AnsiEditor from '@/components/builder/AnsiEditor.vue'
import DescriptionPreview from '@/components/builder/DescriptionPreview.vue'
import {
  Save,
  ChevronDown,
  ChevronRight,
  Info,
  DoorOpen,
  Flag,
  FileText,
  Eye,
} from 'lucide-vue-next'
import type { Room, RoomExit, ExtraDescription } from '@/types'

const props = defineProps<{
  room: Room
  zoneNumber: number
  saving?: boolean
}>()

const emit = defineEmits<{
  (e: 'save', room: Room): void
  (e: 'update:name', value: string): void
}>()

// Auth for overlord-only features
const { isOverlord } = useAuth()

// Local editable copy
const editedRoom = ref<Room>({ ...props.room })

// Section collapse state
const sectionsOpen = ref({
  basic: true,
  description: true,
  exits: true,
  flags: false,
  extras: false,
})

// Preview toggle
const showPreview = ref(false)

// Fetch flag definitions
const { data: flagsData } = useQuery({
  queryKey: ['builder-flags'],
  queryFn: () => builderApi.getFlags(),
  staleTime: Infinity,
})

// Reset when room prop changes (immediate to handle initial load)
watch(() => props.room, (newRoom) => {
  editedRoom.value = { ...newRoom }
}, { deep: true })

// Emit name changes for live preview in navbar
watch(() => editedRoom.value.name, (newValue) => {
  emit('update:name', newValue)
})

// Computed: has unsaved changes
const hasChanges = computed(() => {
  return JSON.stringify(editedRoom.value) !== JSON.stringify(props.room)
})

// Computed: active room flags
const activeFlags = computed(() => {
  if (!flagsData.value?.roomFlags) return []
  return flagsData.value.roomFlags.filter(f => (editedRoom.value.roomFlags & f.value) !== 0)
})

// Handle flag change
function handleFlagsChange(newFlags: number) {
  editedRoom.value.roomFlags = newFlags
}

// Handle sector change
function handleSectorChange(event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10)
  editedRoom.value.sectorType = value
}

// Handle exit change
function handleExitsChange(exits: RoomExit[]) {
  editedRoom.value.exits = exits
}

// Handle extras change
function handleExtrasChange(extras: ExtraDescription[]) {
  editedRoom.value.extras = extras
}

// Save
function save() {
  emit('save', editedRoom.value)
}
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header with Save Button -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold">
          Room #{{ editedRoom.vnum }}
        </h2>
        <p class="text-sm text-muted-foreground">
          Zone {{ zoneNumber }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Badge v-if="hasChanges" variant="secondary">Unsaved changes</Badge>
        <Button
          @click="save"
          :disabled="saving || !hasChanges"
        >
          <Save class="h-4 w-4 mr-2" />
          {{ saving ? 'Saving...' : 'Save' }}
        </Button>
      </div>
    </div>

    <!-- Basic Info Section -->
    <Collapsible v-model:open="sectionsOpen.basic">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Info class="h-5 w-5" />
                Basic Info
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.basic" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- Room Name -->
            <div class="space-y-2">
              <Label for="room-name">Room Name</Label>
              <Input
                id="room-name"
                v-model="editedRoom.name"
                placeholder="Enter room name..."
              />
            </div>

            <!-- VNUM (editable for overlords only) -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label>VNUM</Label>
                <Input
                  v-model.number="editedRoom.vnum"
                  :disabled="!isOverlord"
                  class="font-mono"
                  type="number"
                />
              </div>

              <!-- Sector Type -->
              <div class="space-y-2">
                <Label for="sector-type">Sector Type</Label>
                <select
                  id="sector-type"
                  :value="editedRoom.sectorType"
                  @change="handleSectorChange"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="sector in flagsData?.sectorTypes || []"
                    :key="sector.value"
                    :value="sector.value"
                  >
                    {{ sector.name }} ({{ sector.value }})
                  </option>
                </select>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Description Section -->
    <Collapsible v-model:open="sectionsOpen.description">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <FileText class="h-5 w-5" />
                Description
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.description" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- Preview Toggle -->
            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                class="h-8"
                @click="showPreview = !showPreview"
              >
                <Eye class="h-4 w-4 mr-2" />
                {{ showPreview ? 'Hide' : 'Show' }} Preview
              </Button>
            </div>

            <!-- Editor and Preview -->
            <div :class="showPreview ? 'grid grid-cols-2 gap-4' : ''">
              <AnsiEditor
                v-model="editedRoom.description"
                placeholder="Enter room description..."
                min-height="200px"
              />

              <!-- Preview panel -->
              <DescriptionPreview
                v-if="showPreview"
                :text="editedRoom.description"
                title="Room Preview"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Exits Section -->
    <Collapsible v-model:open="sectionsOpen.exits">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <DoorOpen class="h-5 w-5" />
                Exits
                <Badge variant="secondary">{{ editedRoom.exits.length }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.exits" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <ExitEditor
              :exits="editedRoom.exits"
              :door-flags="flagsData?.doorFlags || []"
              :zone-id="String(zoneNumber)"
              @update="handleExitsChange"
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Room Flags Section -->
    <Collapsible v-model:open="sectionsOpen.flags">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Flag class="h-5 w-5" />
                Room Flags
                <Badge variant="secondary">{{ activeFlags.length }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.flags" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <FlagPicker
              :value="editedRoom.roomFlags"
              :flags="flagsData?.roomFlags || []"
              @update="handleFlagsChange"
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Extra Descriptions Section -->
    <Collapsible v-model:open="sectionsOpen.extras">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <FileText class="h-5 w-5" />
                Extra Descriptions
                <Badge variant="secondary">{{ editedRoom.extras.length }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.extras" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <ExtraDescEditor
              :extras="editedRoom.extras"
              @update="handleExtrasChange"
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>
