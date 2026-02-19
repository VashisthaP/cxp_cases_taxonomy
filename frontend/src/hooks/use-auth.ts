// ==========================================================================
// useAuth Hook — MSAL.js + PKCE Entra ID Authentication
// Uses @azure/msal-react to manage user identity via Authorization Code
// Flow with PKCE. Fully secret-free — no client secret needed.
// Replaces the previous SWA built-in /.auth/me approach.
// ==========================================================================

import { useState, useEffect, useCallback } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionStatus, AccountInfo } from '@azure/msal-browser';
import { loginRequest } from '@/lib/msal-config';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Parsed user profile from the MSAL authentication context */
export interface UserProfile {
  /** Display name from Entra ID */
  name: string;
  /** Email / UPN */
  email: string;
  /** Entra ID tenant */
  tenantId: string;
  /** Whether the user has been authenticated */
  isAuthenticated: boolean;
  /** Raw MSAL AccountInfo for advanced use */
  raw?: AccountInfo;
}

/** Auth hook return value */
export interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  /** Force re-fetch user info */
  refresh: () => Promise<void>;
  /** Redirect to Entra ID login */
  login: () => void;
  /** Redirect to Entra ID logout */
  logout: () => void;
}

// --------------------------------------------------------------------------
// Helper: Extract user profile from MSAL account
// --------------------------------------------------------------------------

function accountToProfile(account: AccountInfo): UserProfile {
  return {
    name: account.name || account.username?.split('@')[0] || 'Unknown User',
    email: account.username || '',
    tenantId: account.tenantId || '',
    isAuthenticated: true,
    raw: account,
  };
}

// --------------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------------

export function useAuth(): AuthState {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive loading state from MSAL's interaction status
  const loading = inProgress !== InteractionStatus.None;

  // Sync user profile whenever accounts or auth state changes
  useEffect(() => {
    if (isAuthenticated && accounts.length > 0) {
      const activeAccount = instance.getActiveAccount() || accounts[0];
      setUser(accountToProfile(activeAccount));
      setError(null);
    } else if (inProgress === InteractionStatus.None && !isAuthenticated) {
      // Not authenticated and not in the middle of a flow
      setUser(null);
    }
  }, [isAuthenticated, accounts, inProgress, instance]);

  // Login via redirect (PKCE flow — no popup, full redirect)
  const login = useCallback(() => {
    instance.loginRedirect(loginRequest).catch((err) => {
      console.error('[useAuth] Login redirect failed:', err);
      setError(err.message);
    });
  }, [instance]);

  // Logout via redirect
  const logout = useCallback(() => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    }).catch((err) => {
      console.error('[useAuth] Logout redirect failed:', err);
      setError(err.message);
    });
  }, [instance]);

  // Refresh — silently acquire a new token to update account info
  const refresh = useCallback(async () => {
    try {
      const activeAccount = instance.getActiveAccount();
      if (activeAccount) {
        const response = await instance.acquireTokenSilent({
          ...loginRequest,
          account: activeAccount,
        });
        if (response.account) {
          setUser(accountToProfile(response.account));
        }
      }
    } catch (err: any) {
      console.warn('[useAuth] Silent token refresh failed:', err.message);
      setError(err.message);
    }
  }, [instance]);

  return { user, loading, error, refresh, login, logout };
}
