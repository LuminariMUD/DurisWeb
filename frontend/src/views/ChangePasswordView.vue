<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { authApi } from '@/services/api'
import { Loader2, KeyRound, AlertCircle } from 'lucide-vue-next'

const router = useRouter()
const { success } = useToast()
const { clearAuthenticatedState } = useAuth()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  error.value = null

  // Validation
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    error.value = 'All fields are required'
    return
  }

  if (newPassword.value.length < 6) {
    error.value = 'New password must be at least 6 characters'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'New passwords do not match'
    return
  }

  if (currentPassword.value === newPassword.value) {
    error.value = 'New password must be different from current password'
    return
  }

  isLoading.value = true

  try {
    await authApi.changePassword(currentPassword.value, newPassword.value)
    clearAuthenticatedState()
    success('Password changed successfully', 'Success')
    router.push('/login')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to change password'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="container mx-auto flex items-center justify-center min-h-[80vh] px-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1">
        <div class="flex items-center gap-2">
          <KeyRound class="h-6 w-6" />
          <CardTitle class="text-2xl">Change Password</CardTitle>
        </div>
        <CardDescription>
          Enter your current password and choose a new one
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <Alert v-if="error" variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>

          <div class="space-y-2">
            <Label for="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              v-model="currentPassword"
              type="password"
              placeholder="Enter your current password"
              :disabled="isLoading"
            />
          </div>

          <div class="space-y-2">
            <Label for="newPassword">New Password</Label>
            <Input
              id="newPassword"
              v-model="newPassword"
              type="password"
              placeholder="Enter your new password"
              :disabled="isLoading"
            />
          </div>

          <div class="space-y-2">
            <Label for="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              placeholder="Confirm your new password"
              :disabled="isLoading"
            />
          </div>

          <div class="flex gap-3">
            <Button
              type="button"
              variant="outline"
              class="flex-1"
              :disabled="isLoading"
              @click="router.back()"
            >
              Cancel
            </Button>
            <Button type="submit" class="flex-1" :disabled="isLoading">
              <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ isLoading ? 'Changing...' : 'Change Password' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
