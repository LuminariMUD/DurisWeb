<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMudStore } from '@/stores/mudStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const emit = defineEmits<{ close: [] }>()
const { requestReset, completeReset } = useMudConnection()
const store = useMudStore()
const account = ref('')
const code = ref('')
const password = ref('')
const confirmation = ref('')
const hasCode = ref(false)
const busy = computed(() => ['requesting', 'completing'].includes(store.recoveryState))
const showCode = computed(() => hasCode.value || store.recoveryState === 'requested')
const canReset = computed(
  () =>
    account.value.trim() &&
    code.value.trim() &&
    password.value.length >= 6 &&
    password.value === confirmation.value &&
    !busy.value,
)

const request = () => {
  if (account.value.trim() && !busy.value) requestReset(account.value.trim())
}
const reset = () => {
  if (!canReset.value) return
  completeReset(account.value.trim(), code.value.trim(), password.value)
  code.value = ''
  password.value = ''
  confirmation.value = ''
}
onUnmounted(() => {
  code.value = ''
  password.value = ''
  confirmation.value = ''
})
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">Recover account password</h2>
    <Alert v-if="store.recoveryState === 'completed'" role="status">
      <AlertDescription>Your password has been saved. Return to login and use your new password.</AlertDescription>
    </Alert>
    <template v-else>
      <p class="text-sm text-muted-foreground">
        Enter your MUD account name. If it has an accessible email on file, a reset code will be sent.
      </p>
      <form class="space-y-3" @submit.prevent="request">
        <Label for="recovery-account">Account name</Label>
        <Input id="recovery-account" v-model="account" autocomplete="username" :disabled="busy" />
        <Button type="submit" :disabled="!account.trim() || busy">Send reset code</Button>
      </form>
      <Alert v-if="store.recoveryState === 'requested'" role="status">
        <AlertDescription>
          If that account has an email on file, a code has been sent. Check your inbox and spam.
          Codes work once, expire after 15 minutes, and are lost at restart. Wait 10 minutes before
          requesting another. Delivery failures and unknown accounts receive the same response.
        </AlertDescription>
      </Alert>
      <Button v-if="!showCode" type="button" variant="ghost" @click="hasCode = true">I already have a code</Button>
      <form v-if="showCode" class="space-y-3" @submit.prevent="reset">
        <Label for="recovery-code">Code from your inbox</Label>
        <Input id="recovery-code" v-model="code" autocomplete="one-time-code" :spellcheck="false" :disabled="busy" />
        <Label for="recovery-password">New password (at least 6 characters)</Label>
        <Input id="recovery-password" v-model="password" type="password" autocomplete="new-password" :disabled="busy" />
        <Label for="recovery-confirmation">Confirm new password</Label>
        <Input id="recovery-confirmation" v-model="confirmation" type="password" autocomplete="new-password" :disabled="busy" />
        <Button type="submit" :disabled="!canReset">Save new password</Button>
      </form>
      <p class="text-sm text-muted-foreground">
        Cannot access the registered inbox? Contact staff for a manual identity check. If you can
        still log in, open Account → Email to verify a replacement address first.
      </p>
    </template>
    <Alert v-if="store.accountError" variant="destructive" role="alert">
      <AlertDescription>{{ store.accountError }}</AlertDescription>
    </Alert>
    <Button type="button" variant="ghost" :disabled="busy" @click="emit('close')">Return to login</Button>
  </div>
</template>
