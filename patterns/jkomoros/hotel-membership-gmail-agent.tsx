/// <cts-enable />
/**
 * Hotel Membership Extractor (v2)
 *
 * Refactored to use the gmail-agentic-search base pattern.
 * Finds hotel loyalty program membership numbers in Gmail.
 *
 * Usage: wish("#hotelMemberships") to get discovered memberships.
 */
import {
  Cell,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";
import GmailAgenticSearch, { type Auth, type SearchProgress } from "./gmail-agentic-search.tsx";

// ============================================================================
// EFFECTIVE QUERY HINTS
// ============================================================================
const EFFECTIVE_QUERIES = [
  'from:hilton.com subject:"welcome" OR subject:"hilton honors"',
  'from:marriott.com subject:"welcome" OR subject:"bonvoy"',
  'from:hyatt.com subject:"welcome to world of hyatt"',
  'from:ihg.com subject:"welcome" OR subject:"ihg rewards"',
  'from:accor.com subject:"welcome" OR subject:"accor"',
  'from:hilton.com subject:"statement"',
  'from:marriott.com subject:"statement"',
  'from:hilton.com OR from:hiltonhonors.com',
  'from:marriott.com OR from:email.marriott.com',
  'from:hyatt.com OR from:worldofhyatt.com',
  'from:ihg.com OR from:ihgrewardsclub.com',
  'from:accor.com OR from:accorhotels.com',
];

// ============================================================================
// DATA STRUCTURES
// ============================================================================
interface MembershipRecord {
  id: string;
  hotelBrand: string;
  programName: string;
  membershipNumber: string;
  tier?: string;
  sourceEmailId: string;
  sourceEmailDate: string;
  sourceEmailSubject: string;
  extractedAt: number;
  confidence?: number;
}

interface HotelMembershipInput {
  memberships?: Default<MembershipRecord[], []>;
  lastScanAt?: Default<number, 0>;
  isScanning?: Default<boolean, false>;
  maxSearches?: Default<number, 5>;
}

interface HotelMembershipOutput {
  memberships: MembershipRecord[];
  lastScanAt: number;
  count: number;
}

// ============================================================================
// HOTEL RESULT SCHEMA
// ============================================================================
const HOTEL_RESULT_SCHEMA = {
  type: "object",
  properties: {
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
    membershipsFound: {
      type: "number",
      description: "Total count of memberships found via reportMembership",
    },
    summary: {
      type: "string",
      description: "Brief summary of what was searched and found",
    },
  },
  required: ["membershipsFound", "summary"],
};

// ============================================================================
// PATTERN
// ============================================================================

const HotelMembershipExtractorV2 = pattern<HotelMembershipInput, HotelMembershipOutput>(
  ({ memberships, lastScanAt, isScanning, maxSearches }) => {
    // ========================================================================
    // CUSTOM TOOL: Report Membership
    // ========================================================================
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

      // Deduplication
      const key = `${input.hotelBrand.toLowerCase()}:${input.membershipNumber}`;
      const existingKeys = new Set(
        currentMemberships.map(
          (m) => `${m.hotelBrand.toLowerCase()}:${m.membershipNumber}`,
        ),
      );

      let resultMessage: string;

      if (existingKeys.has(key)) {
        console.log(
          `[ReportMembership] Duplicate skipped: ${input.hotelBrand} ${input.membershipNumber}`,
        );
        resultMessage = `Duplicate: ${input.hotelBrand} ${input.membershipNumber} already saved`;
      } else {
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
        console.log(
          `[ReportMembership] SAVED: ${input.hotelBrand} ${input.membershipNumber}`,
        );
        resultMessage = `Saved: ${input.hotelBrand} ${input.membershipNumber}`;
      }

      if (input.result) {
        input.result.set({ success: true, message: resultMessage });
      }

      return { success: true, message: resultMessage };
    });

    // ========================================================================
    // DYNAMIC AGENT GOAL
    // ========================================================================
    const agentGoal = derive(
      [memberships, maxSearches],
      ([found, max]: [MembershipRecord[], number]) => {
        const foundBrands = [...new Set(found.map((m) => m.hotelBrand))];
        const isQuickMode = max > 0;

        return `Find hotel loyalty program membership numbers in my Gmail.

Already saved memberships for: ${foundBrands.join(", ") || "none yet"}
Total memberships saved: ${found.length}
${isQuickMode ? `\n⚠️ QUICK TEST MODE: Limited to ${max} searches. Focus on high-value queries!\n` : ""}

Your task:
1. Use searchGmail to search for hotel loyalty emails
2. Analyze the returned emails for membership numbers
3. When you find a membership: IMMEDIATELY call reportMembership to save it
4. Continue searching other brands

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

When done searching, return a summary of what you searched and found.`;
      },
    );

    // ========================================================================
    // CREATE BASE SEARCHER
    // ========================================================================
    const searcher = GmailAgenticSearch({
      agentGoal,
      systemPrompt: `You are a hotel loyalty membership extractor.
Your job: Search Gmail to find hotel loyalty program membership numbers.

You have TWO tools:
1. searchGmail({ query: string }) - Search Gmail and return matching emails
2. reportMembership({ hotelBrand, programName, membershipNumber, tier?, sourceEmailId, sourceEmailSubject, sourceEmailDate, confidence }) - SAVE a found membership

IMPORTANT WORKFLOW:
1. Search for emails from a hotel brand
2. Read the email bodies for membership numbers
3. When you find a membership: IMMEDIATELY call reportMembership
4. Continue searching other brands
5. When done with all brands, return a summary

Do NOT wait until the end to report memberships. Report each one as you find it.`,
      suggestedQueries: EFFECTIVE_QUERIES,
      resultSchema: HOTEL_RESULT_SCHEMA,
      additionalTools: {
        reportMembership: {
          description:
            "Report a found membership number. Call this IMMEDIATELY when you find a valid membership number. It will be saved automatically.",
          handler: reportMembershipHandler({ memberships }),
        },
      },
      title: "🏨 Hotel Membership Extractor",
      scanButtonLabel: "🔍 Scan for Memberships",
      maxSearches,
      isScanning,
      lastScanAt,
    });

    // ========================================================================
    // DERIVED VALUES
    // ========================================================================
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

    // ========================================================================
    // UI - Compose base searcher with custom membership display
    // ========================================================================

    return {
      [NAME]: "🏨 Hotel Membership Extractor",

      // Output: Export memberships for wish("#hotelMemberships")
      memberships,
      lastScanAt,
      count: totalMemberships,

      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2 style={{ margin: "0", fontSize: "18px" }}>Hotel Memberships</h2>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack style="padding: 16px; gap: 16px;">
              {/* Embed the base searcher - provides auth + scan UI */}
              {searcher}

              {/* Stats */}
              <div style={{ fontSize: "13px", color: "#666" }}>
                <div>Total Memberships: {totalMemberships}</div>
              </div>

              {/* Memberships List - Hotel-specific UI */}
              <div>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>
                  Your Memberships
                </h3>
                {derive(groupedMemberships, (groups) => {
                  const brands = Object.keys(groups).sort();
                  if (brands.length === 0) {
                    return (
                      <div
                        style={{
                          padding: "24px",
                          textAlign: "center",
                          color: "#999",
                        }}
                      >
                        No memberships found yet. Click "Scan" to search your
                        emails.
                      </div>
                    );
                  }

                  return brands.map((brand) => (
                    <details
                      open
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                        marginBottom: "12px",
                        padding: "12px",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          fontWeight: "600",
                          fontSize: "14px",
                          marginBottom: "8px",
                        }}
                      >
                        {brand || "Unknown Brand"} ({groups[brand].length})
                      </summary>
                      <ct-vstack gap={2} style="paddingLeft: 16px;">
                        {groups[brand].map((m: MembershipRecord) => (
                          <div
                            style={{
                              padding: "8px",
                              background: "#f8f9fa",
                              borderRadius: "4px",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "600",
                                fontSize: "13px",
                                marginBottom: "4px",
                              }}
                            >
                              {m.programName}
                            </div>
                            <div style={{ marginBottom: "4px" }}>
                              <code
                                style={{
                                  fontSize: "14px",
                                  background: "white",
                                  padding: "6px 12px",
                                  borderRadius: "4px",
                                  display: "inline-block",
                                }}
                              >
                                {m.membershipNumber}
                              </code>
                            </div>
                            {m.tier && (
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#666",
                                  marginBottom: "2px",
                                }}
                              >
                                ⭐ {m.tier}
                              </div>
                            )}
                            <div style={{ fontSize: "11px", color: "#999" }}>
                              📧 {m.sourceEmailSubject || "Unknown email"} •{" "}
                              {m.sourceEmailDate
                                ? new Date(m.sourceEmailDate).toLocaleDateString()
                                : "Unknown date"}
                            </div>
                          </div>
                        ))}
                      </ct-vstack>
                    </details>
                  ));
                })}
              </div>

              {/* Debug Info */}
              <details style={{ marginTop: "16px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "8px",
                    background: "#f8f9fa",
                    border: "1px solid #e0e0e0",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  🔧 Debug Info
                </summary>
                <ct-vstack gap={2} style="padding: 12px; fontSize: 12px;">
                  <div style={{ fontFamily: "monospace" }}>
                    Is Authenticated:{" "}
                    {derive(searcher.isAuthenticated, (a) =>
                      a ? "Yes ✓" : "No",
                    )}
                  </div>
                  <div style={{ fontFamily: "monospace" }}>
                    Is Scanning:{" "}
                    {derive(searcher.isScanning, (s) => (s ? "Yes ⏳" : "No"))}
                  </div>
                  <div style={{ fontFamily: "monospace" }}>
                    Agent Pending:{" "}
                    {derive(searcher.agentPending, (p) =>
                      p ? "Yes ⏳" : "No ✓",
                    )}
                  </div>
                  <div style={{ fontFamily: "monospace" }}>
                    Agent Result:{" "}
                    {derive(searcher.agentResult, (r) => r ? "Yes ✓" : "No")}
                  </div>
                  <div style={{ fontFamily: "monospace" }}>
                    Max Searches: {maxSearches}
                  </div>
                </ct-vstack>
              </details>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
    };
  },
);

export default HotelMembershipExtractorV2;
