/// <cts-enable />
import { Cell, cell, computed, Default, derive, generateObject, handler, NAME, pattern, UI, wish } from "commontools";
import GmailImporter from "./gmail-importer.tsx";

// Import Email type and Auth type
import type { Email, Auth } from "./gmail-importer.tsx";

// What we expect from the gmail-auth charm via wish
type GoogleAuthCharm = {
  auth: Auth;
};

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

interface QueryAttempt {
  query: string;                // The Gmail query tried
  attemptedAt: number;          // Timestamp
  emailsFound: number;          // How many emails returned
  membershipsFound: number;     // How many memberships extracted
  emailIds: { [id: string]: true };  // Which emails (for deduplication, using object as set)
}

interface BrandSearchHistory {
  brand: string;                // Brand name (e.g., "Marriott")
  attempts: QueryAttempt[];     // All query attempts for this brand
  status: "searching" | "found" | "exhausted";  // Current status
}

// Old tracking structure (for backward compatibility during transition)
interface BrandSearchRecord {
  brand: string;
  searchedAt: number;
}

interface HotelMembershipInput {
  memberships: Default<MembershipRecord[], []>;
  scannedEmailIds: Default<string[], []>;
  lastScanAt: Default<number, 0>;
  // New: Query history tracking per brand
  brandHistory: Default<BrandSearchHistory[], [{ brand: "Marriott"; attempts: []; status: "searching" }]>;
  // Old fields kept for backward compatibility during transition
  searchedBrands: Default<string[], []>;
  searchedNotFound: Default<BrandSearchRecord[], []>;  // Old tracking structure
  unsearchedBrands: Default<string[], []>;
  currentQuery: Default<string, "">;
  isScanning: Default<boolean, false>;
  queryGeneratorInput: Default<string, "">;  // Trigger cell for LLM query generation
  // Gmail settings - individual fields like substack-summarizer
  gmailFilterQuery: Default<string, "">;
  limit: Default<number, 50>;
  // Auth is now discovered via wish() - no longer stored in pattern input
}

