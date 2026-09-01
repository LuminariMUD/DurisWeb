<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useZoneCache } from '@/composables/useZoneCache'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/composables/useToast'
import { useZoneStreaming } from '@/composables/useZoneStreaming'
import { useZoneHistory } from '@/composables/useZoneHistory'
import RoomEditor from '@/components/builder/RoomEditor.vue'
import MobEditor from '@/components/builder/MobEditor.vue'
import ObjectEditor from '@/components/builder/ObjectEditor.vue'
import ResetsEditor from '@/components/builder/ResetsEditor.vue'
import ZoneMap from '@/components/builder/ZoneMap.vue'
import ZoneLoadingProgress from '@/components/builder/ZoneLoadingProgress.vue'
import GitCommitDialog from '@/components/builder/GitCommitDialog.vue'
import ZoneInfoTab from '@/components/builder/ZoneInfoTab.vue'
import {
  ArrowLeft,
  RefreshCw,
  Home,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  User,
  Package,
  ListRestart,
  Copy,
  Search,
  Download,
  FileText,
  Archive,
  Save,
  Undo2,
  Redo2,
  AlertTriangle,
  GitCommit,
  Info,
  Plus,
} from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import type {
  Room,
  Mobile,
  ZoneObject,
  RoomPosition,
  ResetCommand,
  RoomIndex,
  RoomExit,
  Direction,
} from '@/types'

const props = defineProps<{
  id: string
}>()

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const toast = useToast()

// Zone ID is now a string (filename without extension)
const zoneId = computed(() => props.id)

// Helper function to convert RoomExit[] to RoomIndex.exits format
function exitsToMap(exits: RoomExit[]): { [key in Direction]?: number } {
  const result: { [key in Direction]?: number } = {}
  for (const exit of exits) {
    result[exit.direction] = exit.toRoom
  }
  return result
}

// Zone cache for localStorage-first workflow
const zoneCache = computed(() => useZoneCache(zoneId.value))

// Revert confirmation dialog
const revertDialogOpen = ref(false)

// Git commit dialog
const gitCommitDialogOpen = ref(false)

// Git settings from localStorage
const showGitCommitButton = ref(localStorage.getItem('builder_show_git_commit') !== 'false')

// Unsaved changes recovery banner
const showRecoveryBanner = ref(false)

// Saving state
const isSavingToFile = ref(false)

// Main view toggle (Editor vs Resets vs Info)
const mainView = ref<'editor' | 'resets' | 'info'>('editor')

// Entity type tab state (which sidebar/editor type is active)
const activeEntityType = ref<'room' | 'mob' | 'obj'>('room')

// Open tabs for editing - rooms
const openRooms = ref<number[]>([])
const selectedRoomVnum = ref<number | null>(null)

// Open tabs for editing - mobs
const openMobs = ref<number[]>([])
const selectedMobVnum = ref<number | null>(null)

// Open tabs for editing - objects
const openObjects = ref<number[]>([])

// Editor refresh keys - increment to force re-render on undo/redo
const roomEditorKey = ref(0)
const mobEditorKey = ref(0)
const objectEditorKey = ref(0)
const selectedObjectVnum = ref<number | null>(null)

// Zone streaming composable
const { roomState, mobState, objectState, streamRooms, streamMobs, streamObjects, clearState } =
  useZoneStreaming()

// Zone history composable for undo/redo
const {
  canUndo,
  canRedo,
  pushHistory,
  undo: historyUndo,
  redo: historyRedo,
  getUndoDescription,
  getRedoDescription,
} = useZoneHistory()

// Handle query parameters for deep linking from global search
const pendingSelection = ref<{ type: 'room' | 'mob' | 'object'; vnum: number } | null>(null)

// Start streaming rooms on mount and handle query params
onMounted(() => {
  if (zoneId.value) {
    streamRooms(zoneId.value)

    // Check for unsaved changes from previous session
    const cache = zoneCache.value
    if (cache.hasDirtyItems.value) {
      showRecoveryBanner.value = true
    }

    // Register beforeunload handler
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Register keyboard shortcuts for undo/redo
    window.addEventListener('keydown', handleKeyDown)

    // Check for deep link query params from global search
    const selectType = route.query.select as string | undefined
    const vnumStr = route.query.vnum as string | undefined

    if (selectType && vnumStr) {
      const vnum = parseInt(vnumStr, 10)
      if (!isNaN(vnum)) {
        // Map 'object' to 'obj' for the tab
        const entityType = selectType === 'object' ? 'obj' : (selectType as 'room' | 'mob' | 'obj')

        // Set the active tab
        activeEntityType.value = entityType

        // Store pending selection to apply once data is loaded
        pendingSelection.value = { type: selectType as 'room' | 'mob' | 'object', vnum }

        // Trigger streaming for mobs/objects if needed
        if (entityType === 'mob') {
          streamMobs(zoneId.value)
        } else if (entityType === 'obj') {
          streamObjects(zoneId.value)
        }
      }

      // Clear query params from URL without navigation
      router.replace({ path: route.path, query: {} })
    }
  }
})

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleKeyDown)
})

// Watch for tab changes to lazy load mobs/objects
watch(activeEntityType, (newType) => {
  if (newType === 'mob' && !mobState.value.isComplete && mobState.value.items.length === 0) {
    streamMobs(zoneId.value)
  }
  if (newType === 'obj' && !objectState.value.isComplete && objectState.value.items.length === 0) {
    streamObjects(zoneId.value)
  }
})

// Watch for pending selection and apply once data is loaded
watch(
  () => roomState.value.items.length,
  (len) => {
    if (pendingSelection.value?.type === 'room' && len > 0) {
      const vnum = pendingSelection.value.vnum
      // Check if the room exists in the loaded data
      if (roomState.value.items.some((r) => r.vnum === vnum)) {
        selectRoom(vnum)
        pendingSelection.value = null
      }
    }
  },
)

watch(
  () => mobState.value.items.length,
  (len) => {
    if (pendingSelection.value?.type === 'mob' && len > 0) {
      const vnum = pendingSelection.value.vnum
      // Check if the mob exists in the loaded data
      if (mobState.value.items.some((m) => m.vnum === vnum)) {
        selectMob(vnum)
        pendingSelection.value = null
      }
    }
  },
)

watch(
  () => objectState.value.items.length,
  (len) => {
    if (pendingSelection.value?.type === 'object' && len > 0) {
      const vnum = pendingSelection.value.vnum
      // Check if the object exists in the loaded data
      if (objectState.value.items.some((o) => o.vnum === vnum)) {
        selectObject(vnum)
        pendingSelection.value = null
      }
    }
  },
)

// Computed loading states based on streaming
const zoneLoading = computed(
  () => roomState.value.isStreaming && roomState.value.items.length === 0,
)

// Fetch zone header
const { data: headerData } = useQuery({
  queryKey: ['builder-zone-header', zoneId],
  queryFn: () => builderApi.getZoneHeader(zoneId.value),
  enabled: computed(() => !!zoneId.value),
})

// Fetch zone positions
const { data: positionsData } = useQuery({
  queryKey: ['builder-zone-positions', zoneId],
  queryFn: () => builderApi.getZonePositions(zoneId.value),
  enabled: computed(() => !!zoneId.value),
})

// Fetch selected room data
const { data: roomData, isLoading: roomLoading } = useQuery({
  queryKey: computed(() => ['builder-room', zoneId.value, selectedRoomVnum.value]),
  queryFn: () => builderApi.getRoom(zoneId.value, selectedRoomVnum.value!),
  enabled: computed(() => selectedRoomVnum.value !== null),
})

// Save room mutation
const saveRoomMutation = useMutation({
  mutationFn: (room: Room) => builderApi.updateRoom(zoneId.value, room.vnum, room),
  onSuccess: () => {
    toast.success('Room saved successfully')
    queryClient.invalidateQueries({ queryKey: ['builder-zone', zoneId.value] })
    queryClient.invalidateQueries({
      queryKey: ['builder-room', zoneId.value, selectedRoomVnum.value],
    })
  },
  onError: (error: Error) => {
    toast.error(`Failed to save room: ${error.message}`)
  },
})

