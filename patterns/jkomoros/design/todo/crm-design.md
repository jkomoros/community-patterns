# Personal CRM Pattern Design - PRD

**Goal:** Design a personal CRM system in the CommonTools pattern framework. This PRD is structured for framework author review - please critique what won't work, suggest more idiomatic approaches, and flag expensive operations.

---

## Part 1: Current Airtable Workflow (For Context)

### What I Have Today

**Scale:** ~2,000 people, ~6,750 interactions, ~430 companies, ~3,500 email addresses

### Core Entities

**People** - The central record
- Name (computed from First + Last), email addresses (multiple per person), company links
- Tags (140+ categories: PM, SWE, AI, Mentor, Investor, etc.)
- Closeness (7-tier scale from "Any time" to "Not even close to connected")
- "Introduced By" (self-referential link to another Person)
- Notes, LinkedIn URL, location

**Interactions** - Every touchpoint
- Date, Type (1:1 VC, Group Meeting, Email, Phone, Coffee, etc.)
- Links to multiple People (many-to-many)
- `Calendar Event ID` for idempotency with Google Calendar sync
- Notes, Action Items (though I rarely use these)
- Status flags: Didn't Actually Happen, Initiated By Other

**Companies** (I call them Organizations)
- Name, Tags (Investor, Possible Investor, BigTech, VC, etc.)
- Links to current/former employees
- Investment interest levels

**Emails** - Separate table for email addresses
- Email address, linked Person, Primary flag, Work/Personal flag
- `Missing Person Interactions` - backlink for reconciliation

### The Calendar Sync Workflow (Key Automation)

This is the core workflow I want to replicate:

```
┌─────────────────┐
│ Google Calendar │
│  Event Created  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ For each attendee email:                │
│                                         │
│   Email exists with Person linked?      │
│     YES → Add Person to Interaction     │
│     NO  → Add to "Missing People"       │
│                                         │
│   Email doesn't exist at all?           │
│     → Create Email record               │
│     → Add to "Missing People"           │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Interaction Record Created              │
│ • Calendar Event ID (for idempotency)   │
│ • People: [matched contacts]            │
│ • Missing People: [unmatched emails]    │
└─────────────────────────────────────────┘
         │
         │ (Later, user manually links Email → Person)
         ▼
┌─────────────────────────────────────────┐
│ Email Reconciliation Automation         │
│                                         │
│ When Email.Person is set:               │
│   • Find all Interactions where this    │
│     Email was in Missing People         │
│   • Move Person to Interaction.People   │
│   • Remove from Missing People          │
└─────────────────────────────────────────┘
```

**Key insight:** Calendar Event IDs are stable - same event always maps to same Interaction, enabling updates without duplicates.

### Computed/Rollup Fields I Use

On Person records (computed from Interactions):
- `Last Meeting` - MAX(Interaction.Date) where Person is linked
- `Last F2F Meeting` - MAX(Interaction.Date) where Type contains "F2F"
- Interaction count

### What I DON'T Actively Use (Can Skip)

- Meeting queue / snooze system (was built but dormant)
- Recruiting pipeline fields
- Community membership tracking (FLUX, ITW)
- Action items / follow-up tracking on Interactions

---

## Part 2: Framework Constraints (As I Understand Them)

| Constraint | Impact |
|------------|--------|
| **JSON-serializable only** | No Set/Map/Date objects in cells |
| **Scale: ~1000-5000 records/charm** | Need strategy for 2000 people, 6750 interactions |
| **Self-referential wish = infinite loop** | Pattern cannot export AND wish for same tag |
| **No cross-charm queries** | Must aggregate via wish in dashboard |
| **Pull-based calendar sync** | bgUpdater runs ~60s intervals, no webhooks |
| **UI: 200+ items = CPU spike** | Pagination required everywhere |

**Questions for framework author:**
1. Is 2000+ contacts in a single charm viable, or must we shard?
2. Can `wish()` handle discovering 2000 charms efficiently?
3. Best pattern for many-to-many (Interaction ↔ People)?

---

## Part 3: Proposed Architecture

### Entity Patterns

```
┌─────────────────────────────────────────────────────────────┐
│                    CRM Dashboard                             │
│  - wish("#crmContact") → people                             │
│  - wish("#crmInteraction") → interactions                   │
│  - wish("#crmOrganization") → organizations                 │
│  - wish("#calendarEvents") → calendar (existing pattern)    │
│  - COMPUTES: relationship metrics, unknown attendees        │
│  - Does NOT export any of these tags (avoids self-ref)      │
└─────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│crm-contact   │ │interaction   │ │organization  │ │google-cal-   │
│(#crmContact) │ │(#crmInter-   │ │(#crmOrg)     │ │importer      │
│              │ │action)       │ │              │ │(existing)    │
│- Person data │ │- Date, type  │ │- Name, tags  │ │              │
│- Emails[]    │ │- People IDs  │ │- Investor    │ │              │
│- Org link    │ │- Calendar ID │ │  interest    │ │              │
│- Closeness   │ │- Notes       │ │- Employee    │ │              │
│- Tags        │ │              │ │  links       │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Key Design Decision: Store ALL Interactions

Every interaction is stored as a charm, whether from calendar or manual entry:
- Calendar-sourced interactions have `calendarEventId` for idempotency
- Manual interactions (coffee, email) have no `calendarEventId`
- Calendar sync creates/updates interactions, doesn't just compute them

**Why:** Allows adding notes/context to any interaction later, even calendar ones.

---

## Part 4: Data Models

### crm-contact.tsx

```typescript
type EmailEntry = {
  value: string;
  type: "work" | "personal" | "other";
  isPrimary: boolean;
};

