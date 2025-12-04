/// <cts-enable />
/**
 * Gmail Agentic Search - Base Pattern
 *
 * A reusable base pattern for building Gmail-based agentic searchers.
 * Handles authentication, provides searchGmail tool, and manages agent execution.
 *
 * Usage:
 * ```typescript
 * import GmailAgenticSearch from "./gmail-agentic-search.tsx";
 *
 * export default pattern(({ customState }) => {
 *   const searcher = GmailAgenticSearch({
 *     agentGoal: "Find receipts from Amazon",
 *     suggestedQueries: ["from:amazon.com subject:receipt"],
 *     resultSchema: { type: "object", properties: { ... } },
 *   });
 *
 *   return {
 *     [NAME]: "My Searcher",
 *     [UI]: <div>{searcher}</div>,  // Embeds auth + scan UI
 *   };
 * });
 * ```
 */
import {
  Cell,
  Default,
  derive,
  generateObject,
  getRecipeEnvironment,
  handler,
  ifElse,
  NAME,
  navigateTo,
  pattern,
  UI,
  wish,
} from "commontools";
import GoogleAuth from "./google-auth.tsx";

// Re-export Auth type for convenience
export type { Auth } from "./gmail-importer.tsx";
import type { Auth } from "./gmail-importer.tsx";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const env = getRecipeEnvironment();

// ============================================================================
// TYPES
// ============================================================================

// Simplified Email type for the agent
export interface SimpleEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string; // Plain text or markdown content
}

// Progress tracking
export interface SearchProgress {
  currentQuery: string;
  completedQueries: { query: string; emailCount: number; timestamp: number }[];
  status: "idle" | "searching" | "analyzing" | "limit_reached" | "auth_error";
  searchCount: number;
  authError?: string;
}

// What we expect from the google-auth charm via wish
type GoogleAuthCharm = {
  auth: Auth;
  scopes?: string[];
};

// Tool definition for additional tools
export interface ToolDefinition {
  description: string;
  handler: ReturnType<typeof handler>;
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

export interface GmailAgenticSearchInput {
  // Agent configuration - the main prompt/goal (can be reactive Cell)
  agentGoal?: Default<string, "">;

  // Additional system context
  systemPrompt?: Default<string, "">;

  // Suggested queries for the agent to try
  suggestedQueries?: Default<string[], []>;

  // JSON schema for agent's structured output
  resultSchema?: Default<object, {}>;

  // Additional tools beyond searchGmail
  additionalTools?: Default<Record<string, ToolDefinition>, {}>;

  // UI customization
  title?: Default<string, "Gmail Agentic Search">;
  scanButtonLabel?: Default<string, "Scan">;

  // Limits
  maxSearches?: Default<number, 0>; // 0 = unlimited

  // State persistence
  isScanning?: Default<boolean, false>;
  lastScanAt?: Default<number, 0>;

  // Progress state - can be passed in for parent pattern coordination
  searchProgress?: Default<SearchProgress, {
    currentQuery: "";
    completedQueries: [];
    status: "idle";
    searchCount: 0;
  }>;

  // WORKAROUND (CT-1085): Accept auth as direct input since favorites don't persist.
  // Users can manually link gmail-auth's auth output to this input.
  // If provided, this takes precedence over wish-based auth.
  auth?: Default<Auth, {
    token: "";
    tokenType: "";
    scope: [];
    expiresIn: 0;
    expiresAt: 0;
    refreshToken: "";
    user: { email: ""; name: ""; picture: "" };
  }>;
}

export interface GmailAgenticSearchOutput {
  // Pattern metadata
  [NAME]: string;
  [UI]: JSX.Element;

  // UI Pieces (for custom composition)
  authUI: JSX.Element;       // Auth status and connect/login UI
  progressUI: JSX.Element;   // Search progress during scanning
  controlsUI: JSX.Element;   // Scan/Stop buttons

  // Auth state (exposed for embedding patterns)
  auth: Auth;
  isAuthenticated: boolean;
  hasGmailScope: boolean;
  authSource: "direct" | "wish" | "none";  // Where auth came from

  // Agent state
  agentResult: any;
  agentPending: boolean;
  isScanning: boolean;

  // Progress
  searchProgress: SearchProgress;

  // Timestamps
  lastScanAt: number;

