<template>
  <div class="container mx-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Suspicious Accounts</h1>
        <p class="text-muted-foreground mt-1">
          Multi-account detection and flagged accounts requiring review
        </p>
      </div>
      <Button @click="router.push('/admin/connections/logs')" variant="outline">
        <Activity class="h-4 w-4 mr-2" />
        Connection Logs
      </Button>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Total Flagged</p>
              <p class="text-2xl font-bold">{{ suspiciousAccounts.length }}</p>
            </div>
            <AlertTriangle class="h-8 w-8 text-destructive" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Needs Review</p>
              <p class="text-2xl font-bold text-amber-500">
                {{ unreviewedCount }}
              </p>
            </div>
            <Clock class="h-8 w-8 text-amber-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Reviewed</p>
              <p class="text-2xl font-bold text-green-500">
                {{ reviewedCount }}
              </p>
            </div>
            <CheckCircle class="h-8 w-8 text-green-500" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Scoring System Legend -->
    <Card class="border-blue-500/50 bg-blue-950/20">
      <CardHeader>
        <CardTitle class="text-lg flex items-center gap-2">
          <Info class="h-5 w-5 text-blue-400" />
          Suspicion Scoring System
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Accounts are automatically flagged when their suspicion score reaches <strong class="text-destructive">70 or higher</strong>.
          The score is calculated based on multiple behavioral patterns:
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Shared IP Accounts -->
          <div class="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500/20 text-orange-400 font-bold text-sm">
              +30
            </div>
            <div class="flex-1">
              <p class="font-medium text-sm">Shared IP Accounts</p>
              <p class="text-xs text-muted-foreground mt-1">
                <strong>+10 points</strong> per account sharing the same IP (max +30)
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                Example: 3 accounts from same IP = +30 points
              </p>
            </div>
          </div>

          <!-- Overlapping Sessions -->
          <div class="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20 text-red-400 font-bold text-sm">
              +60
            </div>
            <div class="flex-1">
              <p class="font-medium text-sm">Overlapping Sessions</p>
              <p class="text-xs text-muted-foreground mt-1">
                <strong>+20 points</strong> per overlapping session detected (max +60)
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                Example: 2 accounts logged in simultaneously = +40 points
              </p>
            </div>
          </div>

          <!-- Rapid Character Switches -->
          <div class="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 font-bold text-sm">
              +25
            </div>
            <div class="flex-1">
              <p class="font-medium text-sm">Rapid Character Switches</p>
              <p class="text-xs text-muted-foreground mt-1">
                <strong>+5 points</strong> per rapid switch (logout → login within 5 min, max +25)
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                Example: Switching between 4 characters quickly = +20 points
              </p>
            </div>
          </div>

          <!-- Same IP Within Hour -->
          <div class="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/20 text-yellow-400 font-bold text-sm">
              +25
            </div>
            <div class="flex-1">
              <p class="font-medium text-sm">Same IP Within Hour</p>
              <p class="text-xs text-muted-foreground mt-1">
                <strong>+25 points</strong> if different accounts used same IP within 1 hour
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                Example: Account A and B both logged in from 127.0.0.1 within 60 minutes
              </p>
            </div>
          </div>

          <!-- Multiple IPs (Reduction) -->
          <div class="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/20 text-green-400 font-bold text-sm">
              -10
            </div>
            <div class="flex-1">
              <p class="font-medium text-sm">Multiple IPs Used</p>
              <p class="text-xs text-muted-foreground mt-1">
                <strong>-10 points</strong> if account used more than 3 different IPs
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                Reduces false positives for legitimate users traveling or using mobile data
              </p>
            </div>
          </div>

          <!-- Score Ranges -->
          <div class="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400">
              <Info class="h-5 w-5" />
            </div>
            <div class="flex-1">
              <p class="font-medium text-sm">Score Ranges</p>
              <div class="space-y-1 mt-1 text-xs">
                <p><strong class="text-green-500">0-40:</strong> Low risk (not flagged)</p>
                <p><strong class="text-amber-500">40-69:</strong> Medium risk (monitored)</p>
                <p><strong class="text-red-500">70-100:</strong> High risk (auto-flagged)</p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
          <Info class="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p class="text-muted-foreground">
            <strong>Note:</strong> The maximum possible score is capped at 100. Scores are recalculated whenever
            new login activity is detected. Overlords should review flagged accounts and mark them as resolved
            after investigation.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Filter Toggle -->
    <Card>
      <CardContent class="pt-6">
        <div class="flex items-center gap-4">
          <Label for="showResolved">Show Resolved</Label>
          <Switch
            id="showResolved"
            v-model="showResolved"
            @update:model-value="fetchSuspiciousAccounts"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Suspicious Accounts Table -->
    <Card>
      <CardHeader>
        <CardTitle>Flagged Accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="error" class="text-center py-8 text-destructive">
          <AlertTriangle class="h-8 w-8 mx-auto mb-2" />
          <p>{{ error }}</p>
        </div>

        <div v-else-if="suspiciousAccounts.length === 0" class="text-center py-8 text-muted-foreground">
          <CheckCircle class="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p>No suspicious accounts found</p>
        </div>

        <div v-else class="overflow-x-auto">
          <TooltipProvider>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Flagged At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="account in suspiciousAccounts"
                :key="account.account_name"
                :class="{ 'opacity-50': account.is_resolved }"
              >
                <TableCell>
                  <Button
                    variant="link"
                    class="p-0 h-auto font-medium"
                    @click="viewAccountDetails(account.account_name)"
                  >
                    {{ account.account_name }}
                  </Button>
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-2">
                    <Badge :variant="getScoreBadgeVariant(account.suspicion_score)">
                      {{ account.suspicion_score }}
                    </Badge>
                    <div class="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        class="h-full transition-all"
                        :class="getScoreBarColor(account.suspicion_score)"
                        :style="{ width: `${account.suspicion_score}%` }"
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {{ getClassificationLabel(account.evidence) }}
                  </Badge>
                </TableCell>
                <TableCell class="text-sm">
                  {{ formatTimestamp(account.flagged_at) }}
                </TableCell>
                <TableCell>
                  <Tooltip v-if="account.is_resolved">
                    <TooltipTrigger as-child>
                      <Badge variant="outline" class="text-green-500 border-green-500 cursor-help">
                        <CheckCircle class="h-3 w-3 mr-1" />
                        Reviewed
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-xs">
                      <div class="space-y-1">
                        <p class="font-medium">Reviewed by: {{ account.reviewed_by || 'Unknown' }}</p>
                        <p class="text-xs text-muted-foreground">
                          {{ account.reviewed_at ? formatTimestamp(account.reviewed_at) : 'N/A' }}
                        </p>
                        <p v-if="account.review_notes" class="text-sm mt-2">
                          {{ account.review_notes }}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <Badge v-else variant="destructive">
                    <Clock class="h-3 w-3 mr-1" />
                    Needs Review
                  </Badge>
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          variant="ghost"
                          size="sm"
                          @click="viewAccountDetails(account.account_name)"
                        >
                          <Eye class="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Details</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip v-if="!account.is_resolved">
                      <TooltipTrigger as-child>
                        <Button
                          variant="outline"
                          size="sm"
                          @click="openResolveDialog(account.account_name)"
                        >
                          <CheckCircle class="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Mark as Resolved</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>

    <!-- Account Details Dialog -->
    <Dialog v-model:open="detailsDialogOpen">
      <DialogContent class="sm:!max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account Analysis: {{ selectedAccount }}</DialogTitle>
          <DialogDescription>
            Detailed multi-account detection evidence
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedAccountData" class="space-y-6">
          <!-- Suspicion Score -->
          <div>
            <h3 class="font-semibold mb-2">Suspicion Score</h3>
            <div class="flex items-center gap-4">
              <Badge
                :variant="getScoreBadgeVariant(selectedAccountData.suspicion_score)"
                class="text-2xl px-4 py-2"
              >
                {{ selectedAccountData.suspicion_score }} / 100
              </Badge>
              <div class="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full transition-all"
                  :class="getScoreBarColor(selectedAccountData.suspicion_score)"
                  :style="{ width: `${selectedAccountData.suspicion_score}%` }"
                />
              </div>
            </div>
          </div>

          <!-- Evidence Details -->
          <div>
            <h3 class="font-semibold mb-2">Evidence</h3>
            <div class="space-y-2">
              <Alert v-if="selectedAccountData.evidence.shared_ip_accounts">
                <Users class="h-4 w-4" />
                <AlertTitle>Shared IP Accounts</AlertTitle>
                <AlertDescription>
                  {{ selectedAccountData.evidence.shared_ip_accounts }} other account(s) share IP address(es) with this account
                </AlertDescription>
              </Alert>

              <Alert v-if="selectedAccountData.evidence.overlapping_sessions && selectedAccountData.evidence.overlapping_sessions > 0" variant="destructive">
                <Clock class="h-4 w-4" />
                <AlertTitle>Overlapping Sessions</AlertTitle>
                <AlertDescription>
                  {{ selectedAccountData.evidence.overlapping_sessions }} instance(s) of concurrent logins from the same IP
                </AlertDescription>
              </Alert>

              <Alert v-if="selectedAccountData.evidence.rapid_switches && selectedAccountData.evidence.rapid_switches > 0" variant="destructive">
                <Zap class="h-4 w-4" />
                <AlertTitle>Rapid Account Switching</AlertTitle>
                <AlertDescription>
                  {{ selectedAccountData.evidence.rapid_switches }} rapid switch(es) detected (login within 5 minutes of another account's logout)
                </AlertDescription>
              </Alert>

              <Alert v-if="selectedAccountData.evidence.total_ips_used && selectedAccountData.evidence.total_ips_used > 1">
                <Globe class="h-4 w-4" />
                <AlertTitle>IP Addresses Used</AlertTitle>
                <AlertDescription>
                  This account has connected from {{ selectedAccountData.evidence.total_ips_used }} different IP address(es)
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <!-- Gemini AI Analysis -->
          <div v-if="selectedAccountData.evidence.gemini_confidence">
            <h3 class="font-semibold mb-2 flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-purple-500" />
              AI Analysis Results
            </h3>
            <div class="space-y-3">
              <Alert class="border-purple-500/50 bg-purple-950/20">
                <AlertTitle class="flex items-center gap-2">
                  <Badge variant="outline" class="text-purple-400 border-purple-400">
                    {{ selectedAccountData.evidence.gemini_confidence }}% Confidence
                  </Badge>
                  Recommended Action: {{ selectedAccountData.evidence.gemini_action }}
                </AlertTitle>
                <AlertDescription class="mt-2 space-y-2">
                  <div v-if="selectedAccountData.evidence.gemini_reasons?.length">
                    <p class="text-xs font-medium">Reasons:</p>
                    <ul class="list-disc list-inside text-sm">
                      <li v-for="(reason, idx) in selectedAccountData.evidence.gemini_reasons" :key="idx">
                        {{ reason }}
                      </li>
                    </ul>
                  </div>
                  <div v-if="selectedAccountData.evidence.gemini_evidence?.length">
                    <p class="text-xs font-medium mt-2">Evidence:</p>
                    <ul class="list-disc list-inside text-sm">
                      <li v-for="(evidence, idx) in selectedAccountData.evidence.gemini_evidence" :key="idx">
                        {{ evidence }}
                      </li>
                    </ul>
                  </div>
                  <div v-if="selectedAccountData.evidence.gemini_analyzed_at" class="text-xs text-muted-foreground mt-2">
                    Analyzed at: {{ new Date(selectedAccountData.evidence.gemini_analyzed_at).toLocaleString() }}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <!-- Suspicious IPs -->
          <div v-if="selectedAccountData.evidence.suspicious_ips?.length > 0">
            <h3 class="font-semibold mb-2">Suspicious IP Addresses</h3>
            <div class="space-y-2">
              <div
                v-for="ip in selectedAccountData.evidence.suspicious_ips"
                :key="ip"
                class="flex items-center gap-2 p-2 rounded border"
              >
                <code class="font-mono text-sm">{{ ip }}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  @click="viewIPDetails(ip)"
                >
                  View Details
                </Button>
              </div>
            </div>
          </div>

          <!-- Connection Timeline -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-semibold">Connection Timeline</h3>
              <Button
                variant="outline"
                size="sm"
                @click="loadTimeline"
                :disabled="timelineLoading"
              >
                <RefreshCw class="h-4 w-4 mr-2" :class="{ 'animate-spin': timelineLoading }" />
                Refresh
              </Button>
            </div>

            <div v-if="timelineLoading" class="flex items-center justify-center py-8">
              <Loader2 class="h-8 w-8 animate-spin" />
            </div>

            <div v-else-if="timeline.length > 0" class="space-y-2 max-h-64 overflow-y-auto">
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
                    <code class="font-mono">{{ event.ip_address }}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Resolve Dialog -->
    <Dialog v-model:open="resolveDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Reviewed</DialogTitle>
          <DialogDescription>
            Mark this account flag as reviewed. Add notes about your findings.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="notes">Review Notes</Label>
            <Textarea
              id="notes"
              v-model="reviewNotes"
              placeholder="Enter your review notes (optional)..."
              rows="4"
            />
          </div>

          <div class="flex gap-2 justify-end">
            <Button variant="outline" @click="resolveDialogOpen = false">
              Cancel
            </Button>
            <Button @click="resolveAccount" :disabled="isResolving">
              <Loader2 v-if="isResolving" class="h-4 w-4 mr-2 animate-spin" />
              <CheckCircle v-else class="h-4 w-4 mr-2" />
              Mark Reviewed
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Globe,
  Info,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  Users,
  Zap,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { frontendConfiguration } from '@/config/environment'

const router = useRouter()
const API_URL = frontendConfiguration.apiUrl

// State
const suspiciousAccounts = ref<any[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const showResolved = ref(false)

// Details Dialog
const detailsDialogOpen = ref(false)
const selectedAccount = ref('')
const selectedAccountData = ref<any>(null)
const timeline = ref<any[]>([])
const timelineLoading = ref(false)

// Resolve Dialog
const resolveDialogOpen = ref(false)
const reviewNotes = ref('')
const isResolving = ref(false)

// Computed
const unreviewedCount = computed(
  () => suspiciousAccounts.value.filter((a) => !a.is_resolved).length,
)

const reviewedCount = computed(() => suspiciousAccounts.value.filter((a) => a.is_resolved).length)

// Fetch suspicious accounts
const fetchSuspiciousAccounts = async () => {
  isLoading.value = true
  error.value = null

  try {
    const response = await axios.get(
      `${API_URL}/api/admin/connections/suspicious?includeResolved=${showResolved.value}`,
      { withCredentials: true },
    )
    suspiciousAccounts.value = response.data.data
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to fetch suspicious accounts'
    console.error('Fetch error:', err)
  } finally {
    isLoading.value = false
  }
}

// View account details
const viewAccountDetails = async (accountName: string) => {
  selectedAccount.value = accountName
  selectedAccountData.value = suspiciousAccounts.value.find((a) => a.account_name === accountName)
  detailsDialogOpen.value = true

  // Load timeline
  await loadTimeline()
}

// Load timeline
const loadTimeline = async () => {
  if (!selectedAccount.value) return

  timelineLoading.value = true
  try {
    const response = await axios.get(
      `${API_URL}/api/admin/connections/account/${selectedAccount.value}`,
      { withCredentials: true },
    )
    timeline.value = response.data.data
  } catch (err) {
    console.error('Load timeline error:', err)
  } finally {
    timelineLoading.value = false
  }
}

// Open resolve dialog
const openResolveDialog = (accountName: string) => {
  selectedAccount.value = accountName
  reviewNotes.value = ''
  resolveDialogOpen.value = true
}

// Resolve account
const resolveAccount = async () => {
  if (!selectedAccount.value) return

  isResolving.value = true
  try {
    await axios.post(
      `${API_URL}/api/admin/connections/resolve/${selectedAccount.value}`,
      { notes: reviewNotes.value || undefined },
      { withCredentials: true },
    )

    // Refresh list
    await fetchSuspiciousAccounts()

    // Close dialog
    resolveDialogOpen.value = false

    // Show success (you could add a toast here)
    console.log('Account marked as reviewed')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to resolve account'
    console.error('Resolve error:', err)
  } finally {
    isResolving.value = false
  }
}

// View IP details (navigate to connection logs with IP filter)
const viewIPDetails = (ip: string) => {
  router.push(`/admin/connections/logs?ip=${ip}`)
}

// Get score badge variant
const getScoreBadgeVariant = (score: number) => {
  if (score >= 90) return 'destructive'
  if (score >= 70) return 'default'
  return 'secondary'
}

// Get score bar color
const getScoreBarColor = (score: number) => {
  if (score >= 90) return 'bg-destructive'
  if (score >= 70) return 'bg-amber-500'
  return 'bg-green-500'
}

// Get classification label based on evidence
const getClassificationLabel = (evidence: any) => {
  // Check for Gemini AI classification
  if (evidence.gemini_confidence) {
    if (
      evidence.gemini_reasons?.some(
        (r: string) =>
          r.toLowerCase().includes('overlapping') || r.toLowerCase().includes('simultaneous'),
      )
    ) {
      return 'Multiplay'
    }
    if (
      evidence.gemini_reasons?.some(
        (r: string) => r.toLowerCase().includes('cluster') || r.toLowerCase().includes('shared ip'),
      )
    ) {
      return 'IP Sharing'
    }
    return 'AI Flagged'
  }

  // Rule-based classification
  if (evidence.overlapping_sessions > 0) {
    return 'Multiplay'
  }
  if (evidence.shared_ip_accounts > 2) {
    return 'IP Cluster'
  }
  if (evidence.rapid_switches > 0) {
    return 'Spying'
  }
  if (evidence.shared_ip_accounts > 0) {
    return 'IP Sharing'
  }

  return 'Suspicious'
}

// Format timestamp
const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString()
}

// Lifecycle
onMounted(() => {
  fetchSuspiciousAccounts()
})
</script>
