// ==========================================================================
// JWT Authentication Middleware — Entra ID Token Validation
// Validates Bearer tokens from MSAL.js frontend using Microsoft JWKS.
// SFI/QEI Compliant: No local credentials, no shared secrets.
// ==========================================================================

import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

// --------------------------------------------------------------------------
// Configuration — from environment variables (no hardcoded secrets)
// --------------------------------------------------------------------------
const TENANT_ID = process.env.AZURE_TENANT_ID || '';
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '';

// JWKS endpoint for token signature validation (cached by jose library)
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const tenantId = TENANT_ID;
    if (!tenantId) {
      throw new Error('AZURE_TENANT_ID is not configured');
    }
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
  }
  return jwks;
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Authenticated user claims extracted from the validated JWT */
export interface AuthenticatedUser {
  /** Object ID (unique user identifier in Entra ID) */
  oid: string;
  /** Display name */
  name: string;
  /** Email / UPN */
  email: string;
  /** Tenant ID */
  tenantId: string;
}

// --------------------------------------------------------------------------
// CORS Headers (locked to known origins — no wildcard)
// --------------------------------------------------------------------------
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://green-sky-059fc5900.1.azurestaticapps.net';

export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  // Allow localhost for development, and the production SWA origin
  const allowedOrigins = [
    ALLOWED_ORIGIN,
    'http://localhost:3000',
  ];

  const origin = requestOrigin || '';
  const resolvedOrigin = allowedOrigins.includes(origin) ? origin : ALLOWED_ORIGIN;

  return {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// --------------------------------------------------------------------------
// Token Validation
// --------------------------------------------------------------------------

/**
 * Authenticate an incoming HTTP request by validating the Bearer token.
 * Returns the authenticated user or null if authentication fails.
 */
export async function authenticateRequest(
  request: HttpRequest
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  if (!TENANT_ID || !CLIENT_ID) {
    console.error('[Auth] AZURE_TENANT_ID or AZURE_CLIENT_ID not configured');
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      audience: CLIENT_ID,
    });

    return {
      oid: (payload.oid as string) || '',
      name: (payload.name as string) || '',
      email: (payload.preferred_username as string) || (payload.email as string) || '',
      tenantId: (payload.tid as string) || '',
    };
  } catch (error: any) {
    console.warn('[Auth] Token validation failed:', error.message);
    return null;
  }
}

/**
 * Returns a 401 Unauthorized response with CORS headers.
 */
export function unauthorizedResponse(requestOrigin?: string | null): HttpResponseInit {
  return {
    status: 401,
    headers: getCorsHeaders(requestOrigin),
    jsonBody: {
      success: false,
      error: 'Authentication required. Please sign in with your Microsoft account.',
    },
  };
}

/**
 * Returns a generic 500 error response without leaking internal details.
 */
export function safeErrorResponse(
  statusCode: number,
  userMessage: string,
  requestOrigin?: string | null
): HttpResponseInit {
  return {
    status: statusCode,
    headers: getCorsHeaders(requestOrigin),
    jsonBody: { success: false, error: userMessage },
  };
}
