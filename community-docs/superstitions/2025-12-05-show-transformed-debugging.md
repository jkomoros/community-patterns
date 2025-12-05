---
topic: debugging
discovered: 2025-12-05
confirmed_count: 1
last_confirmed: 2025-12-05
sessions: [handler-refactor-createReportTool]
related_labs_docs: []
status: superstition
stars: ⭐⭐
---

# Use --show-transformed to Debug Schema Issues

## The Technique

When LLM tools aren't receiving correct input or schemas look wrong:

```bash
cd ~/Code/labs
deno task ct dev ../community-patterns-3/patterns/your-pattern.tsx --show-transformed
```

This outputs the **compiled JavaScript** that CTS generates, including:
- Handler input schemas (what LLM sees)
- State schemas (bound cells)
- Generated code structure

## When to Use

- LLM tool calls have empty or missing fields
- Suspected schema inference issues
- Debugging generic type problems
- Verifying handler signatures

## What to Look For

**Good output** - all expected fields present:
```javascript
handler({
    type: "object",
    properties: {
        name: { type: "string", description: "Name" },
        category: { type: "string", description: "Category" },
        result: { type: "object", asCell: true },
    },
    required: ["name", "category"],
}, ...)
```

**Bad output** - missing fields (schema inference failed):
```javascript
handler({
    type: "object",
    properties: {
        result: { asCell: true }  // Where are the other fields?!
    }
}, ...)
```

## Key Insight

The transformed output shows what the **runtime** will actually use, not what your TypeScript types say. Type parameters like `handler<T>()` are erased at compile time - if you don't see fields in `--show-transformed`, the LLM won't either.

## Related

- `community-docs/superstitions/2025-12-04-tool-handler-schemas-not-functions.md` - The fix for missing schemas
