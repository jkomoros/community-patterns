---
name: pattern-development
description: >
  Day-to-day pattern development best practices. Use when actively developing
  patterns. Covers incremental development, commits, communication guidelines,
  and general development workflow.
---

# Pattern Development Best Practices

## Always Use `deno task ct`, Never `ct` Directly

**CRITICAL: Always use `deno task ct` for all ct commands:**

```bash
# ✅ CORRECT
cd ~/Code/labs
deno task ct dev ../community-patterns/patterns/$GITHUB_USER/pattern.tsx --no-run

# ❌ WRONG - Don't use ct directly
ct dev ../community-patterns/patterns/$GITHUB_USER/pattern.tsx --no-run
```

**Why this matters:**
- Ensures consistent version across environments
- Avoids path resolution issues
- Matches framework expectations

## Use pattern-dev Skill for Reference

When learning patterns or stuck on implementation:

```
"Use the pattern-dev skill to refresh your understanding of framework patterns"
```

The pattern-dev skill reads all latest pattern documentation from the labs repo.

**When to use:**
- Starting a new pattern
- Confused about framework features
- Need examples of best practices
- Encountering framework-related issues

## Space Naming Conventions

When testing patterns, use the `claude-` prefix with descriptive names:

**Format:** `claude-<pattern-name>-<MMDD>-<counter>`

**Examples:**
```
claude-counter-1130-1
claude-prompt-injection-tracker-1130-2
claude-gmail-importer-1130-1
claude-shopping-list-1201-1
```

**Pattern:**
- `claude-` prefix identifies AI-created test spaces
- `<pattern-name>` - the pattern being tested (use hyphens, keep concise)
- `<MMDD>` - today's date (month-day)
- `<counter>` - increment when deploying multiple versions same day

**Important:**
- These are throwaway spaces for testing
- The descriptive name helps identify what's being tested
- Increment counter for each new deployment of the same pattern
- Space names must be alphanumeric + hyphens only (no underscores)

## Communication Guidelines

**Don't:**
- Continuously summarize the entire session (user already knows what happened)
- Congratulate yourself for progress or use celebratory language
- Stop working just because you hit a problem (persist through issues)

**Do:**
- Report specific results when tasks complete
- Keep moving forward through challenges
- Focus on the current task, not past accomplishments

## Incremental Development & Commits

**Commit frequently as you make progress:**

- Make small, frequent commits as you accumulate verified working pieces
- **Verified means tested and working** (ideally with Playwright if available)
- Clearly label commits: "Add basic counter functionality"
- Slice work into small chunks that can be continuously extended
- Check in working pieces incrementally rather than waiting for complete features
- Each commit should represent a working increment

**Example commit flow:**
```bash
# After getting basic pattern working
git add patterns/$GITHUB_USER/WIP/my-pattern.tsx
git commit -m "Add basic counter pattern structure"

# After adding features
git commit -m "Add increment/decrement buttons"

# After testing
git commit -m "Test counter pattern in browser"
```

## Managing Dev Servers

**You can restart both dev servers whenever needed:**

```bash
# Stop both servers
pkill -f "packages/toolshed.*deno task dev"
pkill -f "packages/shell.*deno task dev-local"

# Start both servers
cd ~/Code/labs/packages/toolshed && deno task dev > /tmp/toolshed-dev.log 2>&1 &
cd ~/Code/labs/packages/shell && deno task dev-local > /tmp/shell-dev.log 2>&1 &
sleep 3

echo "Both servers restarted"
```

**When to restart:**
- After pulling labs updates
- If patterns aren't deploying correctly
- If you see connection errors to localhost:8000 or localhost:5173
- User reports something not working

**Both servers run in background** - session can continue while they start

**Check server logs if issues occur:**
- Toolshed: `/tmp/toolshed-dev.log`
- Shell: `/tmp/shell-dev.log`

## Working with labs Repository

❌ **NEVER commit or push to labs** - it's READ-ONLY
✅ **If you accidentally changed something**: `git restore .`
✅ **To update labs**: Pull updates and restart dev server automatically

## Deleting Space Databases - DANGEROUS

**⚠️ ONLY delete with explicit user confirmation**

Location: `~/Code/labs/packages/toolshed/cache/memory/*.sqlite`

**WARNING: Deleting these files wipes out ALL local spaces permanently**
- All charms, data, and work in all spaces will be lost
- This affects all test spaces across all sessions

**When this might be needed:**
- Fixing corrupted spaces
- Testing fresh installs
- Clearing test data completely
- User explicitly says "delete all my spaces"

**Command:**
```bash
rm -rf ~/Code/labs/packages/toolshed/cache/memory/*.sqlite
```

**NEVER do this without explicit user permission**

## Factory Function Idiom for Pattern Instantiation

When one pattern needs to instantiate another (like page-creator launching new patterns), use the **factory function idiom** to avoid having to enumerate all Input fields.

### The Problem

The framework requires ALL Input fields to be provided when instantiating a pattern:

```typescript
// ❌ FRAGILE - Must list every field, breaks when Input changes
navigateTo(Person({
  displayName: "",
  givenName: "",
  familyName: "",
  // ... 10 more fields that must be kept in sync
}));
```

### The Solution: Factory Functions

Each pattern exports a `create<PatternName>` factory function:

```typescript
// In person.tsx

// 1. Define defaults with NO explicit type annotation
//    TypeScript infers the type from the object literal
const defaults = {
  displayName: "",
  givenName: "",
  familyName: "",
  emails: [] as EmailEntry[],     // Arrays need type assertion
  viewMode: "main" as const,      // Unions need `as const`
  // ... all fields
};

// 2. Export factory function
export function createPerson(overrides?: Partial<typeof defaults>) {
  return Person({ ...defaults, ...overrides });
}
```

### Why This Works

**Goal:** Make it impossible to forget updating defaults when Input changes.

**Mechanism:** The `Person({...defaults, ...overrides})` call is typechecked at compile time. If `defaults` is missing any field that `Person` requires:

1. ✅ The pattern file fails to compile
2. ✅ Deployment fails
3. ✅ Error clearly shows which field is missing
4. ✅ Forces you to fix it immediately

**Key insight:** TypeScript checks function bodies at definition time, not call time. So even though `createPerson` may never be called in the file, the error still occurs.

### Usage in Other Patterns

```typescript
// In page-creator.tsx
import { createPerson } from "./person.tsx";

const createPersonHandler = handler<void, void>((_, __) => {
  return navigateTo(createPerson());  // Clean!
});

// Or with overrides:
navigateTo(createPerson({ givenName: "Alice" }));
```

### Important Notes

- **Arrays of complex types** need explicit typing: `[] as EmailEntry[]`
- **Union/enum types** need `as const`: `viewMode: "main" as const`
- **No separate runtime type needed** - inference + call-site checking handles it
- Extra fields in defaults are silently ignored (harmless)

### Verified Behavior

Tested: Removing a field from `defaults` causes immediate compile error:
```
TS2345: Property 'givenName' is missing in type '...'
  return Person({ ...defaults, ...overrides });
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

## Additional Development Skills

For specific workflows, use these skills:
- **deployment** - Deploy and update patterns
- **testing** - Test patterns with Playwright
- **recovery-strategies** - What to do when stuck
- **git-workflow** - Git operations and PRs
- **todo-files** - Manage TODO files for complex patterns
