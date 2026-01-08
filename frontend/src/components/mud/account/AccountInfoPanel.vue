<script setup lang="ts">
import { computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { User, Calendar, Clock, Crown, Mail } from 'lucide-vue-next'
import { format } from 'date-fns'

const store = useMudStore()

const accountInfo = computed(() => store.accountInfo)

// Format playtime (seconds to human-readable)
const formatPlaytime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  const parts = []
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)

  return parts.join(', ')
}

// Format date
const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr)
    return format(date, 'MMMM d, yyyy')
  } catch {
    return dateStr
  }
}

// Get immortal level display (from config.h)
// 62: OVERLORD, 61: FORGER, 60: GREATER_G, 59: LESSER_G, 58: IMMORTAL, 57: AVATAR
const getImmortalLevel = (level: number): string => {
  if (level >= 62) return 'Overlord'
  if (level >= 61) return 'Forger'
  if (level >= 60) return 'Greater God'
  if (level >= 59) return 'Lesser God'
  if (level >= 58) return 'Immortal'
  if (level >= 57) return 'Avatar'
  return 'Mortal'
}
</script>

<template>
  <div v-if="accountInfo" class="space-y-6">
    <Card class="border-0 py-2 lg:py-6">
      <CardHeader class="py-2 lg:py-4">
        <CardTitle class="flex items-center gap-2 text-sm lg:text-base">
          <User class="h-4 w-4" />
          Account Details
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 lg:space-y-4">
        <div class="grid grid-cols-2 gap-3 lg:gap-4">
          <div>
            <p class="text-xs lg:text-sm text-muted-foreground">Account Name</p>
            <p class="text-sm lg:text-base font-medium">{{ accountInfo.name }}</p>
          </div>
          <div>
            <p class="text-xs lg:text-sm text-muted-foreground flex items-center gap-1">
              <Mail class="h-3 w-3" />
              Email
            </p>
            <p class="text-sm lg:text-base font-medium truncate">{{ accountInfo.email || 'Not set' }}</p>
          </div>
        </div>

        <Separator />

        <div class="grid grid-cols-2 gap-3 lg:gap-4">
          <div>
            <p class="text-xs lg:text-sm text-muted-foreground flex items-center gap-1">
              <Calendar class="h-3 w-3" />
              Created
            </p>
            <p class="text-sm lg:text-base font-medium">{{ formatDate(accountInfo.created) }}</p>
          </div>
          <div>
            <p class="text-xs lg:text-sm text-muted-foreground flex items-center gap-1">
              <Clock class="h-3 w-3" />
              Last Login
            </p>
            <p class="text-sm lg:text-base font-medium">{{ formatDate(accountInfo.lastLogin) }}</p>
          </div>
        </div>

        <Separator />

        <div class="grid grid-cols-2 gap-3 lg:gap-4">
          <div>
            <p class="text-xs lg:text-sm text-muted-foreground flex items-center gap-1">
              <Clock class="h-3 w-3" />
              Playtime
            </p>
            <p class="text-sm lg:text-base font-medium">{{ formatPlaytime(accountInfo.totalPlaytime) }}</p>
          </div>
          <div>
            <p class="text-xs lg:text-sm text-muted-foreground flex items-center gap-1">
              <Crown class="h-3 w-3" />
              Level
            </p>
            <div class="flex items-center gap-1 lg:gap-2 flex-wrap">
              <Badge :variant="accountInfo.immortalLevel > 55 ? 'default' : 'secondary'" class="text-xs">
                {{ getImmortalLevel(accountInfo.immortalLevel) }}
              </Badge>
              <span v-if="accountInfo.immortalLevel > 55" class="text-xs text-muted-foreground">
                ({{ accountInfo.immortalLevel }})
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card class="border-0 py-2 lg:py-6">
      <CardHeader class="py-2 lg:py-4">
        <CardTitle class="text-sm lg:text-base">Characters ({{ accountInfo.characters.length }})</CardTitle>
        <CardDescription class="text-xs lg:text-sm">Your characters on this account</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="accountInfo.characters.length === 0" class="text-center py-4 text-muted-foreground text-sm">
          No characters yet
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="char in accountInfo.characters"
            :key="char.name"
            class="flex items-center justify-between p-2 rounded-lg bg-muted/50"
          >
            <div class="flex items-center gap-2 lg:gap-3 min-w-0">
              <User class="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground shrink-0" />
              <span class="text-sm font-medium truncate">{{ char.name }}</span>
              <span class="text-xs text-muted-foreground hidden sm:inline">
                Lv{{ char.level }} {{ char.race }}
              </span>
            </div>
            <Badge variant="outline" class="text-xs shrink-0"><span v-html="parseAnsiToHtml(char.class || '')"></span></Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  <div v-else class="flex items-center justify-center h-[300px] text-muted-foreground">
    Loading account information...
  </div>
</template>
