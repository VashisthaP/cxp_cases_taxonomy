// ==========================================================================
// Azure OpenAI Service
// Handles embeddings generation and GPT-4o chat completions for RAG chatbot
// Includes rate limiting retry logic and error handling
//
// SFI/QEI Compliance:
//   - Supports managed identity via @azure/identity (DefaultAzureCredential)
//   - Falls back to API key only when managed identity is not enabled
//   - Error messages sanitized — no internal details leaked to callers
// ==========================================================================

import { DefaultAzureCredential, AccessToken } from '@azure/identity';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------
const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const CHAT_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
const EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-ada-002';
const API_VERSION = '2024-02-01';
const USE_MANAGED_IDENTITY = process.env.AZURE_USE_MANAGED_IDENTITY === 'true';

// --------------------------------------------------------------------------
// Managed Identity Token Cache
// --------------------------------------------------------------------------
const credential = USE_MANAGED_IDENTITY ? new DefaultAzureCredential() : null;
let cachedToken: AccessToken | null = null;

/**
 * Get a Bearer token for Azure OpenAI via managed identity.
 * Caches tokens and refreshes ~5 min before expiry.
 */
async function getOpenAIBearerToken(): Promise<string> {
  if (!credential) {
    throw new Error('Managed identity not configured');
  }

  const now = Date.now();
  // Refresh if token expired or expires within 5 minutes
  if (!cachedToken || cachedToken.expiresOnTimestamp - now < 5 * 60 * 1000) {
    cachedToken = await credential.getToken('https://cognitiveservices.azure.com/.default');
  }

  return cachedToken.token;
}

/**
 * Build authentication headers based on auth mode (managed identity or API key).
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (USE_MANAGED_IDENTITY && credential) {
    const token = await getOpenAIBearerToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  // Fallback to API key (for local development only)
  return {
    'Content-Type': 'application/json',
    'api-key': OPENAI_API_KEY,
  };
}

// --------------------------------------------------------------------------
// Rate limiting configuration
// Azure OpenAI has token-per-minute (TPM) and requests-per-minute (RPM) limits
// --------------------------------------------------------------------------
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 2000; // Start with 2s delay for rate limit retries

/**
 * Generate an embedding vector for the given text using Azure OpenAI.
 * Uses text-embedding-ada-002 model (1536 dimensions).
 *
 * @param text - Text to generate embedding for
 * @returns 1536-dimensional float array
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_ENDPOINT || (!OPENAI_API_KEY && !USE_MANAGED_IDENTITY)) {
    console.warn('[OpenAI] Endpoint or auth not configured. Returning empty embedding.');
    return [];
  }

  const url = `${OPENAI_ENDPOINT}/openai/deployments/${EMBEDDING_DEPLOYMENT}/embeddings?api-version=${API_VERSION}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: text.substring(0, 8000),
        }),
      });

      if (response.status === 429) {
        // Rate limited - extract retry-after header or use exponential backoff
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);

        console.warn(`[OpenAI] Rate limited (429). Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        // SFI: Log details server-side only, don't expose to callers
        console.error(`[OpenAI] Embedding error (${response.status}):`, errorBody);
        throw new Error(`Azure OpenAI embedding request failed (${response.status})`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error: any) {
      if (attempt === MAX_RETRIES) {
        console.error('[OpenAI] Embedding generation failed after retries:', error.message);
        // Return empty embedding rather than failing the entire operation
        // The case will be saved without embedding - chatbot queries won't find it
        return [];
      }

      // Retry on network errors
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.warn(`[OpenAI] Network error. Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  return [];
}

/**
 * Build a text representation of a case for embedding generation.
 * Combines key fields into a single string for semantic search.
 */
