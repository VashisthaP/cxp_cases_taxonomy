// ==========================================================================
// API Client - Axios-based HTTP client for Azure Functions backend
// Implements retry logic, timeout handling, error normalization,
// and Bearer token injection via MSAL.js
//
// SFI/QEI: All API calls include JWT Bearer token from Entra ID
// ==========================================================================

import axios, { AxiosInstance, AxiosError } from 'axios';
import { CaseData, ApiResponse, PaginatedResponse, ChatMessage, ChatRequest, DashboardStats, InsightsData } from '@/types/case';
import { CaseFormValues } from '@/lib/validation';
import { getMsalInstance } from '@/components/msal-auth-provider';
import { apiTokenRequest } from '@/lib/msal-config';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

/** Base URL for the Azure Functions API */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

/** Request timeout in milliseconds (30 seconds to handle cold starts) */
const REQUEST_TIMEOUT = 30000;

/** Maximum retry attempts for failed requests */
const MAX_RETRIES = 3;

/** Base delay between retries in ms (exponential backoff) */
const RETRY_BASE_DELAY = 1000;

// --------------------------------------------------------------------------
// Axios Instance with Interceptors
// --------------------------------------------------------------------------

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --------------------------------------------------------------------------
// Request Interceptor — Inject Entra ID Bearer Token
// Acquires a token silently from MSAL cache and attaches it to every request.
// SFI/QEI: No API call goes out without authentication
// --------------------------------------------------------------------------
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const msalInstance = getMsalInstance();
      const account = msalInstance.getActiveAccount();
      if (account) {
        const response = await msalInstance.acquireTokenSilent({
          ...apiTokenRequest,
          account,
        });
        // Send the ID token as Bearer — backend validates against Entra ID JWKS
        if (response.idToken) {
          config.headers.Authorization = `Bearer ${response.idToken}`;
        }
      }
    } catch (err) {
      // If silent acquisition fails, the request proceeds without token
      // The backend will return 401, and the frontend auth guard will redirect to login
      console.warn('[API] Token acquisition failed, request will be unauthenticated');
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Retry logic with exponential backoff.
 * Handles network errors, 429 (rate limiting), and 5xx server errors.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as any;

    // Initialize retry count
    if (!config || !config._retryCount) {
      if (config) config._retryCount = 0;
    }

    // Determine if the error is retryable
    const isRetryable =
      !error.response || // Network error
      error.response.status === 429 || // Rate limited (Azure OpenAI)
      error.response.status >= 500; // Server error

    if (isRetryable && config && config._retryCount < MAX_RETRIES) {
      config._retryCount += 1;

      // Exponential backoff: 1s, 2s, 4s
      const delay = RETRY_BASE_DELAY * Math.pow(2, config._retryCount - 1);
      console.warn(
        `[API] Retry ${config._retryCount}/${MAX_RETRIES} after ${delay}ms for ${config.url}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(config);
    }

    // Normalize error for consumers
    const normalizedError = {
      message: getErrorMessage(error),
      status: error.response?.status,
      code: error.code,
    };

    return Promise.reject(normalizedError);
  }
);

/**
 * Extracts a human-readable error message from an Axios error.
 */
function getErrorMessage(error: AxiosError): string {
  if (error.response?.data) {
    const data = error.response.data as any;
    if (data.error) return data.error;
    if (data.message) return data.message;
  }

  if (error.code === 'ECONNABORTED') {
    return 'Request timed out. The server may be experiencing high load.';
  }

  if (!error.response) {
    return 'Network error. Please check your connection and try again.';
  }

  switch (error.response.status) {
    case 400: return 'Invalid request. Please check your input.';
    case 404: return 'Resource not found.';
    case 409: return 'Duplicate Case ID. This case already exists.';
    case 429: return 'Too many requests. Please wait a moment and try again.';
    case 500: return 'Internal server error. Please try again later.';
    default: return `An unexpected error occurred (${error.response.status}).`;
  }
}

// --------------------------------------------------------------------------
// API Functions - Cases CRUD
// --------------------------------------------------------------------------

/**
 * Create a new case entry.
 * @throws Error with duplicate Case ID message if case_id already exists (409)
 */
export async function createCase(caseData: CaseFormValues): Promise<ApiResponse<CaseData>> {
  const response = await apiClient.post<ApiResponse<CaseData>>('/cases', caseData);
  return response.data;
}

/**
 * Get a single case by its Case ID.
 */
export async function getCaseById(caseId: string): Promise<ApiResponse<CaseData>> {
  const response = await apiClient.get<ApiResponse<CaseData>>(`/cases/${encodeURIComponent(caseId)}`);
  return response.data;
}

/**
 * Update an existing case.
 */
export async function updateCase(caseId: string, caseData: Partial<CaseFormValues>): Promise<ApiResponse<CaseData>> {
  const response = await apiClient.put<ApiResponse<CaseData>>(
    `/cases/${encodeURIComponent(caseId)}`,
    caseData
  );
  return response.data;
}

/**
 * Delete a case by its Case ID.
 */
export async function deleteCase(caseId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete<ApiResponse<void>>(`/cases/${encodeURIComponent(caseId)}`);
  return response.data;
}

/**
 * List cases with pagination, search, and filtering.
 */
export async function listCases(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  caseType?: string;
  issueType?: string;
  reviewed?: boolean;
}): Promise<ApiResponse<PaginatedResponse<CaseData>>> {
  const response = await apiClient.get<ApiResponse<PaginatedResponse<CaseData>>>('/cases', {
    params: {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      search: params.search || undefined,
      caseType: params.caseType || undefined,
      issueType: params.issueType || undefined,
      reviewed: params.reviewed !== undefined ? params.reviewed : undefined,
    },
  });
  return response.data;
}

// --------------------------------------------------------------------------
// API Functions - Dashboard
// --------------------------------------------------------------------------

/**
 * Get dashboard summary statistics.
 */
export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  const response = await apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats');
  return response.data;
}

/**
 * Get dashboard insights data (FQR analysis, idle breakdown, resolution sources, etc.).
 */
export async function getDashboardInsights(): Promise<ApiResponse<InsightsData>> {
  const response = await apiClient.get<ApiResponse<InsightsData>>('/dashboard/insights');
  return response.data;
}

// --------------------------------------------------------------------------
// API Functions - Agentic Chatbot
// --------------------------------------------------------------------------

/**
 * Send a message to the RAG-based chatbot.
 * Queries the case database using natural language via Azure OpenAI GPT-4o.
 */
export async function sendChatMessage(request: ChatRequest): Promise<ApiResponse<ChatMessage>> {
  const response = await apiClient.post<ApiResponse<ChatMessage>>('/chat', request, {
    // Longer timeout for AI responses
    timeout: 60000,
  });
  return response.data;
}

/**
 * Check the health status of the backend API.
 */
export async function healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
  const response = await apiClient.get<ApiResponse<{ status: string; timestamp: string }>>('/health');
  return response.data;
}

export default apiClient;
