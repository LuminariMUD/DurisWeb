<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/composables/useAuth'
import { requestAccountExport } from '@/services/accountExport'

const { accountName } = useAuth()
const password = ref('')
const busy = ref(false)
const error = ref('')
const status = ref('')
let pending: AbortController | undefined

function cancel() {
  pending?.abort()
  pending = undefined
  password.value = ''
  busy.value = false
  error.value = ''
  status.value = ''
}
watch(accountName, cancel)
onBeforeUnmount(cancel)

async function download() {
  if (!accountName.value || busy.value || !password.value) return
  const account = accountName.value
  const controller = new AbortController()
  pending = controller
  busy.value = true
  error.value = ''
  status.value = ''
  const suppliedPassword = password.value
  password.value = ''
  try {
    const blob = await requestAccountExport(suppliedPassword, account, controller.signal)
    if (pending !== controller || controller.signal.aborted || accountName.value !== account) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'duris-website-data.json'
    try {
      document.body.append(link)
      link.click()
    } finally {
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    status.value =
      'Your download has started. It includes selected website data; see its list of omitted information.'
  } catch (failure) {
    if (pending === controller && !controller.signal.aborted)
      error.value =
        failure instanceof Error ? failure.message : 'Your download could not be completed.'
  } finally {
    if (pending === controller) {
      pending = undefined
      busy.value = false
    }
  }
}
</script>

<template>
  <section aria-labelledby="account-data-heading" class="space-y-4 border border-border bg-card p-4 sm:p-6">
    <h2 id="account-data-heading" class="text-2xl">Download your website data</h2>
    <p class="text-muted-foreground">Get your profile, community activity records, subscriptions, votes and notification status in a JSON file. This is a partial copy: messages and post text, game data, images, staff records and external-service data need a separate request through the contact below.</p>
    <form v-if="accountName" class="space-y-4" @submit.prevent="download">
      <p>Signed in as <strong>{{ accountName }}</strong>. Enter your current account password to verify this download.</p>
      <div class="space-y-2">
        <Label for="export-password">Current password</Label>
        <Input id="export-password" v-model="password" type="password" autocomplete="current-password" :maxlength="1024" :disabled="busy" required />
      </div>
      <Button type="submit" :disabled="busy || !password" class="min-h-11">{{ busy ? 'Preparing your download…' : 'Download website data' }}</Button>
      <p class="text-sm text-muted-foreground">The file may contain personal information. Save it somewhere private. This download does not remove your account.</p>
    </form>
    <p v-else><RouterLink to="/login" class="underline underline-offset-4">Sign in</RouterLink> to download your selected website data. You can also contact us below for an assisted request.</p>
    <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    <p v-if="status" role="status" aria-live="polite" class="text-muted-foreground">{{ status }}</p>
  </section>
</template>
