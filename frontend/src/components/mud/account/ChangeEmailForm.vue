<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMudStore } from '@/stores/mudStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, Check, AlertTriangle } from 'lucide-vue-next'

const { changeEmail } = useMudConnection()
const store = useMudStore()

const newEmail = ref('')
const confirmEmail = ref('')
const isLoading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

const currentEmail = computed(() => store.accountInfo?.email || 'Not set')

const isValid = computed(() => {
  if (!newEmail.value || !confirmEmail.value) return false
  if (newEmail.value !== confirmEmail.value) return false
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(newEmail.value)
})

const handleSubmit = async () => {
  if (!isValid.value) return

  errorMessage.value = ''
  successMessage.value = ''
  isLoading.value = true

  try {
    changeEmail(newEmail.value)
    // Success will be handled by the store when server responds
    successMessage.value = 'Email change request sent...'
    // Reset form after successful submission
    setTimeout(() => {
      if (!store.accountError) {
        newEmail.value = ''
        confirmEmail.value = ''
        successMessage.value = 'Email updated successfully!'
      }
    }, 1000)
  } catch {
    errorMessage.value = 'Failed to send email change request'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Mail class="h-5 w-5" />
        Change Email Address
      </CardTitle>
      <CardDescription>
        Update your registered email address
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <Label class="text-muted-foreground">Current Email</Label>
          <p class="font-medium">{{ currentEmail }}</p>
        </div>

        <div class="space-y-2">
          <Label for="new-email">New Email Address</Label>
          <Input
            id="new-email"
            v-model="newEmail"
            type="email"
            placeholder="Enter new email address"
            :disabled="isLoading"
          />
        </div>

        <div class="space-y-2">
          <Label for="confirm-email">Confirm Email Address</Label>
          <Input
            id="confirm-email"
            v-model="confirmEmail"
            type="email"
            placeholder="Confirm new email address"
            :disabled="isLoading"
          />
          <p
            v-if="confirmEmail && newEmail !== confirmEmail"
            class="text-sm text-destructive"
          >
            Email addresses do not match
          </p>
        </div>

        <Alert v-if="successMessage" class="bg-green-500/10 border-green-500">
          <Check class="h-4 w-4 text-green-500" />
          <AlertDescription class="text-green-500">{{ successMessage }}</AlertDescription>
        </Alert>

        <Alert v-if="errorMessage" variant="destructive">
          <AlertTriangle class="h-4 w-4" />
          <AlertDescription>{{ errorMessage }}</AlertDescription>
        </Alert>

        <Button
          type="submit"
          :disabled="!isValid || isLoading"
          class="w-full"
        >
          <Mail class="h-4 w-4 mr-2" />
          {{ isLoading ? 'Updating...' : 'Update Email' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
