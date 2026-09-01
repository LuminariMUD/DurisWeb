<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Activity, ArrowRight } from 'lucide-vue-next'
import { useHookControl } from '@/composables/useHookControl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const { summary, loading, loadError } = useHookControl({ syncQuery: false })
</script>

<template>
  <Card class="rounded-sm">
    <CardHeader class="pb-3">
      <CardTitle class="flex items-center justify-between text-base">
        <span class="flex items-center gap-2"><Activity class="size-4" /> Hook health</span>
        <RouterLink to="/admin/mud/hooks" class="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Open console <ArrowRight class="size-3" />
        </RouterLink>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="grid grid-cols-4 gap-2"><Skeleton v-for="n in 4" :key="n" class="h-12" /></div>
      <p v-else-if="loadError" class="text-sm text-destructive">Hook status unavailable</p>
      <dl v-else class="grid grid-cols-4 gap-2 text-center">
        <div class="border-r border-border"><dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Active</dt><dd class="mt-1 text-xl font-semibold">{{ summary.active }}</dd></div>
        <div class="border-r border-border"><dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Off</dt><dd class="mt-1 text-xl font-semibold">{{ summary.off }}</dd></div>
        <div class="border-r border-border"><dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Mismatch</dt><dd class="mt-1 text-xl font-semibold text-warning">{{ summary.mismatch }}</dd></div>
        <div><dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Unknown</dt><dd class="mt-1 text-xl font-semibold">{{ summary.unknown }}</dd></div>
      </dl>
    </CardContent>
  </Card>
</template>