type Closeness = "intimate" | "close" | "casual" | "distant" | "dormant";

interface CrmContactInput {
  // Identity
  displayName: Default<string, "">;
  givenName: Default<string, "">;
  familyName: Default<string, "">;

  // Contact - multiple emails for calendar matching
  emails: Default<EmailEntry[], []>;

  // Organization link (by name or ID?)
  organization: Default<string, "">;  // Q: How to link to another charm?

  // Categorization
  tags: Default<string[], []>;
  closeness: Default<Closeness | "", "">;

  // Relationship
  introducedBy: Default<string, "">;  // Q: Can we reference another #crmContact?

  // Professional
  linkedInUrl: Default<string, "">;

  // Notes (with @ mentions?)
  notes: Default<string, "">;
}

/** CRM Contact. #crmContact */
interface CrmContactOutput extends CrmContactInput {
  fullName: string;  // Computed
  primaryEmail: string | null;  // Computed
  // Q: Can we compute lastContactDate here, or only in dashboard?
}
```

**Questions for framework author:**
1. How should `organization` link to an Organization charm? Store charm ID? Use wish?
2. Can `introducedBy` reference another Person? Self-referential wish issue?
3. Can computed fields like `lastContactDate` live on the Person, or must be in dashboard?

### interaction.tsx

```typescript
type InteractionType =
  | "1:1-vc" | "1:1-f2f"           // One-on-one
  | "group-vc" | "group-f2f"       // Group meetings
  | "email" | "text" | "phone"     // Async
  | "coffee" | "lunch" | "event"   // Informal
  | "other";

interface InteractionInput {
  // Core
  date: Default<string, "">;  // ISO date string
  type: Default<InteractionType, "1:1-vc">;

  // People involved - Q: Best way to link to multiple Person charms?
  personEmails: Default<string[], []>;  // Using email as stable ID
  personNames: Default<string[], []>;   // Denormalized for display

  // Calendar integration
  calendarEventId: Default<string, "">;  // Empty = manual entry
  calendarTitle: Default<string, "">;

  // Content
  notes: Default<string, "">;

  // Status
  didNotHappen: Default<boolean, false>;
  initiatedByOther: Default<boolean, false>;
}

/** Interaction record. #crmInteraction */
interface InteractionOutput extends InteractionInput {
  isF2F: boolean;  // Computed from type
  isCalendarSourced: boolean;  // Computed: calendarEventId !== ""
}
```

**Questions for framework author:**
1. Many-to-many: Interaction links to multiple People. Is `personEmails[]` the right approach?
2. Should we store person charm IDs instead of emails?
3. Any way to get bidirectional linking (Person knows their Interactions)?

### organization.tsx

```typescript
type InvestorInterest = "none" | "watching" | "interested" | "very-interested";

interface OrganizationInput {
  name: Default<string, "">;

  // Categorization
  tags: Default<string[], []>;  // "Investor", "VC", "BigTech", "Portco", etc.

  // Investment tracking
  investorInterest: Default<InvestorInterest, "none">;

  // Notes
  notes: Default<string, "">;

  // Q: How to track current/former employees?
  // Option A: Store person emails here
  // Option B: Each Person stores their org, we compute employees in dashboard
}

/** Organization record. #crmOrganization */
interface OrganizationOutput extends OrganizationInput {
  // Q: Can we compute employeeCount here?
}
```

**Questions for framework author:**
1. Current/Former employees: Store on Org, or derive from Person.organization?
2. If derived, can Org charm access Person data, or only dashboard can?

---

## Part 5: Calendar Sync Workflow

### Option A: Sync Handler in Dashboard

```typescript
// Dashboard has a "Sync Calendar" button that:
// 1. Gets calendar events from wish("#calendarEvents")
// 2. Gets all contacts from wish("#crmContact")
// 3. Gets all interactions from wish("#crmInteraction")
// 4. For each calendar event:
//    - Check if interaction with this calendarEventId exists
//    - If not, create new Interaction charm
//    - If yes, update it (attendees may have changed)
// 5. Match attendees to contacts via email

