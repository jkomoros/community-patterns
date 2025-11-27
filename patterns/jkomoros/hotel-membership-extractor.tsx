/// <cts-enable />
import { Cell, Default, derive, generateObject, getRecipeEnvironment, handler, NAME, navigateTo, pattern, UI, wish } from "commontools";
import GmailAuth from "./gmail-auth.tsx";

// Import Email type and Auth type
import type { Auth } from "./gmail-importer.tsx";

// What we expect from the gmail-auth charm via wish
type GoogleAuthCharm = {
  auth: Auth;
};

// ============================================================================
// EFFECTIVE QUERY HINTS - Based on successful extractions
// ============================================================================
// These queries have been proven to find membership numbers in real Gmail accounts.
// The agent should try these first before doing broader searches.
const EFFECTIVE_QUERIES = [
  // Most effective: Welcome/confirmation emails with member numbers
  'from:hilton.com subject:"welcome" OR subject:"hilton honors"',
  'from:marriott.com subject:"welcome" OR subject:"bonvoy"',
  'from:hyatt.com subject:"welcome to world of hyatt"',
  'from:ihg.com subject:"welcome" OR subject:"ihg rewards"',
  'from:accor.com subject:"welcome" OR subject:"accor"',

  // Monthly statements often have member numbers prominently
  'from:hilton.com subject:"statement"',
  'from:marriott.com subject:"statement"',

  // Broad searches as fallback
  'from:hilton.com OR from:hiltonhonors.com',
  'from:marriott.com OR from:email.marriott.com',
  'from:hyatt.com OR from:worldofhyatt.com',
  'from:ihg.com OR from:ihgrewardsclub.com',
  'from:accor.com OR from:accorhotels.com',
];

// Simplified Email type for the agent
interface SimpleEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;  // Plain text or markdown content
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================
interface MembershipRecord {
  id: string;
  hotelBrand: string;           // "Marriott", "Hilton", etc.
  programName: string;          // "Marriott Bonvoy", "Hilton Honors"
  membershipNumber: string;     // The actual number
  tier?: string;                // "Gold", "Platinum", etc.
  sourceEmailId: string;        // Gmail message ID
  sourceEmailDate: string;      // Email date
  sourceEmailSubject: string;   // Email subject
  extractedAt: number;          // Timestamp when extracted
  confidence?: number;          // LLM confidence 0-100
}

interface HotelMembershipInput {
  // WORKAROUND (CT-1085): Accept auth as direct input since favorites don't persist.
  // Users can manually link gmail-auth's auth output to this input.
  auth: Default<Auth, {
    token: "";
    tokenType: "";
    scope: [];
    expiresIn: 0;
    expiresAt: 0;
    refreshToken: "";
    user: { email: ""; name: ""; picture: "" };
  }>;
  memberships: Default<MembershipRecord[], []>;
  lastScanAt: Default<number, 0>;
  isScanning: Default<boolean, false>;
  // Max number of searches to perform. 0 = unlimited (full scan), positive = quick test mode
  // Default to 5 for quick testing - change to 0 for full scans
  maxSearches: Default<number, 5>;
}

/**
 * Output type for hotel membership extractor.
 * Other patterns can wish for these memberships using: wish("#hotelMemberships")
 * #hotelMemberships
 */
interface HotelMembershipOutput {
  /** All discovered hotel loyalty program memberships. #hotelMemberships */
  memberships: MembershipRecord[];
  /** Timestamp of last scan completion */
  lastScanAt: number;
  /** Number of memberships found */
  count: number;
}

const env = getRecipeEnvironment();

// ============================================================================
// Gmail Fetching Utilities (inline, similar to gmail-importer)
// ============================================================================

async function fetchGmailEmails(
  token: string,
  query: string,
  maxResults: number = 20
): Promise<SimpleEmail[]> {
  if (!token) {
    throw new Error("No auth token");
  }

  // Step 1: Search for message IDs
  const searchUrl = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
  );

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Gmail search failed: ${searchRes.status} ${searchRes.statusText}`);
  }

  const searchJson = await searchRes.json();
  const messageIds: { id: string }[] = searchJson.messages || [];

  if (messageIds.length === 0) {
    return [];
  }

  console.log(`[SearchGmail] Found ${messageIds.length} messages for query: ${query}`);

  // Step 2: Fetch full message content using batch API
  const boundary = `batch_${Math.random().toString(36).substring(2)}`;
  const batchBody = messageIds.map((msg, index) => `
