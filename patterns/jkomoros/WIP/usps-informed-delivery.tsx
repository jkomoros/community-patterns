/// <cts-enable />
/**
 * USPS Informed Delivery Mail Analyzer
 *
 * Processes USPS Informed Delivery emails to extract information about
 * incoming mail using LLM vision analysis.
 *
 * Features:
 * - Connects to gmail-importer via wish() for email fetching
 * - Auto-analyzes mail piece images with LLM vision
 * - Learns household members from recipient names over time
 * - Classifies mail type and spam likelihood
 *
 * Usage:
 * 1. Create a gmail-importer instance with:
 *    - gmailFilterQuery: "from:USPSInformeddelivery@email.informeddelivery.usps.com"
 *    - autoFetchOnAuth: true
 * 2. Deploy this pattern and it will connect via wish()
 */
import {
  computed,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  NAME,
  Opaque,
  pattern,
  str,
  UI,
  wish,
  Writable,
} from "commontools";

// Import Email type from gmail-importer for type safety
import type { Email } from "../gmail-importer.tsx";

// =============================================================================
// TYPES
// =============================================================================

type MailType =
  | "bill"
  | "advertisement"
  | "personal"
  | "package"
  | "government"
  | "subscription"
  | "charity"
  | "other";

/** A single mail piece extracted from an Informed Delivery email */
interface MailPiece {
  id: string;
  emailId: string;
  emailDate: string;
  imageUrl: string;
  // LLM-extracted fields
  recipient: string;
  sender: string;
  mailType: MailType;
  isLikelySpam: boolean;
  spamConfidence: number;
  summary: string;
  processedAt: number;
}

/** A learned household member */
interface HouseholdMember {
  name: string;
  aliases: string[];
  mailCount: number;
  firstSeen: number;
  isConfirmed: boolean;
}

/** Pattern settings */
interface Settings {
  lastProcessedEmailId: Default<string, "">;
}

/** Gmail importer output type (what we expect from wish) */
interface GmailImporterOutput {
  emails: Email[];
  emailCount: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const USPS_SENDER = "informeddelivery.usps.com";

// Schema for LLM mail piece analysis
const MAIL_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    recipient: {
      type: "string",
      description: "Full name of the recipient shown on the mail piece",
    },
    sender: {
      type: "string",
      description: "Name of the sender or company (from return address)",
    },
    mailType: {
      type: "string",
      enum: [
        "bill",
        "advertisement",
        "personal",
        "package",
        "government",
        "subscription",
        "charity",
        "other",
      ],
      description: "Type/category of this mail piece",
    },
    isLikelySpam: {
      type: "boolean",
      description: "Whether this appears to be junk mail or spam",
    },
    spamConfidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "Confidence score for spam classification (0-100)",
    },
    summary: {
      type: "string",
      description: "Brief one-sentence description of this mail piece",
    },
  },
  required: [
    "recipient",
    "sender",
    "mailType",
    "isLikelySpam",
    "spamConfidence",
    "summary",
  ],
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract image URLs from USPS Informed Delivery email HTML content.
 * USPS emails typically include scanned images of mail pieces.
 */
function extractMailPieceImages(htmlContent: string): string[] {
  const images: string[] = [];

  // Look for img tags with mail piece images
  // USPS typically uses specific patterns for mail piece images
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const src = match[1];
    // Filter for likely mail piece images (not logos, icons, etc.)
    // USPS mail piece images are usually larger and have specific patterns
    if (
      src.includes("mailpiece") ||
      src.includes("informed") ||
      src.includes("usps") ||
      // Also look for data URIs (base64 images)
      src.startsWith("data:image") ||
      // Or large CDN-hosted images
      (src.includes("http") && !src.includes("logo") && !src.includes("icon"))
    ) {
      images.push(src);
    }
  }

  return images;
}

/**
 * Normalize a recipient name for comparison.
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Check if two names are likely the same person (fuzzy match).
 */
function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return true;

  // Check if one is a substring of the other (handles initials)
  const parts1 = n1.split(" ");
  const parts2 = n2.split(" ");

  // Same last name?
  if (parts1.length > 0 && parts2.length > 0) {
    const last1 = parts1[parts1.length - 1];
    const last2 = parts2[parts2.length - 1];
    if (last1 === last2) return true;
  }

  return false;
}

// =============================================================================
// HANDLERS
// =============================================================================

// Handler to confirm a household member
// Uses cell reference with .equals() - idiomatic approach
const confirmMember = handler<
  unknown,
  { member: Writable<HouseholdMember> }
>((_event, { member }) => {
  const current = member.get();
  member.set({ ...current, isConfirmed: true });
});

