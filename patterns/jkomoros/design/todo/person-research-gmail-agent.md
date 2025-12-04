# Person Research Gmail Agent - Design Document

## Overview

A pattern that uses Gmail to research information about a person. Given a name (and optionally a linked person.tsx charm), it searches Gmail for emails involving that person and extracts structured information.

## Goals

**Phase 1 (Current):**
- Take a person's name as input
- Search Gmail for emails from/to/mentioning that person
- Produce a text blob with findings that can be appended to a person's notes field
- Output format: Brief summary with footnoted sources

**Future Vision:**
- Link to a person.tsx instance and write results directly
- Show evidence and reasoning for each finding
- Accept/reject flow similar to person.tsx extraction
- Track confidence levels per finding

---

## Person Linkage: Option C - Wish Discovery + Picker

### How It Works

1. **person.tsx exports `#person` tag** (requires adding to person.tsx)
2. **Research pattern calls `wish("#person")`**
3. **If multiple person charms exist**, the new `wish.tsx` pattern renders with `ct-picker`
4. **User selects which person to research** from the picker
5. **Pattern reads selected person's name/email** to build search context
6. **Agent searches Gmail** and reports findings
7. **Output is a text blob** user can copy to person's notes (or link cells)

### Why This Approach

- **Leverages new ct-picker**: When wish has multiple candidates, picker UI appears automatically
- **No manual linking needed**: Just wish for `#person` and pick from results
- **Fallback to manual entry**: If no person charms exist, user can type name manually
- **Future-proof**: Can later auto-write results back via cell linkage

### Required Changes to person.tsx

