<template>
  <div class="container mx-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold flex items-center gap-2">
          <Sparkles class="h-8 w-8 text-purple-500" />
          AI-Powered Suspicion Analysis
        </h1>
        <p class="text-muted-foreground mt-1">
          Gemini AI analyzes login patterns to detect sophisticated multi-accounting
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button @click="router.push('/admin/connections/suspicious')" variant="outline">
          <AlertTriangle class="h-4 w-4 mr-2" />
          Suspicious Accounts
        </Button>
      </div>
    </div>

    <!-- Info Card -->
    <Card class="border-purple-500/50 bg-purple-950/20">
      <CardHeader>
        <CardTitle class="text-lg flex items-center gap-2">
          <Info class="h-5 w-5 text-purple-400" />
          About Gemini AI Analysis
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <p class="text-sm text-muted-foreground">
          This feature uses <strong>Google Gemini 2.5 Flash (Free Tier)</strong> to analyze connection logs
          and detect sophisticated multi-accounting patterns that traditional rule-based systems may miss.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="flex items-start gap-2 text-sm">
            <Zap class="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p class="font-medium">AI Detects:</p>
              <p class="text-xs text-muted-foreground">Overlapping sessions, temporal coordination, behavioral patterns, IP clustering, rapid switching</p>
            </div>
          </div>
          <div class="flex items-start gap-2 text-sm">
            <DollarSign class="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <p class="font-medium">Cost: Free</p>
              <p class="text-xs text-muted-foreground">Free tier: 10 requests/min, 250 requests/day</p>
            </div>
          </div>
          <div class="flex items-start gap-2 text-sm">
            <Clock class="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p class="font-medium">Analysis Time:</p>
              <p class="text-xs text-muted-foreground">2-3 minutes (free tier is slower)</p>
            </div>
          </div>
          <div class="flex items-start gap-2 text-sm">
            <Shield class="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p class="font-medium">Auto-Flagging:</p>
              <p class="text-xs text-muted-foreground">70+ confidence = flagged, detailed evidence provided</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Run Analysis Card -->
    <Card>
      <CardHeader>
        <CardTitle>Run New Analysis</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <Label for="daysBack">Days of Data to Analyze</Label>
            <Select v-model="daysBack">
              <SelectTrigger id="daysBack">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            @click="runAnalysis"
            :disabled="isRunning"
            class="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Loader2 v-if="isRunning" class="h-4 w-4 mr-2 animate-spin" />
            <Sparkles v-else class="h-4 w-4 mr-2" />
            {{ isRunning ? 'Analyzing...' : 'Run AI Analysis' }}
          </Button>
        </div>

        <Alert v-if="analysisError" variant="destructive">
          <AlertTriangle class="h-4 w-4" />
          <AlertTitle>Analysis Failed</AlertTitle>
          <AlertDescription>{{ analysisError }}</AlertDescription>
        </Alert>

        <Alert v-if="apiKeyMissing" variant="destructive">
          <AlertTriangle class="h-4 w-4" />
          <AlertTitle>API Key Required</AlertTitle>
          <AlertDescription>
            Please add your Gemini API key to the backend .env file:
            <code class="block mt-2 p-2 bg-black/50 rounded text-xs">GEMINI_API_KEY=your_api_key_here</code>
            Get a free key at: <a href="https://aistudio.google.com/app/apikey" target="_blank" class="underline">https://aistudio.google.com/app/apikey</a>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>

    <!-- Latest Analysis Results -->
    <Card v-if="latestAnalysis">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <TrendingUp class="h-5 w-5 text-purple-500" />
          Latest Analysis Results
        </CardTitle>
        <p class="text-sm text-muted-foreground">
          Analyzed at {{ formatTimestamp(latestAnalysis.analysis_timestamp) }}
        </p>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Summary -->
        <div class="p-4 rounded-lg bg-muted/50">
          <h3 class="font-semibold mb-2">AI Summary</h3>
          <p class="text-sm text-muted-foreground">{{ latestAnalysis.summary }}</p>
        </div>

        <!-- Statistics -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 rounded-lg border">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted-foreground">Suspicious Accounts Found</p>
                <p class="text-2xl font-bold text-destructive">{{ latestAnalysis.suspicious_accounts.length }}</p>
              </div>
              <AlertTriangle class="h-8 w-8 text-destructive" />
            </div>
          </div>
          <div class="p-4 rounded-lg border">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted-foreground">Patterns Detected</p>
                <p class="text-2xl font-bold text-amber-500">{{ latestAnalysis.patterns_detected.length }}</p>
              </div>
              <Activity class="h-8 w-8 text-amber-500" />
            </div>
          </div>
        </div>

        <!-- Suspicious Accounts -->
        <div v-if="latestAnalysis.suspicious_accounts.length > 0">
          <h3 class="font-semibold mb-3">Suspicious Accounts (AI Confidence ≥ 70)</h3>
          <div class="space-y-3">
            <div
              v-for="account in latestAnalysis.suspicious_accounts"
              :key="account.account_name"
              class="p-4 rounded-lg border bg-card"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h4 class="font-semibold">{{ account.account_name }}</h4>
                    <Badge
                      :variant="account.confidence_score >= 90 ? 'destructive' : account.confidence_score >= 70 ? 'default' : 'secondary'"
                    >
                      {{ account.confidence_score }}% Confidence
                    </Badge>
                    <Badge variant="outline">{{ account.recommended_action }}</Badge>
                  </div>
                  <div class="space-y-2 text-sm">
                    <div>
                      <p class="text-xs text-muted-foreground font-medium">Reasons:</p>
                      <ul class="list-disc list-inside text-muted-foreground">
                        <li v-for="(reason, idx) in account.reasons" :key="idx">{{ reason }}</li>
                      </ul>
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground font-medium">Evidence:</p>
                      <ul class="list-disc list-inside text-muted-foreground">
                        <li v-for="(evidence, idx) in account.evidence" :key="idx">{{ evidence }}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Patterns Detected -->
        <div v-if="latestAnalysis.patterns_detected.length > 0">
          <h3 class="font-semibold mb-3">Behavioral Patterns</h3>
          <div class="space-y-2">
            <div
              v-for="(pattern, idx) in latestAnalysis.patterns_detected"
              :key="idx"
              class="p-3 rounded-lg border bg-card"
            >
              <div class="flex items-start gap-3">
                <Badge :variant="pattern.severity === 'high' ? 'destructive' : pattern.severity === 'medium' ? 'default' : 'secondary'">
                  {{ pattern.severity }}
                </Badge>
                <div class="flex-1">
                  <p class="font-medium text-sm">{{ pattern.pattern_type.replace(/_/g, ' ').toUpperCase() }}</p>
                  <p class="text-xs text-muted-foreground mt-1">{{ pattern.description }}</p>
                  <p class="text-xs text-muted-foreground mt-1">
                    <strong>Accounts:</strong> {{ pattern.accounts_involved.join(', ') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Analysis History -->
    <Card>
      <CardHeader>
        <CardTitle>Analysis History</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="historyLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="history.length === 0" class="text-center py-8 text-muted-foreground">
          <Inbox class="h-8 w-8 mx-auto mb-2" />
          <p>No analysis history yet</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="item in history"
            :key="item.id"
            class="p-4 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
            @click="viewAnalysis(item.id)"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">{{ formatTimestamp(item.analysis_timestamp) }}</p>
                <p class="text-sm text-muted-foreground">
                  {{ item.suspicious_count }} suspicious accounts, {{ item.patterns_count }} patterns
                </p>
              </div>
              <ChevronRight class="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Clock,
  DollarSign,
  Inbox,
  Info,
  Loader2,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const router = useRouter()
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// State
const daysBack = ref('30')
const isRunning = ref(false)
const analysisError = ref<string | null>(null)
const apiKeyMissing = ref(false)
const latestAnalysis = ref<any>(null)
const history = ref<any[]>([])
const historyLoading = ref(false)

// Run AI analysis
const runAnalysis = async () => {
  isRunning.value = true
  analysisError.value = null
  apiKeyMissing.value = false

  try {
    const response = await axios.post(
      `${API_URL}/api/admin/ai-analysis/run`,
      { daysBack: Number(daysBack.value) },
      { withCredentials: true }
    )

    latestAnalysis.value = response.data.data
    await fetchHistory() // Refresh history
  } catch (error: any) {
    console.error('AI analysis error:', error)
    if (error.response?.data?.error?.includes('GEMINI_API_KEY')) {
      apiKeyMissing.value = true
    } else {
      analysisError.value = error.response?.data?.error || 'Failed to run AI analysis'
    }
  } finally {
    isRunning.value = false
  }
}

// Fetch analysis history
const fetchHistory = async () => {
  historyLoading.value = true
  try {
    const response = await axios.get(`${API_URL}/api/admin/ai-analysis/history?limit=10`, {
      withCredentials: true,
    })
    history.value = response.data.data
  } catch (error) {
    console.error('Fetch history error:', error)
  } finally {
    historyLoading.value = false
  }
}

// View specific analysis
const viewAnalysis = async (id: number) => {
  try {
    const response = await axios.get(`${API_URL}/api/admin/ai-analysis/${id}`, {
      withCredentials: true,
    })
    // MySQL JSON column returns parsed object, not string
    const fullResults = response.data.data.full_results
    latestAnalysis.value = typeof fullResults === 'string'
      ? JSON.parse(fullResults)
      : fullResults
  } catch (error) {
    console.error('View analysis error:', error)
  }
}

// Format timestamp
const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString()
}

// Lifecycle
onMounted(() => {
  fetchHistory()
})
</script>
