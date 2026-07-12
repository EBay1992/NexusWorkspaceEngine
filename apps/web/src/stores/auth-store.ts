import { create } from 'zustand';
import { isTokenExpired } from '@/lib/auth/jwt';
import {
  clearAccessToken,
  fetchCurrentUser,
  getStoredAccessToken,
  login as gatewayLogin,
  storeAccessToken,
  type AuthUser,
} from '@/lib/gateway/client';

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  accessToken: null,

  bootstrap: async () => {
    const token = getStoredAccessToken();
    if (!token || isTokenExpired(token)) {
      clearAccessToken();
      set({ status: 'unauthenticated', user: null, accessToken: null });
      return;
    }

    const user = await fetchCurrentUser(token);
    if (!user) {
      clearAccessToken();
      set({ status: 'unauthenticated', user: null, accessToken: null });
      return;
    }

    set({ status: 'authenticated', user, accessToken: token });
  },

  login: async (email, password) => {
    const result = await gatewayLogin(email, password);
    if (!result.ok) {
      return result;
    }

    const user = await fetchCurrentUser(result.data.accessToken);
    if (!user) {
      clearAccessToken();
      return { ok: false, error: 'Login succeeded but session validation failed.' };
    }

    set({
      status: 'authenticated',
      user,
      accessToken: result.data.accessToken,
    });

    return { ok: true };
  },

  logout: () => {
    clearAccessToken();
    set({ status: 'unauthenticated', user: null, accessToken: null });
  },
}));
