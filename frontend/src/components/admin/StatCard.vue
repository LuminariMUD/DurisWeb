<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import type { Component } from 'vue'

interface Props {
  title: string
  value: string | number
  icon?: Component
  change?: number
  changeLabel?: string
  isLoading?: boolean
  live?: boolean
  subtitle?: string
  error?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  live: false,
  error: false
})

const trendIcon = computed(() => {
  if (!props.change) return Minus
  return props.change > 0 ? TrendingUp : TrendingDown
})

const trendColor = computed(() => {
  if (!props.change) return 'text-muted-foreground'
  return props.change > 0 ? 'text-green-500' : 'text-red-500'
})
</script>

<template>
  <Card>
    <CardHeader class="pb-2">
      <div class="flex items-center justify-between">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ title }}
        </CardTitle>
        <component
          v-if="icon"
          :is="icon"
          class="w-4 h-4 text-muted-foreground"
        />
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="isLoading" class="space-y-2">
        <Skeleton class="h-8 w-20" />
        <Skeleton v-if="changeLabel" class="h-4 w-32" />
      </div>
      <div v-else class="space-y-1">
        <div class="flex items-baseline gap-2">
          <div class="text-2xl font-bold" :class="{ 'text-red-500': error }">{{ value }}</div>
          <Badge v-if="live" variant="outline" class="text-xs">
            <span class="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
            Live
          </Badge>
        </div>
        <div v-if="subtitle" class="text-xs text-muted-foreground">
          {{ subtitle }}
        </div>
        <div v-if="change !== undefined && changeLabel" class="flex items-center gap-1 text-xs" :class="trendColor">
          <component :is="trendIcon" class="w-3 h-3" />
          <span>{{ Math.abs(change) }}% {{ changeLabel }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
