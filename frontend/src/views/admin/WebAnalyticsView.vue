<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import type { ChartData, ChartOptions } from 'chart.js'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import LineChart from '@/components/charts/LineChart.vue'
import PieChart from '@/components/charts/PieChart.vue'
import WorldMap from '@/components/charts/WorldMap.vue'
import {
  Eye,
  Users,
  Clock,
  MousePointerClick,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  TrendingUp,
  RefreshCw,
} from 'lucide-vue-next'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// State
const isLoading = ref(true)
const selectedDays = ref('30')
const activeTab = ref('overview')

// Data
const overview = ref<any>(null)
const topPages = ref<any[]>([])
const referrers = ref<any[]>([])
const deviceStats = ref<any>(null)
const geoStats = ref<any[]>([])
const trafficData = ref<any[]>([])
const realtimeVisitors = ref<any[]>([])
const realtimeCount = ref(0)

// Visitors list with pagination
const visitors = ref<any[]>([])
const visitorsPagination = ref<any>(null)
const visitorsPage = ref(1)

// Fetch overview stats
async function fetchOverview() {
  try {
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/overview`, {
      params: { days: selectedDays.value },
      withCredentials: true,
    })
    overview.value = response.data
  } catch (error) {
    console.error('Error fetching overview:', error)
  }
}

// Fetch top pages
async function fetchTopPages() {
  try {
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/pages`, {
      params: { days: selectedDays.value, limit: 20 },
      withCredentials: true,
    })
    topPages.value = response.data.data
  } catch (error) {
    console.error('Error fetching top pages:', error)
  }
}

// Fetch referrer stats
async function fetchReferrers() {
  try {
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/referrers`, {
      params: { days: selectedDays.value },
      withCredentials: true,
    })
    referrers.value = response.data.data
  } catch (error) {
    console.error('Error fetching referrers:', error)
  }
}

// Fetch device stats
async function fetchDeviceStats() {
  try {
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/devices`, {
      params: { days: selectedDays.value },
      withCredentials: true,
    })
    deviceStats.value = response.data
  } catch (error) {
    console.error('Error fetching device stats:', error)
  }
}

// Fetch geo stats
async function fetchGeoStats() {
  try {
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/geo`, {
      params: { days: selectedDays.value },
      withCredentials: true,
    })
    geoStats.value = response.data.data
  } catch (error) {
    console.error('Error fetching geo stats:', error)
  }
}

// Fetch traffic over time
async function fetchTrafficData() {
  try {
    const interval = parseInt(selectedDays.value) <= 7 ? 'hour' : 'day'
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/traffic`, {
      params: { days: selectedDays.value, interval },
      withCredentials: true,
    })
    trafficData.value = response.data.data
  } catch (error) {
    console.error('Error fetching traffic data:', error)
  }
}

