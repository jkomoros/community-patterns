/// <cts-enable />
/**
 * Person Research Gmail Agent
 *
 * Searches Gmail to research information about a person.
 * Can link to a person.tsx charm via wish("#person") or accept manual name input.
 *
 * Outputs a markdown-formatted "agentic notes" blob with footnoted sources.
 */
import {
  Writable,
  Default,
  derive,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";
import GmailAgenticSearch, {
  createReportTool,
  type SearchProgress,
  type DebugLogEntry,
} from "./gmail-agentic-search.tsx";

// ============================================================================
// SUGGESTED QUERIES
// ============================================================================

// Build queries dynamically based on person name/email
const buildPersonQueries = (name: string, email?: string): string[] => {
  const queries: string[] = [];

  // If we have an email, prioritize that
  if (email) {
    queries.push(`from:${email}`);
    queries.push(`to:${email}`);
    queries.push(`from:${email} "phone" OR "mobile" OR "cell"`);
    queries.push(`from:${email} "linkedin" OR "twitter" OR "github"`);
  }

  // Name-based searches
  if (name) {
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts[parts.length - 1] || "";

    queries.push(`"${name}"`);
    if (lastName && lastName !== firstName) {
      queries.push(`from:*${lastName.toLowerCase()}*`);
    }
    queries.push(`subject:"${name}"`);

    // Recent communication
    queries.push(`"${name}" newer_than:1y`);
  }

  return queries;
};

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// Finding types - record types include all input fields plus id and extractedAt
// (required by createReportTool helper)

interface EmailAddressFinding {
  id: string;
  value: string;
  confidence: "high" | "medium" | "low";
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
  context: string;
  extractedAt: number;
}

interface PhoneNumberFinding {
  id: string;
  value: string;
  type?: "mobile" | "work" | "home";
  confidence: "high" | "medium" | "low";
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
  context: string;
  extractedAt: number;
}

interface RelationshipTypeFinding {
  id: string;
  type: string; // From the closed set: colleague, friend, etc.
  confidence: "high" | "medium" | "low";
  reasoning: string;
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
  extractedAt: number;
}

interface TopicFinding {
  id: string;
  topic: string;
  mentions: number;
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
  extractedAt: number;
}

interface OrganizationFinding {
  id: string;
  name: string;
  confidence: "high" | "medium" | "low";
  source: string;
  extractedAt: number;
}

// Aggregated findings
interface PersonFindings {
  emailAddresses: EmailAddressFinding[];
  phoneNumbers: PhoneNumberFinding[];
  relationshipTypes: RelationshipTypeFinding[];
  topics: TopicFinding[];
  organizations: OrganizationFinding[];
  communicationStats: {
    totalEmails: number;
    earliestDate?: string;
    latestDate?: string;
    frequency: "frequent" | "regular" | "occasional" | "rare" | "unknown";
  };
}

// Input types for tools (used by createReportTool)
interface EmailAddressInput {
  value: string;
  confidence: "high" | "medium" | "low";
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
  context: string;
}

interface PhoneNumberInput {
  value: string;
  type?: "mobile" | "work" | "home";
  confidence: "high" | "medium" | "low";
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
  context: string;
}

interface RelationshipTypeInput {
  type: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
}

interface TopicInput {
  topic: string;
  mentions: number;
  sourceEmailId: string;
  sourceEmailSubject: string;
  sourceEmailDate: string;
}

interface OrganizationInput {
  name: string;
  confidence: "high" | "medium" | "low";
  source: string;
}

interface CommunicationStatsInput {
  totalEmails: number;
  earliestDate?: string;
  latestDate?: string;
  frequency: "frequent" | "regular" | "occasional" | "rare" | "unknown";
}

// Pattern I/O
interface PersonResearchInput {
  // Manual entry (fallback if no wish result)
  personName?: Default<string, "">;
  knownEmail?: Default<string, "">;
  contextNotes?: Default<string, "">; // e.g., "my colleague from Acme"

  // Agent config
  maxSearches?: Default<number, 10>;

  // Agent state
  isScanning?: Default<boolean, false>;
  lastScanAt?: Default<number, 0>;

  // Search progress for coordination
  searchProgress?: Default<
    SearchProgress,
    {
      currentQuery: "";
      completedQueries: [];
      status: "idle";
      searchCount: 0;
    }
  >;

  // Debug log
  debugLog?: Default<DebugLogEntry[], []>;

  // Findings storage
  emailAddresses?: Default<EmailAddressFinding[], []>;
  phoneNumbers?: Default<PhoneNumberFinding[], []>;
  relationshipTypes?: Default<RelationshipTypeFinding[], []>;
  topics?: Default<TopicFinding[], []>;
  organizations?: Default<OrganizationFinding[], []>;
  communicationStats?: Default<
    PersonFindings["communicationStats"],
    {
      totalEmails: 0;
      frequency: "unknown";
    }
  >;

  // Generated output
  agenticNotes?: Default<string, "">;
}

/** Person research results from Gmail analysis. #personResearch */
interface PersonResearchOutput {
  findings: PersonFindings;
  agenticNotes: string;
  lastScanAt: number;
}

// ============================================================================
// RELATIONSHIP TYPE REFERENCE
// ============================================================================
const VALID_RELATIONSHIP_TYPES = [
  // Professional
  "colleague",
  "former-colleague",
  "manager",
  "direct-report",
  "mentor",
  "mentee",
  "client",
  "vendor",
  "investor",
  "founder",
  "advisor",
  "recruiter",
  "collaborator",
  // Personal
  "friend",
  "acquaintance",
  "neighbor",
  "classmate",
  "roommate",
  "ex-partner",
  "online-friend",
  // Family
  "spouse",
  "parent",
  "child",
  "grandparent",
  "grandchild",
  "sibling",
  "aunt-uncle",
  "niece-nephew",
  "cousin",
  "in-law",
  "chosen-family",
  // Service
  "service-provider",
  "support-contact",
];

// ============================================================================
// RESULT SCHEMA
// ============================================================================
const PERSON_RESULT_SCHEMA = {
  type: "object",
  properties: {
    searchesPerformed: {
      type: "number",
      description: "Number of Gmail searches performed",
    },
    emailsAnalyzed: {
      type: "number",
      description: "Total emails analyzed",
    },
    findings: {
      type: "object",
      properties: {
        emailAddressesFound: { type: "number" },
        phoneNumbersFound: { type: "number" },
        relationshipType: { type: "string" },
        topicsFound: { type: "number" },
        organization: { type: "string" },
      },
    },
    disambiguationNeeded: {
      type: "boolean",
      description:
        "True if multiple people with this name were found and couldn't be distinguished",
    },
    disambiguationDetails: {
      type: "string",
      description:
        "If disambiguation needed, describe the different candidates found",
    },
    summary: {
      type: "string",
      description: "Brief summary of research findings",
    },
  },
  required: ["summary"],
};

// ============================================================================
// NOTES GENERATOR
// ============================================================================

// Generate markdown agentic notes with footnotes
function generateAgenticNotes(
  personName: string,
  findings: PersonFindings,
): string {
  const lines: string[] = [];
  const footnotes: string[] = [];
  let footnoteNum = 1;

  lines.push(`## Agentic Research: ${personName}`);
  lines.push("");

  // Contact Info
  if (findings.emailAddresses.length > 0 || findings.phoneNumbers.length > 0) {
    lines.push("**Contact Info:**");
    for (const email of findings.emailAddresses) {
      const fn = footnoteNum++;
      lines.push(`- Email: ${email.value} [${fn}]`);
      footnotes.push(
        `[${fn}] ${email.context}, "${email.sourceEmailSubject}" (${email.sourceEmailDate})`,
      );
    }
    for (const phone of findings.phoneNumbers) {
      const fn = footnoteNum++;
      const typeStr = phone.type ? ` (${phone.type})` : "";
      lines.push(`- Phone${typeStr}: ${phone.value} [${fn}]`);
      footnotes.push(
        `[${fn}] ${phone.context}, "${phone.sourceEmailSubject}" (${phone.sourceEmailDate})`,
      );
    }
    lines.push("");
  }

  // Communication stats
  if (findings.communicationStats.totalEmails > 0) {
    lines.push("**Communication:**");
    lines.push(`- Total emails: ${findings.communicationStats.totalEmails}`);
    if (findings.communicationStats.frequency !== "unknown") {
      lines.push(`- Frequency: ${findings.communicationStats.frequency}`);
    }
    if (findings.communicationStats.latestDate) {
      lines.push(
        `- Last contact: ${findings.communicationStats.latestDate}`,
      );
    }
    if (
      findings.communicationStats.earliestDate &&
      findings.communicationStats.latestDate
    ) {
      lines.push(
        `- Date range: ${findings.communicationStats.earliestDate} - ${findings.communicationStats.latestDate}`,
      );
    }
    lines.push("");
  }

  // Relationship
  if (findings.relationshipTypes.length > 0) {
    const primary = findings.relationshipTypes[0];
    const fn = footnoteNum++;
    lines.push(
      `**Relationship:** ${primary.type} (${primary.confidence} confidence) [${fn}]`,
    );
    lines.push(`- Reasoning: ${primary.reasoning}`);
    footnotes.push(
      `[${fn}] Analyzed ${findings.communicationStats.totalEmails || "multiple"} emails`,
    );
    lines.push("");
  }

  // Organization
  if (findings.organizations.length > 0) {
    const org = findings.organizations[0];
    lines.push(`**Organization:** ${org.name} (${org.confidence} confidence)`);
    lines.push(`- Source: ${org.source}`);
    lines.push("");
  }

  // Topics
  if (findings.topics.length > 0) {
    const topTopics = findings.topics
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5);
    lines.push("**Topics discussed:**");
    for (const topic of topTopics) {
      lines.push(`- ${topic.topic} (${topic.mentions} mentions)`);
    }
    lines.push("");
  }

  // Footnotes
  if (footnotes.length > 0) {
    lines.push("---");
    lines.push("**Sources:**");
    for (const fn of footnotes) {
      lines.push(fn);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// PATTERN
// ============================================================================

const PersonResearchGmailAgent = pattern<
  PersonResearchInput,
  PersonResearchOutput
>(
  ({
    personName,
    knownEmail,
    contextNotes,
    maxSearches,
    isScanning,
    lastScanAt,
    searchProgress,
    debugLog,
    emailAddresses,
    phoneNumbers,
    relationshipTypes,
    topics,
    organizations,
    communicationStats,
    agenticNotes,
  }) => {
    // ========================================================================
    // LOCAL WRITABLE CELLS FOR USER INPUT
    // ========================================================================
    // Input props (personName, knownEmail, contextNotes) are Default cells which
    // become read-only when using default values. Create local writable cells
    // for UI input handling.
    // See: community-docs/folk_wisdom/thinking-reactively-vs-events.md
    const localPersonName = Writable.of("");
    const localKnownEmail = Writable.of("");
    const localContextNotes = Writable.of("");

    // ========================================================================
    // EFFECTIVE VALUES FROM MANUAL INPUT
    // ========================================================================
    // For MVP, we just use manual input. Wish integration can be added later.
    // TODO: Add wish("#person") support once we understand the reactive issues
    // Use the local cells directly - they already contain the input values
    const effectiveName = localPersonName;
    const effectiveEmail = localKnownEmail;
    const effectiveContext = localContextNotes;

    // Build suggested queries based on effective name/email
    const suggestedQueries = derive(
      [effectiveName, effectiveEmail],
      ([name, email]: [string, string]) => buildPersonQueries(name, email),
    );

    // ========================================================================
    // CUSTOM TOOLS
    // ========================================================================

    // Report Email Address
    const reportEmailAddressHandler = createReportTool<
      EmailAddressInput,
      EmailAddressFinding
    >({
      idPrefix: "email",
      dedupeKey: (input) => input.value.toLowerCase(),
      toRecord: (input, id, timestamp) => ({
        ...input,
        id,
        extractedAt: timestamp,
      }),
    });

    // Report Phone Number
    const reportPhoneNumberHandler = createReportTool<
      PhoneNumberInput,
      PhoneNumberFinding
    >({
      idPrefix: "phone",
      dedupeKey: (input) => input.value.replace(/\D/g, ""), // Strip non-digits for dedup
      toRecord: (input, id, timestamp) => ({
        ...input,
        id,
        extractedAt: timestamp,
      }),
    });

    // Report Relationship Type
    const reportRelationshipTypeHandler = createReportTool<
      RelationshipTypeInput,
      RelationshipTypeFinding
    >({
      idPrefix: "relationship",
      dedupeKey: (input) => input.type.toLowerCase(),
      toRecord: (input, id, timestamp) => ({
        ...input,
        id,
        extractedAt: timestamp,
      }),
    });

    // Report Topic
    const reportTopicHandler = createReportTool<TopicInput, TopicFinding>({
      idPrefix: "topic",
      dedupeKey: (input) => input.topic.toLowerCase(),
      toRecord: (input, id, timestamp) => ({
        ...input,
        id,
        extractedAt: timestamp,
      }),
    });

    // Report Organization
    const reportOrganizationHandler = createReportTool<
      OrganizationInput,
      OrganizationFinding
    >({
      idPrefix: "org",
      dedupeKey: (input) => input.name.toLowerCase(),
      toRecord: (input, id, timestamp) => ({
        ...input,
        id,
        extractedAt: timestamp,
      }),
    });

    // Communication stats handler - not using createReportTool since it's singular
    const reportCommunicationStatsHandler = handler<
      CommunicationStatsInput,
      { stats: Writable<PersonFindings["communicationStats"]> }
    >((input, state) => {
      state.stats.set({
        totalEmails: input.totalEmails,
        earliestDate: input.earliestDate,
        latestDate: input.latestDate,
        frequency: input.frequency,
      });
      return { success: true };
    });

    // ========================================================================
    // DYNAMIC AGENT GOAL
    // ========================================================================

    const agentGoal = derive(
      [effectiveName, effectiveEmail, effectiveContext, maxSearches],
      ([name, email, context, max]: [string, string, string, number]) => {
        if (!name) return ""; // Don't run without a name

        const isQuickMode = max > 0;

        return `Research information about "${name}" from my Gmail.

${email ? `Known email address: ${email}` : "No email address provided - search by name."}
${context ? `Context: ${context}` : ""}
${isQuickMode ? `\n⚠️ LIMITED TO ${max} SEARCHES. Focus on high-value queries!\n` : ""}

Your task:
1. Search Gmail for emails from/to/mentioning this person
2. Extract and report findings using the available tools
3. Look for: email addresses, phone numbers, relationship context, topics discussed

Search strategies:
${email ? `- Search from:${email} and to:${email} for direct communication` : `- Search for "${name}" in quotes to find exact matches`}
- Look in email signatures for phone numbers and social links
- Analyze email domains to infer organization
- Note the tone and topics to infer relationship type

When reporting relationship type, use one of these categories:
Professional: colleague, former-colleague, manager, direct-report, mentor, mentee, client, vendor, investor, founder, advisor, recruiter, collaborator
Personal: friend, acquaintance, neighbor, classmate, roommate, ex-partner, online-friend
Family: spouse, parent, child, grandparent, grandchild, sibling, aunt-uncle, niece-nephew, cousin, in-law, chosen-family
Service: service-provider, support-contact

Report each finding IMMEDIATELY as you discover it. Don't wait until the end!

If you find emails from MULTIPLE different people with this name (different email domains, different contexts), report disambiguation details in your summary.

When done, provide a summary of what you found.`;
      },
    );

    // ========================================================================
    // CREATE BASE SEARCHER
    // ========================================================================

    const searcher = GmailAgenticSearch({
      agentGoal,
      systemPrompt: `You are a person research agent. Your job is to search Gmail and extract information about a specific person.

You have these tools:
1. searchGmail({ query }) - Search Gmail and return matching emails
2. reportEmailAddress({ value, confidence, sourceEmailId, sourceEmailSubject, sourceEmailDate, context }) - Save a found email address
3. reportPhoneNumber({ value, type?, confidence, sourceEmailId, sourceEmailSubject, sourceEmailDate, context }) - Save a found phone number
4. reportRelationshipType({ type, confidence, reasoning, sourceEmailId, sourceEmailSubject, sourceEmailDate }) - Report inferred relationship type
5. reportTopic({ topic, mentions, sourceEmailId, sourceEmailSubject, sourceEmailDate }) - Save a discussion topic
6. reportOrganization({ name, confidence, source }) - Save inferred organization
7. reportCommunicationStats({ totalEmails, earliestDate?, latestDate?, frequency }) - Report communication statistics

Confidence levels:
- "high": Found in structured location (From: header, signature block, explicit mention)
- "medium": Found in context but requires interpretation
- "low": Inferred or uncertain

Phone types: "mobile", "work", "home", or omit if unknown

IMPORTANT: Report each finding immediately as you discover it!`,
      suggestedQueries,
      resultSchema: PERSON_RESULT_SCHEMA,
      additionalTools: {
        reportEmailAddress: {
          description:
            "Report a discovered email address for this person. Call immediately when found.",
          handler: reportEmailAddressHandler({ items: emailAddresses }),
        },
        reportPhoneNumber: {
          description:
            "Report a discovered phone number. Look in signatures, body text.",
          handler: reportPhoneNumberHandler({ items: phoneNumbers }),
        },
        reportRelationshipType: {
          description:
            "Report the inferred relationship type (colleague, friend, family, etc.) with reasoning.",
          handler: reportRelationshipTypeHandler({ items: relationshipTypes }),
        },
        reportTopic: {
          description:
            "Report a topic frequently discussed with this person.",
          handler: reportTopicHandler({ items: topics }),
        },
        reportOrganization: {
          description:
            "Report the person's organization/company if identifiable from email domain or signatures.",
          handler: reportOrganizationHandler({ items: organizations }),
        },
        reportCommunicationStats: {
          description:
            "Report overall communication statistics (total emails, date range, frequency).",
          handler: reportCommunicationStatsHandler({ stats: communicationStats }),
        },
      },
      title: derive([effectiveName], ([name]: [string]) =>
        name ? `Person Research: ${name}` : "Person Research",
      ),
      scanButtonLabel: "🔍 Research This Person",
      maxSearches,
      isScanning,
      lastScanAt,
      searchProgress,
      debugLog,
    });

    // ========================================================================
    // AGGREGATE FINDINGS
    // ========================================================================

    const findings = derive(
      [
        emailAddresses,
        phoneNumbers,
        relationshipTypes,
        topics,
        organizations,
        communicationStats,
      ],
      ([emails, phones, rels, tops, orgs, stats]: [
        EmailAddressFinding[],
        PhoneNumberFinding[],
        RelationshipTypeFinding[],
        TopicFinding[],
        OrganizationFinding[],
        PersonFindings["communicationStats"],
      ]): PersonFindings => ({
        emailAddresses: emails || [],
        phoneNumbers: phones || [],
        relationshipTypes: rels || [],
        topics: tops || [],
        organizations: orgs || [],
        communicationStats: stats || { totalEmails: 0, frequency: "unknown" },
      }),
    );

    // Generate notes when findings change
    const generatedNotes = derive(
      [effectiveName, findings],
      ([name, f]: [string, PersonFindings]) => {
        if (!name) return "";
        const hasFindings =
          f.emailAddresses.length > 0 ||
          f.phoneNumbers.length > 0 ||
          f.relationshipTypes.length > 0 ||
          f.topics.length > 0 ||
          f.organizations.length > 0 ||
          f.communicationStats.totalEmails > 0;

        if (!hasFindings) return "";
        return generateAgenticNotes(name, f);
      },
    );

    // Counts for display
    const totalFindings = derive(
      findings,
      (f: PersonFindings) =>
        f.emailAddresses.length +
        f.phoneNumbers.length +
        f.relationshipTypes.length +
        f.topics.length +
        f.organizations.length,
    );

    // ========================================================================
    // UI
    // ========================================================================

    return {
      [NAME]: derive([effectiveName], ([name]: [string]) =>
        name ? `🔍 Research: ${name}` : "🔍 Person Research",
      ),

      // Output
      findings,
      agenticNotes: generatedNotes,
      lastScanAt,

      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2 style={{ margin: "0", fontSize: "18px" }}>Person Research</h2>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack style="padding: 16px; gap: 16px;">
              {/* Person Input Section */}
              <ct-card>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>
                  Who to Research
                </h3>

                {/* Manual input form */}
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      color: "#64748b",
                      marginBottom: "4px",
                    }}
                  >
                    Person's Name *
                  </label>
                  <ct-input
                    placeholder="e.g., Sarah Chen"
                    $value={localPersonName}
                  />
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      color: "#64748b",
                      marginBottom: "4px",
                    }}
                  >
                    Known Email (optional)
                  </label>
                  <ct-input
                    placeholder="e.g., sarah@acme.com"
                    $value={localKnownEmail}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      color: "#64748b",
                      marginBottom: "4px",
                    }}
                  >
                    Context (optional)
                  </label>
                  <ct-input
                    placeholder="e.g., colleague from Acme, friend from college"
                    $value={localContextNotes}
                  />
                </div>
              </ct-card>

              {/* Embed the base searcher - provides auth + scan UI */}
              {derive([effectiveName], ([name]: [string]) =>
                name ? (
                  searcher
                ) : (
                  <div
                    style={{
                      padding: "24px",
                      textAlign: "center",
                      color: "#94a3b8",
                      background: "#f8fafc",
                      borderRadius: "8px",
                    }}
                  >
                    Enter a person's name above to start research
                  </div>
                ),
              )}

              {/* Findings Summary */}
              {derive(totalFindings, (count: number) =>
                count > 0 ? (
                  <ct-card>
                    <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>
                      Findings ({count})
                    </h3>

                    {/* Email Addresses */}
                    {derive(emailAddresses, (emails: EmailAddressFinding[]) =>
                      emails.length > 0 ? (
                        <div style={{ marginBottom: "12px" }}>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: "600",
                              color: "#475569",
                              marginBottom: "4px",
                            }}
                          >
                            Email Addresses
                          </div>
                          {emails.map((e: EmailAddressFinding) => (
                            <div
                              style={{
                                padding: "6px 8px",
                                background: "#f1f5f9",
                                borderRadius: "4px",
                                marginBottom: "4px",
                                fontSize: "13px",
                              }}
                            >
                              {e.value}{" "}
                              <span
                                style={{ color: "#94a3b8", fontSize: "11px" }}
                              >
                                ({e.confidence})
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null,
                    )}

                    {/* Phone Numbers */}
                    {derive(phoneNumbers, (phones: PhoneNumberFinding[]) =>
                      phones.length > 0 ? (
                        <div style={{ marginBottom: "12px" }}>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: "600",
                              color: "#475569",
                              marginBottom: "4px",
                            }}
                          >
                            Phone Numbers
                          </div>
                          {phones.map((p: PhoneNumberFinding) => (
                            <div
                              style={{
                                padding: "6px 8px",
                                background: "#f1f5f9",
                                borderRadius: "4px",
                                marginBottom: "4px",
                                fontSize: "13px",
                              }}
                            >
                              {p.value}
                              {p.type ? ` (${p.type})` : ""}{" "}
                              <span
                                style={{ color: "#94a3b8", fontSize: "11px" }}
                              >
                                ({p.confidence})
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null,
                    )}

                    {/* Relationship */}
                    {derive(
                      relationshipTypes,
                      (rels: RelationshipTypeFinding[]) =>
                        rels.length > 0 ? (
                          <div style={{ marginBottom: "12px" }}>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: "600",
                                color: "#475569",
                                marginBottom: "4px",
                              }}
                            >
                              Relationship
                            </div>
                            <div
                              style={{
                                padding: "6px 8px",
                                background: "#f1f5f9",
                                borderRadius: "4px",
                                fontSize: "13px",
                              }}
                            >
                              {rels[0].type}{" "}
                              <span
                                style={{ color: "#94a3b8", fontSize: "11px" }}
                              >
                                ({rels[0].confidence})
                              </span>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#64748b",
                                  marginTop: "4px",
                                }}
                              >
                                {rels[0].reasoning}
                              </div>
                            </div>
                          </div>
                        ) : null,
                    )}

                    {/* Topics */}
                    {derive(topics, (tops: TopicFinding[]) =>
                      tops.length > 0 ? (
                        <div style={{ marginBottom: "12px" }}>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: "600",
                              color: "#475569",
                              marginBottom: "4px",
                            }}
                          >
                            Topics Discussed
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {tops.slice(0, 5).map((t: TopicFinding) => (
                              <span
                                style={{
                                  padding: "4px 8px",
                                  background: "#dbeafe",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  color: "#1e40af",
                                }}
                              >
                                {t.topic} ({t.mentions})
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null,
                    )}

                    {/* Organization */}
                    {derive(organizations, (orgs: OrganizationFinding[]) =>
                      orgs.length > 0 ? (
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: "600",
                              color: "#475569",
                              marginBottom: "4px",
                            }}
                          >
                            Organization
                          </div>
                          <div
                            style={{
                              padding: "6px 8px",
                              background: "#f1f5f9",
                              borderRadius: "4px",
                              fontSize: "13px",
                            }}
                          >
                            {orgs[0].name}
                          </div>
                        </div>
                      ) : null,
                    )}
                  </ct-card>
                ) : null,
              )}

              {/* Generated Notes */}
              {derive(generatedNotes, (notes: string) =>
                notes ? (
                  <ct-card>
                    <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>
                      Agentic Notes
                    </h3>
                    <div
                      style={{
                        padding: "12px",
                        background: "#f8fafc",
                        borderRadius: "6px",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        whiteSpace: "pre-wrap",
                        maxHeight: "300px",
                        overflow: "auto",
                      }}
                    >
                      {notes}
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "11px",
                        color: "#94a3b8",
                      }}
                    >
                      Copy this to the person's notes field for reference
                    </div>
                  </ct-card>
                ) : null,
              )}
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
    };
  },
);

export default PersonResearchGmailAgent;