// Fetch selected mob data
const { data: mobData, isLoading: mobLoading } = useQuery({
  queryKey: ['builder-mob', zoneId, selectedMobVnum],
  queryFn: () => builderApi.getMobile(zoneId.value, selectedMobVnum.value!),
  enabled: computed(() => selectedMobVnum.value !== null),
})

// Save mob mutation
const saveMobMutation = useMutation({
  mutationFn: (mob: Mobile) => builderApi.updateMobile(zoneId.value, mob.vnum, mob),
  onSuccess: () => {
    toast.success('Mobile saved successfully')
    queryClient.invalidateQueries({ queryKey: ['builder-zone', zoneId.value] })
    queryClient.invalidateQueries({
      queryKey: ['builder-mob', zoneId.value, selectedMobVnum.value],
    })
  },
  onError: (error: Error) => {
    toast.error(`Failed to save mobile: ${error.message}`)
  },
})

// Fetch selected object data
const { data: objectData, isLoading: objectLoading } = useQuery({
  queryKey: ['builder-object', zoneId, selectedObjectVnum],
  queryFn: () => builderApi.getObject(zoneId.value, selectedObjectVnum.value!),
  enabled: computed(() => selectedObjectVnum.value !== null),
})

// Save object mutation
const saveObjectMutation = useMutation({
  mutationFn: (obj: ZoneObject) => builderApi.updateObject(zoneId.value, obj.vnum, obj),
  onSuccess: () => {
    toast.success('Object saved successfully')
    queryClient.invalidateQueries({ queryKey: ['builder-zone', zoneId.value] })
    queryClient.invalidateQueries({
      queryKey: ['builder-object', zoneId.value, selectedObjectVnum.value],
    })
  },
  onError: (error: Error) => {
    toast.error(`Failed to save object: ${error.message}`)
  },
})

// Save positions mutation
const savePositionsMutation = useMutation({
  mutationFn: (positions: Record<number, RoomPosition>) =>
    builderApi.saveZonePositions(zoneId.value, positions),
  onSuccess: () => {
    // Silent save - no toast needed for position changes
    queryClient.invalidateQueries({ queryKey: ['builder-zone-positions', zoneId.value] })
  },
  onError: (error: Error) => {
    toast.error(`Failed to save map positions: ${error.message}`)
  },
})

// Collapsible panel states
const sidebarCollapsed = ref(false)
const mapCollapsed = ref(false)

// Search query for filtering lists
const searchQuery = ref('')

// Clone room dialog state
const cloneRoomDialogOpen = ref(false)
const cloneRoomSourceVnum = ref<number | null>(null)
const cloneRoomTargetVnum = ref<string>('')
const cloneRoomSourceName = ref('')
const cloneRoomCount = ref(1)
// Clone room to localStorage (no longer uses API)
const isCloning = ref(false)

function getNextAvailableVnums(startVnum: number | undefined, count: number): number[] {
  // Get all existing vnums from rooms array and localStorage dirty entries
  const existingVnums = new Set(rooms.value.map((r) => r.vnum))

  // Also check dirty created items in localStorage
  const dirtyRooms = zoneCache.value.getDirtyRooms()
  for (const entry of dirtyRooms) {
    existingVnums.add(entry.vnum)
  }

  const vnums: number[] = []
  let currentVnum = startVnum ?? Math.max(...existingVnums, 0) + 1

  while (vnums.length < count) {
    if (!existingVnums.has(currentVnum)) {
      vnums.push(currentVnum)
      existingVnums.add(currentVnum) // Mark as taken for next iteration
    }
    currentVnum++
  }

  return vnums
}

// Open clone room dialog
function openCloneRoomDialog(vnum: number, name: string) {
  cloneRoomSourceVnum.value = vnum
  cloneRoomSourceName.value = name
  cloneRoomTargetVnum.value = ''
  cloneRoomCount.value = 1
  cloneRoomDialogOpen.value = true
}

// Execute clone room - now saves to localStorage only
async function executeCloneRoom() {
  if (cloneRoomSourceVnum.value === null) return

  const targetVnum = cloneRoomTargetVnum.value.trim()
    ? parseInt(cloneRoomTargetVnum.value.trim(), 10)
    : undefined

  if (targetVnum !== undefined && isNaN(targetVnum)) {
    toast.error('Invalid target VNUM')
    return
  }

  const count = Math.max(1, Math.min(100, cloneRoomCount.value))

  // Find the source room data
  const sourceRoom = rooms.value.find((r) => r.vnum === cloneRoomSourceVnum.value)
  if (!sourceRoom) {
    // Check if we need to load full room data
    const cachedRoom = zoneCache.value.getRoom(cloneRoomSourceVnum.value)
    if (!cachedRoom) {
      toast.error('Source room data not found. Please select and view the room first.')
      return
    }
  }

  // We need the full room data - check cache first, then load if needed
  let fullRoomData: Room | null = zoneCache.value.getRoom(cloneRoomSourceVnum.value)

  if (!fullRoomData) {
    // Need to fetch full room data from server
    isCloning.value = true
    try {
      const response = await builderApi.getRoom(zoneId.value, cloneRoomSourceVnum.value)
      fullRoomData = response.room
    } catch (error) {
      isCloning.value = false
      toast.error(`Failed to load source room data: ${(error as Error).message}`)
      return
    }
  }

  if (!fullRoomData) {
    isCloning.value = false
    toast.error('Could not load source room data')
    return
  }

  isCloning.value = true

  // Get sequential VNUMs
  const newVnums = getNextAvailableVnums(targetVnum, count)

  // Create cloned rooms
  const cache = zoneCache.value
  const clonedRoomIndices: RoomIndex[] = []

  for (const newVnum of newVnums) {
    const clonedRoom: Room = {
      ...fullRoomData,
      vnum: newVnum,
      // Clear exits - as per plan, exits are not copied
      exits: [],
    }

    // Push to history (created action - before is null, after is the new room)
    pushHistory('room', newVnum, 'created', null, clonedRoom)

    // Store in localStorage as 'created'
    cache.markRoomDirty(clonedRoom, 'created')

    // Convert Room to RoomIndex for the list
    const roomIndex: RoomIndex = {
      vnum: newVnum,
      name: clonedRoom.name,
      sectorType: clonedRoom.sectorType,
      exits: {}, // Empty since we cleared exits
    }
    clonedRoomIndices.push(roomIndex)
  }

  // Add all cloned rooms to roomState.items
  roomState.value.items.push(...clonedRoomIndices)

  // Sort rooms by VNUM
  roomState.value.items.sort((a, b) => a.vnum - b.vnum)

  isCloning.value = false

  // Show success message
  const lastVnum = newVnums[newVnums.length - 1]
  if (count === 1) {
    toast.success(`Room cloned to #${newVnums[0]} (not yet saved to file)`)
  } else {
    toast.success(`${count} rooms cloned (#${newVnums[0]} - #${lastVnum}) (not yet saved to file)`)
  }

  // Close dialog and reset
  cloneRoomDialogOpen.value = false
  cloneRoomTargetVnum.value = ''
  cloneRoomCount.value = 1

  // Select the last cloned room
  if (lastVnum !== undefined) {
    selectRoom(lastVnum)
  }
}

// ========== CREATE NEW ENTITIES ==========

// Create a new room with defaults
function createNewRoom() {
  const newVnums = getNextAvailableVnums(undefined, 1)
  const newVnum = newVnums[0]!

  const newRoom: Room = {
    vnum: newVnum,
    name: 'New Room',
    description: 'A new room.\n',
    zoneNumber: zoneNumber.value,
    roomFlags: 0,
    sectorType: 0, // Inside
    exits: [],
    extras: [],
  }

  const cache = zoneCache.value

  // Push to history
  pushHistory('room', newVnum, 'created', null, newRoom)

  // Store in localStorage as 'created'
  cache.markRoomDirty(newRoom, 'created')
  cache.setRoom(newRoom)

  // Set in query cache so editor can access it immediately
  queryClient.setQueryData(['builder-room', zoneId.value, newVnum], { room: newRoom })

  // Add to roomState.items
  const roomIndex: RoomIndex = {
    vnum: newVnum,
    name: newRoom.name,
    sectorType: newRoom.sectorType,
    exits: {},
  }
  roomState.value.items.push(roomIndex)
  roomState.value.items.sort((a, b) => a.vnum - b.vnum)

  toast.success(`New room #${newVnum} created (not yet saved to file)`)

  // Select the new room
  selectRoom(newVnum)
}

