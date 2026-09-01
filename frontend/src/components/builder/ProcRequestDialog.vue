<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useQuery, useMutation } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import AccountAutocomplete from './AccountAutocomplete.vue'
import AnsiText from '@/components/ui/AnsiText.vue'
import {
  Home,
  User,
  Package,
  Save,
  RefreshCw,
  ChevronsUpDown,
  Check,
  Loader2,
} from 'lucide-vue-next'
import type {
  ProcRequest,
  ProcRequestEntityType,
  ProcRequestStatus,
  CreateProcRequest,
  UpdateProcRequest,
  MobIndex,
  ObjIndex,
  RoomIndex,
} from '@/types'

const props = defineProps<{
  open: boolean
  zoneId: string
  request: ProcRequest | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const toast = useToast()

// Fetch zone data for vnum dropdown
const { data: zoneData, isLoading: isLoadingZone } = useQuery({
  queryKey: ['zone', props.zoneId],
  queryFn: () => builderApi.getZone(props.zoneId),
  enabled: computed(() => props.open && !!props.zoneId),
})

// Form state
const title = ref('')
const entityType = ref<ProcRequestEntityType>('mob')
const vnum = ref('')
const description = ref('')
const status = ref<ProcRequestStatus>('requested')
const assignedTo = ref('')

// Vnum dropdown state
const vnumDropdownOpen = ref(false)
const vnumSearch = ref('')

// Is editing mode
const isEditing = computed(() => props.request !== null)

// Get entity list based on selected type
const entityList = computed(() => {
  if (!zoneData.value?.zone) return []

  switch (entityType.value) {
    case 'mob':
      return zoneData.value.zone.mobs.map((m: MobIndex) => ({
        vnum: m.vnum,
        label: m.shortDesc,
      }))
    case 'object':
      return zoneData.value.zone.objects.map((o: ObjIndex) => ({
        vnum: o.vnum,
        label: o.shortDesc,
      }))
    case 'room':
      return zoneData.value.zone.rooms.map((r: RoomIndex) => ({
        vnum: r.vnum,
        label: r.name,
      }))
    default:
      return []
  }
})

// Filtered entity list based on search
const filteredEntityList = computed(() => {
  const search = vnumSearch.value.toLowerCase().trim()
  if (!search) return entityList.value

  return entityList.value.filter(
    (e) => e.vnum.toString().includes(search) || e.label.toLowerCase().includes(search),
  )
})

// Selected entity display
const selectedEntityDisplay = computed(() => {
  if (!vnum.value) return null
  const numVnum = parseInt(vnum.value)
  return entityList.value.find((e) => e.vnum === numVnum)
})

// Select vnum from dropdown
function selectVnum(selectedVnum: number) {
  vnum.value = selectedVnum.toString()
  vnumDropdownOpen.value = false
  vnumSearch.value = ''
}

// Clear vnum when entity type changes
watch(entityType, () => {
  vnum.value = ''
  vnumSearch.value = ''
})

// Initialize form when request changes or dialog opens
watch(
  [() => props.open, () => props.request],
  ([open, req]) => {
    if (open) {
      if (req) {
        title.value = req.title
        entityType.value = req.entityType
        vnum.value = req.vnum.toString()
        description.value = req.descriptionHtml || req.description || ''
        status.value = req.status
        assignedTo.value = req.assignedTo || ''
      } else {
        title.value = ''
        entityType.value = 'mob'
        vnum.value = ''
        description.value = ''
        status.value = 'requested'
        assignedTo.value = ''
      }
    }
  },
  { immediate: true },
)

// Create mutation
const createMutation = useMutation({
  mutationFn: (data: CreateProcRequest) => builderApi.createProcRequest(props.zoneId, data),
  onSuccess: () => {
    toast.success('Proc request created')
    emit('close')
  },
  onError: (err: Error) => {
    toast.error(`Failed to create: ${err.message}`)
  },
})

// Update mutation
const updateMutation = useMutation({
  mutationFn: ({ id, data }: { id: number; data: UpdateProcRequest }) =>
    builderApi.updateProcRequest(props.zoneId, id, data),
  onSuccess: () => {
    toast.success('Proc request updated')
    emit('close')
  },
  onError: (err: Error) => {
    toast.error(`Failed to update: ${err.message}`)
  },
})

// Submit form
function handleSubmit() {
  if (!title.value.trim()) {
    toast.error('Please enter a title')
    return
  }
  if (!vnum.value || isNaN(parseInt(vnum.value))) {
    toast.error('Please enter a valid VNUM')
    return
  }

  const plainDescription = description.value.replace(/<[^>]+>/g, '')

  if (isEditing.value && props.request) {
    updateMutation.mutate({
      id: props.request.id,
      data: {
        title: title.value.trim(),
        entityType: entityType.value,
        vnum: parseInt(vnum.value),
        description: plainDescription,
        descriptionHtml: description.value,
        status: status.value,
        assignedTo: assignedTo.value.trim() || null,
      },
    })
  } else {
    createMutation.mutate({
      zoneId: props.zoneId,
      title: title.value.trim(),
      entityType: entityType.value,
      vnum: parseInt(vnum.value),
      description: plainDescription,
      descriptionHtml: description.value,
    })
  }
}

// Loading state
const isLoading = computed(() => createMutation.isPending.value || updateMutation.isPending.value)
</script>

<template>
  <Dialog :open="props.open" @update:open="(val) => !val && emit('close')">
    <DialogContent class="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? 'Edit Proc Request' : 'Create Proc Request' }}</DialogTitle>
        <DialogDescription>
          {{ isEditing ? 'Update the proc request details.' : 'Create a new request for special mob, object, or room coding.' }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-4 py-4">
        <!-- Title -->
        <div class="space-y-2">
          <Label for="title">Title</Label>
          <Input
            id="title"
            v-model="title"
            placeholder="Brief description of what you need..."
          />
        </div>

        <!-- Entity Type & VNUM -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>Entity Type</Label>
            <Select v-model="entityType">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mob">
                  <div class="flex items-center gap-2">
                    <User class="h-4 w-4" />
                    Mobile
                  </div>
                </SelectItem>
                <SelectItem value="object">
                  <div class="flex items-center gap-2">
                    <Package class="h-4 w-4" />
                    Object
                  </div>
                </SelectItem>
                <SelectItem value="room">
                  <div class="flex items-center gap-2">
                    <Home class="h-4 w-4" />
                    Room
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label>VNUM</Label>
            <Popover v-model:open="vnumDropdownOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  :aria-expanded="vnumDropdownOpen"
                  class="w-full justify-between font-mono"
                  :disabled="isLoadingZone"
                >
                  <span v-if="isLoadingZone" class="text-muted-foreground flex items-center gap-2">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                  <span v-else-if="selectedEntityDisplay" class="truncate flex items-center gap-1">
                    <span>{{ selectedEntityDisplay.vnum }} -</span>
                    <AnsiText :text="selectedEntityDisplay.label" />
                  </span>
                  <span v-else class="text-muted-foreground">
                    Select {{ entityType }}...
                  </span>
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[350px] p-0" align="start">
                <div class="p-2 border-b">
                  <Input
                    v-model="vnumSearch"
                    placeholder="Search by vnum or name..."
                    class="h-8"
                  />
                </div>
                <ScrollArea class="h-[200px]">
                  <div v-if="filteredEntityList.length === 0" class="py-4 text-center text-sm text-muted-foreground">
                    No {{ entityType }}s found.
                  </div>
                  <div v-else class="p-1">
                    <button
                      v-for="entity in filteredEntityList"
                      :key="entity.vnum"
                      type="button"
                      class="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      :class="vnum === entity.vnum.toString() ? 'bg-accent' : ''"
                      @click="selectVnum(entity.vnum)"
                    >
                      <span class="font-mono text-muted-foreground w-16 shrink-0">{{ entity.vnum }}</span>
                      <AnsiText :text="entity.label" class="truncate" />
                      <Check
                        v-if="vnum === entity.vnum.toString()"
                        class="ml-auto h-4 w-4 shrink-0"
                      />
                    </button>
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <!-- Status & Assigned To (editing only) -->
        <div v-if="isEditing" class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>Status</Label>
            <Select v-model="status">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label>Assigned To</Label>
            <AccountAutocomplete
              v-model="assignedTo"
              placeholder="Search accounts..."
            />
          </div>
        </div>

        <!-- Description -->
        <div class="space-y-2">
          <Label>Description</Label>
          <TipTapEditor
            v-model="description"
            placeholder="Describe what you need in detail... Use @ to mention users."
            :max-length="5000"
            :enable-mentions="true"
          />
        </div>
      </form>

      <DialogFooter>
        <Button variant="outline" @click="emit('close')" :disabled="isLoading">
          Cancel
        </Button>
        <Button @click="handleSubmit" :disabled="isLoading">
          <Save v-if="!isLoading" class="h-4 w-4 mr-2" />
          <RefreshCw v-else class="h-4 w-4 mr-2 animate-spin" />
          {{ isEditing ? 'Update' : 'Create' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
