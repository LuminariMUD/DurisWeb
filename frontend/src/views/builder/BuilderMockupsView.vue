<script setup lang="ts">
import { ref } from 'vue'
import { useHead } from '@unhead/vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Design1SplitPanel from '@/components/builder/Design1SplitPanel.vue'
import Design2CardDashboard from '@/components/builder/Design2CardDashboard.vue'
import Design3MapFirst from '@/components/builder/Design3MapFirst.vue'
import Design4TabbedWorkspace from '@/components/builder/Design4TabbedWorkspace.vue'
import Design5NotionStyle from '@/components/builder/Design5NotionStyle.vue'

useHead({
  title: 'DurisMUD | Zone Builder Mockups',
})

const activeDesign = ref('design1')
</script>

<template>
  <div class="min-h-screen bg-zinc-950">
    <div class="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
      <h1 class="text-2xl font-bold text-zinc-100">Zone Builder - UI Design Mockups</h1>
      <p class="text-sm text-zinc-400 mt-1">Select a design to preview. These are interactive mockups with sample data.</p>
    </div>

    <Tabs v-model="activeDesign" class="w-full">
      <div class="border-b border-zinc-800 bg-zinc-900/30 px-6">
        <TabsList class="bg-transparent h-12 gap-1">
          <TabsTrigger
            value="design1"
            class="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 px-4"
          >
            1. Split Panel (IDE)
          </TabsTrigger>
          <TabsTrigger
            value="design2"
            class="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 px-4"
          >
            2. Card Dashboard
          </TabsTrigger>
          <TabsTrigger
            value="design3"
            class="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 px-4"
          >
            3. Map First
          </TabsTrigger>
          <TabsTrigger
            value="design4"
            class="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 px-4"
          >
            4. Tabbed Workspace
          </TabsTrigger>
          <TabsTrigger
            value="design5"
            class="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 px-4"
          >
            5. Notion Style
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="design1" class="mt-0">
        <Design1SplitPanel />
      </TabsContent>

      <TabsContent value="design2" class="mt-0">
        <Design2CardDashboard />
      </TabsContent>

      <TabsContent value="design3" class="mt-0">
        <Design3MapFirst />
      </TabsContent>

      <TabsContent value="design4" class="mt-0">
        <Design4TabbedWorkspace />
      </TabsContent>

      <TabsContent value="design5" class="mt-0">
        <Design5NotionStyle />
      </TabsContent>
    </Tabs>
  </div>
</template>
