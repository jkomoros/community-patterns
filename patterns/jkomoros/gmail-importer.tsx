/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  getRecipeEnvironment,
  handler,
  ifElse,
  NAME,
  navigateTo,
  patternTool,
  pattern,
  str,
  UI,
  wish,
} from "commontools";
import GoogleAuth from "./google-auth.tsx";
import TurndownService from "turndown";
import { GmailClient } from "./util/gmail-client.ts";

type CFC<T, C extends string> = T;
type Secret<T> = CFC<T, "secret">;
type Confidential<T> = CFC<T, "confidential">;

/**
 * Auth data structure for Google OAuth tokens.
 *
 * ⚠️ CRITICAL: When consuming this auth, DO NOT use derive()!
 * derive() creates read-only projections - token refresh will silently fail.
 * Use property access (charm.auth) or ifElse() instead.
 *
 * See: community-docs/superstitions/2025-12-03-derive-creates-readonly-cells-use-property-access.md
 */
export type Auth = {
  token: Default<Secret<string>, "">;
  tokenType: Default<string, "">;
  scope: Default<string[], []>;
  expiresIn: Default<number, 0>;
  expiresAt: Default<number, 0>;
  refreshToken: Default<Secret<string>, "">;
  user: Default<{
    email: string;
    name: string;
    picture: string;
  }, { email: ""; name: ""; picture: "" }>;
};

// Initialize turndown service
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

const env = getRecipeEnvironment();

