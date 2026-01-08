<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FileText, Users, MessageSquare, Code2, AlertCircle, History } from 'lucide-vue-next'
import ZoneDescription from './ZoneDescription.vue'
import ZonePermissions from './ZonePermissions.vue'
import ProcRequestList from './ProcRequestList.vue'
import ZoneComments from './ZoneComments.vue'
import ZoneInfoHistory from './ZoneInfoHistory.vue'

const props = defineProps<{
  zoneId: string
  zoneName: string
}>()

const { user } = useAuth()

// Active tab within Info section
const activeTab = ref<'description' | 'permissions' | 'proc-requests' | 'comments' | 'history'>('description')

// Fetch zone access level for current user
const { data: accessData, isLoading: accessLoading, error: accessError } = useQuery({
  queryKey: ['zone-access', props.zoneId],
  queryFn: () => builderApi.checkZoneAccess(props.zoneId),
  enabled: computed(() => !!user.value),
})

// Check admin permission for zone management
const canManageZones = computed(() => {
  return user.value?.permissions?.adminPermissions?.includes('manage_zone_permissions') ||
         user.value?.permissions?.role === 'overlord'
})

// Computed access flags
const canEdit = computed(() => accessData.value?.canEdit ?? false)
const canManage = computed(() => accessData.value?.canManage ?? canManageZones.value)
const isOwner = computed(() => accessData.value?.isOwner ?? false)
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Loading -->
    <div v-if="accessLoading" class="p-6">
      <Skeleton class="h-8 w-48 mb-4" />
      <Skeleton class="h-64 w-full" />
    </div>

    <!-- Error -->
    <Alert v-else-if="accessError" variant="destructive" class="m-4">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load zone access information.
      </AlertDescription>
    </Alert>

    <!-- Content -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- Sub-tabs within Info -->
      <div class="border-b px-4 pt-2">
        <Tabs v-model="activeTab" class="w-full">
          <TabsList class="h-9">
            <TabsTrigger value="description" class="text-xs">
              <FileText class="h-3 w-3 mr-1.5" />
              Description
            </TabsTrigger>
            <TabsTrigger v-if="canManage || isOwner" value="permissions" class="text-xs">
              <Users class="h-3 w-3 mr-1.5" />
              Permissions
            </TabsTrigger>
            <TabsTrigger value="proc-requests" class="text-xs">
              <Code2 class="h-3 w-3 mr-1.5" />
              Proc Requests
            </TabsTrigger>
            <TabsTrigger value="comments" class="text-xs">
              <MessageSquare class="h-3 w-3 mr-1.5" />
              Discussion
            </TabsTrigger>
            <TabsTrigger v-if="canManage || isOwner" value="history" class="text-xs">
              <History class="h-3 w-3 mr-1.5" />
              History
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Description Tab -->
        <ZoneDescription
          v-if="activeTab === 'description'"
          :zone-id="props.zoneId"
          :zone-name="props.zoneName"
          :can-edit="canEdit || canManage || isOwner"
        />

        <!-- Permissions Tab -->
        <ZonePermissions
          v-else-if="activeTab === 'permissions' && (canManage || isOwner)"
          :zone-id="props.zoneId"
          :zone-name="props.zoneName"
          :is-owner="isOwner"
          :can-manage-zones="canManageZones"
        />

        <!-- Proc Requests Tab -->
        <ProcRequestList
          v-else-if="activeTab === 'proc-requests'"
          :zone-id="props.zoneId"
          :can-edit="canEdit || canManage || isOwner"
        />

        <!-- Comments Tab -->
        <ZoneComments
          v-else-if="activeTab === 'comments'"
          :zone-id="props.zoneId"
        />

        <!-- History Tab -->
        <ZoneInfoHistory
          v-else-if="activeTab === 'history' && (canManage || isOwner)"
          :zone-id="props.zoneId"
        />
      </div>
    </div>
  </div>
</template>
