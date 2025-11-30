---
topic: llm
discovered: 2025-11-29
confirmed_count: 1
last_confirmed: 2025-11-29
sessions: [null-string-investigation]
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

# generateObject Sometimes Returns String "null" Instead of JSON null

## Problem

When using `generateObject` with schemas that have nullable fields, the LLM sometimes returns the literal string `"null"` instead of the JSON value `null`.

This happens because:
1. Nullable types in schemas are represented as `anyOf: [{ type: "string" }, { type: "null" }]`
2. Schema descriptions often say things like "Null if isOriginalReport=true"
3. The LLM interprets these descriptions literally and outputs `"null"` as a string
4. Since `"null"` is a valid JSON string and the schema allows strings, it passes validation

**Example problematic response:**
```json
{
  "title": "My Report",
  "sourceUrl": "null"  // String "null" instead of JSON null!
}
```

**Expected response:**
```json
{
  "title": "My Report",
  "sourceUrl": null    // Actual JSON null
}
```

## Solution That Seemed To Work

Create a helper function to check if a value is a valid non-null string:

```typescript
/**
 * Check if a URL is valid (not null, undefined, empty, or literal "null" string)
 *
 * WORKAROUND: The LLM (via generateObject) sometimes returns the literal string
 * "null" instead of actual null/undefined when a field should be empty. This
 * appears to be an issue in how the schema description is interpreted or how
 * the response is parsed. The schema says "Null if isOriginalReport=true" but
 * the LLM returns "null" as a string value. This helper papers over that issue.
 */
function isValidUrl(url: unknown): url is string {
  return typeof url === "string" && url.length > 0 && url.toLowerCase() !== "null";
}

// Usage
if (isValidUrl(result.sourceUrl)) {
  // Safe to use as actual URL
  window.open(result.sourceUrl);
}
```

A more generic helper for any nullable string field:

```typescript
/**
 * Check if a string value is actually set (not null, undefined, empty, or "null" string)
 */
function isValidString(value: unknown): value is string {
  return typeof value === "string" &&
         value.length > 0 &&
         value.toLowerCase() !== "null";
}
```

## Example

```typescript
// Schema with nullable field
const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    sourceUrl: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "URL of the source. Null if this is an original report."
    }
  }
} as const;

// Before (bug not handled)
const { result } = generateObject({ schema, prompt: "..." });
if (result.sourceUrl) {
  // BUG: This executes even when sourceUrl is "null" string!
  window.open(result.sourceUrl); // Opens "null" as URL - breaks!
}

// After (with workaround)
const { result } = generateObject({ schema, prompt: "..." });
if (isValidUrl(result.sourceUrl)) {
  // Safe: only executes for actual valid URLs
  window.open(result.sourceUrl);
}
```

## Context

- Discovered while building a pattern that fetches and analyzes web content
- The schema had optional URL fields that should be null in certain conditions
- The LLM consistently returned `"null"` strings instead of `null` values
- AJV validation doesn't help because `"null"` is a valid string
- AJV's `coerceTypes` option only converts empty string `""` to `null`, not `"null"`

## Root Cause Analysis

The issue appears to be in how the LLM interprets schema descriptions:
- When a description says "Null if X" or "null when Y", the LLM outputs the text "null"
- JSON mode ensures valid JSON, but `"null"` is valid JSON (it's a string)
- The Vercel AI SDK's `jsonSchema` wrapper doesn't post-process for this case
- AJV validation passes because the schema allows strings

Relevant code locations in labs:
- `packages/toolshed/routes/ai/llm/generateObject.ts` - Uses AJV with no coercion
- `packages/schema-generator/src/formatters/union-formatter.ts` - Creates `anyOf` for nullable types

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/LLM.md`
- **Framework code:** `~/Code/labs/packages/toolshed/routes/ai/llm/generateObject.ts`
- **Schema generator:** `~/Code/labs/packages/schema-generator/src/formatters/union-formatter.ts`

## Potential Framework Fixes

If this superstition is confirmed, potential framework-level fixes could include:

1. **System prompt enhancement:** Add explicit instructions about null vs "null":
   ```
   For null values, use JSON null (not the string "null").
   Correct: {"url": null}
   Incorrect: {"url": "null"}
   ```

2. **Post-processing:** Add a transformation step in `generateObject` that converts `"null"` strings to actual `null` for nullable fields.

## Next Steps

- [ ] Needs confirmation by another session
- [ ] Check if this affects all LLM providers or just specific ones
- [ ] Test if different schema description wording helps
- [ ] Consider filing a framework issue if confirmed

## Notes

- This may be model-specific (tested primarily with Anthropic models)
- The workaround is simple but adds boilerplate to pattern code
- A framework-level fix would be preferable to pattern-level workarounds
- The case-insensitive check (`toLowerCase()`) handles variations like "Null" or "NULL"

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
