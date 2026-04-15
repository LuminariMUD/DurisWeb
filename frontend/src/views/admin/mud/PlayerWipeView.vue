<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white flex items-center gap-2">
          <AlertTriangle class="w-8 h-8 text-red-500" />
          Player Wipe Control
        </h1>
        <p class="text-gray-400 mt-1">DANGER ZONE - Irreversible player data deletion</p>
      </div>
      <button
        @click="loadData"
        :disabled="isLoading"
        class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
        title="Refresh data"
      >
        <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']" />
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && !wipeStatus" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <!-- Main Content -->
    <div v-else-if="wipeStatus" class="space-y-6">
      <!-- Cooldown Warning (if active) -->
      <div
        v-if="wipeStatus.isOnCooldown"
        class="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-6"
      >
        <div class="flex items-start gap-4">
          <Clock class="w-8 h-8 text-yellow-400 flex-shrink-0" />
          <div>
            <h2 class="text-xl font-semibold text-yellow-300 mb-2">Wipe On Cooldown</h2>
            <p class="mb-3">
              A wipe was recently performed. You must wait {{ cooldownDaysRemaining }} days before executing another wipe.
            </p>
            <div class="rounded-lg border p-4 space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">Cooldown Ends:</span>
                <span class="font-mono">{{ formatDate(wipeStatus.cooldownEndsAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Last Wipe Info -->
      <Card v-if="wipeStatus.lastWipe">
        <CardContent class="pt-6">
          <div class="flex items-start gap-4">
            <History class="w-6 h-6 text-blue-400 flex-shrink-0" />
            <div class="flex-1">
              <h2 class="text-lg font-semibold mb-3">Last Wipe Information</h2>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs text-muted-foreground">Executed By</p>
                  <p class="font-medium">{{ wipeStatus.lastWipe.executedBy }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Date</p>
                  <p class="font-medium">{{ formatDate(wipeStatus.lastWipe.executedAt) }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Tables Affected</p>
                  <p class="font-medium">{{ wipeStatus.lastWipe.tablesAffected }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Rows Affected</p>
                  <p class="font-medium">{{ wipeStatus.lastWipe.rowsAffected.toLocaleString() }}</p>
                </div>
                <div class="col-span-2">
                  <p class="text-xs text-muted-foreground">Reason</p>
                  <p>{{ wipeStatus.lastWipe.reason }}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Player Statistics -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-3">
            <Users class="w-6 h-6 text-blue-400" />
            Player Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-3 gap-4">
            <div class="rounded-lg border p-4">
              <p class="text-xs text-muted-foreground">Total Active Players</p>
              <p class="text-2xl font-bold">{{ players.length }}</p>
            </div>
            <div class="rounded-lg border p-4">
              <p class="text-xs text-muted-foreground">Protected Players</p>
              <p class="text-2xl font-bold text-yellow-400">{{ excludedPlayers.length }}</p>
            </div>
            <div class="rounded-lg border p-4">
              <p class="text-xs text-muted-foreground">Will Be Wiped</p>
              <p class="text-2xl font-bold text-red-400">{{ players.length - excludedPlayers.length }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Player Exclusion Selector -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-3">
            <Shield class="w-6 h-6 text-yellow-400" />
            Exclude Players from Wipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground mb-4">
            Select players who should be protected from the wipe. These players will keep all their data.
          </p>

        <!-- Search and Filter -->
        <div class="flex gap-3 mb-4">
          <div class="flex-1 relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              v-model="searchQuery"
              placeholder="Search by name, class, race, or guild..."
              class="bg-gray-900 border-gray-700 text-white pl-10"
            />
          </div>
          <Button
            @click="selectAllVisible"
            variant="outline"
            class="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            Select All ({{ filteredPlayers.length }})
          </Button>
          <Button
            @click="deselectAll"
            variant="outline"
            class="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            Clear Selection
          </Button>
        </div>

          <!-- Player List -->
          <div class="rounded-lg border max-h-96 overflow-y-auto">
            <div class="divide-y">
              <div
                v-for="player in filteredPlayers"
                :key="player.pid"
                class="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                :class="{ 'bg-yellow-500/10': isExcluded(player.pid) }"
                @click="togglePlayer(player.pid)"
              >
                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    :checked="isExcluded(player.pid)"
                    @click.stop="togglePlayer(player.pid)"
                    class="w-4 h-4 rounded text-yellow-600 focus:ring-yellow-500 cursor-pointer"
                  />
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-mono font-semibold">{{ player.name }}</span>
                      <span class="text-xs text-muted-foreground">Level {{ player.level }}</span>
                    </div>
                    <div class="text-xs">
                      <span v-html="player.classHtml"></span> • <span v-html="player.raceHtml"></span> • <span v-html="player.guildHtml"></span>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-muted-foreground">Wealth</p>
                    <p class="text-sm text-yellow-400 font-mono">{{ formatWealth(player.wealth) }}</p>
                  </div>
                </div>
              </div>

              <!-- Empty State -->
              <div
                v-if="filteredPlayers.length === 0"
                class="p-8 text-center text-muted-foreground"
              >
                No players found matching your search.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Danger Zone - Execute Wipe -->
      <div class="rounded-lg border border-destructive bg-destructive/10 p-6">
        <div class="flex items-start gap-4">
          <AlertTriangle class="w-8 h-8 text-destructive flex-shrink-0" />
          <div class="flex-1">
            <h2 class="text-xl font-semibold text-destructive mb-2">Execute Player Wipe</h2>
            <p class="mb-4">
              This will permanently delete all player data except for the {{ excludedPlayers.length }} excluded player(s).
              This action cannot be undone!
            </p>
            <Button
              @click="handleExecuteClick"
              :disabled="wipeStatus.isOnCooldown"
              variant="destructive"
            >
              <AlertTriangle class="w-4 h-4 mr-2" />
              Execute Player Wipe
            </Button>
          </div>
        </div>
      </div>

      <!-- Danger Zone - Guild Wipe -->
      <div class="rounded-lg border border-orange-500/40 bg-orange-500/10 p-6">
        <div class="flex items-start gap-4">
          <AlertTriangle class="w-8 h-8 text-orange-400 flex-shrink-0" />
          <div class="flex-1">
            <h2 class="text-xl font-semibold text-orange-300 mb-2">Guild Wipe</h2>
            <p class="mb-4 text-sm">
              Deletes all guild forum categories. The guild sync service will recreate them from current guild membership within a minute. Use this to clean up stale or duplicate guild categories.
            </p>
            <div class="space-y-3">
              <div>
                <label class="text-xs text-muted-foreground">Reason (min 10 chars)</label>
                <Input v-model="guildWipeReason" placeholder="e.g. cleanup duplicate beltorin categories" class="mt-1" />
              </div>
              <div>
                <label class="text-xs text-muted-foreground">Type <span class="font-mono font-bold">WIPE</span> to confirm</label>
                <Input v-model="guildWipeConfirm" placeholder="WIPE" class="mt-1 font-mono" />
              </div>
              <Button
                @click="handleGuildWipe"
                :disabled="isGuildWiping || guildWipeReason.length < 10 || guildWipeConfirm !== 'WIPE'"
                variant="destructive"
                class="bg-orange-600 hover:bg-orange-700"
              >
                <AlertTriangle class="w-4 h-4 mr-2" />
                {{ isGuildWiping ? 'Wiping...' : 'Execute Guild Wipe' }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Wipe History -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle class="flex items-center gap-3">
              <History class="w-6 h-6 text-purple-400" />
              Wipe History
            </CardTitle>
            <Button
              @click="loadWipeHistory"
              :disabled="isLoadingHistory"
              variant="outline"
              size="sm"
            >
              <RefreshCw :class="['w-4 h-4', isLoadingHistory && 'animate-spin']" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <!-- History Table -->
          <div v-if="wipeHistory.length > 0" class="rounded-lg border overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="border-b bg-muted/50">
                  <tr>
                    <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Date</th>
                    <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Executed By</th>
                    <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Reason</th>
                    <th class="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Excluded</th>
                    <th class="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Rows</th>
                    <th class="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr
                    v-for="entry in wipeHistory"
                    :key="entry.id"
                    class="hover:bg-muted/50 transition-colors"
                  >
                    <td class="px-4 py-3 text-sm">
                      {{ formatDate(entry.executedAt) }}
                    </td>
                    <td class="px-4 py-3 text-sm font-medium">
                      {{ entry.executedBy }}
                    </td>
                    <td class="px-4 py-3 text-sm max-w-xs truncate" :title="entry.reason">
                      {{ entry.reason }}
                    </td>
                    <td class="px-4 py-3 text-sm text-yellow-400 text-right">
                      {{ entry.excludedPlayers.length }}
                    </td>
                    <td class="px-4 py-3 text-sm text-right">
                      {{ entry.rowsAffected.toLocaleString() }}
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span
                        v-if="entry.success"
                        class="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-medium"
                      >
                        <CheckCircle class="w-3 h-3" />
                        Success
                      </span>
                      <span
                        v-else
                        class="inline-flex items-center gap-1 px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-medium"
                        :title="entry.errorMessage ?? undefined"
                      >
                        <XCircle class="w-3 h-3" />
                        Failed
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="!isLoadingHistory"
            class="text-center py-8 text-muted-foreground"
          >
            No wipe history found.
          </div>

          <!-- Loading State -->
          <div v-else class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          </div>
        </CardContent>
      </Card>

      <!-- Info Box -->
      <div class="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
        <div class="flex items-start gap-3">
          <Info class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-blue-300 font-medium">About Player Wipe</p>
            <ul class="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Hard-deletes character data — accounts are preserved, players can re-roll</li>
              <li>Protected players keep everything</li>
              <li>Refuses to run while the MUD is up</li>
              <li>7-day cooldown between wipes</li>
              <li>Fully logged to the audit trail</li>
              <li>Transaction-based — rolls back on any error (except players_core, a MyISAM cache)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Wipe Confirmation Dialog -->
    <WipeConfirmationDialog
      :open="showWipeDialog"
      :excluded-players="excludedPlayerObjects"
      :saving="isSaving"
      @update:open="showWipeDialog = $event"
      @confirm="handleConfirmWipe"
      @cancel="handleCancelWipe"
    />

    <!-- MUD Running Prompt -->
    <Dialog :open="showShutdownPrompt" @update:open="showShutdownPrompt = $event">
      <DialogContent class="bg-gray-800 border border-yellow-500">
        <DialogHeader>
          <DialogTitle class="text-yellow-300 flex items-center gap-2">
            <AlertTriangle class="w-5 h-5" /> MUD is running
          </DialogTitle>
          <DialogDescription>
            The player wipe cannot run while the MUD is up — connected characters would re-save
            after the wipe. Current state:
            <span class="font-mono">{{ wipeStatus?.mudState }}</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <Button variant="outline" :disabled="isShuttingDown" @click="showShutdownPrompt = false">
            Cancel
          </Button>
          <Button variant="destructive" :disabled="isShuttingDown" @click="handleShutdownMud">
            <Loader2 v-if="isShuttingDown" class="w-4 h-4 mr-2 animate-spin" />
            {{ isShuttingDown ? 'Shutting down...' : 'Shutdown MUD' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RefreshCw, AlertTriangle, Clock, History, Users, Shield, Search, Info, CheckCircle, XCircle, Loader2 } from 'lucide-vue-next';
import { apiClient as api } from '@/services/api';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import WipeConfirmationDialog from '@/components/admin/WipeConfirmationDialog.vue';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { formatWealth } from '@/utils/formatWealth';

interface Player {
  pid: number;
  name: string;
  level: number;
  class: string;
  classHtml: string;
  spec: string;
  specHtml: string;
  race: string;
  raceHtml: string;
  guild: string;
  guildHtml: string;
  wealth: number;
}

interface WipeStatus {
  isOnCooldown: boolean;
  cooldownEndsAt: string | null;
  mudRunning: boolean;
  mudState: string;
  lastWipe: {
    executedAt: string;
    executedBy: string;
    reason: string;
    success: boolean;
    tablesAffected: number;
    rowsAffected: number;
  } | null;
}

interface WipeHistoryEntry {
  id: number;
  executedBy: string;
  executedAt: string;
  reason: string;
  excludedPlayers: { pid: number; name: string }[];
  tablesAffected: number;
  rowsAffected: number;
  durationSeconds: number;
  success: boolean;
  errorMessage: string | null;
  backupPath: string | null;
  ipAddress: string;
}

const isLoading = ref(true);
const error = ref<string | null>(null);
const wipeStatus = ref<WipeStatus | null>(null);
const players = ref<Player[]>([]);
const excludedPlayerPids = ref<number[]>([]);
const searchQuery = ref('');
const showWipeDialog = ref(false);
const isSaving = ref(false);
const wipeHistory = ref<WipeHistoryEntry[]>([]);
const isLoadingHistory = ref(false);
const guildWipeReason = ref('');
const guildWipeConfirm = ref('');
const isGuildWiping = ref(false);
const showShutdownPrompt = ref(false);
const isShuttingDown = ref(false);
const shutdownAborted = ref(false);

onBeforeUnmount(() => {
  shutdownAborted.value = true;
});

const handleGuildWipe = async () => {
  isGuildWiping.value = true;
  try {
    const response = await api.post('/api/admin/mud/wipe/guilds', {
      reason: guildWipeReason.value,
      confirmation: guildWipeConfirm.value
    });
    toast.success('Guild wipe complete', { description: response.data.message });
    guildWipeReason.value = '';
    guildWipeConfirm.value = '';
  } catch (err: any) {
    toast.error('Guild wipe failed', { description: err.response?.data?.error || 'An error occurred' });
  } finally {
    isGuildWiping.value = false;
  }
};

const cooldownDaysRemaining = computed(() => {
  if (!wipeStatus.value?.cooldownEndsAt) return 0;
  const now = new Date();
  const end = new Date(wipeStatus.value.cooldownEndsAt);
  const diffMs = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

const filteredPlayers = computed(() => {
  if (!searchQuery.value.trim()) {
    return players.value;
  }

  const query = searchQuery.value.toLowerCase();
  return players.value.filter(player =>
    player.name.toLowerCase().includes(query) ||
    player.class.toLowerCase().includes(query) ||
    player.race.toLowerCase().includes(query) ||
    player.guild.toLowerCase().includes(query)
  );
});

const excludedPlayers = computed(() => {
  return players.value.filter(p => excludedPlayerPids.value.includes(p.pid));
});

const excludedPlayerObjects = computed(() => {
  return excludedPlayers.value;
});

const isExcluded = (pid: number): boolean => {
  return excludedPlayerPids.value.includes(pid);
};

const togglePlayer = (pid: number) => {
  const index = excludedPlayerPids.value.indexOf(pid);
  if (index > -1) {
    excludedPlayerPids.value.splice(index, 1);
  } else {
    excludedPlayerPids.value.push(pid);
  }
};

const selectAllVisible = () => {
  const visiblePids = filteredPlayers.value.map(p => p.pid);
  // Add all visible PIDs that aren't already excluded
  visiblePids.forEach(pid => {
    if (!excludedPlayerPids.value.includes(pid)) {
      excludedPlayerPids.value.push(pid);
    }
  });
};

const deselectAll = () => {
  excludedPlayerPids.value = [];
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const loadData = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    // Load wipe status and player list in parallel
    const [statusResponse, playersResponse] = await Promise.all([
      api.get<{ success: boolean; isOnCooldown: boolean; cooldownEndsAt: string | null; lastWipe: any }>('/api/admin/mud/wipe/status'),
      api.get<{ success: boolean; players: Player[] }>('/api/admin/mud/wipe/players')
    ]);

    wipeStatus.value = {
      isOnCooldown: statusResponse.data.isOnCooldown,
      cooldownEndsAt: statusResponse.data.cooldownEndsAt,
      mudRunning: Boolean((statusResponse.data as any).mudRunning),
      mudState: (statusResponse.data as any).mudState ?? 'unknown',
      lastWipe: statusResponse.data.lastWipe
    };

    players.value = playersResponse.data.players;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load wipe data';
    console.error('Wipe data load error:', err);
  } finally {
    isLoading.value = false;
  }
};

const loadWipeHistory = async () => {
  isLoadingHistory.value = true;

  try {
    const response = await api.get<{ success: boolean; history: WipeHistoryEntry[] }>('/api/admin/mud/wipe/history', {
      params: { limit: 10 }
    });

    wipeHistory.value = response.data.history;
  } catch (err: any) {
    toast.error('Failed to load wipe history', {
      description: err.response?.data?.error || 'An error occurred'
    });
    console.error('Wipe history load error:', err);
  } finally {
    isLoadingHistory.value = false;
  }
};

const handleExecuteClick = () => {
  if (wipeStatus.value?.mudRunning) {
    showShutdownPrompt.value = true;
    return;
  }
  showWipeDialog.value = true;
};

const handleShutdownMud = async () => {
  isShuttingDown.value = true;
  shutdownAborted.value = false;

  try {
    await api.post('/api/mud/stop', { reason: 'pre-wipe shutdown' });
    toast.success('Shutdown requested', { description: 'Waiting for MUD to stop...' });

    const refreshMudState = async () => {
      const r = await api.get<{ mudRunning: boolean; mudState: string }>('/api/admin/mud/wipe/status');
      if (wipeStatus.value) {
        wipeStatus.value.mudRunning = Boolean(r.data.mudRunning);
        wipeStatus.value.mudState = r.data.mudState ?? 'unknown';
      }
    };

    for (let i = 0; i < 15; i++) {
      if (shutdownAborted.value) return;
      await new Promise((r) => setTimeout(r, 2000));
      if (shutdownAborted.value) return;
      await refreshMudState();
      if (!wipeStatus.value?.mudRunning) break;
    }

    if (wipeStatus.value?.mudRunning) {
      toast.error('MUD did not stop in time', { description: 'Check MUD control, then retry' });
      return;
    }

    showShutdownPrompt.value = false;
    showWipeDialog.value = true;
  } catch (err: any) {
    toast.error('Shutdown failed', { description: err.response?.data?.error ?? String(err) });
  } finally {
    isShuttingDown.value = false;
  }
};

const handleConfirmWipe = async (reason: string) => {
  isSaving.value = true;

  try {
    const response = await api.post('/api/admin/mud/wipe/execute', {
      reason,
      excludedPids: excludedPlayerPids.value,
      confirmation: 'WIPE PLAYERS'
    });

    toast.success('Player wipe completed successfully!', {
      description: response.data.message
    });

    // Reload data
    await loadData();
    showWipeDialog.value = false;

    // Clear exclusions after successful wipe
    excludedPlayerPids.value = [];
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || 'Failed to execute wipe';
    toast.error('Wipe failed', {
      description: errorMsg
    });
    console.error('Wipe execution error:', err);
  } finally {
    isSaving.value = false;
  }
};

const handleCancelWipe = () => {
  showWipeDialog.value = false;
};

onMounted(() => {
  loadData();
  loadWipeHistory();
});
</script>