  // Actions (handlers for embedding patterns to use)
  startScan: ReturnType<typeof handler>;
  stopScan: ReturnType<typeof handler>;
}

// ============================================================================
// CREATE REPORT TOOL HELPER
// ============================================================================

/**
 * Configuration for createReportTool
 */
export interface ReportToolConfig<T extends Record<string, any>> {
  /** Prefix for generated IDs (e.g., "membership", "food") */
  idPrefix: string;

  /** Function to generate a deduplication key from input */
  dedupeKey: (input: T) => string;

  /** Transform input to the stored record (add id, timestamp, etc.) */
  toRecord: (input: T, id: string, timestamp: number) => T & { id: string };
}

/**
 * Creates a report tool handler for saving items to a list with deduplication.
 *
 * Usage:
 * ```typescript
 * const reportMembershipHandler = createReportTool<MembershipInput, MembershipRecord>({
 *   idPrefix: "membership",
 *   dedupeKey: (input) => `${input.brand}-${input.memberNumber}`,
 *   toRecord: (input, id, timestamp) => ({
 *     ...input,
 *     id,
 *     savedAt: timestamp,
 *   }),
 * });
 *
 * // Use in pattern:
 * const boundHandler = reportMembershipHandler({ items: membershipsCell });
 * ```
 */
export function createReportTool<
  TInput extends Record<string, any>,
  TRecord extends { id: string },
>(config: ReportToolConfig<TInput>) {
  return handler<
    TInput & { result?: Cell<any> },
    { items: Cell<TRecord[]> }
  >((input, state) => {
    const currentItems = state.items.get() || [];

    // Generate dedup key
    const key = config.dedupeKey(input).toLowerCase();
    const existingKeys = new Set(
      currentItems.map((item) => config.dedupeKey(item as unknown as TInput).toLowerCase()),
    );

    let resultMessage: string;

    if (existingKeys.has(key)) {
      console.log(`[ReportTool] Duplicate skipped: ${key}`);
      resultMessage = `Duplicate: ${key} already saved`;
    } else {
      // Generate unique ID
      const id = `${config.idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = Date.now();

      // Transform to record
      const newRecord = config.toRecord(input, id, timestamp) as unknown as TRecord;

      state.items.set([...currentItems, newRecord]);
      console.log(`[ReportTool] SAVED: ${key}`);
      resultMessage = `Saved: ${key}`;
    }

    // Write result if cell provided
    const resultCell = (input as any).result;
    if (resultCell) {
      resultCell.set({ success: true, message: resultMessage });
    }

    return { success: true, message: resultMessage };
  });
}

// ============================================================================
// GMAIL UTILITIES
// ============================================================================

/**
 * Validates a Gmail token by making a lightweight API call.
 * Returns { valid: true } or { valid: false, error: string }.
 */
async function validateGmailToken(
  token: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!token) {
    return { valid: false, error: "No token provided" };
  }

  try {
    // Make a lightweight call: get profile (very fast, minimal data)
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

async function fetchGmailEmails(
  token: string,
  query: string,
  maxResults: number = 20,
): Promise<SimpleEmail[]> {
  if (!token) {
    throw new Error("No auth token");
  }

  // Step 1: Search for message IDs
  const searchUrl = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
  );

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!searchRes.ok) {
    throw new Error(
      `Gmail search failed: ${searchRes.status} ${searchRes.statusText}`,
    );
  }

  const searchJson = await searchRes.json();
  const messageIds: { id: string }[] = searchJson.messages || [];

  if (messageIds.length === 0) {
    return [];
  }

  console.log(
    `[SearchGmail] Found ${messageIds.length} messages for query: ${query}`,
  );

  // Step 2: Fetch full message content using batch API
  const boundary = `batch_${Math.random().toString(36).substring(2)}`;
  const batchBody =
    messageIds
      .map(
        (msg, index) => `
--${boundary}
Content-Type: application/http
Content-ID: <batch-${index}+${msg.id}>

GET /gmail/v1/users/me/messages/${msg.id}?format=full
Authorization: Bearer ${token}
Accept: application/json

`,
      )
      .join("") + `--${boundary}--`;

  const batchRes = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body: batchBody,
  });

  if (!batchRes.ok) {
    throw new Error(`Gmail batch fetch failed: ${batchRes.status}`);
  }

  const responseText = await batchRes.text();

  // Parse batch response
  const emails: SimpleEmail[] = [];
  const parts = responseText.split(`--batch_`).slice(1, -1);

  for (const part of parts) {
    try {
      const jsonStart = part.indexOf(`\n{`);
      if (jsonStart === -1) continue;

      const jsonContent = part.slice(jsonStart).trim();
      const message = JSON.parse(jsonContent);

      if (!message.payload) continue;

      // Extract headers
      const headers = message.payload.headers || [];
      const getHeader = (name: string) =>
        headers.find(
          (h: { name: string; value: string }) =>
            h.name.toLowerCase() === name.toLowerCase(),
        )?.value || "";

      // Extract body
      const extractText = (payload: any): string => {
        if (payload.body?.data) {
          try {
            const decoded = atob(
              payload.body.data.replace(/-/g, "+").replace(/_/g, "/"),
            );
            return decoded;
          } catch {
            return "";
          }
        }
        if (payload.parts) {
          for (const p of payload.parts) {
            if (p.mimeType === "text/plain" && p.body?.data) {
              try {
                return atob(
                  p.body.data.replace(/-/g, "+").replace(/_/g, "/"),
                );
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
                // Simple HTML to text conversion
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

      const bodyText = extractText(message.payload);

      emails.push({
        id: message.id,
        subject: getHeader("Subject"),
        from: getHeader("From"),
        date: getHeader("Date"),
        snippet: message.snippet || "",
        body: bodyText.substring(0, 5000), // Limit body size
      });
    } catch (e) {
      console.error("Error parsing email:", e);
    }
  }

  console.log(`[SearchGmail] Parsed ${emails.length} emails`);
  return emails;
}

// ============================================================================
// PATTERN
// ============================================================================

const GmailAgenticSearch = pattern<
  GmailAgenticSearchInput,
  GmailAgenticSearchOutput
>(
  ({
    agentGoal,
    systemPrompt,
    suggestedQueries,
    resultSchema,
    additionalTools,
    title,
    scanButtonLabel,
    maxSearches,
    isScanning,
    lastScanAt,
    searchProgress,  // Can be passed in for parent coordination
    auth: inputAuth,  // CT-1085 workaround: direct auth input
  }) => {
    // ========================================================================
    // AUTH HANDLING
    // ========================================================================

    // Check if we have direct auth input (CT-1085 workaround)
    const hasDirectAuth = derive(inputAuth, (a: Auth) => !!(a?.token));

    // Wish for auth charm as fallback
    const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

    // 3-state logic for wished auth
    const wishedAuthState = derive(wishResult, (wr) => {
      const email = wr?.result?.auth?.user?.email || "";
      if (email !== "") return "authenticated";
      if (wr?.result) return "found-not-authenticated";
      if (wr?.error) return "not-found";
      return "loading";
    });

    // Get auth from wish result
    const wishedAuth = derive(wishResult, (wr) => wr?.result?.auth);
    const hasWishedAuth = derive(wishedAuth, (a: Auth | undefined) => !!(a?.token));

    // Combine auth: prefer direct input, fall back to wish
    const auth = derive([inputAuth, wishedAuth], ([directAuth, wished]: [Auth, Auth | undefined]) => {
      // Prefer direct input auth if it has a token
      if (directAuth?.token) {
        return directAuth;
      }
      // Fall back to wished auth
      if (wished?.token) {
        return wished;
      }
      // Return empty auth
      return {
        token: "",
        tokenType: "",
        scope: [] as string[],
        expiresIn: 0,
        expiresAt: 0,
        refreshToken: "",
        user: { email: "", name: "", picture: "" },
      };
    });

    // Track where auth came from
    const authSource = derive(
      [hasDirectAuth, hasWishedAuth],
      ([direct, wished]: [boolean, boolean]): "direct" | "wish" | "none" =>
        direct ? "direct" : wished ? "wish" : "none"
    );

    const isAuthenticated = derive(
      auth,
      (a) => !!(a && a.token && a.user && a.user.email),
    );

    // Check if token may be expired based on expiresAt timestamp
    const tokenMayBeExpired = derive(auth, (a) => {
      if (!a?.expiresAt) return false;
      // Add 5 minute buffer - if within 5 min of expiry, consider it potentially expired
      const bufferMs = 5 * 60 * 1000;
      return Date.now() > (a.expiresAt - bufferMs);
    });

    const hasGmailScope = derive(auth, (a) => {
      const scopes = a?.scope || [];
      return scopes.includes(GMAIL_SCOPE);
    });

    const missingGmailScope = derive(
      [isAuthenticated, hasGmailScope],
      ([authed, hasScope]: [boolean, boolean]) => authed && !hasScope,
    );

    // Handler to create a new GoogleAuth charm
    const createGoogleAuth = handler<unknown, Record<string, never>>(() => {
      const googleAuthCharm = GoogleAuth({
        selectedScopes: {
          gmail: true,
          calendar: false,
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
    });

    // ========================================================================
    // PROGRESS TRACKING
    // ========================================================================
    // searchProgress comes from input - allows parent patterns to coordinate state
    // by passing in their own cell

    // ========================================================================
    // SEARCH GMAIL TOOL
    // ========================================================================

    const searchGmailHandler = handler<
      { query: string; result?: Cell<any> },
      {
        auth: Cell<Auth>;
        progress: Cell<SearchProgress>;
        maxSearches: Cell<Default<number, 0>>;
      }
    >(async (input, state) => {
      const authData = state.auth.get();
      const token = authData?.token as string;
      const max = state.maxSearches.get();
      const currentProgress = state.progress.get();

      // Check if we've hit the search limit
      if (max > 0 && currentProgress.searchCount >= max) {
        console.log(`[SearchGmail Tool] Search limit reached (${max})`);
        const limitResult = {
          success: false,
          limitReached: true,
          message: `Search limit of ${max} reached.`,
          emails: [],
        };
        if (input.result) {
          input.result.set(limitResult);
        }
        state.progress.set({
          ...currentProgress,
          status: "limit_reached",
        });
        return limitResult;
      }

      // Don't continue if we're in auth error state
      if (currentProgress.status === "auth_error") {
        const authErrorResult = {
          success: false,
          authError: true,
          message: currentProgress.authError || "Authentication required",
          emails: [],
        };
        if (input.result) {
          input.result.set(authErrorResult);
        }
        return authErrorResult;
      }

      // Update progress: starting new search
      state.progress.set({
        ...currentProgress,
        currentQuery: input.query,
        status: "searching",
      });

      let resultData: any;

      if (!token) {
        resultData = { error: "Not authenticated", emails: [] };
      } else {
        try {
          console.log(`[SearchGmail Tool] Searching: ${input.query}`);
          const emails = await fetchGmailEmails(token, input.query, 30);
          console.log(`[SearchGmail Tool] Found ${emails.length} emails`);

          resultData = {
            success: true,
            emailCount: emails.length,
            emails: emails.map((e) => ({
              id: e.id,
              subject: e.subject,
              from: e.from,
              date: e.date,
              snippet: e.snippet,
              body: e.body,
            })),
          };

          // Update progress: search complete
          const updatedProgress = state.progress.get();
          state.progress.set({
            currentQuery: "",
            completedQueries: [
              ...updatedProgress.completedQueries,
              {
                query: input.query,
                emailCount: emails.length,
                timestamp: Date.now(),
              },
            ],
            status: "analyzing",
            searchCount: updatedProgress.searchCount + 1,
          });
        } catch (err) {
          console.error("[SearchGmail Tool] Error:", err);
          const errorStr = String(err);
          resultData = { error: errorStr, emails: [] };

          // Detect auth errors (401)
          if (errorStr.includes("401")) {
            const updatedProgress = state.progress.get();
            state.progress.set({
              ...updatedProgress,
              status: "auth_error",
              authError:
                "Gmail token expired or invalid. Please re-authenticate.",
            });
          }
        }
      }

      // Write to the result cell if provided
      if (input.result) {
        input.result.set(resultData);
      }

      return resultData;
    });

    // ========================================================================
    // AGENT SETUP
    // ========================================================================

    // Build the full prompt with suggested queries
    const fullPrompt = derive(
      [agentGoal, suggestedQueries, maxSearches],
      ([goal, queries, max]: [string, string[], number]) => {
        if (!goal) return ""; // Don't run agent without a goal

        let prompt = goal;

        if (queries && queries.length > 0) {
          prompt += `\n\nSuggested queries to try:\n`;
          prompt += queries.map((q, i) => `${i + 1}. ${q}`).join("\n");
        }

        if (max > 0) {
          prompt += `\n\n⚠️ LIMITED TO ${max} SEARCHES. Focus on high-value queries!`;
        }

        return prompt;
      },
    );

    // Build agent prompt (only active when scanning)
    const agentPrompt = derive(
      [isScanning, fullPrompt],
      ([scanning, prompt]: [boolean, string]) => {
        if (!scanning) return ""; // Don't run unless scanning
        return prompt;
      },
    );

    // Merge searchGmail with additional tools
    const allTools = derive(additionalTools, (additional) => {
      const baseTools = {
        searchGmail: {
          description:
            "Search Gmail with a query and return matching emails. Returns email id, subject, from, date, snippet, and body text.",
          handler: searchGmailHandler({
            auth,
            progress: searchProgress,
            maxSearches,
          }),
        },
      };

      // Merge additional tools if provided
      if (additional && typeof additional === "object") {
        return { ...baseTools, ...additional };
      }
      return baseTools;
    });

    // Default system prompt
    const fullSystemPrompt = derive(systemPrompt, (custom) => {
      const base = `You are a Gmail search agent. Your job is to search through emails to find relevant information.

You have the searchGmail tool available. Use it to search Gmail with queries like:
- from:domain.com
- subject:"keyword"
- has:attachment
- after:2024/01/01

Be thorough in your searches. Try multiple queries if needed.`;

      if (custom) {
        return `${base}\n\n${custom}`;
      }
      return base;
    });

    // Create the agent
    const agent = generateObject({
      system: fullSystemPrompt,
      prompt: agentPrompt,
      tools: allTools,
      model: "anthropic:claude-sonnet-4-5",
      schema: derive(resultSchema, (schema) => {
        if (schema && Object.keys(schema).length > 0) {
          return schema;
        }
        // Default schema if none provided
        return {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "Summary of what was searched and found",
            },
            searchesPerformed: { type: "number" },
          },
          required: ["summary"],
        };
      }),
    });

    const { result: agentResult, pending: agentPending } = agent;

    // ========================================================================
    // SCAN HANDLERS
    // ========================================================================

    const startScan = handler<
      unknown,
      {
        isScanning: Cell<Default<boolean, false>>;
        isAuthenticated: Cell<boolean>;
        progress: Cell<SearchProgress>;
        auth: Cell<Auth>;
      }
    >(async (_, state) => {
      if (!state.isAuthenticated.get()) return;

      const authData = state.auth.get();
      const token = authData?.token;

      // Validate token before starting scan
      console.log("[GmailAgenticSearch] Validating token before scan...");
      const validation = await validateGmailToken(token);

      if (!validation.valid) {
        console.log(`[GmailAgenticSearch] Token validation failed: ${validation.error}`);
        state.progress.set({
          currentQuery: "",
          completedQueries: [],
          status: "auth_error",
          searchCount: 0,
          authError: validation.error,
        });
        return;
      }

      console.log("[GmailAgenticSearch] Token valid, starting scan");
      state.progress.set({
        currentQuery: "",
        completedQueries: [],
        status: "searching", // Set to searching immediately so progress UI shows
        searchCount: 0,
      });
      state.isScanning.set(true);
    });

    const stopScan = handler<
      unknown,
      {
        lastScanAt: Cell<Default<number, 0>>;
        isScanning: Cell<Default<boolean, false>>;
      }
    >((_, state) => {
      state.lastScanAt.set(Date.now());
      state.isScanning.set(false);
      console.log("[GmailAgenticSearch] Scan stopped");
    });

    const completeScan = handler<
      unknown,
      {
        lastScanAt: Cell<Default<number, 0>>;
        isScanning: Cell<Default<boolean, false>>;
      }
    >((_, state) => {
      state.lastScanAt.set(Date.now());
      state.isScanning.set(false);
      console.log("[GmailAgenticSearch] Scan completed");
    });

    // Detect when agent completes
    const scanCompleted = derive(
      [isScanning, agentPending, agentResult],
      ([scanning, pending, result]) => scanning && !pending && !!result,
    );

    // Detect auth errors from agent result or token validation
    const hasAuthError = derive(
      [agentResult, searchProgress],
      ([r, progress]: [any, SearchProgress]) => {
        // Check progress status first (from token validation)
        if (progress?.status === "auth_error") {
          return true;
        }
        // Check agent result
        const summary = r?.summary || "";
        return (
          summary.includes("401") ||
          summary.toLowerCase().includes("authentication error")
        );
      },
    );

    // Get the specific auth error message
    const authErrorMessage = derive(
      [searchProgress, agentResult],
      ([progress, result]: [SearchProgress, any]) => {
        if (progress?.authError) {
          return progress.authError;
        }
        const summary = result?.summary || "";
        if (summary.includes("401")) {
          return "Token expired. Please re-authenticate.";
        }
        if (summary.toLowerCase().includes("authentication error")) {
          return "Authentication error. Please re-authenticate.";
        }
        return "";
      },
    );

    // Pre-bind handlers (important: must be done outside of derive callbacks)
    const boundStartScan = startScan({ isScanning, isAuthenticated, progress: searchProgress, auth });
    const boundStopScan = stopScan({ lastScanAt, isScanning });
    const boundCompleteScan = completeScan({ lastScanAt, isScanning });

    // ========================================================================
    // UI PIECES (extracted for flexible composition)
    // ========================================================================

    // Auth UI - shows auth status, login buttons, or connect Gmail prompt
    const authUI = (
      <div>
        {/* WORKAROUND (CT-1090): Embed wish results to trigger cross-space charm startup */}
        <div style={{ display: "none" }}>{wishResult}</div>

        {/* Auth Status */}
        {derive(
          [isAuthenticated, hasAuthError, tokenMayBeExpired],
          ([authenticated, authError, mayBeExpired]) => {
            if (authenticated) {
              if (authError) {
                return (
                  <div
                    style={{
                      padding: "12px",
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#92400e",
                        textAlign: "center",
                      }}
                    >
                      ⚠️ {authErrorMessage}
                    </div>
                  </div>
                );
              }
              if (mayBeExpired) {
                return (
                  <div
                    style={{
                      padding: "12px",
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#92400e",
                        textAlign: "center",
                      }}
                    >
                      ⚠️ Gmail token may have expired - will verify on scan
                    </div>
                  </div>
                );
              }
              return (
                <div
                  style={{
                    padding: "12px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#166534",
                      textAlign: "center",
                    }}
                  >
                    ✓ Gmail connected {derive(authSource, (src: "direct" | "wish" | "none") => src === "direct" ? "(linked)" : "(shared)")}
                  </div>
                </div>
              );
            }

            // Show auth UI based on wish state
            return derive(wishedAuthState, (state) => {
              if (state === "found-not-authenticated") {
                return (
                  <div
                    style={{
                      padding: "16px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#475569",
                        marginBottom: "12px",
                        textAlign: "center",
                      }}
                    >
                      Sign in to your Google account
                    </div>
                    <div
                      style={{
                        padding: "12px",
                        background: "white",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {wishResult.result}
                    </div>
                  </div>
                );
              }

              // No auth charm found
              return (
                <div
                  style={{
                    padding: "16px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#475569",
                      marginBottom: "12px",
                      textAlign: "center",
                    }}
                  >
                    Connect your Gmail to start searching
                  </div>
                  <ct-button
                    onClick={createGoogleAuth({})}
                    size="lg"
                    style="width: 100%;"
                  >
                    Connect Gmail
                  </ct-button>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      marginTop: "8px",
                      textAlign: "center",
                    }}
                  >
                    After connecting, favorite the auth charm to share it
                  </div>
                </div>
              );
            });
          },
        )}

        {/* Scope warning */}
        {derive(missingGmailScope, (missing: boolean) =>
          missing ? (
            <div
              style={{
                padding: "12px",
                background: "#f8d7da",
                border: "1px solid #f5c6cb",
                borderRadius: "6px",
                marginTop: "8px",
              }}
            >
              <strong>Gmail Permission Missing</strong>
              <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>
                Enable Gmail in your Google Auth charm and re-authenticate.
              </p>
            </div>
          ) : null,
        )}
      </div>
    );

    // Controls UI - scan and stop buttons
    const controlsUI = (
      <div>
        {/* Scan Button */}
        {ifElse(
          isAuthenticated,
          <ct-button
            onClick={boundStartScan}
            size="lg"
            style="width: 100%;"
            disabled={isScanning}
          >
            {derive(isScanning, (scanning: boolean) =>
              scanning ? "⏳ Scanning..." : scanButtonLabel,
            )}
          </ct-button>,
          null,
        )}

        {/* Stop Button */}
        {ifElse(
          isScanning,
          <ct-button
            onClick={boundStopScan}
            variant="secondary"
            size="lg"
            style="width: 100%; margin-top: 8px;"
          >
            ⏹ Stop Scan
          </ct-button>,
          null,
        )}
      </div>
    );

    // Progress UI - shows search progress and completion
    // Note: We use searchProgress.status instead of agentPending because agentPending
    // is false during tool execution (only true during initial prompt processing)
    const progressUI = (
      <div>
        {/* Progress during scanning */}
        {derive([isScanning, searchProgress], ([scanning, progress]: [boolean, SearchProgress]) =>
          scanning && progress.status !== "idle" && progress.status !== "auth_error" ? (
            <div
              style={{
                padding: "16px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  fontWeight: "600",
                  marginBottom: "12px",
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  color: "#475569",
                }}
              >
                <ct-loader show-elapsed></ct-loader>
                Scanning emails...
              </div>

              {/* Current Activity */}
              {derive(searchProgress, (progress: SearchProgress) =>
                progress.currentQuery ? (
                  <div
                    style={{
                      padding: "8px",
                      background: "#f1f5f9",
                      borderRadius: "4px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        fontWeight: "600",
                      }}
                    >
                      🔍 Currently searching:
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#334155",
                        fontFamily: "monospace",
                        wordBreak: "break-all",
                      }}
                    >
                      {progress.currentQuery}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "8px",
                      background: "#f1f5f9",
                      borderRadius: "4px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <ct-loader size="sm"></ct-loader>
                      Analyzing emails...
                    </div>
                  </div>
                ),
              )}

              {/* Completed Searches */}
              {derive(searchProgress, (progress: SearchProgress) =>
                progress.completedQueries.length > 0 ? (
                  <div style={{ marginTop: "8px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        fontWeight: "600",
                        marginBottom: "4px",
                      }}
                    >
                      ✅ Completed searches ({progress.completedQueries.length}
                      ):
                    </div>
                    <div
                      style={{
                        maxHeight: "120px",
                        overflowY: "auto",
                        fontSize: "11px",
                        color: "#3b82f6",
                      }}
                    >
                      {[...progress.completedQueries]
                        .reverse()
                        .slice(0, 5)
                        .map(
                          (
                            q: { query: string; emailCount: number },
                            i: number,
                          ) => (
                            <div
                              key={i}
                              style={{
                                padding: "2px 0",
                                borderBottom: "1px solid #dbeafe",
                              }}
                            >
                              <span style={{ fontFamily: "monospace" }}>
                                {q?.query
                                  ? q.query.length > 50
                                    ? q.query.substring(0, 50) + "..."
                                    : q.query
                                  : "unknown"}
                              </span>
                              <span
                                style={{
                                  marginLeft: "8px",
                                  color: "#059669",
                                }}
                              >
                                ({q?.emailCount ?? 0} emails)
                              </span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          ) : null,
        )}

        {/* Scan Complete */}
        {derive(scanCompleted, (completed) =>
          completed ? (
            <div
              style={{
                padding: "16px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#166534",
                  marginBottom: "12px",
                  textAlign: "center",
                }}
              >
                ✓ Scan Complete
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#059669",
                  textAlign: "center",
                  fontStyle: "italic",
                }}
              >
                {derive(agentResult, (r) => r?.summary || "")}
              </div>
              <ct-button
                onClick={boundCompleteScan}
                size="lg"
                style="width: 100%; margin-top: 12px;"
              >
                ✓ Done
              </ct-button>
            </div>
          ) : null,
        )}
      </div>
    );

    // Stats UI - last scan timestamp
    const statsUI = (
      <div style={{ fontSize: "13px", color: "#666" }}>
        {derive(lastScanAt, (ts) =>
          ts > 0 ? (
            <div>Last Scan: {new Date(ts).toLocaleString()}</div>
          ) : null,
        )}
      </div>
    );

    // ========================================================================
    // RETURN
    // ========================================================================

    return {
      [NAME]: title,

      // UI Pieces (for custom composition)
      authUI,
      controlsUI,
      progressUI,

      // Auth state (exposed for embedding patterns)
      auth,
      isAuthenticated,
      hasGmailScope,
      authSource,

      // Agent state
      agentResult,
      agentPending,
      isScanning,

      // Progress
      searchProgress,

      // Timestamps
      lastScanAt,

      // Actions
      startScan: boundStartScan,
      stopScan: boundStopScan,

      // Full UI (composed from pieces)
      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2 style={{ margin: "0", fontSize: "18px" }}>{title}</h2>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack style="padding: 16px; gap: 16px;">
              {authUI}
              {controlsUI}
              {progressUI}
              {statsUI}
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
    };
  },
);

export default GmailAgenticSearch;
