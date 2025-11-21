/// <cts-enable />
import { Cell, cell, computed, Default, derive, generateObject, handler, NAME, pattern, patternTool, UI } from "commontools";
import GmailAuth from "./gmail-auth.tsx";
import GmailImporter from "./gmail-importer.tsx";

// Import Email type for SearchGmailTool
import type { Email } from "./gmail-importer.tsx";

// ============================================================================
// AGENT TOOL: searchGmail
// ============================================================================

/**
 * Email preview with body content as @links
 * Agent sees metadata directly but must read() to get body content
 */
type EmailPreview = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  to: string;
  snippet: string;
  // Body fields as `any` - framework converts to @links
  markdownContent: any;
  htmlContent: any;
  plainText: any;
};

/**
 * SearchGmail Tool - Dynamic Gmail queries with server-side search
 *
 * ATTEMPT: Using handler approach to allow side effects (updating query cell)
 *
 * Agent sees:
 * - Email metadata (subject, from, date) directly - for filtering
 * - Body content as @link references - use read() to access
 *
 * Architecture:
 * - Tool updates shared queryCell → triggers GmailImporter to fetch
 * - Tool reads and returns emails from shared emailsCell
 * - Returns emails with body as @links
 *
 * Input:
 * - query: DYNAMIC from agent (Gmail query string)
 * - queryCell: STATIC shared cell to update
 * - emailsCell: STATIC cell to read results from
 *
 * Output: EmailPreview[] (with body as @links)
 */
export const SearchGmailTool = handler<
  { query: string },
  {
    queryCell: Cell<string>;
    emailsCell: Cell<Email[]>;
  }
