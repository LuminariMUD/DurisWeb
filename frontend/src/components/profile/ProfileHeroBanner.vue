<script setup lang="ts">
import { ref, computed } from 'vue'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Camera, Trash2, Loader2, ImagePlus } from 'lucide-vue-next'
import { profileApi } from '@/services/api'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  accountName: string
  bio: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  location: string | null
  website: string | null
  createdAt: string
  isOwnProfile: boolean
  canEdit: boolean
}>()

const emit = defineEmits<{
  (e: 'avatarUpdated', url: string | null): void
  (e: 'bannerUpdated', url: string | null): void
  (e: 'editProfile'): void
}>()

const { success, error: showError } = useToast()

// Avatar upload state
const avatarInputRef = ref<HTMLInputElement | null>(null)
const isUploadingAvatar = ref(false)
const showDeleteAvatarDialog = ref(false)

// Banner upload state
const bannerInputRef = ref<HTMLInputElement | null>(null)
const isUploadingBanner = ref(false)
const showDeleteBannerDialog = ref(false)

const formattedDate = computed(() => {
  const date = new Date(props.createdAt)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
})

// Avatar functions
function triggerAvatarUpload() {
  avatarInputRef.value?.click()
}

async function handleAvatarSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    showError('Only JPG, PNG, WebP, and GIF images are allowed', 'Invalid file type')
    input.value = ''
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    showError('Image must be under 5MB', 'File too large')
    input.value = ''
    return
  }

  isUploadingAvatar.value = true
  try {
    let result
    if (props.isOwnProfile) {
      result = await profileApi.uploadAvatar(file)
    } else {
      result = await profileApi.uploadUserAvatar(props.accountName, file)
    }
    emit('avatarUpdated', result.avatarUrl)
    success('Profile picture updated successfully', 'Avatar updated')
  } catch (err: any) {
    showError(err.response?.data?.error || 'Failed to upload avatar', 'Upload failed')
  } finally {
    isUploadingAvatar.value = false
    input.value = ''
  }
}

async function deleteAvatar() {
  isUploadingAvatar.value = true
  try {
    if (props.isOwnProfile) {
      await profileApi.deleteAvatar()
    } else {
      await profileApi.deleteUserAvatar(props.accountName)
    }
    emit('avatarUpdated', null)
    success('Profile picture removed', 'Avatar removed')
  } catch (err: any) {
    showError(err.response?.data?.error || 'Failed to delete avatar', 'Delete failed')
  } finally {
    isUploadingAvatar.value = false
    showDeleteAvatarDialog.value = false
  }
}

// Banner functions
function triggerBannerUpload() {
  bannerInputRef.value?.click()
}

async function handleBannerSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    showError('Only JPG, PNG, WebP, and GIF images are allowed', 'Invalid file type')
    input.value = ''
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    showError('Image must be under 5MB', 'File too large')
    input.value = ''
    return
  }

  isUploadingBanner.value = true
  try {
    let result
    if (props.isOwnProfile) {
      result = await profileApi.uploadBanner(file)
    } else {
      result = await profileApi.uploadUserBanner(props.accountName, file)
    }
    emit('bannerUpdated', result.bannerUrl)
    success('Banner updated successfully', 'Banner updated')
  } catch (err: any) {
    showError(err.response?.data?.error || 'Failed to upload banner', 'Upload failed')
  } finally {
    isUploadingBanner.value = false
    input.value = ''
  }
}

async function deleteBanner() {
  isUploadingBanner.value = true
  try {
    if (props.isOwnProfile) {
      await profileApi.deleteBanner()
    } else {
      await profileApi.deleteUserBanner(props.accountName)
    }
    emit('bannerUpdated', null)
    success('Banner removed', 'Banner removed')
  } catch (err: any) {
    showError(err.response?.data?.error || 'Failed to delete banner', 'Delete failed')
  } finally {
    isUploadingBanner.value = false
    showDeleteBannerDialog.value = false
  }
}
</script>

