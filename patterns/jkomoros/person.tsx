/// <cts-enable />
import {
  Cell,
  computed,
  Default,
  generateObject,
  handler,
  ifElse,
  NAME,
  navigateTo,
  type Opaque,
  patternTool,
  recipe,
  str,
  UI,
  wish,
} from "commontools";
import { type MentionableCharm } from "./lib/backlinks-index.tsx";
import { computeWordDiff, compareFields } from "./utils/diff-utils.ts";

// Performance measurement - set to true to see timing in console
const PERF_MEASURE = false;

// Social platform types
type SocialPlatform =
  | "twitter"
  | "instagram"
  | "linkedin"
  | "github"
  | "mastodon"
  | "facebook"
  | "tiktok"
  | "youtube";

type ContactType = "mobile" | "work" | "home";

// ============================================================================
// RELATIONSHIP TAXONOMY
// ============================================================================

// Relationship types - can have multiple, family modifiers stack with base types
type RelationshipType =
  // Professional
  | "colleague"
  | "former-colleague"
  | "manager"
  | "direct-report"
  | "mentor"
  | "mentee"
  | "client"
  | "vendor"
  | "investor"
  | "founder"
  | "advisor"
  | "recruiter"
  | "collaborator"
  // Personal
  | "friend"
  | "acquaintance"
  | "neighbor"
  | "classmate"
  | "roommate"
  | "ex-partner"
  | "online-friend"
  // Family - Base
  | "spouse"
  | "parent"
  | "child"
  | "grandparent"
  | "grandchild"
  | "sibling"
  | "aunt-uncle"
  | "niece-nephew"
  | "cousin"
  | "cousin-elder"
  | "cousin-younger"
  // Family - Modifiers (stack with base)
  | "in-law"
  | "step"
  | "half"
  | "adopted"
  // Family - Special
  | "chosen-family"
  // Service
  | "service-provider"
  | "support-contact";

// Closeness level - user-assigned, not agent-inferred
type Closeness = "intimate" | "close" | "casual" | "distant" | "dormant";

// How you met - can have multiple
type Origin =
  | "work"
  | "school"
  | "conference"
  | "online"
  | "neighborhood"
  | "community"
  | "mutual-friend"
  | "family-connection"
  | "dating"
  | "random";

// Gift-giving tier
type GiftTier = "gift-always" | "gift-occasions" | "gift-reciprocal" | "gift-none";

// Labels for display
const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  // Professional
  "colleague": "Colleague",
  "former-colleague": "Former Colleague",
  "manager": "Manager",
  "direct-report": "Direct Report",
  "mentor": "Mentor",
  "mentee": "Mentee",
  "client": "Client",
  "vendor": "Vendor",
  "investor": "Investor",
  "founder": "Founder",
  "advisor": "Advisor",
  "recruiter": "Recruiter",
  "collaborator": "Collaborator",
  // Personal
  "friend": "Friend",
  "acquaintance": "Acquaintance",
  "neighbor": "Neighbor",
  "classmate": "Classmate",
  "roommate": "Roommate",
  "ex-partner": "Ex-Partner",
  "online-friend": "Online Friend",
  // Family - Base
  "spouse": "Spouse",
  "parent": "Parent",
  "child": "Child",
  "grandparent": "Grandparent",
  "grandchild": "Grandchild",
  "sibling": "Sibling",
  "aunt-uncle": "Aunt/Uncle",
  "niece-nephew": "Niece/Nephew",
  "cousin": "Cousin",
  "cousin-elder": "Cousin (Elder)",
  "cousin-younger": "Cousin (Younger)",
  // Family - Modifiers
  "in-law": "In-Law",
  "step": "Step-",
  "half": "Half-",
  "adopted": "Adopted",
  // Family - Special
  "chosen-family": "Chosen Family",
  // Service
  "service-provider": "Service Provider",
  "support-contact": "Support Contact",
};

const CLOSENESS_LABELS: Record<Closeness, string> = {
  "intimate": "Intimate (inner circle)",
  "close": "Close",
  "casual": "Casual",
  "distant": "Distant",
  "dormant": "Dormant",
};

const ORIGIN_LABELS: Record<Origin, string> = {
  "work": "Work",
  "school": "School",
  "conference": "Conference/Event",
  "online": "Online",
  "neighborhood": "Neighborhood",
  "community": "Community",
  "mutual-friend": "Mutual Friend",
  "family-connection": "Family Connection",
  "dating": "Dating",
  "random": "Random/Serendipity",
};

