<template>
  <div class="container mx-auto py-6 space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-3xl font-bold">Admin Action Audit Log</h1>
      <p class="text-muted-foreground mt-1">Track all administrative actions and MUD property changes</p>
    </div>

    <!-- Filters Card -->
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Account Name Filter -->
        <div class="space-y-2">
          <Label>Changed By (Account)</Label>
          <Input
            v-model="filters.changedBy"
            type="text"
            placeholder="Search account..."
            @input="debouncedFetch"
          />
        </div>

        <!-- Change Type Filter -->
        <div class="space-y-2">
          <Label>Action Type</Label>
          <Select
            v-model="filters.changeType"
            @update:model-value="fetchLogs(1)"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectGroup>
                <SelectLabel>MUD Admin Actions</SelectLabel>
                <SelectItem value="property_change">MUD Property Change</SelectItem>
                <SelectItem value="level_cap_change">Level Cap Change</SelectItem>
                <SelectItem value="wipe">Player Wipe</SelectItem>
                <SelectItem value="timer_reset">Timer Reset</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Content Management</SelectLabel>
                <SelectItem value="help_file_create">Help File Create</SelectItem>
                <SelectItem value="help_file_edit">Help File Edit</SelectItem>
                <SelectItem value="help_file_delete">Help File Delete</SelectItem>
                <SelectItem value="news_edit">News Edit</SelectItem>
                <SelectItem value="motd_edit">MOTD Edit</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Zone Management</SelectLabel>
                <SelectItem value="zone_create">Zone Create</SelectItem>
                <SelectItem value="zone_edit">Zone Edit</SelectItem>
                <SelectItem value="zone_delete">Zone Delete</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Permission Management</SelectLabel>
                <SelectItem value="assign_role">Assign Role</SelectItem>
                <SelectItem value="revoke_role">Revoke Role</SelectItem>
                <SelectItem value="grant_permission">Grant Permission</SelectItem>
                <SelectItem value="revoke_permission">Revoke Permission</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Forum Actions</SelectLabel>
                <SelectItem value="setting">Forum Setting Change</SelectItem>
                <SelectItem value="category_permission">Category Permission Change</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <!-- Target Filter -->
        <div class="space-y-2">
          <Label>Target (Setting/Category)</Label>
          <Input
            v-model="filters.targetKey"
            type="text"
            placeholder="Search target..."
            @input="debouncedFetch"
          />
        </div>

        <!-- Start Date -->
        <div class="space-y-2">
          <Label>Start Date</Label>
          <Input
            ref="startDateInput"
            v-model="filters.startDate"
            type="text"
            placeholder="YYYY-MM-DD HH:mm"
          />
        </div>

        <!-- End Date -->
        <div class="space-y-2">
          <Label>End Date</Label>
          <Input
            ref="endDateInput"
            v-model="filters.endDate"
            type="text"
            placeholder="YYYY-MM-DD HH:mm"
          />
        </div>

        <!-- Full-Text Search -->
        <div class="space-y-2">
          <Label>Search All Fields</Label>
          <Input
            v-model="filters.search"
            type="text"
            placeholder="Search logs..."
            @input="debouncedFetch"
          />
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="mt-4 flex gap-2">
        <Button
          @click="resetFilters"
          variant="outline"
        >
          Clear Filters
        </Button>
        <Button
          @click="exportToCSV"
          :disabled="isExporting"
        >
          {{ isExporting ? 'Exporting...' : 'Export to CSV' }}
        </Button>
      </div>
      </CardContent>
    </Card>

    <!-- Audit Log Table -->
    <Card>
      <CardContent class="p-0">
      <!-- Loading State -->
      <div v-if="isLoading" class="p-6 space-y-3">
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
        <Skeleton class="h-12 w-full" />
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8">
        <p class="text-destructive">{{ error }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="auditLog.length === 0" class="text-center py-8 text-muted-foreground">
        <p>No audit log entries found</p>
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b">
            <tr>
              <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Timestamp</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Changed By</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Change Type</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Target</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Old Value</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">New Value</th>
              <th class="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr
              v-for="entry in auditLog"
              :key="entry.id"
              class="hover:bg-muted/50"
            >
              <td class="px-4 py-3 text-sm font-mono">
                {{ formatTimestamp(entry.changed_at) }}
              </td>
              <td class="px-4 py-3 text-sm font-medium">
                {{ entry.changed_by }}
              </td>
              <td class="px-4 py-3 text-sm">
                <Badge
                  :variant="getBadgeVariant(entry.change_type)"
                >
                  {{ formatChangeType(entry.change_type) }}
                </Badge>
              </td>
              <td class="px-4 py-3 text-sm font-mono">
                {{ entry.target_key }}
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                {{ truncateValue(entry.old_value) }}
              </td>
              <td class="px-4 py-3 text-sm max-w-xs truncate">
                {{ truncateValue(entry.new_value) }}
              </td>
              <td class="px-4 py-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  @click="viewDetails(entry)"
                  title="View details"
                >
                  <Eye class="w-4 h-4" />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer: Items per page (left) + Pagination (right) -->
      <div v-if="pagination" class="flex items-center justify-between p-4 border-t">
        <!-- Left: Items per page -->
        <div class="flex items-center gap-2">
          <Label class="text-sm">Show</Label>
          <Select
            v-model="filters.limit"
            @update:model-value="fetchLogs(1)"
          >
            <SelectTrigger class="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="10">10</SelectItem>
              <SelectItem :value="20">20</SelectItem>
              <SelectItem :value="50">50</SelectItem>
              <SelectItem :value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span class="text-sm text-muted-foreground">
            entries ({{ (pagination.page - 1) * pagination.limit + 1 }} to
            {{ Math.min(pagination.page * pagination.limit, pagination.total) }}
            of {{ pagination.total }})
          </span>
        </div>

        <!-- Right: Pagination -->
        <div v-if="pagination.pages > 1" class="flex gap-2">
          <Button
            v-for="page in getPageNumbers"
            :key="page"
            @click="goToPage(page)"
            :disabled="page === '...'"
            :variant="page === pagination.page ? 'default' : 'outline'"
            size="sm"
          >
            {{ page }}
          </Button>
        </div>
      </div>
      </CardContent>
    </Card>

    <!-- Details Dialog -->
    <Dialog v-model:open="detailsDialogOpen">
      <DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit Entry Details</DialogTitle>
        </DialogHeader>

        <div v-if="selectedEntry" class="space-y-4">
          <div>
            <Label class="text-sm font-medium">Timestamp</Label>
            <p class="mt-1">{{ formatTimestamp(selectedEntry.changed_at) }}</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Changed By</Label>
            <p class="mt-1">{{ selectedEntry.changed_by }}</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Action Type</Label>
            <p class="mt-1">{{ formatChangeType(selectedEntry.change_type) }}</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Target</Label>
            <p class="mt-1 font-mono">{{ selectedEntry.target_key }}</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Old Value</Label>
            <pre class="mt-1 bg-muted p-3 rounded text-sm overflow-x-auto">{{ selectedEntry.old_value || 'NULL' }}</pre>
          </div>
          <div>
            <Label class="text-sm font-medium">New Value</Label>
            <pre class="mt-1 bg-muted p-3 rounded text-sm overflow-x-auto">{{ selectedEntry.new_value }}</pre>
          </div>
          <div v-if="selectedEntry.notes">
            <Label class="text-sm font-medium">Notes</Label>
            <pre class="mt-1 bg-muted p-3 rounded text-sm overflow-x-auto">{{ selectedEntry.notes }}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { apiClient as api } from '@/services/api';
import { Eye } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import 'flatpickr/dist/themes/dark.css';

const auditLog = ref<any[]>([]);
const pagination = ref<any>(null);
const isLoading = ref(false);
const isExporting = ref(false);
const error = ref<string | null>(null);

const filters = ref({
  changedBy: '',
  changeType: 'all',
  targetKey: '',
  startDate: '',
  endDate: '',
  search: '',
  limit: 50
});

const detailsDialogOpen = ref(false);
const selectedEntry = ref<any>(null);

// Flatpickr refs
const startDateInput = ref<HTMLInputElement | null>(null);
const endDateInput = ref<HTMLInputElement | null>(null);
let startDatePicker: any = null;
let endDatePicker: any = null;

// Fetch logs
const fetchLogs = async (page = 1) => {
  isLoading.value = true;
  error.value = null;

  try {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', filters.value.limit.toString());

    if (filters.value.changedBy) params.append('changedBy', filters.value.changedBy);
    if (filters.value.changeType && filters.value.changeType !== 'all') {
      params.append('changeType', filters.value.changeType);
    }
    if (filters.value.targetKey) params.append('targetKey', filters.value.targetKey);
    if (filters.value.startDate) params.append('startDate', filters.value.startDate);
    if (filters.value.endDate) params.append('endDate', filters.value.endDate);
    if (filters.value.search) params.append('search', filters.value.search);

    const response = await api.get(`/api/admin/forum/audit-log?${params}`);

    auditLog.value = response.data.data;
    pagination.value = response.data.pagination;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to fetch audit log';
    console.error('Fetch audit log error:', err);
  } finally {
    isLoading.value = false;
  }
};

// Debounced fetch
let debounceTimer: any = null;
const debouncedFetch = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchLogs(1); // Reset to page 1 on filter change
  }, 500);
};

