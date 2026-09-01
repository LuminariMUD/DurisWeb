<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useMudStore } from '@/stores/mudStore'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  User,
  Plus,
  LogOut,
  Play,
  Trash2,
  Mail,
  Key,
  Battery,
  Info,
  AlertTriangle,
} from 'lucide-vue-next'
import type { MudCharacterInfo } from '@/types/mud'
import AccountInfoPanel from './account/AccountInfoPanel.vue'
import ChangeEmailForm from './account/ChangeEmailForm.vue'
import ChangePasswordForm from './account/ChangePasswordForm.vue'
import DeleteCharacterDialog from './account/DeleteCharacterDialog.vue'
import RestedBonusPanel from './account/RestedBonusPanel.vue'

const emit = defineEmits<{
  (e: 'entered'): void
  (e: 'createNew'): void
  (e: 'logout'): void
}>()

const { enterWorld, disconnect, getAccountInfo, getRestedBonus } = useMudConnection()
const store = useMudStore()

const activeTab = ref('characters')
const characterToDelete = ref<MudCharacterInfo | null>(null)
const showDeleteDialog = ref(false)

const characters = computed(() => store.characters)
const account = computed(() => store.account)
const accountError = computed(() => store.accountError)

// Load account info and rested bonus when component mounts
// Note: Staggered timing to avoid C server race condition with concurrent commands
onMounted(() => {
  setTimeout(() => getAccountInfo(), 100)
  setTimeout(() => getRestedBonus(), 300)
})

const handleEnterWorld = (character: MudCharacterInfo) => {
  enterWorld(character.name)
  emit('entered')
}

const handleCreateNew = () => {
  emit('createNew')
}

const handleLogout = () => {
  disconnect()
  emit('logout')
}

const handleDeleteCharacter = (char: MudCharacterInfo) => {
  characterToDelete.value = char
  showDeleteDialog.value = true
}

const handleDeleteConfirmed = () => {
  showDeleteDialog.value = false
  characterToDelete.value = null
}
</script>

