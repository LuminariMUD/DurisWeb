<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMudStore } from '@/stores/mudStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const { changeEmail, confirmEmail } = useMudConnection()
const store = useMudStore()
const newEmail = ref('')
const code = ref('')
const busy = computed(() => ['requesting', 'confirming'].includes(store.emailVerificationState))
const validEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.value))

watch(
  () => store.emailVerificationState,
  (state) => {
    if (state === 'verified') {
      code.value = ''
      newEmail.value = ''
    }
  },
)

const requestCode = () => {
  if (validEmail.value && !busy.value) changeEmail(newEmail.value.trim())
}
const verifyCode = () => {
  if (!code.value.trim() || busy.value) return
  confirmEmail(code.value.trim())
  code.value = ''
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Verify Email Address</CardTitle>
      <CardDescription>
        Add an address, replace an outdated one, or verify your current inbox for password recovery.
        Your registered address changes only after you enter the emailed code.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p>Registered email: {{ store.accountInfo?.email || 'Not set' }}</p>
      <Alert v-if="store.emailVerificationState === 'requested'" role="status">
        <AlertDescription>
          Check your inbox and spam folder. The code works once, expires in 15 minutes, and is
          lost if the game restarts. You can request another after 10 minutes.
        </AlertDescription>
      </Alert>
      <Alert v-if="store.emailVerificationState === 'verified'" role="status">
        <AlertDescription>Email verified and saved. Password recovery can now use this inbox.</AlertDescription>
      </Alert>
      <Alert v-if="store.accountError" variant="destructive" role="alert">
        <AlertDescription>{{ store.accountError }}</AlertDescription>
      </Alert>
      <form class="space-y-3" @submit.prevent="requestCode">
        <Label for="new-email">Email address</Label>
        <Input id="new-email" v-model="newEmail" type="email" autocomplete="email" :disabled="busy" />
        <Button type="submit" :disabled="!validEmail || busy">Send verification code</Button>
      </form>
      <form class="space-y-3" @submit.prevent="verifyCode">
        <Label for="email-code">Code from your inbox</Label>
        <Input id="email-code" v-model="code" autocomplete="one-time-code" :spellcheck="false" :disabled="busy" />
        <Button type="submit" :disabled="!code.trim() || busy">Verify and save email</Button>
      </form>
      <p class="text-sm text-muted-foreground">
        If a code does not arrive, check spam and try again after 10 minutes. If you cannot access
        the registered inbox and cannot log in, contact staff for a manual identity check.
      </p>
    </CardContent>
  </Card>
</template>
