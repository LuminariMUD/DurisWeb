<template>
  <div class="container mx-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Connection Logs</h1>
        <p class="text-muted-foreground mt-1">
          Track MUD login/logout events and detect suspicious multi-account patterns
        </p>
      </div>
      <Button
        @click="router.push('/admin/connections/suspicious')"
        variant="outline"
        class="border-orange-500 text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-600 dark:hover:bg-orange-950"
      >
        <AlertTriangle class="h-4 w-4 mr-2" />
        Suspicious Accounts
      </Button>
    </div>

    <!-- Statistics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4" v-if="stats">
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Total Logins</p>
              <p class="text-2xl font-bold">{{ stats.totalLogins.toLocaleString() }}</p>
            </div>
            <LogIn class="h-8 w-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Unique Accounts</p>
              <p class="text-2xl font-bold">{{ stats.uniqueAccounts }}</p>
            </div>
            <Users class="h-8 w-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Unique IPs</p>
              <p class="text-2xl font-bold">{{ stats.uniqueIPs }}</p>
            </div>
            <Globe class="h-8 w-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Flagged Accounts</p>
              <p class="text-2xl font-bold text-destructive">{{ stats.suspiciousAccountCount }}</p>
            </div>
            <AlertTriangle class="h-8 w-8 text-destructive" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Filters -->
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label for="account">Account Name</Label>
            <Input
              id="account"
              v-model="filters.account"
              placeholder="Search account..."
              @input="debouncedFetch"
            />
          </div>

          <div class="space-y-2">
            <Label for="character">Character Name</Label>
            <Input
              id="character"
              v-model="filters.character"
              placeholder="Search character..."
              @input="debouncedFetch"
            />
          </div>

          <div class="space-y-2">
            <Label for="ip">IP Address</Label>
            <Input
              id="ip"
              v-model="filters.ip"
              placeholder="Search IP..."
              @input="debouncedFetch"
            />
          </div>

          <div class="space-y-2">
            <Label for="status">Status</Label>
            <Select v-model="filters.status" @update:model-value="() => fetchLogs(1)">
              <SelectTrigger id="status">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label for="startDate">Start Date</Label>
            <div class="relative">
              <input
                ref="startDateInput"
                id="startDate"
                v-model="filters.startDate"
                type="text"
                placeholder="YYYY-MM-DD HH:mm"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-10 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Calendar class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="endDate">End Date</Label>
            <div class="relative">
              <input
                ref="endDateInput"
                id="endDate"
                v-model="filters.endDate"
                type="text"
                placeholder="YYYY-MM-DD HH:mm"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-10 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Calendar class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        <div class="flex gap-2 mt-4">
          <Button @click="resetFilters" variant="outline" size="sm">
            <X class="h-4 w-4 mr-2" />
            Clear Filters
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Connection Logs Table -->
    <Card>
      <CardHeader>
        <CardTitle>Connection Events (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="error" class="text-center py-8 text-destructive">
          <AlertTriangle class="h-8 w-8 mx-auto mb-2" />
          <p>{{ error }}</p>
        </div>

        <div v-else-if="logs.length === 0" class="text-center py-8 text-muted-foreground">
          <Search class="h-8 w-8 mx-auto mb-2" />
          <p>No connection logs found</p>
        </div>

        <div v-else class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Character</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Suspicious Score</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="log in logs" :key="log.id">
                <TableCell class="font-mono text-sm">
                  {{ formatTimestamp(log.timestamp) }}
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    class="p-0 h-auto"
                    @click="viewAccountTimeline(log.accountName)"
                  >
                    {{ log.accountName }}
                  </Button>
                </TableCell>
                <TableCell>{{ log.characterName || '-' }}</TableCell>
                <TableCell>
                  <Badge :variant="log.status === 'login' ? 'default' : 'secondary'">
                    <LogIn v-if="log.status === 'login'" class="h-3 w-3 mr-1" />
                    <LogOut v-else class="h-3 w-3 mr-1" />
                    {{ log.status }}
                  </Badge>
                </TableCell>
                <TableCell class="font-mono text-sm">
                  <Button
                    variant="link"
                    class="p-0 h-auto font-mono"
                    @click="viewIPDetails(log.ipAddress)"
                  >
                    {{ log.ipAddress }}
                  </Button>
                </TableCell>
                <TableCell>
                  <div v-if="log.geoLocation" class="flex items-center gap-2">
                    <Globe class="h-4 w-4 text-muted-foreground" />
                    <span class="text-sm">
                      {{ formatGeoLocation(log.geoLocation) }}
                    </span>
                    <Badge v-if="log.geoLocation.isVPN || log.geoLocation.isProxy" variant="destructive" class="text-xs">
                      VPN
                    </Badge>
                  </div>
                  <span v-else class="text-muted-foreground text-sm">-</span>
                </TableCell>
                <TableCell>
                  <Badge
                    v-if="log.suspicion_score"
                    :variant="log.suspicion_score >= 70 ? 'destructive' : log.suspicion_score >= 40 ? 'default' : 'secondary'"
                  >
                    {{ log.suspicion_score }}
                  </Badge>
                  <span v-else class="text-muted-foreground text-sm">-</span>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    @click="viewAccountTimeline(log.accountName)"
                  >
                    <Activity class="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- Pagination -->
        <div v-if="pagination && logs.length > 0" class="mt-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="text-sm text-muted-foreground">
                Showing {{ (pagination.page - 1) * pagination.limit + 1 }} to
                {{ Math.min(pagination.page * pagination.limit, pagination.total) }}
                of {{ pagination.total }} results
              </div>
              <div class="flex items-center gap-2">
                <Label for="perPage" class="text-sm text-muted-foreground">Per page:</Label>
                <Select v-model="itemsPerPage" @update:model-value="changeItemsPerPage">
                  <SelectTrigger id="perPage" class="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="flex justify-end">
              <PaginationWithEllipsis
                :current-page="pagination.page"
                :total-pages="pagination.totalPages"
                @page-change="changePage"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- IP Details Dialog -->
    <Dialog v-model:open="ipDialogOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>IP Address Details: {{ selectedIP }}</DialogTitle>
          <DialogDescription>
            All accounts that have logged in from this IP address
          </DialogDescription>
        </DialogHeader>

        <div v-if="ipDetailsLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin" />
        </div>

        <div v-else-if="ipDetails.length > 0" class="space-y-4">
          <Alert v-if="ipDetails.length > 1" variant="destructive">
            <AlertTriangle class="h-4 w-4" />
            <AlertTitle>Shared IP Detected</AlertTitle>
            <AlertDescription>
              {{ ipDetails.length }} accounts have used this IP address
            </AlertDescription>
          </Alert>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Connection Count</TableHead>
                <TableHead>Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="account in ipDetails" :key="account.accountName">
                <TableCell>{{ account.accountName }}</TableCell>
                <TableCell>{{ account.connectionCount }}</TableCell>
                <TableCell>{{ formatTimestamp(account.lastSeen) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Account Timeline Dialog -->
    <Dialog v-model:open="timelineDialogOpen">
      <DialogContent class="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connection Timeline: {{ selectedAccount }}</DialogTitle>
          <DialogDescription>
            Login and logout history for this account (last 30 days)
          </DialogDescription>
        </DialogHeader>

        <div v-if="timelineLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin" />
        </div>

        <div v-else-if="timeline.length > 0" class="space-y-2">
          <div
            v-for="(event, index) in timeline"
            :key="index"
            class="flex items-start gap-3 p-3 rounded-lg border"
          >
            <div class="mt-1">
              <LogIn v-if="event.status === 'login'" class="h-5 w-5 text-green-500" />
              <LogOut v-else class="h-5 w-5 text-red-500" />
            </div>
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <p class="font-medium">{{ event.character_name }}</p>
                <Badge :variant="event.status === 'login' ? 'default' : 'secondary'">
                  {{ event.status }}
                </Badge>
              </div>
              <div class="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>{{ formatTimestamp(event.timestamp) }}</span>
                <span class="font-mono">{{ event.ip_address }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-muted-foreground">
          No connection events found for this account
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/themes/dark.css'
import {
  Activity,
  AlertTriangle,
  Calendar,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  Search,
  Users,
  X,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'

const router = useRouter()
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// State
const logs = ref<any[]>([])
const pagination = ref<any>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

const stats = ref<any>(null)
const itemsPerPage = ref('50')

const filters = ref({
  account: '',
  character: '',
  ip: '',
  status: 'all',
  startDate: '',
  endDate: '',
})

// IP Details Dialog
const ipDialogOpen = ref(false)
const selectedIP = ref('')
const ipDetails = ref<any[]>([])
const ipDetailsLoading = ref(false)

// Timeline Dialog
const timelineDialogOpen = ref(false)
const selectedAccount = ref('')
const timeline = ref<any[]>([])
const timelineLoading = ref(false)

// Flatpickr instances
const startDateInput = ref<HTMLInputElement | null>(null)
const endDateInput = ref<HTMLInputElement | null>(null)
let startDatePicker: flatpickr.Instance | null = null
let endDatePicker: flatpickr.Instance | null = null

// Fetch logs
const fetchLogs = async (page = 1) => {
  isLoading.value = true
  error.value = null

  try {
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('limit', itemsPerPage.value)

    if (filters.value.account) params.append('account', filters.value.account)
    if (filters.value.character) params.append('character', filters.value.character)
    if (filters.value.ip) params.append('ip', filters.value.ip)
    if (filters.value.status && filters.value.status !== 'all')
      params.append('status', filters.value.status)
    if (filters.value.startDate) params.append('startDate', filters.value.startDate)
    if (filters.value.endDate) params.append('endDate', filters.value.endDate)

    const response = await axios.get(`${API_URL}/api/admin/connections/logs?${params}`, {
      withCredentials: true,
    })

    logs.value = response.data.data
    pagination.value = response.data.pagination
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to fetch connection logs'
    console.error('Fetch logs error:', err)
  } finally {
    isLoading.value = false
  }
}

// Fetch statistics
const fetchStats = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/admin/connections/stats`, {
      withCredentials: true,
    })
    stats.value = response.data.data
  } catch (err) {
    console.error('Fetch stats error:', err)
  }
}

// View IP details
const viewIPDetails = async (ip: string) => {
  selectedIP.value = ip
  ipDialogOpen.value = true
  ipDetailsLoading.value = true

  try {
    const response = await axios.get(`${API_URL}/api/admin/connections/ip/${ip}`, {
      withCredentials: true,
    })
    ipDetails.value = response.data.data
  } catch (err) {
    console.error('Fetch IP details error:', err)
  } finally {
    ipDetailsLoading.value = false
  }
}

// View account timeline
const viewAccountTimeline = async (accountName: string) => {
  selectedAccount.value = accountName
  timelineDialogOpen.value = true
  timelineLoading.value = true

  try {
    const response = await axios.get(`${API_URL}/api/admin/connections/account/${accountName}`, {
      withCredentials: true,
    })
    timeline.value = response.data.data
  } catch (err) {
    console.error('Fetch timeline error:', err)
  } finally {
    timelineLoading.value = false
  }
}

// Change page
const changePage = (page: number) => {
  fetchLogs(page)
}

// Change items per page
const changeItemsPerPage = () => {
  fetchLogs(1) // Reset to page 1 when changing items per page
}

// Reset filters
const resetFilters = () => {
  filters.value = {
    account: '',
    character: '',
    ip: '',
    status: 'all',
    startDate: '',
    endDate: '',
  }
  fetchLogs()
}

// Debounced fetch for text inputs
let debounceTimer: any = null
const debouncedFetch = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    fetchLogs()
  }, 500)
}

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '-'
  let ts = timestamp.replace(' ', 'T')
  if (!ts.endsWith('Z') && !ts.includes('+')) ts += 'Z'
  return new Date(ts).toLocaleString()
}

// Format geolocation
const formatGeoLocation = (geo: any) => {
  if (!geo) return '-'
  const parts = []
  if (geo.city) parts.push(geo.city)
  if (geo.country && geo.country !== geo.city) parts.push(geo.country)
  return parts.join(', ') || 'Unknown'
}

// Lifecycle
onMounted(() => {
  fetchLogs()
  fetchStats()

  // Initialize flatpickr for date inputs
  if (startDateInput.value) {
    startDatePicker = flatpickr(
      startDateInput.value as HTMLElement,
      {
        enableTime: true,
        dateFormat: 'Y-m-d H:i',
        time_24hr: true,
        onChange: (_selectedDates: any, dateStr: string) => {
          filters.value.startDate = dateStr
          fetchLogs()
        },
      } as any,
    )
  }

  if (endDateInput.value) {
    endDatePicker = flatpickr(
      endDateInput.value as HTMLElement,
      {
        enableTime: true,
        dateFormat: 'Y-m-d H:i',
        time_24hr: true,
        onChange: (_selectedDates: any, dateStr: string) => {
          filters.value.endDate = dateStr
          fetchLogs()
        },
      } as any,
    )
  }
})

onUnmounted(() => {
  startDatePicker?.destroy()
  endDatePicker?.destroy()
})
</script>
