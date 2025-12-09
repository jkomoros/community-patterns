# LLM Integration - Blessed ✓

Framework author approved community knowledge about LLM integration in CommonTools.

**Official docs:** `~/Code/labs/docs/common/LLM.md`

---

## Schema Parameter Is Auto-Inferred

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-09
**Framework version:** Current

---

### The Rule

**You don't need to specify `schema: z.infer<typeof MySchema>` - it's automatically inferred from the TypeScript typing.**

```typescript
// ❌ REDUNDANT: Explicit schema parameter
const result = generateObject({
  prompt: "Generate a summary",
  schema: z.object({
    title: z.string(),
    content: z.string(),
  }),
  // This used to be needed:
  // schema: z.infer<typeof schema>,  // NO LONGER NEEDED
});

// ✅ CORRECT: Schema is auto-inferred
const result = generateObject({
  prompt: "Generate a summary",
  schema: z.object({
    title: z.string(),
    content: z.string(),
  }),
  // TypeScript automatically infers the return type
});
```

### What Changed

Previously, you had to explicitly provide type information in multiple places. Now:
- The framework infers the return type from the `schema` parameter
- TypeScript knows the shape of `result` automatically
- No need for redundant type annotations

### Summary

| Approach | Needed? | Why |
|----------|---------|-----|
| `schema: z.object({...})` | ✅ Yes | Defines the expected output shape |
| `schema: z.infer<...>` type annotation | ❌ No | Auto-inferred from schema |

**Rule of thumb:** Just provide the zod schema - TypeScript handles the rest.