```typescript
// Add to person.tsx output to make it discoverable via wish
return {
  [NAME]: str`👤 ${effectiveDisplayName}`,
  [UI]: (...),
  // ... existing outputs ...

  // NEW: Add tag for wish discovery
  // This makes the charm discoverable via wish("#person")
  "#person": true,  // or just export as a schema annotation
};
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Person Research Gmail Agent                                     │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ wish("#person")                                             │ │
│ │                                                             │ │
│ │ If 0 results: Show "Enter name manually" input              │ │
│ │ If 1 result: Auto-select that person                        │ │
│ │ If 2+ results: ct-picker appears for user selection         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Selected Person Context                                     │ │
│ │ - personName: "Sarah Chen"                                  │ │
│ │ - knownEmail: "sarah@acme.com" (if available)               │ │
│ │ - contextNotes: "colleague from Project Phoenix"            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ GmailAgenticSearch (base pattern)                           │ │
│ │ - Searches: from:{email}, to:{email}, "{name}", etc.        │ │
│ │ - Tools: reportEmailAddress, reportPhoneNumber,             │ │
│ │          reportRelationshipType, reportTopic                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Output: Agentic Notes (text blob)                           │ │
│ │                                                             │ │
│ │ ## Research: Sarah Chen                                     │ │
│ │ **Email:** sarah@acme.com [1]                               │ │
│ │ **Phone:** +1-415-555-0123 [2]                              │ │
│ │ **Relationship:** colleague                                 │ │
│ │ **Topics:** Project Phoenix, React, team planning           │ │
│ │ ---                                                         │ │
│ │ [1] From header, "Re: Phoenix kickoff" (2023-01-15)         │ │
│ │ [2] Signature, "Weekly sync notes" (2023-06-20)             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Information to Extract

| Field | Source | Notes |
|-------|--------|-------|
| Email addresses | From/To/CC headers | May find multiple |
| Phone numbers | Email signatures, body | Regex pattern matching |
| Communication frequency | Email count, date range | "frequent" vs "rare" |
| Relationship type | Subject/body analysis | From closed set of tags |
| Last contacted | Most recent email date | |
| Topics discussed | Subject lines, body | Top 3-5 themes |
| Company/organization | Email domain, signatures | |

---

## Relationship Taxonomy (Final Design)

This taxonomy is designed for person.tsx and informs what the Gmail agent can/should infer.

### Design Principles

1. **Multi-dimensional**: Type, closeness, origin, and gift tier are independent
2. **Composable**: Family modifiers stack with base types (`sibling` + `in-law` = brother-in-law)
3. **Multiple tags allowed**: People wear many hats (`colleague` + `friend`)
4. **Agent vs User**: Agent infers type; user sets closeness, gift tier, flags

---

### Dimension 1: Relationship Types (34 base + 4 modifiers)

#### Professional (13 tags)
| Tag | Description |
|-----|-------------|
| `colleague` | Current coworker |
| `former-colleague` | Past coworker |
| `manager` | Your boss (current or past) |
| `direct-report` | Reports to you |
| `mentor` | Advises your career/life |
| `mentee` | You advise them |
| `client` | You serve them |
| `vendor` | They serve you |
| `investor` | Invested in you/your company |
| `founder` | Founder you work with |
| `advisor` | Board/informal advisor |
| `recruiter` | HR/recruiting |
| `collaborator` | Project-based, cross-org |

#### Personal (7 tags)
| Tag | Description |
|-----|-------------|
| `friend` | Actual friend |
| `acquaintance` | Know them, not close |
| `neighbor` | Geographic proximity |
| `classmate` | School/university |
| `roommate` | Lived together |
| `ex-partner` | Former romantic partner |
| `online-friend` | Met/primarily interact online |

#### Family - Base Types (10 tags)
| Tag | Description |
|-----|-------------|
| `spouse` | Married/life partner |
| `parent` | Your mother/father |
| `child` | Your son/daughter |
| `grandparent` | |
| `grandchild` | |
| `sibling` | Brother/sister |
| `aunt-uncle` | Parent's sibling |
| `niece-nephew` | Sibling's child |
| `cousin` | Same generation (parent's sibling's child) |
| `cousin-elder` | Parent's generation (parent's cousin) |
| `cousin-younger` | Child's generation (your cousin's kids) |

#### Family - Modifiers (4 tags) - Stack with base types
| Modifier | Compatible With | Example |
|----------|-----------------|---------|
| `in-law` | All family types | `sibling` + `in-law` = brother/sister-in-law |
| `step` | parent, child, sibling, grandparent, grandchild | `parent` + `step` = stepmom/stepdad |
| `half` | sibling only | `sibling` + `half` = half-sister |
| `adopted` | All family types | `child` + `adopted` = adopted son |

#### Family - Special (1 tag)
| Tag | Description |
|-----|-------------|
| `chosen-family` | Not blood, but family |

#### Service (2 tags)
| Tag | Description |
|-----|-------------|
| `service-provider` | Doctor, lawyer, accountant |
| `support-contact` | Customer service at a company |

---

### Dimension 2: Closeness (user-assigned, not agent-inferred)

| Level | Meaning | Behaviors |
|-------|---------|-----------|
| `intimate` | Core inner circle | Share everything, drop everything for them |
| `close` | Important relationship | Regular meaningful contact, know their life |
| `casual` | Friendly but bounded | Occasional contact, enjoy seeing them |
| `distant` | Aware of each other | See at events, minimal contact |
| `dormant` | Was closer, not anymore | Might reconnect someday |

**Key insight:** Closeness is independent of type.
- `cousin` + `intimate` = Favorite cousin, like a sibling
- `cousin` + `distant` = See at holidays, that's it
- `colleague` + `intimate` = Work spouse / best friend
- `sibling` + `dormant` = Estranged sibling

---

### Dimension 3: Origin / Context (how you met)

| Origin | Example |
|--------|---------|
| `work` | Met through job |
| `school` | School/university |
| `conference` | Event/conference |
| `online` | Internet (Twitter, Discord, etc.) |
| `neighborhood` | Live near each other |
| `community` | Church, club, org |
| `mutual-friend` | Introduced by someone |
| `family-connection` | Through family |
| `dating` | Met romantically |
| `random` | Serendipity |

Can have multiple: "Met at work → became friends → now neighbors"

---

### Dimension 4: Gift Tier (practical, user-assigned)

| Tier | Meaning | Examples |
|------|---------|----------|
| `gift-always` | Always give gifts (birthday, holiday) | Spouse, kids, parents, close friends |
| `gift-occasions` | Major occasions only (wedding, graduation) | Extended family, regular friends |
| `gift-reciprocal` | Only if they give first | Colleagues, acquaintances |
| `gift-none` | Cards/greetings only | Distant relatives, professional contacts |

---

### Dimension 5: Quick Flags (optional booleans)

| Flag | Question it Answers |
|------|---------------------|
| `innerCircle` | Would I drop everything if they called? |
| `emergencyContact` | Call in emergency? |
| `professionalReference` | Would I use them as a job reference? |

---

### Full TypeScript Schema

```typescript
interface RelationshipData {
  // How I know them (can have multiple)
  types: RelationshipType[];

  // How close we are (single value, user-assigned)
  closeness: "intimate" | "close" | "casual" | "distant" | "dormant";

  // How we met (can have multiple)
  origins: Origin[];

  // Gift relationship (user-assigned)
  giftTier: "gift-always" | "gift-occasions" | "gift-reciprocal" | "gift-none";

  // Quick flags
  innerCircle?: boolean;
  emergencyContact?: boolean;
  professionalReference?: boolean;
}