const syncCalendar = handler<unknown, SyncState>(async (_, state) => {
  const { calendarEvents, contacts, interactions } = state;

  // Build email -> person lookup
  const personByEmail: Record<string, Person> = {};
  for (const contact of contacts) {
    for (const email of contact.emails) {
      personByEmail[email.value.toLowerCase()] = contact;
    }
  }

  // Build existing interaction lookup by calendar ID
  const interactionByCalId: Record<string, Interaction> = {};
  for (const interaction of interactions) {
    if (interaction.calendarEventId) {
      interactionByCalId[interaction.calendarEventId] = interaction;
    }
  }

  // Process calendar events
  for (const event of calendarEvents) {
    const existing = interactionByCalId[event.id];

    // Match attendees
    const matchedEmails: string[] = [];
    const matchedNames: string[] = [];
    const unmatchedEmails: string[] = [];

    for (const attendee of event.attendees || []) {
      const person = personByEmail[attendee.email.toLowerCase()];
      if (person) {
        matchedEmails.push(attendee.email);
        matchedNames.push(person.fullName);
      } else {
        unmatchedEmails.push(attendee.email);
      }
    }

    if (existing) {
      // Update existing interaction
      // Q: How do we update another charm from a handler?
    } else {
      // Create new interaction
      // Q: How do we create a new charm from a handler?
    }
  }
});
```

**Critical questions for framework author:**
1. Can a handler CREATE new charms? How?
2. Can a handler UPDATE another charm's cells?
3. Should calendar sync be in dashboard, or separate "sync" pattern?

### Option B: bgUpdater in Separate Sync Pattern

Have a dedicated `crm-calendar-sync.tsx` pattern that:
- Runs in background via `bgUpdater`
- Creates/updates Interaction charms automatically

**Question:** Is this possible? Can bgUpdater create other charms?

---

## Part 6: Unknown Attendee Handling

In Airtable, unknown attendees are stored in a "Missing People" field on the Interaction, then reconciled when the email→person mapping is created.

### Proposed Approach

```typescript
// In Interaction, store unmatched emails
interface InteractionInput {
  // ... other fields ...
  unmatchedEmails: Default<string[], []>;  // Emails we couldn't match
}

// Dashboard computes aggregate of all unmatched emails
const unknownAttendees = derive(interactions, (list) => {
  const counts: Record<string, number> = {};
  for (const interaction of list) {
    for (const email of interaction.unmatchedEmails || []) {
      counts[email] = (counts[email] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count);
});
```

**When user creates a Contact for an unknown email:**
- Need to update all Interactions that had this email in `unmatchedEmails`
- Move email to `personEmails`, add name to `personNames`

**Question:** How do we bulk-update Interactions when a new Contact is created?

---

## Part 7: Computed Relationship Metrics

### In Dashboard (Safe Approach)

```typescript
// Dashboard computes per-person metrics
const personMetrics = derive(
  { contacts, interactions },
  ({ contacts, interactions }) => {
    return contacts.map(contact => {
      const email = contact.primaryEmail?.toLowerCase();
      const personInteractions = interactions.filter(i =>
        i.personEmails.some(e => e.toLowerCase() === email)
      );

      const sorted = [...personInteractions]
        .sort((a, b) => b.date.localeCompare(a.date));

      return {
        contactId: email,
        displayName: contact.fullName,
        lastContactDate: sorted[0]?.date || null,
        interactionCount: personInteractions.length,
        // ... more metrics
      };
    });
  }
);
```

### Ideal: On Person Charm Directly

Would be nice if Person charm could show its own `lastContactDate`, but this requires:
- Person wishing for Interactions that reference it
- Self-referential wish problem?

**Question:** Any way to have computed fields on Person that depend on Interactions?

---

## Part 8: Implementation Phases

### Phase 1: Core Patterns
- [ ] `crm-contact.tsx` - Person records
- [ ] `organization.tsx` - Company records
- [ ] `interaction.tsx` - Interaction records

### Phase 2: Dashboard
- [ ] `crm-dashboard.tsx` - Orchestrator
- [ ] Email→Person matching
- [ ] Person metrics computation
- [ ] Unknown attendees display

### Phase 3: Calendar Sync
- [ ] Sync button/handler
- [ ] Idempotent create/update of Interactions
- [ ] Attendee matching

### Phase 4: Reconciliation
- [ ] Create Contact from unknown email
- [ ] Update Interactions when Contact created

---

## Part 9: Open Questions Summary

1. **Scale:** Is 2000 contacts + 6750 interactions viable in single charms?
2. **Cross-charm links:** How to link Person→Organization? Store ID? Use wish?
3. **Many-to-many:** Best pattern for Interaction↔People relationship?
4. **Creating charms:** Can a handler create new charms programmatically?
5. **Updating charms:** Can a handler update cells in another charm?
6. **Bidirectional:** Can Person know its Interactions without self-ref loop?
7. **Computed on entity:** Can Person.lastContactDate be computed from Interactions?
8. **Bulk updates:** How to update many Interactions when Contact is created?

---

## Appendix: Existing Assets

- **`person.tsx`** (1370 lines): Rich contact pattern - can simplify for CRM
- **`google-calendar-importer.tsx`** (897 lines): Calendar sync with attendees, bgUpdater
