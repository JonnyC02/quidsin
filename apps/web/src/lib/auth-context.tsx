import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api.js';

export const SESSION_QUERY_KEY = ['session'] as const;

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading: sessionQuery.isLoading,
      isAuthenticated: sessionQuery.isSuccess,
      loginWithGoogle: async (idToken) => {
        await loginWithGoogleMutation.mutateAsync(idToken);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
    }),
    [sessionQuery.isLoading, sessionQuery.isSuccess, loginWithGoogleMutation, logoutMutation],
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
