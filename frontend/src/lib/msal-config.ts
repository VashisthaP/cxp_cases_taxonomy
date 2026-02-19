// ==========================================================================
// MSAL.js Configuration — Entra ID SSO with PKCE (Secret-Free)
// Uses Authorization Code Flow with PKCE for public SPA clients.
// No client secret required — code_verifier + code_challenge per login.
// ==========================================================================

import { Configuration, LogLevel } from '@azure/msal-browser';

// --------------------------------------------------------------------------
// Entra ID App Registration Details
// --------------------------------------------------------------------------

/** Application (client) ID from Azure AD App Registration */
const CLIENT_ID = 'dc467a59-8f04-4731-9d01-adb99e237436';

/** Tenant ID — Microsoft Field Led Sandbox */
const TENANT_ID = '9329c02a-4050-4798-93ae-b6e37b19af6d';

/** Authority URL for single-tenant auth */
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

/** Redirect URI — must match SPA platform in App Registration */
const REDIRECT_URI =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://green-sky-059fc5900.1.azurestaticapps.net';

// --------------------------------------------------------------------------
// MSAL Configuration
// --------------------------------------------------------------------------

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: AUTHORITY,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: REDIRECT_URI,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage', // More secure than localStorage
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return; // Never log PII
        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
          case LogLevel.Info:
            // Only log in dev
            if (process.env.NODE_ENV === 'development') {
              console.info('[MSAL]', message);
            }
            break;
        }
      },
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
  },
};

// --------------------------------------------------------------------------
// Scopes — what the app requests from Entra ID
// --------------------------------------------------------------------------

/** Login request scopes (openid + profile + email gives us ID token claims) */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};
