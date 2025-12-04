/// <cts-enable />
import {
  Cell,
  cell,
  Default,
  derive,
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

// Handler to toggle a relationship type
const toggleRelationshipType = handler<
  { detail: { type: RelationshipType } },
  { relationshipTypes: Cell<RelationshipType[]> }
>(
  ({ detail }, { relationshipTypes }) => {
    const type = detail.type;
    const current = relationshipTypes.get();
    const index = current.indexOf(type);
    if (index >= 0) {
      // Remove it
      const updated = [...current];
      updated.splice(index, 1);
      relationshipTypes.set(updated);
    } else {
      // Add it
      relationshipTypes.set([...current, type]);
    }
  },
);

// Handler to toggle an origin
const toggleOrigin = handler<
  { detail: { origin: Origin } },
  { origins: Cell<Origin[]> }
>(
  ({ detail }, { origins }) => {
    const origin = detail.origin;
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
    const mentioned = cell<MentionableCharm[]>([]);

    // The only way to serialize a pattern, apparently?
    const pattern = derive(undefined, () => JSON.stringify(Person));

    // Derive computed display name from first, nickname, and last name
    const computedDisplayName = derive(
      [givenName, familyName, nickname],
      ([first, last, nick]) => {
        const parts = [];
        if (first.trim()) parts.push(first.trim());
        if (nick.trim()) parts.push(`'${nick.trim()}'`);
        if (last.trim()) parts.push(last.trim());
        return parts.join(" ");
      },
    );

    // Effective display name - use explicit displayName if set, otherwise computed
    const effectiveDisplayName = derive(
      [displayName, computedDisplayName],
      ([explicit, computed]) => {
        const name = explicit.trim() || computed;
        return name || "(Untitled Person)";
      },
    );

    // Create derived values for accessing array elements reactively
    const emailValue = derive(emails, (arr) => arr[0]?.value ?? "");
    const phoneValue = derive(phones, (arr) => arr[0]?.value ?? "");

    // Create derived values for each social platform
    const twitterHandle = derive(
      socialLinks,
      (links) => links.find((l) => l && l.platform === "twitter")?.handle ?? "",
    );
    const linkedinHandle = derive(
      socialLinks,
      (links) => links.find((l) => l && l.platform === "linkedin")?.handle ?? "",
    );
    const githubHandle = derive(
      socialLinks,
      (links) => links.find((l) => l && l.platform === "github")?.handle ?? "",
    );
    const instagramHandle = derive(
      socialLinks,
      (links) => links.find((l) => l && l.platform === "instagram")?.handle ?? "",
    );
    const mastodonHandle = derive(
      socialLinks,
      (links) => links.find((l) => l && l.platform === "mastodon")?.handle ?? "",
    );

    // Trigger for LLM extraction - cell that holds notes snapshot to extract
    const extractTrigger = cell<string>("");

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
    const changesPreview = derive(
      {
        extractionResult,
        displayName,
        givenName,
        familyName,
        nickname,
        pronouns,
        birthday,
        emailValue,
        phoneValue,
        twitterHandle,
        linkedinHandle,
        githubHandle,
        instagramHandle,
        mastodonHandle,
        notes,
      },
      ({
        extractionResult: result,
        displayName: currentDisplayName,
        givenName: currentGivenName,
        familyName: currentFamilyName,
        nickname: currentNickname,
        pronouns: currentPronouns,
        birthday: currentBirthday,
        emailValue: currentEmail,
        phoneValue: currentPhone,
        twitterHandle: currentTwitter,
        linkedinHandle: currentLinkedin,
        githubHandle: currentGithub,
        instagramHandle: currentInstagram,
        mastodonHandle: currentMastodon,
        notes: currentNotes,
      }) => {
        return compareFields(result, {
          displayName: { current: currentDisplayName, label: "Display Name" },
          givenName: { current: currentGivenName, label: "First Name" },
          familyName: { current: currentFamilyName, label: "Last Name" },
          nickname: { current: currentNickname, label: "Nickname" },
          pronouns: { current: currentPronouns, label: "Pronouns" },
          birthday: { current: currentBirthday, label: "Birthday" },
          email: { current: currentEmail, label: "Email" },
          phone: { current: currentPhone, label: "Phone" },
          twitter: { current: currentTwitter, label: "Twitter" },
          linkedin: { current: currentLinkedin, label: "LinkedIn" },
          github: { current: currentGithub, label: "GitHub" },
          instagram: { current: currentInstagram, label: "Instagram" },
          mastodon: { current: currentMastodon, label: "Mastodon" },
          remainingNotes: { current: currentNotes, label: "Notes" },
        });
      },
    );

    // Derive a boolean for whether we have results
    const hasExtractionResults = derive(
      changesPreview,
      (changes) => changes.length > 0,
    );

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
                                    computeWordDiff(change.from, change.to).map(
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

                      {Object.entries(RELATIONSHIP_TYPE_GROUPS).map(([groupName, types]) => (
                        <ct-vstack style="gap: 4px;">
                          <strong style="font-size: 12px; color: #444;">{groupName}</strong>
                          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            {types.map((type) => (
                              <ct-button
                                size="small"
                                variant={derive(relationshipTypes, (arr) =>
                                  arr.includes(type) ? "primary" : "secondary"
                                )}
                                onClick={() => {
                                  const current = relationshipTypes.get();
                                  const index = current.indexOf(type);
                                  if (index >= 0) {
                                    const updated = [...current];
                                    updated.splice(index, 1);
                                    relationshipTypes.set(updated);
                                  } else {
                                    relationshipTypes.set([...current, type]);
                                  }
                                }}
                              >
                                {RELATIONSHIP_TYPE_LABELS[type]}
                              </ct-button>
                            ))}
                          </div>
                        </ct-vstack>
                      ))}
                    </ct-vstack>

                    {/* Closeness Section */}
                    <ct-vstack style="gap: 6px;">
                      <h3 style="margin: 0; font-size: 14px;">Closeness</h3>
                      <ct-select
                        $value={closeness}
                        placeholder="How close are you?"
                      >
                        <option value="">Not set</option>
                        {Object.entries(CLOSENESS_LABELS).map(([value, label]) => (
                          <option value={value}>{label}</option>
                        ))}
                      </ct-select>
                    </ct-vstack>

                    {/* Origin Section */}
                    <ct-vstack style="gap: 8px;">
                      <h3 style="margin: 0; font-size: 14px;">How You Met</h3>
                      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        {Object.entries(ORIGIN_LABELS).map(([origin, label]) => (
                          <ct-button
                            size="small"
                            variant={derive(origins, (arr) =>
                              arr.includes(origin as Origin) ? "primary" : "secondary"
                            )}
                            onClick={() => {
                              const current = origins.get();
                              const index = current.indexOf(origin as Origin);
                              if (index >= 0) {
                                const updated = [...current];
                                updated.splice(index, 1);
                                origins.set(updated);
                              } else {
                                origins.set([...current, origin as Origin]);
                              }
                            }}
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
                        placeholder="Do you exchange gifts?"
                      >
                        <option value="">Not set</option>
                        {Object.entries(GIFT_TIER_LABELS).map(([value, label]) => (
                          <option value={value}>{label}</option>
                        ))}
                      </ct-select>
                    </ct-vstack>

                    {/* Quick Flags Section */}
                    <ct-vstack style="gap: 8px;">
                      <h3 style="margin: 0; font-size: 14px;">Quick Flags</h3>
                      <ct-vstack style="gap: 6px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                          <input
                            type="checkbox"
                            checked={innerCircle}
                            onChange={() => innerCircle.set(!innerCircle.get())}
                          />
                          <span style="font-size: 13px;">Inner Circle (would drop everything for them)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                          <input
                            type="checkbox"
                            checked={emergencyContact}
                            onChange={() => emergencyContact.set(!emergencyContact.get())}
                          />
                          <span style="font-size: 13px;">Emergency Contact</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                          <input
                            type="checkbox"
                            checked={professionalReference}
                            onChange={() => professionalReference.set(!professionalReference.get())}
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
      // Make this charm discoverable via wish("#person")
      "#person": true,

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
          return derive({ displayName, emails, phones }, ({ displayName, emails, phones }) => {
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
          return derive({ query, notes }, ({ query, notes }) => {
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
          return derive(socialLinks, (links) => {
            if (!links || links.length === 0) return "No social media links";
            return links.map((link) => `${link.platform}: ${link.handle}`).join("\n");
          });
        },
        { socialLinks }
      ),
    };
  },
);

export default Person;