export function buildCaseEmbeddingText(caseData: Record<string, any>): string {
  const parts = [
    `Case ID: ${caseData.case_id || ''}`,
    `TA Name: ${caseData.ta_name || ''}`,
    `Case Type: ${caseData.case_type || ''}`,
    `Issue Type: ${caseData.issue_type || ''}`,
    `FQR Accurate: ${caseData.fqr_accurate || ''}`,
    `FQR Help Resolve: ${caseData.fqr_help_resolve || ''}`,
    `Idle Over 8 Hours: ${caseData.idle_over_8_hours ? 'Yes' : 'No'}`,
    caseData.idleness_reason ? `Idleness Reason: ${caseData.idleness_reason}` : '',
    caseData.collab_wait_reason ? `Collab Wait Reason: ${caseData.collab_wait_reason}` : '',
    caseData.pg_wait_reason ? `PG Wait Reason: ${caseData.pg_wait_reason}` : '',
    `Case Complexity: ${caseData.case_complexity || ''}`,
    `ICM Linked: ${caseData.icm_linked ? 'Yes' : 'No'}`,
    `Source of Resolution: ${caseData.source_of_resolution || ''}`,
    caseData.ta_reviewer_notes ? `Reviewer Notes: ${caseData.ta_reviewer_notes}` : '',
    caseData.next_action_sna ? `SNA: ${caseData.next_action_sna}` : '',
  ].filter(Boolean);

  return parts.join('. ');
}

/**
 * RAG Chat Completion using Azure OpenAI GPT-4o.
 * Takes user query + relevant case context and generates a response.
 *
 * @param userQuery - The user's natural language question
 * @param contextCases - Case data retrieved via pgvector similarity search
 * @param conversationHistory - Previous messages for multi-turn conversation
 * @returns AI-generated response string
 */
export async function chatCompletion(
  userQuery: string,
  contextCases: Record<string, any>[],
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  if (!OPENAI_ENDPOINT || (!OPENAI_API_KEY && !USE_MANAGED_IDENTITY)) {
    return 'AI Assistant is not configured. Please contact your administrator.';
  }

  const url = `${OPENAI_ENDPOINT}/openai/deployments/${CHAT_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

  // Build the RAG context from retrieved cases
  const caseContext = contextCases.length > 0
    ? contextCases.map((c, i) => {
        return `Case ${i + 1}:
  - Case ID: ${c.case_id}
  - TA Name: ${c.ta_name || 'N/A'}
  - Case Type: ${c.case_type || 'N/A'}
  - Issue Type: ${c.issue_type || 'N/A'}
  - Reviewed: ${c.case_reviewed ? 'Yes' : 'No'}
  - Idle > 8hrs: ${c.idle_over_8_hours ? 'Yes' : 'No'}${c.idleness_reason ? ` (Reason: ${c.idleness_reason})` : ''}
  - Case Complexity: ${c.case_complexity || 'N/A'}
  - Source of Resolution: ${c.source_of_resolution || 'N/A'}
  - FQR Accurate: ${c.fqr_accurate || 'N/A'}
  - FQR Help Resolve: ${c.fqr_help_resolve || 'N/A'}
  - ICM Linked: ${c.icm_linked ? 'Yes' : 'No'}
  - Reviewer Notes: ${c.ta_reviewer_notes || 'N/A'}
  - SNA: ${c.next_action_sna || 'N/A'}`;
      }).join('\n\n')
    : 'No matching cases found in the database.';

  // System prompt for the RAG chatbot
  const systemPrompt = `You are an AI assistant for BC VM PCY - Case Taxonomy Insights, an internal auditing tool for support cases.

Your role is to help users analyze, summarize, and query their case data. You have access to the following case data from the database:

${caseContext}

Guidelines:
1. Answer questions based on the provided case data context.
2. If the data doesn't contain enough information to answer, say so clearly.
3. Provide concise, actionable summaries when asked about patterns or trends.
4. Use specific Case IDs when referencing individual cases.
5. Format your responses with clear structure using bullet points and headers when appropriate.
6. For quantitative questions, provide exact counts from the data.
7. Never make up case data that isn't in the context provided.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6), // Keep last 6 messages for context window management
    { role: 'user', content: userQuery },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages,
          temperature: 0.3, // Low temperature for factual, consistent responses
          max_tokens: 1500,
          top_p: 0.9,
        }),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);

        console.warn(`[OpenAI] Chat rate limited (429). Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        // SFI: Log details server-side only
        console.error(`[OpenAI] Chat error (${response.status}):`, errorBody);
        throw new Error(`Azure OpenAI chat request failed (${response.status})`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || 'No response generated.';
    } catch (error: any) {
      if (attempt === MAX_RETRIES) {
        console.error('[OpenAI] Chat completion failed after retries:', error.message);
        // SFI: Do not leak error details to end users
        return 'I\'m sorry, I encountered an error while processing your request. Please try again.';
      }

      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
      console.warn(`[OpenAI] Chat error. Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return 'Unable to generate a response at this time. Please try again later.';
}
