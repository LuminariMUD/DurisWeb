<script setup lang="ts">
import { computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Battery, BatteryFull, BatteryMedium, BatteryLow, RefreshCw, User } from 'lucide-vue-next'

const store = useMudStore()
const { getRestedBonus } = useMudConnection()

const restedBonus = computed(() => store.restedBonus)

const handleRefresh = () => {
  getRestedBonus()
}

const getBatteryIcon = (percent: number) => {
  if (percent >= 75) return BatteryFull
  if (percent >= 25) return BatteryMedium
  return BatteryLow
}

const getBatteryColor = (percent: number): string => {
  if (percent >= 75) return 'text-green-500'
  if (percent >= 50) return 'text-yellow-500'
  if (percent >= 25) return 'text-orange-500'
  return 'text-red-500'
}

const _getProgressColor = (percent: number): string => {
  if (percent >= 75) return 'bg-green-500'
  if (percent >= 50) return 'bg-yellow-500'
  if (percent >= 25) return 'bg-orange-500'
  return 'bg-red-500'
}
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div>
          <CardTitle class="flex items-center gap-2">
            <Battery class="h-5 w-5" />
            Rested Bonus Status
          </CardTitle>
          <CardDescription>
            Experience bonus from resting offline
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" @click="handleRefresh">
          <RefreshCw class="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="restedBonus && restedBonus.characters.length > 0" class="space-y-4">
        <div
          v-for="char in restedBonus.characters"
          :key="char.name"
          class="p-4 rounded-lg border bg-muted/30"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User class="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 class="font-semibold">{{ char.name }}</h3>
                <p class="text-sm text-muted-foreground">
                  {{ char.restedHours }} / {{ char.maxHours }} hours
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <component
                :is="getBatteryIcon(char.restedPercent)"
                :class="['h-6 w-6', getBatteryColor(char.restedPercent)]"
              />
              <Badge
                :variant="char.restedPercent >= 100 ? 'default' : 'secondary'"
                :class="char.restedPercent >= 100 ? 'bg-green-500' : ''"
              >
                {{ char.restedPercent }}%
              </Badge>
            </div>
          </div>

          <div class="space-y-1">
            <Progress
              :model-value="char.restedPercent"
              class="h-2"
            />
            <p class="text-xs text-muted-foreground">
              <template v-if="char.restedPercent >= 100">
                Fully rested! Maximum experience bonus available.
              </template>
              <template v-else-if="char.restedPercent >= 50">
                Good rest bonus. Keep resting for maximum benefit.
              </template>
              <template v-else>
                Limited rest bonus. Consider waiting longer before playing.
              </template>
            </p>
          </div>
        </div>
      </div>

      <div v-else-if="restedBonus && restedBonus.characters.length === 0" class="text-center py-8 text-muted-foreground">
        <Battery class="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No characters found</p>
      </div>

      <div v-else class="flex items-center justify-center h-[200px] text-muted-foreground">
        Loading rested bonus information...
      </div>

      <div class="mt-4 p-4 rounded-lg bg-muted/50">
        <h4 class="font-medium mb-2">How Rested Bonus Works</h4>
        <ul class="text-sm text-muted-foreground space-y-1">
          <li>• Characters accumulate rested bonus while offline</li>
          <li>• Maximum rest is achieved after {{ restedBonus?.characters[0]?.maxHours || 16 }} hours offline</li>
          <li>• Rested bonus provides extra experience from kills</li>
          <li>• The bonus depletes as you gain experience in-game</li>
        </ul>
      </div>
    </CardContent>
  </Card>
</template>
