<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { formatWealth } from '@/utils/formatWealth'

const props = defineProps<{
  characterCount: number
  totalFrags: number
  totalDeaths: number
  totalWealth: number
  totalThreads: number
  totalPosts: number
  isOwnProfile?: boolean
}>()

const kdRatio = computed(() => {
  if (props.totalDeaths === 0) {
    return props.totalFrags > 0 ? props.totalFrags.toFixed(1) : '0.0'
  }
  return (props.totalFrags / props.totalDeaths).toFixed(1)
})

const wealthFormatted = computed(() => formatWealth(props.totalWealth))
</script>

<template>
  <div class="grid grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap gap-2 lg:gap-3">
    <Card class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-foreground">{{ characterCount }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Characters</div>
      </CardContent>
    </Card>

    <Card class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-green-400">{{ totalFrags.toLocaleString() }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Frags</div>
      </CardContent>
    </Card>

    <Card class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-red-400">{{ totalDeaths.toLocaleString() }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Deaths</div>
      </CardContent>
    </Card>

    <Card class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-blue-400">{{ kdRatio }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">K/D</div>
      </CardContent>
    </Card>

    <Card v-if="isOwnProfile" class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-yellow-400">{{ wealthFormatted }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Wealth</div>
      </CardContent>
    </Card>

    <Card class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-foreground">{{ totalThreads.toLocaleString() }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Threads</div>
      </CardContent>
    </Card>

    <Card class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-foreground">{{ totalPosts.toLocaleString() }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Posts</div>
      </CardContent>
    </Card>
  </div>
</template>
