# generateObject Schema Validation: Missing `required` Fields Cause HTTP 400

**Status:** Superstition (single observation)

---

## DISCLAIMER

This is a **SUPERSTITION** - an unverified observation from a single session. It may be:
- Wrong or incomplete
- Context-specific
- A misunderstanding of the actual cause
- Fixed in newer framework versions

**Treat with extreme skepticism.** Verify against official docs and test thoroughly.

---

## Metadata

```yaml
topic: llm, generateObject, schema, validation
discovered: 2025-12-23
confirmed_count: 1
last_confirmed: 2025-12-23
sessions: [extracurricular-selector-development]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars:
```

## Problem

When using `generateObject()` with nested object schemas (arrays of objects), the LLM fails with:

```
HTTP 400: No object generated: response did not match schema
```

This happens even when the LLM's response looks correct. The error message is cryptic and doesn't indicate what's wrong with the schema.

## Root Cause

JSON schemas for `generateObject()` require `required` field declarations at EVERY object level:
1. Top-level object must have `required: [...]`
2. Each nested object (including inside array items) must have `required: [...]`

If a nested object in an array is missing its `required` declaration, validation fails.

## What Works

Always explicitly declare `required` fields at every object level:

```typescript
// GOOD - Has required at every level
schema: {
  type: "object" as const,
  properties: {
    classes: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          dayOfWeek: { type: "string" as const },
          startTime: { type: "string" as const },
          endTime: { type: "string" as const },
        },
        required: ["name", "dayOfWeek", "startTime", "endTime"] as const, // REQUIRED!
      },
    },
  },
  required: ["classes"] as const, // REQUIRED!
},
```

## What Fails

```typescript
// BAD - Missing required on nested object
schema: {
  type: "object",
  properties: {
    classes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dayOfWeek: { type: "string" },
          // ... more properties
        },
        // MISSING: required: [...]  <-- This causes HTTP 400!
      },
    },
  },
  // Also often missing: required: ["classes"]
},
```

## Key Insight: `as const` Matters

Adding `as const` to type and required fields helps TypeScript inference and may help the framework:

```typescript
type: "object" as const,  // Not just "object"
required: ["name", "dayOfWeek"] as const,  // Not just string[]
```

## Why This Happens

The framework uses AJV for JSON schema validation. When `required` is missing:
1. AJV considers all properties "optional"
2. LLM generates valid JSON, but it doesn't match the strict schema signature
3. Validation fails with generic "response did not match schema" error
4. No details about which field caused the issue

## Working Reference

See `patterns/jkomoros/prompt-injection-tracker.tsx` (lines ~204-267) for working generateObject schemas with proper `required` declarations.

## Context

- Discovered while building extracurricular-selector pattern
- LLM extraction was failing on first request
- Adding `required` at both levels fixed the issue immediately
- The same pattern (missing `required`) would likely fail for any generateObject call with nested objects

## Related

- `2025-11-29-generateObject-null-string-workaround.md` - Different issue (LLM returning "null" string)
- `2025-12-17-generateObject-json-string-workaround.md` - Different issue (performance)

## Guestbook

- 2025-12-23 - Discovered while fixing extracurricular.tsx LLM extraction. Schema had properties but no `required` field on nested array items. Adding `required: ["name", "dayOfWeek", "startTime", "endTime"] as const` fixed HTTP 400 immediately. (extracurricular-selector / jkomoros)
