/**
 * Gmail API client with automatic token refresh and retry logic.
 *
 * This module provides a reusable Gmail client that handles:
 * - Token refresh on 401 errors
 * - Rate limit handling (429) with exponential backoff
 * - Configurable retry logic
 * - Batch API requests for efficiency
 *
 * Usage:
 * ```typescript
 * import { GmailClient } from "./util/gmail-client.ts";
 *
 * const client = new GmailClient(authCell, { debugMode: true });
 * const emails = await client.searchEmails("from:amazon.com", 20);
 * ```
 */
import { Cell, getRecipeEnvironment } from "commontools";

const env = getRecipeEnvironment();

// Re-export the Auth type for convenience
export type { Auth } from "../gmail-importer.tsx";
import type { Auth } from "../gmail-importer.tsx";

// ============================================================================
// TYPES
// ============================================================================

export interface GmailClientConfig {
  /** How many times the client will retry after an HTTP failure */
  retries?: number;
  /** In milliseconds, the delay between making any subsequent requests due to failure */
  delay?: number;
  /** In milliseconds, the amount to permanently increment to the `delay` on every 429 response */
  delayIncrement?: number;
  /** Enable verbose console logging */
  debugMode?: boolean;
}

/** Simplified email structure returned by searchEmails */
export interface SimpleEmail {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
  labelIds?: string[];
}

/** Full email structure with all Gmail fields */
export interface FullEmail {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  date: string;
  to: string;
  plainText: string;
  htmlContent: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function debugLog(debugMode: boolean, ...args: unknown[]) {
  if (debugMode) console.log("[GmailClient]", ...args);
}

function debugWarn(debugMode: boolean, ...args: unknown[]) {
  if (debugMode) console.warn("[GmailClient]", ...args);
}

// ============================================================================
// GMAIL CLIENT
// ============================================================================

/**
 * Gmail API client with automatic token refresh.
 *
 * ⚠️ CRITICAL: The auth cell MUST be writable for token refresh to work!
 * Do NOT pass a derived auth cell - use property access (charm.auth) instead.
 * See: community-docs/superstitions/2025-12-03-derive-creates-readonly-cells-use-property-access.md
 */
export class GmailClient {
  private auth: Cell<Auth>;
  private retries: number;
  private delay: number;
  private delayIncrement: number;
  private debugMode: boolean;

  constructor(
    auth: Cell<Auth>,
    {
      retries = 3,
      delay = 1000,
      delayIncrement = 100,
      debugMode = false,
    }: GmailClientConfig = {},
  ) {
    this.auth = auth;
    this.retries = retries;
    this.delay = delay;
    this.delayIncrement = delayIncrement;
    this.debugMode = debugMode;
  }

  /**
   * Refresh the OAuth token using the refresh token.
   * Updates the auth cell with new token data.
   */
  private async refreshAuth(): Promise<void> {
    const refreshToken = this.auth.get().refreshToken;
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    debugLog(this.debugMode, "Refreshing auth token...");

    const res = await fetch(
      new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
    );

    if (!res.ok) {
      throw new Error("Could not acquire a refresh token.");
    }

    const json = await res.json();
    const authData = json.tokenInfo as Auth;
    this.auth.update(authData);
    debugLog(this.debugMode, "Auth token refreshed successfully");
  }

  /**
   * Get the Gmail user profile.
   */
  async getProfile(): Promise<{
    emailAddress: string;
    messagesTotal: number;
    threadsTotal: number;
    historyId: string;
  }> {
    const url = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    );
    const res = await this.googleRequest(url);
    return await res.json();
  }

  /**
   * Search for emails matching a Gmail query.
   * Returns simplified email objects with body text.
   */
  async searchEmails(
    query: string,
    maxResults: number = 20,
  ): Promise<SimpleEmail[]> {
    // Step 1: Get message IDs matching the query
    const messages = await this.listMessages(query, maxResults);
    if (messages.length === 0) {
      return [];
    }

    debugLog(this.debugMode, `Found ${messages.length} messages for query: ${query}`);

    // Step 2: Fetch full message content
    const fullMessages = await this.fetchBatch(messages);

    // Step 3: Parse into SimpleEmail format
    return fullMessages.map((msg) => this.parseMessage(msg)).filter(Boolean) as SimpleEmail[];
  }

