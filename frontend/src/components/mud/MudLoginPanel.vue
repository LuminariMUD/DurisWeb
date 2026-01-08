<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMudStore } from '@/stores/mudStore'
import { useAuth } from '@/composables/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'authenticated'): void
}>()

const { login, register } = useMudConnection()
const store = useMudStore()
const { accountName: webAccountName, isAuthenticated: isWebAuthenticated, storeMudCredentials } = useAuth()

// Login form
const loginAccount = ref('')
const loginPassword = ref('')
const loginError = ref('')

// Register form
const registerAccount = ref('')
const registerPassword = ref('')
const registerConfirmPassword = ref('')
const registerEmail = ref('')
const registerError = ref('')

// Use store directly for reactive state
const isLoading = computed(() => store.connectionState === 'authenticating')
const connectionError = computed(() => store.connectionError)

const validateLogin = () => {
  loginError.value = ''

  if (!loginAccount.value.trim()) {
    loginError.value = 'Account name is required'
    return false
  }

  if (!loginPassword.value) {
    loginError.value = 'Password is required'
    return false
  }

  return true
}

const validateRegister = () => {
  registerError.value = ''

  if (!registerAccount.value.trim()) {
    registerError.value = 'Account name is required'
    return false
  }

  if (registerAccount.value.length < 3) {
    registerError.value = 'Account name must be at least 3 characters'
    return false
  }

  if (!/^[a-zA-Z0-9_]+$/.test(registerAccount.value)) {
    registerError.value = 'Account name can only contain letters, numbers, and underscores'
    return false
  }

  if (!registerPassword.value) {
    registerError.value = 'Password is required'
    return false
  }

  if (registerPassword.value.length < 6) {
    registerError.value = 'Password must be at least 6 characters'
    return false
  }

  if (registerPassword.value !== registerConfirmPassword.value) {
    registerError.value = 'Passwords do not match'
    return false
  }

  if (!registerEmail.value.trim()) {
    registerError.value = 'Email is required'
    return false
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerEmail.value)) {
    registerError.value = 'Please enter a valid email address'
    return false
  }

  return true
}

const handleLogin = () => {
  if (!validateLogin()) return
  // store credentials for copyover auto-reconnect
  storeMudCredentials(loginAccount.value, loginPassword.value)
  login(loginAccount.value, loginPassword.value)
}

const handleRegister = () => {
  if (!validateRegister()) return
  // store credentials for copyover auto-reconnect
  storeMudCredentials(registerAccount.value, registerPassword.value)
  register(registerAccount.value, registerPassword.value, registerEmail.value)
}

// Watch for successful authentication
watch(() => store.isAuthenticated, (isAuth) => {
  if (isAuth) {
    emit('authenticated')
  }
}, { immediate: true })

// Auto-login if we have stored credentials
onMounted(async () => {
  const { getMudCredentials } = useAuth()
  const creds = getMudCredentials()

  // skip auto-login if already in progress (prevents duplicate attempts on remount)
  if (store.autoLoginInProgress) {
    return
  }

  // skip auto-login if reconnect dialog is showing (let user decide)
  if (store.showReconnectDialog) {
    return
  }

  if (creds) {
    loginAccount.value = creds.account
    loginPassword.value = creds.password
    // Show "Logging in..." immediately
    store.setAutoLoginInProgress(true)
    store.setConnectionState('authenticating')
    // Wait for Vue to finish updating DOM before sending login
    // This ensures the WebSocket message queue is flushed
    await nextTick()
    // Small delay to ensure MUD's WebSocket handler is ready after sending welcome
    await new Promise(resolve => setTimeout(resolve, 50))
    login(creds.account, creds.password)
  } else if (isWebAuthenticated.value && webAccountName.value) {
    loginAccount.value = webAccountName.value
  }
})
</script>

<template>
  <Card class="w-full max-w-md mx-auto">
    <CardHeader class="text-center">
      <CardTitle class="text-2xl font-bold text-primary">NewDuris MUD</CardTitle>
      <CardDescription>Enter the realm of NewDuris</CardDescription>
    </CardHeader>
    <CardContent>
      <Tabs default-value="login" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
        </TabsList>

        <TabsContent value="login" class="space-y-4">
          <form @submit.prevent="handleLogin" class="space-y-4">
            <div class="space-y-2">
              <Label for="login-account">Account Name</Label>
              <Input
                id="login-account"
                v-model="loginAccount"
                type="text"
                placeholder="Enter your account name"
                :disabled="isLoading"
                autocomplete="username"
              />
            </div>

            <div class="space-y-2">
              <Label for="login-password">Password</Label>
              <Input
                id="login-password"
                v-model="loginPassword"
                type="password"
                placeholder="Enter your password"
                :disabled="isLoading"
                autocomplete="current-password"
              />
            </div>

            <Alert v-if="loginError || connectionError" variant="destructive">
              <AlertCircle class="h-4 w-4" />
              <AlertDescription>{{ loginError || connectionError }}</AlertDescription>
            </Alert>

            <Button type="submit" class="w-full" :disabled="isLoading">
              <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ isLoading ? 'Logging in...' : 'Login' }}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="register" class="space-y-4">
          <form @submit.prevent="handleRegister" class="space-y-4">
            <div class="space-y-2">
              <Label for="register-account">Account Name</Label>
              <Input
                id="register-account"
                v-model="registerAccount"
                type="text"
                placeholder="Choose an account name"
                :disabled="isLoading"
                autocomplete="username"
              />
            </div>

            <div class="space-y-2">
              <Label for="register-email">Email</Label>
              <Input
                id="register-email"
                v-model="registerEmail"
                type="email"
                placeholder="Enter your email"
                :disabled="isLoading"
                autocomplete="email"
              />
            </div>

            <div class="space-y-2">
              <Label for="register-password">Password</Label>
              <Input
                id="register-password"
                v-model="registerPassword"
                type="password"
                placeholder="Choose a password"
                :disabled="isLoading"
                autocomplete="new-password"
              />
            </div>

            <div class="space-y-2">
              <Label for="register-confirm">Confirm Password</Label>
              <Input
                id="register-confirm"
                v-model="registerConfirmPassword"
                type="password"
                placeholder="Confirm your password"
                :disabled="isLoading"
                autocomplete="new-password"
              />
            </div>

            <Alert v-if="registerError || connectionError" variant="destructive">
              <AlertCircle class="h-4 w-4" />
              <AlertDescription>{{ registerError || connectionError }}</AlertDescription>
            </Alert>

            <Button type="submit" class="w-full" :disabled="isLoading">
              <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ isLoading ? 'Creating account...' : 'Create Account' }}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
</template>