// Fetch realtime visitors
async function fetchRealtimeVisitors() {
  try {
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/realtime`, {
      withCredentials: true,
    })
    realtimeVisitors.value = response.data.visitors
    realtimeCount.value = response.data.count
  } catch (error) {
    console.error('Error fetching realtime visitors:', error)
  }
}

// Fetch visitors list
async function fetchVisitors(page: number = 1) {
  try {
    const response = await axios.get(`${API_URL}/api/admin/analytics/web/admin/visitors`, {
      params: { days: selectedDays.value, page, limit: 50 },
      withCredentials: true,
    })
    visitors.value = response.data.data
    visitorsPagination.value = response.data.pagination
    visitorsPage.value = page
  } catch (error) {
    console.error('Error fetching visitors:', error)
  }
}

// Fetch all data
async function fetchAllData() {
  isLoading.value = true
  await Promise.all([
    fetchOverview(),
    fetchTopPages(),
    fetchReferrers(),
    fetchDeviceStats(),
    fetchGeoStats(),
    fetchTrafficData(),
    fetchRealtimeVisitors(),
    fetchVisitors(1),
  ])
  isLoading.value = false
}

// Refresh data when days change
watch(selectedDays, () => {
  fetchAllData()
})

// Chart data for traffic over time
const trafficChartData = computed<ChartData<'line'>>(() => {
  const data = trafficData.value || []
  return {
    labels: data.map((item) => {
      const date = new Date(item.timestamp)
      if (parseInt(selectedDays.value) <= 7) {
        return date.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      }
      return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
    }),
    datasets: [
      {
        label: 'Page Views',
        data: data.map((item) => item.views),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Unique Visitors',
        data: data.map((item) => item.visitors),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const trafficChartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: 'rgb(156, 163, 175)',
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(75, 85, 99, 0.3)',
      },
      ticks: {
        color: 'rgb(156, 163, 175)',
      },
    },
    x: {
      grid: {
        color: 'rgba(75, 85, 99, 0.3)',
      },
      ticks: {
        color: 'rgb(156, 163, 175)',
        maxRotation: 45,
        minRotation: 45,
      },
    },
  },
}))

// Device chart data
const deviceChartData = computed<ChartData<'pie'>>(() => {
  const devices = deviceStats.value?.devices || []
  return {
    labels: devices.map((d: any) => d.deviceType),
    datasets: [
      {
        data: devices.map((d: any) => d.count),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(168, 85, 247, 0.8)',
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(34, 197, 94)',
          'rgb(249, 115, 22)',
          'rgb(168, 85, 247)',
        ],
        borderWidth: 1,
      },
    ],
  }
})

// Browser chart data
const browserChartData = computed<ChartData<'pie'>>(() => {
  const browsers = deviceStats.value?.browsers || []
  return {
    labels: browsers.map((b: any) => b.browser),
    datasets: [
      {
        data: browsers.map((b: any) => b.count),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(236, 72, 153, 0.8)',
        ],
        borderWidth: 1,
      },
    ],
  }
})

// Referrer chart data
const referrerChartData = computed<ChartData<'pie'>>(() => {
  const refs = referrers.value?.slice(0, 6) || []
  return {
    labels: refs.map((r: any) => r.domain),
    datasets: [
      {
        data: refs.map((r: any) => r.visits),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(14, 165, 233, 0.8)',
        ],
        borderWidth: 1,
      },
    ],
  }
})

const pieChartOptions = computed<ChartOptions<'pie'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: 'rgb(156, 163, 175)',
        padding: 15,
      },
    },
  },
}))

// Device icon helper
function getDeviceIcon(type: string) {
  if (type === 'mobile') return Smartphone
  if (type === 'tablet') return Tablet
  return Monitor
}

// Format time
function formatRelativeTime(timestamp: string) {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
}

// Format datetime for visitors table
function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString()
}

// Initialize
onMounted(() => {
  fetchAllData()
})
</script>

<template>
  <div class="container mx-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Web Analytics</h1>
        <p class="text-muted-foreground mt-1">
          Track page views, visitor behavior, and traffic sources
        </p>
      </div>
      <div class="flex items-center gap-4">
        <Select v-model="selectedDays">
          <SelectTrigger class="w-[150px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" @click="fetchAllData" :disabled="isLoading">
          <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </Button>
      </div>
    </div>

    <!-- Realtime Banner -->
    <Card class="bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/30">
      <CardContent class="py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="h-3 w-3 bg-green-500 rounded-full animate-pulse" />
            <span class="font-semibold">{{ realtimeCount }} active visitors</span>
            <span class="text-muted-foreground">in the last 5 minutes</span>
          </div>
          <Button variant="ghost" size="sm" @click="fetchRealtimeVisitors">
            <RefreshCw class="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <div v-if="isLoading && !overview" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <Skeleton class="h-32" v-for="i in 5" :key="i" />
    </div>

    <!-- Overview Cards -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Total Page Views</p>
              <p class="text-2xl font-bold">{{ overview?.totalPageViews?.toLocaleString() || 0 }}</p>
              <p class="text-xs text-muted-foreground mt-1">
                {{ overview?.todayPageViews?.toLocaleString() || 0 }} today
              </p>
            </div>
            <Eye class="h-8 w-8 text-blue-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Unique Visitors</p>
              <p class="text-2xl font-bold">{{ overview?.uniqueVisitors?.toLocaleString() || 0 }}</p>
              <p class="text-xs text-muted-foreground mt-1">
                {{ overview?.todayUniqueVisitors?.toLocaleString() || 0 }} today
              </p>
            </div>
            <Users class="h-8 w-8 text-green-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Avg Session</p>
              <p class="text-2xl font-bold">
                {{ Math.floor((overview?.avgSessionDuration || 0) / 60) }}:{{ String((overview?.avgSessionDuration || 0) % 60).padStart(2, '0') }}
              </p>
              <p class="text-xs text-muted-foreground mt-1">minutes</p>
            </div>
            <Clock class="h-8 w-8 text-orange-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Bounce Rate</p>
              <p class="text-2xl font-bold">{{ overview?.bounceRate?.toFixed(1) || 0 }}%</p>
              <p class="text-xs text-muted-foreground mt-1">single page visits</p>
            </div>
            <MousePointerClick class="h-8 w-8 text-red-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Pages/Session</p>
              <p class="text-2xl font-bold">{{ overview?.pagesPerSession?.toFixed(1) || 0 }}</p>
              <p class="text-xs text-muted-foreground mt-1">avg pages viewed</p>
            </div>
            <TrendingUp class="h-8 w-8 text-purple-500" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Traffic</TabsTrigger>
        <TabsTrigger value="pages">Pages</TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
        <TabsTrigger value="technology">Technology</TabsTrigger>
        <TabsTrigger value="geo">Geography</TabsTrigger>
        <TabsTrigger value="realtime">Realtime</TabsTrigger>
      </TabsList>

      <!-- Traffic Tab -->
      <TabsContent value="overview" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Traffic Over Time</CardTitle>
            <CardDescription>Page views and unique visitors</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="h-[400px]">
              <LineChart
                v-if="trafficData.length > 0"
                :data="trafficChartData"
                :options="trafficChartOptions"
              />
              <div v-else class="flex items-center justify-center h-full text-muted-foreground">
                No traffic data available
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Visitors List -->
        <Card>
          <CardHeader>
            <CardTitle>Recent Visitors</CardTitle>
            <CardDescription>Detailed page view log</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>IP / Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="visitor in visitors" :key="visitor.id">
                  <TableCell class="font-mono text-sm whitespace-nowrap">
                    {{ formatDateTime(visitor.createdAt) }}
                  </TableCell>
                  <TableCell class="font-mono text-sm max-w-[300px] truncate">
                    {{ visitor.path }}
                  </TableCell>
                  <TableCell>{{ visitor.browser }}</TableCell>
                  <TableCell>{{ visitor.os }}</TableCell>
                  <TableCell>
                    <div class="flex flex-col text-sm">
                      <span class="font-mono">{{ visitor.ipAddress || '-' }}</span>
                      <span v-if="visitor.city || visitor.country" class="text-muted-foreground text-xs">
                        {{ [visitor.city, visitor.country].filter(Boolean).join(', ') }}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="visitors.length === 0">
                  <TableCell colspan="5" class="text-center text-muted-foreground py-8">
                    No visitor data available
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <!-- Pagination -->
            <div v-if="visitorsPagination && visitors.length > 0" class="mt-4 flex items-center justify-between">
              <div class="text-sm text-muted-foreground">
                Showing {{ (visitorsPagination.page - 1) * visitorsPagination.limit + 1 }} to
                {{ Math.min(visitorsPagination.page * visitorsPagination.limit, visitorsPagination.total) }}
                of {{ visitorsPagination.total.toLocaleString() }} entries
              </div>
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="visitorsPagination.page <= 1"
                  @click="fetchVisitors(visitorsPagination.page - 1)"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="visitorsPagination.page >= visitorsPagination.totalPages"
                  @click="fetchVisitors(visitorsPagination.page + 1)"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Pages Tab -->
      <TabsContent value="pages" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
            <CardDescription>Most visited pages on your site</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead class="text-right">Views</TableHead>
                  <TableHead class="text-right">Unique Visitors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="page in topPages" :key="page.path">
                  <TableCell class="font-mono text-sm">
                    {{ page.path }}
                    <span v-if="page.pageTitle" class="text-muted-foreground ml-2">
                      - {{ page.pageTitle }}
                    </span>
                  </TableCell>
                  <TableCell class="text-right">{{ page.views.toLocaleString() }}</TableCell>
                  <TableCell class="text-right">{{ page.uniqueVisitors.toLocaleString() }}</TableCell>
                </TableRow>
                <TableRow v-if="topPages.length === 0">
                  <TableCell colspan="3" class="text-center text-muted-foreground py-8">
                    No page data available
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Sources Tab -->
      <TabsContent value="sources" class="space-y-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources</CardTitle>
              <CardDescription>Where your visitors come from</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[300px]">
                <PieChart
                  v-if="referrers.length > 0"
                  :data="referrerChartData"
                  :options="pieChartOptions"
                />
                <div v-else class="flex items-center justify-center h-full text-muted-foreground">
                  No referrer data available
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Referrers</CardTitle>
              <CardDescription>Detailed traffic source breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead class="text-right">Visits</TableHead>
                    <TableHead class="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="ref in referrers" :key="ref.domain">
                    <TableCell>
                      <div class="flex items-center gap-2">
                        <Globe class="h-4 w-4 text-muted-foreground" />
                        {{ ref.domain }}
                      </div>
                    </TableCell>
                    <TableCell class="text-right">{{ ref.visits.toLocaleString() }}</TableCell>
                    <TableCell class="text-right">{{ ref.percentage }}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- Technology Tab -->
      <TabsContent value="technology" class="space-y-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Types</CardTitle>
              <CardDescription>Desktop vs Mobile vs Tablet</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[300px]">
                <PieChart
                  v-if="deviceStats?.devices?.length > 0"
                  :data="deviceChartData"
                  :options="pieChartOptions"
                />
                <div v-else class="flex items-center justify-center h-full text-muted-foreground">
                  No device data available
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Browsers</CardTitle>
              <CardDescription>Browser usage distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[300px]">
                <PieChart
                  v-if="deviceStats?.browsers?.length > 0"
                  :data="browserChartData"
                  :options="pieChartOptions"
                />
                <div v-else class="flex items-center justify-center h-full text-muted-foreground">
                  No browser data available
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Device Details Table -->
        <Card>
          <CardHeader>
            <CardTitle>Technology Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <!-- Devices -->
              <div>
                <h4 class="font-semibold mb-3">Devices</h4>
                <div class="space-y-2">
                  <div
                    v-for="device in deviceStats?.devices"
                    :key="device.deviceType"
                    class="flex items-center justify-between"
                  >
                    <div class="flex items-center gap-2">
                      <component :is="getDeviceIcon(device.deviceType)" class="h-4 w-4 text-muted-foreground" />
                      <span class="capitalize">{{ device.deviceType }}</span>
                    </div>
                    <span class="text-muted-foreground">{{ device.percentage }}%</span>
                  </div>
                </div>
              </div>

              <!-- Browsers -->
              <div>
                <h4 class="font-semibold mb-3">Browsers</h4>
                <div class="space-y-2">
                  <div
                    v-for="browser in deviceStats?.browsers"
                    :key="browser.browser"
                    class="flex items-center justify-between"
                  >
                    <span>{{ browser.browser }}</span>
                    <span class="text-muted-foreground">{{ browser.percentage }}%</span>
                  </div>
                </div>
              </div>

              <!-- OS -->
              <div>
                <h4 class="font-semibold mb-3">Operating Systems</h4>
                <div class="space-y-2">
                  <div
                    v-for="os in deviceStats?.os"
                    :key="os.os"
                    class="flex items-center justify-between"
                  >
                    <span>{{ os.os }}</span>
                    <span class="text-muted-foreground">{{ os.percentage }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Geography Tab -->
      <TabsContent value="geo" class="space-y-4">
        <!-- World Map -->
        <Card>
          <CardHeader>
            <CardTitle>Visitor Map</CardTitle>
            <CardDescription>Geographic distribution of your visitors worldwide</CardDescription>
          </CardHeader>
          <CardContent>
            <WorldMap
              v-if="geoStats.length > 0"
              :data="geoStats"
              :height="450"
            />
            <div v-else class="flex items-center justify-center h-[450px] text-muted-foreground">
              No geographic data available
            </div>
          </CardContent>
        </Card>

        <!-- Country Table -->
        <Card>
          <CardHeader>
            <CardTitle>Visitors by Country</CardTitle>
            <CardDescription>Detailed breakdown by country</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead class="text-right">Visitors</TableHead>
                  <TableHead class="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="geo in geoStats" :key="geo.country">
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <Globe class="h-4 w-4 text-muted-foreground" />
                      {{ geo.country }}
                    </div>
                  </TableCell>
                  <TableCell class="text-right">{{ geo.count.toLocaleString() }}</TableCell>
                  <TableCell class="text-right">{{ geo.percentage }}%</TableCell>
                </TableRow>
                <TableRow v-if="geoStats.length === 0">
                  <TableCell colspan="3" class="text-center text-muted-foreground py-8">
                    No geographic data available
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Realtime Tab -->
      <TabsContent value="realtime" class="space-y-4">
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle>Active Visitors</CardTitle>
                <CardDescription>Visitors currently on your site (last 5 minutes)</CardDescription>
              </div>
              <Button variant="outline" size="sm" @click="fetchRealtimeVisitors">
                <RefreshCw class="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="visitor in realtimeVisitors" :key="visitor.sessionId">
                  <TableCell class="font-mono text-sm">{{ visitor.path }}</TableCell>
                  <TableCell>
                    <Badge v-if="visitor.accountName" variant="secondary">
                      {{ visitor.accountName }}
                    </Badge>
                    <span v-else class="text-muted-foreground">Anonymous</span>
                  </TableCell>
                  <TableCell>
                    <span v-if="visitor.city || visitor.country">
                      {{ [visitor.city, visitor.country].filter(Boolean).join(', ') }}
                    </span>
                    <span v-else class="text-muted-foreground">Unknown</span>
                  </TableCell>
                  <TableCell class="text-muted-foreground">
                    {{ formatRelativeTime(visitor.lastSeen) }}
                  </TableCell>
                </TableRow>
                <TableRow v-if="realtimeVisitors.length === 0">
                  <TableCell colspan="4" class="text-center text-muted-foreground py-8">
                    No active visitors right now
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
