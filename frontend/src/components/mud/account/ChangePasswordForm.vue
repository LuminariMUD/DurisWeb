<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMudStore } from '@/stores/mudStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Key, Check, AlertTriangle, Eye, EyeOff } from 'lucide-vue-next'

const { changePassword } = useMudConnection()
const store = useMudStore()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

const isValid = computed(() => {
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) return false
  if (newPassword.value !== confirmPassword.value) return false
  if (newPassword.value.length < 6) return false
  return true
})

const handleSubmit = async () => {
  if (!isValid.value) return

  errorMessage.value = ''
  successMessage.value = ''
  isLoading.value = true

  try {
    changePassword(currentPassword.value, newPassword.value)
    successMessage.value = 'Password change request sent...'
    // Reset form after successful submission
    setTimeout(() => {
      if (!store.accountError) {
        currentPassword.value = ''
        newPassword.value = ''
        confirmPassword.value = ''
        successMessage.value = 'Password changed successfully!'
      }
    }, 1000)
  } catch {
    errorMessage.value = 'Failed to send password change request'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Key class="h-5 w-5" />
        Change Password
      </CardTitle>
      <CardDescription>
        Update your account password
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="space-y-2">
          <Label for="current-password">Current Password</Label>
          <div class="relative">
            <Input
              id="current-password"
              v-model="currentPassword"
              :type="showCurrentPassword ? 'text' : 'password'"
              placeholder="Enter current password"
              :disabled="isLoading"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="absolute right-0 top-0 h-full px-3"
              @click="showCurrentPassword = !showCurrentPassword"
            >
              <Eye v-if="!showCurrentPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="new-password">New Password</Label>
          <div class="relative">
            <Input
              id="new-password"
              v-model="newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              placeholder="Enter new password"
              :disabled="isLoading"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="absolute right-0 top-0 h-full px-3"
              @click="showNewPassword = !showNewPassword"
            >
              <Eye v-if="!showNewPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </Button>
          </div>
          <p
            v-if="newPassword && newPassword.length < 6"
            class="text-sm text-destructive"
          >
            Password must be at least 6 characters
          </p>
        </div>

        <div class="space-y-2">
          <Label for="confirm-password">Confirm New Password</Label>
          <div class="relative">
            <Input
              id="confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="Confirm new password"
              :disabled="isLoading"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="absolute right-0 top-0 h-full px-3"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <Eye v-if="!showConfirmPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </Button>
          </div>
          <p
            v-if="confirmPassword && newPassword !== confirmPassword"
            class="text-sm text-destructive"
          >
            Passwords do not match
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
          <Key class="h-4 w-4 mr-2" />
          {{ isLoading ? 'Changing...' : 'Change Password' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