// Handler to delete a household member
// Uses cell reference - pass householdMembers array and the member cell
const deleteMember = handler<
  unknown,
  { householdMembers: Writable<HouseholdMember[]>; member: Writable<HouseholdMember> }
>((_event, { householdMembers, member }) => {
  householdMembers.remove(member);
});

// Handler to manually trigger analysis
const triggerAnalysis = handler<
  unknown,
  {
    mailPieces: Writable<MailPiece[]>;
    householdMembers: Writable<HouseholdMember[]>;
    settings: Writable<Settings>;
    processing: Writable<boolean>;
    uspsEmails: Email[];
  }
>(async (_event, state) => {
  // Inside handler, OpaqueRef is unwrapped to plain array
  const emails = state.uspsEmails;
  if (!emails || emails.length === 0) return;

  state.processing.set(true);

  try {
    const existingIds = new Set(state.mailPieces.get().map((p) => p.emailId));

    for (const email of emails) {
      // Skip already processed emails
      if (existingIds.has(email.id)) continue;

      // Extract images from email
      const imageUrls = extractMailPieceImages(email.htmlContent);

      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];

        try {
          // Analyze image with LLM vision
          // Note: generateObject prompt must be an array with image and text parts
          const analysis = await generateObject({
            prompt: [
              { type: "image" as const, image: imageUrl },
              {
                type: "text" as const,
                text: `Analyze this scanned mail piece image. Extract the recipient name, sender/company, classify the mail type, and determine if it's likely spam or junk mail.

If you cannot read the image clearly, make your best guess based on what you can see.`,
              },
            ],
            schema: MAIL_ANALYSIS_SCHEMA,
          });

          const result = analysis.result as {
            recipient: string;
            sender: string;
            mailType: MailType;
            isLikelySpam: boolean;
            spamConfidence: number;
            summary: string;
          };

          // Create mail piece record
          const mailPiece: MailPiece = {
            id: `${email.id}-${i}`,
            emailId: email.id,
            emailDate: email.date,
            imageUrl,
            recipient: result.recipient,
            sender: result.sender,
            mailType: result.mailType,
            isLikelySpam: result.isLikelySpam,
            spamConfidence: result.spamConfidence,
            summary: result.summary,
            processedAt: Date.now(),
          };

          // Add to mail pieces
          state.mailPieces.push(mailPiece);

          // Update household members
          if (result.recipient) {
            const members = state.householdMembers.get();
            // Find existing member by name match
            let found = false;
            for (let i = 0; i < members.length; i++) {
              const m = members[i];
              // Get the cell value if it's a cell, otherwise use as-is
              const memberData = (m as any).get ? (m as any).get() : m;
              if (
                namesMatch(memberData.name, result.recipient) ||
                memberData.aliases?.some((a: string) => namesMatch(a, result.recipient))
              ) {
                // Update existing member using cell if available
                if ((m as any).set) {
                  (m as any).set({
                    ...memberData,
                    mailCount: memberData.mailCount + 1,
                    aliases: memberData.aliases.includes(result.recipient) ||
                             memberData.name === result.recipient
                      ? memberData.aliases
                      : [...memberData.aliases, result.recipient],
                  });
                }
                found = true;
                break;
              }
            }

            if (!found) {
              // Add new unconfirmed member using .push() which auto-wraps in cell
              state.householdMembers.push({
                name: result.recipient,
                aliases: [],
                mailCount: 1,
                firstSeen: Date.now(),
                isConfirmed: false,
              });
            }
          }
        } catch (err) {
          console.error("[USPSInformedDelivery] Error analyzing image:", err);
        }
      }

      // Update last processed email ID
      const current = state.settings.get();
      state.settings.set({ ...current, lastProcessedEmailId: email.id });
    }
  } finally {
    state.processing.set(false);
  }
});

// =============================================================================
// PATTERN
// =============================================================================

interface PatternInput {
  settings: Default<
    Settings,
    {
      lastProcessedEmailId: "";
    }
  >;
  mailPieces: Default<MailPiece[], []>;
  householdMembers: Default<HouseholdMember[], []>;
}

/** USPS Informed Delivery mail analyzer. #uspsInformedDelivery */
interface PatternOutput {
  mailPieces: MailPiece[];
  householdMembers: HouseholdMember[];
  mailCount: number;
  spamCount: number;
}