// Create a new mob with defaults
function createNewMob() {
  // Get existing mob vnums
  const existingVnums = new Set(mobs.value.map((m) => m.vnum))
  const dirtyMobs = zoneCache.value.getDirtyMobs()
  for (const entry of dirtyMobs) {
    existingVnums.add(entry.vnum)
  }

  let newVnum = Math.max(...Array.from(existingVnums), 0) + 1
  while (existingVnums.has(newVnum)) {
    newVnum++
  }

  const newMob: Mobile = {
    vnum: newVnum,
    keywords: 'new mob',
    shortDesc: 'a new mob',
    longDesc: 'A new mob is here.\n',
    detailedDesc: '',
    actFlags: 0,
    affFlags1: 0,
    affFlags2: 0,
    affFlags3: 0,
    affFlags4: 0,
    alignment: 0,
    species: 0,
    hometown: 0,
    mobClass: 0,
    level: 1,
    thac0: 20,
    ac: 100,
    hitDice: '1d1+10',
    damDice: '1d4+0',
    gold: 0,
    exp: 0,
    position: 8, // Standing
    defaultPosition: 8,
    sex: 0, // Neutral
  }

  const cache = zoneCache.value

  // Push to history
  pushHistory('mob', newVnum, 'created', null, newMob)

  // Store in localStorage as 'created'
  cache.markMobDirty(newMob, 'created')
  cache.setMob(newMob)

  // Set in query cache so editor can access it immediately
  queryClient.setQueryData(['builder-mob', zoneId.value, newVnum], { mobile: newMob })

  // Add to mobState.items
  mobState.value.items.push(newMob)
  mobState.value.items.sort((a, b) => a.vnum - b.vnum)

  toast.success(`New mob #${newVnum} created (not yet saved to file)`)

  // Select the new mob
  selectMob(newVnum)
}

// Create a new object with defaults
function createNewObject() {
  // Get existing object vnums
  const existingVnums = new Set(objects.value.map((o) => o.vnum))
  const dirtyObjects = zoneCache.value.getDirtyObjects()
  for (const entry of dirtyObjects) {
    existingVnums.add(entry.vnum)
  }

  let newVnum = Math.max(...Array.from(existingVnums), 0) + 1
  while (existingVnums.has(newVnum)) {
    newVnum++
  }

  const newObject: ZoneObject = {
    vnum: newVnum,
    keywords: 'new object',
    shortDesc: 'a new object',
    longDesc: 'A new object is here.',
    actionDesc: '',
    itemType: 0, // Undefined
    material: 0,
    craftsmanship: 0,
    extraFlags: 0,
    extraFlags2: 0,
    wearFlags: 0,
    values: [0, 0, 0, 0],
    weight: 1,
    cost: 0,
    condition: 100,
    applies: [],
    extras: [],
    antiFlags: 0,
    antiFlags2: 0,
  }

  const cache = zoneCache.value

  // Push to history
  pushHistory('object', newVnum, 'created', null, newObject)

  // Store in localStorage as 'created'
  cache.markObjectDirty(newObject, 'created')
  cache.setObject(newObject)

  // Set in query cache so editor can access it immediately
  queryClient.setQueryData(['builder-object', zoneId.value, newVnum], { object: newObject })

  // Add to objectState.items
  objectState.value.items.push(newObject)
  objectState.value.items.sort((a, b) => a.vnum - b.vnum)

  toast.success(`New object #${newVnum} created (not yet saved to file)`)

  // Select the new object
  selectObject(newVnum)
}

// Zone name (from header data) - parsed with ANSI colors
const zoneNameHtml = computed(() => {
  if (!headerData.value?.header) return `Zone ${zoneId.value}`
  return parseAnsiToHtml(headerData.value.header.name)
})

// Zone name plain text (without ANSI codes) for exports
const zoneNamePlain = computed(() => {
  if (!headerData.value?.header) return `Zone ${zoneId.value}`
  // Strip ANSI codes from the name
  return headerData.value.header.name.replace(/&[+=-][A-Za-z]|&[nN]/g, '').trim()
})

// Zone number for display (from header data)
const zoneNumber = computed(() => headerData.value?.header?.number || 0)

// Live override for room name (for real-time preview)
const liveRoomName = ref<string | null>(null)

// Selected room name with ANSI rendering for header
const selectedRoomNameHtml = computed(() => {
  const name = liveRoomName.value ?? roomData.value?.room?.name
  if (!name) return ''
  return parseAnsiToHtml(name)
})

// Handle live room name updates from RoomEditor
function handleRoomNameUpdate(value: string) {
  liveRoomName.value = value
}

// Room list for sidebar - use streamed data only
const rooms = computed(() => {
  if (roomState.value.items.length > 0) {
    return [...roomState.value.items].sort((a, b) => a.vnum - b.vnum)
  }
  return []
})

// Mob list for sidebar - use streamed data only
const mobs = computed(() => {
  if (mobState.value.items.length > 0) {
    return [...mobState.value.items].sort((a, b) => a.vnum - b.vnum)
  }
  return []
})

// Object list for sidebar - use streamed data only
const objects = computed(() => {
  if (objectState.value.items.length > 0) {
    return [...objectState.value.items].sort((a, b) => a.vnum - b.vnum)
  }
  return []
})

// Strip ANSI codes for search
function stripAnsi(text: string): string {
  return text.replace(/&[+=-][A-Za-z]|&[nN]/g, '')
}

// Filtered lists based on search query
const filteredRooms = computed(() => {
  if (!searchQuery.value.trim()) return rooms.value
  const q = searchQuery.value.toLowerCase().trim()
  return rooms.value.filter(
    (r) => r.vnum.toString().includes(q) || stripAnsi(r.name).toLowerCase().includes(q),
  )
})

const filteredMobs = computed(() => {
  if (!searchQuery.value.trim()) return mobs.value
  const q = searchQuery.value.toLowerCase().trim()
  return mobs.value.filter(
    (m) =>
      m.vnum.toString().includes(q) ||
      stripAnsi(m.shortDesc).toLowerCase().includes(q) ||
      stripAnsi(m.keywords).toLowerCase().includes(q),
  )
})

const filteredObjects = computed(() => {
  if (!searchQuery.value.trim()) return objects.value
  const q = searchQuery.value.toLowerCase().trim()
  return objects.value.filter(
    (o) =>
      o.vnum.toString().includes(q) ||
      stripAnsi(o.shortDesc).toLowerCase().includes(q) ||
      stripAnsi(o.keywords).toLowerCase().includes(q),
  )
})

// Live override for mob shortDesc (for real-time preview)
const liveMobShortDesc = ref<string | null>(null)

// Selected mob name with ANSI rendering for header
const selectedMobNameHtml = computed(() => {
  const desc = liveMobShortDesc.value ?? mobData.value?.mobile?.shortDesc
  if (!desc) return ''
  return parseAnsiToHtml(desc)
})

// Handle live shortDesc updates from MobEditor
function handleMobShortDescUpdate(value: string) {
  liveMobShortDesc.value = value
}

// Live override for object shortDesc (for real-time preview)
const liveObjectShortDesc = ref<string | null>(null)

// Selected object name with ANSI rendering for header
const selectedObjectNameHtml = computed(() => {
  const desc = liveObjectShortDesc.value ?? objectData.value?.object?.shortDesc
  if (!desc) return ''
  return parseAnsiToHtml(desc)
})

// Handle live shortDesc updates from ObjectEditor
function handleObjectShortDescUpdate(value: string) {
  liveObjectShortDesc.value = value
}

