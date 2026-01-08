<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white">Level Cap Management</h1>
        <p class="text-gray-400 mt-1">Manually override the automatic level cap system</p>
      </div>
      <button
        @click="loadLevelCap"
        :disabled="isLoading"
        class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
        title="Refresh data"
      >
        <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']" />
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && !levelCap" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <!-- Main Content -->
    <div v-else-if="levelCap" class="space-y-6">
      <!-- Current Status Card -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <TrendingUp class="w-5 h-5 text-blue-400" />
            Current Level Cap Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Level Cap -->
            <div class="rounded-lg border p-4">
              <p class="text-sm text-muted-foreground">Current Level Cap</p>
              <p class="text-5xl font-bold mt-2">{{ levelCap.level }}</p>
              <p class="text-xs text-muted-foreground mt-2">Players can level up to this cap</p>
            </div>

            <!-- Racewar Leader -->
            <div class="rounded-lg border p-4">
              <p class="text-sm text-muted-foreground">Racewar Leader</p>
              <p class="text-3xl font-bold mt-2" :class="racewarColor">
                {{ racewarLeader }}
              </p>
              <p class="text-sm text-muted-foreground mt-2">{{ levelCap.mostFrags.toFixed(2) }} frags</p>
            </div>

            <!-- Next Auto-Update -->
            <div class="rounded-lg border p-4">
              <p class="text-sm text-muted-foreground">Next Auto-Update</p>
              <p class="text-sm mt-2">{{ formatNextUpdate(levelCap.nextUpdate) }}</p>
              <p class="text-xs text-muted-foreground mt-2">MUD automatically adjusts cap</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Manual Override Section -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Settings class="w-5 h-5 text-purple-400" />
            Manual Override
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- New Level Input -->
            <div>
              <label class="block text-sm text-muted-foreground mb-2">
                New Level Cap (25-60)
              </label>
              <input
                v-model.number="newLevel"
                type="number"
                min="25"
                max="60"
                class="w-full bg-background border rounded px-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Enter new level cap"
              />
              <p class="text-xs text-muted-foreground mt-1">
                Must be between 25 and 60
              </p>
            </div>

            <!-- Racewar Leader Selection -->
            <div>
              <label class="block text-sm text-muted-foreground mb-2">
                Racewar Leader (Optional)
              </label>
              <div class="flex gap-3">
                <label class="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    v-model="newRacewar"
                    :value="0"
                    class="sr-only peer"
                  />
                  <div class="bg-background border-2 rounded px-4 py-2 text-center peer-checked:border-primary peer-checked:bg-muted hover:border-muted-foreground transition-colors">
                    <p class="text-sm font-medium">Neutral</p>
                  </div>
                </label>
                <label class="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    v-model="newRacewar"
                    :value="1"
                    class="sr-only peer"
                  />
                  <div class="bg-background border-2 rounded px-4 py-2 text-center text-blue-400 peer-checked:border-blue-500 peer-checked:bg-blue-500/10 hover:border-blue-400 transition-colors">
                    <p class="text-sm font-medium">Good</p>
                  </div>
                </label>
                <label class="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    v-model="newRacewar"
                    :value="2"
                    class="sr-only peer"
                  />
                  <div class="bg-background border-2 rounded px-4 py-2 text-center text-red-400 peer-checked:border-red-500 peer-checked:bg-red-500/10 hover:border-red-400 transition-colors">
                    <p class="text-sm font-medium">Evil</p>
                  </div>
                </label>
              </div>
              <p class="text-xs text-muted-foreground mt-1">
                Leave unchanged if not modifying racewar
              </p>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3 mt-6">
            <button
              @click="openUpdateDialog"
              :disabled="!canUpdate"
              class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update Level Cap
            </button>
            <button
              @click="openResetDialog"
              class="px-6 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        </CardContent>
      </Card>

      <!-- Info Box -->
      <div class="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
        <div class="flex items-start gap-3">
          <Info class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-blue-300 font-medium">How Level Cap Works</p>
            <ul class="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>The MUD automatically increases the level cap based on frag counts</li>
              <li>Manual changes override the automatic system temporarily</li>
              <li>The auto-update system continues running after manual changes</li>
              <li>Resetting clears all racewar progress and returns cap to level 25</li>
              <li>All changes are logged to the audit trail for accountability</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <LevelCapConfirmDialog
      :open="showConfirmDialog"
      :current-level="levelCap?.level || 25"
      :current-racewar="levelCap?.racewarLeader || 0"
      :new-level="pendingLevel"
      :new-racewar="pendingRacewar"
      :saving="isSaving"
      :is-reset="isResetOperation"
      @update:open="showConfirmDialog = $event"
      @confirm="handleConfirmUpdate"
      @cancel="handleCancelUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { TrendingUp, Settings, Info, RefreshCw } from 'lucide-vue-next';