export default pattern<PatternInput, PatternOutput>(
  ({ settings, mailPieces, householdMembers }) => {
    // Local state
    const processing = Writable.of(false);

    // Wish for a gmail-importer instance
    const gmailImporter = wish<GmailImporterOutput>({
      query: "#gmailEmails",
    });

    // Filter for USPS emails
    const uspsEmails = derive(gmailImporter, (result) => {
      const emails = result?.result?.emails || [];
      return emails.filter((e: Email) =>
        e.from?.toLowerCase().includes(USPS_SENDER)
      );
    });

    // Count of USPS emails found
    const uspsEmailCount = derive(uspsEmails, (emails: Email[]) =>
      emails?.length || 0
    );

    // Check if gmail-importer is connected
    const isConnected = derive(
      gmailImporter,
      (result) => !!result?.result?.emails,
    );

    // Derived counts
    const mailCount = derive(
      mailPieces,
      (pieces: MailPiece[]) => pieces?.length || 0,
    );
    const spamCount = derive(
      mailPieces,
      (pieces: MailPiece[]) =>
        pieces?.filter((p) => p.isLikelySpam)?.length || 0,
    );

    // Group mail by date
    const mailByDate = derive(mailPieces, (pieces: MailPiece[]) => {
      const groups: Record<string, MailPiece[]> = {};
      for (const piece of pieces || []) {
        const date = new Date(piece.emailDate).toLocaleDateString();
        if (!groups[date]) groups[date] = [];
        groups[date].push(piece);
      }
      return groups;
    });

    // Unconfirmed members count
    const unconfirmedCount = derive(
      householdMembers,
      (members: HouseholdMember[]) =>
        members?.filter((m) => !m.isConfirmed)?.length || 0,
    );

    return {
      [NAME]: "USPS Informed Delivery",

      mailPieces,
      householdMembers,
      mailCount,
      spamCount,

      [UI]: (
        <ct-screen>
          <div slot="header">
            <ct-heading level={3}>USPS Informed Delivery</ct-heading>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack padding="6" gap="4">
              {/* Connection Status */}
              {ifElse(
                isConnected,
                <div
                  style={{
                    padding: "12px 16px",
                    backgroundColor: "#d1fae5",
                    borderRadius: "8px",
                    border: "1px solid #10b981",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: "#10b981",
                      }}
                    />
                    <span>Connected to Gmail Importer</span>
                    <span style={{ marginLeft: "auto", color: "#059669" }}>
                      {uspsEmailCount} USPS emails found
                    </span>
                  </div>
                </div>,
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#fef3c7",
                    borderRadius: "8px",
                    border: "1px solid #f59e0b",
                  }}
                >
                  <h4 style={{ margin: "0 0 8px 0", color: "#b45309" }}>
                    Gmail Importer Not Connected
                  </h4>
                  <p style={{ margin: "0", fontSize: "14px", color: "#92400e" }}>
                    To use this pattern, please:
                  </p>
                  <ol
                    style={{
                      margin: "8px 0 0 0",
                      paddingLeft: "20px",
                      fontSize: "14px",
                      color: "#92400e",
                    }}
                  >
                    <li>Create a Gmail Importer charm</li>
                    <li>
                      Set the filter query to:
                      <code
                        style={{
                          display: "block",
                          margin: "4px 0",
                          padding: "4px 8px",
                          backgroundColor: "#fef9c3",
                          borderRadius: "4px",
                          fontSize: "12px",
                        }}
                      >
                        from:USPSInformeddelivery@email.informeddelivery.usps.com
                      </code>
                    </li>
                    <li>Enable "Auto-fetch on auth"</li>
                    <li>Connect Google Auth and favorite it</li>
                  </ol>
                </div>,
              )}

              {/* Analysis Controls */}
              {ifElse(
                isConnected,
                <div>
                  <ct-button
                    onClick={triggerAnalysis({
                      mailPieces,
                      householdMembers,
                      settings,
                      processing,
                      uspsEmails: uspsEmails as any,
                    })}
                    disabled={processing}
                  >
                    {ifElse(
                      processing,
                      <span
                        style={{ display: "flex", alignItems: "center", gap: "8px" }}
                      >
                        <ct-loader size="sm" />
                        Analyzing...
                      </span>,
                      "Analyze Mail Pieces",
                    )}
                  </ct-button>
                </div>,
                null,
              )}

              {/* Stats */}
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  padding: "12px",
                  backgroundColor: "#f3f4f6",
                  borderRadius: "8px",
                }}
              >
                <div>
                  <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                    {mailCount}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Mail Pieces
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "24px", fontWeight: "bold", color: "#dc2626" }}>
                    {spamCount}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Spam/Junk
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                    {derive(householdMembers, (m: HouseholdMember[]) => m?.length || 0)}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Household Members
                  </div>
                </div>
              </div>

              {/* Household Members */}
              <details open style={{ marginTop: "8px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "16px",
                    marginBottom: "8px",
                  }}
                >
                  Household Members
                  {ifElse(
                    derive(unconfirmedCount, (c: number) => c > 0),
                    <span
                      style={{
                        marginLeft: "8px",
                        padding: "2px 8px",
                        backgroundColor: "#fef3c7",
                        borderRadius: "12px",
                        fontSize: "12px",
                        color: "#b45309",
                      }}
                    >
                      {unconfirmedCount} unconfirmed
                    </span>,
                    null,
                  )}
                </summary>

                <ct-vstack gap="2">
                  {ifElse(
                    derive(householdMembers, (m: HouseholdMember[]) => !m || m.length === 0),
                    <div style={{ color: "#666", fontSize: "14px" }}>
                      No household members learned yet. Analyze some mail to get started.
                    </div>,
                    null,
                  )}
                  {/* Use .map() directly on cell array to get cell references */}
                  {householdMembers.map((member) => (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        backgroundColor: derive(member, (m: HouseholdMember) => m.isConfirmed ? "#f0fdf4" : "#fefce8"),
                        borderRadius: "6px",
                        border: derive(member, (m: HouseholdMember) => `1px solid ${m.isConfirmed ? "#86efac" : "#fde047"}`),
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "500" }}>{derive(member, (m: HouseholdMember) => m.name)}</div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {derive(member, (m: HouseholdMember) => m.mailCount)} pieces
                          {derive(member, (m: HouseholdMember) =>
                            m.aliases?.length > 0 ? ` • Also: ${m.aliases.join(", ")}` : ""
                          )}
                        </div>
                      </div>
                      {ifElse(
                        derive(member, (m: HouseholdMember) => !m.isConfirmed),
                        <button
                          onClick={confirmMember({ member })}
                          style={{
                            padding: "4px 8px",
                            fontSize: "12px",
                            backgroundColor: "#22c55e",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Confirm
                        </button>,
                        null,
                      )}
                      <button
                        onClick={deleteMember({ householdMembers, member })}
                        style={{
                          padding: "4px 8px",
                          fontSize: "12px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </ct-vstack>
              </details>

              {/* Mail Pieces by Date */}
              <details open style={{ marginTop: "8px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "16px",
                    marginBottom: "8px",
                  }}
                >
                  Mail Pieces
                </summary>

                {derive(mailByDate, (groups: Record<string, MailPiece[]>) => {
                  const dates = Object.keys(groups).sort(
                    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
                  );

                  if (dates.length === 0) {
                    return (
                      <div style={{ color: "#666", fontSize: "14px" }}>
                        No mail pieces analyzed yet.
                      </div>
                    );
                  }

                  return dates.map((date) => (
                    <div style={{ marginBottom: "16px" }}>
                      <h4
                        style={{
                          margin: "0 0 8px 0",
                          fontSize: "14px",
                          color: "#374151",
                        }}
                      >
                        {date}
                      </h4>
                      <ct-vstack gap="2">
                        {groups[date].map((piece: MailPiece) => (
                          <div
                            style={{
                              display: "flex",
                              gap: "12px",
                              padding: "12px",
                              backgroundColor: piece.isLikelySpam
                                ? "#fef2f2"
                                : "#f9fafb",
                              borderRadius: "8px",
                              border: `1px solid ${piece.isLikelySpam ? "#fecaca" : "#e5e7eb"}`,
                            }}
                          >
                            {/* Image thumbnail */}
                            <div
                              style={{
                                width: "80px",
                                height: "60px",
                                backgroundColor: "#e5e7eb",
                                borderRadius: "4px",
                                overflow: "hidden",
                                flexShrink: 0,
                              }}
                            >
                              <img
                                src={piece.imageUrl}
                                alt="Mail piece"
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            </div>

                            {/* Details */}
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span style={{ fontWeight: "600" }}>
                                  {piece.recipient}
                                </span>
                                {piece.isLikelySpam && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      backgroundColor: "#dc2626",
                                      color: "white",
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                      fontWeight: "600",
                                    }}
                                  >
                                    SPAM
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "13px", color: "#4b5563" }}>
                                From: {piece.sender}
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#6b7280",
                                  marginTop: "4px",
                                }}
                              >
                                {piece.summary}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#9ca3af",
                                  marginTop: "4px",
                                }}
                              >
                                Type: {piece.mailType} • Spam confidence:{" "}
                                {piece.spamConfidence}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </ct-vstack>
                    </div>
                  ));
                })}
              </details>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
    };
  },
);
