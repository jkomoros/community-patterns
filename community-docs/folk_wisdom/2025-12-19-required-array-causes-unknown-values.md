# JSON Schema `required` Array Causes `<UNKNOWN>` Values in LLM Extraction

**Status:** Folk Wisdom (confirmed in multiple patterns)
**Date:** 2025-12-19
**Severity:** High

## The Problem

When using `generateObject()` with a JSON Schema that has a `required` array listing fields, the LLM will fabricate placeholder values (like `<UNKNOWN>`, `"N/A"`, or empty strings) for fields it cannot extract from the input text.

This happens because:
1. The `required` array tells the LLM it MUST return values for all listed fields
2. If the input doesn't contain information for a field, the LLM invents a value to satisfy the constraint
3. These placeholder values then appear in your extraction results

## Example

```typescript
// ❌ BAD - required array forces LLM to fabricate values
const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    twitter: { type: "string" },
  },
  required: ["name", "email", "phone", "twitter"],  // <-- THE FOOTGUN
};

// Input: "Hi, I'm Sarah Chen, you can reach me at sarah@acme.com"
// Result: {
//   name: "Sarah Chen",
//   email: "sarah@acme.com",
//   phone: "<UNKNOWN>",      // ❌ Fabricated!
//   twitter: "<UNKNOWN>",    // ❌ Fabricated!
// }
```

```typescript
// ✅ GOOD - no required array, LLM only returns what it finds
const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    twitter: { type: "string" },
  },
  // NOTE: No `required` array - LLM can omit fields it can't extract
};

// Input: "Hi, I'm Sarah Chen, you can reach me at sarah@acme.com"
// Result: {
//   name: "Sarah Chen",
//   email: "sarah@acme.com",
//   // phone and twitter are simply absent from the result
// }
```

## The Solution

**Don't use `required` arrays in extraction schemas.**

Let the LLM omit fields it can't extract from the input. Check for field presence in your code instead.

### Best Approach: Use `buildFieldMappingSchema()` helper

The `buildFieldMappingSchema()` helper in `lib/import-review.tsx` is specifically designed to avoid this footgun:

```typescript
import { buildFieldMappingSchema } from "./lib/import-review.tsx";

// This generates a schema WITHOUT a required array
const schema = Cell.of(buildFieldMappingSchema([
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
]));
```

### If You Must Use Manual Schemas

Omit the `required` array entirely, or only require identifier fields:

```typescript
// Only require ID for matching, not value fields
const schema = {
  type: "object",
  properties: {
    id: { type: "string" },
    suggestedValue: { type: "number" },
  },
  required: ["id"],  // ✅ Only require the identifier, not the value
};
```

## Patterns Affected

This footgun has been found and fixed in:
- `person.tsx` - Had all 14 fields in required array
- `food-recipe.tsx` - Had `["id", "maxWaitMinutes"]` in required array

## Related Issues

- The `buildFieldMappingSchema()` helper explicitly avoids this with a comment at lines 383-384:
  ```typescript
  // NOTE: No `required` array - let LLM omit fields it can't extract from input
  // This prevents <UNKNOWN> or placeholder values for missing fields
  ```

## Key Takeaway

**For LLM extraction schemas:** Never use `required` arrays for data fields. Only use them for identifier fields (like `id`) if needed for matching purposes.
