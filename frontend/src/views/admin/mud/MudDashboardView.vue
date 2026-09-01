<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white">MUD Settings Dashboard</h1>
        <p class="text-gray-400 mt-1">Game configuration overview (Read-Only)</p>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <!-- Dashboard Content -->
    <div v-else-if="dashboard" class="space-y-6">
      <!-- Level Cap Card -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <TrendingUp class="w-5 h-5 text-blue-400" />
            Current Level Cap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="dashboard.levelCap" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="rounded-lg border p-4">
              <p class="text-sm text-muted-foreground">Level Cap</p>
              <p class="text-3xl font-bold mt-1">{{ dashboard.levelCap.level }}</p>
            </div>

            <div class="rounded-lg border p-4">
              <p class="text-sm text-muted-foreground">Leading Side</p>
              <p class="text-2xl font-bold mt-1" :class="racewarColor">
                {{ racewarLeader }}
              </p>
              <p class="text-xs text-muted-foreground mt-1">{{ dashboard.levelCap.mostFrags }} frags</p>
            </div>

            <div class="rounded-lg border p-4">
              <p class="text-sm text-muted-foreground">Next Update</p>
              <p class="text-sm mt-1">{{ formatNextUpdate(dashboard.levelCap.nextUpdate) }}</p>
            </div>
          </div>
          <div v-else class="text-muted-foreground">
            No level cap data available
          </div>
        </CardContent>
      </Card>

      <HookHealthCard />

      <!-- Key Settings Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Max XP Level -->
        <Card>
          <CardContent class="pt-6">
            <div class="flex items-center gap-2 mb-2">
              <Zap class="w-4 h-4 text-yellow-400" />
              <p class="text-sm text-muted-foreground">Max XP Level</p>
            </div>
            <p class="text-2xl font-bold">{{ dashboard.keySettings.maxExpLevel ?? 'N/A' }}</p>
            <p class="text-xs text-muted-foreground mt-1">Highest level without epics</p>
          </CardContent>
        </Card>

        <!-- Global XP Rate -->
        <Card>
          <CardContent class="pt-6">
            <div class="flex items-center gap-2 mb-2">
              <Activity class="w-4 h-4 text-green-400" />
              <p class="text-sm text-muted-foreground">Global XP Rate</p>
            </div>
            <p class="text-2xl font-bold">{{ formatMultiplier(dashboard.keySettings.globalXpRate) }}</p>
            <p class="text-xs text-muted-foreground mt-1">Base experience multiplier</p>
          </CardContent>
        </Card>

        <!-- Good vs Evil XP -->
        <Card>
          <CardContent class="pt-6">
            <div class="flex items-center gap-2 mb-2">
              <Users class="w-4 h-4 text-purple-400" />
              <p class="text-sm text-muted-foreground">Racewar XP Rates</p>
            </div>
            <div class="flex gap-4 mt-1">
              <div>
                <p class="text-sm text-blue-400">Good:</p>
                <p class="text-lg font-bold">{{ formatMultiplier(dashboard.keySettings.goodXpRate) }}</p>
              </div>
              <div>
                <p class="text-sm text-red-400">Evil:</p>
                <p class="text-lg font-bold">{{ formatMultiplier(dashboard.keySettings.evilXpRate) }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Max Epic Level -->
        <Card>
          <CardContent class="pt-6">
            <div class="flex items-center gap-2 mb-2">
              <Sparkles class="w-4 h-4 text-amber-400" />
              <p class="text-sm text-muted-foreground">Max Epic Level</p>
            </div>
            <p class="text-2xl font-bold">{{ dashboard.keySettings.maxEpicLevel ?? 'N/A' }}</p>
            <p class="text-xs text-muted-foreground mt-1">Highest level with any epic stone</p>
          </CardContent>
        </Card>

        <!-- Epic Errand Step -->
        <Card>
          <CardContent class="pt-6">
            <div class="flex items-center gap-2 mb-2">
              <Target class="w-4 h-4 text-orange-400" />
              <p class="text-sm text-muted-foreground">Epic Errand Step</p>
            </div>
            <p class="text-2xl font-bold">{{ dashboard.keySettings.epicErrandStep ?? 'N/A' }}</p>
            <p class="text-xs text-muted-foreground mt-1">Points per errand milestone</p>
          </CardContent>
        </Card>

        <!-- Last Player Wipe -->
        <Card>
          <CardContent class="pt-6">
            <div class="flex items-center gap-2 mb-2">
              <AlertTriangle class="w-4 h-4 text-red-400" />
              <p class="text-sm text-muted-foreground">Last Player Wipe</p>
            </div>
            <p class="text-sm mt-1">{{ formatWipeDate(dashboard.lastWipeDate) }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- Global Timers -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Clock class="w-5 h-5 text-indigo-400" />
            Global Timers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <!-- Current MUD Time -->
          <div v-if="mudTime" class="mb-6 p-4 rounded-lg border border-indigo-500/20 bg-indigo-500/10">
            <p class="text-sm text-indigo-300 font-medium mb-3">Current MUD Time</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Main Time Display -->
              <div class="md:col-span-2">
                <p class="text-3xl font-bold font-mono" v-html="mudTime.formatted"></p>
              </div>

              <!-- Right Side Info -->
              <div class="grid grid-cols-2 md:grid-cols-1 gap-3 text-right">
                <div>
                  <p class="text-xs text-muted-foreground">Day Name</p>
                  <p class="text-sm font-medium" v-html="mudTime.time.dayName"></p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Month Name</p>
                  <p class="text-sm font-medium" v-html="mudTime.time.monthName"></p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Season</p>
                  <p class="text-sm font-semibold" :class="getSeasonColor(mudTime.time.season)">{{ mudTime.time.season }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Time of Day</p>
                  <p class="text-sm font-medium" :class="getTimeOfDayColor(mudTime.time.timeOfDay)">{{ mudTime.time.timeOfDay }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Existing Timers -->
          <div v-if="dashboard.timers.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="timer in dashboard.timers" :key="timer.name" class="rounded-lg border p-4">
              <p class="text-sm text-muted-foreground">{{ formatTimerName(timer.name) }}</p>
              <p class="text-lg font-mono mt-1">{{ formatTimestamp(timer.date) }}</p>
            </div>
          </div>
          <div v-else class="text-muted-foreground">
            No timers found
          </div>
        </CardContent>
      </Card>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { TrendingUp, Zap, Activity, Users, Sparkles, Target, AlertTriangle, Clock } from 'lucide-vue-next';
import { apiClient as api } from '@/services/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import HookHealthCard from '@/components/admin/hooks/HookHealthCard.vue';

interface LevelCap {
  level: number;
  mostFrags: number;
  racewarLeader: number; // 1 = Good, 2 = Evil
  nextUpdate: string;
}

interface Timer {
  name: string;
  date: string;
}

interface KeySettings {
  maxExpLevel: number | null;
  globalXpRate: number | null;
  goodXpRate: number | null;
  evilXpRate: number | null;
  maxEpicLevel: number | null;
  epicErrandStep: number | null;
}

interface Dashboard {
  levelCap: LevelCap | null;
  timers: Timer[];
  lastWipeDate: string | null;
  keySettings: KeySettings;
}

interface MudTimeData {
  second: number;
  minute: number;
  hour: number;
  day: number;
  month: number;
  year: number;
  dayName: string;
  monthName: string;
  timeOfDay: string;
  season: string;
}

interface MudTimeResponse {
  time: MudTimeData;
  formatted: string;
  description: string;
}

const isLoading = ref(true);
const error = ref<string | null>(null);
const dashboard = ref<Dashboard | null>(null);
const mudTime = ref<MudTimeResponse | null>(null);

let mudTimeInterval: number | null = null;

const racewarLeader = computed(() => {
  if (!dashboard.value?.levelCap) return 'Unknown';
  return dashboard.value.levelCap.racewarLeader === 1 ? 'GOOD' : 'EVIL';
});

const racewarColor = computed(() => {
  if (!dashboard.value?.levelCap) return 'text-gray-400';
  return dashboard.value.levelCap.racewarLeader === 1 ? 'text-blue-400' : 'text-red-400';
});

const formatMultiplier = (value: number | null): string => {
  if (value === null) return 'N/A';
  return `${value}x`;
};

const formatNextUpdate = (timestamp: string): string => {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatWipeDate = (timestamp: string | null): string => {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
};

const formatTimerName = (name: string): string => {
  // Convert snake_case to Title Case
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getSeasonColor = (season: string): string => {
  switch (season) {
    case 'Spring': return 'text-green-400';
    case 'Summer': return 'text-yellow-400';
    case 'Fall': return 'text-orange-400';
    case 'Winter': return 'text-blue-300';
    default: return 'text-gray-400';
  }
};

const getTimeOfDayColor = (timeOfDay: string): string => {
  switch (timeOfDay) {
    case 'Dawn': return 'text-orange-300';
    case 'Morning': return 'text-yellow-300';
    case 'Afternoon': return 'text-amber-300';
    case 'Dusk': return 'text-purple-300';
    case 'Night': return 'text-indigo-300';
    case 'Midnight': return 'text-blue-300';
    default: return 'text-gray-400';
  }
};

const loadMudTime = async () => {
  try {
    const response = await api.get<MudTimeResponse>('/api/admin/mud/time');
    mudTime.value = response.data;
  } catch (err: any) {
    console.error('MUD time load error:', err);
  }
};

const loadDashboard = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await api.get<Dashboard>('/api/admin/mud/dashboard');
    dashboard.value = response.data;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load dashboard';
    console.error('Dashboard load error:', err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadDashboard();
  loadMudTime();

  // Update MUD time every second for live display (hour changes every 75 seconds)
  mudTimeInterval = window.setInterval(loadMudTime, 1000);
});

onUnmounted(() => {
  if (mudTimeInterval) {
    clearInterval(mudTimeInterval);
  }
});
</script>
