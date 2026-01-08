<script setup lang="ts">
import { ref, computed } from 'vue';
import { useBulkUpdateZonesMutation, EPIC_TYPE_LABELS, type ZoneUpdateData } from '@/composables/useZones';
import { useToast } from '@/composables/useToast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Save } from 'lucide-vue-next';

const props = defineProps<{
  zoneNumbers: number[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const toast = useToast();
const { mutate: bulkUpdate, isPending } = useBulkUpdateZonesMutation();

// Form state with enabled flags
const formData = ref<ZoneUpdateData>({});
const enabledFields = ref({
  epicType: false,
  alignment: false,
  suggestedGroupSize: false,
  difficulty: false,
  epicPayout: false,
  taskZone: false,
  questZone: false,
  trophyZone: false,
  randomsZone: false,
});

const showConfirmDialog = ref(false);

// Default values for UI
const defaultValues = ref({
  epicType: 0,
  alignment: 0,
  suggestedGroupSize: 1,
  difficulty: 0,
  epicPayout: 0,
  taskZone: false,
  questZone: false,
  trophyZone: true,
  randomsZone: true,
});

// Validation
const errors = ref<Record<string, string>>({});

function validateForm(): boolean {
  errors.value = {};

  if (enabledFields.value.epicType && formData.value.epicType !== undefined) {
    if (formData.value.epicType < 0 || formData.value.epicType > 3) {
      errors.value.epicType = 'Epic type must be between 0 and 3';
    }
  }

  if (enabledFields.value.alignment && formData.value.alignment !== undefined) {
    if (formData.value.alignment < -5 || formData.value.alignment > 5) {
      errors.value.alignment = 'Alignment must be between -5 and 5';
    }
  }

  if (enabledFields.value.suggestedGroupSize && formData.value.suggestedGroupSize !== undefined) {
    if (formData.value.suggestedGroupSize < 1 || formData.value.suggestedGroupSize > 20) {
      errors.value.suggestedGroupSize = 'Group size must be between 1 and 20';
    }
  }

  if (enabledFields.value.difficulty && formData.value.difficulty !== undefined) {
    if (formData.value.difficulty < 0 || formData.value.difficulty > 10) {
      errors.value.difficulty = 'Difficulty must be between 0 and 10';
    }
  }

  if (enabledFields.value.epicPayout && formData.value.epicPayout !== undefined) {
    if (formData.value.epicPayout < 0) {
      errors.value.epicPayout = 'Epic payout must be 0 or greater';
    }
  }

  return Object.keys(errors.value).length === 0;
}

// Build update data from enabled fields
function buildUpdateData(): ZoneUpdateData {
  const data: ZoneUpdateData = {};

  if (enabledFields.value.epicType) {
    data.epicType = formData.value.epicType ?? defaultValues.value.epicType;
  }
  if (enabledFields.value.alignment) {
    data.alignment = formData.value.alignment ?? defaultValues.value.alignment;
  }
  if (enabledFields.value.suggestedGroupSize) {
    data.suggestedGroupSize = formData.value.suggestedGroupSize ?? defaultValues.value.suggestedGroupSize;
  }
  if (enabledFields.value.difficulty) {
    data.difficulty = formData.value.difficulty ?? defaultValues.value.difficulty;
  }
  if (enabledFields.value.epicPayout) {
    data.epicPayout = formData.value.epicPayout ?? defaultValues.value.epicPayout;
  }
  if (enabledFields.value.taskZone) {
    data.taskZone = formData.value.taskZone ?? defaultValues.value.taskZone;
  }
  if (enabledFields.value.questZone) {
    data.questZone = formData.value.questZone ?? defaultValues.value.questZone;
  }
  if (enabledFields.value.trophyZone) {
    data.trophyZone = formData.value.trophyZone ?? defaultValues.value.trophyZone;
  }
  if (enabledFields.value.randomsZone) {
    data.randomsZone = formData.value.randomsZone ?? defaultValues.value.randomsZone;
  }

  return data;
}

// Handle save
function handleSave() {
  const hasEnabledFields = Object.values(enabledFields.value).some(v => v);

  if (!hasEnabledFields) {
    toast.error('Please select at least one field to update', 'No Fields Selected');
    return;
  }

  if (!validateForm()) {
    toast.error('Please fix the errors before saving', 'Validation Error');
    return;
  }

  showConfirmDialog.value = true;
}

function confirmSave() {
  showConfirmDialog.value = false;

  const updateData = buildUpdateData();

  bulkUpdate(
    {
      zoneNumbers: props.zoneNumbers,
      data: updateData,
    },
    {
      onSuccess: (result) => {
        toast.success(`Successfully updated ${result.affectedRows} zone(s)`, 'Zones Updated');
        emit('close');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to update zones', 'Update Failed');
      },
    }
  );
}

// Alignment label
const alignmentLabel = computed(() => {
  const value = formData.value.alignment ?? defaultValues.value.alignment;
  if (value < -3) return 'Very Evil';
  if (value < -1) return 'Evil';
  if (value < 0) return 'Slightly Evil';
  if (value === 0) return 'Neutral';
  if (value <= 1) return 'Slightly Good';
  if (value <= 3) return 'Good';
  return 'Very Good';
});

// Summary of changes
const changeSummary = computed(() => {
  const enabled = Object.entries(enabledFields.value)
    .filter(([_, v]) => v)
    .map(([k]) => k);
  return enabled.length > 0 ? enabled.join(', ') : 'No fields selected';
});
</script>

<template>
  <Dialog :open="true" @update:open="(open) => !open && emit('close')">
    <DialogContent class="!max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Bulk Edit Zones</DialogTitle>
        <DialogDescription>
          Updating {{ zoneNumbers.length }} zone(s). Select which fields to update.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <!-- Epic Type -->
        <div class="space-y-2 border rounded-lg p-4">
          <div class="flex items-center space-x-2">
            <Checkbox
              id="enable-epic-type"
              v-model="enabledFields.epicType"
            />
            <Label for="enable-epic-type" class="font-medium cursor-pointer">
              Update Epic Type
            </Label>
          </div>
          <div v-if="enabledFields.epicType" class="ml-6 mt-2">
            <Select v-model="formData.epicType">
              <SelectTrigger>
                <SelectValue placeholder="Select epic type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="0">{{ EPIC_TYPE_LABELS[0].name }} - {{ EPIC_TYPE_LABELS[0].description }}</SelectItem>
                <SelectItem :value="1">{{ EPIC_TYPE_LABELS[1].name }} - {{ EPIC_TYPE_LABELS[1].description }}</SelectItem>
                <SelectItem :value="2">{{ EPIC_TYPE_LABELS[2].name }} - {{ EPIC_TYPE_LABELS[2].description }}</SelectItem>
                <SelectItem :value="3">{{ EPIC_TYPE_LABELS[3].name }} - {{ EPIC_TYPE_LABELS[3].description }}</SelectItem>
              </SelectContent>
            </Select>
            <p v-if="errors.epicType" class="text-sm text-destructive mt-1">{{ errors.epicType }}</p>
          </div>
        </div>

        <!-- Alignment -->
        <div class="space-y-2 border rounded-lg p-4">
          <div class="flex items-center space-x-2">
            <Checkbox
              id="enable-alignment"
              v-model="enabledFields.alignment"
            />
            <Label for="enable-alignment" class="font-medium cursor-pointer">
              Update Alignment
            </Label>
          </div>
          <div v-if="enabledFields.alignment" class="ml-6 mt-3 space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm">Alignment</span>
              <span class="text-sm font-medium">
                {{ formData.alignment ?? defaultValues.alignment }} - {{ alignmentLabel }}
              </span>
            </div>
            <Slider
              :model-value="[formData.alignment ?? defaultValues.alignment]"
              @update:model-value="(value) => formData.alignment = value?.[0]"
              :min="-5"
              :max="5"
              :step="1"
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span class="text-red-600 dark:text-red-400">Evil (-5)</span>
              <span>Neutral (0)</span>
              <span class="text-blue-600 dark:text-blue-400">Good (+5)</span>
            </div>
            <p v-if="errors.alignment" class="text-sm text-destructive">{{ errors.alignment }}</p>
          </div>
        </div>

        <!-- Suggested Group Size -->
        <div class="space-y-2 border rounded-lg p-4">
          <div class="flex items-center space-x-2">
            <Checkbox
              id="enable-group-size"
              v-model="enabledFields.suggestedGroupSize"
            />
            <Label for="enable-group-size" class="font-medium cursor-pointer">
              Update Suggested Group Size
            </Label>
          </div>
          <div v-if="enabledFields.suggestedGroupSize" class="ml-6 mt-2">
            <Input
              v-model.number="formData.suggestedGroupSize"
              type="number"
              min="1"
              max="20"
              :placeholder="String(defaultValues.suggestedGroupSize)"
            />
            <p v-if="errors.suggestedGroupSize" class="text-sm text-destructive mt-1">{{ errors.suggestedGroupSize }}</p>
          </div>
        </div>

        <!-- Difficulty -->
        <div class="space-y-2 border rounded-lg p-4">
          <div class="flex items-center space-x-2">
            <Checkbox
              id="enable-difficulty"
              v-model="enabledFields.difficulty"
            />
            <Label for="enable-difficulty" class="font-medium cursor-pointer">
              Update Difficulty
            </Label>
          </div>
          <div v-if="enabledFields.difficulty" class="ml-6 mt-3 space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm">Difficulty</span>
              <span class="text-sm font-medium">{{ formData.difficulty ?? defaultValues.difficulty }}/10</span>
            </div>
            <Slider
              :model-value="[formData.difficulty ?? defaultValues.difficulty]"
              @update:model-value="(value) => formData.difficulty = value?.[0]"
              :min="0"
              :max="10"
              :step="1"
            />
            <p v-if="errors.difficulty" class="text-sm text-destructive">{{ errors.difficulty }}</p>
          </div>
        </div>

        <!-- Epic Payout -->
        <div class="space-y-2 border rounded-lg p-4">
          <div class="flex items-center space-x-2">
            <Checkbox
              id="enable-payout"
              v-model="enabledFields.epicPayout"
            />
            <Label for="enable-payout" class="font-medium cursor-pointer">
              Update Epic Payout
            </Label>
          </div>
          <div v-if="enabledFields.epicPayout" class="ml-6 mt-2">
            <Input
              v-model.number="formData.epicPayout"
              type="number"
              min="0"
              :placeholder="String(defaultValues.epicPayout)"
            />
            <p v-if="errors.epicPayout" class="text-sm text-destructive mt-1">{{ errors.epicPayout }}</p>
          </div>
        </div>

        <!-- Boolean Flags -->
        <div class="space-y-3 border rounded-lg p-4">
          <Label class="text-base font-medium">Zone Flags</Label>

          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <Checkbox
                id="enable-task-zone"
                v-model="enabledFields.taskZone"
              />
              <Label for="enable-task-zone" class="cursor-pointer">Update Task Zone</Label>
            </div>
            <div v-if="enabledFields.taskZone" class="ml-6">
              <Switch :model-value="formData.taskZone ?? defaultValues.taskZone" @update:model-value="(val: boolean) => formData.taskZone = val" />
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <Checkbox
                id="enable-quest-zone"
                v-model="enabledFields.questZone"
              />
              <Label for="enable-quest-zone" class="cursor-pointer">Update Quest Zone</Label>
            </div>
            <div v-if="enabledFields.questZone" class="ml-6">
              <Switch :model-value="formData.questZone ?? defaultValues.questZone" @update:model-value="(val: boolean) => formData.questZone = val" />
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <Checkbox
                id="enable-trophy-zone"
                v-model="enabledFields.trophyZone"
              />
              <Label for="enable-trophy-zone" class="cursor-pointer">Update Trophy Zone</Label>
            </div>
            <div v-if="enabledFields.trophyZone" class="ml-6">
              <Switch :model-value="formData.trophyZone ?? defaultValues.trophyZone" @update:model-value="(val: boolean) => formData.trophyZone = val" />
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <Checkbox
                id="enable-randoms-zone"
                v-model="enabledFields.randomsZone"
              />
              <Label for="enable-randoms-zone" class="cursor-pointer">Update Randoms Zone</Label>
            </div>
            <div v-if="enabledFields.randomsZone" class="ml-6">
              <Switch :model-value="formData.randomsZone ?? defaultValues.randomsZone" @update:model-value="(val: boolean) => formData.randomsZone = val" />
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('close')" :disabled="isPending">
          Cancel
        </Button>
        <Button @click="handleSave" :disabled="isPending">
          <Loader2 v-if="isPending" class="h-4 w-4 mr-2 animate-spin" />
          <Save v-else class="h-4 w-4 mr-2" />
          Update {{ zoneNumbers.length }} Zone(s)
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Confirmation Dialog -->
  <AlertDialog :open="showConfirmDialog" @update:open="showConfirmDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm Bulk Update</AlertDialogTitle>
        <AlertDialogDescription class="space-y-2">
          <p>Are you sure you want to update <strong>{{ zoneNumbers.length }} zone(s)</strong>?</p>
          <p class="text-sm mt-2">
            <strong>Fields to update:</strong><br />
            {{ changeSummary }}
          </p>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="confirmSave">
          Confirm Update
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
