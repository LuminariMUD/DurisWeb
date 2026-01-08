<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import SeeAlsoInput from '@/components/guide/SeeAlsoInput.vue'
import { guideApi, helpSuggestionApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { ansiToHtmlWithStyles, htmlToAnsi } from '@/utils/ansiParser'
import type { PublicHelpFile, SuggestionType } from '@/types'
import {
  BookOpen,
  Search,
  Plus,
  Edit,
  Send,
  FileText,
  Info,
  ArrowLeft,
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const { isAuthenticated } = useAuth()
const toast = useToast()

// Help file categories
const HELP_CATEGORIES = [
  { id: 0, name: 'General' },
  { id: 1, name: 'Redirect' },
  { id: 9, name: 'Class' },
  { id: 10, name: 'Class Skillsets' },
  { id: 16, name: 'Spec' },
  { id: 25, name: 'Race' },
]

// State
const activeTab = ref<'browse' | 'create'>('browse')
const loading = ref(false)
const submitting = ref(false)

// Browse state
const searchQuery = ref('')
const searchResults = ref<PublicHelpFile[]>([])
const selectedFile = ref<PublicHelpFile | null>(null)

// Form state
const editingSuggestionId = ref<number | null>(null) // Track if editing existing suggestion
const suggestionType = ref<SuggestionType>('new')
const formTitle = ref('')
const formText = ref('')
const formCategoryId = ref<string>('0')
const formSeeAlso = ref('')
const formNotes = ref('')

// Search help files with debounce
const searchLoading = ref(false)
const debouncedSearch = useDebounceFn(async () => {
  if (searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  searchLoading.value = true
  try {
    const result = await guideApi.searchHelpFiles(searchQuery.value, 20)
    searchResults.value = result.results
  } catch {
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}, 300)

watch(searchQuery, () => {
  debouncedSearch()
})

// Select a help file for editing
async function selectFileForEdit(file: PublicHelpFile) {
  loading.value = true
  try {
    const fullFile = await guideApi.getHelpFile(file.id)
    selectedFile.value = fullFile
    suggestionType.value = 'edit'
    formTitle.value = fullFile.title || ''
    formText.value = ansiToHtmlWithStyles(fullFile.text || '')
    formCategoryId.value = String(fullFile.category_id ?? 0)
    formSeeAlso.value = ''
    formNotes.value = ''
    activeTab.value = 'create'
  } catch {
    toast.error('Failed to load help file')
  } finally {
    loading.value = false
  }
}

// Start new help file suggestion
function startNewSuggestion() {
  selectedFile.value = null
  suggestionType.value = 'new'
  formTitle.value = ''
  formText.value = ''
  formCategoryId.value = '0'
  formSeeAlso.value = ''
  formNotes.value = ''
  activeTab.value = 'create'
}

// Reset form
function resetForm() {
  selectedFile.value = null
  editingSuggestionId.value = null
  suggestionType.value = 'new'
  formTitle.value = ''
  formText.value = ''
  formCategoryId.value = '0'
  formSeeAlso.value = ''
  formNotes.value = ''
  activeTab.value = 'browse'
}

// Submit suggestion
async function submitSuggestion() {
  if (!formTitle.value.trim()) {
    toast.error('Title is required')
    return
  }
  if (!formText.value.trim()) {
    toast.error('Content is required')
    return
  }

  submitting.value = true
  try {
    const ansiText = htmlToAnsi(formText.value)

    if (editingSuggestionId.value) {
      // Update existing suggestion - always send all fields so they can be cleared
      await helpSuggestionApi.updateSuggestion(editingSuggestionId.value, {
        title: formTitle.value.trim(),
        text: ansiText,
        categoryId: parseInt(formCategoryId.value),
        seeAlso: formSeeAlso.value.trim(),
        submitterNotes: formNotes.value.trim(),
      })
      toast.success('Suggestion updated successfully!')
    } else {
      // Create new suggestion
      await helpSuggestionApi.createSuggestion({
        suggestionType: suggestionType.value,
        pageId: selectedFile.value?.id,
        title: formTitle.value.trim(),
        text: ansiText,
        categoryId: parseInt(formCategoryId.value),
        seeAlso: formSeeAlso.value.trim() || undefined,
        submitterNotes: formNotes.value.trim() || undefined,
      })
      toast.success('Suggestion submitted successfully! It will be reviewed by our team.')
    }

    resetForm()
    router.push({ name: 'my-suggestions' })
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Failed to submit suggestion')
  } finally {
    submitting.value = false
  }
}

// Check if user is authenticated
const canSubmit = computed(() => isAuthenticated.value)

// Check for query params on mount
onMounted(async () => {
  if (!isAuthenticated.value) return

  const editId = route.query.edit // Edit a help file (create new suggestion)
  const suggestionId = route.query.suggestion // Edit an existing suggestion

  if (suggestionId) {
    // Load existing suggestion for editing
    try {
      loading.value = true
      const suggestion = await helpSuggestionApi.getSuggestion(Number(suggestionId))
      editingSuggestionId.value = suggestion.id
      suggestionType.value = suggestion.suggestion_type
      formTitle.value = suggestion.title || ''
      formText.value = ansiToHtmlWithStyles(suggestion.text || '')
      formCategoryId.value = String(suggestion.category_id ?? 0)
      formSeeAlso.value = suggestion.see_also || ''
      formNotes.value = suggestion.submitter_notes || ''
      activeTab.value = 'create'
    } catch {
      toast.error('Failed to load suggestion')
    } finally {
      loading.value = false
    }
  } else if (editId) {
    // Create new suggestion based on existing help file
    try {
      loading.value = true
      const file = await guideApi.getHelpFile(Number(editId))
      selectedFile.value = file
      suggestionType.value = 'edit'
      formTitle.value = file.title || ''
      formText.value = ansiToHtmlWithStyles(file.text || '')
      formCategoryId.value = String(file.category_id ?? 0)
      formSeeAlso.value = ''
      formNotes.value = ''
      activeTab.value = 'create'
    } catch {
      toast.error('Failed to load help file')
    } finally {
      loading.value = false
    }
  }
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 overflow-y-auto">
      <div class="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <BookOpen class="h-8 w-8 text-cyan-400" />
              <h1 class="text-3xl font-bold text-white">Suggest Help Files</h1>
            </div>
            <p class="text-muted-foreground">
              Help improve our documentation by suggesting new help files or edits
            </p>
          </div>
          <Button variant="outline" @click="router.push({ name: 'my-suggestions' })">
            <FileText class="h-4 w-4 mr-2" />
            My Suggestions
          </Button>
        </div>

        <!-- Not authenticated warning -->
        <Card v-if="!canSubmit" class="border-amber-500/50 bg-amber-500/10">
          <CardContent class="pt-6">
            <div class="flex items-start gap-3">
              <Info class="h-5 w-5 text-amber-400 mt-0.5" />
              <div>
                <p class="text-amber-200 font-medium">Login required</p>
                <p class="text-amber-200/70 text-sm mt-1">
                  You need to be logged in to submit help file suggestions.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  class="mt-3"
                  @click="router.push({ name: 'login' })"
                >
                  Login to contribute
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Main content -->
        <template v-else>
          <Tabs v-model="activeTab" class="w-full">
            <TabsList class="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="browse">
                <Search class="h-4 w-4 mr-2" />
                Browse & Edit
              </TabsTrigger>
              <TabsTrigger value="create">
                <Plus class="h-4 w-4 mr-2" />
                {{ editingSuggestionId ? 'Update Suggestion' : suggestionType === 'edit' ? 'Edit Suggestion' : 'New Suggestion' }}
              </TabsTrigger>
            </TabsList>

            <!-- Browse Tab -->
            <TabsContent value="browse" class="mt-6 space-y-6">
              <!-- Guidelines -->
              <Card>
                <CardHeader>
                  <CardTitle class="text-lg">Contribution Guidelines</CardTitle>
                </CardHeader>
                <CardContent class="space-y-3 text-sm text-muted-foreground">
                  <p>
                    <strong class="text-foreground">Be accurate:</strong> Ensure all information is correct and up-to-date with the current game mechanics.
                  </p>
                  <p>
                    <strong class="text-foreground">Be consistent:</strong> Follow the existing style and formatting of other help files.
                  </p>
                  <p>
                    <strong class="text-foreground">Use See Also:</strong> Link related help files to help players discover more information.
                  </p>
                  <p>
                    <strong class="text-foreground">Explain your changes:</strong> Use the notes field to explain why you're making this suggestion.
                  </p>
                </CardContent>
              </Card>

              <!-- Search and results -->
              <Card>
                <CardHeader>
                  <CardTitle class="text-lg">Find a Help File to Edit</CardTitle>
                  <CardDescription>
                    Search for an existing help file to suggest improvements
                  </CardDescription>
                </CardHeader>
                <CardContent class="space-y-4">
                  <div class="flex gap-4">
                    <div class="relative flex-1">
                      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        v-model="searchQuery"
                        placeholder="Search help files... (min 2 characters)"
                        class="pl-10"
                      />
                    </div>
                    <Button @click="startNewSuggestion">
                      <Plus class="h-4 w-4 mr-2" />
                      New Help File
                    </Button>
                  </div>

                  <!-- Search Results -->
                  <div v-if="searchQuery.length >= 2" class="border rounded-lg">
                    <div v-if="searchLoading" class="p-4 space-y-2">
                      <Skeleton class="h-8 w-full" />
                      <Skeleton class="h-8 w-full" />
                      <Skeleton class="h-8 w-3/4" />
                    </div>
                    <div v-else-if="searchResults.length === 0" class="p-8 text-center text-muted-foreground">
                      <BookOpen class="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p>No help files found matching "{{ searchQuery }}"</p>
                      <Button variant="link" @click="startNewSuggestion" class="mt-2">
                        Suggest a new help file instead
                      </Button>
                    </div>
                    <Table v-else>
                      <TableHeader>
                        <TableRow>
                          <TableHead class="pl-4">Title</TableHead>
                          <TableHead class="w-[120px]">Category</TableHead>
                          <TableHead class="w-[100px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow
                          v-for="file in searchResults"
                          :key="file.id"
                          class="hover:bg-muted/50"
                        >
                          <TableCell class="font-medium pl-4">
                            {{ file.title || 'Untitled' }}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" class="text-xs">
                              {{ file.category_name }}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              @click="selectFileForEdit(file)"
                              :disabled="loading"
                            >
                              <Edit class="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <!-- Create/Edit Tab -->
            <TabsContent value="create" class="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <div class="flex items-center justify-between">
                    <div>
                      <CardTitle class="text-lg">
                        {{ suggestionType === 'edit' ? 'Edit Help File' : 'New Help File' }}
                      </CardTitle>
                      <CardDescription v-if="selectedFile">
                        Suggesting changes to: {{ selectedFile.title }}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" @click="resetForm">
                      <ArrowLeft class="h-4 w-4 mr-1" />
                      Back
                    </Button>
                  </div>
                </CardHeader>
                <CardContent class="space-y-6">
                  <!-- Title -->
                  <div class="space-y-2">
                    <Label for="title">Title</Label>
                    <Input
                      id="title"
                      v-model="formTitle"
                      placeholder="Help file title"
                    />
                  </div>

                  <!-- Category -->
                  <div class="space-y-2">
                    <Label for="category">Category</Label>
                    <Select v-model="formCategoryId">
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="cat in HELP_CATEGORIES"
                          :key="cat.id"
                          :value="String(cat.id)"
                        >
                          {{ cat.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <!-- Content -->
                  <div class="space-y-2">
                    <Label>Content</Label>
                    <TipTapEditor v-model="formText" />
                    <p class="text-xs text-muted-foreground">
                      Use the editor toolbar for formatting. Colors will be converted to MUD ANSI codes.
                    </p>
                  </div>

                  <!-- See Also -->
                  <div class="space-y-2">
                    <Label>See Also</Label>
                    <SeeAlsoInput v-model="formSeeAlso" />
                    <p class="text-xs text-muted-foreground">
                      Search and select related help files
                    </p>
                  </div>

                  <!-- Notes -->
                  <div class="space-y-2">
                    <Label for="notes">Notes for Reviewers</Label>
                    <Textarea
                      id="notes"
                      v-model="formNotes"
                      placeholder="Explain why you're making this suggestion..."
                      rows="3"
                    />
                  </div>

                  <!-- Submit -->
                  <div class="flex justify-end gap-3 pt-4 border-t">
                    <Button variant="outline" @click="resetForm" :disabled="submitting">
                      Cancel
                    </Button>
                    <Button @click="submitSuggestion" :disabled="submitting">
                      <Send class="h-4 w-4 mr-2" />
                      {{ submitting ? 'Saving...' : editingSuggestionId ? 'Update Suggestion' : 'Submit Suggestion' }}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </template>
      </div>
    </div>
  </div>
</template>