<template>
  <Card class="w-full max-w-4xl mx-auto">
    <CardHeader class="p-4 lg:p-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <CardTitle class="text-xl lg:text-2xl">{{ account }}'s Account</CardTitle>
          <CardDescription class="text-xs lg:text-sm">Manage your account and characters</CardDescription>
        </div>
        <Button variant="destructive" size="sm" @click="handleLogout">
          <LogOut class="h-4 w-4 mr-2" />
          Disconnect
        </Button>
      </div>
    </CardHeader>
    <CardContent class="p-4 lg:p-6 pt-0">
      <!-- Error Alert -->
      <Alert v-if="accountError" variant="destructive" class="mb-4">
        <AlertTriangle class="h-4 w-4" />
        <AlertDescription>{{ accountError }}</AlertDescription>
      </Alert>

      <Tabs v-model="activeTab">
        <TabsList class="grid w-full grid-cols-5">
          <TabsTrigger value="characters" class="px-2 lg:px-4">
            <User class="h-4 w-4 lg:mr-2" />
            <span class="hidden lg:inline">Characters</span>
          </TabsTrigger>
          <TabsTrigger value="info" class="px-2 lg:px-4">
            <Info class="h-4 w-4 lg:mr-2" />
            <span class="hidden lg:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="rested" class="px-2 lg:px-4">
            <Battery class="h-4 w-4 lg:mr-2" />
            <span class="hidden lg:inline">Rested</span>
          </TabsTrigger>
          <TabsTrigger value="email" class="px-2 lg:px-4">
            <Mail class="h-4 w-4 lg:mr-2" />
            <span class="hidden lg:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="password" class="px-2 lg:px-4">
            <Key class="h-4 w-4 lg:mr-2" />
            <span class="hidden lg:inline">Password</span>
          </TabsTrigger>
        </TabsList>

        <!-- Characters Tab -->
        <TabsContent value="characters" class="mt-3 lg:mt-4">
          <ScrollArea class="h-[280px] lg:h-[350px] pr-2 lg:pr-4">
            <div v-if="characters.length === 0" class="text-center py-6 lg:py-8 text-muted-foreground">
              <User class="h-10 w-10 lg:h-12 lg:w-12 mx-auto mb-3 lg:mb-4 opacity-50" />
              <p class="text-sm lg:text-base">You don't have any characters yet.</p>
              <p class="text-xs lg:text-sm">Create your first character to begin your adventure!</p>
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="char in characters"
                :key="char.name"
                class="group relative rounded-lg border p-3 lg:p-4 hover:bg-accent/50 transition-colors"
              >
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <!-- Character info - clickable to enter -->
                  <div class="flex items-center gap-3 lg:gap-4 cursor-pointer flex-1" @click="handleEnterWorld(char)">
                    <div class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                      <User class="h-5 w-5 lg:h-6 lg:w-6 text-primary" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <h3 class="font-semibold text-base lg:text-lg">{{ char.name }}</h3>
                        <Badge variant="secondary" class="text-xs">
                          <span v-html="parseAnsiToHtml(char.class || '')"></span>
                        </Badge>
                      </div>
                      <div class="flex items-center gap-2 text-xs lg:text-sm text-muted-foreground">
                        <span>Level {{ char.level }}</span>
                        <span v-html="parseAnsiToHtml(char.race || '')"></span>
                      </div>
                      <div v-if="char.lastRoom" class="text-xs text-muted-foreground truncate mt-0.5" v-html="parseAnsiToHtml(char.lastRoom)">
                      </div>
                    </div>
                  </div>
                  <!-- Action buttons - full width on mobile -->
                  <div class="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                    <Button class="flex-1 lg:flex-none" size="sm" variant="default" @click="handleEnterWorld(char)">
                      <Play class="h-4 w-4 mr-1" />
                      Enter
                    </Button>
                    <Button size="sm" variant="destructive" @click="handleDeleteCharacter(char)">
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <Separator class="my-3 lg:my-4" />

          <Button variant="outline" class="w-full" @click="handleCreateNew">
            <Plus class="h-4 w-4 mr-2" />
            Create New Character
          </Button>
        </TabsContent>

        <!-- Account Info Tab -->
        <TabsContent value="info" class="mt-3 lg:mt-4">
          <ScrollArea class="h-[280px] lg:h-[350px]">
            <AccountInfoPanel />
          </ScrollArea>
        </TabsContent>

        <!-- Rested Bonus Tab -->
        <TabsContent value="rested" class="mt-3 lg:mt-4">
          <ScrollArea class="h-[280px] lg:h-[350px]">
            <RestedBonusPanel />
          </ScrollArea>
        </TabsContent>

        <!-- Change Email Tab -->
        <TabsContent value="email" class="mt-3 lg:mt-4">
          <ScrollArea class="h-[280px] lg:h-[350px]">
            <ChangeEmailForm />
          </ScrollArea>
        </TabsContent>

        <!-- Change Password Tab -->
        <TabsContent value="password" class="mt-3 lg:mt-4">
          <ScrollArea class="h-[280px] lg:h-[350px]">
            <ChangePasswordForm />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <!-- Delete Account (disabled) -->
      <div class="mt-3 lg:mt-4 pt-3 lg:pt-4 border-t">
        <Button variant="outline" class="w-full text-xs lg:text-sm" disabled>
          <Trash2 class="h-4 w-4 mr-2" />
          Delete Account (Coming Soon)
        </Button>
      </div>

      <!-- Delete Character Dialog -->
      <DeleteCharacterDialog
        v-if="characterToDelete"
        :character="characterToDelete"
        :open="showDeleteDialog"
        @close="showDeleteDialog = false"
        @deleted="handleDeleteConfirmed"
      />
    </CardContent>
  </Card>
</template>