import { apiClient as api } from '@/services/api';
import { toast } from 'vue-sonner';
import LevelCapConfirmDialog from '@/components/admin/LevelCapConfirmDialog.vue';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface LevelCap {
  level: number;
  mostFrags: number;
  racewarLeader: number; // 0 = Neutral, 1 = Good, 2 = Evil
  nextUpdate: string;
}

const isLoading = ref(true);
const error = ref<string | null>(null);
const levelCap = ref<LevelCap | null>(null);

const newLevel = ref<number>(25);
const newRacewar = ref<number | undefined>(undefined);

const showConfirmDialog = ref(false);
const pendingLevel = ref(25);
const pendingRacewar = ref<number | undefined>(undefined);
const isResetOperation = ref(false);
const isSaving = ref(false);

let refreshInterval: number | null = null;

const racewarLeader = computed(() => {
  if (!levelCap.value) return 'Unknown';
  if (levelCap.value.racewarLeader === 1) return 'GOOD';
  if (levelCap.value.racewarLeader === 2) return 'EVIL';
  return 'NEUTRAL';
});

const racewarColor = computed(() => {
  if (!levelCap.value) return 'text-gray-400';
  if (levelCap.value.racewarLeader === 1) return 'text-blue-400';
  if (levelCap.value.racewarLeader === 2) return 'text-red-400';
  return 'text-gray-400';
});

const canUpdate = computed(() => {
  if (!levelCap.value) return false;
  if (newLevel.value < 25 || newLevel.value > 60) return false;
  // Must be different from current
  if (newLevel.value === levelCap.value.level &&
      (newRacewar.value === undefined || newRacewar.value === levelCap.value.racewarLeader)) {
    return false;
  }
  return true;
});

const formatNextUpdate = (timestamp: string): string => {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const loadLevelCap = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await api.get<{ levelCap: LevelCap }>('/api/admin/mud/dashboard');
    if (response.data.levelCap) {
      levelCap.value = response.data.levelCap;
      newLevel.value = response.data.levelCap.level;
      newRacewar.value = undefined; // Reset to not change racewar by default
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load level cap';
    console.error('Level cap load error:', err);
  } finally {
    isLoading.value = false;
  }
};

const openUpdateDialog = () => {
  pendingLevel.value = newLevel.value;
  pendingRacewar.value = newRacewar.value;
  isResetOperation.value = false;
  showConfirmDialog.value = true;
};

const openResetDialog = () => {
  pendingLevel.value = 25;
  pendingRacewar.value = 0;
  isResetOperation.value = true;
  showConfirmDialog.value = true;
};

const handleConfirmUpdate = async (notes: string) => {
  isSaving.value = true;

  try {
    if (isResetOperation.value) {
      // Reset operation
      const response = await api.post('/api/admin/mud/level-cap/reset', { notes });
      toast.success('Level cap reset successfully!', {
        description: response.data.message
      });
    } else {
      // Update operation
      const response = await api.put('/api/admin/mud/level-cap', {
        level: pendingLevel.value,
        racewarLeader: pendingRacewar.value,
        notes
      });
      toast.success('Level cap updated successfully!', {
        description: response.data.message
      });
    }

    // Reload data
    await loadLevelCap();
    showConfirmDialog.value = false;
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || 'Failed to update level cap';
    toast.error('Update failed', {
      description: errorMsg
    });
    console.error('Level cap update error:', err);
  } finally {
    isSaving.value = false;
  }
};

const handleCancelUpdate = () => {
  showConfirmDialog.value = false;
};

onMounted(() => {
  loadLevelCap();
  // Auto-refresh every 30 seconds
  refreshInterval = window.setInterval(loadLevelCap, 30000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>