// Saved positions for map
const savedPositions = computed(() => positionsData.value?.positions || {})

// Select a room to edit
function selectRoom(vnum: number) {
  selectedRoomVnum.value = vnum
  liveRoomName.value = null // Reset live override when switching rooms
  if (!openRooms.value.includes(vnum)) {
    openRooms.value.push(vnum)
  }
}

// Close a room tab
function closeRoom(vnum: number) {
  const index = openRooms.value.indexOf(vnum)
  if (index >= 0) {
    openRooms.value.splice(index, 1)
    if (selectedRoomVnum.value === vnum) {
      selectedRoomVnum.value = openRooms.value[openRooms.value.length - 1] || null
    }
  }
}

// Handle room save from editor - now saves to localStorage only
function handleRoomSave(room: Room) {
  const cache = zoneCache.value

  // Get the current state before changes for undo history
  const beforeState = cache.getRoom(room.vnum) || roomData.value?.room || null

  // Push to history
  pushHistory('room', room.vnum, 'modified', beforeState, room)

  cache.markRoomDirty(room, 'modified')

  // Update the room in roomState.items so UI reflects changes immediately
  const index = roomState.value.items.findIndex((r) => r.vnum === room.vnum)
  if (index >= 0) {
    const existingItem = roomState.value.items[index]
    // Convert Room to RoomIndex for the list
    roomState.value.items[index] = {
      vnum: room.vnum,
      name: room.name,
      sectorType: room.sectorType,
      exits: existingItem?.exits ?? {}, // Keep existing exits display
    }
  }

  toast.success('Changes saved locally (not yet written to file)')
}

// Select a mob to edit
function selectMob(vnum: number) {
  selectedMobVnum.value = vnum
  liveMobShortDesc.value = null // Reset live override when switching mobs
  if (!openMobs.value.includes(vnum)) {
    openMobs.value.push(vnum)
  }
}

// Close a mob tab
function closeMob(vnum: number) {
  const index = openMobs.value.indexOf(vnum)
  if (index >= 0) {
    openMobs.value.splice(index, 1)
    if (selectedMobVnum.value === vnum) {
      selectedMobVnum.value = openMobs.value[openMobs.value.length - 1] || null
    }
  }
}

// Handle mob save from editor - now saves to localStorage only
function handleMobSave(mob: Mobile) {
  const cache = zoneCache.value

  // Get the current state before changes for undo history
  const beforeState = cache.getMob(mob.vnum) || mobData.value?.mobile || null

  // Push to history
  pushHistory('mob', mob.vnum, 'modified', beforeState, mob)

  cache.markMobDirty(mob, 'modified')

  // Update the mob in local state so UI reflects changes immediately
  const index = mobs.value.findIndex((m) => m.vnum === mob.vnum)
  if (index >= 0) {
    mobs.value[index] = { ...mob }
  }

  toast.success('Changes saved locally (not yet written to file)')
}

// Select an object to edit
function selectObject(vnum: number) {
  selectedObjectVnum.value = vnum
  liveObjectShortDesc.value = null // Reset live override when switching objects
  if (!openObjects.value.includes(vnum)) {
    openObjects.value.push(vnum)
  }
}

// Close an object tab
function closeObject(vnum: number) {
  const index = openObjects.value.indexOf(vnum)
  if (index >= 0) {
    openObjects.value.splice(index, 1)
    if (selectedObjectVnum.value === vnum) {
      selectedObjectVnum.value = openObjects.value[openObjects.value.length - 1] || null
    }
  }
}

// Handle object save from editor - now saves to localStorage only
function handleObjectSave(obj: ZoneObject) {
  const cache = zoneCache.value

  // Get the current state before changes for undo history
  const beforeState = cache.getObject(obj.vnum) || objectData.value?.object || null

  // Push to history
  pushHistory('object', obj.vnum, 'modified', beforeState, obj)

  cache.markObjectDirty(obj, 'modified')

  // Update the object in local state so UI reflects changes immediately
  const index = objects.value.findIndex((o) => o.vnum === obj.vnum)
  if (index >= 0) {
    objects.value[index] = { ...obj }
  }

  toast.success('Changes saved locally (not yet written to file)')
}

// Handle position changes from map
function handlePositionsChanged(positions: Record<number, RoomPosition>) {
  savePositionsMutation.mutate(positions)
}

// Handle room selection from map
function handleMapSelectRoom(vnum: number) {
  selectRoom(vnum)
}

// Refresh zone data by re-streaming
function refreshZone() {
  clearState()
  streamRooms(zoneId.value)
  // Mobs and objects will reload when their tabs are clicked
}

// Go back to dashboard
function goBack() {
  router.push('/builder')
}

// Download zone files
function downloadFile(type: 'wld' | 'mob' | 'obj' | 'zon' | 'all') {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  const url = `${baseUrl}/api/builder/zones/${zoneId.value}/download/${type}`
  window.open(url, '_blank')
}

// ========== LOCALSTORAGE-FIRST SAVE WORKFLOW ==========

// Save all dirty items to file
async function saveToFile() {
  const cache = zoneCache.value
  const dirtyList = cache.getDirtyList()

  if (dirtyList.length === 0) {
    toast.info('No changes to save')
    return
  }

  isSavingToFile.value = true
  let savedCount = 0
  let errorCount = 0

  try {
    for (const entry of dirtyList) {
      try {
        if (entry.type === 'room' && entry.data) {
          const room = entry.data as Room
          if (entry.action === 'created') {
            await builderApi.createRoom(zoneId.value, room)
          } else if (entry.action === 'modified') {
            await builderApi.updateRoom(zoneId.value, room.vnum, room)
          } else if (entry.action === 'deleted') {
            await builderApi.deleteRoom(zoneId.value, entry.vnum)
          }
          cache.clearDirty('room', entry.vnum)
          cache.removeRoom(entry.vnum)
          savedCount++
        } else if (entry.type === 'mob' && entry.data) {
          const mob = entry.data as Mobile
          if (entry.action === 'created') {
            await builderApi.createMobile(zoneId.value, mob)
          } else if (entry.action === 'modified') {
            await builderApi.updateMobile(zoneId.value, mob.vnum, mob)
          } else if (entry.action === 'deleted') {
            await builderApi.deleteMobile(zoneId.value, entry.vnum)
          }
          cache.clearDirty('mob', entry.vnum)
          cache.removeMob(entry.vnum)
          savedCount++
        } else if (entry.type === 'object' && entry.data) {
          const obj = entry.data as ZoneObject
          if (entry.action === 'created') {
            await builderApi.createObject(zoneId.value, obj)
          } else if (entry.action === 'modified') {
            await builderApi.updateObject(zoneId.value, obj.vnum, obj)
          } else if (entry.action === 'deleted') {
            await builderApi.deleteObject(zoneId.value, entry.vnum)
          }
          cache.clearDirty('object', entry.vnum)
          cache.removeObject(entry.vnum)
          savedCount++
        } else if (entry.type === 'resets' && entry.data) {
          const resets = entry.data as ResetCommand[]
          await builderApi.saveZoneResets(zoneId.value, resets)
          cache.clearDirty('resets', 0)
          cache.removeResets()
          savedCount++
        }
      } catch (err) {
        console.error(`Failed to save ${entry.type} ${entry.vnum}:`, err)
        errorCount++
      }
    }

    if (errorCount === 0) {
      toast.success(`${savedCount} item(s) saved to file`)
    } else {
      toast.warning(`${savedCount} saved, ${errorCount} failed`)
    }

    // Refresh data from server
    clearState()
    streamRooms(zoneId.value)
    queryClient.invalidateQueries({ queryKey: ['builder-zone', zoneId.value] })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    toast.error(`Failed to save: ${errorMessage}`)
  } finally {
    isSavingToFile.value = false
  }
}

