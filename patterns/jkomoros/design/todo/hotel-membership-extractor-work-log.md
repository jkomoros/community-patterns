# Hotel Membership Extractor - Work Log

## Current Status

**Completed:**
- ✅ Gmail Auth prominence - Large warning box with embedded auth UI
- ✅ Gmail content extraction - Debug confirmed Gmail API works perfectly
- ✅ Email fetching and display works correctly

**Remaining - Critical:**
- ❌ Smarter Query Iteration - LLM needs query history and iterative refinement

## Outstanding Issue: Smarter Query Iteration

**Problem:** Current system tries one query per brand and gives up.

Example: `from:marriott.com` returns 40 promotional emails (cruises, sales) but no membership numbers. System marks Marriott as "searched" and moves on, never finding the membership.

**Required Solution:** Track query history per brand and have LLM refine queries.

### Proposed Data Model

```typescript
interface QueryAttempt {
  query: string;
  attemptedAt: number;
  emailsFound: number;
  membershipsFound: number;
  emailIds: string[];
}

interface BrandSearchHistory {
  brand: string;
  attempts: QueryAttempt[];
  status: "searching" | "found" | "exhausted";
}

// Replace current searchedBrands/searchedNotFound/unsearchedBrands with:
brandHistory: BrandSearchHistory[]
```

### Query Progression Example

```
Marriott - Attempt 1:
  Query: "from:marriott.com"
  Result: 40 emails, 0 memberships (promotional)

Marriott - Attempt 2 (LLM refines):
  Query: "from:marriott.com subject:(membership OR account OR number)"
  Result: 5 emails, 1 membership found! ✅
```

### Implementation Steps

1. Update data model to track `brandHistory` with query attempts
2. Enhance LLM prompt to see previous queries and refine
3. Update auto-save handler to record query results
4. Update query generator to continue same brand until found/exhausted

**Priority:** CRITICAL - Current system can't find memberships in practice

## Framework Limitation Note

Auto-fetch emails (triggering fetch when query changes reactively) is not supported. The framework doesn't allow side effects in `computed()` or `derive()`. Manual "Fetch Emails" button is the correct pattern.

## File Location
`patterns/jkomoros/hotel-membership-extractor.tsx`
