# Gmail Importer Refactoring Design

## Problem Statement

SearchGmailTool currently fails with "Invalid recipe" error because it tries to instantiate a GmailImporter pattern inside itself (pattern-within-pattern), which the framework doesn't support.

```typescript
// CURRENT (BROKEN):
export const SearchGmailTool = pattern(({ query, authCharm }) => {
  const importer = GmailImporter({...});  // ❌ Pattern within pattern
  return derive(importer.emails, ...);
});
```

## Framework Developer's Guidance

- SearchGmailTool should be "thin wrapper around GmailImporter"
- Return type `any` so emails become @link references
- LLM uses built-in read tool to read specific emails
- Don't do caching in the tool

## Core Issue Analysis

**What we need:**
- Reusable Gmail fetching logic that can be called from multiple places
- No pattern-within-pattern nesting

**What we have:**
- `GmailImporter` = Full pattern with UI, state, history tracking
- `process()` function = Core fetching logic but tightly coupled to state

**The gap:**
- No way to fetch emails without creating a full GmailImporter pattern

## Design Options

### Option A: Extract Recipe (Complex)

Extract core logic into a `fetchGmailEmails` recipe:

```
┌─────────────────────────────────┐
│ fetchGmailEmails (recipe)       │  ← Reusable core
│ - Input: auth, query, limit     │
│ - Output: Email[]                │
└─────────────────────────────────┘
         ↑                    ↑
         │                    │
    ┌────┴────────┐    ┌─────┴──────────┐
    │ GmailImporter│    │ SearchGmailTool│
    │  (pattern)   │    │   (pattern)    │
    │ + UI         │    │ Returns `any`  │
    │ + History    │    │                │
    └──────────────┘    └────────────────┘
```

**Pros:**
- Clean separation of concerns
- Highly reusable
- Both patterns use same core logic

**Cons:**
- Complex refactor of GmailImporter
- Need to handle async in recipes (may not be supported)
- History tracking becomes complicated
- Risk of breaking existing patterns that use GmailImporter

**Concerns:**
- Can recipes handle async operations in derive?
- GmailClient expects Cell<Auth>, but recipe has plain Auth
- History tracking logic is stateful - doesn't fit recipe model

### Option B: Extract Helper Functions (Simple) ⭐ RECOMMENDED

Extract Gmail API logic into plain helper functions, not recipes:

```typescript
// Helper functions (not patterns/recipes)
export class GmailFetcher {
  constructor(private client: GmailClient) {}

  async fetchMessages(query: string, limit: number): Promise<Email[]> {
    const messages = await this.client.fetchEmail(limit, query);
    if (messages.length === 0) return [];

    const fetched = await this.client.fetchMessagesByIds(
      messages.map(m => m.id)
    );
    return messageToEmail(fetched);
  }
}
```

Both GmailImporter and SearchGmailTool use these helpers:

```typescript
// GmailImporter - unchanged API, internal use of helpers
export default pattern<...>(({ settings, authCharm }) => {
  const emails = cell<Email[]>([]);
  const auth = derive(authCharm, ...);

  const updater = handler(async (_, state) => {
    const client = new GmailClient(state.auth);
    const fetcher = new GmailFetcher(client);
    const newEmails = await fetcher.fetchMessages(
      settings.gmailFilterQuery.get(),
      settings.limit.get()
    );
    state.emails.set(newEmails);
  });

  return { [UI]: ..., emails, bgUpdater: updater };
});

// SearchGmailTool - uses same helpers
export const SearchGmailTool = pattern<
  { query: string; authCharm: any },
  any
>(({ query, authCharm }) => {
  const auth = derive(authCharm, (charm) => charm?.auth || {...});

  return derive([auth, query], async ([authData, q]): any => {
    if (!authData?.token) return [];

    const client = new GmailClient(Cell.of(authData));
    const fetcher = new GmailFetcher(client);
    const emails = await fetcher.fetchMessages(q, 20);
    return emails;
  });
});
```

**Pros:**
- Simple refactor - just extract functions
- No complex recipe/pattern changes
- GmailImporter API stays 100% the same
- History tracking stays in GmailImporter where it belongs
- Works with existing framework patterns

**Cons:**
- Less "framework-idiomatic" (not using recipes)
- Slight code duplication (creating GmailClient in both places)

### Option C: Separate Simple Fetcher Pattern

Create a NEW simple pattern just for fetching, keep GmailImporter unchanged:

```typescript
// New simple pattern - no UI, no history
export const SimpleGmailFetcher = pattern<
  { auth: Auth; query: string; limit: number },
  Email[]
>(({ auth, query, limit }) => {
  return derive([auth, query, limit], async ([a, q, l]) => {
    if (!a?.token) return [];
    const client = new GmailClient(Cell.of(a));
    const messages = await client.fetchEmail(l, q);
    const fetched = await client.fetchMessagesByIds(messages.map(m => m.id));
    return messageToEmail(fetched);
  });
});

// SearchGmailTool uses SimpleGmailFetcher
export const SearchGmailTool = pattern<...>(({ query, authCharm }) => {
  const auth = derive(authCharm, ...);

  const fetcher = SimpleGmailFetcher({
    auth: auth,
    query: query,
    limit: Cell.of(20),
  });

  return derive(fetcher, (emails): any => emails);
});

// GmailImporter stays exactly the same
```

