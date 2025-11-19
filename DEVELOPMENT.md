# Development Guide

This guide covers normal day-to-day pattern development workflows, best practices, and common patterns.

**New to pattern development?** Start with [GETTING_STARTED.md](GETTING_STARTED.md) first.

---

## Table of Contents

1. [Daily Workflow](#daily-workflow)
2. [Pattern Development](#pattern-development)
3. [Testing Patterns](#testing-patterns)
4. [Common Patterns](#common-patterns)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)
7. [Sharing Your Work](#sharing-your-work)

---

## Daily Workflow

### Morning Setup

**Option 1: Let Claude Code handle it (recommended)**
```bash
cd ~/Code/community-patterns
# Launch Claude Code - it will auto-start both dev servers
```

**Option 2: Manual server startup**

**Terminal 1: Toolshed (backend)**
```bash
cd ~/Code/labs/packages/toolshed
deno task dev
# Leave this running
```

**Terminal 2: Shell (frontend)**
```bash
cd ~/Code/labs/packages/shell
deno task dev-local
# Leave this running
```

**Terminal 3: Your Workspace**
```bash
cd ~/Code/community-patterns
# Updates are checked automatically when you launch Claude Code
```

### Development Cycle

1. **Create/Edit Pattern** in `patterns/YOUR-USERNAME/`
2. **Test Syntax**: `deno task ct dev pattern.tsx --no-run`
3. **Deploy Locally**: `deno task ct charm new ...`
4. **Test in Browser**: Open `http://localhost:8000/space/charm-id`
5. **Iterate**: Update with `charm setsrc`
6. **Commit**: `git add`, `git commit`, `git push`

### End of Day

```bash
# Ensure work is saved
git status
git add patterns/YOUR-USERNAME/
git commit -m "Today's progress"
git push origin main
```

---

## Pattern Development

### Creating a New Pattern

**1. Create the file in your namespace:**
```bash
cd ~/Code/community-patterns/patterns/YOUR-USERNAME
touch my-pattern.tsx
```

**2. Start with basic structure:**
```typescript
/// <cts-enable />
import { Cell, Default, NAME, pattern, UI } from "commontools";

interface MyPatternInput {
  // Your input properties
}

interface MyPatternOutput {
  // Your output properties (often same as input)
}

export default pattern<MyPatternInput, MyPatternOutput>(
  "My Pattern",
  (input) => {
    return {
      [NAME]: "My Pattern Name",
      [UI]: (
        <div>
          {/* Your UI here */}
        </div>
      ),
      // Export properties
    };
  }
);
```

**3. Build incrementally:**
- Start with static UI
- Add interactivity with bidirectional binding (`$checked`, `$value`)
- Add handlers for complex operations
- Test frequently

### Testing Patterns

**Check Syntax:**
```bash
cd ~/Code/labs
deno task ct dev ../community-patterns/patterns/YOUR-USERNAME/pattern.tsx --no-run
```

**Deploy to Test:**
```bash
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space test-space \
  ../community-patterns/patterns/YOUR-USERNAME/pattern.tsx
```

**Update After Changes:**
```bash
cd ~/Code/labs
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space test-space \
  --charm CHARM-ID \
  ../community-patterns/patterns/YOUR-USERNAME/pattern.tsx
```

**View in Browser:**
```
http://localhost:8000/test-space/CHARM-ID
```

**IMPORTANT**: Always use the format `http://localhost:8000/SPACE-ID/CHARM-ID`, not just `/charm/CHARM-ID`.

### Organizing Your Workspace

**Recommended folder structure:**

```
patterns/YOUR-USERNAME/
├── README.md              # Your notes and pattern index
├── WIP/                   # Work-in-progress patterns
│   ├── feature-x.tsx      # Actively developing
│   └── experiment-y.tsx   # Testing ideas
├── lib/                   # Copied reference patterns (NO MODIFICATIONS!)
│   ├── counter.tsx        # From examples/ (unchanged)
│   └── shopping.tsx       # From labs (unchanged)
├── todo-list.tsx          # Your stable patterns
├── notes-app.tsx
└── image-gallery.tsx

Note: claude.key is at repo root, not in your pattern directory
```

**Folder conventions:**

**`WIP/`** - Work in progress
- Patterns you're actively developing
- Experimental features
- Not fully tested
- Can be incomplete/messy
- Move to root when stable

**`lib/`** - Reference patterns (NO MODIFICATIONS)
- **CRITICAL**: Files in lib/ should NEVER be modified
- Copy patterns from `patterns/examples/` or `labs/packages/patterns/` here
- Used for reference and learning
- If you want to modify, copy to `WIP/` or root first
- Helps you distinguish your work from upstream patterns

**Root level** - Stable/production patterns
- Completed and tested
- Ready for use or sharing
- Well-documented
- Can be organized into subdirectories if needed

**Why this structure?**
- Clear separation of work-in-progress vs stable
- `lib/` keeps upstream patterns pristine for reference
- Easy to see what you're actively working on
- Matches the structure used in the main recipes repo

**Example workflow:**
```bash
# 1. Copy example to study
cp patterns/examples/counter.tsx patterns/YOUR-USERNAME/lib/counter.tsx

# 2. Start building your own version
cp patterns/YOUR-USERNAME/lib/counter.tsx patterns/YOUR-USERNAME/WIP/my-counter.tsx

# 3. Develop and test in WIP/
# ... make changes, test, iterate ...

# 4. When stable, move to root
mv patterns/YOUR-USERNAME/WIP/my-counter.tsx patterns/YOUR-USERNAME/my-counter.tsx

# 5. lib/counter.tsx remains unchanged for reference
```

**Alternative structures:**

Organize however works for you! Some ideas:

```
# By category
patterns/YOUR-USERNAME/
├── WIP/
├── lib/
├── lists/
│   ├── todo.tsx
│   └── shopping.tsx
├── ai/
│   ├── chat.tsx
│   └── image-gen.tsx
└── tools/
    └── calculator.tsx

# By complexity
patterns/YOUR-USERNAME/
├── WIP/
├── lib/
├── simple/
│   └── counter.tsx
├── intermediate/
│   └── filtered-list.tsx
└── advanced/
    └── llm-integration.tsx
```

---

## Common Patterns

### Pattern 1: Simple List with Add/Remove

```typescript
interface Item {
  title: string;
  done: Default<boolean, false>;
}

const MyList = pattern<{ items: Cell<Item[]> }>(({ items }) => {
  return {
    [NAME]: "My List",
    [UI]: (
      <div>
        {items.map((item) => (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {/* Bidirectional binding - automatic updates */}
            <ct-checkbox $checked={item.done}>{item.title}</ct-checkbox>

            {/* Remove button */}
            <button onClick={() => {
              const current = items.get();
              const index = current.findIndex(el => Cell.equals(item, el));
              if (index >= 0) items.set(current.toSpliced(index, 1));
            }}>×</button>
          </div>
        ))}

        {/* Add new item */}
        <ct-message-input
          placeholder="Add item..."
          onct-send={(e) => {
            const title = e.detail?.message?.trim();
            if (title) items.push({ title, done: false });
          }}
        />
      </div>
    ),
    items,
  };
});
```

### Pattern 2: Filtered/Sorted Views

```typescript
const MyFilteredList = pattern<{ items: Default<Item[], []> }>(({ items }) => {
  // Computed values update automatically
  const activeItems = computed(() => items.filter(item => !item.done));
  const completedItems = computed(() => items.filter(item => item.done));

  return {
    [NAME]: "Filtered List",
    [UI]: (
      <div>
        <h3>Active ({activeItems.length})</h3>
        {activeItems.map(item => <div>{item.title}</div>)}

        <h3>Completed ({completedItems.length})</h3>
        {completedItems.map(item => <div>{item.title}</div>)}
      </div>
    ),
    items,
  };
});
```

### Pattern 3: Using AI Generation

```typescript
const AIPattern = pattern<{ prompt: Cell<string> }>(({ prompt }) => {
  // Generate structured data
  const result = generateObject<{ ideas: string[] }>({
    prompt: prompt,
    system: "Generate 3 creative ideas based on the prompt",
  });

  return {
    [NAME]: "AI Generator",
    [UI]: (
      <div>
        <ct-input $value={prompt} placeholder="Enter prompt..." />

        {result.pending ? (
          <div>Generating...</div>
        ) : result.error ? (
          <div>Error: {result.error}</div>
        ) : (
          <ul>
            {result.result.ideas.map(idea => <li>{idea}</li>)}
          </ul>
        )}
      </div>
    ),
    prompt,
  };
});
```

See `patterns/examples/` for more working examples.

---

## Best Practices

### DO

✅ **Use bidirectional binding** (`$checked`, `$value`) for simple UI updates
✅ **Test incrementally** - Deploy and test often
✅ **Commit frequently** - Small, working increments
✅ **Reference examples** - Check `patterns/examples/` when stuck
✅ **Use computed()** for data transformations outside JSX
✅ **Keep patterns focused** - One clear purpose per pattern

### DON'T

❌ **Don't use handlers for simple updates** - Use bidirectional binding
❌ **Don't access DOM directly** - Use cells and reactive patterns
❌ **Don't use ternaries for conditional rendering** - Use `ifElse()`
❌ **Don't call generateObject from handlers** - Only in pattern body
❌ **Don't forget Cell<>** in signatures when you need `.set()`, `.update()`, etc.

### Type System

**Use `Cell<>` only when you need write access:**
```typescript
// ✅ Read-only (still reactive!)
interface ReadOnlyInput {
  count: number;
  items: Item[];
}

// ✅ Write access (can mutate)
interface WritableInput {
  count: Cell<number>;      // Can call count.set()
  items: Cell<Item[]>;      // Can call items.push()
}
```

**In handlers, always use `Cell<T[]>` not `Cell<OpaqueRef<T>[]>`:**
```typescript
// ✅ Correct
const addItem = handler<unknown, { items: Cell<Item[]> }>(
  (_, { items }) => {
    items.push({ title: "New", done: false });
  }
);

// ❌ Wrong
const addItem = handler<unknown, { items: Cell<OpaqueRef<Item>[]> }>(
  // This will cause type errors!
);
```

### Styling

**HTML elements use object syntax:**
```typescript
<div style={{ display: "flex", padding: "1rem" }}>
<span style={{ color: "red", fontWeight: "bold" }}>
```

**Custom elements use string syntax:**
```typescript
<common-hstack style="display: flex; padding: 1rem;">
<ct-card style="border: 1px solid #ccc;">
```

---

## Troubleshooting

### Pattern Won't Compile

**Check**:
1. Missing imports? `import { Cell, ... } from "commontools"`
2. Type errors? Look at the error message carefully
3. Forgot `/// <cts-enable />`?
4. Check similar examples in `patterns/examples/`

### Pattern Won't Deploy

**Check**:
1. Are both dev servers running? Check ports 8000 (toolshed) and 5173 (shell)
   - Claude Code auto-starts them, or manually:
   - `cd ~/Code/labs/packages/toolshed && deno task dev`
   - `cd ~/Code/labs/packages/shell && deno task dev-local`
2. Syntax correct? Run `ct dev --no-run` first
3. Correct paths? Should be `../community-patterns/patterns/YOUR-USERNAME/...`
4. Identity key exists? `ls claude.key`

### Changes Not Showing

**Solutions**:
1. Did you run `charm setsrc` after changes?
2. Hard refresh browser: Cmd+Shift+R (Mac), Ctrl+Shift+R (Windows)
3. Check you're at right URL: `http://localhost:8000/space/charm-id`

### Type Errors

**Common issues**:
- **"Type 'string' not assignable to 'CSSProperties'"** → Using string style on HTML element (use object)
- **"Property 'set' does not exist"** → Missing `Cell<>` in signature
- **Handler type mismatch** → Check `Cell<T[]>` vs `Cell<OpaqueRef<T>[]>`

See `~/Code/labs/docs/common/DEBUGGING.md` for more.

---

## Learning Resources

### Example Patterns

**In this repo** (`patterns/examples/`):
- `counter.tsx` - Simple counter
- `todo-list.tsx` - List with add/remove
- More added over time

**In labs repo** (`~/Code/labs/packages/patterns/`):
- Framework example patterns
- Advanced techniques

### Documentation

**In this repo**:
- `GETTING_STARTED.md` - Initial setup
- `DEVELOPMENT.md` - This file

**In labs repo** (`~/Code/labs/docs/common/`):
- `PATTERNS.md` - Pattern examples and levels
- `COMPONENTS.md` - UI components reference
- `CELLS_AND_REACTIVITY.md` - Reactivity system
- `TYPES_AND_SCHEMAS.md` - Type system details
- `LLM.md` - AI features (generateObject, generateText)

### Studying Other Patterns

```bash
# Browse what's available
ls patterns/

# Look at specific patterns
ls patterns/alice/

# Copy to study
cp patterns/alice/shopping-list.tsx patterns/YOUR-USERNAME/study-shopping.tsx
```

---

## Sharing Your Work

### Push to Your Fork (Most Users)

If you're working on your own fork (most common):

```bash
git add patterns/YOUR-USERNAME/
git commit -m "Add shopping list pattern"
git push origin main
```

Your fork can be private (only you see it) or public (others can browse).

### Working Directly on Upstream Repository

**If you have direct access to jkomoros/community-patterns** (e.g., you're jkomoros or a collaborator):

**IMPORTANT: You MUST use branches and Pull Requests. Direct pushes to main are not allowed.**

```bash
# Create a feature branch
git checkout -b your-username/feature-name

# Make your changes and commit
git add patterns/YOUR-USERNAME/
git commit -m "Add shopping list pattern"
git push origin your-username/feature-name

# Create PR
gh pr create \
  --title "Add: shopping list pattern" \
  --body "Shopping list pattern with categories and filtering"

# PRs are merged with --rebase (NOT --squash)
gh pr merge PR_NUMBER --rebase --delete-branch
```

### Contribute to Upstream (From Your Fork)

Share your patterns with everyone:

```bash
# Make sure changes are pushed to your fork
git push origin main

# Create PR to upstream
gh pr create \
  --repo jkomoros/community-patterns \
  --title "Add: shopping list pattern" \
  --body "Shopping list pattern with categories and filtering"
```

**Merge Policy:**
- All PRs are merged using `--rebase` (preserves individual commit history)
- NOT `--squash` or `--merge`
- This keeps a linear, easy-to-follow git history

Your patterns will be reviewed and merged, appearing in `patterns/YOUR-USERNAME/` for everyone!

---

## Advanced Topics

### Pattern Composition

Use multiple patterns together:

```typescript
const MainPattern = pattern(({ items }) => {
  // Create instances of other patterns
  const listView = ListView({ items });
  const gridView = GridView({ items });

  return {
    [NAME]: "Multi-View",
    [UI]: (
      <div style={{ display: "flex", gap: "2rem" }}>
        <div>{listView}</div>
        <div>{gridView}</div>
      </div>
    ),
    items,
  };
});
```

### Multi-File Patterns

Organize complex patterns across files:

```
patterns/YOUR-USERNAME/
└── my-app/
    ├── main.tsx       # Entry point
    ├── schemas.tsx    # Shared types
    └── utils.tsx      # Helper functions
```

Use relative imports:
```typescript
// In main.tsx
import { MySchema } from "./schemas.tsx";
import { helpers } from "./utils.tsx";
```

Deploy the main file - ct bundles dependencies automatically.

---

## Quick Reference

### Essential Commands

```bash
# Test syntax
cd ~/Code/labs
deno task ct dev ../community-patterns/patterns/YOUR-USERNAME/pattern.tsx --no-run

# Deploy
deno task ct charm new --api-url http://localhost:8000 --identity ../community-patterns/claude.key --space my-space ../community-patterns/patterns/YOUR-USERNAME/pattern.tsx

# Update
deno task ct charm setsrc --api-url http://localhost:8000 --identity ../community-patterns/claude.key --space my-space --charm CHARM-ID ../community-patterns/patterns/YOUR-USERNAME/pattern.tsx

# Inspect
deno task ct charm inspect --api-url http://localhost:8000 --identity ../community-patterns/claude.key --space my-space --charm CHARM-ID
```

### Git Commands

```bash
# Daily work
git add patterns/YOUR-USERNAME/
git commit -m "Message"
git push origin main

# Get updates (done automatically on Claude launch)
git fetch upstream
git pull --rebase upstream main
git push origin main
```

---

## Remember

- **Work only in `patterns/YOUR-USERNAME/`** - your namespace
- **Commit frequently** - small, working increments
- **Test before committing** - verify patterns work
- **Reference examples** - don't reinvent the wheel
- **Ask for help** - Claude Code knows all the docs

Happy pattern development! 🚀