// Reset filters
const resetFilters = () => {
  filters.value = {
    changedBy: '',
    changeType: 'all',
    targetKey: '',
    startDate: '',
    endDate: '',
    search: '',
    limit: 50
  };
  fetchLogs(1);
};

// Ellipsis pagination (from PvPListView)
const getPageNumbers = computed(() => {
  if (!pagination.value) return [];

  const current = pagination.value.page;
  const total = pagination.value.pages;
  const delta = 1; // Number of pages to show on each side of current page

  const range: (number | string)[] = [];

  // Always show first page
  range.push(1);

  // Calculate start and end of middle range
  const start = Math.max(2, current - delta);
  const end = Math.min(total - 1, current + delta);

  // Add ellipsis after first page if needed
  if (start > 2) {
    range.push('...');
  }

  // Add middle pages
  for (let i = start; i <= end; i++) {
    range.push(i);
  }

  // Add ellipsis before last page if needed
  if (end < total - 1) {
    range.push('...');
  }

  // Always show last page if more than 1 page
  if (total > 1) {
    range.push(total);
  }

  return range;
});

// Go to page
const goToPage = (page: number | string) => {
  if (typeof page === 'number') {
    fetchLogs(page);
  }
};

// View details
const viewDetails = (entry: any) => {
  selectedEntry.value = entry;
  detailsDialogOpen.value = true;
};

