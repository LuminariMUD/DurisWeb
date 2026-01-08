import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { type Ref, type ComputedRef, unref, computed } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Types
export interface Permission {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  created_at: string;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system_role: boolean;
  created_at: string;
  created_by: string | null;
  permission_count?: number;
  permissions?: Permission[];
}

export interface AccountPermissions {
  accountName: string;
  effectivePermissions: string[];
  roles: Array<{
    id: number;
    name: string;
    description: string | null;
    assigned_at: string;
    assigned_by: string;
  }>;
  individualPermissions: Array<{
    id: number;
    name: string;
    description: string | null;
    granted_at: string;
    granted_by: string;
  }>;
}

// API Functions
async function fetchPermissions(): Promise<Permission[]> {
  const response = await axios.get(`${API_URL}/api/admin/permissions`, {
    withCredentials: true
  });
  return response.data;
}

async function fetchRoles(): Promise<Role[]> {
  const response = await axios.get(`${API_URL}/api/admin/roles`, {
    withCredentials: true
  });
  // Transform snake_case to camelCase
  return response.data.map((role: any) => ({
    id: role.id,
    name: role.role_name,
    description: role.description,
    is_system_role: role.is_system_role,
    created_at: role.created_at || '',
    created_by: role.created_by || null,
    permission_count: role.permission_count
  }));
}

async function fetchRole(roleId: number): Promise<Role> {
  const response = await axios.get(`${API_URL}/api/admin/roles/${roleId}`, {
    withCredentials: true
  });
  const role = response.data;
  // Transform snake_case to camelCase
  return {
    id: role.id,
    name: role.role_name,
    description: role.description,
    is_system_role: role.is_system_role,
    created_at: role.created_at,
    created_by: role.created_by,
    permissions: role.permissions?.map((p: any) => ({
      id: p.id,
      name: p.permission_name,
      description: p.description,
      category: p.category
    }))
  };
}

async function createRole(data: {
  name: string;
  description?: string;
  permissionIds: number[];
}): Promise<{ success: boolean; roleId: number }> {
  const response = await axios.post(`${API_URL}/api/admin/roles`, data, {
    withCredentials: true
  });
  return response.data;
}

async function updateRole(
  roleId: number,
  data: {
    name: string;
    description?: string;
    permissionIds: number[];
  }
): Promise<{ success: boolean }> {
  const response = await axios.put(`${API_URL}/api/admin/roles/${roleId}`, data, {
    withCredentials: true
  });
  return response.data;
}

async function deleteRole(roleId: number): Promise<{ success: boolean }> {
  const response = await axios.delete(`${API_URL}/api/admin/roles/${roleId}`, {
    withCredentials: true
  });
  return response.data;
}

async function fetchAccountPermissions(accountName: string): Promise<AccountPermissions> {
  const response = await axios.get(`${API_URL}/api/admin/accounts/${accountName}/permissions`, {
    withCredentials: true
  });
  const data = response.data;
  // Transform snake_case to camelCase
  return {
    accountName: data.accountName,
    effectivePermissions: data.effectivePermissions,
    roles: data.roles.map((role: any) => ({
      id: role.id,
      name: role.role_name,
      description: role.description,
      assigned_at: role.assigned_at,
      assigned_by: role.assigned_by
    })),
    individualPermissions: data.individualPermissions.map((perm: any) => ({
      id: perm.id,
      name: perm.permission_name,
      description: perm.description,
      granted_at: perm.granted_at,
      granted_by: perm.granted_by
    }))
  };
}

async function assignRoleToAccount(accountName: string, roleId: number): Promise<{ success: boolean }> {
  const response = await axios.post(
    `${API_URL}/api/admin/accounts/${accountName}/roles`,
    { roleId },
    { withCredentials: true }
  );
  return response.data;
}

async function revokeRoleFromAccount(accountName: string, roleId: number): Promise<{ success: boolean }> {
  const response = await axios.delete(
    `${API_URL}/api/admin/accounts/${accountName}/roles/${roleId}`,
    { withCredentials: true }
  );
  return response.data;
}

async function grantPermissionToAccount(
  accountName: string,
  permissionId: number
): Promise<{ success: boolean }> {
  const response = await axios.post(
    `${API_URL}/api/admin/accounts/${accountName}/permissions`,
    { permissionId },
    { withCredentials: true }
  );
  return response.data;
}

async function revokePermissionFromAccount(
  accountName: string,
  permissionId: number
): Promise<{ success: boolean }> {
  const response = await axios.delete(
    `${API_URL}/api/admin/accounts/${accountName}/permissions/${permissionId}`,
    { withCredentials: true }
  );
  return response.data;
}

// Composables
export function usePermissions() {
  return useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: fetchPermissions,
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: fetchRoles,
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
}

export function useRole(roleId: Ref<number> | ComputedRef<number>) {
  return useQuery({
    queryKey: ['admin', 'roles', roleId],
    queryFn: () => fetchRole(unref(roleId)),
    enabled: computed(() => unref(roleId) > 0)
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    }
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, data }: { roleId: number; data: any }) => updateRole(roleId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles', variables.roleId] });
    }
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    }
  });
}

export function useAccountPermissions(accountName: Ref<string> | ComputedRef<string>) {
  return useQuery({
    queryKey: ['admin', 'accounts', accountName, 'permissions'],
    queryFn: () => fetchAccountPermissions(unref(accountName)),
    enabled: computed(() => unref(accountName).length > 0)
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountName, roleId }: { accountName: string; roleId: number }) =>
      assignRoleToAccount(accountName, roleId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', variables.accountName, 'permissions']
      });
      // Also invalidate the accounts list so newly assigned accounts appear
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', 'with-permissions']
      });
    }
  });
}

export function useRevokeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountName, roleId }: { accountName: string; roleId: number }) =>
      revokeRoleFromAccount(accountName, roleId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', variables.accountName, 'permissions']
      });
      // Also invalidate the accounts list
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', 'with-permissions']
      });
    }
  });
}

export function useGrantPermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountName, permissionId }: { accountName: string; permissionId: number }) =>
      grantPermissionToAccount(accountName, permissionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', variables.accountName, 'permissions']
      });
      // Also invalidate the accounts list
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', 'with-permissions']
      });
    }
  });
}

export function useRevokePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountName, permissionId }: { accountName: string; permissionId: number }) =>
      revokePermissionFromAccount(accountName, permissionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', variables.accountName, 'permissions']
      });
      // Also invalidate the accounts list
      queryClient.invalidateQueries({
        queryKey: ['admin', 'accounts', 'with-permissions']
      });
    }
  });
}