turndown.addRule("removeStyleTags", {
  filter: ["style"],
  replacement: function () {
    return "";
  },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Email = {
  // Unique identifier for the email
  id: string;
  // Identifier for the email thread
  threadId: string;
  // Labels assigned to the email
  labelIds: Default<string[], []>;
  // Brief preview of the email content
  snippet: string;
  // Email subject line
  subject: string;
  // Sender's email address
  from: string;
  // Date and time when the email was sent
  date: string;
  // Recipient's email address
  to: string;
  // Email content in plain text format (often empty)
  plainText: string;
  // Email content in HTML format
  htmlContent: string;
  // Email content converted to Markdown format. Often best for processing email contents.
  markdownContent: string;
};

type Settings = {
  // Gmail filter query to use for fetching emails
  gmailFilterQuery: Default<string, "in:INBOX">;
  // Maximum number of emails to fetch
  limit: Default<number, 100>;
  // Gmail history ID for incremental sync
  historyId: Default<string, "">;
  // Enable verbose console logging for debugging
  debugMode: Default<boolean, false>;
};

/** Gmail email importer for fetching and viewing emails. #gmailEmails */
interface Output {
  emails: Email[];
  /** Number of emails imported */
  emailCount: number;
}

// Debug logging helpers - pass debugMode explicitly to avoid module-level state issues
function debugLog(debugMode: boolean, ...args: unknown[]) {
  if (debugMode) console.log("[GmailImporter]", ...args);
}
function debugWarn(debugMode: boolean, ...args: unknown[]) {
  if (debugMode) console.warn("[GmailImporter]", ...args);
}

const updateLimit = handler<
  { detail: { value: string } },
  { limit: Cell<number> }
>(
  ({ detail }, state) => {
    state.limit.set(parseInt(detail?.value ?? "100") || 0);
  },
);

// GmailClient is now imported from ./util/gmail-client.ts
// This enables code reuse with gmail-agentic-search and ensures
// consistent token refresh behavior across all Gmail patterns.

const googleUpdater = handler<unknown, {
  emails: Cell<Email[]>;
  auth: Cell<Auth>;
  settings: Cell<{
    gmailFilterQuery: string;
    limit: number;
    historyId: string;
    debugMode: boolean;
  }>;
  fetching?: Cell<boolean>;
}>(
  async (_event, state) => {
    // Set fetching state if available
    if (state.fetching) {
      state.fetching.set(true);
    }
    const debugMode = state.settings.get().debugMode || false;

    debugLog(debugMode, "googleUpdater!");

    if (!state.auth.get().token) {
      debugWarn(debugMode, "no token found in auth cell");
      if (state.fetching) state.fetching.set(false);
      return;
    }

    const settings = state.settings.get();
    const gmailFilterQuery = settings.gmailFilterQuery;

    debugLog(debugMode, "gmailFilterQuery", gmailFilterQuery);

    let result;
    try {
      result = await process(
        state.auth,
        settings.limit,
        gmailFilterQuery,
        { emails: state.emails, settings: state.settings },
        debugMode,
      );
    } finally {
      // Clear fetching state
      if (state.fetching) state.fetching.set(false);
    }

    if (!result) return;

    // Handle deleted emails
    if (result.deletedEmailIds && result.deletedEmailIds.length > 0) {
      debugLog(debugMode, `Removing ${result.deletedEmailIds.length} deleted messages`);
      const deleteSet = new Set(result.deletedEmailIds);
      const currentEmails = state.emails.get();
      const remainingEmails = currentEmails.filter((email) =>
        !deleteSet.has(email.id)
      );
      state.emails.set(remainingEmails);
    }

    // Add new emails
    if (result.newEmails && result.newEmails.length > 0) {
      debugLog(debugMode, `Adding ${result.newEmails.length} new emails`);
      state.emails.push(...result.newEmails);
    }

    // Update historyId
    if (result.newHistoryId) {
      const currentSettings = state.settings.get();
      debugLog(debugMode, "=== UPDATING HISTORY ID ===");
      debugLog(debugMode, "Previous historyId:", currentSettings.historyId || "none");
      debugLog(debugMode, "New historyId:", result.newHistoryId);
      state.settings.set({
        ...currentSettings,
        historyId: result.newHistoryId,
      });
      debugLog(debugMode, "HistoryId updated successfully");
      debugLog(debugMode, "==========================");
    }
  },
);

// Helper function to decode base64 encoded email parts
function decodeBase64(data: string) {
  // Replace URL-safe characters back to their original form
  const sanitized = data.replace(/-/g, "+").replace(/_/g, "/");
  // Decode the base64 string
  return atob(sanitized);
}

// Helper function to extract email address from a header value
function extractEmailAddress(header: string): string {
  const emailMatch = header.match(/<([^>]*)>/);
  if (emailMatch && emailMatch[1]) {
    return emailMatch[1];
  }
  return header;
}

// Helper function to extract header value from message headers
function getHeader(headers: any[], name: string): string {
  const header = headers.find((h) =>
    h.name.toLowerCase() === name.toLowerCase()
  );
  return header ? header.value : "";
}

function messageToEmail(
  parts: any[],
  debugMode: boolean = false,
): Email[] {
  return parts.map((messageData, index) => {
    try {
      // DEBUG: Log raw message structure
      debugLog(debugMode, `\n[messageToEmail] Processing message ${index + 1}/${parts.length}`);
      debugLog(debugMode, `[messageToEmail] Message ID: ${messageData.id}`);
      debugLog(debugMode, `[messageToEmail] Has payload: ${!!messageData.payload}`);
      debugLog(debugMode, `[messageToEmail] Has payload.parts: ${!!messageData.payload?.parts}`);
      debugLog(debugMode, `[messageToEmail] Payload.parts length: ${messageData.payload?.parts?.length || 0}`);
      debugLog(debugMode, `[messageToEmail] Has payload.body: ${!!messageData.payload?.body}`);
      debugLog(debugMode, `[messageToEmail] Has payload.body.data: ${!!messageData.payload?.body?.data}`);
      debugLog(debugMode, `[messageToEmail] Payload.mimeType: ${messageData.payload?.mimeType}`);

      if (!messageData.payload?.headers) {
        debugLog(debugMode, "[messageToEmail] ERROR: Missing required message data:", messageData);
        return null;
      }

      const messageHeaders = messageData.payload.headers;
      const subject = getHeader(messageHeaders, "Subject");
      const from = getHeader(messageHeaders, "From");
      const to = getHeader(messageHeaders, "To");
      const date = getHeader(messageHeaders, "Date");

      debugLog(debugMode, `[messageToEmail] Subject: ${subject}`);
      debugLog(debugMode, `[messageToEmail] From: ${from}`);

      let plainText = "";
      let htmlContent = "";

      if (
        messageData.payload.parts && Array.isArray(messageData.payload.parts)
      ) {
        debugLog(debugMode, `[messageToEmail] Processing ${messageData.payload.parts.length} parts`);

        // Log structure of each part
        messageData.payload.parts.forEach((part: any, partIndex: number) => {
          debugLog(debugMode, `[messageToEmail] Part ${partIndex + 1}:`);
          debugLog(debugMode, `  - mimeType: ${part.mimeType}`);
          debugLog(debugMode, `  - Has body: ${!!part.body}`);
          debugLog(debugMode, `  - Has body.data: ${!!part.body?.data}`);
          debugLog(debugMode, `  - body.size: ${part.body?.size || 0}`);
          debugLog(debugMode, `  - Has nested parts: ${!!part.parts}`);
          debugLog(debugMode, `  - Nested parts length: ${part.parts?.length || 0}`);
        });

        // Look for plainText part
        const textPart = messageData.payload.parts.find(
          (part: any) => part.mimeType === "text/plain",
        );
        debugLog(debugMode, `[messageToEmail] Found text/plain part: ${!!textPart}`);
        if (textPart?.body?.data) {
          plainText = decodeBase64(textPart.body.data);
          debugLog(debugMode, `[messageToEmail] Decoded plainText length: ${plainText.length}`);
        } else {
          debugLog(debugMode, `[messageToEmail] text/plain part has no body.data`);
        }

        // Look for HTML part
        const htmlPart = messageData.payload.parts.find(
          (part: any) => part.mimeType === "text/html",
        );
        debugLog(debugMode, `[messageToEmail] Found text/html part: ${!!htmlPart}`);
        if (htmlPart?.body?.data) {
          htmlContent = decodeBase64(htmlPart.body.data);
          debugLog(debugMode, `[messageToEmail] Decoded htmlContent length: ${htmlContent.length}`);
        } else {
          debugLog(debugMode, `[messageToEmail] text/html part has no body.data`);
        }

        // Handle multipart messages - check for nested parts
        if (htmlContent === "") {
          debugLog(debugMode, `[messageToEmail] No HTML found in top-level parts, checking nested parts...`);
          for (const part of messageData.payload.parts) {
            if (part.parts && Array.isArray(part.parts)) {
              debugLog(debugMode, `[messageToEmail] Found nested parts container with ${part.parts.length} nested parts`);
              const nestedHtmlPart = part.parts.find(
                (nestedPart: any) => nestedPart.mimeType === "text/html",
              );
              if (nestedHtmlPart?.body?.data) {
                htmlContent = decodeBase64(nestedHtmlPart.body.data);
                debugLog(debugMode, `[messageToEmail] Found HTML in nested part, length: ${htmlContent.length}`);
                break;
              }
            }
          }
        }
      } else if (messageData.payload.body?.data) {
        debugLog(debugMode, `[messageToEmail] Single part message`);
        debugLog(debugMode, `[messageToEmail] body.size: ${messageData.payload.body.size}`);
        const bodyData = decodeBase64(messageData.payload.body.data);
        debugLog(debugMode, `[messageToEmail] Decoded body length: ${bodyData.length}`);
        if (messageData.payload.mimeType === "text/html") {
          htmlContent = bodyData;
          debugLog(debugMode, `[messageToEmail] Set as htmlContent`);
        } else {
          plainText = bodyData;
          debugLog(debugMode, `[messageToEmail] Set as plainText`);
        }
      } else {
        debugLog(debugMode, `[messageToEmail] ERROR: No payload.parts and no payload.body.data - message has NO CONTENT SOURCE!`);
      }

      // Generate markdown content from HTML or plainText
      let markdownContent = "";
      debugLog(debugMode, `[messageToEmail] Converting to markdown...`);
      debugLog(debugMode, `[messageToEmail] - Has htmlContent: ${!!htmlContent}, length: ${htmlContent.length}`);
      debugLog(debugMode, `[messageToEmail] - Has plainText: ${!!plainText}, length: ${plainText.length}`);

      if (htmlContent) {
        debugLog(debugMode, `[messageToEmail] Converting HTML to markdown...`);
        try {
          // Convert HTML to markdown using our custom converter
          markdownContent = turndown.turndown(htmlContent);
          debugLog(debugMode, `[messageToEmail] Markdown conversion successful, length: ${markdownContent.length}`);
        } catch (error) {
          if (debugMode) console.error("[messageToEmail] Error converting HTML to markdown:", error);
          // Fallback to plainText if HTML conversion fails
          markdownContent = plainText;
          debugLog(debugMode, `[messageToEmail] Fell back to plainText, length: ${markdownContent.length}`);
        }
      } else {
        // Use plainText as fallback if no HTML content
        debugLog(debugMode, `[messageToEmail] No HTML, using plainText as markdown`);
        markdownContent = plainText;
        debugLog(debugMode, `[messageToEmail] Final markdown length: ${markdownContent.length}`);
      }

      debugLog(debugMode, `[messageToEmail] === FINAL EMAIL CONTENT ===`);
      debugLog(debugMode, `[messageToEmail] plainText: ${plainText.length} chars`);
      debugLog(debugMode, `[messageToEmail] htmlContent: ${htmlContent.length} chars`);
      debugLog(debugMode, `[messageToEmail] markdownContent: ${markdownContent.length} chars`);
      debugLog(debugMode, `[messageToEmail] snippet: ${messageData.snippet?.length || 0} chars`);
      debugLog(debugMode, `[messageToEmail] ===========================\n`);

      return {
        id: messageData.id,
        threadId: messageData.threadId,
        labelIds: messageData.labelIds || ["INBOX"],
        snippet: messageData.snippet || "",
        subject,
        from: extractEmailAddress(from),
        date,
        to: extractEmailAddress(to),
        plainText,
        htmlContent,
        markdownContent,
      };
    } catch (error: any) {
      if (debugMode) {
        console.error(
          "Error processing message part:",
          "message" in error ? error.message : error,
        );
      }
      return null;
    }
  }).filter((message): message is Email => message !== null);
}

export async function process(
  auth: Cell<Auth>,
  maxResults: number = 100,
  gmailFilterQuery: string = "in:INBOX",
  state: {
    emails: Cell<Email[]>;
    settings: Cell<
      { gmailFilterQuery: string; limit: number; historyId: string }
    >;
  },
  debugMode: boolean = false,
): Promise<
  | { newHistoryId?: string; newEmails?: Email[]; deletedEmailIds?: string[] }
  | void
> {
  if (!auth.get()) {
    debugWarn(debugMode, "no token");
    return;
  }

  const client = new GmailClient(auth, { debugMode });
  const currentHistoryId = state.settings.get().historyId;

  let newHistoryId: string | null = null;
  let messagesToFetch: string[] = [];
  const messagesToDelete: string[] = [];
  let useFullSync = false;

  // Get existing email IDs and create a map for efficient updates
  const existingEmails = state.emails.get();
  const existingEmailIds = new Set(existingEmails.map((email) => email.id));
  const emailMap = new Map(existingEmails.map((email) => [email.id, email]));

  // Try incremental sync if we have a historyId
  if (currentHistoryId) {
    debugLog(debugMode, "=== INCREMENTAL SYNC MODE ===");
    debugLog(debugMode, "Current historyId:", currentHistoryId);
    debugLog(debugMode, "Existing emails count:", existingEmails.length);

    try {
      debugLog(debugMode, "Calling Gmail History API...");
      const historyResponse = await client.fetchHistory(
        currentHistoryId,
        undefined,
        maxResults,
      );

      debugLog(debugMode, "History API Response:");
      debugLog(debugMode, "- New historyId:", historyResponse.historyId);
      debugLog(debugMode, "- Has history records:", !!historyResponse.history);
      debugLog(
        debugMode,
        "- History records count:",
        historyResponse.history?.length || 0,
      );

      if (historyResponse.history) {
        debugLog(
          debugMode,
          `Processing ${historyResponse.history.length} history records`,
        );

        // Process history records
        for (let i = 0; i < historyResponse.history.length; i++) {
          const record = historyResponse.history[i];
          debugLog(debugMode, `\nHistory Record ${i + 1}:`);
          debugLog(debugMode, "- History ID:", record.id);
          debugLog(debugMode, "- Messages added:", record.messagesAdded?.length || 0);
          debugLog(
            debugMode,
            "- Messages deleted:",
            record.messagesDeleted?.length || 0,
          );
          debugLog(debugMode, "- Labels added:", record.labelsAdded?.length || 0);
          debugLog(debugMode, "- Labels removed:", record.labelsRemoved?.length || 0);

          // Handle added messages
          if (record.messagesAdded) {
            debugLog(
              debugMode,
              `  Processing ${record.messagesAdded.length} added messages`,
            );
            for (const item of record.messagesAdded) {
              if (!existingEmailIds.has(item.message.id)) {
                debugLog(debugMode, `    - New message to fetch: ${item.message.id}`);
                messagesToFetch.push(item.message.id);
              } else {
                debugLog(debugMode, `    - Message already exists: ${item.message.id}`);
              }
            }
          }

          // Handle deleted messages
          if (record.messagesDeleted) {
            debugLog(
              debugMode,
              `  Processing ${record.messagesDeleted.length} deleted messages`,
            );
            for (const item of record.messagesDeleted) {
              debugLog(debugMode, `    - Message to delete: ${item.message.id}`);
              messagesToDelete.push(item.message.id);
            }
          }

          // Handle label changes
          if (record.labelsAdded) {
            debugLog(
              debugMode,
              `  Processing ${record.labelsAdded.length} label additions`,
            );
            for (const item of record.labelsAdded) {
              const email = emailMap.get(item.message.id);
              if (email) {
                debugLog(
                  debugMode,
                  `    - Adding labels to ${item.message.id}:`,
                  item.labelIds,
                );
                // Add new labels
                const newLabels = new Set(email.labelIds);
                item.labelIds.forEach((label) => newLabels.add(label));
                email.labelIds = Array.from(newLabels);
              }
            }
          }

          if (record.labelsRemoved) {
            debugLog(
              debugMode,
              `  Processing ${record.labelsRemoved.length} label removals`,
            );
            for (const item of record.labelsRemoved) {
              const email = emailMap.get(item.message.id);
              if (email) {
                debugLog(
                  debugMode,
                  `    - Removing labels from ${item.message.id}:`,
                  item.labelIds,
                );
                // Remove labels
                const labelSet = new Set(email.labelIds);
                item.labelIds.forEach((label) => labelSet.delete(label));
                email.labelIds = Array.from(labelSet);
              }
            }
          }
        }

        newHistoryId = historyResponse.historyId;
        debugLog(debugMode, "\n=== INCREMENTAL SYNC SUMMARY ===");
        debugLog(debugMode, `Messages to fetch: ${messagesToFetch.length}`);
        debugLog(debugMode, `Messages to delete: ${messagesToDelete.length}`);
        debugLog(debugMode, `Old historyId: ${currentHistoryId}`);
        debugLog(debugMode, `New historyId: ${newHistoryId}`);
        debugLog(debugMode, "================================\n");
      } else {
        debugLog(debugMode, "No history changes found");
        debugLog(
          debugMode,
          `Updating historyId from ${currentHistoryId} to ${historyResponse.historyId}`,
        );
        newHistoryId = historyResponse.historyId;
      }
    } catch (error: any) {
      if (
        error.message &&
        (error.message.includes("404") || error.message.includes("410"))
      ) {
        debugLog(debugMode, "History ID expired, falling back to full sync");
        useFullSync = true;
      } else {
        if (debugMode) console.error("Error fetching history:", error);
        throw error;
      }
    }
  } else {
    debugLog(debugMode, "=== FULL SYNC MODE ===");
    debugLog(debugMode, "No historyId found, performing full sync");
    useFullSync = true;
  }

  // Perform full sync if needed
  if (useFullSync) {
    debugLog(debugMode, "Getting user profile to obtain current historyId...");
    // Get current profile to get latest historyId
    const profile = await client.getProfile();
    newHistoryId = profile.historyId;
    debugLog(debugMode, "Profile received:");
    debugLog(debugMode, "- Email:", profile.emailAddress);
    debugLog(debugMode, "- Current historyId:", profile.historyId);
    debugLog(debugMode, "- Total messages:", profile.messagesTotal);
    debugLog(debugMode, "- Total threads:", profile.threadsTotal);

    debugLog(
      debugMode,
      `\nFetching messages with query: "${gmailFilterQuery}", limit: ${maxResults}`,
    );
    const messages = await client.fetchEmail(maxResults, gmailFilterQuery);
    debugLog(debugMode, `Received ${messages.length} messages from API`);

    messagesToFetch = messages
      .filter((message: { id: string }) => !existingEmailIds.has(message.id))
      .map((message: { id: string }) => message.id);

    debugLog(
      debugMode,
      `After filtering existing: ${messagesToFetch.length} new messages to fetch`,
    );
    debugLog(debugMode, "======================\n");
  }

  // Collect all new emails to return
  const allNewEmails: Email[] = [];

  // Fetch new messages in batches
  if (messagesToFetch.length > 0) {
    debugLog(debugMode, `Fetching ${messagesToFetch.length} new messages`);
    const batchSize = 100;

    for (let i = 0; i < messagesToFetch.length; i += batchSize) {
      const batchIds = messagesToFetch.slice(i, i + batchSize);
      debugLog(
        debugMode,
        `Processing batch ${i / batchSize + 1} of ${
          Math.ceil(messagesToFetch.length / batchSize)
        }`,
      );

      try {
        await sleep(1000);
        const fetched = await client.fetchMessagesByIds(batchIds);
        const emails = messageToEmail(fetched, debugMode);

        if (emails.length > 0) {
          debugLog(debugMode, `Adding ${emails.length} new emails`);
          allNewEmails.push(...emails);
        }
      } catch (error: any) {
        if (debugMode) {
          console.error(
            "Error processing batch:",
            "message" in error ? error.message : error,
          );
        }
      }
    }
  }

  debugLog(debugMode, "Sync completed successfully");

  // Return the results instead of directly updating cells
  return {
    newHistoryId: newHistoryId || undefined,
    newEmails: allNewEmails.length > 0 ? allNewEmails : undefined,
    deletedEmailIds: messagesToDelete.length > 0 ? messagesToDelete : undefined,
  };
}

const updateGmailFilterQuery = handler<
  { detail: { value: string } },
  { gmailFilterQuery: Cell<string> }
>(
  ({ detail }, state) => {
    state.gmailFilterQuery.set(detail?.value ?? "in:INBOX");
  },
);

const toggleAuthView = handler<
  unknown,
  { showAuth: Cell<boolean> }
>(
  (_, { showAuth }) => {
    showAuth.set(!showAuth.get());
  },
);

const toggleDebugMode = handler<
  { target: { checked: boolean } },
  { settings: Cell<Settings> }
>(
  ({ target }, { settings }) => {
    const current = settings.get();
    settings.set({ ...current, debugMode: target.checked });
  },
);

// Handler to create a new GoogleAuth charm and navigate to it
const createGoogleAuth = handler<unknown, Record<string, never>>(
  () => {
    const googleAuthCharm = GoogleAuth({
      selectedScopes: {
        gmail: true,  // Pre-select Gmail scope
        gmailSend: false,
        gmailModify: false,
        calendar: false,
        calendarWrite: false,
        drive: false,
        contacts: false,
      },
      auth: {
        token: "",
        tokenType: "",
        scope: [],
        expiresIn: 0,
        expiresAt: 0,
        refreshToken: "",
        user: { email: "", name: "", picture: "" },
      },
    });
    return navigateTo(googleAuthCharm);
  },
);

// What we expect from the google-auth charm
type GoogleAuthCharm = {
  auth: Auth;
  scopes?: string[];
};

// Gmail scope URL for checking
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Account type for multi-account support
type AccountType = "default" | "personal" | "work";

export default pattern<{
  settings: Default<Settings, {
    gmailFilterQuery: "in:INBOX";
    limit: 100;
    historyId: "";
    debugMode: false;
  }>;
  // Optional: explicitly provide an auth charm. If not provided, uses wish to discover one.
  authCharm: Default<any, null>;
  // Account type for multi-account Gmail support
  accountType: Default<AccountType, "default">;
}, Output>(
  ({ settings, authCharm, accountType }) => {
    const emails = cell<Confidential<Email[]>>([]);
    const showAuth = cell(false);
    const fetching = cell(false);

    // Local writable cell for account type selection
    // Input `accountType` may be read-only (Default cells are read-only when using default value)
    // See: community-docs/superstitions/2025-12-03-derive-creates-readonly-cells-use-property-access.md
    // See: community-docs/folk_wisdom/thinking-reactively-vs-events.md ("Local Cells for Component Output")
    const selectedAccountType = cell<AccountType>("default");

    // Handler to change account type (writes to local writable cell)
    const setAccountType = handler<
      { target: { value: string } },
      { selectedType: Cell<AccountType> }
    >((event, state) => {
      const newType = event.target.value as AccountType;
      console.log("[GmailImporter] Account type changed to:", newType);
      state.selectedType.set(newType);
    });

    // Dynamic wish tag based on selectedAccountType (writable local cell)
    const wishTag = derive(selectedAccountType, (type: AccountType) => {
      switch (type) {
        case "personal":
          return "#googleAuthPersonal";
        case "work":
          return "#googleAuthWork";
        default:
          return "#googleAuth";
      }
    });

    // Wish for a favorited auth charm (used when no explicit authCharm provided)
    // CT-1084 (object syntax bug) is fixed, so we use the object syntax now
    // Now uses reactive wishTag for multi-account support
    const wishResult = wish<GoogleAuthCharm>({ query: wishTag });

    // Determine if we have an explicit auth charm provided
    const hasExplicitAuth = derive(authCharm, (charm) => charm !== null && charm !== undefined);

    // 3-state logic for wished auth:
    // State 1: "not-found" - wishError exists and no result
    // State 2: "found-not-authenticated" - result exists but no email
    // State 3: "authenticated" - result exists with email
    const wishedAuthState = derive(wishResult, (wr) => {
      const email = wr?.result?.auth?.user?.email || "";
      if (email !== "") return "authenticated";
      if (wr?.result) return "found-not-authenticated";
      if (wr?.error) return "not-found";
      return "loading";
    });

    // Get the wished charm from the result
    const wishedAuthCharm = derive(wishResult, (wr) => wr?.result || null);

    // Get UI for inline auth rendering (State 2)
    const wishedAuthUI = derive(wishResult, (wr) => wr?.$UI);

    // Get the effective auth charm: explicit one if provided, otherwise wished one
    const effectiveAuthCharm = derive(
      { authCharm, wishedAuthCharm, hasExplicitAuth },
      ({ authCharm, wishedAuthCharm, hasExplicitAuth }) => {
        if (hasExplicitAuth) {
          return authCharm;
        }
        return wishedAuthCharm || null;
      }
    );

    // Access auth directly from the effective charm (NOT derived!)
    // By accessing .auth as a property path rather than deriving it,
    // the framework maintains the live Cell reference that can be written to.
    // This is critical for token refresh to persist back to the source charm.
    // See: community-docs/superstitions/2025-01-24-pass-cells-as-handler-params-not-closure.md
    const auth = effectiveAuthCharm.auth;

    const isAuthenticated = derive(auth, (a) => a?.user?.email ? true : false);

    // Track if we're using wished auth vs explicit
    const usingWishedAuth = derive(
      { hasExplicitAuth, wishedAuthState },
      ({ hasExplicitAuth, wishedAuthState }) => !hasExplicitAuth && wishedAuthState === "authenticated"
    );

    // Error from wish (for "not-found" state)
    const wishError = derive(wishResult, (wr) => wr?.error || null);

    // Check if Gmail scope is granted
    const hasGmailScope = derive(auth, (a) => {
      const scopes = a?.scope || [];
      return scopes.includes(GMAIL_SCOPE);
    });

    // Authenticated but missing Gmail scope
    const missingGmailScope = derive(
      { isAuthenticated, hasGmailScope },
      ({ isAuthenticated, hasGmailScope }) => isAuthenticated && !hasGmailScope
    );

    computed(() => {
      if (settings.debugMode) {
        console.log("emails", emails.get().length);
      }
    });

    return {
      [NAME]: str`GMail Importer ${
        derive(auth, (auth) => auth?.user?.email || "unauthorized")
      }`,
      [UI]: (
        <ct-screen>
          <div slot="header">
            <ct-hstack align="center" gap="2">
              <ct-heading level={3}>Gmail Importer</ct-heading>

              {/* Account type selector for multi-account support */}
              <select
                onChange={setAccountType({ selectedType: selectedAccountType })}
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  fontSize: "12px",
                  backgroundColor: derive(selectedAccountType, (type: AccountType) => {
                    switch (type) {
                      case "personal":
                        return "#dbeafe"; // blue tint
                      case "work":
                        return "#fee2e2"; // red tint
                      default:
                        return "#fff";
                    }
                  }),
                }}
              >
                <option value="default" selected={derive(selectedAccountType, (t: string) => t === "default")}>Any Account</option>
                <option value="personal" selected={derive(selectedAccountType, (t: string) => t === "personal")}>Personal</option>
                <option value="work" selected={derive(selectedAccountType, (t: string) => t === "work")}>Work</option>
              </select>

              {/* Red/Green status dot */}
              <button
                onClick={toggleAuthView({ showAuth })}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  border: "2px solid #333",
                  backgroundColor: ifElse(
                    isAuthenticated,
                    "#22c55e", // green
                    "#ef4444", // red
                  ),
                  cursor: "pointer",
                  padding: "0",
                }}
                title={ifElse(
                  isAuthenticated,
                  "Authenticated - Click to view auth",
                  "Not authenticated - Click to login",
                )}
              />
            </ct-hstack>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack padding="6" gap="4">
              {/* Conditionally show auth UI inline */}
              {ifElse(
                derive(showAuth, (show) => show),
                <div
                  style={{
                    border: "2px solid #e0e0e0",
                    borderRadius: "8px",
                    padding: "15px",
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <h3 style={{ fontSize: "16px", marginTop: "0" }}>
                    Authentication
                  </h3>

                  {/* Show source of auth - 3 states for wished auth */}
                  {ifElse(
                    hasExplicitAuth,
                    <div style={{ marginBottom: "10px", fontSize: "14px", color: "#666" }}>
                      Using explicitly linked auth charm
                    </div>,
                    // Not using explicit auth - show wish-based auth state
                    derive(wishedAuthState, (state) => {
                      if (state === "authenticated") {
                        // State 3: Using wished auth successfully
                        return (
                          <div style={{ marginBottom: "10px", fontSize: "14px", color: "#22c55e" }}>
                            ✓ Using shared auth from favorited Google Auth charm
                          </div>
                        );
                      }

                      if (state === "found-not-authenticated") {
                        // State 2: Auth charm found but not logged in - show inline auth
                        return (
                          <div style={{
                            marginBottom: "15px",
                            padding: "12px",
                            backgroundColor: "#fff3cd",
                            borderRadius: "6px",
                            border: "1px solid #ffeeba",
                          }}>
                            <strong>Auth Charm Found - Login Required</strong>
                            <p style={{ margin: "8px 0 12px 0", fontSize: "14px" }}>
                              Found your Google Auth charm, but you need to log in:
                            </p>
                            <div style={{
                              padding: "10px",
                              backgroundColor: "#fff",
                              borderRadius: "6px",
                              border: "1px solid #ddd",
                            }}>
                              {wishedAuthUI}
                            </div>
                          </div>
                        );
                      }

                      if (state === "not-found") {
                        // State 1: No auth charm found
                        return (
                          <div style={{
                            marginBottom: "15px",
                            padding: "12px",
                            backgroundColor: "#f8d7da",
                            borderRadius: "6px",
                            border: "1px solid #f5c6cb",
                          }}>
                            <strong>No Google Auth Found</strong>
                            <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>
                              Create a Google Auth charm to authenticate:
                            </p>
                            <ct-button
                              onClick={createGoogleAuth({})}
                              style={{ marginTop: "12px" }}
                            >
                              Create Google Auth
                            </ct-button>
                            <p style={{ margin: "12px 0 0 0", fontSize: "13px", color: "#666" }}>
                              After authenticating, click the star to favorite it, then come back here.
                            </p>
                            {derive(wishError, (err) => err ? (
                              <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#721c24" }}>
                                {err}
                              </p>
                            ) : null)}
                          </div>
                        );
                      }

                      // Loading state
                      return (
                        <div style={{ marginBottom: "10px", fontSize: "14px", color: "#666" }}>
                          Checking for Google Auth...
                        </div>
                      );
                    })
                  )}

                  {/* Scope warning */}
                  {ifElse(
                    missingGmailScope,
                    <div style={{
                      marginBottom: "15px",
                      padding: "12px",
                      backgroundColor: "#f8d7da",
                      borderRadius: "6px",
                      border: "1px solid #f5c6cb",
                    }}>
                      <strong>Gmail Permission Missing</strong>
                      <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>
                        Your Google Auth charm doesn't have Gmail permission enabled.
                        Please enable the Gmail checkbox in your Google Auth charm and re-authenticate.
                      </p>
                    </div>,
                    <div />
                  )}

                  {/* Render the auth charm if available */}
                  {ifElse(
                    derive(effectiveAuthCharm, (charm) => !!charm),
                    <ct-render $cell={effectiveAuthCharm} />,
                    <div />
                  )}
                </div>,
                <div />,
              )}

          <h3 style={{ fontSize: "18px", fontWeight: "bold" }}>
            Imported email count: {computed(() => emails.get().length)}
          </h3>

          <div style={{ fontSize: "14px", color: "#666" }}>
            historyId: {settings.historyId || "none"}
          </div>

          <ct-vstack gap="4">
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Import Limit</label>
              <ct-input
                type="number"
                $value={settings.limit}
                placeholder="count of emails to import"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Gmail Filter Query</label>
              <ct-input
                type="text"
                $value={settings.gmailFilterQuery}
                placeholder="in:INBOX"
              />
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                <input
                  type="checkbox"
                  checked={settings.debugMode}
                  onChange={toggleDebugMode({ settings })}
                />
                Debug Mode (verbose console logging)
              </label>
            </div>
            <ct-button
              type="button"
              onClick={googleUpdater({
                emails,
                auth,
                settings,
                fetching,
              })}
              disabled={fetching}
            >
              {ifElse(
                fetching,
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <ct-loader size="sm" show-elapsed></ct-loader>
                  Fetching...
                </span>,
                "Fetch Emails"
              )}
            </ct-button>
          </ct-vstack>

          <div>
            <table>
              <thead>
                <tr>
                  <th style={{ padding: "10px" }}>DATE</th>
                  <th style={{ padding: "10px" }}>SUBJECT</th>
                  <th style={{ padding: "10px" }}>LABEL</th>
                  <th style={{ padding: "10px" }}>CONTENT</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr>
                    <td style={{ border: "1px solid black", padding: "10px" }}>
                      &nbsp;{email.date}&nbsp;
                    </td>
                    <td style={{ border: "1px solid black", padding: "10px" }}>
                      &nbsp;{email.subject}&nbsp;
                    </td>
                    <td style={{ border: "1px solid black", padding: "10px" }}>
                      &nbsp;{derive(
                        email,
                        (email) => email?.labelIds?.join(", "),
                      )}&nbsp;
                    </td>
                    <td style={{ border: "1px solid black", padding: "10px" }}>
                      <details>
                        <summary>Show Markdown</summary>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            maxHeight: "300px",
                            overflowY: "auto",
                          }}
                        >
                          {email.markdownContent}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
      emails,
      emailCount: derive(emails, (list: Email[]) => list?.length || 0),
      bgUpdater: googleUpdater({ emails, auth, settings }),
      // Pattern tools for omnibot
      searchEmails: patternTool(
        ({ query, emails }: { query: string; emails: Email[] }) => {
          return derive({ query, emails }, ({ query, emails }) => {
            if (!query || !emails) return [];
            const lowerQuery = query.toLowerCase();
            return emails.filter((email) =>
              email.subject?.toLowerCase().includes(lowerQuery) ||
              email.from?.toLowerCase().includes(lowerQuery) ||
              email.snippet?.toLowerCase().includes(lowerQuery)
            );
          });
        },
        { emails }
      ),
      getEmailCount: patternTool(
        ({ emails }: { emails: Email[] }) => {
          return derive(emails, (list: Email[]) => list?.length || 0);
        },
        { emails }
      ),
      getRecentEmails: patternTool(
        ({ count, emails }: { count: number; emails: Email[] }) => {
          return derive({ count, emails }, ({ count, emails }) => {
            if (!emails || emails.length === 0) return "No emails";
            const recent = emails.slice(0, count || 5);
            return recent.map((email) =>
              `From: ${email.from}\nSubject: ${email.subject}\nDate: ${new Date(email.date).toLocaleDateString()}`
            ).join("\n\n");
          });
        },
        { emails }
      ),
    };
  },
);