// Formatters
const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString();
};

const formatChangeType = (type: string) => {
  const typeMap: Record<string, string> = {
    'property_change': 'MUD Property Change',
    'level_cap_change': 'Level Cap Change',
    'wipe': 'Player Wipe',
    'timer_reset': 'Timer Reset',
    'help_file_create': 'Help File Create',
    'help_file_edit': 'Help File Edit',
    'help_file_delete': 'Help File Delete',
    'news_edit': 'News Edit',
    'motd_edit': 'MOTD Edit',
    'zone_create': 'Zone Create',
    'zone_edit': 'Zone Edit',
    'zone_delete': 'Zone Delete',
    'assign_role': 'Assign Role',
    'revoke_role': 'Revoke Role',
    'grant_permission': 'Grant Permission',
    'revoke_permission': 'Revoke Permission',
    'setting': 'Forum Setting Change',
    'category_permission': 'Category Permission Change'
  };
  return typeMap[type] || type;
};

const getBadgeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  // Destructive actions
  if (['wipe', 'help_file_delete', 'zone_delete', 'revoke_role', 'revoke_permission'].includes(type)) {
    return 'destructive';
  }
  // Create/Grant actions
  if (['help_file_create', 'zone_create', 'assign_role', 'grant_permission'].includes(type)) {
    return 'default';
  }
  // Edit/Change actions
  if (['property_change', 'level_cap_change', 'help_file_edit', 'news_edit', 'motd_edit', 'zone_edit', 'setting', 'category_permission'].includes(type)) {
    return 'secondary';
  }
  // Reset/misc
  return 'outline';
};