>((input, state) => {
  console.log(`[SearchGmailTool] Agent requested query: "${input.query}"`);

  // 1. Update shared query cell → triggers GmailImporter to fetch
  state.queryCell.set(input.query);
  console.log(`[SearchGmailTool] Updated queryCell to: "${input.query}"`);

  // 2. Read current emails from shared cell
  const emails = state.emailsCell.get();

  console.log(`[SearchGmailTool] Current emails in cell: ${emails?.length || 0}`);

  if (!emails || !Array.isArray(emails)) {
    console.log("[SearchGmailTool] No emails available yet");
    return [];
  }

  // 3. Transform: metadata visible, body as @links
  return emails.map(email => ({
    // Metadata visible to agent
    id: email.id,
    threadId: email.threadId,
    subject: email.subject,
    from: email.from,
    date: email.date,
    to: email.to,
    snippet: email.snippet,
    // Body content as cells (type any) → framework converts to @links
    markdownContent: Cell.of(email.markdownContent) as any,
    htmlContent: Cell.of(email.htmlContent) as any,
    plainText: Cell.of(email.plainText) as any,
  }));
});

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
  auth: Default<{
    token: string;
    tokenType: string;
    scope: string[];
    expiresIn: number;
    expiresAt: number;
    refreshToken: string;
    user: { email: string; name: string; picture: string };
  }, {
    token: "";
    tokenType: "";
    scope: [];
    expiresIn: 0;
    expiresAt: 0;
    refreshToken: "";
    user: { email: ""; name: ""; picture: "" };
  }>;
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
  auth,
}) => {
  // Gmail authentication charm - using auth cell from pattern input
  const authCharm = GmailAuth({
    auth: auth,
  });

  // ============================================================================
  // AGENT: Hotel Membership Extractor with Tool Calling
  // ============================================================================

  // Shared query cell for agent - tool updates this to trigger Gmail fetch
  const agentQueryCell = cell<string>("");

  // Separate GmailImporter instance just for the agent (independent of old 2-stage LLM)
  // Uses reactive query cell - updates trigger fetches
  const agentGmailImporter = GmailImporter({
    settings: {
      gmailFilterQuery: agentQueryCell,  // Reactive - updates trigger fetch
      limit: Cell.of(20),                // Fetch up to 20 emails per query
      historyId: Cell.of(""),            // No history tracking
    },
    authCharm: authCharm,
  });

  // Bind SearchGmailTool handler with shared cells
  const boundSearchGmail = SearchGmailTool({
    queryCell: agentQueryCell,              // STATIC: Shared cell to update
    emailsCell: agentGmailImporter.emails,  // STATIC: Cell to read results from
  });

  // Define agent tools
  const agentTools = {
    searchGmail: boundSearchGmail,
  };

  const agentPrompt = derive(
    [brandHistory, memberships, isScanning],
    ([history, found, scanning]: [BrandSearchHistory[], MembershipRecord[], boolean]) => {
      if (!scanning) return "";  // Don't run unless actively scanning

      const foundBrands = history.filter((h: BrandSearchHistory) => h.status === "found").map((h: BrandSearchHistory) => h.brand);
      const searchingBrands = history.filter((h: BrandSearchHistory) => h.status === "searching").map((h: BrandSearchHistory) => h.brand);
      const exhaustedBrands = history.filter((h: BrandSearchHistory) => h.status === "exhausted").map((h: BrandSearchHistory) => h.brand);

      // Show recent query attempts for context
      const recentAttempts = history
        .flatMap((h: BrandSearchHistory) => h.attempts.map((a: QueryAttempt) => `${h.brand}: "${a.query}" → ${a.emailsFound} emails, ${a.membershipsFound} memberships`))
        .slice(-5);  // Last 5 attempts

      return `Find hotel loyalty program membership numbers in my Gmail account.

Current progress:
- Memberships found: ${found.length}
- Brands found: ${foundBrands.join(", ") || "none yet"}
- Brands searching: ${searchingBrands.join(", ") || "none"}
- Brands exhausted: ${exhaustedBrands.join(", ") || "none"}

Recent attempts:
${recentAttempts.length > 0 ? recentAttempts.join("\n") : "No attempts yet"}

Search for memberships from these hotel brands: Marriott, Hilton, Hyatt, IHG, Accor

Strategy:
1. Use searchGmail to find emails from hotel brands
2. Analyze email subjects/previews (you'll see @link references)
3. Use the read tool to read promising emails
4. Extract membership numbers from email content
5. If query returns promotional emails, refine with subject filters
6. Try 3-5 different queries per brand before moving to next brand

When done, call finalResult with all memberships you found.`;
    }
  );

  const agent = generateObject({
    system: `You are a hotel loyalty program membership extractor.

Your goal: Find membership numbers from hotel loyalty programs in the user's Gmail.

Available tools:
- searchGmail(query): Search Gmail, returns email @link references (NOT full content)
- read(@link): Read full content of a specific email (built-in tool)

How @links work:
- searchGmail returns: [{"@link": "/of:abc/email/0"}, {"@link": "/of:abc/email/1"}, ...]
- You see metadata but NOT full content
- Use read tool to get full content: read({"@link": "/of:abc/email/0"})

Search strategy:
1. Start broad: "from:marriott.com"
2. Analyze subjects in @link references
3. Read promising emails (account/confirmation/welcome, not promotional)
4. If mostly promotional: refine with "subject:(membership OR account OR number)"
5. Try 3-5 queries per brand
6. Extract membership numbers, program names, tiers

Membership data to extract:
- hotelBrand: "Marriott", "Hilton", etc.
- programName: "Marriott Bonvoy", "Hilton Honors", etc.
- membershipNumber: The actual number (typically 9-12 digits)
- tier: "Gold", "Platinum", etc. (if mentioned)
- sourceEmailId: Email ID where found
- sourceEmailSubject: Email subject
- sourceEmailDate: Email date
- confidence: 0-100 (how confident you are this is valid)

When done searching all brands, call finalResult with memberships array.`,

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

  // Wrap agentResult in a derived cell so we can pass it to handlers
  // agentResult is already a reactive value, so we just need to make it accessible
  const agentResultCell = derive([agentResult], ([result]) => result);

  // Handler to save agent results and stop scanning
  const saveAgentResults = handler<unknown, {
    memberships: Cell<Default<MembershipRecord[], []>>;
    scannedEmailIds: Cell<Default<string[], []>>;
    lastScanAt: Cell<Default<number, 0>>;
    brandHistory: Cell<Default<BrandSearchHistory[], []>>;
    isScanning: Cell<Default<boolean, false>>;
    agentResult: Cell<any>;
  }>((_, state) => {
    const result = state.agentResult.get();
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

  // ============================================================================
  // OLD 2-STAGE LLM (kept for backward compatibility during transition)
  // ============================================================================

  // Stage 1: LLM Query Generator
  const queryGeneratorPrompt = derive(
    brandHistory,
    (history: BrandSearchHistory[]) => {
      return JSON.stringify({
        brandHistory: history,
        // Include full query history for LLM to learn from
      });
    }
  );

  const { result: queryResult, pending: queryPending } = generateObject({
    system: `Given the brand search history, suggest the next Gmail query to try.

IMPORTANT: You can see the complete history of all query attempts for each brand.
For each brand, you can see:
- All queries tried (in the "attempts" array)
- How many emails each query found (emailsFound)
- How many memberships were extracted from those emails (membershipsFound)
- Current status: "searching" (needs more attempts), "found" (success), or "exhausted" (tried enough, gave up)

Your task:
1. Look for brands with status "searching" (not yet found membership, not exhausted)
2. If found, analyze their previous attempts:
   - What queries were tried?
   - Did they find emails but no memberships? (query too broad, got promotional emails)
   - Did they find no emails? (query too narrow or wrong domain)
3. Refine the query to be more specific based on what you learned
4. Maximum 5 attempts per brand - if a brand has 5+ attempts with no memberships, mark status as "exhausted"
5. Learn from successful patterns in other brands (brands with status "found")

Example progression for Marriott:
- Attempt 1: "from:marriott.com" → 40 emails, 0 memberships (too broad, got promotional)
- Attempt 2: "from:marriott.com subject:(account OR membership OR confirmation)" → 5 emails, 1 membership ✅

Query strategies:
- Start broad: "from:brand.com"
- If emails but no memberships: Add subject filters like "subject:(membership OR account OR number OR confirmation OR welcome)"
- If no emails: Try alternate domains or sender names
- Learn from what worked for other brands

Return:
- selectedBrand: The brand to search next (continue "searching" brand, or start new one)
- query: The Gmail query string
- reasoning: Why you chose this query (for debugging)

If all brands are either "found" or "exhausted", return query "done"`,
    prompt: derive([queryGeneratorPrompt, queryGeneratorInput], ([state, trigger]) =>
      trigger ? `${state}\n---TRIGGER-${trigger}---` : ""
    ),
    model: "anthropic:claude-sonnet-4-5",
    schema: {
      type: "object",
      properties: {
        selectedBrand: { type: "string" },
        query: { type: "string" },
        reasoning: { type: "string" },
      },
      required: ["selectedBrand", "query"],
    },
  });

  // AGENTIC: Auto-query - derived cell that automatically uses LLM query when available
  // This solves the computed() reactivity issue by using derive() instead
  // derive() handles undefined cells gracefully and is a pure computation
  const autoQuery = derive(
    [queryResult, queryPending, isScanning, gmailFilterQuery],
    ([result, pending, scanning, manualQuery]) => {
      console.log("[Auto-query] Derived cell triggered:", {
        scanning,
        pending,
        hasResult: !!result,
        query: result?.query,
        manualQuery
      });

      // During scanning workflow, use LLM-generated query when ready
      if (scanning && !pending && result && result.query && result.query !== "done") {
        console.log(`[Auto-query] Using LLM query: "${result.query}"`);
        return result.query;
      }

      // Otherwise use manual query from input
      console.log(`[Auto-query] Using manual query: "${manualQuery}"`);
      return manualQuery;
    }
  );

  // Import emails - using autoQuery derived cell for automatic LLM integration
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery: autoQuery,  // Derived cell that auto-uses LLM query
      limit,                        // Individual cell value
      historyId: "",
    },
    authCharm: authCharm,
  });

  const emails = importer.emails;

  // Check if Gmail is authenticated by checking if auth cell has a valid token
  const isAuthenticated = derive([auth], ([authData]) => {
    return !!(authData && authData.token && authData.user && authData.user.email);
  });

  // AGENTIC: Automatically trigger extraction when emails arrive
  // Create a stable trigger based on email IDs so it only fires when emails actually change
  const autoExtractorTrigger = derive([emails, queryPending, isScanning], ([emailList, qPending, scanning]) => {
    // Defensive check for emailList
    if (!emailList || !Array.isArray(emailList)) {
      return "";
    }

    // Only trigger if we're in scanning mode, query is done, and we have emails
    if (scanning && !qPending && emailList.length > 0) {
      const emailIds = emailList.map((e: any) => e.id).sort().join(",");
      return `AUTO-${emailIds}`;
    }
    return "";
  });

  // Stage 2: LLM Membership Extractor
  const extractorPrompt = derive(
    [emails, memberships],
    ([emailList, existingMemberships]: [any[], MembershipRecord[]]) => {
      // Defensive checks for undefined/null
      const safeEmailList = (emailList && Array.isArray(emailList)) ? emailList : [];
      const safeExistingMemberships = (existingMemberships && Array.isArray(existingMemberships)) ? existingMemberships : [];

      // Extract just the membership numbers to avoid duplicates
      const existingNumbers = safeExistingMemberships.map(m => m.membershipNumber);

      return JSON.stringify({
        emails: safeEmailList.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          date: email.date,
          content: email.markdownContent || email.snippet,
        })),
        existingMembershipNumbers: existingNumbers,
      });
    }
  );

  const { result: extractorResult, pending: extractorPending } = generateObject({
    system: `Extract hotel loyalty program membership information from emails.

IMPORTANT: Only extract NEW memberships. Do not return memberships whose numbers are already in existingMembershipNumbers.

Look for:
- Hotel brand name (Marriott, Hilton, Hyatt, IHG, Accor, Wyndham, etc.)
- Program name (Marriott Bonvoy, Hilton Honors, etc.)
- Membership/account numbers (typically 9-12 digits)
- Tier/status levels (Gold, Platinum, Diamond, etc.)

For each membership found, provide:
- hotelBrand: Brand name (e.g., "Marriott")
- programName: Full program name (e.g., "Marriott Bonvoy")
- membershipNumber: The actual membership number
- tier: Member tier/status if mentioned (optional)
- sourceEmailId: The email ID where this was found
- sourceEmailSubject: The email subject
- sourceEmailDate: The email date
- confidence: Your confidence level (0-100) that this is a valid membership

Return empty array if no NEW memberships found.`,
    prompt: derive([extractorPrompt, autoExtractorTrigger], ([data, trigger]) =>
      trigger ? `${data}\n---TRIGGER-${trigger}---` : ""
    ),
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
      },
      required: ["memberships"],
    },
  });

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

  // Auto-reset isScanning if it's stale (e.g., after page refresh with no active workflow)
  // This prevents the button from being stuck in "Scanning..." state
  const shouldResetScanning = derive(
    [isScanning, queryPending, extractorPending],
    ([scanning, qPending, ePending]) => {
      // If scanning is true but no LLMs are pending, it's stale - should reset
      return scanning && !qPending && !ePending;
    }
  );

  // Handler to reset stale scanning state
  // Note: This button only shows when shouldResetScanning is true, so we can safely reset
  const resetScanningIfStale = handler((_, state: {
    isScanning: Cell<Default<boolean, false>>;
  }) => {
    // Reset scanning flag - button only shows when it's safe to reset
    state.isScanning.set(false);
  });

  // Bind the handler OUTSIDE any derive blocks to ensure isScanning remains writable
  const boundResetHandler = resetScanningIfStale({ isScanning });

  // AGENTIC: Single handler to start the scan workflow
  const startScan = handler<unknown, {
    queryGeneratorInput: Cell<string>;
    isScanning: Cell<Default<boolean, false>>;
    currentQuery: Cell<Default<string, "">>;
    auth: Cell<Default<{
      token: string;
      tokenType: string;
      scope: string[];
      expiresIn: number;
      expiresAt: number;
      refreshToken: string;
      user: { email: string; name: string; picture: string };
    }, {
      token: "";
      tokenType: "";
      scope: [];
      expiresIn: 0;
      expiresAt: 0;
      refreshToken: "";
      user: { email: ""; name: ""; picture: "" };
    }>>;
  }>((_, state) => {
    // Check if authenticated by looking at auth cell directly
    const authData = state.auth.get();
    const authenticated = !!(authData && authData.token && authData.user && authData.user.email);

    if (!authenticated) {
      // Don't start scan if not authenticated - just return silently
      // The button should be disabled anyway, but this is a safety check
      return;
    }

    // Set scanning flag
    state.isScanning.set(true);
    // Clear any old query
    state.currentQuery.set("");
    // Trigger query generation with timestamp to ensure it always changes
    state.queryGeneratorInput.set(`START-${Date.now()}`);
  });

  // Determine when to show the save button
  const shouldShowSaveButton = derive(
    [isScanning, extractorPending, extractorResult, queryResult],
    ([scanning, pending, extracted, queryData]) => {
      // Show save button when:
      // 1. We're in scanning mode
      // 2. Extraction is complete (not pending)
      // 3. We have extraction results
      // 4. We have query data
      return scanning && !pending && !!extracted && !!queryData && !!queryData.selectedBrand;
    }
  );

  // Handler to save extraction results
  const saveExtractionResults = handler<unknown, {
    memberships: Cell<Default<MembershipRecord[], []>>;
    scannedEmailIds: Cell<Default<string[], []>>;
    lastScanAt: Cell<Default<number, 0>>;
    brandHistory: Cell<Default<BrandSearchHistory[], []>>;
    searchedBrands: Cell<Default<string[], []>>;
    searchedNotFound: Cell<Default<BrandSearchRecord[], []>>;
    unsearchedBrands: Cell<Default<string[], []>>;
  }>((_, state) => {
    // Get current values from state cells
    const currentMemberships = state.memberships.get();
    const scanned = state.scannedEmailIds.get();
    const currentHistory = state.brandHistory.get();
    const currentUnsearched = state.unsearchedBrands.get();
    const currentSearched = state.searchedBrands.get();
    const currentNotFound = state.searchedNotFound.get();

    // Get extraction results (these are plain values, not cells)
    const extracted = extractorResult;
    const queryResultData = queryResult;
    const emailsList = emails.get();

    if (!extracted || !queryResultData || !emailsList) return;

    const selectedBrand = queryResultData.selectedBrand;
    const usedQuery = queryResultData.query;

    if (!selectedBrand || !usedQuery) return;

    const extractedMemberships = extracted.memberships || [];

    // Add new memberships with unique IDs and extractedAt timestamp
    const newMemberships = extractedMemberships.map((m: any) => ({
      ...m,
      id: `${m.hotelBrand}-${m.membershipNumber}-${Date.now()}`,
      extractedAt: Date.now(),
    }));

    // Update memberships array
    state.memberships.set([...currentMemberships, ...newMemberships]);

    // Update scanned email IDs
    const emailIds = emailsList.map((e: any) => e.id);
    state.scannedEmailIds.set([...new Set([...scanned, ...emailIds])]);

    // === Update brandHistory with this query attempt ===

    // Convert email IDs to object set for efficient lookups
    const emailIdsSet: { [id: string]: true } = {};
    emailIds.forEach((id: string) => {
      emailIdsSet[id] = true;
    });

    // Create query attempt record
    const attempt: QueryAttempt = {
      query: usedQuery,
      attemptedAt: Date.now(),
      emailsFound: emailsList.length,
      membershipsFound: newMemberships.length,
      emailIds: emailIdsSet,
    };

    // Find or create brand history entry
    let brandEntry = currentHistory.find(h => h.brand === selectedBrand);
    let updatedHistory: BrandSearchHistory[];

    if (brandEntry) {
      // Update existing brand entry
      const newAttempts = [...brandEntry.attempts, attempt];

      // Determine new status
      let newStatus: "searching" | "found" | "exhausted" = brandEntry.status;
      if (newMemberships.length > 0) {
        // Found memberships!
        newStatus = "found";
      } else if (newAttempts.length >= 5) {
        // 5+ attempts with no success - mark as exhausted
        newStatus = "exhausted";
      } else {
        // Keep searching
        newStatus = "searching";
      }

      // Update the brand entry
      updatedHistory = currentHistory.map(h =>
        h.brand === selectedBrand
          ? { ...h, attempts: newAttempts, status: newStatus }
          : h
      );
    } else {
      // Create new brand entry
      const newStatus: "searching" | "found" | "exhausted" =
        newMemberships.length > 0 ? "found" : "searching";

      updatedHistory = [
        ...currentHistory,
        {
          brand: selectedBrand,
          attempts: [attempt],
          status: newStatus,
        },
      ];
    }

    state.brandHistory.set(updatedHistory);

    // === Keep old tracking for backward compatibility (will remove later) ===
    const newUnsearched = currentUnsearched.filter(b => b !== selectedBrand);
    state.unsearchedBrands.set(newUnsearched);

    if (newMemberships.length > 0) {
      // Found memberships - add to searchedBrands
      if (!currentSearched.includes(selectedBrand)) {
        state.searchedBrands.set([...currentSearched, selectedBrand]);
      }
    } else {
      // No memberships found - add to searchedNotFound with timestamp
      const alreadyNotFound = currentNotFound.find((r: BrandSearchRecord) => r.brand === selectedBrand);
      if (!alreadyNotFound) {
        state.searchedNotFound.set([
          ...currentNotFound,
          { brand: selectedBrand, searchedAt: Date.now() },
        ]);
      }
    }

    // Update last scan timestamp
    state.lastScanAt.set(Date.now());
  });

  // Progress status message
  const scanStatus = derive(
    [isScanning, queryPending, emails, extractorPending],
    ([scanning, qPending, emailList, ePending]) => {
      if (!scanning) return "";
      if (qPending) return "🔄 Generating Gmail search query...";
      // Defensive check for emailList
      const emailCount = (emailList && Array.isArray(emailList)) ? emailList.length : 0;
      if (emailCount === 0) return "📧 Fetching emails from Gmail...";
      if (ePending) return "✨ Extracting membership numbers from emails...";
      return "✅ Extraction complete!";
    }
  );

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
              {/* PROMINENT Authentication warning when not authenticated */}
              {derive(isAuthenticated, (authenticated) =>
                !authenticated ? (
                  <div style="padding: 24px; background: #fee2e2; border: 3px solid #dc2626; borderRadius: 12px; marginBottom: 8px;">
                    <div style="fontSize: 20px; fontWeight: 700; color: #991b1b; textAlign: center; marginBottom: 16px;">
                      🔒 Gmail Authentication Required
                    </div>
                    <div style="fontSize: 14px; color: #7f1d1d; textAlign: center; marginBottom: 16px; lineHeight: 1.5;">
                      This tool scans your Gmail for hotel membership numbers.<br/>
                      <strong>You must authenticate with Gmail before you can scan.</strong>
                    </div>
                    <div style="padding: 16px; background: white; borderRadius: 8px; border: 1px solid #fca5a5;">
                      {authCharm}
                    </div>
                  </div>
                ) : null
              )}

              {/* Scan button - disabled if not authenticated or currently scanning */}
              <ct-button
                onClick={startScan({ queryGeneratorInput, isScanning, currentQuery, auth })}
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

              {/* Reset button for stuck state (only shows if scanning but no LLMs active) */}
              {derive(shouldResetScanning, (shouldReset) =>
                shouldReset ? (
                  <ct-button
                    onClick={boundResetHandler}
                    size="sm"
                    style="background: #ef4444; color: white;"
                  >
                    🔄 Reset Stuck Scan
                  </ct-button>
                ) : null
              )}

              {/* Progress Status */}
              {derive(scanStatus, (status) =>
                status ? (
                  <div style="padding: 12px; background: #f0f9ff; border: 1px solid #0ea5e9; borderRadius: 8px; fontSize: 13px; textAlign: center;">
                    {status}
                  </div>
                ) : null
              )}

              {/* Agent progress status */}
              {derive([isScanning, agentPending], ([scanning, pending]) =>
                scanning && pending ? (
                  <div style="padding: 12px; background: #fef3c7; border: 1px solid #f59e0b; borderRadius: 8px; fontSize: 13px; textAlign: center;">
                    🤖 Agent is searching Gmail and extracting memberships...
                  </div>
                ) : null
              )}

              {/* PROMINENT Agent Save Results Button - appears when agent completes */}
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
                    <ct-button
                      onClick={saveAgentResults({
                        memberships,
                        scannedEmailIds,
                        lastScanAt,
                        brandHistory,
                        isScanning,
                        agentResult: agentResultCell,
                      })}
                      size="lg"
                      style="background: #10b981; color: white; fontWeight: 700; width: 100%;"
                    >
                      💾 Save Results & Complete
                    </ct-button>
                    <div style="fontSize: 11px; color: #059669; marginTop: 8px; textAlign: center; fontStyle: italic;">
                      Click to save memberships and stop scanning
                    </div>
                  </div>
                ) : null
              )}

              {/* PROMINENT Save Results Button - appears when extraction completes (OLD 2-STAGE LLM) */}
              {derive(shouldShowSaveButton, (show) =>
                show ? (
                  <div style="padding: 16px; background: #d1fae5; border: 3px solid #10b981; borderRadius: 12px;">
                    <div style="fontSize: 14px; fontWeight: 600; color: #065f46; marginBottom: 12px; textAlign: center;">
                      ✅ Extraction Complete!
                    </div>
                    <div style="fontSize: 13px; color: #047857; marginBottom: 12px; textAlign: center;">
                      {derive(extractorResult, (result) => {
                        const count = result?.memberships?.length || 0;
                        const brand = queryResult?.selectedBrand || "Unknown";
                        if (count > 0) {
                          return `Found ${count} membership${count !== 1 ? 's' : ''} for ${brand}`;
                        }
                        return `No new memberships found for ${brand} (query will be refined)`;
                      })}
                    </div>
                    <ct-button
                      onClick={saveExtractionResults({
                        memberships,
                        scannedEmailIds,
                        lastScanAt,
                        brandHistory,
                        searchedBrands,
                        searchedNotFound,
                        unsearchedBrands,
                      })}
                      size="lg"
                      style="background: #10b981; color: white; fontWeight: 700; width: 100%;"
                    >
                      💾 Save Results & Continue
                    </ct-button>
                    <div style="fontSize: 11px; color: #059669; marginTop: 8px; textAlign: center; fontStyle: italic;">
                      Click to save and enable next query iteration
                    </div>
                  </div>
                ) : null
              )}
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

                <div style="fontWeight: 600; marginTop: 12px; marginBottom: 4px;">Agent State (NEW):</div>
                <div>Agent Pending: {derive(agentPending, (p) => p ? "Yes ⏳" : "No ✓")}</div>
                <div>Agent Has Result: {derive(agentResult, (r) => r ? "Yes ✓" : "No")}</div>
                <div>Agent Memberships Found: {derive(agentResult, (r) => r?.memberships?.length || 0)}</div>
                <div>Agent Queries Attempted: {derive(agentResult, (r) => r?.queriesAttempted?.length || 0)}</div>

                <div style="fontWeight: 600; marginTop: 12px; marginBottom: 4px;">Old 2-Stage LLM State (DEPRECATED):</div>
                <div>LLM Query: {derive(queryResult, (result) => result?.query || "None")}</div>
                <div>Selected Brand: {derive(queryResult, (result) => result?.selectedBrand || "None")}</div>
                <div>LLM Reasoning: {derive(queryResult, (result) => result?.reasoning || "None")}</div>
                <div>Query Pending: {derive(queryPending, (p) => p ? "Yes" : "No")}</div>
                <div>Extractor Pending: {derive(extractorPending, (p) => p ? "Yes" : "No")}</div>
                <div>Extracted Count: {derive(extractorResult, (result) => result?.memberships?.length || 0)}</div>
                <div>Emails Count: {derive(emails, (list) => (list && Array.isArray(list)) ? list.length : 0)}</div>

                <div style="fontWeight: 600; marginTop: 12px; marginBottom: 4px;">Query Values:</div>
                <div>Current Query (deprecated): {currentQuery || "None"}</div>
                <div>Gmail Filter Query (actual): {gmailFilterQuery || "None"}</div>
              </ct-vstack>
            </details>

            {/* Extraction Debug - Shows detailed email content for debugging */}
            <details style="marginTop: 8px;">
              <summary style="cursor: pointer; padding: 8px; background: #fff7ed; border: 1px solid #fb923c; borderRadius: 4px; fontSize: 12px; fontWeight: 600;">
                🐛 Extraction Debug (Why no memberships?)
              </summary>
              <ct-vstack gap={3} style="padding: 12px; fontSize: 11px;">
                {/* Show fetched emails */}
                {derive(emails, (emailList) => {
                  if (!emailList || !Array.isArray(emailList) || emailList.length === 0) {
                    return (
                      <div style="padding: 12px; background: #fee2e2; borderRadius: 4px; color: #991b1b;">
                        ❌ No emails fetched. Make sure to click "Fetch Emails" in Gmail Settings after the query generates.
                      </div>
                    );
                  }

                  return (
                    <div>
                      <div style="fontWeight: 600; marginBottom: 8px;">Fetched {emailList.length} email(s):</div>
                      {emailList.slice(0, 5).map((email: any, index: number) => (
                        <details style="marginBottom: 8px; padding: 8px; background: #f9fafb; borderRadius: 4px; border: 1px solid #e5e7eb;">
                          <summary style="cursor: pointer; fontWeight: 500;">
                            Email {index + 1}: {email.subject || "(No Subject)"}
                          </summary>
                          <div style="padding: 8px; fontFamily: monospace; fontSize: 10px; marginTop: 8px;">
                            <div><strong>From:</strong> {email.from}</div>
                            <div><strong>Date:</strong> {email.date}</div>
                            <div><strong>Has markdownContent:</strong> {email.markdownContent ? `Yes (${email.markdownContent.length} chars)` : "No"}</div>
                            <div><strong>Has snippet:</strong> {email.snippet ? `Yes (${email.snippet.length} chars)` : "No"}</div>
                            <div><strong>Content preview (first 500 chars):</strong></div>
                            <pre style="whiteSpace: pre-wrap; background: white; padding: 8px; borderRadius: 4px; maxHeight: 200px; overflowY: auto; fontSize: 9px;">
                              {(email.markdownContent || email.snippet || "NO CONTENT").substring(0, 500)}...
                            </pre>
                          </div>
                        </details>
                      ))}
                      {emailList.length > 5 && (
                        <div style="color: #666; fontStyle: italic;">
                          ...and {emailList.length - 5} more emails (showing first 5)
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Show LLM extraction result */}
                <div style="marginTop: 16px;">
                  <div style="fontWeight: 600; marginBottom: 8px;">LLM Extraction Result:</div>
                  {derive(extractorResult, (result) => {
                    if (!result) {
                      return (
                        <div style="padding: 8px; background: #fef3c7; borderRadius: 4px; color: #92400e;">
                          ⏳ Extraction hasn't run yet (or is pending)
                        </div>
                      );
                    }

                    const memberships = result.memberships || [];
                    if (memberships.length === 0) {
                      return (
                        <div style="padding: 8px; background: #fee2e2; borderRadius: 4px; color: #991b1b;">
                          ❌ LLM returned 0 memberships. Possible issues:
                          <ul style="marginTop: 4px; marginBottom: 0; paddingLeft: 20px;">
                            <li>Email content doesn't contain membership numbers</li>
                            <li>Membership numbers are in images (can't extract)</li>
                            <li>LLM didn't recognize the format</li>
                            <li>Check email content above to see what LLM received</li>
                          </ul>
                        </div>
                      );
                    }

                    return (
                      <div style="padding: 8px; background: #d1fae5; borderRadius: 4px; color: #065f46;">
                        ✅ LLM found {memberships.length} membership(s)!
                        <pre style="marginTop: 8px; background: white; padding: 8px; borderRadius: 4px; fontSize: 9px; overflowX: auto;">
                          {JSON.stringify(memberships, null, 2)}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </ct-vstack>
            </details>

            {/* Settings */}
            <details style="marginTop: 8px;">
              <summary style="cursor: pointer; padding: 8px; background: #f8f9fa; border: 1px solid #e0e0e0; borderRadius: 4px; fontSize: 13px;">
                ⚙️ Gmail Settings
              </summary>
              <ct-vstack gap={3} style="padding: 12px; marginTop: 8px;">
                <div>
                  {authCharm}
                </div>
                <div>
                  {importer}
                </div>
              </ct-vstack>
            </details>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});