const GIFT_TIER_LABELS: Record<GiftTier, string> = {
  "gift-always": "Always (birthday, holidays)",
  "gift-occasions": "Major Occasions Only",
  "gift-reciprocal": "Reciprocal (if they give)",
  "gift-none": "Cards/Greetings Only",
};

// Grouped relationship types for UI organization
const RELATIONSHIP_TYPE_GROUPS = {
  "Professional": [
    "colleague", "former-colleague", "manager", "direct-report",
    "mentor", "mentee", "client", "vendor", "investor",
    "founder", "advisor", "recruiter", "collaborator",
  ] as RelationshipType[],
  "Personal": [
    "friend", "acquaintance", "neighbor", "classmate",
    "roommate", "ex-partner", "online-friend",
  ] as RelationshipType[],
  "Family": [
    "spouse", "parent", "child", "grandparent", "grandchild",
    "sibling", "aunt-uncle", "niece-nephew",
    "cousin", "cousin-elder", "cousin-younger", "chosen-family",
  ] as RelationshipType[],
  "Family Modifiers": [
    "in-law", "step", "half", "adopted",
  ] as RelationshipType[],
  "Service": [
    "service-provider", "support-contact",
  ] as RelationshipType[],
};

// Items for ct-autocomplete relationship type picker
const RELATIONSHIP_TYPE_ITEMS = Object.entries(RELATIONSHIP_TYPE_GROUPS)
  .flatMap(([group, types]) => types.map((type) => ({
    value: type, label: RELATIONSHIP_TYPE_LABELS[type], group,
  })));

type EmailEntry = {
  type: ContactType;
  value: string;
};

type PhoneEntry = {
  type: ContactType;
  value: string;
};

type SocialLink = {
  platform: SocialPlatform;
  handle: string;
};

type ProfileData = {
  // Basic identity
  displayName?: Default<string, "">;
  givenName?: Default<string, "">;
  familyName?: Default<string, "">;
  nickname?: Default<string, "">;
  pronouns?: Default<string, "">;

  // Contact (for Phase 1, we'll only use first entry)
  emails?: Default<EmailEntry[], []>;
  phones?: Default<PhoneEntry[], []>;

  // Social
  socialLinks?: Default<SocialLink[], []>;

  // Metadata
  birthday?: Default<string, "">;
  tags?: Default<string[], []>;

  // Unstructured
  notes?: Default<string, "">;

  // Photo
  photoUrl?: Default<string, "">;

  // Relationship taxonomy
  relationshipTypes?: Default<RelationshipType[], []>;
  closeness?: Default<Closeness | "", "">;
  origins?: Default<Origin[], []>;
  giftTier?: Default<GiftTier | "", "">;

  // Quick flags
  innerCircle?: Default<boolean, false>;
  emergencyContact?: Default<boolean, false>;
  professionalReference?: Default<boolean, false>;
};

type Input = ProfileData;

/** Person profile with contact info and relationship data. #person */
type Output = ProfileData & {
  profile: ProfileData;
};

// Handler for charm link clicks
const handleCharmLinkClick = handler<
  {
    detail: {
      charm: Cell<MentionableCharm>;
    };
  },
  Record<string, never>
>(({ detail }, _) => {
  return navigateTo(detail.charm);
});

// Handler for new backlinks
const handleNewBacklink = handler<
  {
    detail: {
      text: string;
      charmId: any;
      charm: Cell<MentionableCharm>;
      navigate: boolean;
    };
  },
  {
    mentionable: Cell<MentionableCharm[]>;
  }
>(({ detail }, { mentionable }) => {
  console.log("new charm", detail.text, detail.charmId);

  if (detail.navigate) {
    return navigateTo(detail.charm);
  } else {
    mentionable.push(detail.charm as unknown as MentionableCharm);
  }
});

// Handler to update text fields
const updateField = handler<
  { detail: { value: string } },
  { field: Cell<string> }
>(
  ({ detail }, { field }) => {
    field.set(detail?.value ?? "");
  },
);

// Handler to update email
const updateEmail = handler<
  { detail: { value: string } },
  { emails: Cell<EmailEntry[]> }
>(
  ({ detail }, { emails }) => {
    const value = detail?.value ?? "";
    const current = emails.get();
    if (current.length === 0) {
      emails.set([{ type: "work", value }]);
    } else {
      const updated = [...current];
      updated[0] = { ...updated[0], value };
      emails.set(updated);
    }
  },
);

// Handler to update phone
const updatePhone = handler<
  { detail: { value: string } },
  { phones: Cell<PhoneEntry[]> }
