# PRD: Shared Gmail Search Strings for Gmail Agents

## Overview

Enable gmail-agent pattern subclasses to share effective search queries with the community, creating a crowdsourced knowledge base of what queries work well for different agent types.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMMUNITY AGGREGATOR CHARM                        │
│         Space: community-patterns-shared                             │
│         Discovery: wish({ query: "#gmailSearchRegistry" })           │
│         Note: Can't name charms directly, so rely on tag + favorite  │
│                                                                      │
│  searchStrings: {                                                    │
│    [agentTypeUrl: string]: {                                        │
│      queries: Array<{                                                │
│        query: string;           // The Gmail search string           │
│        description?: string;    // Why it works                      │
│        submittedBy?: string;    // Optional attribution              │
│        upvotes: number;         // Community validation              │
│        submittedAt: number;     // Timestamp                         │
│      }>                                                              │
│    }                                                                 │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ wish({ query: "#gmailSearchRegistry" })
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                    GMAIL AGENT INSTANCE                              │
│                (e.g., hotel-membership-gmail-agent)                  │
│                                                                      │
│  agentTypeUrl: "https://raw.githubusercontent.com/anthropics/..."   │
│                                                                      │
│  localQueries: Array<{        // Private to this charm instance     │
│    query: string;                                                    │
│    description?: string;                                             │
│    shareStatus: "private" | "pending_review" | "submitted";         │
│    effectiveness?: number;    // How well it worked (0-5)           │
│  }>                                                                  │
│                                                                      │
│  pendingSubmissions: Array<{  // Queries flagged for sharing        │
│    query: string;                                                    │
│    sanitizedQuery?: string;   // LLM-cleaned version                │
│    piiWarnings?: string[];    // What PII was detected              │
│    userApproved: boolean;                                            │
│  }>                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Decisions (from user input)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data location | Single community space | Simpler discovery, one registry to rule them all |
| Agent identification | GitHub raw URL | Unique, verifiable, includes version context |
| Submission flow | Automatic with approval | Low friction + user control |
| Fallback behavior | Prompt to create | Guides users to set up the ecosystem |
| PII protection | LLM + manual review | Defense in depth |
| Local storage | In the agent charm | Each agent manages its own query history |
| Aggregator scope | Single global | Maximum knowledge sharing |

## Data Models

### Community Registry Charm

```typescript
interface SharedQuery {
  id: string;                    // Unique ID
  query: string;                 // The Gmail search string
  description?: string;          // Why it works / what it finds
  submittedBy?: string;          // Optional: user identifier
  submittedAt: number;           // Timestamp
  upvotes: number;               // Community validation count
  downvotes: number;             // Reports of ineffectiveness
  lastValidated?: number;        // Last time someone confirmed it works
}

interface AgentTypeRegistry {
  agentTypeUrl: string;          // GitHub raw URL to pattern file
  agentTypeName?: string;        // Human-readable name
  queries: SharedQuery[];
}

interface GmailSearchRegistryOutput {
  registries: Record<string, AgentTypeRegistry>;  // Keyed by agentTypeUrl

  // Actions
  submitQuery: handler;          // Submit a new query
  upvoteQuery: handler;          // Upvote existing query
  downvoteQuery: handler;        // Report ineffective query
}
```

### Agent-Side Storage

```typescript
interface LocalQuery {
  id: string;
  query: string;
  description?: string;
  createdAt: number;
  lastUsed?: number;
  useCount: number;
  effectiveness: number;         // 0-5 rating
  shareStatus: "private" | "pending_review" | "submitted";
}

interface PendingSubmission {
  localQueryId: string;
  originalQuery: string;
  sanitizedQuery: string;        // After LLM PII removal
  piiWarnings: string[];         // What was detected/removed
  userApproved: boolean;
  submittedAt?: number;
}

// Added to GmailAgenticSearchInput
interface GmailAgenticSearchInput {
  // ... existing fields ...

  // NEW: Shared search string support
  agentTypeUrl?: Default<string, "">;  // GitHub raw URL for this agent type
  localQueries?: Default<LocalQuery[], []>;
  pendingSubmissions?: Default<PendingSubmission[], []>;
  enableCommunityQueries?: Default<boolean, true>;
}
```

## User Flows

### Flow 1: Discovering Community Queries

```
1. Agent starts up
2. If enableCommunityQueries=true:
   a. wish({ query: "#gmailSearchRegistry" })
   b. If found:
      - Extract queries for this agentTypeUrl
      - Merge with suggestedQueries (community queries marked as such)
   c. If not found:
      - Show subtle prompt: "Connect to community queries?"
      - If user accepts, navigate to create/find registry
3. Agent shows combined query suggestions to LLM
```

### Flow 2: Auto-flagging Queries for Sharing

```
1. Agent's searchGmail tool executes a query
2. If query returns results AND user takes action on results:
   a. Record query in localQueries with effectiveness score
   b. If effectiveness >= threshold (e.g., 3/5):
      - Auto-add to pendingSubmissions with shareStatus="pending_review"
      - Run LLM PII screening on query
      - Store sanitizedQuery and piiWarnings
3. User sees badge: "3 queries ready to share"
```

### Flow 3: Reviewing & Submitting Queries

```
1. User clicks "Review queries to share" button
2. UI shows list of pendingSubmissions:
   - Original query (if different from sanitized)
   - Sanitized query (editable)
   - PII warnings (what was changed)
   - Checkbox to approve
3. User reviews each:
   - Can edit sanitizedQuery further
   - Can mark as "keep private" (moves back to localQueries)
   - Can approve for submission
4. On "Submit approved":
   - Write to community registry via handler
   - Update shareStatus="submitted" in localQueries
```

### Flow 4: PII Screening

```
LLM Prompt for PII Detection:
---
Analyze this Gmail search query for personally identifiable information (PII).

Query: "{query}"

Check for and flag:
- Email addresses (from:*, to:*)
- Personal names
- Company names that might identify the user
- Specific dates that could identify events
- Account numbers, confirmation codes
- Any other identifying information

Return:
{
  "hasPII": boolean,
  "piiFound": string[],  // List of PII items found
  "sanitizedQuery": string,  // Query with PII replaced with generic terms
  "confidence": number  // 0-1 confidence in detection
}

Example:
Input: "from:john.smith@acme.com subject:invoice 12345"
Output: {
  "hasPII": true,
  "piiFound": ["email: john.smith@acme.com", "possible ID: 12345"],
  "sanitizedQuery": "from:*@*.com subject:invoice",
  "confidence": 0.9
}
---
```

## Component Architecture

### New Pattern: gmail-search-registry.tsx

```typescript
// Community registry charm - deployed to a shared space
// Tagged with #gmailSearchRegistry for wish() discovery

interface RegistryInput {
  registries: Default<Record<string, AgentTypeRegistry>, {}>;
}

export default pattern<RegistryInput, RegistryOutput>(({ registries }) => {
  // Handlers for submit, upvote, downvote
  // UI for browsing/searching queries
  // Export registries for cross-space access
});
```

### Modified: gmail-agentic-search.tsx

```typescript
// Add to GmailAgenticSearchInput:
agentTypeUrl?: Default<string, "">;
localQueries?: Default<LocalQuery[], []>;
pendingSubmissions?: Default<PendingSubmission[], []>;
enableCommunityQueries?: Default<boolean, true>;

// Add to pattern body:
// 1. Wish for community registry
const registryWish = wish<GmailSearchRegistry>({ query: "#gmailSearchRegistry" });

// 2. Merge community + local + suggested queries
const allSuggestedQueries = derive([
  suggestedQueries,
  localQueries,
  registryWish,
  agentTypeUrl
], ([suggested, local, registry, url]) => {
  const community = registry?.result?.registries?.[url]?.queries || [];
  return [
    ...suggested,
    ...local.filter(q => q.effectiveness >= 3).map(q => q.query),
    ...community.slice(0, 10).map(q => q.query),  // Top 10 community
  ];
});

// 3. Track query effectiveness
// (in searchGmail handler, record which queries found results)

// 4. PII screening for pending submissions
// (generateObject call when queries flagged for sharing)

// 5. UI components for review/submit flow
```

### Subclass Pattern Changes (e.g., hotel-membership-gmail-agent.tsx)

```typescript
// Add agentTypeUrl to identify this agent type
const AGENT_TYPE_URL = "https://raw.githubusercontent.com/anthropics/community-patterns/main/patterns/jkomoros/hotel-membership-gmail-agent.tsx";

const searcher = GmailAgenticSearch({
  // ... existing config ...
  agentTypeUrl: AGENT_TYPE_URL,
  enableCommunityQueries: true,
});
```

## UI Components

### 1. Community Queries Badge (in agent UI)

```
┌─────────────────────────────────────────┐
│ Community Suggestions (12 available)    │
│ [View] [Disable]                        │
└─────────────────────────────────────────┘
```

### 2. Pending Submissions Review

```
┌─────────────────────────────────────────┐
│ Share Your Discoveries (3 pending)      │
├─────────────────────────────────────────┤
│ ☑ "from:marriott.com subject:points"   │
│   ⚠️ No PII detected                    │
│                                         │
│ ☑ "from:hilton subject:statement"      │
│   ⚠️ No PII detected                    │
│                                         │
│ ☐ "from:rewards@hyatt.com confirm"     │
│   ⚠️ Sanitized: removed specific domain│
│   Original: from:rewards@hyatt.com...   │
│   [Edit sanitized version]              │
│                                         │
│ [Submit Selected] [Keep All Private]    │
└─────────────────────────────────────────┘
```

### 3. Local Query Library

```
┌─────────────────────────────────────────┐
│ My Saved Queries                        │
├─────────────────────────────────────────┤
│ ⭐⭐⭐⭐⭐ "from:marriott subject:points" │
│          Used 5 times, last: 2 days ago │
│          [Share] [Delete]               │
│                                         │
│ ⭐⭐⭐☆☆ "subject:hotel confirmation"   │
│          Used 2 times, last: 1 week ago │
│          [Share] [Delete]               │
└─────────────────────────────────────────┘
```

## Cross-Space Considerations

### Well-Known Space

- **Space name**: `community-patterns-shared`
- **Purpose**: Hosts community-wide shared resources (starting with gmail search registry)
- **Access**: Anyone can read via wish(), writing requires the registry charm's handlers

### Registry Discovery

```typescript
// Wish for the registry - works cross-space
// The registry charm lives in space "community-patterns-shared" and is tagged #gmailSearchRegistry
const registryWish = wish<GmailSearchRegistry>({ query: "#gmailSearchRegistry" });

// IMPORTANT: Embed in JSX to trigger cross-space charm startup (CT-1090 workaround)
<div style={{ display: "none" }}>{registryWish}</div>

// Access registry data
const communityQueries = derive(registryWish, (wr) => {
  return wr?.result?.registries?.[agentTypeUrl]?.queries || [];
});
```

### Bootstrap Problem

Since we can't name charms directly, the first-time setup requires:
1. Someone deploys `gmail-search-registry.tsx` to space `community-patterns-shared`
2. They favorite the charm with tag `#gmailSearchRegistry`
3. **Each user must also favorite the registry** for wish() to find it (wish currently only searches user's favorites)
4. Other users can then discover it via wish()

**IMPORTANT for first-time setup**: When creating the registry, document clearly:
- The space name: `community-patterns-shared`
- The required tag: `#gmailSearchRegistry`
- Instructions for users to favorite the registry charm

**Mitigation**: The "prompt to create" flow should guide users through this if no registry found.

> **TODO**: Future framework enhancement will support wish() queries that don't require favorites (e.g., wish by space + tag directly). Once available, update this to remove the "each user must favorite" requirement.

### Registry Not Found Flow

```typescript
const registryState = derive(registryWish, (wr) => {
  if (wr?.result) return "connected";
  if (wr?.error) return "not_found";
  return "loading";
});

// Show prompt to create if not found
{ifElse(
  derive(registryState, s => s === "not_found"),
  <div>
    <p>No community query registry found.</p>
    <ct-button onClick={createRegistry}>
      Create Community Registry
    </ct-button>
  </div>,
  null
)}
```

### Writing to Cross-Space Registry

```typescript
// The registry charm exposes a submitQuery handler
// We call it via the wished charm reference
const submitToCommunity = handler<
  { query: string; description?: string },
  { registry: Cell<GmailSearchRegistry>; agentTypeUrl: Cell<string> }
>(async (input, state) => {
  const reg = state.registry.get();
  if (!reg?.submitQuery) return { error: "Registry not available" };

  // Call the registry's handler
  // This writes to the registry's cells in its space
  return reg.submitQuery({
    agentTypeUrl: state.agentTypeUrl.get(),
    query: input.query,
    description: input.description,
  });
});
```

## Open Questions

1. **Versioning**: What happens when agent patterns evolve? Should agentTypeUrl include commit hash or branch?
   - Recommendation: Use `main` branch URL, trust that query semantics are stable

2. **Moderation**: How to handle spam/abuse in the community registry?
   - Recommendation: Start with upvote/downvote, add moderation later if needed

3. **Query Deduplication**: How to handle near-duplicate queries?
   - Recommendation: Exact match dedup initially, fuzzy matching as enhancement

4. **Offline/Disconnected**: What if user is offline?
   - Recommendation: Local queries work offline, community sync when online

5. **Registry Permissions**: Who can write to the registry?
   - Recommendation: Anyone can submit, registry is append-only with voting

## Implementation Phases

### Phase 1: Local Query Tracking
- Add localQueries to gmail-agentic-search.tsx
- Track query usage and effectiveness
- UI to view/manage local queries
- No community features yet

### Phase 2: PII Screening
- Add generateObject-based PII detection
- Implement pendingSubmissions flow
- UI for reviewing sanitized queries

### Phase 3: Community Registry
- Create gmail-search-registry.tsx pattern
- Implement wish-based discovery
- Submit/read queries from registry
- Basic upvote/downvote

### Phase 4: Polish
- "Registry not found" prompts
- Query effectiveness tracking from community
- Better deduplication
- Moderation tools if needed

## Success Metrics

1. **Adoption**: % of agent instances with enableCommunityQueries=true
2. **Contribution**: Queries submitted per agent type per week
3. **Quality**: Average upvote ratio on submitted queries
4. **Privacy**: PII detection rate (should catch most, few false negatives)
5. **Utility**: Do agents with community queries perform better?

---

## Implementation Status

### Completed (2024-12-06)

**Phase 1: Local Query Tracking** ✅
- Added `LocalQuery` type with effectiveness rating (0-5)
- Auto-track queries in `searchGmail` handler
- "My Saved Queries" UI with star ratings and delete
- Share status tracking: private → pending_review → submitted

**Phase 2: Privacy & Generalizability Screening** ✅
- LLM-based screening via `generateObject`
- Detects PII: emails, names, account numbers, identifiers
- Detects generalizability issues: personal domains, local businesses
- Recommendation system: share / share_with_edits / do_not_share
- Editable sanitized query field

**Phase 3: Community Registry** ✅
- Created `gmail-search-registry.tsx` pattern
- Registries keyed by agent type (GitHub raw URL)
- Submit, upvote, downvote handlers
- Browsable UI with stats

**Phase 4: Integration** ✅
- Wish-based registry discovery via `#gmailSearchRegistry`
- Combined query suggestions in agent prompt
- Submit approved queries to registry button
- Registry status feedback

### Remaining Work

**Phase 5: Polish** (TODO)
- [ ] Test end-to-end with real Gmail accounts
- [ ] Deploy registry to community-patterns-shared space
- [ ] Document setup instructions for users
- [ ] Add upvote/downvote UI in gmail agents for community queries
- [ ] Consider: query deduplication improvements
- [ ] Consider: moderation tools for registry

---

## Setup Instructions

### For Registry Operator (one-time)

1. Deploy `gmail-search-registry.tsx` to space: `community-patterns-shared`
2. Favorite the deployed charm with tag: `#gmailSearchRegistry`
3. Share the space name with users

### For Users

1. Navigate to `community-patterns-shared` space
2. Find the Gmail Search Registry charm
3. Add to favorites with tag: `#gmailSearchRegistry`
4. Gmail agents will now discover and use community queries

### For Pattern Authors (subclasses)

Just set `agentTypeUrl` to your pattern's GitHub raw URL:

```typescript
const searcher = GmailAgenticSearch({
  agentTypeUrl: "https://raw.githubusercontent.com/org/repo/main/patterns/my-gmail-agent.tsx",
  // ... other config
});
```

The pattern automatically:
- Tracks local queries with effectiveness ratings
- Offers to share high-rated queries (3+ stars)
- Screens for PII and generalizability
- Discovers and uses community queries
- Allows submission to community registry
