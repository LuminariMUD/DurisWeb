<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ role ? 'Edit Role' : 'Create Role' }}</DialogTitle>
        <DialogDescription>
          {{ role ? 'Update role details and permissions' : 'Create a new role with selected permissions' }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <div class="space-y-4">
          <div>
            <Label for="role-name">Role Name</Label>
            <Input
              id="role-name"
              v-model="formData.name"
              placeholder="e.g., Content Editor"
              required
            />
          </div>

          <div>
            <Label for="role-description">Description</Label>
            <Input
              id="role-description"
              v-model="formData.description"
              placeholder="Brief description of this role"
            />
          </div>

          <div>
            <Label class="mb-3 block">Permissions</Label>
            <div class="space-y-3 border rounded-md p-4 max-h-96 overflow-y-auto">
              <div v-for="permission in groupedPermissions" :key="permission.category" class="space-y-2">
                <h4 class="font-medium text-sm">{{ permission.category || 'Other' }}</h4>
                <div class="space-y-3 ml-4">
                  <div
                    v-for="perm in permission.permissions"
                    :key="perm.id"
                    class="flex items-center justify-between space-x-3"
                  >
                    <Label :for="`perm-${perm.id}`" class="font-normal cursor-pointer flex-1">
                      <div>
                        <p class="font-medium">{{ perm.name }}</p>
                        <p v-if="perm.description" class="text-xs text-muted-foreground">
                          {{ perm.description }}
                        </p>
                      </div>
                    </Label>
                    <Switch
                      :id="`perm-${perm.id}`"
                      :model-value="hasPermission(perm.id)"
                      @update:model-value="(checked: boolean) => togglePermission(perm.id, checked)"
                    />
                  </div>
                </div>
              </div>
            </div>
            <p class="text-sm text-muted-foreground mt-2">
              {{ formData.permissionIds.length }} permission(s) selected
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="handleCancel">Cancel</Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
            {{ role ? 'Update' : 'Create' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useToast } from '@/composables/useToast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-vue-next';
import { useCreateRole, useUpdateRole, useRole, type Role, type Permission } from '@/composables/useAdminPermissions';

interface Props {
  open: boolean;
  role: Role | null;
  permissions: Permission[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  saved: [];
}>();

const { success, error } = useToast();
const createRoleMutation = useCreateRole();
const updateRoleMutation = useUpdateRole();

// Fetch full role details when editing
const roleId = computed(() => props.role?.id || 0);
const { data: fullRole } = useRole(roleId);

const formData = ref({
  name: '',
  description: '',
  permissionIds: [] as number[]
});

const isSaving = computed(() => createRoleMutation.isPending.value || updateRoleMutation.isPending.value);

// Group permissions by category
const groupedPermissions = computed(() => {
  const groups = new Map<string, Permission[]>();

  props.permissions.forEach((perm) => {
    const category = perm.category || 'Other';
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(perm);
  });

  return Array.from(groups.entries()).map(([category, permissions]) => ({
    category,
    permissions
  }));
});

// Watch for role changes to populate form
// Use fullRole (with permissions array) when available
watch(
  [() => props.role, fullRole],
  ([newRole, fullRoleData]) => {
    if (newRole && fullRoleData) {
      // Use the full role data fetched from the API (has permissions + transformed field names)
      formData.value = {
        name: fullRoleData.name,
        description: fullRoleData.description || '',
        permissionIds: fullRoleData.permissions?.map((p) => p.id) || []
      };
    } else if (newRole && !newRole.id) {
      // Creating new role (no ID means create mode)
      formData.value = {
        name: '',
        description: '',
        permissionIds: []
      };
    } else if (!newRole) {
      // Dialog closed
      formData.value = {
        name: '',
        description: '',
        permissionIds: []
      };
    }
    // If newRole exists but fullRoleData is still loading, wait for fullRoleData
  },
  { immediate: true }
);

async function handleSubmit() {
  try {
    if (props.role) {
      // Update existing role
      await updateRoleMutation.mutateAsync({
        roleId: props.role.id,
        data: {
          name: formData.value.name,
          description: formData.value.description || undefined,
          permissionIds: formData.value.permissionIds
        }
      });
      success('Role updated successfully', 'Success');
    } else {
      // Create new role
      await createRoleMutation.mutateAsync({
        name: formData.value.name,
        description: formData.value.description || undefined,
        permissionIds: formData.value.permissionIds
      });
      success('Role created successfully', 'Success');
    }

    emit('saved');
  } catch (err: any) {
    error(
      err.response?.data?.error || 'Failed to save role',
      'Error'
    );
  }
}

function handleCancel() {
  emit('update:open', false);
}

function hasPermission(permId: number): boolean {
  return formData.value.permissionIds.includes(permId);
}

function togglePermission(permId: number, checked: boolean) {
  if (checked) {
    if (!formData.value.permissionIds.includes(permId)) {
      formData.value.permissionIds.push(permId);
    }
  } else {
    formData.value.permissionIds = formData.value.permissionIds.filter(id => id !== permId);
  }
}
</script>
