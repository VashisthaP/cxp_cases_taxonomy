// ==========================================================================
// MSAL Auth Provider — Wraps the app with MsalProvider for Entra ID SSO
// Uses PKCE flow (Authorization Code + code_verifier/code_challenge).
// No client secret needed — fully secret-free browser authentication.
// ==========================================================================
'use client';

import React, { useEffect, useState } from 'react';
import {
  PublicClientApplication,
  EventType,
  EventMessage,
  AuthenticationResult,
} from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from '@/lib/msal-config';

// --------------------------------------------------------------------------
// Singleton MSAL instance (must be created once, outside React lifecycle)
// --------------------------------------------------------------------------

let msalInstance: PublicClientApplication | null = null;

function getMsalInstance(): PublicClientApplication {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  return msalInstance;
}

// --------------------------------------------------------------------------
// Provider Component
// --------------------------------------------------------------------------

interface MsalAuthProviderProps {
  children: React.ReactNode;
}

export function MsalAuthProvider({ children }: MsalAuthProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const instance = getMsalInstance();

  useEffect(() => {
    const init = async () => {
      try {
        await instance.initialize();

        // Handle redirect promise (resolves after returning from Entra ID login)
        const response = await instance.handleRedirectPromise();
        if (response) {
          instance.setActiveAccount(response.account);
        }

        // If no active account, set the first one from cache
        if (!instance.getActiveAccount()) {
          const accounts = instance.getAllAccounts();
          if (accounts.length > 0) {
            instance.setActiveAccount(accounts[0]);
          }
        }

        // Listen for login success events to set active account
        instance.addEventCallback((event: EventMessage) => {
          if (
            event.eventType === EventType.LOGIN_SUCCESS &&
            (event.payload as AuthenticationResult)?.account
          ) {
            instance.setActiveAccount(
              (event.payload as AuthenticationResult).account
            );
          }
        });

        setIsInitialized(true);
      } catch (error) {
        console.error('[MSAL] Initialization failed:', error);
        setIsInitialized(true); // Still render so error boundary can catch
      }
    };

    init();
  }, [instance]);

  if (!isInitialized) {
    return null; // Don't render children until MSAL is ready
  }

  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}

export { getMsalInstance };
