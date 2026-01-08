<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useAuth } from '@/composables/useAuth'

useHead({
  title: 'DurisMUD | Login'
})
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const router = useRouter()
const { login, isLoading, error } = useAuth()

const username = ref('')
const password = ref('')
const localError = ref<string | null>(null)

async function handleLogin() {
  localError.value = null

  // Basic validation
  if (!username.value || !password.value) {
    localError.value = 'Please enter both username and password'
    return
  }

  const success = await login(username.value, password.value)

  if (success) {
    // Redirect to forum or return URL
    const returnUrl = router.currentRoute.value.query.redirect as string
    router.push(returnUrl || '/forum')
  }
}

function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <div class="flex h-full items-center justify-center px-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1">
        <CardTitle class="text-2xl font-bold">Login to DurisMUD</CardTitle>
        <CardDescription>
          Enter your MUD account credentials to access the forums
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-4">
        <!-- Error Alert -->
        <Alert v-if="localError || error" variant="destructive">
          <AlertDescription>
            {{ localError || error }}
          </AlertDescription>
        </Alert>

        <!-- Username Field -->
        <div class="space-y-2">
          <Label for="username">Account Name</Label>
          <Input
            id="username"
            v-model="username"
            type="text"
            placeholder="Your MUD account name"
            autocomplete="username"
            @keypress="handleKeyPress"
            :disabled="isLoading"
          />
        </div>

        <!-- Password Field -->
        <div class="space-y-2">
          <Label for="password">Password</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            placeholder="Your MUD password"
            autocomplete="current-password"
            @keypress="handleKeyPress"
            :disabled="isLoading"
          />
        </div>

        <!-- Info Text -->
        <p class="text-sm text-muted-foreground">
          Use the same credentials you use to connect to the MUD game server.
        </p>
      </CardContent>

      <CardFooter class="flex flex-col space-y-3">
        <!-- Login Button -->
        <Button
          @click="handleLogin"
          :disabled="isLoading"
          class="w-full"
        >
          <span v-if="isLoading">Logging in...</span>
          <span v-else>Login</span>
        </Button>

        <!-- Back to Home -->
        <Button
          variant="ghost"
          @click="router.push('/')"
          :disabled="isLoading"
          class="w-full"
        >
          Back to Home
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
