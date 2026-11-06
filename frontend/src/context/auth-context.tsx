import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { queryClient } from "@/lib/query-client";
import type { UserProfileResponse, UserRole } from "@/types/api";

export interface AuthContextType {
  user: UserProfileResponse | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (allowedRoles: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Synchronize onAuthChange from api-client
  useEffect(() => {
    const unsubscribe = api.onAuthChange((newUser) => {
      setUser(newUser);
    });
    return unsubscribe;
  }, []);

  // Attempt initial session restore via silent token refresh
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const tokenRes = await api.refreshSession();
        if (isMounted) {
          const profile = await api.getCurrentUser();
          setUser(profile);
          await queryClient.invalidateQueries();
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login({ email, password });
      const profile = await api.getCurrentUser();
      setUser(profile);
      await queryClient.invalidateQueries();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      setUser(null);
      queryClient.clear();
      setIsLoading(false);
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      return user.permissions.includes(permission) || user.permissions.includes("admin:*");
    },
    [user]
  );

  const hasRole = useCallback(
    (allowedRoles: UserRole | UserRole[]): boolean => {
      if (!user) return false;
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuthContext: AuthContextType = {
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {},
  logout: async () => {},
  hasPermission: () => false,
  hasRole: () => false,
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  return context ?? defaultAuthContext;
}