type RelationshipType =
  // Professional
  | "colleague" | "former-colleague" | "manager" | "direct-report"
  | "mentor" | "mentee" | "client" | "vendor" | "investor"
  | "founder" | "advisor" | "recruiter" | "collaborator"
  // Personal
  | "friend" | "acquaintance" | "neighbor" | "classmate"
  | "roommate" | "ex-partner" | "online-friend"
  // Family - Base
  | "spouse" | "parent" | "child" | "grandparent" | "grandchild"
  | "sibling" | "aunt-uncle" | "niece-nephew"
  | "cousin" | "cousin-elder" | "cousin-younger"
  // Family - Modifiers (stack with base)
  | "in-law" | "step" | "half" | "adopted"
  // Family - Special
  | "chosen-family"
  // Service
  | "service-provider" | "support-contact";

type Origin =
  | "work" | "school" | "conference" | "online"
  | "neighborhood" | "community" | "mutual-friend"
  | "family-connection" | "dating" | "random";
```

---

### What the Gmail Agent Can Infer

| Dimension | Agent Can Infer? | Notes |
|-----------|------------------|-------|
| Relationship type | ✅ Partially | Professional vs personal, broad category |
| Specific family type | ❌ No | "Parent" vs "cousin" not in emails |
| Closeness | ❌ No | Email frequency ≠ emotional closeness |
| Origin | ⚠️ Sometimes | Work email domain suggests `work` origin |
| Gift tier | ❌ No | Cultural, personal decision |
| Flags | ❌ No | User decision |

**Agent strategy:** Suggest relationship type with confidence level, let user refine everything else.

---

## Disambiguation Design

The agent receives context from the selected person profile and any manual input:

```typescript
interface SearchContext {
  personName: string;           // From person.displayName or manual input
  knownEmail?: string;          // From person.emails[0] if available
  contextNotes?: string;        // From person.notes or manual "my friend from college"
}
```

### When Agent Finds Multiple Matches

If searching for "John Smith" finds emails from multiple different John Smiths:

1. **Agent clusters by email domain/address**
2. **Reports ambiguity in output:**

```markdown
⚠️ **Multiple matches found for "John Smith":**

1. **john.smith@acme.com** - 15 emails, work topics (projects, meetings)
2. **johnsmith42@gmail.com** - 3 emails, personal topics (dinner, weekend)

💡 To disambiguate, add context like "works at Acme Corp" or provide email address.
```

3. **If context available**, agent uses it to filter:
   - Context: "my colleague from Acme" → focuses on john.smith@acme.com
   - Context: "friend from college" → focuses on johnsmith42@gmail.com

---

## Output Format

### Phase 1: Brief with Footnotes

```markdown
## Agentic Research: Sarah Chen

**Contact Info:**
- Email: sarah.chen@acme.com [1]
- Phone: +1-415-555-0123 [2]

**Communication:**
- Frequency: Regular (23 emails over 2 years)
- Last contact: Nov 15, 2024 [3]

**Relationship:** colleague (high confidence)
- Reasoning: Work domain, project discussions, professional tone [4]

**Topics:** Project Phoenix, React architecture, team planning

---
**Sources:**
[1] From header, "Re: Phoenix kickoff" (Jan 15, 2023)
[2] Email signature, "Weekly sync notes" (Jun 20, 2023)
[3] "Re: Quick question about deploy" (Nov 15, 2024)
[4] Analyzed 23 emails: all work-related subjects, @acme.com domain
```

### Future Ideal State: Interactive Review UI

```
┌────────────────────────────────────────────────────────────┐
│ Research Results: Sarah Chen                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Email: sarah.chen@acme.com                    ✓ HIGH   │ │
│ │ ┌─────────────────────────────────────────────────────┐│ │
│ │ │ [✓ Accept] [✗ Reject] [📧 View Evidence (3)]       ││ │
│ │ └─────────────────────────────────────────────────────┘│ │
│ │ Evidence:                                              │ │
│ │   • From: header in "Re: Phoenix kickoff" (Jan 2023)   │ │
│ │   • From: header in "Weekly sync" (Jun 2023)           │ │
│ │   • CC: in "Team announcement" (Aug 2023)              │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Phone: +1-415-555-0123                        ◐ MEDIUM │ │
│ │ ┌─────────────────────────────────────────────────────┐│ │
│ │ │ [✓ Accept] [✗ Reject] [📧 View Evidence (1)]       ││ │
│ │ └─────────────────────────────────────────────────────┘│ │
│ │ Evidence:                                              │ │
│ │   • Signature block: "Mobile: +1-415-555-0123"         │ │
│ │   • Found in "Weekly sync notes" (Jun 2023)            │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Relationship: colleague                       ✓ HIGH   │ │
│ │ ┌─────────────────────────────────────────────────────┐│ │
│ │ │ [✓ Accept] [✗ Reject] [📧 View Evidence (23)]      ││ │
│ │ └─────────────────────────────────────────────────────┘│ │
│ │ Reasoning: Work domain (@acme.com), professional tone, │ │
│ │ project discussions, shared with other colleagues      │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ──────────────────────────────────────────────────────     │
│ [Accept All Selected] [Copy as Notes] [Link to Person]     │
└────────────────────────────────────────────────────────────┘
```

---

## Suggested Gmail Queries

```typescript
const PERSON_RESEARCH_QUERIES = [
  // Direct email queries (if email known)
  'from:{email}',
  'to:{email}',

  // Name searches
  '"{firstName} {lastName}"',
  'from:*{lastName}*',
  'subject:"{name}"',

  // Signature mining (for contact info)
  'from:{email} "phone" OR "mobile" OR "cell"',
  'from:{email} "linkedin" OR "twitter" OR "github"',

  // Recent communication
  'from:{email} newer_than:1y',
  'to:{email} newer_than:1y',
];
```

---

## Input/Output Types

```typescript
interface PersonResearchInput {
  // Manual entry (fallback if no wish result)
  personName?: Default<string, "">;
  knownEmail?: Default<string, "">;
  contextNotes?: Default<string, "">; // "my friend from college"

