# Custom Utilities

This directory contains custom utilities created for jkomoros patterns (not from upstream labs).

## Files

### diff-utils.ts

Word-level diff computation and field comparison utilities for LLM extraction preview.

**Used by:**
- `person.tsx` - Shows field-by-field diffs when extracting person data from notes
- `food-recipe.tsx` - Shows diffs when extracting recipe data from notes

**API:**
- `computeWordDiff(from: string, to: string): DiffChunk[]` - Compute word-level diff between two strings
- `compareFields<T>(extracted: Partial<T>, fieldMappings): Array<{ field, from, to }>` - Compare extracted data fields against current values

**Example usage:**
```typescript
import { compareFields, computeWordDiff } from "./utils/diff-utils.ts";

const changes = compareFields(extractionResult, {
  name: { current: currentName, label: "Name" },
  email: { current: currentEmail, label: "Email" }
});
```

## Organization

- **`../lib/`** - Upstream files from labs (read-only, no modifications)
- **`../utils/`** - Custom utilities (this directory)
- **Root level** - Stable patterns
- **`../WIP/`** - Work-in-progress patterns