export default pattern<HotelMembershipInput>(({
  memberships,
  scannedEmailIds,
  lastScanAt,
  brandHistory,
  searchedBrands,
  searchedNotFound,
  unsearchedBrands,
  currentQuery,
  isScanning,
  queryGeneratorInput,
  gmailFilterQuery,
  limit,
}) => {
  // ============================================================================
  // AUTH: Discover via wish (shared with all Gmail patterns)
  // ============================================================================

  // Wish for a favorited auth charm with #googleAuth tag
  const wishResult = wish<GoogleAuthCharm>({ tag: "#googleAuth" });

  // Extract auth data from wished charm
  const auth = derive(wishResult, (w) =>
    w?.result?.auth || {
      token: "",
      tokenType: "",
      scope: [],
      expiresIn: 0,
      expiresAt: 0,
      refreshToken: "",
      user: { email: "", name: "", picture: "" },
    });

  // Track auth status
  const isAuthenticated = derive(auth, (a) =>
    !!(a && a.token && a.user && a.user.email)
  );

  // Track if wish found an auth charm
  const hasWishedAuth = derive(wishResult, (w) => !!w?.result);
  const wishError = derive(wishResult, (w) => w?.error || null);

  // ============================================================================
  // GMAIL IMPORTER: Single instance with reactive query cell
  // ============================================================================

  // Create a mutable query cell that the agent can update
  const agentQueryCell = Cell.of("");

  // Create a single GmailImporter instance that reacts to query changes
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery: agentQueryCell,  // Reactive - updates trigger new fetch
      limit: Cell.of(20),
      historyId: Cell.of(""),
    },
    authCharm: null,  // Let GmailImporter discover auth via wish
  });

  // Transform emails to include @link references for body content
  const agentEmails = derive(importer.emails, (emailsList: Email[]) => {
    if (!emailsList || !Array.isArray(emailsList)) return [];

    return emailsList.map((email: Email) => ({
      id: email.id,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      date: email.date,
      to: email.to,
      snippet: email.snippet,
      // Body content typed as any -> becomes @link references for agent
      markdownContent: email.markdownContent as any,
      htmlContent: email.htmlContent as any,
      plainText: email.plainText as any,
    }));
  });

  // ============================================================================
  // AGENT: Hotel Membership Extractor with Tool Calling
  // ============================================================================

  // Tool: Set the Gmail query (triggers reactive fetch)
  const setGmailQueryHandler = handler<
    { query: string },
    { queryCell: Cell<string> }
  >((input, state) => {
    console.log(`[Agent] Setting Gmail query to: ${input.query}`);
    state.queryCell.set(input.query);
    return { success: true, query: input.query };
  });

  // Agent prompt - DON'T include agentQueryCell as dependency to avoid reactive loop
  // The agent will see the query via the emails loaded (or via importer state)
  const agentPrompt = derive(
    [brandHistory, memberships, isScanning, agentEmails],
    ([history, found, scanning, emails]: [BrandSearchHistory[], MembershipRecord[], boolean, any[]]) => {
      if (!scanning) return "";  // Don't run unless actively scanning

      const foundBrands = history.filter((h: BrandSearchHistory) => h.status === "found").map((h: BrandSearchHistory) => h.brand);
      const searchingBrands = history.filter((h: BrandSearchHistory) => h.status === "searching").map((h: BrandSearchHistory) => h.brand);
      const exhaustedBrands = history.filter((h: BrandSearchHistory) => h.status === "exhausted").map((h: BrandSearchHistory) => h.brand);

      // Show recent query attempts for context
      const recentAttempts = history
        .flatMap((h: BrandSearchHistory) => h.attempts.map((a: QueryAttempt) => `${h.brand}: "${a.query}" → ${a.emailsFound} emails, ${a.membershipsFound} memberships`))
        .slice(-5);  // Last 5 attempts

      // Format current emails for agent to see
      const emailSummary = emails.length > 0
        ? emails.map((e: any, i: number) => `${i + 1}. [${e.id}] "${e.subject}" from ${e.from} (${e.date})`).join("\n")
        : "(no emails loaded yet - set a query first)";

      return `Find hotel loyalty program membership numbers in my Gmail account.

Current progress:
- Memberships found: ${found.length}
- Brands found: ${foundBrands.join(", ") || "none yet"}
- Brands searching: ${searchingBrands.join(", ") || "none"}
- Brands exhausted: ${exhaustedBrands.join(", ") || "none"}

Recent query attempts:
${recentAttempts.length > 0 ? recentAttempts.join("\n") : "No attempts yet"}

Current emails (${emails.length}):
${emailSummary}

Search for memberships from these hotel brands: Marriott, Hilton, Hyatt, IHG, Accor

IMPORTANT: This is a ONE-SHOT task. You must:
1. First, call setGmailQuery with "from:marriott.com" to search Gmail
2. The results will appear above once loaded - analyze the subjects
3. Read specific emails using their @link references
4. Extract any membership numbers found
5. Return your final result with all memberships

Do NOT call setGmailQuery multiple times in a loop. Call it once, examine results, read emails, then return your final result with the memberships array.`;
    }
  );

  // Define tools using the handler approach (handlers can mutate cells!)
  const agentTools = {
    setGmailQuery: {
      description: "Set the Gmail search query. This triggers a new search and the results will appear in the email list. Wait for the emails to load after calling this.",
      handler: setGmailQueryHandler({ queryCell: agentQueryCell }),
    },
  };

  const agent = generateObject({
    system: `You are a hotel loyalty program membership extractor.

Your goal: Find membership numbers from hotel loyalty programs in the user's Gmail.

CRITICAL: This is a SINGLE-PASS extraction. You will:
1. See emails already loaded in the prompt (if any)
2. Optionally call setGmailQuery ONCE to search for a specific brand
3. Analyze the email list shown in the prompt
4. Extract membership info from any promising emails
5. Return your final result immediately

Available tools:
- setGmailQuery(query): Search Gmail (e.g., "from:marriott.com"). Call this ONLY ONCE.
- read(@link): Read email content

DO NOT:
- Call setGmailQuery multiple times
- Loop or repeat tool calls
- Wait for anything - results appear in the prompt automatically

Membership data to extract:
- hotelBrand: "Marriott", "Hilton", etc.
- programName: "Marriott Bonvoy", "Hilton Honors", etc.
- membershipNumber: The actual number (typically 9-12 digits)
- tier: "Gold", "Platinum", etc. (if mentioned)
- sourceEmailId: Email ID where found
- sourceEmailSubject: Email subject
- sourceEmailDate: Email date
- confidence: 0-100

Return your final result with the memberships array containing any found memberships.`,

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
        queriesAttempted: {
          type: "array",
          items: {
            type: "object",
            properties: {
              brand: { type: "string" },
              query: { type: "string" },
              emailsFound: { type: "number" },
              emailsRead: { type: "number" },
            },
          },
        },
      },
      required: ["memberships"],
    },
  });

  const { result: agentResult, pending: agentPending } = agent;

  // Store agent result in a mutable cell that we can read from the handler
  const agentResultStore = Cell.of<any>(null);

  // Update the store whenever agent result changes
  derive([agentResult], ([result]) => {
    if (result) {
      agentResultStore.set(result);
    }
    return result;
  });

  // Handler to save agent results and stop scanning
  const saveAgentResults = handler<unknown, {
    memberships: Cell<Default<MembershipRecord[], []>>;
    scannedEmailIds: Cell<Default<string[], []>>;
    lastScanAt: Cell<Default<number, 0>>;
    brandHistory: Cell<Default<BrandSearchHistory[], []>>;
    isScanning: Cell<Default<boolean, false>>;
    agentResultStore: Cell<any>;
  }>((_, state) => {
    const result = state.agentResultStore.get();
    if (!result) return;

    const currentMemberships = state.memberships.get();
    const scanned = state.scannedEmailIds.get();
    const currentHistory = state.brandHistory.get();

    // Add new memberships with unique IDs and extractedAt timestamp
    const newMemberships = result.memberships.map((m: any) => ({
      ...m,
      id: `${m.hotelBrand}-${m.membershipNumber}-${Date.now()}`,
      extractedAt: Date.now(),
    }));

    // Update memberships array
    state.memberships.set([...currentMemberships, ...newMemberships]);

    // Update scanned email IDs from queriesAttempted
    const allEmailIds = new Set(scanned);
    // Note: Agent doesn't track individual email IDs, so we'll just mark scan time

    // Update brandHistory based on queriesAttempted
    const updatedHistory = [...currentHistory];

    if (result.queriesAttempted && Array.isArray(result.queriesAttempted)) {
      for (const queryAttempt of result.queriesAttempted) {
        const { brand, query, emailsFound, emailsRead } = queryAttempt;

        // Find or create brand entry
        let brandEntry = updatedHistory.find(h => h.brand === brand);

        // Count how many memberships were found for this brand in this agent run
        const membershipsForBrand = newMemberships.filter((m: MembershipRecord) => m.hotelBrand === brand).length;

        const attempt: QueryAttempt = {
          query,
          attemptedAt: Date.now(),
          emailsFound: emailsFound || 0,
          membershipsFound: membershipsForBrand,
          emailIds: {}, // Agent doesn't track individual IDs
        };

        if (brandEntry) {
          // Update existing brand entry
          const newAttempts = [...brandEntry.attempts, attempt];

          // Determine new status
          let newStatus: "searching" | "found" | "exhausted" = brandEntry.status;
          if (membershipsForBrand > 0) {
            newStatus = "found";
          } else if (newAttempts.length >= 5) {
            newStatus = "exhausted";
          } else {
            newStatus = "searching";
          }

          // Update in place
          brandEntry.attempts = newAttempts;
          brandEntry.status = newStatus;
        } else {
          // Create new brand entry
          const newStatus: "searching" | "found" | "exhausted" =
            membershipsForBrand > 0 ? "found" : "searching";

          updatedHistory.push({
            brand,
            attempts: [attempt],
            status: newStatus,
          });
        }
      }
    }

    state.brandHistory.set(updatedHistory);
    state.lastScanAt.set(Date.now());

    // Stop scanning
    state.isScanning.set(false);
  });

  // Determine when to show agent save button
  const shouldShowAgentSaveButton = derive(
    [isScanning, agentPending, agentResult],
    ([scanning, pending, result]) => {
      // Show save button when:
      // 1. We're in scanning mode
      // 2. Agent is complete (not pending)
      // 3. We have agent results
      return scanning && !pending && !!result;
    }
  );

  // Group memberships by hotel brand
  const groupedMemberships = derive(memberships, (membershipList: MembershipRecord[]) => {
    const groups: Record<string, MembershipRecord[]> = {};

    // Defensive check for undefined/null
    if (!membershipList || !Array.isArray(membershipList)) {
      return groups;
    }

    for (const membership of membershipList) {
      if (!groups[membership.hotelBrand]) {
        groups[membership.hotelBrand] = [];
      }
      groups[membership.hotelBrand].push(membership);
    }

    return groups;
  });

  const totalMemberships = derive(memberships, (list) => (list && Array.isArray(list)) ? list.length : 0);

  // Handler to start agent scan
  const startAgentScan = handler<unknown, {
    isScanning: Cell<Default<boolean, false>>;
    isAuthenticated: Cell<boolean>;
  }>((_, state) => {
    // Check if authenticated (via wished auth)
    if (!state.isAuthenticated.get()) {
      return;
    }

    // Set scanning flag - this will trigger agent via agentPrompt reactive dependency
    state.isScanning.set(true);
  });

  return {
    [NAME]: "🏨 Hotel Membership Extractor",
    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2 style="margin: 0; fontSize: 18px;">Hotel Memberships</h2>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 16px;">
            {/* Scan Control */}
            <ct-vstack gap={2}>
              {/* Authentication status - uses wish-based auth discovery */}
              {derive([isAuthenticated, hasWishedAuth, wishError], ([authenticated, hasAuth, error]) => {
                if (authenticated) {
                  // Authenticated via wished auth
                  return (
                    <div style="padding: 12px; background: #d1fae5; border: 1px solid #10b981; borderRadius: 8px; marginBottom: 8px;">
                      <div style="fontSize: 14px; color: #065f46; textAlign: center;">
                        ✅ Using shared Gmail auth from favorited charm
                      </div>
                    </div>
                  );
                }

                if (!hasAuth) {
                  // No auth charm found via wish
                  return (
                    <div style="padding: 24px; background: #fee2e2; border: 3px solid #dc2626; borderRadius: 12px; marginBottom: 8px;">
                      <div style="fontSize: 20px; fontWeight: 700; color: #991b1b; textAlign: center; marginBottom: 16px;">
                        🔒 Gmail Authentication Required
                      </div>
                      <div style="fontSize: 14px; color: #7f1d1d; textAlign: center; marginBottom: 16px; lineHeight: 1.5;">
                        This tool scans your Gmail for hotel membership numbers.
                      </div>
                      <div style="padding: 16px; background: white; borderRadius: 8px; border: 1px solid #fca5a5;">
                        <strong>To enable Gmail access:</strong>
                        <ol style="margin: 8px 0 0 0; paddingLeft: 20px; fontSize: 14px;">
                          <li>Deploy a <code>gmail-auth</code> pattern</li>
                          <li>Authenticate with Google</li>
                          <li>Click the ⭐ star to favorite it</li>
                          <li>This extractor will automatically find it!</li>
                        </ol>
                        {error ? (
                          <div style="marginTop: 12px; fontSize: 12px; color: #666;">
                            Debug: {error}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                // Has auth charm but not authenticated (user needs to complete OAuth)
                return (
                  <div style="padding: 24px; background: #fef3c7; border: 3px solid #f59e0b; borderRadius: 12px; marginBottom: 8px;">
                    <div style="fontSize: 20px; fontWeight: 700; color: #92400e; textAlign: center; marginBottom: 16px;">
                      ⚠️ Gmail Auth Found - Please Authenticate
                    </div>
                    <div style="fontSize: 14px; color: #78350f; textAlign: center; lineHeight: 1.5;">
                      Found a favorited Gmail Auth charm, but it's not authenticated yet.<br/>
                      Please open the Gmail Auth charm and complete the Google sign-in.
                    </div>
                  </div>
                );
              })}

              {/* Scan button - disabled if not authenticated or currently scanning */}
              <ct-button
                onClick={startAgentScan({ isScanning, isAuthenticated })}
                size="lg"
                disabled={derive([isAuthenticated, isScanning], ([authenticated, scanning]) =>
                  !authenticated || scanning
                )}
              >
                {derive([isAuthenticated, isScanning], ([authenticated, scanning]) => {
                  if (!authenticated) return "🔒 Authenticate First";
                  if (scanning) return "⏳ Scanning...";
                  return "🔍 Scan for Hotel Memberships";
                })}
              </ct-button>

              {/* Agent progress status */}
              {derive([isScanning, agentPending], ([scanning, pending]) =>
                scanning && pending ? (
                  <div style="padding: 12px; background: #fef3c7; border: 1px solid #f59e0b; borderRadius: 8px; fontSize: 13px; textAlign: center;">
                    🤖 Agent is searching Gmail and extracting memberships...
                  </div>
                ) : null
              )}

              {/* PROMINENT Agent Save Results Button - appears when agent completes */}
              {/* Display-only content inside derive */}
              {derive(shouldShowAgentSaveButton, (show) =>
                show ? (
                  <div style="padding: 16px; background: #d1fae5; border: 3px solid #10b981; borderRadius: 12px;">
                    <div style="fontSize: 14px; fontWeight: 600; color: #065f46; marginBottom: 12px; textAlign: center;">
                      ✅ Agent Extraction Complete!
                    </div>
                    <div style="fontSize: 13px; color: #047857; marginBottom: 12px; textAlign: center;">
                      {derive(agentResult, (result) => {
                        const count = result?.memberships?.length || 0;
                        const queries = result?.queriesAttempted?.length || 0;
                        if (count > 0) {
                          return `Found ${count} membership${count !== 1 ? 's' : ''} across ${queries} search${queries !== 1 ? 'es' : ''}`;
                        }
                        return `Searched ${queries} quer${queries !== 1 ? 'ies' : 'y'}, no new memberships found`;
                      })}
                    </div>
                    <div style="fontSize: 11px; color: #059669; marginTop: 8px; textAlign: center; fontStyle: italic;">
                      Click button below to save memberships and stop scanning
                    </div>
                  </div>
                ) : null
              )}

              {/* Save button - use hidden attribute for visibility to avoid derive context issues */}
              <ct-button
                onClick={saveAgentResults({
                  memberships,
                  scannedEmailIds,
                  lastScanAt,
                  brandHistory,
                  isScanning,
                  agentResultStore: agentResultStore,
                })}
                size="lg"
                style="background: #10b981; color: white; fontWeight: 700; width: 100%;"
                hidden={derive(shouldShowAgentSaveButton, (show) => !show)}
              >
                💾 Save Results & Complete
              </ct-button>
            </ct-vstack>

            {/* Summary Stats */}
            <div style="fontSize: 13px; color: #666;">
              <div>Total Memberships: {totalMemberships}</div>
              <div>Brands Searched: {derive(searchedBrands, (brands) => brands.length)}</div>
              <div>Emails Scanned: {derive(scannedEmailIds, (ids) => ids.length)}</div>
              {derive(lastScanAt, (timestamp) =>
                timestamp > 0
                  ? <div>Last Scan: {new Date(timestamp).toLocaleString()}</div>
                  : null
              )}
            </div>

            {/* Memberships Grouped by Brand */}
            <div>
              <h3 style="margin: 0 0 12px 0; fontSize: 15px;">Your Memberships</h3>
              {derive(groupedMemberships, (groups) => {
                // Defensive check
                if (!groups || typeof groups !== 'object') {
                  return (
                    <div style="padding: 24px; textAlign: center; color: #999;">
                      No memberships found yet. Click "Scan for Memberships" to search your emails.
                    </div>
                  );
                }

                const brands = Object.keys(groups).sort();

                if (brands.length === 0) {
                  return (
                    <div style="padding: 24px; textAlign: center; color: #999;">
                      No memberships found yet. Click "Scan for Memberships" to search your emails.
                    </div>
                  );
                }

                return brands.map((brand) => {
                  const membershipList = groups[brand];

                  // Defensive check for membershipList
                  if (!membershipList || !Array.isArray(membershipList)) {
                    return null;
                  }

                  return (
                    <details open style="border: 1px solid #e0e0e0; borderRadius: 8px; marginBottom: 12px; padding: 12px;">
                      <summary style="cursor: pointer; fontWeight: 600; fontSize: 14px; marginBottom: 8px;">
                        {brand} ({membershipList.length})
                      </summary>
                      <ct-vstack gap={2} style="paddingLeft: 16px;">
                        {membershipList.map((membership) => {
                          // Defensive check for membership object
                          if (!membership) return null;

                          return (
                            <div style="padding: 8px; background: #f8f9fa; borderRadius: 4px;">
                              <div style="fontWeight: 600; fontSize: 13px; marginBottom: 4px;">
                                {membership.programName || 'Unknown Program'}
                              </div>
                              <div style="marginBottom: 4px;">
                                <code style="fontSize: 14px; background: white; padding: 6px 12px; borderRadius: 4px; display: inline-block;">
                                  {membership.membershipNumber || 'No Number'}
                                </code>
                              </div>
                              {membership.tier && (
                                <div style="fontSize: 12px; color: #666; marginBottom: 2px;">
                                  ⭐ {membership.tier}
                                </div>
                              )}
                              <div style="fontSize: 11px; color: #999;">
                                📧 {membership.sourceEmailSubject || 'No Subject'} • {membership.sourceEmailDate ? new Date(membership.sourceEmailDate).toLocaleDateString() : 'Unknown Date'}
                              </div>
                            </div>
                          );
                        })}
                      </ct-vstack>
                    </details>
                  );
                });
              })}
            </div>

            {/* Debug/Status Info */}
            <details style="marginTop: 16px;">
              <summary style="cursor: pointer; padding: 8px; background: #f8f9fa; border: 1px solid #e0e0e0; borderRadius: 4px; fontSize: 12px;">
                🔧 Debug Info
              </summary>
              <ct-vstack gap={2} style="padding: 12px; fontSize: 12px; fontFamily: monospace;">
                <div style="fontWeight: 600; marginTop: 8px; marginBottom: 4px;">Brand History (New System):</div>
                {derive(brandHistory, (history) => {
                  if (!history || !Array.isArray(history) || history.length === 0) {
                    return <div style="paddingLeft: 12px; color: #999;">No history yet</div>;
                  }
                  return history.map((brandEntry) => (
                    <details style="marginLeft: 12px; marginBottom: 8px; border: 1px solid #e0e0e0; borderRadius: 4px; padding: 8px; background: white;">
                      <summary style="cursor: pointer; fontWeight: 500;">
                        {brandEntry.brand} - Status: <span style={{
                          color: brandEntry.status === "found" ? "#10b981" : brandEntry.status === "exhausted" ? "#ef4444" : "#f59e0b"
                        }}>{brandEntry.status}</span> ({brandEntry.attempts.length} attempts)
                      </summary>
                      <div style="paddingLeft: 12px; marginTop: 8px;">
                        {brandEntry.attempts.map((attempt, idx) => (
                          <div style="marginBottom: 8px; paddingBottom: 8px; borderBottom: idx < brandEntry.attempts.length - 1 ? '1px solid #f3f4f6' : 'none';">
                            <div><strong>Attempt {idx + 1}:</strong> {new Date(attempt.attemptedAt).toLocaleString()}</div>
                            <div style="marginTop: 4px;"><strong>Query:</strong> <code style="background: #f3f4f6; padding: 2px 6px; borderRadius: 3px;">{attempt.query}</code></div>
                            <div><strong>Results:</strong> {attempt.emailsFound} emails → {attempt.membershipsFound} memberships</div>
                            {attempt.membershipsFound > 0 && <div style="color: #10b981; fontWeight: 600;">✅ Success!</div>}
                          </div>
                        ))}
                      </div>
                    </details>
                  ));
                })}

                <div style="fontWeight: 600; marginTop: 12px; marginBottom: 4px;">Old Tracking (Deprecated):</div>
                <div>Unsearched Brands: {derive(unsearchedBrands, (brands) => (brands && Array.isArray(brands)) ? brands.join(", ") || "None" : "None")}</div>
                <div>Searched (Found): {derive(searchedBrands, (brands) => (brands && Array.isArray(brands)) ? brands.join(", ") || "None" : "None")}</div>
                <div>Searched (Not Found): {derive(searchedNotFound, (records) =>
                  (records && Array.isArray(records)) ? records.map((r: BrandSearchRecord) => `${r.brand} (${new Date(r.searchedAt).toLocaleDateString()})`).join(", ") || "None" : "None"
                )}</div>

                <div style="fontWeight: 600; marginTop: 12px; marginBottom: 4px;">Agent State:</div>
                <div>Agent Pending: {derive(agentPending, (p) => p ? "Yes ⏳" : "No ✓")}</div>
                <div>Agent Has Result: {derive(agentResult, (r) => r ? "Yes ✓" : "No")}</div>
                <div>Agent Memberships Found: {derive(agentResult, (r) => r?.memberships?.length || 0)}</div>
                <div>Agent Queries Attempted: {derive(agentResult, (r) => r?.queriesAttempted?.length || 0)}</div>
                <div>Scanning: {derive(isScanning, (s) => s ? "Yes ⏳" : "No")}</div>

                <div style="fontWeight: 600; marginTop: 12px; marginBottom: 4px;">Auth State (wish-based):</div>
                <div>Has Wished Auth: {derive(hasWishedAuth, (h) => h ? "Yes ✓" : "No")}</div>
                <div>Is Authenticated: {derive(isAuthenticated, (a) => a ? "Yes ✓" : "No")}</div>
                <div>Auth User: {derive(auth, (a) => a?.user?.email || "none")}</div>
                <div>Wish Error: {derive(wishError, (e) => e || "none")}</div>
              </ct-vstack>
            </details>

            {/* Auth info in debug section now shows wish-based status */}
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});
