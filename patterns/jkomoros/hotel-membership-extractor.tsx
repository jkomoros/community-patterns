/// <cts-enable />
import { Cell, Default, derive, generateObject, getRecipeEnvironment, handler, NAME, navigateTo, pattern, UI, wish } from "commontools";
import GmailAuth from "./gmail-auth.tsx";

// Import Email type and Auth type
import type { Auth } from "./gmail-importer.tsx";

// What we expect from the gmail-auth charm via wish
type GoogleAuthCharm = {
  auth: Auth;
};

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
  memberships: Default<MembershipRecord[], []>;
  lastScanAt: Default<number, 0>;
  isScanning: Default<boolean, false>;
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

export default pattern<HotelMembershipInput>(({
  memberships,
  lastScanAt,
  isScanning,
}) => {
  // ============================================================================
  // AUTH: Discover via wish (shared with all Gmail patterns)
  // Using legacy string syntax which is more reliable
  // ============================================================================

  const wishResult = wish<GoogleAuthCharm>("#googleAuth");

  const auth = derive(wishResult, (w) =>
    w?.auth || {
      token: "",
      tokenType: "",
      scope: [],
      expiresIn: 0,
      expiresAt: 0,
      refreshToken: "",
      user: { email: "", name: "", picture: "" },
    });

  const isAuthenticated = derive(auth, (a) =>
    !!(a && a.token && a.user && a.user.email)
  );

  const hasWishedAuth = derive(wishResult, (w) => !!w);
  const wishError = derive(wishResult, (_w) => null);  // Legacy syntax doesn't return errors

  // ============================================================================
  // AGENT: Single agent with searchGmail tool
  // ============================================================================

  // The searchGmail tool - async handler that fetches and returns emails
  // When used as a tool, the framework passes a 'result' cell that we MUST write to
  const searchGmailHandler = handler<
    { query: string; result?: Cell<any> },
    { auth: Cell<Auth> }
  >(
    async (input, state) => {
      const authData = state.auth.get();
      const token = authData?.token as string;

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
    [isScanning, memberships],
    ([scanning, found]: [boolean, MembershipRecord[]]) => {
      if (!scanning) return "";  // Don't run unless actively scanning

      const foundBrands = [...new Set(found.map(m => m.hotelBrand))];

      return `Find hotel loyalty program membership numbers in my Gmail.

Already found memberships for: ${foundBrands.join(", ") || "none yet"}
Total memberships found: ${found.length}

Your task:
1. Use the searchGmail tool to search for hotel loyalty emails
2. Analyze the returned emails for membership numbers
3. Extract membership information from the email bodies

Hotel brands to search for:
- Marriott (Marriott Bonvoy) - try: from:marriott.com OR from:email.marriott.com
- Hilton (Hilton Honors) - try: from:hilton.com OR from:hiltonhonors.com
- Hyatt (World of Hyatt) - try: from:hyatt.com
- IHG (IHG One Rewards) - try: from:ihg.com
- Accor (ALL - Accor Live Limitless) - try: from:accor.com

Search strategy:
1. Start with a broad query: from:marriott.com OR from:hilton.com OR from:hyatt.com OR from:ihg.com
2. Look for emails with subjects containing "member", "account", "welcome", "status", "points"
3. In email bodies, look for patterns like:
   - "Member #" or "Membership Number:" followed by digits
   - "Bonvoy Number:", "Hilton Honors #:", "World of Hyatt #:"
   - Account numbers are typically 9-16 digits

For each membership found, provide:
- hotelBrand: The hotel chain name
- programName: The loyalty program name
- membershipNumber: The actual number (digits only)
- tier: Status tier if mentioned (Member, Silver, Gold, Platinum, Diamond, etc.)
- sourceEmailId: The email ID
- sourceEmailSubject: The email subject
- sourceEmailDate: The email date
- confidence: 0-100 how confident you are this is correct

Return all memberships you find. Be thorough - search multiple brands!`;
    }
  );

  const agentTools = {
    searchGmail: {
      description: "Search Gmail with a query and return matching emails. Returns email id, subject, from, date, snippet, and body text.",
      handler: searchGmailHandler({ auth }),
    },
  };

  const agent = generateObject({
    system: `You are a hotel loyalty membership extractor.

Your job: Search Gmail to find hotel loyalty program membership numbers.

You have ONE tool: searchGmail({ query: string })
- Use Gmail search syntax: from:domain.com, subject:"keyword", OR, AND
- The tool returns emails with full body text
- Search multiple times if needed for different hotel brands

When you find a membership number:
- Verify it looks like a real membership number (usually 9-16 digits)
- Note the tier/status if mentioned
- Record which email it came from

Be thorough and search for all major hotel brands.`,

    prompt: agentPrompt,

    tools: agentTools,

    model: "anthropic:claude-sonnet-4-5",

    schema: {
      type: "object",
      properties: {
        memberships: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hotelBrand: { type: "string" },
              programName: { type: "string" },
              membershipNumber: { type: "string" },
              tier: { type: "string" },
              sourceEmailId: { type: "string" },
              sourceEmailSubject: { type: "string" },
              sourceEmailDate: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["hotelBrand", "programName", "membershipNumber", "sourceEmailId", "sourceEmailSubject", "sourceEmailDate", "confidence"],
          },
        },
        searchesPerformed: {
          type: "array",
          items: {
            type: "object",
            properties: {
              query: { type: "string" },
              emailsFound: { type: "number" },
            },
          },
        },
        summary: {
          type: "string",
          description: "Brief summary of what was found",
        },
      },
      required: ["memberships", "summary"],
    },
  });

  const { result: agentResult, pending: agentPending } = agent;

  // Store agent result for save handler
  const agentResultStore = Cell.of<any>(null);
  derive([agentResult], ([result]) => {
    if (result) {
      agentResultStore.set(result);
    }
    return result;
  });

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

  const startScan = handler<unknown, {
    isScanning: Cell<Default<boolean, false>>;
    isAuthenticated: Cell<boolean>;
  }>((_, state) => {
    if (!state.isAuthenticated.get()) return;
    console.log("[StartScan] Beginning hotel membership extraction");
    state.isScanning.set(true);
  });

  const saveResults = handler<unknown, {
    memberships: Cell<Default<MembershipRecord[], []>>;
    lastScanAt: Cell<Default<number, 0>>;
    isScanning: Cell<Default<boolean, false>>;
    agentResultStore: Cell<any>;
  }>((_, state) => {
    const result = state.agentResultStore.get();
    if (!result) return;

    console.log("[SaveResults] Raw result:", JSON.stringify(result, null, 2));
    console.log("[SaveResults] Raw memberships:", result.memberships);

    // Debug each membership
    if (result.memberships) {
      result.memberships.forEach((m: any, i: number) => {
        console.log(`[SaveResults] Membership ${i}:`, {
          hotelBrand: m.hotelBrand,
          hotelBrandType: typeof m.hotelBrand,
          programName: m.programName,
          membershipNumber: m.membershipNumber,
        });
      });
    }

    const currentMemberships = state.memberships.get();

    // Add new memberships with unique IDs
    // Extract only primitive fields - don't spread the whole object as it may contain @link references
    // Also handle case where values might be cell references that need .get()
    const newMemberships = (result.memberships || []).map((m: any) => {
      // Try to get raw values, handling both direct values and cell references
      const getValue = (v: any): string => {
        if (v === null || v === undefined) return "";
        if (typeof v === "string") return v;
        if (typeof v === "number") return String(v);
        if (typeof v?.get === "function") return String(v.get() || "");
        return String(v);
      };

      const membership = {
        id: `${getValue(m.hotelBrand)}-${getValue(m.membershipNumber)}-${Date.now()}`,
        hotelBrand: getValue(m.hotelBrand),
        programName: getValue(m.programName),
        membershipNumber: getValue(m.membershipNumber),
        tier: m.tier ? getValue(m.tier) : undefined,
        sourceEmailId: getValue(m.sourceEmailId),
        sourceEmailDate: getValue(m.sourceEmailDate),
        sourceEmailSubject: getValue(m.sourceEmailSubject),
        extractedAt: Date.now(),
        confidence: typeof m.confidence === "number" ? m.confidence : undefined,
      };
      console.log(`[SaveResults] Processed membership:`, membership);
      return membership;
    });

    // Deduplicate by membership number
    const existingNumbers = new Set(currentMemberships.map(m => m.membershipNumber));
    const uniqueNew = newMemberships.filter((m: MembershipRecord) => !existingNumbers.has(m.membershipNumber));

    if (uniqueNew.length > 0) {
      state.memberships.set([...currentMemberships, ...uniqueNew]);
    }

    state.lastScanAt.set(Date.now());
    state.isScanning.set(false);

    console.log(`[SaveResults] Saved ${uniqueNew.length} new memberships`);
  });

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  const shouldShowSaveButton = derive(
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
    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2 style="margin: 0; fontSize: 18px;">Hotel Memberships</h2>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 16px;">
            {/* Auth Status */}
            {derive([isAuthenticated, hasWishedAuth, wishError], ([authenticated, hasAuth, error]) => {
              if (authenticated) {
                return (
                  <div style="padding: 12px; background: #d1fae5; border: 1px solid #10b981; borderRadius: 8px;">
                    <div style="fontSize: 14px; color: #065f46; textAlign: center;">
                      ✅ Gmail connected via shared auth
                    </div>
                  </div>
                );
              }

              if (!hasAuth) {
                return (
                  <div style="padding: 24px; background: #fee2e2; border: 3px solid #dc2626; borderRadius: 12px;">
                    <div style="fontSize: 20px; fontWeight: 700; color: #991b1b; textAlign: center; marginBottom: 16px;">
                      🔒 Gmail Authentication Required
                    </div>
                    <div style="padding: 16px; background: white; borderRadius: 8px; border: 1px solid #fca5a5; textAlign: center;">
                      <p style="margin: 0 0 12px 0; fontSize: 14px;">
                        Create a Gmail Auth charm to authenticate:
                      </p>
                      <ct-button
                        onClick={createGmailAuth({})}
                        size="lg"
                      >
                        🔐 Create Gmail Auth
                      </ct-button>
                      <p style="margin: 12px 0 0 0; fontSize: 13px; color: #666;">
                        After authenticating, click the ⭐ star to favorite it, then come back here.
                      </p>
                      {error ? <div style="marginTop: 12px; fontSize: 12px; color: #666;">Debug: {error}</div> : null}
                    </div>
                  </div>
                );
              }

              return (
                <div style="padding: 24px; background: #fef3c7; border: 3px solid #f59e0b; borderRadius: 12px;">
                  <div style="fontSize: 20px; fontWeight: 700; color: #92400e; textAlign: center; marginBottom: 16px;">
                    ⚠️ Gmail Auth Found - Please Complete Authentication
                  </div>
                  <div style="fontSize: 14px; color: #78350f; textAlign: center;">
                    Open your Gmail Auth charm and sign in with Google.
                  </div>
                </div>
              );
            })}

            {/* Scan Button */}
            <ct-button
              onClick={startScan({ isScanning, isAuthenticated })}
              size="lg"
              disabled={derive([isAuthenticated, isScanning], ([auth, scanning]) => !auth || scanning)}
            >
              {derive([isAuthenticated, isScanning], ([auth, scanning]) => {
                if (!auth) return "🔒 Authenticate First";
                if (scanning) return "⏳ Scanning...";
                return "🔍 Scan for Hotel Memberships";
              })}
            </ct-button>

            {/* Progress */}
            {derive([isScanning, agentPending], ([scanning, pending]) =>
              scanning && pending ? (
                <div style="padding: 16px; background: #dbeafe; border: 1px solid #3b82f6; borderRadius: 8px; textAlign: center;">
                  <div style="fontWeight: 600; marginBottom: 8px;">🤖 AI Agent Working...</div>
                  <div style="fontSize: 13px; color: #1e40af;">
                    Searching Gmail for hotel loyalty emails and extracting membership numbers
                  </div>
                </div>
              ) : null
            )}

            {/* Results Ready */}
            {derive(shouldShowSaveButton, (show) =>
              show ? (
                <div style="padding: 16px; background: #d1fae5; border: 3px solid #10b981; borderRadius: 12px;">
                  <div style="fontSize: 16px; fontWeight: 600; color: #065f46; marginBottom: 8px; textAlign: center;">
                    ✅ Extraction Complete!
                  </div>
                  <div style="fontSize: 13px; color: #047857; textAlign: center; marginBottom: 12px;">
                    {derive(agentResult, (r) => {
                      const count = r?.memberships?.length || 0;
                      return count > 0
                        ? `Found ${count} membership${count !== 1 ? 's' : ''}!`
                        : "No new memberships found";
                    })}
                  </div>
                  <div style="fontSize: 12px; color: #059669; textAlign: center;">
                    {derive(agentResult, (r) => r?.summary || "")}
                  </div>
                </div>
              ) : null
            )}

            {/* Save Button */}
            <ct-button
              onClick={saveResults({ memberships, lastScanAt, isScanning, agentResultStore })}
              size="lg"
              style="background: #10b981; color: white; fontWeight: 700; width: 100%;"
              hidden={derive(shouldShowSaveButton, (show) => !show)}
            >
              💾 Save Results & Complete
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
              <ct-vstack gap={2} style="padding: 12px; fontSize: 12px; fontFamily: monospace;">
                <div>Is Authenticated: {derive(isAuthenticated, (a) => a ? "Yes ✓" : "No")}</div>
                <div>Has Wished Auth: {derive(hasWishedAuth, (h) => h ? "Yes ✓" : "No")}</div>
                <div>Auth User: {derive(auth, (a) => a?.user?.email || "none")}</div>
                <div>Is Scanning: {derive(isScanning, (s) => s ? "Yes ⏳" : "No")}</div>
                <div>Agent Pending: {derive(agentPending, (p) => p ? "Yes ⏳" : "No ✓")}</div>
                <div>Agent Has Result: {derive(agentResult, (r) => r ? "Yes ✓" : "No")}</div>
                <div>Memberships in Result: {derive(agentResult, (r) => r?.memberships?.length || 0)}</div>
                <div>Searches Performed: {derive(agentResult, (r) =>
                  r?.searchesPerformed?.map((s: any) => `${s.query} (${s.emailsFound})`).join(", ") || "none"
                )}</div>
              </ct-vstack>
            </details>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});
