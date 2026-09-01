<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Copy, Check } from 'lucide-vue-next'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useMudStore()

type GmcpPackage =
  | 'Room.Info'
  | 'Room.Map'
  | 'Char.Vitals'
  | 'Char.Status'
  | 'Char.Affects'
  | 'Combat.Update'
  | 'Quest.Status'
  | 'Quest.Map'
  | 'Group.Status'
  | 'Ship.Contacts'
  | 'Ship.Info'
  | 'Comm.Channel'

const packages: { key: GmcpPackage; label: string }[] = [
  { key: 'Room.Info', label: 'Room.Info' },
  { key: 'Room.Map', label: 'Room.Map' },
  { key: 'Char.Vitals', label: 'Char.Vitals' },
  { key: 'Char.Status', label: 'Char.Status' },
  { key: 'Char.Affects', label: 'Char.Affects' },
  { key: 'Combat.Update', label: 'Combat' },
  { key: 'Quest.Status', label: 'Quest' },
  { key: 'Quest.Map', label: 'Quest.Map' },
  { key: 'Group.Status', label: 'Group' },
  { key: 'Ship.Contacts', label: 'Ship.Contacts' },
  { key: 'Ship.Info', label: 'Ship.Info' },
  { key: 'Comm.Channel', label: 'Chat' },
]

const selectedPackage = ref<GmcpPackage>('Room.Info')
const copied = ref(false)

const packageData = computed(() => {
  switch (selectedPackage.value) {
    case 'Room.Info':
      return store.room
    case 'Room.Map':
      return store.wildernessMap
    case 'Char.Vitals':
      return store.vitals
    case 'Char.Status':
      return store.character
    case 'Char.Affects':
      return store.affects
    case 'Combat.Update':
      return store.combatTarget
    case 'Quest.Status':
      return store.quest
    case 'Quest.Map':
      return store.questMap
    case 'Group.Status':
      return store.group
    case 'Ship.Contacts':
      return store.shipContacts
    case 'Ship.Info':
      return store.shipInfo
    case 'Comm.Channel':
      return store.chatMessages
    default:
      return null
  }
})

const formattedData = computed(() => {
  const data = packageData.value
  if (data === null || data === undefined) {
    return 'null'
  }
  if (typeof data === 'string') {
    return data
  }
  return JSON.stringify(data, null, 2)
})

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(formattedData.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Clipboard failed
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="!w-[90vw] !max-w-[1400px] h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>GMCP Debug</DialogTitle>
      </DialogHeader>

      <div class="flex-1 flex gap-4 min-h-0">
        <!-- Package List -->
        <div class="w-36 shrink-0">
          <ScrollArea class="h-full">
            <div class="space-y-1 pr-2">
              <Button
                v-for="pkg in packages"
                :key="pkg.key"
                variant="ghost"
                size="sm"
                class="w-full justify-start text-xs font-mono"
                :class="selectedPackage === pkg.key ? 'bg-muted' : ''"
                @click="selectedPackage = pkg.key"
              >
                {{ pkg.label }}
              </Button>
            </div>
          </ScrollArea>
        </div>

        <!-- JSON Display -->
        <div class="flex-1 flex flex-col min-w-0 border rounded-lg bg-muted/30">
          <div class="flex items-center justify-between px-3 py-2 border-b">
            <span class="text-sm font-mono text-muted-foreground">{{ selectedPackage }}</span>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              @click="copyToClipboard"
            >
              <Check v-if="copied" class="h-4 w-4 text-green-500" />
              <Copy v-else class="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea class="flex-1">
            <pre class="p-3 text-xs font-mono whitespace-pre-wrap break-all">{{ formattedData }}</pre>
          </ScrollArea>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
