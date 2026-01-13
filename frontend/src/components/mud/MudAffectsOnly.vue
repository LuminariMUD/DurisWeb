<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Shield,
  Flame,
  Snowflake,
  Zap,
  Eye,
  Wind,
  Heart,
  Sword,
  Sparkles,
  Moon,
  Sun,
  PictureInPicture2,
} from 'lucide-vue-next'
import type { Component } from 'vue'

const emit = defineEmits<{
  detach: []
}>()

const store = useMudStore()
const affects = computed(() => store.affects)

// current time for countdown
const now = ref(Date.now())
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

const affectsWithTime = computed(() => {
  return affects.value.map(affect => {
    let remaining = affect.duration
    if (affect.receivedAt) {
      const elapsed = Math.floor((now.value - affect.receivedAt) / 1000)
      remaining = Math.max(0, affect.duration - elapsed)
    }
    return {
      ...affect,
      remaining,
      percent: affect.duration > 0 ? Math.min(100, Math.max(0, (remaining / affect.duration) * 100)) : 0,
    }
  })
})

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const affectIcons: Record<string, Component> = {
  fire: Flame,
  cold: Snowflake,
  lightning: Zap,
  see: Eye,
  fly: Wind,
  heal: Heart,
  damage: Sword,
  magic: Sparkles,
  sleep: Moon,
  light: Sun,
  default: Shield,
}

const getAffectIcon = (name: string): Component => {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(affectIcons)) {
    if (lower.includes(key)) return icon
  }
  return affectIcons.default!
}

const getProgressColor = (percent: number): string => {
  if (percent > 50) return 'bg-green-500'
  if (percent > 25) return 'bg-yellow-500'
  return 'bg-red-500'
}
</script>

<template>
  <Card class="flex flex-col h-full">
    <CardHeader class="py-2 px-3 shrink-0 flex flex-row items-center justify-between">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Shield class="h-4 w-4" />
        Affects
        <Badge v-if="affects.length > 0" variant="outline" class="h-5 px-1.5 text-xs">
          {{ affects.length }}
        </Badge>
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
        <div v-if="affects.length === 0" class="text-sm text-muted-foreground text-center py-4">
          No active effects
        </div>
        <div v-else class="space-y-3">
          <div v-for="affect in affectsWithTime" :key="affect.name" class="space-y-1">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <component :is="getAffectIcon(affect.name)" class="h-4 w-4 shrink-0 text-muted-foreground" />
                <span class="text-sm truncate">{{ affect.name }}</span>
              </div>
              <span class="text-xs text-muted-foreground shrink-0">{{ formatDuration(affect.remaining) }}</span>
            </div>
            <Progress
              :model-value="affect.percent"
              class="h-1.5"
              :class="getProgressColor(affect.percent)"
            />
          </div>
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
</template>