--${boundary}
Content-Type: application/http
Content-ID: <batch-${index}+${msg.id}>

GET /gmail/v1/users/me/messages/${msg.id}?format=full
Authorization: Bearer ${token}
Accept: application/json

`).join("") + `--${boundary}--`;

  const batchRes = await fetch(
    "https://gmail.googleapis.com/batch/gmail/v1",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/mixed; boundary=${boundary}`,
      },
      body: batchBody,
    }
  );

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
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      // Extract body
      let bodyText = "";
      const extractText = (payload: any): string => {
        if (payload.body?.data) {
          try {
            const decoded = atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
            return decoded;
          } catch { return ""; }
        }
        if (payload.parts) {
          for (const p of payload.parts) {
            if (p.mimeType === "text/plain" && p.body?.data) {
              try {
                return atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
              } catch { continue; }
            }
          }
          // Try HTML if no plain text
          for (const p of payload.parts) {
            if (p.mimeType === "text/html" && p.body?.data) {
              try {
                const html = atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
                // Simple HTML to text conversion
                return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              } catch { continue; }
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

      bodyText = extractText(message.payload);

      emails.push({
        id: message.id,
        subject: getHeader("Subject"),
        from: getHeader("From"),
        date: getHeader("Date"),
        snippet: message.snippet || "",
        body: bodyText.substring(0, 5000),  // Limit body size
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

export default pattern<HotelMembershipInput, HotelMembershipOutput>(({
  auth: inputAuth,
  memberships,
  lastScanAt,
  isScanning,
  maxSearches,
}) => {
  // ============================================================================
  // AUTH: Primary method is direct input (CT-1085 workaround)
  //
  // WORKAROUND (CT-1085): Favorites don't persist across page navigations.
  // The preferred method is to manually link gmail-auth's auth output to
  // this pattern's auth input in the shell UI.
  //
  // Fallback: wish("#googleAuth") still attempted for when CT-1085 is fixed.
  // ============================================================================

  // Try wish as fallback (will work once CT-1085 is fixed)
  const wishedAuthCharm = wish<GoogleAuthCharm>("#googleAuth");

  // Check if we have auth from either source
  const hasDirectAuth = derive(inputAuth, (a: Auth) => !!(a?.token));
  const wishedAuth = derive(wishedAuthCharm, (charm: GoogleAuthCharm | undefined) => charm?.auth);
  const hasWishedAuth = derive(wishedAuth, (a: Auth | undefined) => !!(a?.token));

  // Use input auth if provided, otherwise try wish
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

  const isAuthenticated = derive(auth, (a) =>
    !!(a && a.token && a.user && a.user.email)
  );

  const authSource = derive([hasDirectAuth, hasWishedAuth], ([direct, wished]: [boolean, boolean]) =>
    direct ? "direct" : wished ? "wish" : "none"
  );

  // ============================================================================
  // PROGRESS TRACKING: Track search activity for UI feedback
  // ============================================================================

  interface SearchProgress {
    currentQuery: string;
    completedQueries: { query: string; emailCount: number; timestamp: number }[];
    status: "idle" | "searching" | "analyzing" | "limit_reached";
    searchCount: number;  // Track total searches performed
  }

  const searchProgress = Cell.of<SearchProgress>({
    currentQuery: "",
    completedQueries: [],
    status: "idle",
    searchCount: 0,
  });

  // ============================================================================
  // AGENT: Single agent with searchGmail tool
  // ============================================================================

  // The searchGmail tool - async handler that fetches and returns emails
  // When used as a tool, the framework passes a 'result' cell that we MUST write to
  const searchGmailHandler = handler<
    { query: string; result?: Cell<any> },
    { auth: Cell<Auth>; progress: Cell<SearchProgress>; maxSearches: Cell<Default<number, 5>> }
  >(
    async (input, state) => {
      const authData = state.auth.get();
      const token = authData?.token as string;
      const max = state.maxSearches.get();
      const currentProgress = state.progress.get();

      // Check if we've hit the search limit (if not unlimited, where 0 = unlimited)
      if (max > 0 && currentProgress.searchCount >= max) {
        console.log(`[SearchGmail Tool] Search limit reached (${max})`);
        const limitResult = {
          success: false,
          limitReached: true,
          message: `Search limit of ${max} reached. Set maxSearches to 0 for unlimited searches.`,
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
            emails: emails.map(e => ({
              id: e.id,
              subject: e.subject,
              from: e.from,
              date: e.date,
              snippet: e.snippet,
              body: e.body,
            })),
          };

          // Update progress: search complete, increment count
          const updatedProgress = state.progress.get();
          state.progress.set({
            currentQuery: "",
            completedQueries: [
              ...updatedProgress.completedQueries,
              { query: input.query, emailCount: emails.length, timestamp: Date.now() },
            ],
            status: "analyzing",
            searchCount: updatedProgress.searchCount + 1,
          });
        } catch (err) {
          console.error("[SearchGmail Tool] Error:", err);
          resultData = { error: String(err), emails: [] };
        }
      }

      // Write to the result cell if provided (required for tool calling)
      if (input.result) {
        input.result.set(resultData);
      }

      return resultData;
    }
  );

  // Agent prompt - only active when scanning
  const agentPrompt = derive(
    [isScanning, memberships, maxSearches],
    ([scanning, found, maxSearchLimit]: [boolean, MembershipRecord[], number]) => {
      if (!scanning) return "";  // Don't run unless actively scanning

      const foundBrands = [...new Set(found.map(m => m.hotelBrand))];
      const isQuickMode = maxSearchLimit > 0;

      return `Find hotel loyalty program membership numbers in my Gmail.

Already saved memberships for: ${foundBrands.join(", ") || "none yet"}
Total memberships saved: ${found.length}
${isQuickMode ? `\n⚠️ QUICK TEST MODE: Limited to ${maxSearchLimit} searches. Focus on high-value queries!\n` : ""}

Your task:
1. Use searchGmail to search for hotel loyalty emails
2. Analyze the returned emails for membership numbers
3. When you find a membership: IMMEDIATELY call reportMembership to save it
4. Continue searching other brands${isQuickMode ? " (until limit reached)" : ""}

${isQuickMode ? "PRIORITY QUERIES (use these first in quick mode):" : "EFFECTIVE QUERIES (proven to find memberships):"}
${EFFECTIVE_QUERIES.slice(0, isQuickMode ? 5 : EFFECTIVE_QUERIES.length).map((q, i) => `${i + 1}. ${q}`).join("\n")}

Hotel brands to search for:
- Marriott (Marriott Bonvoy)
- Hilton (Hilton Honors)
- Hyatt (World of Hyatt)
- IHG (IHG One Rewards)
- Accor (ALL - Accor Live Limitless)

In email bodies, look for patterns like:
- "Member #" or "Membership Number:" followed by digits
- "Bonvoy Number:", "Hilton Honors #:", "World of Hyatt #:"
- Account numbers are typically 9-16 digits

When you find a membership, call reportMembership with:
- hotelBrand: Hotel chain name (e.g., "Marriott", "Hilton")
- programName: Loyalty program name (e.g., "Marriott Bonvoy", "Hilton Honors")
- membershipNumber: The actual number (digits only, no spaces)
- tier: Status tier if mentioned (Member, Silver, Gold, Platinum, Diamond)
- sourceEmailId: The email ID from searchGmail results
- sourceEmailSubject: The email subject
- sourceEmailDate: The email date
- confidence: 0-100 how confident you are

IMPORTANT: Call reportMembership for EACH membership as you find it. Don't wait!
${isQuickMode ? "\nNote: If you hit the search limit, stop and return what you found." : ""}

When done searching${isQuickMode ? " (or limit reached)" : " all brands"}, return a summary of what you searched and found.`;
    }
  );

  // ============================================================================
  // AUTO-SAVE: Report membership tool - saves immediately with deduplication
  // ============================================================================
  const reportMembershipHandler = handler<
    {
      hotelBrand: string;
      programName: string;
      membershipNumber: string;
      tier?: string;
      sourceEmailId: string;
      sourceEmailSubject: string;
      sourceEmailDate: string;
      confidence: number;
      result?: Cell<any>;
    },
    { memberships: Cell<Default<MembershipRecord[], []>> }
  >((input, state) => {
    const currentMemberships = state.memberships.get() || [];

    // Deduplication key: brand + number (case-insensitive)
    const key = `${input.hotelBrand.toLowerCase()}:${input.membershipNumber}`;
    const existingKeys = new Set(
      currentMemberships.map(m => `${m.hotelBrand.toLowerCase()}:${m.membershipNumber}`)
    );

    let resultMessage: string;

    if (existingKeys.has(key)) {
      // Already have this membership - skip
      console.log(`[ReportMembership] Duplicate skipped: ${input.hotelBrand} ${input.membershipNumber}`);
      resultMessage = `Duplicate: ${input.hotelBrand} ${input.membershipNumber} already saved`;
    } else {
      // New membership - save immediately
      const newMembership: MembershipRecord = {
        id: `${input.hotelBrand}-${input.membershipNumber}-${Date.now()}`,
        hotelBrand: input.hotelBrand,
        programName: input.programName,
        membershipNumber: input.membershipNumber,
        tier: input.tier,
        sourceEmailId: input.sourceEmailId,
        sourceEmailDate: input.sourceEmailDate,
        sourceEmailSubject: input.sourceEmailSubject,
        extractedAt: Date.now(),
        confidence: input.confidence,
      };

      state.memberships.set([...currentMemberships, newMembership]);
      console.log(`[ReportMembership] SAVED: ${input.hotelBrand} ${input.membershipNumber} (${input.tier || "no tier"})`);
      resultMessage = `Saved: ${input.hotelBrand} ${input.membershipNumber}`;
    }

    // Write result if result cell provided (for tool calling)
    if (input.result) {
      input.result.set({ success: true, message: resultMessage });
    }

    return { success: true, message: resultMessage };
  });

  const agentTools = {
    searchGmail: {
      description: "Search Gmail with a query and return matching emails. Returns email id, subject, from, date, snippet, and body text. Note: If maxSearches limit is set, this tool will return an error when limit is reached.",
      handler: searchGmailHandler({ auth, progress: searchProgress, maxSearches }),
    },
    reportMembership: {
      description: "Report a found membership number. Call this IMMEDIATELY when you find a valid membership number. It will be saved automatically. Parameters: hotelBrand (string), programName (string), membershipNumber (string), tier (string, optional), sourceEmailId (string), sourceEmailSubject (string), sourceEmailDate (string), confidence (number 0-100).",
      handler: reportMembershipHandler({ memberships }),
    },
  };

  const agent = generateObject({
    system: `You are a hotel loyalty membership extractor.

Your job: Search Gmail to find hotel loyalty program membership numbers.

You have TWO tools:
1. searchGmail({ query: string }) - Search Gmail and return matching emails
   - Use Gmail search syntax: from:domain.com, subject:"keyword", OR, AND
   - Returns emails with full body text
   - Search multiple times for different hotel brands

2. reportMembership({ hotelBrand, programName, membershipNumber, tier?, sourceEmailId, sourceEmailSubject, sourceEmailDate, confidence }) - SAVE a found membership
   - Call this IMMEDIATELY when you find a valid membership number
   - The membership is saved automatically (no manual save needed)
   - Duplicates are automatically skipped

IMPORTANT WORKFLOW:
1. Search for emails from a hotel brand
2. Read the email bodies for membership numbers
3. When you find a membership: IMMEDIATELY call reportMembership
4. Continue searching other brands
5. When done with all brands, return a summary

Do NOT wait until the end to report memberships. Report each one as you find it.

Be thorough and search for all major hotel brands.`,

    prompt: agentPrompt,

    tools: agentTools,

    model: "anthropic:claude-sonnet-4-5",

    schema: {
      type: "object",
      properties: {
        searchesPerformed: {
          type: "array",
          items: {
            type: "object",
            properties: {
              query: { type: "string" },
              emailsFound: { type: "number" },
              brandsSearched: { type: "array", items: { type: "string" } },
            },
          },
        },
        membershipsFound: {
          type: "number",
          description: "Total count of memberships found and saved via reportMembership",
        },
        summary: {
          type: "string",
          description: "Brief summary of what was searched and found",
        },
      },
      required: ["membershipsFound", "summary"],
    },
  });

  const { result: agentResult, pending: agentPending } = agent;

  // Note: We pass agentResult Cell directly to handlers to properly resolve cell links
  // Don't store raw result - cell links won't resolve properly when copied

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Handler to create a new GmailAuth charm and navigate to it
  const createGmailAuth = handler<unknown, Record<string, never>>(
    () => {
      const gmailAuthCharm = GmailAuth({
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
      return navigateTo(gmailAuthCharm);
    },
  );

  // Handler to change scan mode (power user setting)
  const setScanMode = handler<
    unknown,
    { mode: number; maxSearches: Cell<Default<number, 5>> }
  >((_, state) => {
    state.maxSearches.set(state.mode);
    console.log(`[SetScanMode] Changed to: ${state.mode === 0 ? "Full" : state.mode} searches`);
  });

  const startScan = handler<unknown, {
    isScanning: Cell<Default<boolean, false>>;
    isAuthenticated: Cell<boolean>;
    progress: Cell<SearchProgress>;
    maxSearches: Cell<Default<number, 5>>;
  }>((_, state) => {
    if (!state.isAuthenticated.get()) return;
    const max = state.maxSearches.get();
    console.log(`[StartScan] Beginning hotel membership extraction (maxSearches: ${max})`);
    // Reset progress tracking
    state.progress.set({
      currentQuery: "",
      completedQueries: [],
      status: "idle",
      searchCount: 0,
    });
    state.isScanning.set(true);
  });

  // Handler to mark scan as complete (memberships already saved via reportMembership tool)
  const completeScan = handler<unknown, {
    lastScanAt: Cell<Default<number, 0>>;
    isScanning: Cell<Default<boolean, false>>;
  }>((_, state) => {
    state.lastScanAt.set(Date.now());
    state.isScanning.set(false);
    console.log("[CompleteScan] Scan completed");
  });

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  // Shows when agent completed (scan in progress, agent done)
  const scanCompleted = derive(
    [isScanning, agentPending, agentResult],
    ([scanning, pending, result]) => scanning && !pending && !!result
  );

  const totalMemberships = derive(memberships, (list) => list?.length || 0);

  const groupedMemberships = derive(memberships, (list: MembershipRecord[]) => {
    const groups: Record<string, MembershipRecord[]> = {};
    if (!list) return groups;
    for (const m of list) {
      if (!groups[m.hotelBrand]) groups[m.hotelBrand] = [];
      groups[m.hotelBrand].push(m);
    }
    return groups;
  });

  // ============================================================================
  // UI
  // ============================================================================

  return {
    [NAME]: "🏨 Hotel Membership Extractor",

    // ========================================================================
    // OUTPUT: Export memberships for other patterns via wish("#hotelMemberships")
    // ========================================================================
    memberships,
    lastScanAt,
    count: totalMemberships,

    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2 style="margin: 0; fontSize: 18px;">Hotel Memberships</h2>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 16px;">
            {/* Auth Status */}
            {derive([isAuthenticated, authSource], ([authenticated, source]) => {
              if (authenticated) {
                return (
                  <div style="padding: 12px; background: #d1fae5; border: 1px solid #10b981; borderRadius: 8px;">
                    <div style="fontSize: 14px; color: #065f46; textAlign: center;">
                      ✅ Gmail connected {source === "direct" ? "(linked)" : "(via wish)"}
                    </div>
                  </div>
                );
              }

              return (
                <div style="padding: 24px; background: #fee2e2; border: 3px solid #dc2626; borderRadius: 12px;">
                  <div style="fontSize: 20px; fontWeight: 700; color: #991b1b; textAlign: center; marginBottom: 16px;">
                    🔒 Gmail Authentication Required
                  </div>
                  <div style="padding: 16px; background: white; borderRadius: 8px; border: 1px solid #fca5a5;">
                    <p style="margin: 0 0 12px 0; fontSize: 14px; fontWeight: 600;">
                      Option 1: Link auth directly (recommended)
                    </p>
                    <p style="margin: 0 0 12px 0; fontSize: 13px; color: #666;">
                      1. Open your Gmail Auth charm and authenticate<br/>
                      2. Use the shell to link its <code>auth</code> output to this pattern's <code>auth</code> input
                    </p>
                    <hr style="margin: 12px 0; border: none; borderTop: 1px solid #e0e0e0;"/>
                    <p style="margin: 0 0 12px 0; fontSize: 14px; fontWeight: 600;">
                      Option 2: Create new Gmail Auth
                    </p>
                    <ct-button
                      onClick={createGmailAuth({})}
                      size="default"
                    >
                      🔐 Create Gmail Auth
                    </ct-button>
                  </div>
                </div>
              );
            })}

            {/* Scan Mode Indicator */}
            {derive(maxSearches, (max: number) =>
              max > 0 ? (
                <div style="padding: 8px 12px; background: #fef3c7; border: 1px solid #f59e0b; borderRadius: 6px; fontSize: 12px; color: #92400e; textAlign: center;">
                  ⚡ Quick Test Mode: {max} searches max
                </div>
              ) : null
            )}

            {/* Scan Button */}
            <ct-button
              onClick={startScan({ isScanning, isAuthenticated, progress: searchProgress, maxSearches })}
              size="lg"
              disabled={derive([isAuthenticated, isScanning], ([auth, scanning]) => !auth || scanning)}
            >
              {derive([isAuthenticated, isScanning, maxSearches], ([auth, scanning, max]: [boolean, boolean, number]) => {
                if (!auth) return "🔒 Authenticate First";
                if (scanning) return "⏳ Scanning...";
                if (max > 0) return `⚡ Quick Scan (${max} searches)`;
                return "🔍 Scan for Hotel Memberships";
              })}
            </ct-button>

            {/* Progress - Real-time search activity */}
            {derive([isScanning, agentPending], ([scanning, pending]) =>
              scanning && pending ? (
                <div style="padding: 16px; background: #dbeafe; border: 1px solid #3b82f6; borderRadius: 8px;">
                  <div style="fontWeight: 600; marginBottom: 12px; textAlign: center;">
                    🤖 AI Agent Working...
                  </div>

                  {/* Current Activity */}
                  {derive(searchProgress, (progress: SearchProgress) =>
                    progress.currentQuery ? (
                      <div style="padding: 8px; background: #bfdbfe; borderRadius: 4px; marginBottom: 12px;">
                        <div style="fontSize: 12px; color: #1e40af; fontWeight: 600;">🔍 Currently searching:</div>
                        <div style="fontSize: 13px; color: #1e3a8a; fontFamily: monospace; wordBreak: break-all;">
                          {progress.currentQuery}
                        </div>
                      </div>
                    ) : (
                      <div style="padding: 8px; background: #bfdbfe; borderRadius: 4px; marginBottom: 12px;">
                        <div style="fontSize: 12px; color: #1e40af;">💭 Analyzing emails...</div>
                      </div>
                    )
                  )}

                  {/* Completed Searches - Reverse chronological (most recent first) */}
                  {derive(searchProgress, (progress: SearchProgress) =>
                    progress.completedQueries.length > 0 ? (
                      <div style="marginTop: 8px;">
                        <div style="fontSize: 12px; color: #1e40af; fontWeight: 600; marginBottom: 4px;">
                          ✅ Completed searches ({progress.completedQueries.length}):
                        </div>
                        <div style="maxHeight: 120px; overflowY: auto; fontSize: 11px; color: #3b82f6;">
                          {/* Reverse order - most recent first */}
                          {[...progress.completedQueries].reverse().slice(0, 5).map((q: { query: string; emailCount: number }, i: number) => (
                            <div key={i} style="padding: 2px 0; borderBottom: 1px solid #dbeafe;">
                              <span style="fontFamily: monospace;">{q.query.length > 50 ? q.query.substring(0, 50) + "..." : q.query}</span>
                              <span style="marginLeft: 8px; color: #059669;">({q.emailCount} emails)</span>
                            </div>
                          ))}
                          {progress.completedQueries.length > 5 && (
                            <div style="padding: 4px 0; fontStyle: italic;">
                              ...and {progress.completedQueries.length - 5} more
                            </div>
                          )}
                        </div>
                        <div style="marginTop: 8px; fontSize: 12px; color: #1e3a8a; fontWeight: 600;">
                          📊 Total: {progress.completedQueries.reduce((sum: number, q: { emailCount: number }) => sum + q.emailCount, 0)} emails searched
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              ) : null
            )}

            {/* Scan Complete - Auto-saved, just show summary */}
            {/* Display info inside derive (read-only) */}
            {derive(scanCompleted, (completed) =>
              completed ? (
                <div style="padding: 16px; background: #d1fae5; border: 3px solid #10b981; borderRadius: 12px;">
                  <div style="fontSize: 16px; fontWeight: 600; color: #065f46; marginBottom: 12px; textAlign: center;">
                    ✅ Scan Complete!
                  </div>

                  <div style="background: white; borderRadius: 8px; padding: 12px; marginBottom: 12px;">
                    <div style="fontSize: 14px; color: #065f46; textAlign: center;">
                      {derive(agentResult, (r) => r?.membershipsFound || 0)} memberships found and saved automatically
                    </div>
                  </div>

                  {/* Summary from agent */}
                  <div style="fontSize: 12px; color: #059669; textAlign: center; fontStyle: italic; marginBottom: 12px;">
                    {derive(agentResult, (r) => r?.summary || "")}
                  </div>
                </div>
              ) : null
            )}

            {/* Done button OUTSIDE derive to avoid ReadOnlyAddressError */}
            <ct-button
              onClick={completeScan({ lastScanAt, isScanning })}
              size="lg"
              style="background: #10b981; color: white; fontWeight: 700; width: 100%;"
              disabled={derive(scanCompleted, (completed) => !completed)}
            >
              {derive(scanCompleted, (completed) => completed ? "✓ Done" : "Scan not complete")}
            </ct-button>

            {/* Stats */}
            <div style="fontSize: 13px; color: #666;">
              <div>Total Memberships: {totalMemberships}</div>
              {derive(lastScanAt, (ts) =>
                ts > 0 ? <div>Last Scan: {new Date(ts).toLocaleString()}</div> : null
              )}
            </div>

            {/* Memberships List */}
            <div>
              <h3 style="margin: 0 0 12px 0; fontSize: 15px;">Your Memberships</h3>
              {derive(groupedMemberships, (groups) => {
                const brands = Object.keys(groups).sort();
                if (brands.length === 0) {
                  return (
                    <div style="padding: 24px; textAlign: center; color: #999;">
                      No memberships found yet. Click "Scan" to search your emails.
                    </div>
                  );
                }

                return brands.map((brand) => (
                  <details open style="border: 1px solid #e0e0e0; borderRadius: 8px; marginBottom: 12px; padding: 12px;">
                    <summary style="cursor: pointer; fontWeight: 600; fontSize: 14px; marginBottom: 8px;">
                      {brand || "Unknown Brand"} ({groups[brand].length})
                    </summary>
                    <ct-vstack gap={2} style="paddingLeft: 16px;">
                      {groups[brand].map((m) => (
                        <div style="padding: 8px; background: #f8f9fa; borderRadius: 4px;">
                          <div style="fontWeight: 600; fontSize: 13px; marginBottom: 4px;">
                            {m.programName}
                          </div>
                          <div style="marginBottom: 4px;">
                            <code style="fontSize: 14px; background: white; padding: 6px 12px; borderRadius: 4px; display: inline-block;">
                              {m.membershipNumber}
                            </code>
                          </div>
                          {m.tier && (
                            <div style="fontSize: 12px; color: #666; marginBottom: 2px;">
                              ⭐ {m.tier}
                            </div>
                          )}
                          <div style="fontSize: 11px; color: #999;">
                            📧 {m.sourceEmailSubject || "Unknown email"} • {m.sourceEmailDate ? new Date(m.sourceEmailDate).toLocaleDateString() : "Unknown date"}
                          </div>
                        </div>
                      ))}
                    </ct-vstack>
                  </details>
                ));
              })}
            </div>

            {/* Debug Info */}
            <details style="marginTop: 16px;">
              <summary style="cursor: pointer; padding: 8px; background: #f8f9fa; border: 1px solid #e0e0e0; borderRadius: 4px; fontSize: 12px;">
                🔧 Debug Info
              </summary>
              <ct-vstack gap={2} style="padding: 12px; fontSize: 12px;">
                {/* Scan Mode Selector - Power User Setting */}
                <div style="marginBottom: 12px; padding: 8px; background: #f0f0f0; borderRadius: 4px;">
                  <div style="marginBottom: 6px; fontWeight: 600;">Scan Mode:</div>
                  <div style="display: flex; gap: 6px; flexWrap: wrap;">
                    <button
                      onClick={setScanMode({ mode: 5, maxSearches })}
                      style={derive(maxSearches, (max: number) => `
                        padding: 4px 10px; border: 1px solid ${max === 5 ? "#f59e0b" : "#ccc"};
                        borderRadius: 4px; background: ${max === 5 ? "#fef3c7" : "white"};
                        cursor: pointer; fontSize: 11px;
                      `)}
                    >
                      Quick (5)
                    </button>
                    <button
                      onClick={setScanMode({ mode: 20, maxSearches })}
                      style={derive(maxSearches, (max: number) => `
                        padding: 4px 10px; border: 1px solid ${max === 20 ? "#3b82f6" : "#ccc"};
                        borderRadius: 4px; background: ${max === 20 ? "#dbeafe" : "white"};
                        cursor: pointer; fontSize: 11px;
                      `)}
                    >
                      Normal (20)
                    </button>
                    <button
                      onClick={setScanMode({ mode: 0, maxSearches })}
                      style={derive(maxSearches, (max: number) => `
                        padding: 4px 10px; border: 1px solid ${max === 0 ? "#10b981" : "#ccc"};
                        borderRadius: 4px; background: ${max === 0 ? "#d1fae5" : "white"};
                        cursor: pointer; fontSize: 11px;
                      `)}
                    >
                      Full (unlimited)
                    </button>
                  </div>
                </div>
                <div style="fontFamily: monospace;">Is Authenticated: {derive(isAuthenticated, (a) => a ? "Yes ✓" : "No")}</div>
                <div style="fontFamily: monospace;">Auth Source: {authSource}</div>
                <div style="fontFamily: monospace;">Has Direct Auth: {derive(hasDirectAuth, (h) => h ? "Yes ✓" : "No")}</div>
                <div style="fontFamily: monospace;">Has Wished Auth: {derive(hasWishedAuth, (h) => h ? "Yes ✓" : "No")}</div>
                <div style="fontFamily: monospace;">Auth User: {derive(auth, (a) => a?.user?.email || "none")}</div>
                <div style="fontFamily: monospace;">Is Scanning: {derive(isScanning, (s) => s ? "Yes ⏳" : "No")}</div>
                <div style="fontFamily: monospace;">Agent Pending: {derive(agentPending, (p) => p ? "Yes ⏳" : "No ✓")}</div>
                <div style="fontFamily: monospace;">Agent Has Result: {derive(agentResult, (r) => r ? "Yes ✓" : "No")}</div>
                <div style="fontFamily: monospace;">Memberships Found (agent count): {derive(agentResult, (r) => r?.membershipsFound || 0)}</div>
                <div style="fontFamily: monospace;">Searches Performed: {derive(agentResult, (r) =>
                  r?.searchesPerformed?.map((s: any) => `${s.query} (${s.emailsFound})`).join(", ") || "none"
                )}</div>
                <div style="fontFamily: monospace;">Agent Summary: {derive(agentResult, (r) => r?.summary?.substring(0, 100) || "none")}</div>
              </ct-vstack>
            </details>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});
