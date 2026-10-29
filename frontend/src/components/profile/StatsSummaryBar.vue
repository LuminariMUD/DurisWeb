<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { formatWealth } from '@/utils/formatWealth'

const props = defineProps<{
  characterCount: number | null
  totalFrags: number | null
  totalDeaths: number | null
  totalWealth: number
  totalThreads: number
  totalPosts: number
  isOwnProfile?: boolean
}>()

const kdRatio = computed(() => {
  const frags = props.totalFrags ?? 0
  const deaths = props.totalDeaths ?? 0
  if (deaths === 0) {
    return frags > 0 ? frags.toFixed(1) : '0.0'
  }
  return (frags / deaths).toFixed(1)
})

const wealthFormatted = computed(() => formatWealth(props.totalWealth))
</script>

<template>
  <div class="grid gap-2 lg:gap-3" :class="isOwnProfile ? 'grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap' : 'grid-cols-2'">
    <Card v-if="isOwnProfile" class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-foreground">{{ characterCount }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Characters</div>
      </CardContent>
    </Card>

    <Card v-if="isOwnProfile" class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-success">{{ (totalFrags ?? 0).toLocaleString() }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Frags</div>
      </CardContent>
    </Card>

    <Card v-if="isOwnProfile" class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-danger">{{ (totalDeaths ?? 0).toLocaleString() }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">Deaths</div>
      </CardContent>
    </Card>

    <Card v-if="isOwnProfile" class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-info">{{ kdRatio }}</div>
        <div class="text-[10px] lg:text-xs text-muted-foreground">K/D</div>
      </CardContent>
    </Card>

    <Card v-if="isOwnProfile" class="bg-card/50 lg:flex-1 lg:min-w-[120px]">
      <CardContent class="p-2 lg:p-4 text-center">
        <div class="text-lg lg:text-2xl font-bold text-warning">{{ wealthFormatted }}</div>
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