  /**
   * List message IDs matching a query (without fetching full content).
   * Alias: fetchEmail (for backwards compatibility with gmail-importer)
   */
  async listMessages(
    gmailFilterQuery: string = "in:INBOX",
    maxResults: number = 100,
  ): Promise<{ id: string; threadId?: string }[]> {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${
        encodeURIComponent(gmailFilterQuery)
      }&maxResults=${maxResults}`,
    );

    const res = await this.googleRequest(url);
    const json = await res.json();

    if (!json || !("messages" in json) || !Array.isArray(json.messages)) {
      debugLog(this.debugMode, `No messages found in response`);
      return [];
    }

    return json.messages;
  }

  /**
   * Alias for listMessages - for backwards compatibility with gmail-importer.
   */
  async fetchEmail(
    maxResults: number = 100,
    gmailFilterQuery: string = "in:INBOX",
  ): Promise<{ id: string; threadId?: string }[]> {
    return this.listMessages(gmailFilterQuery, maxResults);
  }

  /**
   * Fetch full message content for multiple message IDs using batch API.
   */
  async fetchBatch(messages: { id: string }[]): Promise<any[]> {
    if (messages.length === 0) return [];

    const boundary = `batch_${Math.random().toString(36).substring(2)}`;
    debugLog(this.debugMode, `Processing batch of ${messages.length} messages`);

    const batchBody =
      messages
        .map(
          (message, index) => `
--${boundary}
Content-Type: application/http
Content-ID: <batch-${index}+${message.id}>

GET /gmail/v1/users/me/messages/${message.id}?format=full
Authorization: Bearer $PLACEHOLDER
Accept: application/json

`,
        )
        .join("") + `--${boundary}--`;

    const batchResponse = await this.googleRequest(
      new URL("https://gmail.googleapis.com/batch/gmail/v1"),
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
        },
        body: batchBody,
      },
    );

    const responseText = await batchResponse.text();
    debugLog(this.debugMode, `Received batch response of length: ${responseText.length}`);

    // Parse batch response
    const HTTP_RES_REGEX = /HTTP\/\d\.\d (\d\d\d) ([^\n]*)/;
    const parts = responseText
      .split(`--batch_`)
      .slice(1, -1)
      .map((part) => {
        const httpResIndex = part.search(HTTP_RES_REGEX);
        const httpResMatch = part.match(HTTP_RES_REGEX);
        let httpStatus =
          httpResMatch && httpResMatch.length >= 2
            ? Number(httpResMatch[1])
            : 0;
        const httpMessage =
          httpResMatch && httpResMatch.length >= 3 ? httpResMatch[2] : "";

        try {
          const jsonStart = part.indexOf(`\n{`);
          if (jsonStart === -1) return null;

          if (httpResIndex > 0) {
            if (jsonStart <= httpResIndex) {
              httpStatus = 0;
            }
            if (httpStatus > 0 && httpStatus >= 400) {
              debugWarn(
                this.debugMode,
                `Non-successful HTTP status code (${httpStatus}) in batch: ${httpMessage}`,
              );
              return null;
            }
          }

          const jsonContent = part.slice(jsonStart).trim();
          return JSON.parse(jsonContent);
        } catch (error) {
          if (this.debugMode) console.error("Error parsing batch part:", error);
          return null;
        }
      })
      .filter((part) => part !== null);

    debugLog(this.debugMode, `Parsed ${parts.length} messages from batch`);
    return parts;
  }

  /**
   * Fetch message content by IDs (convenience wrapper around fetchBatch).
   */
  async fetchMessagesByIds(messageIds: string[]): Promise<any[]> {
    return await this.fetchBatch(messageIds.map((id) => ({ id })));
  }

  /**
   * Fetch Gmail history for incremental sync.
   */
  async fetchHistory(
    startHistoryId: string,
    labelId?: string,
    maxResults: number = 100,
  ): Promise<{
    history?: Array<{
      id: string;
      messages?: Array<{ id: string; threadId: string }>;
      messagesAdded?: Array<{
        message: { id: string; threadId: string; labelIds: string[] };
      }>;
      messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
      labelsAdded?: Array<{ message: { id: string }; labelIds: string[] }>;
      labelsRemoved?: Array<{ message: { id: string }; labelIds: string[] }>;
    }>;
    historyId: string;
    nextPageToken?: string;
  }> {
    const url = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/history",
    );
    url.searchParams.set("startHistoryId", startHistoryId);
    url.searchParams.set("maxResults", maxResults.toString());
    if (labelId) {
      url.searchParams.set("labelId", labelId);
    }

    debugLog(this.debugMode, `Fetching history from: ${url.toString()}`);
    const res = await this.googleRequest(url);
    const json = await res.json();
    debugLog(this.debugMode, `History API returned:`, {
      historyId: json.historyId,
      historyCount: json.history?.length || 0,
      hasNextPageToken: !!json.nextPageToken,
    });
    return json;
  }

  /**
   * Parse a raw Gmail message into SimpleEmail format.
   */
  private parseMessage(message: any): SimpleEmail | null {
    if (!message?.payload) return null;

    const headers = message.payload.headers || [];
    const getHeader = (name: string) =>
      headers.find(
        (h: { name: string; value: string }) =>
          h.name.toLowerCase() === name.toLowerCase(),
      )?.value || "";

    // Extract body text
    const extractText = (payload: any): string => {
      if (payload.body?.data) {
        try {
          return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        } catch {
          return "";
        }
      }
      if (payload.parts) {
        // Try plain text first
        for (const p of payload.parts) {
          if (p.mimeType === "text/plain" && p.body?.data) {
            try {
              return atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
            } catch {
              continue;
            }
          }
        }
        // Try HTML if no plain text
        for (const p of payload.parts) {
          if (p.mimeType === "text/html" && p.body?.data) {
            try {
              const html = atob(
                p.body.data.replace(/-/g, "+").replace(/_/g, "/"),
              );
              return html
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            } catch {
              continue;
            }
          }
        }
        // Recurse into nested parts
        for (const p of payload.parts) {
          const nested = extractText(p);
          if (nested) return nested;
        }
      }
      return "";
    };

    const body = extractText(message.payload);

    return {
      id: message.id,
      threadId: message.threadId,
      subject: getHeader("Subject"),
      from: getHeader("From"),
      date: getHeader("Date"),
      snippet: message.snippet || "",
      body: body.substring(0, 5000), // Limit body size
      labelIds: message.labelIds,
    };
  }

  /**
   * Make an authenticated request to the Gmail API.
   * Handles 401 (token refresh) and 429 (rate limit) automatically.
   */
  private async googleRequest(
    url: URL,
    _options?: RequestInit,
    _retries?: number,
  ): Promise<Response> {
    const token = this.auth.get().token;
    if (!token) {
      throw new Error("No authorization token.");
    }

    const retries = _retries ?? this.retries;
    const options = _options ?? {};
    options.headers = new Headers(options.headers);
    options.headers.set("Authorization", `Bearer ${token}`);

    // Rewrite authorization in body for batch requests
    if (options.body && typeof options.body === "string") {
      options.body = options.body.replace(
        /Authorization: Bearer [^\n]*/g,
        `Authorization: Bearer ${token}`,
      );
    }

    const res = await fetch(url, options);
    let { ok, status, statusText } = res;

    // Batch requests may return 200 with error in body
    if (options.method === "POST") {
      try {
        const json = await res.clone().json();
        if (json?.error?.code) {
          ok = false;
          status = json.error.code;
          statusText = json.error?.message;
        }
      } catch (_) {
        // Not JSON, probably a real success
      }
    }

    if (ok) {
      debugLog(this.debugMode, `${url}: ${status} ${statusText}`);
      return res;
    }

    debugWarn(
      this.debugMode,
      `${url}: ${status} ${statusText}`,
      `Remaining retries: ${retries}`,
    );

    if (retries === 0) {
      throw new Error(`Gmail API error: ${status} ${statusText}`);
    }

    await sleep(this.delay);

    if (status === 401) {
      await this.refreshAuth();
    } else if (status === 429) {
      this.delay += this.delayIncrement;
      debugLog(this.debugMode, `Rate limited, incrementing delay to ${this.delay}`);
      await sleep(this.delay);
    }

    return this.googleRequest(url, _options, retries - 1);
  }
}

/**
 * Validate a Gmail token by making a lightweight API call.
 * Returns { valid: true } or { valid: false, error: string }.
 *
 * Use this before starting a scan to check if re-authentication is needed.
 */
export async function validateGmailToken(
  token: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!token) {
    return { valid: false, error: "No token provided" };
  }

  try {
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.ok) {
      return { valid: true };
    }

    if (res.status === 401) {
      return { valid: false, error: "Token expired. Please re-authenticate." };
    }

    return { valid: false, error: `Gmail API error: ${res.status}` };
  } catch (err) {
    return { valid: false, error: `Network error: ${err}` };
  }
}
