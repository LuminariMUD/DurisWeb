<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Map, Layers, Package, Skull } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

// Determine active tab from route
const activeTab = computed(() => {
  if (route.path.includes('/wiki/zones')) return 'zones'
  if (route.path.includes('/wiki/objects')) return 'objects'
  if (route.path.includes('/wiki/mobs')) return 'mobs'
  return 'map'
})

// Handle tab change
function handleTabChange(value: string | number) {
  switch (value) {
    case 'map':
      router.push('/wiki/map')
      break
    case 'zones':
      router.push('/wiki/zones')
      break
    case 'objects':
      router.push('/wiki/objects')
      break
    case 'mobs':
      router.push('/wiki/mobs')
      break
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tab Navigation -->
    <div class="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-2 sm:px-4">
        <Tabs :model-value="activeTab" @update:model-value="handleTabChange" class="w-full">
          <TabsList class="h-10 sm:h-12 w-full justify-start bg-transparent border-b-0 gap-0.5 sm:gap-2">
            <TabsTrigger
              value="map"
              class="data-[state=active]:bg-muted data-[state=active]:shadow-none px-2 sm:px-4 py-1.5 sm:py-2 gap-1.5 text-xs sm:text-sm"
            >
              <Map class="h-4 w-4 shrink-0" />
              Map
            </TabsTrigger>
            <TabsTrigger
              value="zones"
              class="data-[state=active]:bg-muted data-[state=active]:shadow-none px-2 sm:px-4 py-1.5 sm:py-2 gap-1.5 text-xs sm:text-sm"
            >
              <Layers class="h-4 w-4 shrink-0" />
              Zones
            </TabsTrigger>
            <TabsTrigger
              value="objects"
              class="data-[state=active]:bg-muted data-[state=active]:shadow-none px-2 sm:px-4 py-1.5 sm:py-2 gap-1.5 text-xs sm:text-sm"
            >
              <Package class="h-4 w-4 shrink-0" />
              Objects
            </TabsTrigger>
            <TabsTrigger
              value="mobs"
              class="data-[state=active]:bg-muted data-[state=active]:shadow-none px-2 sm:px-4 py-1.5 sm:py-2 gap-1.5 text-xs sm:text-sm"
            >
              <Skull class="h-4 w-4 shrink-0" />
              Mobs
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>

    <!-- Router View for Child Routes -->
    <div class="flex-1 overflow-hidden">
      <router-view />
    </div>
  </div>
</template>