<template>
  <div class="relative rounded-lg overflow-hidden">
    <!-- Banner Background with Profile Content Overlaid -->
    <div class="relative min-h-[200px] bg-gradient-to-r from-blue-900 to-purple-900">
      <!-- Banner Image -->
      <img
        v-if="bannerUrl"
        :src="bannerUrl"
        :alt="`${accountName}'s banner`"
        class="absolute inset-0 w-full h-full object-cover"
      />

      <!-- Dark overlay for text readability -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />

      <!-- Banner upload controls (top right) -->
      <div v-if="canEdit" class="absolute top-3 right-3 z-20 flex items-center gap-2">
        <button
          v-if="!isUploadingBanner"
          @click="triggerBannerUpload"
          class="flex items-center gap-2 px-3 py-1.5 bg-black/50 hover:bg-black/70 text-white text-sm rounded-md transition-colors"
        >
          <ImagePlus class="w-4 h-4" />
          <span>{{ bannerUrl ? 'Change Banner' : 'Add Banner' }}</span>
        </button>
        <button
          v-if="bannerUrl && !isUploadingBanner"
          @click="showDeleteBannerDialog = true"
          class="p-1.5 bg-destructive/80 hover:bg-destructive text-white rounded-md transition-colors"
          title="Remove banner"
        >
          <Trash2 class="w-4 h-4" />
        </button>
        <div v-if="isUploadingBanner" class="flex items-center gap-2 px-3 py-1.5 bg-black/50 text-white text-sm rounded-md">
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>Uploading...</span>
        </div>
      </div>

      <!-- Hidden banner file input -->
      <input
        ref="bannerInputRef"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="hidden"
        @change="handleBannerSelect"
      />

      <!-- Profile Content (overlaid on banner) -->
      <div class="relative z-10 px-6 py-6">
        <div class="flex items-center gap-6">
          <!-- Avatar -->
          <div class="relative group shrink-0">
            <div
              class="w-28 h-28 rounded-lg overflow-hidden bg-black/30 flex items-center justify-center border-2 border-white/20 shadow-lg"
              :class="{ 'cursor-pointer': canEdit && !isUploadingAvatar }"
              @click="canEdit && !isUploadingAvatar && triggerAvatarUpload()"
            >
              <img
                v-if="avatarUrl"
                :src="avatarUrl"
                :alt="accountName"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-5xl font-bold text-white/80">
                {{ accountName.charAt(0).toUpperCase() }}
              </span>

              <!-- Avatar loading overlay -->
              <div
                v-if="isUploadingAvatar"
                class="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg"
              >
                <Loader2 class="w-8 h-8 text-white animate-spin" />
              </div>

              <!-- Avatar hover overlay -->
              <div
                v-else-if="canEdit"
                class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
              >
                <Camera class="w-8 h-8 text-white" />
              </div>
            </div>

            <!-- Avatar delete button -->
            <button
              v-if="canEdit && avatarUrl && !isUploadingAvatar"
              @click.stop="showDeleteAvatarDialog = true"
              class="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
              title="Remove avatar"
            >
              <Trash2 class="w-3 h-3" />
            </button>

            <!-- Hidden avatar file input -->
            <input
              ref="avatarInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="hidden"
              @change="handleAvatarSelect"
            />
          </div>

          <!-- Profile Info -->
          <div class="flex-1 min-w-0">
            <h1 class="text-3xl font-bold text-white drop-shadow-md">{{ accountName }}</h1>
            <p v-if="bio" class="text-white/80 mt-1 line-clamp-2 drop-shadow-sm">{{ bio }}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-white/70">
              <span v-if="location">{{ location }}</span>
              <span v-if="location && website">|</span>
              <a
                v-if="website"
                :href="website"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-white hover:underline"
              >
                {{ website.replace(/^https?:\/\//, '') }}
              </a>
              <span v-if="(location || website)">|</span>
              <span>Joined {{ formattedDate }}</span>
              <Button v-if="canEdit" variant="secondary" size="sm" class="ml-auto" @click="$emit('editProfile')">
                Edit Profile
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Avatar Confirmation Dialog -->
    <AlertDialog :open="showDeleteAvatarDialog" @update:open="showDeleteAvatarDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Profile Picture</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove this profile picture? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="deleteAvatar" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Delete Banner Confirmation Dialog -->
    <AlertDialog :open="showDeleteBannerDialog" @update:open="showDeleteBannerDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Banner</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove the banner image? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="deleteBanner" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
