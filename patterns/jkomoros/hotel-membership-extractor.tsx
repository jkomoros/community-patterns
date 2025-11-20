/// <cts-enable />
import { Cell, computed, Default, derive, generateObject, handler, NAME, pattern, UI } from "commontools";
import GmailAuth from "./gmail-auth.tsx";
import GmailImporter from "./gmail-importer.tsx";

// Data structures
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

interface BrandSearchRecord {
  brand: string;                // Brand name (e.g., "Marriott")
  searchedAt: number;           // Timestamp when last searched
}

interface HotelMembershipInput {
  memberships: Default<MembershipRecord[], []>;
  scannedEmailIds: Default<string[], []>;
  lastScanAt: Default<number, 0>;
  searchedBrands: Default<string[], []>;
  searchedNotFound: Default<BrandSearchRecord[], []>;
  unsearchedBrands: Default<string[], ["Marriott"]>;
  currentQuery: Default<string, "">;
  isScanning: Default<boolean, false>;
  queryGeneratorInput: Default<string, "">;  // Trigger cell for LLM query generation
  gmailSettings: Default<{
    gmailFilterQuery: string;
    limit: number;
    historyId: string;
  }, {
    gmailFilterQuery: "";
    limit: 50;
    historyId: "";
  }>;
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
  searchedBrands,
  searchedNotFound,
  unsearchedBrands,
  currentQuery,
  isScanning,
  queryGeneratorInput,
  gmailSettings,
  auth,
}) => {
  // Gmail authentication charm - using auth cell from pattern input
  const authCharm = GmailAuth({
    auth: auth,
  });

  // Stage 1: LLM Query Generator
  const queryGeneratorPrompt = derive(
    [unsearchedBrands, searchedBrands, searchedNotFound],
    ([unsearched, searched, notFound]: [string[], string[], BrandSearchRecord[]]) => {
      return JSON.stringify({
        unsearchedBrands: unsearched,
        searchedBrands: searched,
        searchedNotFound: notFound,
      });
    }
  );

  const { result: queryResult, pending: queryPending } = generateObject({
    system: `Given the user's hotel membership search state, suggest the next Gmail search query.

Task: Pick ONE brand from unsearchedBrands and generate a Gmail query for it.

Note: searchedNotFound includes timestamps showing when we last searched.
These brands had no results before, but might have new emails since then.
Focus on unsearchedBrands first.

Suggest a Gmail query that:
- Searches emails from that specific hotel chain
- Uses from: filter with the hotel's domain (e.g., "from:marriott.com")
- Is focused and specific

If unsearchedBrands is empty, return query "done"

Return the selected brand name and the query string.`,
    prompt: derive([queryGeneratorPrompt, queryGeneratorInput], ([state, trigger]) =>
      trigger ? `${state}\n---TRIGGER-${trigger}---` : ""
    ),
    model: "anthropic:claude-sonnet-4-5",
    schema: {
      type: "object",
      properties: {
        selectedBrand: { type: "string" },
        query: { type: "string" },
      },
      required: ["selectedBrand", "query"],
    },
  });

  // Import emails - using gmailSettings cell from pattern input
  const importer = GmailImporter({
    settings: gmailSettings,
    authCharm: authCharm,
  });

  const emails = importer.emails;

  // AGENTIC: Auto-update Gmail query when LLM generates one
  // This computed block watches queryResult and updates gmailSettings
  computed(() => {
    if (!queryResult || !queryPending) return;

    const result = queryResult.get();
    const pending = queryPending.get();
    const scanning = isScanning.get();

    // Only update during scanning workflow
    if (!scanning) return;

    // When query generation completes, update Gmail settings
    if (!pending && result && result.query && result.query !== "done") {
      const settings = gmailSettings.get();
      if (settings.gmailFilterQuery !== result.query) {
        gmailSettings.set({
          ...settings,
          gmailFilterQuery: result.query,
        });
      }
    }
  });

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
  const resetScanningIfStale = handler<unknown, {
    isScanning: Cell<Default<boolean, false>>;
  }>((_, state) => {
    const shouldReset = shouldResetScanning.get();
    const scanning = state.isScanning.get();

    // Only reset if both conditions are true (defensive check)
    if (shouldReset && scanning) {
      state.isScanning.set(false);
    }
  });

  // AGENTIC: Single handler to start the scan workflow
  const startScan = handler<unknown, {
    queryGeneratorInput: Cell<string>;
    isScanning: Cell<Default<boolean, false>>;
    currentQuery: Cell<Default<string, "">>;
  }>((_, state) => {
    // Check if authenticated by looking at auth charm
    const authenticated = isAuthenticated.get();

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

  // AGENTIC: Automatically save extraction results when they arrive
  const autoSaveResults = handler<unknown, {
    memberships: Cell<Default<MembershipRecord[], []>>;
    searchedBrands: Cell<Default<string[], []>>;
    searchedNotFound: Cell<Default<BrandSearchRecord[], []>>;
    unsearchedBrands: Cell<Default<string[], ["Marriott"]>>;
    scannedEmailIds: Cell<Default<string[], []>>;
    lastScanAt: Cell<Default<number, 0>>;
    isScanning: Cell<Default<boolean, false>>;
  }>((_, state) => {
    // Get current extraction results
    const extracted = extractorResult.get();
    const selectedBrand = queryResult.get()?.selectedBrand;
    const emailsList = emails.get();

    const currentMemberships = state.memberships.get();
    const scanned = state.scannedEmailIds.get();
    const currentUnsearched = state.unsearchedBrands.get();
    const currentSearched = state.searchedBrands.get();
    const currentNotFound = state.searchedNotFound.get();

    if (!extracted || !selectedBrand) return;

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

    // Update brand tracking
    const newUnsearched = currentUnsearched.filter(b => b !== selectedBrand);
    state.unsearchedBrands.set(newUnsearched);

    if (newMemberships.length > 0) {
      // Found memberships - add to searchedBrands
      if (!currentSearched.includes(selectedBrand)) {
        state.searchedBrands.set([...currentSearched, selectedBrand]);
      }
    } else {
      // No memberships found - add to searchedNotFound with timestamp
      const alreadyNotFound = currentNotFound.find(r => r.brand === selectedBrand);
      if (!alreadyNotFound) {
        state.searchedNotFound.set([
          ...currentNotFound,
          { brand: selectedBrand, searchedAt: Date.now() },
        ]);
      }
    }

    // Update last scan timestamp
    state.lastScanAt.set(Date.now());

    // Clear scanning flag
    state.isScanning.set(false);
  });

  // Determine if we should show the "Save Results" button
  const hasNewResults = derive([extractorResult, extractorPending, isScanning], ([result, pending, scanning]) => {
    return scanning && !pending && result && result.memberships && result.memberships.length > 0;
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
              {/* Authentication warning */}
              {derive(isAuthenticated, (authenticated) =>
                !authenticated ? (
                  <div style="padding: 12px; background: #fef3c7; border: 1px solid #f59e0b; borderRadius: 8px; fontSize: 13px; textAlign: center;">
                    ⚠️ Please authenticate with Gmail in Settings below before scanning
                  </div>
                ) : null
              )}

              {/* Scan button - disabled if not authenticated or currently scanning */}
              <ct-button
                onClick={startScan({ queryGeneratorInput, isScanning, currentQuery })}
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
                    onClick={resetScanningIfStale({ isScanning })}
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

              {/* Save Results Button (appears when extraction completes) */}
              {derive(hasNewResults, (show) =>
                show ? (
                  <ct-button
                    onClick={autoSaveResults({
                      memberships,
                      searchedBrands,
                      searchedNotFound,
                      unsearchedBrands,
                      scannedEmailIds,
                      lastScanAt,
                      isScanning,
                    })}
                    size="lg"
                    style="background: #10b981; color: white;"
                  >
                    💾 Save Extracted Memberships
                  </ct-button>
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
                <div>Unsearched Brands: {derive(unsearchedBrands, (brands) => (brands && Array.isArray(brands)) ? brands.join(", ") || "None" : "None")}</div>
                <div>Searched (Found): {derive(searchedBrands, (brands) => (brands && Array.isArray(brands)) ? brands.join(", ") || "None" : "None")}</div>
                <div>Searched (Not Found): {derive(searchedNotFound, (records) =>
                  (records && Array.isArray(records)) ? records.map(r => `${r.brand} (${new Date(r.searchedAt).toLocaleDateString()})`).join(", ") || "None" : "None"
                )}</div>
                <div>LLM Query: {derive(queryResult, (result) => result?.query || "None")}</div>
                <div>Selected Brand: {derive(queryResult, (result) => result?.selectedBrand || "None")}</div>
                <div>Query Pending: {derive(queryPending, (p) => p ? "Yes" : "No")}</div>
                <div>Extractor Pending: {derive(extractorPending, (p) => p ? "Yes" : "No")}</div>
                <div>Extracted Count: {derive(extractorResult, (result) => result?.memberships?.length || 0)}</div>
                <div>Emails Count: {derive(emails, (list) => (list && Array.isArray(list)) ? list.length : 0)}</div>
                <div>Current Query: {currentQuery || "None"}</div>
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
