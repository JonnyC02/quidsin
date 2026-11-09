import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TenantRole } from '@quidsin/core';
import * as api from './api.js';

export const SESSION_QUERY_KEY = ['session'] as const;

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  role?: TenantRole;
  tenantId?: string;
  tenantName?: string;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: api.getCurrentSession,
    retry: false,
  });

  const loginWithGoogleMutation = useMutation({
    mutationFn: api.loginWithGoogle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  const switchTenantMutation = useMutation({
    mutationFn: api.tenants.switchTo,
    // Every other query in the app is scoped to "whichever tenant the
    // session currently points at" — switching invalidates all of it,
    // not just the session.
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading: sessionQuery.isLoading,
      isAuthenticated: sessionQuery.isSuccess,
      role: sessionQuery.data?.role,
      tenantId: sessionQuery.data?.tenantId,
      tenantName: sessionQuery.data?.tenantName,
      loginWithGoogle: async (idToken) => {
        await loginWithGoogleMutation.mutateAsync(idToken);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      switchTenant: async (tenantId) => {
        await switchTenantMutation.mutateAsync(tenantId);
      },
    }),
    [
      sessionQuery.isLoading,
      sessionQuery.isSuccess,
      sessionQuery.data,
      loginWithGoogleMutation,
      logoutMutation,
      switchTenantMutation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
