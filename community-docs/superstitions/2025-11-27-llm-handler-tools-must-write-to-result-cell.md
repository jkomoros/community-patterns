---
topic: llm
discovered: 2025-11-27
confirmed_count: 1
last_confirmed: 2025-11-27
sessions: [hotel-membership-extractor-agent]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# Handlers Used as generateObject Tools Must Write to `input.result` Cell

## Problem

When using a handler as a tool in `generateObject()`, the handler's return value is NOT passed to the LLM. Instead, the tool returns `null` to the LLM even when the handler clearly returns data.

**Symptom:** Console logs show the handler is executing and returning data, but the LLM receives `null` and acts as if no data was returned.

**Example error scenario:**
```
[SearchGmail Tool] Found 21 emails  // Console shows data was fetched
```

But LLM output shows:
```
"I searched for hotel emails and found 0 results"  // LLM got null
```

And LLM cache files show:
```json
{"type": "json", "value": null}
```

## Solution That Seemed To Work

When a handler is used as a tool for `generateObject()`, the framework passes a `result` cell in the handler's input. The handler MUST write to this cell using `input.result.set(data)` - returning from the async function is NOT sufficient.

**Key insight from `~/Code/labs/packages/runner/src/builtins/llm-dialog.ts` (lines 1463-1541):**
- The framework checks `result.get()` to get the tool result
- If the handler doesn't write to `result`, `result.get()` returns `undefined`
- The framework then returns `null` to the LLM

## Example

```typescript
// Before (didn't work - returned null to LLM)
const searchGmailHandler = handler<
  { query: string },
  { auth: Cell<Auth> }
>(
  async (input, state) => {
    const emails = await fetchEmails(input.query);
    // Just returning data - LLM receives null!
    return {
      success: true,
      emailCount: emails.length,
      emails: emails,
    };
  }
);

// After (worked - LLM received the data)
const searchGmailHandler = handler<
  { query: string; result?: Cell<any> },  // Add result to input type
  { auth: Cell<Auth> }
>(
  async (input, state) => {
    const emails = await fetchEmails(input.query);

    const resultData = {
      success: true,
      emailCount: emails.length,
      emails: emails,
    };

    // CRITICAL: Write to result cell if provided
    if (input.result) {
      input.result.set(resultData);
    }

    return resultData;  // Still return for non-tool usage
  }
);
```

## Context

Working on `hotel-membership-extractor.tsx` pattern which uses an agentic loop. The pattern defines a `searchGmail` tool for the LLM agent to search Gmail:

```typescript
const agentResult = generateObject({
  prompt: "Search Gmail for hotel memberships...",
  tools: {
    searchGmail: searchGmailHandler({ auth: gmailAuth.auth }),
  },
  // ...
});
```

The handler was clearly executing (console logs showed 21 emails found), but the LLM agent consistently reported 0 emails found. Investigating the server logs revealed the tool was returning `null` to the LLM.

**Discovery process:**
1. Console showed handler executing and finding emails
2. LLM reported 0 emails
3. Server logs (`~/Code/labs/packages/toolshed/local-dev-toolshed.log`) showed LLM cache entries
4. Cache files in `~/Code/labs/packages/toolshed/cache/llm-api-cache/*.json` showed `"value": null`
5. Reading framework code revealed the `result` cell pattern

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/LLM.md` - Documents generateObject and tools, but may not explicitly cover this pattern
- **Framework code:** `~/Code/labs/packages/runner/src/builtins/llm-dialog.ts` lines 1463-1541
- **Working pattern:** `patterns/jkomoros/hotel-membership-extractor.tsx`

## Next Steps

- [ ] Needs confirmation by another session using handler tools
- [ ] Check if this is documented in LLM.md (may have missed it)
- [ ] Framework author feedback requested - is this the intended API?
- [ ] Check if there's a cleaner way to handle this

## Notes

- The `result` cell is optional in the input type - it's only passed when the handler is used as a tool
- Both writing to `result` AND returning the value is safe - returning is useful if the handler is called directly (not as a tool)
- This applies specifically to handlers used as `tools` in `generateObject()` - regular handlers called from UI don't have this issue
- Server logs are essential for debugging tool calling - check `~/Code/labs/packages/toolshed/local-dev-toolshed.log`

---

## Framework Author Response (seefeldb, 2025-12-03)

> "that's a hack we added for handlers as tools, but in this example you should make a pattern and use `patternTool` to pass it in. Generally handlers are for when we have side effects (like adding something to a list) and pure computation should be patterns."

### Recommended Approach

**For pure computation (no side effects):** Use `patternTool`
```typescript
// Define as a pattern
const searchPattern = pattern<{query: string}, {results: Email[]}>(...);

// Use with patternTool
const agentResult = generateObject({
  prompt: "...",
  tools: {
    search: patternTool(searchPattern),
  },
});
```

**For side effects (modifying cells, adding to lists):** Use handler with `result.set()`
```typescript
const addToListHandler = handler<{item: string; result?: Cell<any>}, {list: Cell<string[]>}>(
  (input, { list }) => {
    list.push(input.item);  // Side effect!
    if (input.result) input.result.set({ success: true });
    return { success: true };
  }
);
```

### Summary

- ✅ `result.set()` hack is **intentional** for handlers
- ✅ Better approach: use `patternTool` for pure computation
- ✅ Reserve handlers for operations with side effects

---

**Status:** CONFIRMED - Framework author clarified intended usage
