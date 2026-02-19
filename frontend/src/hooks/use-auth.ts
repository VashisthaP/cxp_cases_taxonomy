// ==========================================================================
// useAuth Hook - Azure Static Web Apps Entra ID Authentication
// Calls /.auth/me to retrieve the logged-in user's identity from SWA
// built-in authentication (Entra ID / Azure AD).
// ==========================================================================

import { useState, useEffect } from 'react';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Claim from the SWA client principal */
export interface AuthClaim {
  typ: string;
  val: string;
}

/** The clientPrincipal object returned by /.auth/me */
export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string; // email / UPN
  userRoles: string[];
  claims: AuthClaim[];
}

/** Parsed user profile from the authentication context */
export interface UserProfile {
  /** Display name (from 'name' claim, or derived from email) */
  name: string;
  /** Email / UPN */
  email: string;
  /** Provider (e.g., 'aad') */
  provider: string;
  /** Roles assigned */
  roles: string[];
  /** Whether this user has the 'authenticated' role */
  isAuthenticated: boolean;
  /** Raw client principal for advanced use */
  raw?: ClientPrincipal;
}

/** Auth hook return value */
export interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  /** Force re-fetch user info */
  refresh: () => Promise<void>;
  /** Redirect to login */
  login: () => void;
  /** Redirect to logout */
  logout: () => void;
}

// --------------------------------------------------------------------------
// Helper: Parse name from claims or email
// --------------------------------------------------------------------------

function extractName(principal: ClientPrincipal): string {
  // Try the 'name' claim first (display name from Entra ID)
  const nameClaim = principal.claims?.find(
    (c) => c.typ === 'name' || c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
  );
  if (nameClaim?.val) return nameClaim.val;

  // Try 'preferred_username' claim
  const preferredUsername = principal.claims?.find(
    (c) => c.typ === 'preferred_username'
  );
  if (preferredUsername?.val) return preferredUsername.val;

  // Fall back to userDetails (email) - extract name part before @
  if (principal.userDetails) {
    const atIndex = principal.userDetails.indexOf('@');
    if (atIndex > 0) {
      return principal.userDetails
        .substring(0, atIndex)
        .split('.')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    return principal.userDetails;
  }

  return 'Unknown User';
}

// --------------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------------

export function useAuth(): AuthState {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/.auth/me');

      if (!response.ok) {
        // In local dev (no SWA), /.auth/me won't exist
        throw new Error(`Auth endpoint returned ${response.status}`);
      }

      const data = await response.json();
      const principal: ClientPrincipal | null = data?.clientPrincipal;

      if (principal) {
        setUser({
          name: extractName(principal),
          email: principal.userDetails || '',
          provider: principal.identityProvider || 'unknown',
          roles: principal.userRoles || [],
          isAuthenticated: principal.userRoles?.includes('authenticated') ?? false,
          raw: principal,
        });
      } else {
        // No principal = not logged in. SWA route guard should redirect,
        // but handle gracefully for local dev.
        setUser(null);
      }
    } catch (err: any) {
      console.warn('[useAuth] Could not fetch auth info:', err.message);
      // In local development, fall back to a dev user
      if (
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ) {
        setUser({
          name: 'Local Dev User',
          email: 'dev@localhost',
          provider: 'dev',
          roles: ['authenticated', 'anonymous'],
          isAuthenticated: true,
        });
      } else {
        setError(err.message);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = () => {
    window.location.href = '/.auth/login/aad';
  };

  const logout = () => {
    window.location.href = '/.auth/logout';
  };

  return { user, loading, error, refresh: fetchUser, login, logout };
}
