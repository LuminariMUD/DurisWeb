<script setup lang="ts">
import { computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Anchor, Crosshair, AlertCircle, ExternalLink, PictureInPicture2 } from 'lucide-vue-next'
import type { MudShipContact } from '@/types/mud'

const emit = defineEmits<{
  detach: []
  openRadar: []
}>()

const store = useMudStore()
const { sendGameCommand } = useMudConnection()
const shipContacts = computed(() => store.shipContacts)

// convert bearing to compass direction
const bearingToCompass = (bearing: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const index = Math.round(bearing / 22.5) % 16
  return directions[index] || 'N'
}

// race color
const getRaceColor = (race: string): string => {
  switch (race) {
    case 'good': return 'text-green-400 border-green-400/50'
    case 'evil': return 'text-red-400 border-red-400/50'
    case 'undead': return 'text-purple-400 border-purple-400/50'
    default: return 'text-muted-foreground'
  }
}

// status color
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'sinking': return 'text-red-400 border-red-400/50'
    case 'flying': return 'text-cyan-400 border-cyan-400/50'
    case 'docked': return 'text-yellow-400 border-yellow-400/50'
    case 'anchored': return 'text-amber-400 border-amber-400/50'
    default: return 'text-muted-foreground'
  }
}

// execute ship action
const executeShipAction = (command: string, contact: MudShipContact) => {
  sendGameCommand(`${command} ${contact.id}`)
}
</script>

<template>
  <Card class="flex flex-col h-full">
    <CardHeader class="py-2 px-3 shrink-0 flex flex-row items-center justify-between">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Anchor class="h-4 w-4" />
        Ship
        <Badge v-if="shipContacts && shipContacts.contacts.length > 0" variant="outline" class="h-5 px-1.5 text-xs">
          {{ shipContacts.contacts.length }}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Open radar window"
          @click="emit('openRadar')"
        >
          <ExternalLink class="h-3 w-3" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="h-5 w-5 text-muted-foreground hover:text-foreground"
        title="Dock"
        @click="emit('detach')"
      >
        <PictureInPicture2 class="h-3 w-3" />
      </Button>
    </CardHeader>
    <CardContent class="flex-1 px-3 pb-3 overflow-hidden">
      <ScrollArea class="h-full">
        <div v-if="!shipContacts || shipContacts.contacts.length === 0" class="text-sm text-muted-foreground text-center py-4">
          No contacts on radar
        </div>
        <div v-else class="space-y-1">
          <ContextMenu v-for="contact in shipContacts.contacts" :key="contact.id">
            <ContextMenuTrigger as-child>
              <div
                class="p-2 rounded-md cursor-context-menu transition-colors"
                :class="contact.targeting_you ? 'bg-red-950/40 hover:bg-red-950/60' : 'bg-muted/30 hover:bg-muted/50'"
              >
                <div class="flex items-center gap-2 mb-1">
                  <Badge variant="outline" class="font-mono text-xs px-1.5">
                    {{ contact.id }}
                  </Badge>
                  <span class="text-sm font-medium truncate flex-1">{{ contact.name }}</span>
                  <AlertCircle
                    v-if="contact.targeting_you"
                    class="h-4 w-4 text-red-500 shrink-0"
                    title="Targeting you!"
                  />
                  <Crosshair
                    v-if="contact.you_targeting"
                    class="h-4 w-4 text-yellow-500 shrink-0"
                    title="You are targeting"
                  />
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-mono text-muted-foreground">
                    {{ contact.range.toFixed(1) }}nm @ {{ contact.bearing }}° {{ bearingToCompass(contact.bearing) }}
                  </span>
                  <span class="text-muted-foreground">|</span>
                  <span class="font-mono text-muted-foreground">
                    HDG {{ contact.heading }}° SPD {{ contact.speed }}
                  </span>
                </div>
                <div class="flex items-center gap-1 mt-1">
                  <Badge variant="outline" class="text-xs capitalize" :class="getRaceColor(contact.race)">
                    {{ contact.race }}
                  </Badge>
                  <Badge v-if="contact.status" variant="outline" class="text-xs capitalize" :class="getStatusColor(contact.status)">
                    {{ contact.status }}
                  </Badge>
                  <Badge v-if="contact.arc" variant="outline" class="text-xs font-mono">
                    {{ contact.arc }}
                  </Badge>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem @click="executeShipAction('target', contact)">Target</ContextMenuItem>
              <ContextMenuItem @click="executeShipAction('hail', contact)">Hail</ContextMenuItem>
              <ContextMenuItem @click="executeShipAction('board', contact)">Board</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</template>