>(
  ({ detail }, { phones }) => {
    const value = detail?.value ?? "";
    const current = phones.get();
    if (current.length === 0) {
      phones.set([{ type: "mobile", value }]);
    } else {
      const updated = [...current];
      updated[0] = { ...updated[0], value };
      phones.set(updated);
    }
  },
);

// Handler to update social media handle
const updateSocial = handler<
  { detail: { value: string } },
  { socialLinks: Cell<SocialLink[]>; platform: SocialPlatform }
>(
  ({ detail }, { socialLinks, platform }) => {
    const value = detail?.value ?? "";
    const current = socialLinks.get();
    const existingIndex = current.findIndex((link) =>
      link.platform === platform
    );

    const updated = [...current];
    if (existingIndex >= 0) {
      if (value === "") {
        // Remove if empty
        updated.splice(existingIndex, 1);
      } else {
        // Update existing
        updated[existingIndex] = { platform, handle: value };
      }
    } else if (value !== "") {
      // Add new
      updated.push({ platform, handle: value });
    }

    socialLinks.set(updated);
  },
);

// Handler to toggle an origin
const toggleOrigin = handler<
  Record<string, never>,
  { origins: Cell<Origin[]>; origin: Origin }
>(
  (_, { origins, origin }) => {
    const current = origins.get();
    const index = current.indexOf(origin);
    if (index >= 0) {
      const updated = [...current];
      updated.splice(index, 1);
      origins.set(updated);
    } else {
      origins.set([...current, origin]);
    }
  },
);

// Handler to remove a relationship type
const removeRelationshipType = handler<
  Record<string, never>,
  { relationshipTypes: Cell<RelationshipType[]>; typeToRemove: string }
>(
  (_, { relationshipTypes, typeToRemove }) => {
    const current = relationshipTypes.get() || [];
    relationshipTypes.set(current.filter((v) => v !== typeToRemove));
  },
);

// Handler to set closeness
const setCloseness = handler<
  { detail: { value: Closeness | "" } },
  { closeness: Cell<Closeness | ""> }
>(
  ({ detail }, { closeness }) => {
    closeness.set(detail.value);
  },
);

// Handler to set gift tier
const setGiftTier = handler<
  { detail: { value: GiftTier | "" } },
  { giftTier: Cell<GiftTier | ""> }
>(
  ({ detail }, { giftTier }) => {
    giftTier.set(detail.value);
  },
);

// Handler to toggle boolean flags
const toggleFlag = handler<
  Record<string, never>,
  { flag: Cell<boolean> }
>(
  (_, { flag }) => {
    flag.set(!flag.get());
  },
);

// Handler to trigger LLM extraction
const triggerExtraction = handler<
  Record<string, never>,
  { notes: string; extractTrigger: Cell<string> }
>(
  (_, { notes, extractTrigger }) => {
    // Add timestamp to ensure the trigger value always changes
    extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
  },
);

// Handler to cancel extraction (clear the result)
const cancelExtraction = handler<
  Record<string, never>,
  { extractedData: Cell<any> }
>(
  (_, { extractedData }) => {
    extractedData.set(null);
  },
);

// Handler to apply extracted data to profile fields
const applyExtractedData = handler<
  Record<string, never>,
  {
    extractedData: Cell<any>;
    displayName: Cell<string>;
    givenName: Cell<string>;
    familyName: Cell<string>;
    nickname: Cell<string>;
    pronouns: Cell<string>;
    emails: Cell<EmailEntry[]>;
    phones: Cell<PhoneEntry[]>;
    socialLinks: Cell<SocialLink[]>;
    birthday: Cell<string>;
    notes: Cell<string>;
  }
