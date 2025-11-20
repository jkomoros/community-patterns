/// <cts-enable />
import { Cell, cell, Default, derive, generateObject, handler, NAME, pattern, UI } from "commontools";
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
}) => {
  // Gmail authentication
  const auth = GmailAuth({
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

  // Import emails (will be configured dynamically based on LLM query)
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery: currentQuery,
      limit: 50,
      historyId: "",
    },
    authCharm: auth,
  });

  const emails = importer.emails;

  // Cell to trigger query generation
  const queryGeneratorInput = cell<string>("");

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
      `${state}\n---TRIGGER-${trigger}---`
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

  // Group memberships by hotel brand
  const groupedMemberships = derive(memberships, (membershipList: MembershipRecord[]) => {
    const groups: Record<string, MembershipRecord[]> = {};

    for (const membership of membershipList) {
      if (!groups[membership.hotelBrand]) {
        groups[membership.hotelBrand] = [];
      }
      groups[membership.hotelBrand].push(membership);
    }

    return groups;
  });

  const totalMemberships = derive(memberships, (list) => list.length);

  // Handler to start scanning
  const startScan = handler<unknown, {
    isScanning: Cell<Default<boolean, false>>;
    queryGeneratorInput: Cell<string>;
  }>((_, state) => {
    state.isScanning.set(true);
    // Trigger query generation with timestamp to ensure it always changes
    state.queryGeneratorInput.set(`START-${Date.now()}`);
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
            {/* Scan Button */}
            <div>
              <ct-button
                onClick={startScan({ isScanning, queryGeneratorInput })}
                size="lg"
                disabled={isScanning}
              >
                {derive(isScanning, (scanning) =>
                  scanning ? "🔄 Scanning..." : "🔍 Scan for Memberships"
                )}
              </ct-button>
            </div>

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
                  return (
                    <details open style="border: 1px solid #e0e0e0; borderRadius: 8px; marginBottom: 12px; padding: 12px;">
                      <summary style="cursor: pointer; fontWeight: 600; fontSize: 14px; marginBottom: 8px;">
                        {brand} ({membershipList.length})
                      </summary>
                      <ct-vstack gap={2} style="paddingLeft: 16px;">
                        {membershipList.map((membership) => (
                          <div style="padding: 8px; background: #f8f9fa; borderRadius: 4px;">
                            <div style="fontWeight: 600; fontSize: 13px; marginBottom: 4px;">
                              {membership.programName}
                            </div>
                            <div style="marginBottom: 4px;">
                              <code style="fontSize: 14px; background: white; padding: 6px 12px; borderRadius: 4px; display: inline-block;">
                                {membership.membershipNumber}
                              </code>
                            </div>
                            {membership.tier && (
                              <div style="fontSize: 12px; color: #666; marginBottom: 2px;">
                                ⭐ {membership.tier}
                              </div>
                            )}
                            <div style="fontSize: 11px; color: #999;">
                              📧 {membership.sourceEmailSubject} • {new Date(membership.sourceEmailDate).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
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
                <div>Unsearched Brands: {derive(unsearchedBrands, (brands) => brands.join(", ") || "None")}</div>
                <div>Searched (Found): {derive(searchedBrands, (brands) => brands.join(", ") || "None")}</div>
                <div>Searched (Not Found): {derive(searchedNotFound, (records) =>
                  records.map(r => `${r.brand} (${new Date(r.searchedAt).toLocaleDateString()})`).join(", ") || "None"
                )}</div>
                <div>LLM Query: {derive(queryResult, (result) => result?.query || "None")}</div>
                <div>Selected Brand: {derive(queryResult, (result) => result?.selectedBrand || "None")}</div>
                <div>Query Pending: {derive(queryPending, (p) => p ? "Yes" : "No")}</div>
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
                  {auth}
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