// Revert all changes (discard localStorage)
function revertChanges() {
  const cache = zoneCache.value
  cache.clearCache()
  showRecoveryBanner.value = false
  revertDialogOpen.value = false

  // Refresh data from server
  clearState()
  streamRooms(zoneId.value)

  // Clear selected items that might have been edited
  if (activeEntityType.value === 'mob') {
    streamMobs(zoneId.value)
  } else if (activeEntityType.value === 'obj') {
    streamObjects(zoneId.value)
  }

  // Invalidate queries to refetch fresh data
  queryClient.invalidateQueries({ queryKey: ['builder-room', zoneId.value] })
  queryClient.invalidateQueries({ queryKey: ['builder-mob', zoneId.value] })
  queryClient.invalidateQueries({ queryKey: ['builder-object', zoneId.value] })

  toast.success('All changes reverted')
}

// Dismiss recovery banner and keep editing
function dismissRecoveryBanner() {
  showRecoveryBanner.value = false
}

// Discard recovered changes from previous session
function discardRecoveredChanges() {
  revertChanges()
}

// beforeunload handler to warn about unsaved changes
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (zoneCache.value.hasDirtyItems.value) {
    e.preventDefault()
    e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
    return e.returnValue
  }
}

// Keyboard shortcuts handler
function handleKeyDown(e: KeyboardEvent) {
  // Ignore if user is typing in an input
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  // Ctrl+Z = Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    performUndo()
  }
  // Ctrl+Shift+Z or Ctrl+Y = Redo
  else if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === 'Z' || (e.shiftKey && e.key === 'z') || e.key === 'y')
  ) {
    e.preventDefault()
    performRedo()
  }
}

// Apply undo - restore previous state
function performUndo() {
  const entry = historyUndo()
  if (!entry) {
    toast.info('Nothing to undo')
    return
  }

  const cache = zoneCache.value

  // Apply the "before" state
  if (entry.action === 'modified' && entry.before) {
    // Restore previous version
    if (entry.type === 'room') {
      const room = entry.before as Room
      cache.setRoom(room)
      cache.markRoomDirty(room, 'modified')
      // Update TanStack Query cache directly with the undone data
      queryClient.setQueryData(['builder-room', zoneId.value, entry.vnum], { room })
      // Also update roomState items for the sidebar
      const idx = roomState.value.items.findIndex((r) => r.vnum === entry.vnum)
      if (idx >= 0) {
        roomState.value.items[idx] = {
          vnum: room.vnum,
          name: room.name,
          sectorType: room.sectorType,
          exits: exitsToMap(room.exits),
        }
      }
      // Reset live room name override and force editor refresh if this is the currently selected room
      if (selectedRoomVnum.value === entry.vnum) {
        liveRoomName.value = room.name
        roomEditorKey.value++
      }
    } else if (entry.type === 'mob') {
      const mob = entry.before as Mobile
      cache.setMob(mob)
      cache.markMobDirty(mob, 'modified')
      queryClient.setQueryData(['builder-mob', zoneId.value, entry.vnum], { mobile: mob })
      const idx = mobState.value.items.findIndex((m) => m.vnum === entry.vnum)
      if (idx >= 0) {
        mobState.value.items[idx] = mob
      }
      if (selectedMobVnum.value === entry.vnum) {
        mobEditorKey.value++
      }
    } else if (entry.type === 'object') {
      const obj = entry.before as ZoneObject
      cache.setObject(obj)
      cache.markObjectDirty(obj, 'modified')
      queryClient.setQueryData(['builder-object', zoneId.value, entry.vnum], { object: obj })
      const idx = objectState.value.items.findIndex((o) => o.vnum === entry.vnum)
      if (idx >= 0) {
        objectState.value.items[idx] = obj
      }
      if (selectedObjectVnum.value === entry.vnum) {
        objectEditorKey.value++
      }
    }
  } else if (entry.action === 'created') {
    // Undo create = remove from cache (mark as deleted or just remove)
    if (entry.type === 'room') {
      cache.clearDirty('room', entry.vnum)
      cache.removeRoom(entry.vnum)
      // Remove from roomState items
      const idx = roomState.value.items.findIndex((r) => r.vnum === entry.vnum)
      if (idx >= 0) roomState.value.items.splice(idx, 1)
      // Close tab if open
      if (selectedRoomVnum.value === entry.vnum) {
        closeRoom(entry.vnum)
      }
    } else if (entry.type === 'mob') {
      cache.clearDirty('mob', entry.vnum)
      cache.removeMob(entry.vnum)
      const idx = mobState.value.items.findIndex((m) => m.vnum === entry.vnum)
      if (idx >= 0) mobState.value.items.splice(idx, 1)
      if (selectedMobVnum.value === entry.vnum) {
        closeMob(entry.vnum)
      }
    } else if (entry.type === 'object') {
      cache.clearDirty('object', entry.vnum)
      cache.removeObject(entry.vnum)
      const idx = objectState.value.items.findIndex((o) => o.vnum === entry.vnum)
      if (idx >= 0) objectState.value.items.splice(idx, 1)
      if (selectedObjectVnum.value === entry.vnum) {
        closeObject(entry.vnum)
      }
    }
  }

  toast.info(`Undo: ${entry.description}`)
}

// Apply redo - restore next state
function performRedo() {
  const entry = historyRedo()
  if (!entry) {
    toast.info('Nothing to redo')
    return
  }

  const cache = zoneCache.value

  // Apply the "after" state
  if (entry.action === 'modified' && entry.after) {
    if (entry.type === 'room') {
      const room = entry.after as Room
      cache.setRoom(room)
      cache.markRoomDirty(room, 'modified')
      // Update TanStack Query cache directly with the redone data
      queryClient.setQueryData(['builder-room', zoneId.value, entry.vnum], { room })
      // Also update roomState items for the sidebar
      const idx = roomState.value.items.findIndex((r) => r.vnum === entry.vnum)
      if (idx >= 0) {
        roomState.value.items[idx] = {
          vnum: room.vnum,
          name: room.name,
          sectorType: room.sectorType,
          exits: exitsToMap(room.exits),
        }
      }
      // Update live room name and force editor refresh if this is the currently selected room
      if (selectedRoomVnum.value === entry.vnum) {
        liveRoomName.value = room.name
        roomEditorKey.value++
      }
    } else if (entry.type === 'mob') {
      const mob = entry.after as Mobile
      cache.setMob(mob)
      cache.markMobDirty(mob, 'modified')
      queryClient.setQueryData(['builder-mob', zoneId.value, entry.vnum], { mobile: mob })
      const idx = mobState.value.items.findIndex((m) => m.vnum === entry.vnum)
      if (idx >= 0) {
        mobState.value.items[idx] = mob
      }
      if (selectedMobVnum.value === entry.vnum) {
        mobEditorKey.value++
      }
    } else if (entry.type === 'object') {
      const obj = entry.after as ZoneObject
      cache.setObject(obj)
      cache.markObjectDirty(obj, 'modified')
      queryClient.setQueryData(['builder-object', zoneId.value, entry.vnum], { object: obj })
      const idx = objectState.value.items.findIndex((o) => o.vnum === entry.vnum)
      if (idx >= 0) {
        objectState.value.items[idx] = obj
      }
      if (selectedObjectVnum.value === entry.vnum) {
        objectEditorKey.value++
      }
    }
  } else if (entry.action === 'created' && entry.after) {
    // Redo create = add back
    if (entry.type === 'room') {
      const room = entry.after as Room
      cache.setRoom(room)
      cache.markRoomDirty(room, 'created')
      queryClient.setQueryData(['builder-room', zoneId.value, entry.vnum], { room })
      roomState.value.items.push({
        vnum: room.vnum,
        name: room.name,
        sectorType: room.sectorType,
        exits: exitsToMap(room.exits),
      })
      roomState.value.items.sort((a, b) => a.vnum - b.vnum)
    } else if (entry.type === 'mob') {
      const mob = entry.after as Mobile
      cache.setMob(mob)
      cache.markMobDirty(mob, 'created')
      queryClient.setQueryData(['builder-mob', zoneId.value, entry.vnum], { mobile: mob })
      mobState.value.items.push(mob)
      mobState.value.items.sort((a, b) => a.vnum - b.vnum)
    } else if (entry.type === 'object') {
      const obj = entry.after as ZoneObject
      cache.setObject(obj)
      cache.markObjectDirty(obj, 'created')
      queryClient.setQueryData(['builder-object', zoneId.value, entry.vnum], { object: obj })
      objectState.value.items.push(obj)
      objectState.value.items.sort((a, b) => a.vnum - b.vnum)
    }
  }

  toast.info(`Redo: ${entry.description}`)
}

