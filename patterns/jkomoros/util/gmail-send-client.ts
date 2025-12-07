/**
 * Gmail Send API client for composing and sending emails.
 *
 * This module provides a client for sending emails via Gmail API:
 * - RFC 2822 MIME message construction
 * - Base64url encoding for Gmail API
 * - Thread reply support with In-Reply-To headers
 * - Token refresh on 401 errors
 *
 * Usage:
 * ```typescript
 * import { GmailSendClient } from "./util/gmail-send-client.ts";
 *
 * const client = new GmailSendClient(authCell, { debugMode: true });
 * const result = await client.sendEmail({
 *   to: "recipient@example.com",
 *   subject: "Hello",
 *   body: "World!",
 * });
 * ```
 */
import { Cell, getRecipeEnvironment } from "commontools";

const env = getRecipeEnvironment();

// Re-export the Auth type for convenience
export type { Auth } from "../google-auth.tsx";
import type { Auth } from "../google-auth.tsx";

// ============================================================================
// TYPES
// ============================================================================

export interface GmailSendClientConfig {
  /** Enable verbose console logging */
  debugMode?: boolean;
}

export interface SendEmailParams {
  /** Recipient email address (required) */
  to: string;
  /** Email subject line (required) */
  subject: string;
  /** Plain text body (required) */
  body: string;
  /** CC recipients (optional, comma-separated) */
  cc?: string;
  /** BCC recipients (optional, comma-separated) */
  bcc?: string;
  /** Message ID to reply to (for threading) */
  replyToMessageId?: string;
  /** Thread ID to reply to (for threading) */
  replyToThreadId?: string;
}

export interface SendEmailResult {
  /** Gmail message ID */
  id: string;
  /** Gmail thread ID */
  threadId: string;
  /** Labels applied to the message */
  labelIds: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

function debugLog(debugMode: boolean, ...args: unknown[]) {
  if (debugMode) console.log("[GmailSendClient]", ...args);
}

/**
 * Encode a string as base64url (Gmail API format).
 * Handles UTF-8 characters properly.
 */
function base64UrlEncode(str: string): string {
  // Use encodeURIComponent to handle UTF-8, then convert to base64
  const utf8Bytes = unescape(encodeURIComponent(str));
  const base64 = btoa(utf8Bytes);
  // Convert to base64url: replace + with -, / with _, and remove padding
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Encode a header value using RFC 2047 if it contains non-ASCII characters.
 * This ensures subjects with Unicode characters are properly encoded.
 */
function encodeHeaderValue(value: string): string {
  // Check if value contains non-ASCII characters
  if (!/^[\x00-\x7F]*$/.test(value)) {
    // Use UTF-8 B (base64) encoding for non-ASCII
    const utf8Bytes = unescape(encodeURIComponent(value));
    const base64 = btoa(utf8Bytes);
    return `=?UTF-8?B?${base64}?=`;
  }
  return value;
}

// ============================================================================
// GMAIL SEND CLIENT
// ============================================================================

/**
 * Gmail Send API client.
 *
 * Sends emails via Gmail API using RFC 2822 MIME format.
 *
 * IMPORTANT: Requires the gmail.send scope to be authorized.
 * The auth cell MUST be writable for token refresh to work!
 */
export class GmailSendClient {
  private auth: Cell<Auth>;
  private debugMode: boolean;

  constructor(
    auth: Cell<Auth>,
    { debugMode = false }: GmailSendClientConfig = {},
  ) {
    this.auth = auth;
    this.debugMode = debugMode;
  }

  /**
   * Send an email via Gmail API.
   *
   * Constructs an RFC 2822 MIME message and sends it using the
   * Gmail messages.send endpoint.
   *
   * @param params - Email parameters (to, subject, body, etc.)
   * @returns The sent message metadata (id, threadId, labelIds)
   * @throws Error if sending fails or auth is invalid
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const token = this.auth.get()?.token;
    if (!token) {
      throw new Error("No authorization token. Please authenticate first.");
    }

    debugLog(this.debugMode, "Preparing email:", {
      to: params.to,
      subject: params.subject,
      bodyLength: params.body.length,
      hasReplyTo: !!params.replyToMessageId,
    });

    // Build RFC 2822 MIME message
    const messageParts: string[] = [];

    // Required headers
    messageParts.push(`To: ${params.to}`);
    if (params.cc) {
      messageParts.push(`Cc: ${params.cc}`);
    }
    if (params.bcc) {
      messageParts.push(`Bcc: ${params.bcc}`);
    }
    messageParts.push(`Subject: ${encodeHeaderValue(params.subject)}`);
    messageParts.push('Content-Type: text/plain; charset="UTF-8"');
    messageParts.push("MIME-Version: 1.0");

    // Thread reply headers (for proper threading in Gmail)
    if (params.replyToMessageId) {
      messageParts.push(`In-Reply-To: ${params.replyToMessageId}`);
      messageParts.push(`References: ${params.replyToMessageId}`);
    }

    // Empty line separates headers from body (RFC 2822)
    messageParts.push("");
    messageParts.push(params.body);

    const rawMessage = messageParts.join("\r\n");

    // Encode as base64url for Gmail API
    const encodedMessage = base64UrlEncode(rawMessage);

    // Build request body
    const requestBody: Record<string, string> = { raw: encodedMessage };
    if (params.replyToThreadId) {
      requestBody.threadId = params.replyToThreadId;
    }

    debugLog(this.debugMode, "Sending email...");

    // Send the email
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    // Handle 401 (token expired) - try to refresh and retry once
    if (res.status === 401) {
      debugLog(this.debugMode, "Token expired, attempting refresh...");
      await this.refreshAuth();
      return this.sendEmail(params); // Retry with new token
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const errorMessage = error.error?.message || res.statusText;
      debugLog(this.debugMode, "Send failed:", res.status, errorMessage);
      throw new Error(`Gmail API error: ${res.status} ${errorMessage}`);
    }

    const result = await res.json();
    debugLog(this.debugMode, "Email sent successfully:", result.id);

    return {
      id: result.id,
      threadId: result.threadId,
      labelIds: result.labelIds || [],
    };
  }

  /**
   * Refresh the OAuth token using the refresh token.
   * Updates the auth cell with new token data.
   */
  private async refreshAuth(): Promise<void> {
    const refreshToken = this.auth.get()?.refreshToken;
    if (!refreshToken) {
      throw new Error("No refresh token available. Please re-authenticate.");
    }

    debugLog(this.debugMode, "Refreshing auth token...");

    const res = await fetch(
      new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      },
    );

    if (!res.ok) {
      throw new Error("Token refresh failed. Please re-authenticate.");
    }

    const json = await res.json();
    if (!json.tokenInfo) {
      throw new Error("Invalid refresh response");
    }

    // Update auth cell with new token data
    // Keep existing user info since refresh doesn't return it
    const currentAuth = this.auth.get();
    this.auth.update({
      ...json.tokenInfo,
      user: currentAuth?.user,
    });

    debugLog(this.debugMode, "Auth token refreshed successfully");
  }
}