  // From wish("#person") selection - auto-populated
  selectedPerson?: Cell<PersonCharm | null>;

  // Agent config
  maxSearches?: Default<number, 10>;

  // Agent state
  isScanning?: Default<boolean, false>;
  lastScanAt?: Default<number, 0>;

  // Results
  findings?: Default<PersonFindings, {...}>;
  agenticNotes?: Default<string, "">;
}

interface PersonFindings {
  emailAddresses: Array<{
    value: string;
    confidence: "high" | "medium" | "low";
    sources: Array<{ emailId: string; subject: string; date: string; context: string }>;
  }>;

  phoneNumbers: Array<{
    value: string;
    confidence: "high" | "medium" | "low";
    sources: Array<{ emailId: string; subject: string; date: string; context: string }>;
  }>;

  communicationFrequency: {
    totalEmails: number;
    dateRange: { earliest: string; latest: string };
    frequency: "frequent" | "regular" | "occasional" | "rare";
  };

  relationshipType: {
    primary: string;  // from the 26-tag closed set
    confidence: "high" | "medium" | "low";
    reasoning: string;
  };

  topicsDiscussed: Array<{ topic: string; mentions: number }>;

  organization?: {
    name: string;
    confidence: "high" | "medium" | "low";
    source: string;
  };

  disambiguationNeeded?: {
    candidates: Array<{ email: string; emailCount: number; description: string }>;
    message: string;
  };
}

interface PersonResearchOutput extends PersonResearchInput {
  // Also expose for linking
  findings: PersonFindings;
  agenticNotes: string;
}
```

---

## Implementation Plan

### Step 1: Add `#person` tag to person.tsx
- Simple change: add schema annotation or output flag

### Step 2: Create `person-research-gmail-agent.tsx`
- Start in `patterns/jkomoros/WIP/`
- Use `GmailAgenticSearch` as base
- Implement wish("#person") with fallback to manual entry
- Create custom tools: `reportEmailAddress`, `reportPhoneNumber`, etc.
- Generate markdown output with footnotes

### Step 3: Test
- Deploy with a test person charm
- Verify wish picker works with multiple person charms
- Test disambiguation behavior
- Verify output format

### Step 4: Iterate
- Add more sophisticated agent prompts
- Improve relationship detection
- Add topic extraction

---

## Related Files

- `gmail-agentic-search.tsx` - Base pattern
- `favorite-foods-gmail-agent.tsx` - Example of using base
- `hotel-membership-gmail-agent.tsx` - Another example
- `person.tsx` - Target for research output (needs `#person` tag)
- `person-roadmap.md` - Vision for person enhancements
- `/Users/alex/Code/labs/packages/patterns/wish.tsx` - Wish picker implementation
- `/Users/alex/Code/labs/packages/ui/src/v2/components/ct-picker/ct-picker.ts` - Picker component

---

## Notes from User Discussion

1. **Relationship tags:** Using closed set of 26 tags (awaiting user feedback on final list)
2. **Person linkage:** Option C with wish("#person") + ct-picker for selection
3. **Disambiguation:** Agent clusters by email, reports ambiguity, uses context for filtering
4. **Output format:** Brief with footnotes for Phase 1; future UI with accept/reject per finding
5. **Search scope:** All time, sent mail included, ~10 searches by default