>(
  (
    _,
    {
      extractedData,
      displayName,
      givenName,
      familyName,
      nickname,
      pronouns,
      emails,
      phones,
      socialLinks,
      birthday,
      notes,
    },
  ) => {
    const data = extractedData.get();
    if (!data) return;

    // Apply extracted data to fields if provided
    if (data.displayName) displayName.set(data.displayName);
    if (data.givenName) givenName.set(data.givenName);
    if (data.familyName) familyName.set(data.familyName);
    if (data.nickname) nickname.set(data.nickname);
    if (data.pronouns) pronouns.set(data.pronouns);
    if (data.birthday) birthday.set(data.birthday);

    // Handle email
    if (data.email) {
      const currentEmails = emails.get();
      if (currentEmails.length === 0) {
        emails.set([{ type: "work", value: data.email }]);
      } else {
        const updated = [...currentEmails];
        updated[0] = { ...updated[0], value: data.email };
        emails.set(updated);
      }
    }

    // Handle phone
    if (data.phone) {
      const currentPhones = phones.get();
      if (currentPhones.length === 0) {
        phones.set([{ type: "mobile", value: data.phone }]);
      } else {
        const updated = [...currentPhones];
        updated[0] = { ...updated[0], value: data.phone };
        phones.set(updated);
      }
    }

    // Handle social links - only update if we have social data
    if (
      data.twitter || data.linkedin || data.github || data.instagram ||
      data.mastodon
    ) {
      const currentSocials = socialLinks.get();
      const updatedSocials = [...currentSocials];

      if (data.twitter) {
        const idx = updatedSocials.findIndex((l) => l && l.platform === "twitter");
        if (idx >= 0) {
          updatedSocials[idx] = { platform: "twitter", handle: data.twitter };
        } else {
          updatedSocials.push({ platform: "twitter", handle: data.twitter });
        }
      }

      if (data.linkedin) {
        const idx = updatedSocials.findIndex((l) => l && l.platform === "linkedin");
        if (idx >= 0) {
          updatedSocials[idx] = { platform: "linkedin", handle: data.linkedin };
        } else {
          updatedSocials.push({ platform: "linkedin", handle: data.linkedin });
        }
      }

      if (data.github) {
        const idx = updatedSocials.findIndex((l) => l && l.platform === "github");
        if (idx >= 0) {
          updatedSocials[idx] = { platform: "github", handle: data.github };
        } else {
          updatedSocials.push({ platform: "github", handle: data.github });
        }
      }

      if (data.instagram) {
        const idx = updatedSocials.findIndex((l) => l && l.platform === "instagram");
        if (idx >= 0) {
          updatedSocials[idx] = {
            platform: "instagram",
            handle: data.instagram,
          };
        } else {
          updatedSocials.push({
            platform: "instagram",
            handle: data.instagram,
          });
        }
      }

      if (data.mastodon) {
        const idx = updatedSocials.findIndex((l) => l && l.platform === "mastodon");
        if (idx >= 0) {
          updatedSocials[idx] = { platform: "mastodon", handle: data.mastodon };
        } else {
          updatedSocials.push({ platform: "mastodon", handle: data.mastodon });
        }
      }

      socialLinks.set(updatedSocials);
    }

    // Update notes to remaining content
    if (data.remainingNotes !== undefined) {
      notes.set(data.remainingNotes);
    }

    // Clear the extraction result to hide the preview
    extractedData.set(null);
  },
);