const truncateValue = (value: string | null, maxLength = 50) => {
  if (!value) return '—';
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength) + '...';
};

// Export to CSV
const exportToCSV = async () => {
  isExporting.value = true;
  try {
    // Fetch ALL results (no pagination) for export
    const params = new URLSearchParams();
    params.append('page', '1');
    params.append('limit', '999999'); // Get all results

    if (filters.value.changedBy) params.append('changedBy', filters.value.changedBy);
    if (filters.value.changeType && filters.value.changeType !== 'all') {
      params.append('changeType', filters.value.changeType);
    }
    if (filters.value.targetKey) params.append('targetKey', filters.value.targetKey);
    if (filters.value.startDate) params.append('startDate', filters.value.startDate);
    if (filters.value.endDate) params.append('endDate', filters.value.endDate);
    if (filters.value.search) params.append('search', filters.value.search);

    const response = await api.get(`/api/admin/forum/audit-log?${params}`);
    const allEntries = response.data.data;

    // Build CSV content
    const headers = ['Timestamp', 'Changed By', 'Action Type', 'Target', 'Old Value', 'New Value', 'Notes'];
    const csvRows = [
      headers.join(','), // Header row
      ...allEntries.map((entry: any) => {
        const row = [
          formatTimestamp(entry.changed_at),
          entry.changed_by,
          formatChangeType(entry.change_type),
          entry.target_key || '',
          entry.old_value || '',
          entry.new_value || '',
          entry.notes || ''
        ];
        // Escape quotes and wrap fields containing commas in quotes
        return row.map(field => {
          const fieldStr = String(field).replace(/"/g, '""'); // Escape quotes
          return fieldStr.includes(',') || fieldStr.includes('\n') ? `"${fieldStr}"` : fieldStr;
        }).join(',');
      })
    ];

    // Create blob and download
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit-log-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err: any) {
    console.error('Export error:', err);
    error.value = err.response?.data?.error || 'Failed to export audit log';
  } finally {
    isExporting.value = false;
  }
};

// Lifecycle
onMounted(() => {
  fetchLogs();

  // Initialize Flatpickr
  if (startDateInput.value) {
    startDatePicker = flatpickr(startDateInput.value, {
      enableTime: true,
      dateFormat: 'Y-m-d H:i',
      time_24hr: true,
      onChange: (_selectedDates: any, dateStr: string) => {
        filters.value.startDate = dateStr;
        fetchLogs(1);
      }
    });
  }

  if (endDateInput.value) {
    endDatePicker = flatpickr(endDateInput.value, {
      enableTime: true,
      dateFormat: 'Y-m-d H:i',
      time_24hr: true,
      onChange: (_selectedDates: any, dateStr: string) => {
        filters.value.endDate = dateStr;
        fetchLogs(1);
      }
    });
  }
});

onUnmounted(() => {
  if (startDatePicker && typeof startDatePicker.destroy === 'function') {
    startDatePicker.destroy();
  }
  if (endDatePicker && typeof endDatePicker.destroy === 'function') {
    endDatePicker.destroy();
  }
});
</script>