// Handle git commit success
function handleGitCommitted(commitHash: string) {
  toast.success(`Changes committed: ${commitHash}`)
  gitCommitDialogOpen.value = false
}
</script>

<template>
  <div class="h-[calc(100vh-102px)] flex flex-col">
    <!-- Header -->
    <header class="border-b bg-background px-4 py-3 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <div>
          <h1 class="text-xl font-semibold" v-html="zoneNameHtml" />
          <p class="text-sm text-muted-foreground">
            Zone {{ zoneNumber }} - {{ rooms.length }} rooms, {{ mobs.length }} mobs, {{ objects.length }} objects
          </p>
        </div>

        <!-- Main view toggle -->
        <Tabs v-model="mainView" class="ml-4">
          <TabsList class="h-8">
            <TabsTrigger value="editor" class="text-xs">
              <Home class="h-3 w-3 mr-1" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="resets" class="text-xs">
              <ListRestart class="h-3 w-3 mr-1" />
              Resets
            </TabsTrigger>
            <TabsTrigger value="info" class="text-xs">
              <Info class="h-3 w-3 mr-1" />
              Info
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <!-- Centered entity name with ANSI colors (only in editor mode) -->
      <template v-if="mainView === 'editor'">
        <div v-if="activeEntityType === 'room' && selectedRoomNameHtml" class="text-lg font-medium" v-html="selectedRoomNameHtml" />
        <div v-else-if="activeEntityType === 'mob' && selectedMobNameHtml" class="text-lg font-medium" v-html="selectedMobNameHtml" />
        <div v-else-if="activeEntityType === 'obj' && selectedObjectNameHtml" class="text-lg font-medium" v-html="selectedObjectNameHtml" />
        <div v-else class="text-muted-foreground text-sm">
          {{ activeEntityType === 'room' ? 'No room selected' : activeEntityType === 'mob' ? 'No mob selected' : 'No object selected' }}
        </div>
      </template>
      <div v-else />

      <div class="flex items-center gap-2">
        <!-- Save to File Button -->
        <Button
          variant="default"
          size="sm"
          :disabled="!zoneCache.hasDirtyItems.value || isSavingToFile"
          @click="saveToFile"
        >
          <Save v-if="!isSavingToFile" class="h-4 w-4 mr-2" />
          <RefreshCw v-else class="h-4 w-4 mr-2 animate-spin" />
          Save to File
          <Badge v-if="zoneCache.dirtyCount.value > 0" variant="secondary" class="ml-2">
            {{ zoneCache.dirtyCount.value }}
          </Badge>
        </Button>

        <!-- Revert Button -->
        <Button
          variant="outline"
          size="sm"
          :disabled="!zoneCache.hasDirtyItems.value"
          @click="revertDialogOpen = true"
        >
          <Undo2 class="h-4 w-4 mr-2" />
          Revert
        </Button>

        <!-- Undo/Redo Buttons -->
        <div class="flex items-center border rounded-md">
          <Button
            variant="ghost"
            size="sm"
            :disabled="!canUndo"
            :title="getUndoDescription() || 'Undo (Ctrl+Z)'"
            class="rounded-r-none border-r"
            @click="performUndo"
          >
            <Undo2 class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :disabled="!canRedo"
            :title="getRedoDescription() || 'Redo (Ctrl+Shift+Z)'"
            class="rounded-l-none"
            @click="performRedo"
          >
            <Redo2 class="h-4 w-4" />
          </Button>
        </div>

        <!-- Git Commit Button -->
        <Button
          v-if="showGitCommitButton"
          variant="outline"
          size="sm"
          title="Commit zone changes to git"
          @click="gitCommitDialogOpen = true"
        >
          <GitCommit class="h-4 w-4 mr-2" />
          Commit
        </Button>

        <!-- Download Dropdown -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm">
              <Download class="h-4 w-4 mr-2" />
              Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Export Zone Files</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="downloadFile('all')">
              <Archive class="h-4 w-4 mr-2" />
              Download All (.zip)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="downloadFile('wld')">
              <FileText class="h-4 w-4 mr-2" />
              Rooms (.wld)
            </DropdownMenuItem>
            <DropdownMenuItem @click="downloadFile('mob')">
              <FileText class="h-4 w-4 mr-2" />
              Mobs (.mob)
            </DropdownMenuItem>
            <DropdownMenuItem @click="downloadFile('obj')">
              <FileText class="h-4 w-4 mr-2" />
              Objects (.obj)
            </DropdownMenuItem>
            <DropdownMenuItem @click="downloadFile('zon')">
              <FileText class="h-4 w-4 mr-2" />
              Resets (.zon)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button v-if="mainView === 'editor'" variant="outline" size="sm" @click="refreshZone()">
          <RefreshCw class="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    </header>

    <!-- Resets Editor (full-width when in resets view) -->
    <ResetsEditor
      v-if="mainView === 'resets'"
      :zone-id="zoneId"
      :mobs="mobs"
      :objects="objects"
      :rooms="rooms"
      class="flex-1"
    />

    <!-- Zone Info Tab (full-width when in info view) -->
    <ZoneInfoTab
      v-else-if="mainView === 'info'"
      :zone-id="zoneId"
      :zone-name="zoneNamePlain"
      class="flex-1"
    />

    <!-- Main Content: 3-column layout (Editor mode) -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Sidebar: Entity List -->
      <aside
        class="relative border-r bg-muted/30 shrink-0 transition-all duration-200 overflow-hidden"
        :class="sidebarCollapsed ? 'w-0 border-r-0' : 'w-56'"
      >
        <div class="w-56 h-full flex flex-col">
          <!-- Entity Type Tabs -->
          <div class="p-2 border-b">
            <Tabs v-model="activeEntityType" class="w-full">
              <TabsList class="w-full grid grid-cols-3 h-8">
                <TabsTrigger value="room" class="text-xs">
                  <Home class="h-3 w-3 mr-1" />
                  Rooms
                </TabsTrigger>
                <TabsTrigger value="mob" class="text-xs">
                  <User class="h-3 w-3 mr-1" />
                  Mobs
                </TabsTrigger>
                <TabsTrigger value="obj" class="text-xs">
                  <Package class="h-3 w-3 mr-1" />
                  Objs
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <!-- Search Input -->
          <div class="p-2 border-b">
            <div class="relative">
              <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                placeholder="Search..."
                class="h-7 pl-7 text-xs"
              />
            </div>
          </div>

          <!-- Entity List -->
          <div class="flex-1 overflow-y-auto p-3">
            <!-- Room List -->
            <div v-show="activeEntityType === 'room'" class="space-y-1">
              <!-- Streaming Progress -->
              <ZoneLoadingProgress
                v-show="roomState.isStreaming || (roomState.total > 0 && !roomState.isComplete)"
                type="rooms"
                :loaded="roomState.loaded"
                :total="roomState.total"
                :is-streaming="roomState.isStreaming"
                :is-complete="roomState.isComplete"
                :error="roomState.error"
                class="mb-3"
              />
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-muted-foreground">
                  {{ filteredRooms.length }}{{ searchQuery ? ` / ${rooms.length}` : '' }} rooms
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-6 w-6 p-0"
                  title="Create new room"
                  @click="createNewRoom"
                >
                  <Plus class="h-3.5 w-3.5" />
                </Button>
              </div>
              <div
                v-for="room in filteredRooms"
                :key="room.vnum"
                class="group w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent cursor-pointer"
                :class="{
                  'bg-accent': selectedRoomVnum === room.vnum,
                  'text-muted-foreground': selectedRoomVnum !== room.vnum,
                }"
                @click="selectRoom(room.vnum)"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1">
                    <span class="font-mono text-xs text-muted-foreground">#{{ room.vnum }}</span>
                    <span
                      v-if="zoneCache.isRoomDirty(room.vnum)"
                      class="w-1.5 h-1.5 rounded-full bg-yellow-500"
                      title="Unsaved changes"
                    />
                  </div>
                  <button
                    class="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Clone room"
                    @click.stop="openCloneRoomDialog(room.vnum, room.name)"
                  >
                    <Copy class="h-3 w-3" />
                  </button>
                </div>
                <div class="truncate text-xs" v-html="parseAnsiToHtml(room.name)" />
              </div>
            </div>

            <!-- Mob List -->
            <div v-show="activeEntityType === 'mob'" class="space-y-1">
              <!-- Streaming Progress -->
              <ZoneLoadingProgress
                v-show="mobState.isStreaming || (mobState.total > 0 && !mobState.isComplete)"
                type="mobs"
                :loaded="mobState.loaded"
                :total="mobState.total"
                :is-streaming="mobState.isStreaming"
                :is-complete="mobState.isComplete"
                :error="mobState.error"
                class="mb-3"
              />
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-muted-foreground">
                  {{ filteredMobs.length }}{{ searchQuery ? ` / ${mobs.length}` : '' }} mobs
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-6 w-6 p-0"
                  title="Create new mob"
                  @click="createNewMob"
                >
                  <Plus class="h-3.5 w-3.5" />
                </Button>
              </div>
              <button
                v-for="mob in filteredMobs"
                :key="mob.vnum"
                class="w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent"
                :class="{
                  'bg-accent': selectedMobVnum === mob.vnum,
                  'text-muted-foreground': selectedMobVnum !== mob.vnum,
                }"
                @click="selectMob(mob.vnum)"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1">
                    <span class="font-mono text-xs text-muted-foreground">#{{ mob.vnum }}</span>
                    <span
                      v-if="zoneCache.isMobDirty(mob.vnum)"
                      class="w-1.5 h-1.5 rounded-full bg-yellow-500"
                      title="Unsaved changes"
                    />
                  </div>
                  <Badge variant="outline" class="text-[10px] h-4">L{{ mob.level }}</Badge>
                </div>
                <div class="truncate text-xs" v-html="parseAnsiToHtml(mob.shortDesc)" />
              </button>
            </div>

            <!-- Object List -->
            <div v-show="activeEntityType === 'obj'" class="space-y-1">
              <!-- Streaming Progress -->
              <ZoneLoadingProgress
                v-show="objectState.isStreaming || (objectState.total > 0 && !objectState.isComplete)"
                type="objects"
                :loaded="objectState.loaded"
                :total="objectState.total"
                :is-streaming="objectState.isStreaming"
                :is-complete="objectState.isComplete"
                :error="objectState.error"
                class="mb-3"
              />
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-muted-foreground">
                  {{ filteredObjects.length }}{{ searchQuery ? ` / ${objects.length}` : '' }} objects
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-6 w-6 p-0"
                  title="Create new object"
                  @click="createNewObject"
                >
                  <Plus class="h-3.5 w-3.5" />
                </Button>
              </div>
              <button
                v-for="obj in filteredObjects"
                :key="obj.vnum"
                class="w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent"
                :class="{
                  'bg-accent': selectedObjectVnum === obj.vnum,
                  'text-muted-foreground': selectedObjectVnum !== obj.vnum,
                }"
                @click="selectObject(obj.vnum)"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1">
                    <span class="font-mono text-xs text-muted-foreground">#{{ obj.vnum }}</span>
                    <span
                      v-if="zoneCache.isObjectDirty(obj.vnum)"
                      class="w-1.5 h-1.5 rounded-full bg-yellow-500"
                      title="Unsaved changes"
                    />
                  </div>
                  <Badge variant="outline" class="text-[10px] h-4">T{{ obj.itemType }}</Badge>
                </div>
                <div class="truncate text-xs" v-html="parseAnsiToHtml(obj.shortDesc)" />
              </button>
            </div>
          </div>
        </div>

        <!-- Toggle Button (visible when expanded) -->
        <button
          v-if="!sidebarCollapsed"
          class="absolute top-1/2 -right-4 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-muted border flex items-center justify-center hover:bg-cyan-600 hover:text-white transition-colors"
          @click="sidebarCollapsed = true"
          title="Collapse sidebar"
        >
          <PanelLeftClose class="h-4 w-4" />
        </button>
      </aside>

      <!-- Toggle Button (visible when collapsed) -->
      <button
        v-if="sidebarCollapsed"
        class="shrink-0 h-full w-10 bg-muted/50 flex items-center justify-center hover:bg-cyan-600 hover:text-white transition-colors border-r"
        @click="sidebarCollapsed = false"
        title="Expand sidebar"
      >
        <PanelLeftOpen class="h-5 w-5" />
      </button>

      <!-- Editor Area -->
      <main class="flex-1 overflow-hidden flex flex-col min-w-0">
        <!-- Room Editor Mode -->
        <template v-if="activeEntityType === 'room'">
          <!-- Tabs for open rooms -->
          <div v-if="openRooms.length > 0" class="border-b px-2 pt-2 flex items-center gap-1 overflow-x-auto shrink-0 bg-muted/20">
            <div
              v-for="vnum in openRooms"
              :key="vnum"
              class="flex items-center gap-2 px-3 py-2 text-sm rounded-t-md transition-colors cursor-pointer"
              :class="{
                'bg-background border border-b-0': selectedRoomVnum === vnum,
                'hover:bg-muted': selectedRoomVnum !== vnum,
              }"
              @click="selectedRoomVnum = vnum"
            >
              <Home class="h-3 w-3" />
              <span class="font-mono text-xs">#{{ vnum }}</span>
              <button
                class="hover:bg-muted-foreground/20 rounded p-0.5"
                @click.stop="closeRoom(vnum)"
              >
                <X class="h-3 w-3" />
              </button>
            </div>
          </div>

          <!-- Room Editor Content -->
          <div class="flex-1 overflow-y-auto">
            <!-- Zone loading -->
            <div
              v-if="zoneLoading"
              class="h-full flex items-center justify-center text-muted-foreground"
            >
              <div class="text-center">
                <RefreshCw class="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
                <p>Loading zone data...</p>
              </div>
            </div>

            <!-- No room selected -->
            <div
              v-else-if="selectedRoomVnum === null"
              class="h-full flex items-center justify-center text-muted-foreground"
            >
              <div class="text-center">
                <Home class="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a room from the sidebar or map to edit</p>
              </div>
            </div>

            <!-- Room loading -->
            <div v-else-if="roomLoading" class="p-6">
              <Skeleton class="h-8 w-1/3 mb-4" />
              <Skeleton class="h-32 w-full mb-4" />
              <Skeleton class="h-48 w-full" />
            </div>

            <!-- Room editor -->
            <RoomEditor
              v-else-if="roomData?.room"
              :key="`room-${selectedRoomVnum}-${roomEditorKey}`"
              :room="roomData.room"
              :zone-number="zoneNumber"
              :saving="saveRoomMutation.isPending.value"
              @save="handleRoomSave"
              @update:name="handleRoomNameUpdate"
            />
          </div>
        </template>

        <!-- Mob Editor Mode -->
        <template v-else-if="activeEntityType === 'mob'">
          <!-- Tabs for open mobs -->
          <div v-if="openMobs.length > 0" class="border-b px-2 pt-2 flex items-center gap-1 overflow-x-auto shrink-0 bg-muted/20">
            <div
              v-for="vnum in openMobs"
              :key="vnum"
              class="flex items-center gap-2 px-3 py-2 text-sm rounded-t-md transition-colors cursor-pointer"
              :class="{
                'bg-background border border-b-0': selectedMobVnum === vnum,
                'hover:bg-muted': selectedMobVnum !== vnum,
              }"
              @click="selectedMobVnum = vnum"
            >
              <User class="h-3 w-3" />
              <span class="font-mono text-xs">#{{ vnum }}</span>
              <button
                class="hover:bg-muted-foreground/20 rounded p-0.5"
                @click.stop="closeMob(vnum)"
              >
                <X class="h-3 w-3" />
              </button>
            </div>
          </div>

          <!-- Mob Editor Content -->
          <div class="flex-1 overflow-y-auto">
            <!-- Mob loading -->
            <div
              v-if="mobState.isStreaming && mobState.items.length === 0"
              class="h-full flex items-center justify-center text-muted-foreground"
            >
              <div class="text-center">
                <RefreshCw class="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
                <p>Loading mobs...</p>
              </div>
            </div>

            <!-- No mob selected -->
            <div
              v-else-if="selectedMobVnum === null"
              class="h-full flex items-center justify-center text-muted-foreground"
            >
              <div class="text-center">
                <User class="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a mob from the sidebar to edit</p>
              </div>
            </div>

            <!-- Mob loading -->
            <div v-else-if="mobLoading" class="p-6">
              <Skeleton class="h-8 w-1/3 mb-4" />
              <Skeleton class="h-32 w-full mb-4" />
              <Skeleton class="h-48 w-full" />
            </div>

            <!-- Mob editor -->
            <MobEditor
              v-else-if="mobData?.mobile"
              :key="`mob-${selectedMobVnum}-${mobEditorKey}`"
              :mob="mobData.mobile"
              :zone-number="zoneNumber"
              :saving="saveMobMutation.isPending.value"
              @save="handleMobSave"
              @update:short-desc="handleMobShortDescUpdate"
            />
          </div>
        </template>

        <!-- Object Editor Mode -->
        <template v-else-if="activeEntityType === 'obj'">
          <!-- Tabs for open objects -->
          <div v-if="openObjects.length > 0" class="border-b px-2 pt-2 flex items-center gap-1 overflow-x-auto shrink-0 bg-muted/20">
            <div
              v-for="vnum in openObjects"
              :key="vnum"
              class="flex items-center gap-2 px-3 py-2 text-sm rounded-t-md transition-colors cursor-pointer"
              :class="{
                'bg-background border border-b-0': selectedObjectVnum === vnum,
                'hover:bg-muted': selectedObjectVnum !== vnum,
              }"
              @click="selectedObjectVnum = vnum"
            >
              <Package class="h-3 w-3" />
              <span class="font-mono text-xs">#{{ vnum }}</span>
              <button
                class="hover:bg-muted-foreground/20 rounded p-0.5"
                @click.stop="closeObject(vnum)"
              >
                <X class="h-3 w-3" />
              </button>
            </div>
          </div>

          <!-- Object Editor Content -->
          <div class="flex-1 overflow-y-auto">
            <!-- Object loading -->
            <div
              v-if="objectState.isStreaming && objectState.items.length === 0"
              class="h-full flex items-center justify-center text-muted-foreground"
            >
              <div class="text-center">
                <RefreshCw class="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
                <p>Loading objects...</p>
              </div>
            </div>

            <!-- No object selected -->
            <div
              v-else-if="selectedObjectVnum === null"
              class="h-full flex items-center justify-center text-muted-foreground"
            >
              <div class="text-center">
                <Package class="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select an object from the sidebar to edit</p>
              </div>
            </div>

            <!-- Object loading -->
            <div v-else-if="objectLoading" class="p-6">
              <Skeleton class="h-8 w-1/3 mb-4" />
              <Skeleton class="h-32 w-full mb-4" />
              <Skeleton class="h-48 w-full" />
            </div>

            <!-- Object editor -->
            <ObjectEditor
              v-else-if="objectData?.object"
              :key="`obj-${selectedObjectVnum}-${objectEditorKey}`"
              :obj="objectData.object"
              :zone-number="zoneNumber"
              :saving="saveObjectMutation.isPending.value"
              @save="handleObjectSave"
              @update:short-desc="handleObjectShortDescUpdate"
            />
          </div>
        </template>
      </main>

      <!-- Toggle Button (visible when map collapsed) -->
      <button
        v-if="mapCollapsed"
        class="shrink-0 h-full w-10 bg-muted/50 flex items-center justify-center hover:bg-cyan-600 hover:text-white transition-colors border-l"
        @click="mapCollapsed = false"
        title="Expand map"
      >
        <PanelRightOpen class="h-5 w-5" />
      </button>

      <!-- Zone Map -->
      <aside
        class="relative border-l shrink-0 transition-all duration-200 overflow-hidden"
        :class="mapCollapsed ? 'w-0 border-l-0' : 'w-[40%]'"
      >
        <!-- Toggle Button (visible when expanded) -->
        <button
          v-if="!mapCollapsed"
          class="absolute top-1/2 -left-4 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-muted border flex items-center justify-center hover:bg-cyan-600 hover:text-white transition-colors"
          @click="mapCollapsed = true"
          title="Collapse map"
        >
          <PanelRightClose class="h-4 w-4" />
        </button>

        <ZoneMap
          :rooms="rooms"
          :selected-room-vnum="selectedRoomVnum"
          :saved-positions="savedPositions"
          :zone-name="zoneNamePlain"
          :zone-name-ansi="headerData?.header?.name"
          @select-room="handleMapSelectRoom"
          @positions-changed="handlePositionsChanged"
        />
      </aside>
    </div>

    <!-- Clone Room Dialog -->
    <Dialog v-model:open="cloneRoomDialogOpen">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Clone Room</DialogTitle>
          <DialogDescription>
            Create copies of this room. Exits will NOT be copied - you'll need to set them up manually.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid gap-2">
            <Label>Source Room</Label>
            <div class="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded">
              <span class="font-mono">#{{ cloneRoomSourceVnum }}</span>
              <span v-html="parseAnsiToHtml(cloneRoomSourceName)" />
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="cloneCount">Number of Copies</Label>
            <Input
              id="cloneCount"
              v-model.number="cloneRoomCount"
              type="number"
              min="1"
              max="100"
              class="font-mono w-24"
            />
            <p class="text-xs text-muted-foreground">
              How many copies to create (1-100)
            </p>
          </div>
          <div class="grid gap-2">
            <Label for="targetVnum">Starting VNUM (optional)</Label>
            <Input
              id="targetVnum"
              v-model="cloneRoomTargetVnum"
              placeholder="Auto (next available)"
              class="font-mono"
            />
            <p class="text-xs text-muted-foreground">
              Leave empty to automatically use the next available VNUM(s)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="cloneRoomDialogOpen = false">
            Cancel
          </Button>
          <Button
            @click="executeCloneRoom"
            :disabled="isCloning"
          >
            <Copy v-if="!isCloning" class="h-4 w-4 mr-2" />
            <RefreshCw v-else class="h-4 w-4 mr-2 animate-spin" />
            Clone {{ cloneRoomCount > 1 ? `(${cloneRoomCount})` : '' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Revert Confirmation Dialog -->
    <AlertDialog v-model:open="revertDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have {{ zoneCache.dirtyCount.value }} unsaved change(s). This will discard all local changes and reload from the server. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="revertChanges">
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Git Commit Dialog -->
    <GitCommitDialog
      :open="gitCommitDialogOpen"
      :zone-id="zoneId"
      :zone-name="zoneNamePlain"
      @update:open="gitCommitDialogOpen = $event"
      @committed="handleGitCommitted"
    />

    <!-- Recovery Banner -->
    <div v-if="showRecoveryBanner" class="fixed top-16 left-0 right-0 z-50 px-4">
      <Alert class="mx-auto max-w-4xl border-yellow-500 bg-yellow-950 shadow-lg">
        <AlertTriangle class="h-4 w-4 text-yellow-500" />
        <AlertTitle>Unsaved changes from previous session</AlertTitle>
        <AlertDescription class="flex items-center justify-between">
          <span>You have {{ zoneCache.dirtyCount.value }} unsaved change(s) that were not saved to file.</span>
          <div class="flex gap-2 ml-4">
            <Button size="sm" variant="outline" @click="dismissRecoveryBanner">
              Keep Editing
            </Button>
            <Button size="sm" variant="destructive" @click="discardRecoveredChanges">
              Discard
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  </div>
</template>
