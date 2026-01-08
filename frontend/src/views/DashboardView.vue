<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { BarChart3 } from 'lucide-vue-next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AdminDashboardOverview from '@/components/admin/AdminDashboardOverview.vue'
import AdminDashboardForum from '@/components/admin/AdminDashboardForum.vue'
import AdminDashboardPvP from '@/components/admin/AdminDashboardPvP.vue'
import AdminDashboardPlayers from '@/components/admin/AdminDashboardPlayers.vue'
import AdminDashboardServer from '@/components/admin/AdminDashboardServer.vue'

const router = useRouter()
const { isOverlord } = useAuth()

onMounted(async () => {
  if (!isOverlord.value) {
    router.push('/forum')
    return
  }
})
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <BarChart3 class="w-8 h-8 text-primary" />
        <div>
          <h1 class="text-3xl font-bold">Server Dashboard</h1>
          <p class="text-muted-foreground mt-1">
            Real-time analytics and server metrics (Overlord only)
          </p>
        </div>
      </div>
    </div>

    <!-- Dashboard Tabs -->
    <Tabs default-value="overview" class="w-full">
      <TabsList class="grid w-full grid-cols-5">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="forum">Forum</TabsTrigger>
        <TabsTrigger value="pvp">PvP</TabsTrigger>
        <TabsTrigger value="players">Players</TabsTrigger>
        <TabsTrigger value="server">Server</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" class="mt-6">
        <AdminDashboardOverview />
      </TabsContent>

      <TabsContent value="forum" class="mt-6">
        <AdminDashboardForum />
      </TabsContent>

      <TabsContent value="pvp" class="mt-6">
        <AdminDashboardPvP />
      </TabsContent>

      <TabsContent value="players" class="mt-6">
        <AdminDashboardPlayers />
      </TabsContent>

      <TabsContent value="server" class="mt-6">
        <AdminDashboardServer />
      </TabsContent>
    </Tabs>
  </div>
</template>