**Pros:**
- Zero changes to GmailImporter
- Clean separation - two different patterns for different use cases
- No helper functions needed

**Cons:**
- Still pattern-within-pattern? May still fail
- Two patterns doing similar things
- May not actually solve the core issue

## Decision Matrix

| Criteria | Option A (Recipe) | Option B (Helpers) | Option C (New Pattern) |
|----------|-------------------|-------------------|------------------------|
| Complexity | High | Low | Medium |
| Risk to existing code | High | Low | None |
| Framework idiomatic | High | Medium | Medium |
| Solves the problem | Maybe | Yes | Maybe |
| Implementation time | Long | Short | Medium |
| Async support | Uncertain | Known to work | Uncertain |

## RECOMMENDATION: Option B (Helper Functions)

**Rationale:**
1. **Lowest risk** - GmailImporter stays exactly the same
2. **Known to work** - async handlers are supported
3. **Fast to implement** - just extract existing logic
4. **Solves the problem** - No pattern-within-pattern
5. **Clear separation** - Helper functions are clearly support code

## Implementation Plan

### Phase 1: Extract Helper Class (15 min)

In `gmail-importer.tsx`:

```typescript
export class GmailFetcher {
  constructor(private client: GmailClient) {}

  /**
   * Fetch emails by query
   * Simple wrapper around Gmail API - no history tracking
   */
  async fetchByQuery(query: string, limit: number): Promise<Email[]> {
    const messages = await this.client.fetchEmail(limit, query);
    if (messages.length === 0) return [];

    const fetched = await this.client.fetchMessagesByIds(
      messages.map(m => m.id)
    );
    return messageToEmail(fetched);
  }
}
```

**Notes:**
- Export from gmail-importer.tsx for reuse
- No state, no history tracking (that stays in GmailImporter)
- Just pure API fetching logic

### Phase 2: Update SearchGmailTool (10 min)

In `hotel-membership-extractor.tsx`:

```typescript
import { GmailFetcher, GmailClient } from "./gmail-importer.tsx";

export const SearchGmailTool = pattern<
  { query: string; authCharm: any },
  any
>(({ query, authCharm }) => {
  const auth = derive(authCharm, (charm) =>
    charm?.auth || {
      token: "",
      tokenType: "",
      scope: [],
      expiresIn: 0,
      expiresAt: 0,
      refreshToken: "",
      user: { email: "", name: "", picture: "" },
    }
  );

  return derive([auth, query], async ([authData, q]): any => {
    if (!authData || !authData.token) {
      console.log("[SearchGmailTool] No auth token available");
      return [];
    }

    console.log(`[SearchGmailTool] Fetching emails with query: "${q}"`);

    try {
      const client = new GmailClient(Cell.of(authData));
      const fetcher = new GmailFetcher(client);
      const emails = await fetcher.fetchByQuery(q, 20);

      console.log(`[SearchGmailTool] Fetched ${emails.length} emails`);
      return emails;
    } catch (error) {
      console.error("[SearchGmailTool] Error fetching emails:", error);
      return [];
    }
  });
});
```

**Key points:**
- Extract auth from authCharm
- Create GmailClient with auth
- Use GmailFetcher helper
- Return emails directly (type `any` for @link conversion)
- Error handling with fallback to empty array

### Phase 3: Test (15 min)

1. Compile pattern - check for errors
2. Deploy to test space
3. Authenticate with Gmail
4. Click scan button
5. Check console for SearchGmailTool logs
6. Verify agent receives email @links
7. Verify agent can use read tool on @links
8. Verify agent extracts memberships

### Phase 4: Optional - Refactor GmailImporter (Future)

If time permits, optionally refactor GmailImporter to use GmailFetcher internally:

```typescript
const googleUpdater = handler(async (_, state) => {
  const client = new GmailClient(state.auth);
  const fetcher = new GmailFetcher(client);

  // Use helper for simple fetching
  const emails = await fetcher.fetchByQuery(
    state.settings.get().gmailFilterQuery,
    state.settings.get().limit
  );

  state.emails.set(emails);
});
```

**But keep this for later** - don't risk breaking existing functionality now.

## Success Criteria

- [ ] SearchGmailTool compiles without errors
- [ ] Pattern deploys successfully
- [ ] Agent scan starts without "Invalid recipe" error
- [ ] Agent receives @link references from searchGmail tool
- [ ] Agent can use read tool on @links
- [ ] Agent successfully extracts at least one membership
- [ ] GmailImporter still works for other patterns (backward compatible)

## Rollback Plan

If Option B fails:
1. Revert all changes to gmail-importer.tsx
2. Try Option C (separate simple pattern)
3. If that fails, consult framework developer for guidance on how to make dynamic tool calls work

## Open Questions

1. **Can derive handle async functions?**
   - Assumption: Yes, based on existing async handler patterns
   - Need to test in practice

2. **Will @link conversion work with async-returned data?**
   - Assumption: Yes, framework converts return value regardless of async
   - Will verify during testing

3. **Should GmailFetcher be a class or just a function?**
   - Current design: Class for better encapsulation
   - Alternative: Just export `fetchEmailsByQuery(client, query, limit)` function
   - Either works - class is slightly cleaner