const Person = recipe<Input, Output>(
  "Person",
  ({
    displayName,
    givenName,
    familyName,
    nickname,
    pronouns,
    emails,
    phones,
    socialLinks,
    birthday,
    tags,
    notes,
    photoUrl,
    relationshipTypes,
    closeness,
    origins,
    giftTier,
    innerCircle,
    emergencyContact,
    professionalReference,
  }) => {
    // Set up mentionable charms for @ references
    const mentionable = wish<MentionableCharm[]>("#mentionable");
    const mentioned = Cell.of<MentionableCharm[]>([]);

    // The only way to serialize a pattern, apparently?
    const pattern = computed(() => JSON.stringify(Person));

    // Derive computed display name from first, nickname, and last name
    const computedDisplayName = computed(() => {
      const parts = [];
      if (givenName.trim()) parts.push(givenName.trim());
      if (nickname.trim()) parts.push(`'${nickname.trim()}'`);
      if (familyName.trim()) parts.push(familyName.trim());
      return parts.join(" ");
    });

    // Effective display name - use explicit displayName if set, otherwise computed
    const effectiveDisplayName = computed(() => {
      const name = displayName.trim() || computedDisplayName;
      return name || "(Untitled Person)";
    });

    // Create derived values for accessing array elements reactively
    const emailValue = computed(() => emails[0]?.value ?? "");
    const phoneValue = computed(() => phones[0]?.value ?? "");

    // Create derived values for each social platform
    const twitterHandle = computed(
      () => socialLinks.find((l) => l && l.platform === "twitter")?.handle ?? "",
    );
    const linkedinHandle = computed(
      () => socialLinks.find((l) => l && l.platform === "linkedin")?.handle ?? "",
    );
    const githubHandle = computed(
      () => socialLinks.find((l) => l && l.platform === "github")?.handle ?? "",
    );
    const instagramHandle = computed(
      () => socialLinks.find((l) => l && l.platform === "instagram")?.handle ?? "",
    );
    const mastodonHandle = computed(
      () => socialLinks.find((l) => l && l.platform === "mastodon")?.handle ?? "",
    );

    // Trigger for LLM extraction - cell that holds notes snapshot to extract
    const extractTrigger = Cell.of<string>("");

    // LLM extraction for notes - runs when trigger changes
    const { result: extractionResult, pending: extractionPending } =
      generateObject({
        system:
          `You are a profile data extraction assistant. Extract structured information from unstructured notes.

Extract the following fields if present:
- displayName: ONLY extract if there's a specific preferred name or nickname that differs from "First Last" format. If the person just goes by their first and last name, omit this field.
- givenName: First name
- familyName: Last name
- nickname: A nickname or shortened name the person goes by (e.g., "Bob" for Robert, "Alex" for Alexandra)
- pronouns: Pronouns (e.g., they/them, she/her, he/him)
- email: Email address
- phone: Phone number
- birthday: Birthday in YYYY-MM-DD format
- twitter: Twitter/X handle (without @)
- linkedin: LinkedIn URL or username
- github: GitHub username
- instagram: Instagram handle (without @)
- mastodon: Mastodon handle (with @user@instance)

Return only the fields you can confidently extract. Leave remainingNotes with any content that doesn't fit into structured fields.`,
        prompt: extractTrigger,
        model: "anthropic:claude-sonnet-4-5",
        schema: {
          type: "object",
          properties: {
            displayName: { type: "string" },
            givenName: { type: "string" },
            familyName: { type: "string" },
            nickname: { type: "string" },
            pronouns: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            birthday: { type: "string" },
            twitter: { type: "string" },
            linkedin: { type: "string" },
            github: { type: "string" },
            instagram: { type: "string" },
            mastodon: { type: "string" },
            remainingNotes: { type: "string" },
          },
        },
      });

    // Derive a summary of changes that will be made
    const changesPreview = computed(() => {
      const result = extractionResult;
      return compareFields(result, {
        displayName: { current: displayName, label: "Display Name" },
        givenName: { current: givenName, label: "First Name" },
        familyName: { current: familyName, label: "Last Name" },
        nickname: { current: nickname, label: "Nickname" },
        pronouns: { current: pronouns, label: "Pronouns" },
        birthday: { current: birthday, label: "Birthday" },
        email: { current: emailValue, label: "Email" },
        phone: { current: phoneValue, label: "Phone" },
        twitter: { current: twitterHandle, label: "Twitter" },
        linkedin: { current: linkedinHandle, label: "LinkedIn" },
        github: { current: githubHandle, label: "GitHub" },
        instagram: { current: instagramHandle, label: "Instagram" },
        mastodon: { current: mastodonHandle, label: "Mastodon" },
        remainingNotes: { current: notes, label: "Notes" },
      });
    });

    // Derive a boolean for whether we have results
    const hasExtractionResults = computed(() => {
      return changesPreview.length > 0;
    });

    // PERFORMANCE FIX: Pre-compute the word diff for Notes field OUTSIDE of .map() JSX
    // This prevents N² re-evaluation during recipe discovery when map items change.
    // See: patterns/jkomoros/design/todo/cpu-spike-investigation.md
    const notesDiffChunks = computed(() => {
      const t0 = PERF_MEASURE ? Date.now() : 0;
      const notesChange = changesPreview.find((c) => c.field === "Notes");
      if (!notesChange || !notesChange.from || !notesChange.to ||
          notesChange.from === "(empty)" || notesChange.to === "(empty)") {
        if (PERF_MEASURE) console.log(`[PERF] notesDiffChunks: skipped (no diff needed)`);
        return [];
      }
      const result = computeWordDiff(notesChange.from, notesChange.to);
      if (PERF_MEASURE) console.log(`[PERF] notesDiffChunks: ${Date.now() - t0}ms, ${result.length} chunks`);
      return result;
    });

    return {
      [NAME]: str`👤 ${effectiveDisplayName}`,
      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2>Person</h2>
          </div>

          {ifElse(
            hasExtractionResults,
            (
              // Show changes review modal
              <ct-vscroll flex showScrollbar>
                <ct-vstack
                  style={{
                    padding: "20px 16px",
                    gap: "12px",
                    maxWidth: "600px",
                    margin: "0 auto",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: "16px" }}>Review Extracted Changes</h3>
                  <p style={{ margin: 0, color: "#666", fontSize: "13px" }}>
                    The following changes will be applied to your profile:
                  </p>

                  <ct-vstack style={{ gap: "6px" }}>
                    {changesPreview.map((change) => (
                      <div
                        style={{
                          padding: "6px 10px",
                          background: "#f9fafb",
                          border: "1px solid #e5e7eb",
                          borderRadius: "4px",
                        }}
                      >
                        <ct-vstack style={{ gap: "2px" }}>
                          <strong style={{ fontSize: "12px" }}>
                            {change.field}
                          </strong>
                          {change.field === "Notes"
                            ? (
                              <div
                                style={{
                                  fontSize: "11px",
                                  lineHeight: "1.4",
                                  wordWrap: "break-word",
                                }}
                              >
                                {change.to === "(empty)"
                                  ? (
                                    <div
                                      style={{
                                        color: "#dc2626",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      Notes will be cleared
                                    </div>
                                  )
                                  : change.from === "(empty)"
                                  ? (
                                    <div style={{ color: "#16a34a" }}>
                                      {change.to}
                                    </div>
                                  )
                                  : change.from && change.to
                                  ? (
                                    // PERFORMANCE FIX: Use pre-computed notesDiffChunks
                                    // instead of inline computeWordDiff call
                                    // This reduces calls from N (one per charm instance) to 1
                                    notesDiffChunks.map(
                                      (part) => {
                                        if (part.type === "removed") {
                                          return (
                                            <span
                                              style={{
                                                color: "#dc2626",
                                                textDecoration: "line-through",
                                                backgroundColor: "#fee",
                                              }}
                                            >
                                              {part.word}
                                            </span>
                                          );
                                        } else if (part.type === "added") {
                                          return (
                                            <span
                                              style={{
                                                color: "#16a34a",
                                                backgroundColor: "#efe",
                                              }}
                                            >
                                              {part.word}
                                            </span>
                                          );
                                        } else {
                                          return <span>{part.word}</span>;
                                        }
                                      },
                                    )
                                  )
                                  : (
                                    <div
                                      style={{
                                        color: "#666",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      (no diff available)
                                    </div>
                                  )}
                              </div>
                            )
                            : (
                              <div
                                style={{ fontSize: "11px", lineHeight: "1.4" }}
                              >
                                <span
                                  style={{
                                    color: "#dc2626",
                                    textDecoration: "line-through",
                                    marginRight: "6px",
                                  }}
                                >
                                  {change.from}
                                </span>
                                <span style={{ color: "#16a34a" }}>
                                  {change.to}
                                </span>
                              </div>
                            )}
                        </ct-vstack>
                      </div>
                    ))}
                  </ct-vstack>

                  <ct-hstack
                    style={{
                      gap: "8px",
                      justifyContent: "flex-end",
                      marginTop: "12px",
                    }}
                  >
                    <ct-button
                      onClick={cancelExtraction({
                        extractedData: extractionResult,
                      })}
                    >
                      Cancel
                    </ct-button>
                    <ct-button
                      onClick={applyExtractedData({
                        extractedData: extractionResult,
                        displayName,
                        givenName,
                        familyName,
                        nickname,
                        pronouns,
                        emails,
                        phones,
                        socialLinks,
                        birthday,
                        notes,
                      })}
                    >
                      Accept Changes
                    </ct-button>
                  </ct-hstack>
                </ct-vstack>
              </ct-vscroll>
            ),
            (
              // Show normal profile form with two-pane layout
              <ct-autolayout tabNames={["Details", "Relationship", "Notes"]}>
                {/* Tab 1: Details - Form fields */}
                <ct-vscroll flex showScrollbar>
                  <ct-vstack style="padding: 16px; gap: 12px;">
                    {/* Basic Identity Section */}
                    <ct-vstack style="gap: 6px;">
                      <h3 style="margin: 0 0 4px 0; font-size: 14px;">Basic Information</h3>

                      <label>
                        Display Name
                        <ct-input
                          $value={displayName}
                          placeholder="How should we call you?"
                        />
                      </label>

                      <ct-hstack style="gap: 10px;">
                        <label style="flex: 1;">
                          First Name
                          <ct-input
                            $value={givenName}
                            placeholder="First name"
                          />
                        </label>

                        <label style="flex: 1;">
                          Nickname
                          <ct-input
                            $value={nickname}
                            placeholder="Optional"
                          />
                        </label>

                        <label style="flex: 1;">
                          Last Name
                          <ct-input
                            $value={familyName}
                            placeholder="Last name"
                          />
                        </label>
                      </ct-hstack>

                      <label>
                        Pronouns
                        <ct-input
                          $value={pronouns}
                          placeholder="e.g., they/them, she/her, he/him"
                        />
                      </label>

                      <label>
                        Birthday
                        <ct-input
                          $value={birthday}
                          placeholder="YYYY-MM-DD"
                        />
                      </label>
                    </ct-vstack>

                    {/* Contact Section */}
                    <ct-vstack style="gap: 6px;">
                      <h3 style="margin: 0 0 4px 0; font-size: 14px;">Contact Information</h3>

                      <label>
                        Email
                        <ct-input
                          value={emailValue}
                          onct-input={updateEmail({ emails })}
                          placeholder="email@example.com"
                        />
                      </label>

                      <label>
                        Phone
                        <ct-input
                          value={phoneValue}
                          onct-input={updatePhone({ phones })}
                          placeholder="+1 (555) 123-4567"
                        />
                      </label>
                    </ct-vstack>

                    {/* Social Media Section */}
                    <ct-vstack style="gap: 6px;">
                      <h3 style="margin: 0 0 4px 0; font-size: 14px;">Social Media</h3>

                      <label>
                        Twitter / X
                        <ct-input
                          value={twitterHandle}
                          onct-input={updateSocial({
                            socialLinks,
                            platform: "twitter",
                          })}
                          placeholder="@username"
                        />
                      </label>

                      <label>
                        LinkedIn
                        <ct-input
                          value={linkedinHandle}
                          onct-input={updateSocial({
                            socialLinks,
                            platform: "linkedin",
                          })}
                          placeholder="linkedin.com/in/username"
                        />
                      </label>

                      <label>
                        GitHub
                        <ct-input
                          value={githubHandle}
                          onct-input={updateSocial({
                            socialLinks,
                            platform: "github",
                          })}
                          placeholder="github.com/username"
                        />
                      </label>

                      <label>
                        Instagram
                        <ct-input
                          value={instagramHandle}
                          onct-input={updateSocial({
                            socialLinks,
                            platform: "instagram",
                          })}
                          placeholder="@username"
                        />
                      </label>

                      <label>
                        Mastodon
                        <ct-input
                          value={mastodonHandle}
                          onct-input={updateSocial({
                            socialLinks,
                            platform: "mastodon",
                          })}
                          placeholder="@user@instance.social"
                        />
                      </label>
                    </ct-vstack>
                  </ct-vstack>
                </ct-vscroll>

                {/* Tab 2: Relationship */}
                <ct-vscroll flex showScrollbar>
                  <ct-vstack style="padding: 16px; gap: 16px;">
                    {/* Relationship Types Section */}
                    <ct-vstack style="gap: 8px;">
                      <h3 style="margin: 0; font-size: 14px;">Relationship Type</h3>
                      <p style="margin: 0; font-size: 12px; color: #666;">
                        Select all that apply. Family modifiers (in-law, step, etc.) stack with base types.
                      </p>

                      {/* Selected relationship type tags */}
                      <div style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        minHeight: "32px",
                      }}>
                        {relationshipTypes.map((type: RelationshipType) => (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 8px",
                              backgroundColor: "#e0e7ff",
                              color: "#3730a3",
                              borderRadius: "9999px",
                              fontSize: "12px",
                            }}
                          >
                            {RELATIONSHIP_TYPE_LABELS[type] || type}
                            <button
                              onClick={removeRelationshipType({
                                relationshipTypes,
                                typeToRemove: String(type),
                              })}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "14px",
                                height: "14px",
                                padding: "0",
                                border: "none",
                                background: "transparent",
                                color: "#6366f1",
                                cursor: "pointer",
                                fontSize: "14px",
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>

                      {/* Autocomplete for adding relationship types - uses $value two-way binding */}
                      <ct-autocomplete
                        items={RELATIONSHIP_TYPE_ITEMS}
                        $value={relationshipTypes}
                        multiple={true}
                        placeholder="Search to add..."
                      />
                    </ct-vstack>

                    {/* Closeness Section */}
                    <ct-vstack style="gap: 6px;">
                      <h3 style="margin: 0; font-size: 14px;">Closeness</h3>
                      <ct-select
                        $value={closeness}
                        items={[
                          { label: "Not set", value: "" },
                          ...Object.entries(CLOSENESS_LABELS).map(([value, label]) => ({
                            label,
                            value,
                          })),
                        ]}
                      />
                    </ct-vstack>

                    {/* Origin Section */}
                    <ct-vstack style="gap: 8px;">
                      <h3 style="margin: 0; font-size: 14px;">How You Met</h3>
                      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        {Object.entries(ORIGIN_LABELS).map(([origin, label]) => (
                          <ct-button
                            size="sm"
                            variant={computed(() =>
                              (origins as unknown as Origin[]).includes(origin as Origin) ? "primary" : "secondary"
                            )}
                            onClick={toggleOrigin({
                              origins,
                              origin: origin as Origin,
                            })}
                          >
                            {label}
                          </ct-button>
                        ))}
                      </div>
                    </ct-vstack>

                    {/* Gift Tier Section */}
                    <ct-vstack style="gap: 6px;">
                      <h3 style="margin: 0; font-size: 14px;">Gift Giving</h3>
                      <ct-select
                        $value={giftTier}
                        items={[
                          { label: "Not set", value: "" },
                          ...Object.entries(GIFT_TIER_LABELS).map(([value, label]) => ({
                            label,
                            value,
                          })),
                        ]}
                      />
                    </ct-vstack>

                    {/* Quick Flags Section */}
                    <ct-vstack style="gap: 8px;">
                      <h3 style="margin: 0; font-size: 14px;">Quick Flags</h3>
                      <ct-vstack style="gap: 6px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                          <input
                            type="checkbox"
                            checked={innerCircle}
                            onChange={toggleFlag({ flag: innerCircle })}
                          />
                          <span style="font-size: 13px;">Inner Circle (would drop everything for them)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                          <input
                            type="checkbox"
                            checked={emergencyContact}
                            onChange={toggleFlag({ flag: emergencyContact })}
                          />
                          <span style="font-size: 13px;">Emergency Contact</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                          <input
                            type="checkbox"
                            checked={professionalReference}
                            onChange={toggleFlag({ flag: professionalReference })}
                          />
                          <span style="font-size: 13px;">Professional Reference</span>
                        </label>
                      </ct-vstack>
                    </ct-vstack>
                  </ct-vstack>
                </ct-vscroll>

                {/* Tab 3: Notes editor */}
                <ct-vstack style="height: 100%; gap: 8px; padding: 16px;">
                  <h3 style="margin: 0; font-size: 14px;">Notes</h3>
                  <ct-code-editor
                    $value={notes}
                    $mentionable={mentionable}
                    $mentioned={mentioned}
                    $pattern={pattern}
                    onbacklink-click={handleCharmLinkClick({})}
                    onbacklink-create={handleNewBacklink({ mentionable })}
                    language="text/markdown"
                    theme="light"
                    wordWrap
                    tabIndent
                    placeholder="Add any additional information here..."
                    style="flex: 1;"
                  />
                  <ct-button
                    onClick={triggerExtraction({ notes, extractTrigger })}
                    disabled={extractionPending}
                  >
                    {extractionPending
                      ? "Extracting..."
                      : "Extract Data from Notes"}
                  </ct-button>
                </ct-vstack>
              </ct-autolayout>
            ),
          )}
        </ct-screen>
      ),
      // TODO: Re-enable after fixing infinite loop issue
      // Make this charm discoverable via wish("#person")
      // "#person": true,

      displayName,
      givenName,
      familyName,
      nickname,
      pronouns,
      emails,
      phones,
      socialLinks,
      birthday,
      tags,
      notes,
      photoUrl,
      relationshipTypes,
      closeness,
      origins,
      giftTier,
      innerCircle,
      emergencyContact,
      professionalReference,
      profile: {
        displayName,
        givenName,
        familyName,
        nickname,
        pronouns,
        emails,
        phones,
        socialLinks,
        birthday,
        tags,
        notes,
        photoUrl,
        relationshipTypes,
        closeness,
        origins,
        giftTier,
        innerCircle,
        emergencyContact,
        professionalReference,
      },
      triggerExtraction: triggerExtraction({ notes, extractTrigger }),
      // Pattern tools for omnibot
      getContactInfo: patternTool(
        ({ displayName, emails, phones }: { displayName: string; emails: EmailEntry[]; phones: PhoneEntry[] }) => {
          return computed(() => {
            const parts = [`Name: ${displayName || "Not provided"}`];
            if (emails && emails.length > 0) {
              parts.push(`Email: ${emails[0].value}`);
            }
            if (phones && phones.length > 0) {
              parts.push(`Phone: ${phones[0].value}`);
            }
            return parts.join("\n");
          });
        },
        { displayName: effectiveDisplayName, emails, phones }
      ),
      searchNotes: patternTool(
        ({ query, notes }: { query: string; notes: string }) => {
          return computed(() => {
            if (!query || !notes) return [];
            return notes.split("\n").filter((line) =>
              line.toLowerCase().includes(query.toLowerCase())
            );
          });
        },
        { notes }
      ),
      getSocialLinks: patternTool(
        ({ socialLinks }: { socialLinks: SocialLink[] }) => {
          return computed(() => {
            if (!socialLinks || socialLinks.length === 0) return "No social media links";
            return socialLinks.map((link) => `${link.platform}: ${link.handle}`).join("\n");
          });
        },
        { socialLinks }
      ),
    };
  },
);

export default Person;
