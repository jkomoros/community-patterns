# Instructions for Claude Code Sessions

## Verify Launch Directory

**CRITICAL: Check this FIRST on every session:**

```bash
# Verify we're in the community-patterns repository root
git remote get-url origin 2>/dev/null | grep -q "community-patterns"
```

**If this fails:**
- User launched Claude from the WRONG directory
- **STOP IMMEDIATELY and tell the user:**
  - "Please quit Claude and relaunch it from your community-patterns directory"
  - "You can find it wherever you cloned it (e.g., `cd ~/Code/community-patterns` or `cd ~/Code/common-tools/community-patterns`)"
  - "Then run `claude` from there"

**If this succeeds:**
- Continue with setup checks below

---

## First-Time Setup Check

**Check if this is first-time setup:**

```bash
# Quick check: Does workspace config exist?
test -f .claude-workspace && echo "Setup complete" || echo "First-time setup needed"
```

**If "First-time setup needed":**
- This is **FIRST-TIME SETUP**
- **STOP HERE and run GETTING_STARTED.md**
- Follow that guide step-by-step to set up:
  - labs repository
  - .env file with API keys
  - upstream remote
  - user's workspace
  - identity key (claude.key at repo root)
  - workspace config file (.claude-workspace)
  - first pattern

**If "Setup complete":**
- User is already set up
- Load workspace config (see Step 2)
- Continue with Session Startup Sequence below

---

## Session Startup Sequence

**Follow these steps IN ORDER on every session:**

### Step 1: Check for Upstream Updates

**Always check for updates from upstream first:**

```bash
# Check if updates are available
git fetch upstream 2>/dev/null || echo "No upstream configured"
git status

# If behind upstream/main, pull updates
# Example output: "Your branch is behind 'upstream/main' by 3 commits"
```

**If updates available:**
```bash
# Pull updates (will update CLAUDE.md, GETTING_STARTED.md, examples, etc.)
git pull --rebase upstream main

# If rebase succeeds
git push origin main

# If conflicts (rare - user files are in their namespace)
# Show conflicts and help resolve
```

**Why this matters:**
- Gets latest CLAUDE.md (this file!) with new instructions
- Gets updated GETTING_STARTED.md and DEVELOPMENT.md
- Gets new example patterns
- Gets other users' contributed patterns

### Step 1.5: Update Labs and Patterns Repositories

**After updating community-patterns, also update labs/ and patterns/ (if they exist):**

```bash
# Get parent directory
PARENT_DIR="$(git rev-parse --show-toplevel)/.."

# Update labs (required)
if [ -d "$PARENT_DIR/labs" ]; then
  echo "Updating labs repository..."
  cd "$PARENT_DIR/labs"
  git fetch origin
  git pull --rebase origin main
  cd -
else
  echo "⚠️  labs/ not found - user may need to clone it"
fi

# Update patterns (optional)
if [ -d "$PARENT_DIR/patterns" ]; then
  echo "Updating patterns repository..."
  cd "$PARENT_DIR/patterns"
  git fetch origin
  git pull --rebase origin main
  cd -
fi
```

**Tell user:**
```
Updated dependency repositories (labs and patterns if available).
[If found updates]: Pulled latest updates! This includes:
  - Updated documentation
  - New example patterns
  - [list what changed if significant]

[If no updates]: Already up to date with upstream.
```

### Step 1.5: Check Reference Repositories (Weekly)

**If it's been a while since last check, check for reference repo updates:**

```bash
# Get parent directory
PARENT_DIR="$(git rev-parse --show-toplevel)/.."

# Check if labs or patterns need updating
cd "$PARENT_DIR/labs" && git fetch origin && git status
cd "$PARENT_DIR/patterns" && git fetch origin && git status 2>/dev/null
```

**If updates available, update automatically:**

```bash
# Stop both dev servers if running (will handle gracefully if not running)
pkill -f "packages/toolshed.*deno task dev"
pkill -f "packages/shell.*deno task dev-local"

# Pull updates
cd "$PARENT_DIR/labs" && git pull origin main

# Restart both servers in background
cd "$PARENT_DIR/labs/packages/toolshed" && deno task dev > /tmp/toolshed-dev.log 2>&1 &
cd "$PARENT_DIR/labs/packages/shell" && deno task dev-local > /tmp/shell-dev.log 2>&1 &

# Give them a moment to start
sleep 3

echo "Both dev servers restarted with latest labs updates"
echo "Toolshed (backend): http://localhost:8000"
echo "Shell (frontend): http://localhost:5173"
```

**Important Notes:**
- **labs/** updates may include new framework features, bug fixes, or documentation
- **Dev server must be restarted** after pulling labs updates
- **patterns/** (if cloned) contains example patterns - optional to update
- Check approximately weekly, or when user encounters framework issues

### Step 2: Load Workspace Configuration

**Why we need this:** Your GitHub username is used for:
- Determining which `patterns/$GITHUB_USER/` directory is yours
- Committing patterns with proper attribution
- Deploying patterns with your identity key
- Keeping your work isolated from other users

**Load cached configuration:**

```bash
# Read workspace config (created during first-time setup)
if [ -f .claude-workspace ]; then
  GITHUB_USER=$(grep "^username=" .claude-workspace | cut -d= -f2)
  IS_FORK=$(grep "^is_fork=" .claude-workspace | cut -d= -f2)
  echo "Loaded workspace: patterns/$GITHUB_USER/"
  echo "Repository type: $([ "$IS_FORK" = "true" ] && echo "fork" || echo "upstream")"
else
  echo "ERROR: .claude-workspace not found - run GETTING_STARTED.md first"
  exit 1
fi
```

**If .claude-workspace doesn't exist** (shouldn't happen after setup):
```bash
# Detect from origin remote URL (most reliable)
ORIGIN_URL=$(git remote get-url origin)
GITHUB_USER=$(echo "$ORIGIN_URL" | sed -E 's/.*[:/]([^/]+)\/community-patterns.*/\1/')

# Detect if this is a fork (has upstream remote)
if git remote get-url upstream >/dev/null 2>&1; then
  IS_FORK=true
else
  IS_FORK=false
fi

# Create workspace config file
cat > .claude-workspace << EOF
username=$GITHUB_USER
is_fork=$IS_FORK
setup_complete=true
EOF

echo "Created .claude-workspace for: $GITHUB_USER"
echo "Repository type: $([ "$IS_FORK" = "true" ] && echo "fork" || echo "upstream")"
```

**Confirm with user:**
```
Ready to work! Your workspace: patterns/$GITHUB_USER/

What would you like to work on today?
```

**About `is_fork` configuration:**
- **Fork** (`is_fork=true`): User has their own fork with `upstream` remote pointing to jkomoros/community-patterns
  - PRs go from their fork to upstream
  - Fetch/rebase from `upstream/main` before creating PRs
  - Most common scenario for contributors
- **Direct** (`is_fork=false`): User working directly on jkomoros/community-patterns (e.g., jkomoros or collaborators)
  - PRs go from feature branch to main in same repo
  - Fetch/rebase from `origin/main` before creating PRs
  - Less common, requires write access to upstream
- This value is cached to avoid repeatedly checking `git remote` - it won't change during development

### Step 3: Check and Start Dev Servers (If Needed)

**IMPORTANT: Two servers must be running:**
1. **Toolshed** (backend) - Port 8000
2. **Shell** (frontend) - Port 5173

**First, check if servers are already running:**

```bash
# Check both ports
TOOLSHED_RUNNING=$(lsof -ti:8000 > /dev/null 2>&1 && echo "yes" || echo "no")
SHELL_RUNNING=$(lsof -ti:5173 > /dev/null 2>&1 && echo "yes" || echo "no")

if [ "$TOOLSHED_RUNNING" = "yes" ] && [ "$SHELL_RUNNING" = "yes" ]; then
  echo "✓ Both dev servers already running:"
  echo "  - Toolshed (backend): http://localhost:8000"
  echo "  - Shell (frontend): http://localhost:5173"
  echo ""
  echo "Servers are ready. No need to start them."
elif [ "$TOOLSHED_RUNNING" = "yes" ]; then
  echo "✓ Toolshed already running on port 8000"
  echo "✗ Shell not running - will start it"
  NEED_SHELL=1
elif [ "$SHELL_RUNNING" = "yes" ]; then
  echo "✓ Shell already running on port 5173"
  echo "✗ Toolshed not running - will start it"
  NEED_TOOLSHED=1
else
  echo "✗ No dev servers running - will start both"
  NEED_TOOLSHED=1
  NEED_SHELL=1
fi
```

**If servers are already running, STOP HERE and skip the rest of this step.**

**Tell the user:** "I can see your dev servers are already running. Skipping server startup."

**Only if servers need to be started, run this:**

```bash
# Start toolshed if needed
if [ "$NEED_TOOLSHED" = "1" ]; then
  cd ~/Code/labs/packages/toolshed && deno task dev > /tmp/toolshed-dev.log 2>&1 &
  echo "Started toolshed server (logs: /tmp/toolshed-dev.log)"
fi

# Start shell if needed
if [ "$NEED_SHELL" = "1" ]; then
  cd ~/Code/labs/packages/shell && deno task dev-local > /tmp/shell-dev.log 2>&1 &
  echo "Started shell server (logs: /tmp/shell-dev.log)"
fi

# Give servers a moment to start
if [ "$NEED_TOOLSHED" = "1" ] || [ "$NEED_SHELL" = "1" ]; then
  sleep 3
  echo "Dev servers started. Access at http://localhost:8000"
fi
```

**Why this matters:**
- Patterns need both servers to deploy and test
- The user may have started servers themselves - respect that and don't restart unnecessarily
- Toolshed handles pattern deployment and data
- Shell provides the UI for viewing patterns
- Claude only starts servers if they're not already running

---

## Repository Structure

```
community-patterns/        # THIS REPO (user's fork or direct)
├── .claude-workspace      # Workspace config: username, is_fork, setup status (gitignored)
├── claude.key             # Identity key for deploying patterns (gitignored)
├── CLAUDE.md              # This file - Claude's instructions
├── GETTING_STARTED.md     # First-time setup guide (Claude-guided)
├── DEVELOPMENT.md         # Normal development workflows
├── README.md              # Quick overview with warnings
├── SETUP.md               # Setup instructions
└── patterns/
    ├── examples/          # Shared examples (READ-ONLY)
    ├── alice/, bob/, ...  # Other users (READ-ONLY)
    └── $GITHUB_USER/      # USER's workspace (WRITABLE)
        ├── README.md      # Optional: user's notes
        ├── WIP/           # Work-in-progress patterns
        │   └── *.tsx      # Patterns under active development
        ├── lib/           # Copied upstream patterns (NO MODIFICATIONS)
        │   └── *.tsx      # Reference patterns from labs
        └── *.tsx          # Stable/production patterns

~/Code/labs/               # Framework repo (separate, READ-ONLY)
```

### User Workspace Structure

**Recommended organization within `patterns/$GITHUB_USER/`:**

**WIP/** - Work in progress
- **IMPORTANT: Most pattern development should happen in WIP/**
- Patterns actively being developed
- Experimental features
- Not fully tested
- Can be messy/incomplete
- Keep working here until pattern is stable and tested

**lib/** - Copied reference patterns
- **CRITICAL**: NO MODIFICATIONS to files in lib/
- Copy patterns from labs or examples here for reference
- If you want to modify them, copy to WIP/ or root
- Helps differentiate your work from upstream patterns

**Root level** - Stable patterns
- Only move patterns here when fully tested and working
- Completed, tested patterns
- Ready for use or sharing
- Well-documented

**design/todo/** - Development documentation
- TODO files for complex patterns
- Track design decisions, progress, and context
- Named to match pattern files (e.g., `pattern-name.md`)
- Permanent documentation checked into git
- See "TODO Files as Working Memory" section

**issues/** - Framework questions and architecture issues
- Document complex framework problems
- Questions for framework authors
- Multiple failed approaches with code examples
- See "Filing Issues" section

**Example structure:**
```
patterns/alice/
├── README.md
├── design/
│   └── todo/
│       ├── ai-chat.md           # TODO for experimental-ai-chat pattern
│       └── notes-app.md         # TODO for my-notes-app pattern
├── issues/
│   ├── ISSUE-Automatic-Side-Effects.md
│   └── ISSUE-Reactive-Computed-Timing.md
├── WIP/
│   ├── experimental-ai-chat.tsx
│   └── testing-new-feature.tsx
├── lib/
│   ├── counter.tsx              # Copied from examples (unchanged)
│   └── shopping-list.tsx        # Copied from labs (unchanged)
├── my-todo-list.tsx             # Alice's stable pattern
└── my-notes-app.tsx             # Alice's stable pattern
```

---

## Core Principles

### DO

✅ **Always update from upstream first** (Step 1 above)
✅ **Work only in `patterns/$GITHUB_USER/`** - user's namespace
✅ **Commit frequently** with clear messages
✅ **Test patterns** before committing
✅ **Reference example patterns** for learning
✅ **Ask user** before structural changes

### DON'T

❌ **Never skip upstream update check** on session startup
❌ **Never modify other users' patterns** (`patterns/alice/`, etc.)
❌ **Never modify example patterns** (`patterns/examples/`)
❌ **Never modify root docs** (CLAUDE.md, etc.) unless user explicitly asks
❌ **Never commit identity keys** (claude.key, .claude-workspace - both gitignored)
❌ **Never work outside user's namespace** without permission

### Working with labs Repository

❌ **NEVER commit or push to labs** - it's READ-ONLY
✅ **If you accidentally changed something**: `git restore .`
✅ **To update labs**: Pull updates and restart dev server automatically

### Managing the Dev Servers

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

---

## Development Best Practices

### Always Use `deno task ct`, Never `ct` Directly

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

### Use pattern-dev Skill for Reference

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

### Deleting Space Databases - DANGEROUS

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

### Space Naming Conventions

When testing patterns with Playwright, use temporary test spaces:

**Format:** `test-<username>-<counter>` or `debug-<username>-<counter>`

**Examples:**
```
test-alice-1
test-alice-2
debug-bob-1
experiment-charlie-1
```

**Important:**
- Increment counter for each new test space during session
- These are throwaway spaces for testing
- Use descriptive prefixes (test, debug, experiment, etc.)
- Include your username to identify your test spaces

### Communication Guidelines

**Don't:**
- Continuously summarize the entire session (user already knows what happened)
- Congratulate yourself for progress or use celebratory language
- Stop working just because you hit a problem (persist through issues)

**Do:**
- Report specific results when tasks complete
- Keep moving forward through challenges
- Focus on the current task, not past accomplishments

### Incremental Development & Commits

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

### Recovery Strategies for Pattern Development

**CRITICAL: Don't spin your wheels when stuck. Follow this escalation path AGGRESSIVELY.**

When encountering any difficulty with pattern development - whether it's TypeScript errors, unexpected behavior, or uncertainty about framework features - **immediately begin this recovery sequence**. Do NOT:
- Continue trying the same approach repeatedly
- Guess at solutions without checking documentation
- Waste time in unproductive loops

**If you find yourself stuck for more than 2-3 attempts, MOVE TO THE NEXT STEP.**

Use this escalation path:

#### Step 1: Re-read Documentation (First Response to Being Stuck)

**ALWAYS start here when encountering pattern development issues:**

```
"Use the pattern-dev skill to refresh your understanding of framework patterns"
```

The pattern-dev skill reads all latest pattern documentation from labs. Pay **particular attention** to:

- **`~/Code/labs/docs/common/DEBUGGING.md`** - Common pitfalls and anti-patterns
  - Quick error reference table
  - Type errors (Cell<>, OpaqueRef<>, etc.)
  - Style errors (object vs string syntax)
  - Reactivity issues (bidirectional binding, computed(), ifElse())
  - Runtime errors (DOM access, LLM in handlers, etc.)
- **`~/Code/labs/docs/common/PATTERNS.md`** - Pattern examples and best practices
- **`~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`** - Reactivity system details
- **`~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md`** - Type system rules

**When to use:**
- Encountering any TypeScript errors
- Pattern compiles but doesn't work as expected
- UI not updating reactively
- Confused about Cell<>, OpaqueRef<>, bidirectional binding
- Before asking user for clarification on framework behavior

**When to move to Step 2:**
- After reading relevant docs but still unclear on solution
- Error persists after applying documented fixes
- Need to see concrete examples of working code
- After 1-2 attempts based on documentation

#### Step 2: Study Similar Working Patterns

After refreshing documentation, look at existing working patterns **in this priority order:**

**1. Labs patterns** (highest priority - canonical examples):
```bash
$PARENT_DIR/labs/packages/patterns/
# These are the most up-to-date, authoritative examples
# If a pattern exists here, it's the gold standard
```

**2. Patterns repository** (if available - well-tested real-world examples):
```bash
$PARENT_DIR/patterns/
# These are well-tested real-world patterns
# Skip this if patterns repo not cloned
```

**3. Community patterns - examples** (curated examples):
```bash
patterns/examples/
# These are specifically chosen as good examples
```

**4. Community patterns - jkomoros** (user patterns):
```bash
patterns/jkomoros/
# Prefer root-level (stable) over WIP/
# These may be more complex/experimental
```

**Within each directory:**
- ✅ Prefer non-WIP patterns (stable, tested)
- ⚠️ Use WIP/ patterns only if non-WIP doesn't exist
- 📁 Check root level first, then WIP/ as fallback

**How to find similar patterns:**
```bash
# Get parent directory for relative paths
PARENT_DIR="$(git rev-parse --show-toplevel)/.."

# Search for patterns using specific features
grep -r "generateObject" $PARENT_DIR/labs/packages/patterns/
grep -r "computed(" patterns/examples/
grep -r "handler<" $PARENT_DIR/labs/packages/patterns/

# List available patterns
ls $PARENT_DIR/labs/packages/patterns/
ls $PARENT_DIR/patterns/ 2>/dev/null || echo "patterns repo not cloned"
ls patterns/examples/
ls patterns/jkomoros/
```

**When to move to Step 3:**
- Can't find similar patterns for your use case
- Examples don't solve your specific problem
- After studying 2-3 similar patterns without clarity
- Ready to try a fresh approach with new knowledge

#### Step 3: Reset and Try Again (Minor Confusion)

If still stuck after Steps 1-2:

1. Reset to your last commit: `git reset --hard HEAD`
2. Reflect on what you learned from documentation and examples
3. Try a different approach incorporating that knowledge
4. Start with the simplest possible version that works
5. Add complexity incrementally, testing after each addition

**When to move to Step 4:**
- After 1-2 reset attempts without progress
- Problem persists despite fresh approaches
- Suspect this might be a framework limitation or bug
- Need architectural guidance beyond documentation

#### Step 4: Ask User (Significant Confusion)

If Steps 1-3 don't resolve the issue:

1. Explain what you've tried (docs, examples, approaches)
2. Show specific error messages or unexpected behavior
3. Ask user for clarification or guidance
4. Consider if this is a framework limitation vs implementation issue

### Community Docs (Folk Knowledge System)

**Location:** `community-docs/` in community-patterns repo

**CRITICAL:** These are NOT official framework documentation. Always check `~/Code/labs/docs/common/` first.

Community docs capture empirical patterns discovered during real pattern development - what works, what doesn't, and common pitfalls not yet in official docs.

#### Three Tiers of Reliability

**Priority order when searching:**

1. **✓ blessed/** - Framework author approved (highly reliable)
   - Safe to trust
   - Complements official docs
   - May cover topics not yet in labs/docs/

2. **⭐⭐+ folk_wisdom/** - Verified by multiple sessions (probably reliable)
   - Empirically works, but still uncertain
   - Check star rating (more stars = more confirmations)
   - Read guestbook to see contexts where it worked
   - **Use with understanding, not blind trust**

3. **⚠️ superstitions/** - Single observation (HIGHLY SUSPECT)
   - **Treat with extreme skepticism**
   - May be wrong, incomplete, or context-specific
   - Each has prominent warning disclaimer
   - Try if completely stuck, but verify thoroughly

#### When to Consult Community Docs

**After checking official labs/docs/ first:**
- Encountering undocumented edge cases
- Framework behaving unexpectedly
- TypeScript errors not explained in official docs
- Before creating new superstition (check if already documented)

**Do NOT consult before official docs** - labs/docs/ is always more authoritative!

#### Searching Community Docs

```bash
# Search specific tiers
grep -r "Cell.*handler" community-docs/blessed/
grep -r "Cell.*handler" community-docs/folk_wisdom/
grep -r "Cell.*handler" community-docs/superstitions/

# List superstitions by topic
ls community-docs/superstitions/ | grep "types-"
ls community-docs/superstitions/ | grep "reactivity-"

# Read specific file
cat community-docs/folk_wisdom/types.md
cat community-docs/superstitions/2025-01-15-types-cell-arrays.md
```

#### If You Find a Superstition (⚠️)

**Read the warning disclaimer carefully!** Superstitions are unverified and may be wrong.

1. **Verify against official docs** - Make sure it doesn't contradict
2. **Understand what it claims**
3. **Try in your context** with skepticism
4. **Test thoroughly**

**If it works for you:**
```markdown
1. Update superstition metadata:
   confirmed_count: 2
   last_confirmed: YYYY-MM-DD
   sessions: [original-session, your-session]
   stars: ⭐⭐
   status: ready-for-promotion

2. Promote to folk_wisdom/topic.md:
   - Add entry with guestbook
   - Include both confirmations
   - Set stars to ⭐⭐

3. Mark/remove superstition file

4. Commit: "Promote [topic] superstition to folk_wisdom"
```

**If it doesn't work:**
- Add contradiction note to superstition
- Document your context and what error occurred
- Don't promote - may need investigation

#### If You Find Folk Wisdom (⭐⭐+)

**Check star rating and guestbook:**
- ⭐⭐ = 2 confirmations (newly promoted)
- ⭐⭐⭐ = 3-4 confirmations (fairly reliable)
- ⭐⭐⭐⭐ = 5-7 confirmations (quite reliable)
- ⭐⭐⭐⭐⭐ = 8+ confirmations (very reliable)

**Read guestbook** to see contexts where it worked.

**If it works for you:**
```markdown
1. Increment star count in folk_wisdom/topic.md

2. Add guestbook entry:
   - ✅ YYYY-MM-DD - Brief description of your use case (session-id)

3. Commit: "folk_wisdom/types: +1 confirmation for [topic]"
```

**If it doesn't work:**
- Add note about limitation or edge case
- Don't remove stars, just document the difference

#### Creating a New Superstition

**Only after solving something not in any docs:**

1. **Search first** - Check it's not already documented:
   ```bash
   grep -r "your topic" ~/Code/labs/docs/common/
   grep -r "your topic" community-docs/
   ```

2. **Create file:** `community-docs/superstitions/YYYY-MM-DD-topic-brief-description.md`
   - Use topic prefixes: `types-`, `reactivity-`, `jsx-`, `handlers-`, `llm-`, `patterns-`, etc.
   - Example: `2025-01-15-types-cell-arrays-in-handlers.md`

3. **Copy template** from `community-docs/superstitions/README.md`

4. **Include full ⚠️ disclaimer** at top (already in template)

5. **Fill in:**
   - What problem you had
   - What you tried that didn't work
   - What solution seemed to work
   - Code examples (before/after)
   - Your context
   - Related official docs

6. **Set metadata:**
   ```yaml
   topic: [types|reactivity|jsx|handlers|llm|patterns|deployment|debugging|framework]
   discovered: YYYY-MM-DD
   confirmed_count: 1
   last_confirmed: YYYY-MM-DD
   sessions: [your-session-id]
   related_labs_docs: ~/Code/labs/docs/common/FILE.md (or "none")
   status: superstition
   stars: ⭐
   ```

7. **Commit:** `"Add superstition: [brief description]"`

**Remember:** You're creating a hypothesis, not stating fact! Be humble about uncertainty.

#### Important Notes

**Skepticism is critical:**
- Superstitions may be wrong or context-specific
- Folk wisdom is empirical, not explanatory
- Only blessed entries are framework-approved
- **Always prefer official labs/docs/ when they exist**

**Do NOT:**
- Trust superstitions blindly
- Skip checking official docs first
- Promote without actually testing
- Create superstition for things in official docs

**DO:**
- Read disclaimer on every superstition
- Verify against official docs
- Test thoroughly before confirming
- Document your findings honestly
- Update confirmations when things work

**Community docs are a safety net for edge cases, not a primary reference!**

### Filing Issues

**Location:** `patterns/$GITHUB_USER/issues/` for framework issues or pattern architecture questions

**IMPORTANT: File issues ONLY after exhausting all other approaches AND getting user permission.**

**Prerequisites before filing:**
1. ✅ Checked official `~/Code/labs/docs/common/` documentation
2. ✅ Searched community-docs (blessed, folk_wisdom, superstitions)
3. ✅ Studied similar working patterns
4. ✅ Tried multiple different approaches (document all attempts)
5. ✅ **Asked user if they want you to file an issue**

**Never file an issue without explicit user permission!**

**When to file an issue (after above prerequisites):**
- Encountering framework behavior you don't understand
- Pattern architecture questions that aren't answered by docs
- Suspected framework bugs or limitations
- Questions about "correct" way to do something
- Edge cases that might help others

**File naming:** `ISSUE-Brief-Title.md`

**Example:** `ISSUE-Automatic-Side-Effects.md`, `ISSUE-Reactive-Computed-Timing.md`

#### Issue Template

```markdown
# Issue: [Brief Question/Problem Title]

## Summary

1-2 sentence summary of the issue or question.

## Use Case

**Pattern:** Name of the pattern where this came up

**What you're trying to accomplish:**
- Clear description of the goal
- Why you need this behavior
- Context about the pattern

## Current State (What Works)

Show what you have working currently (if anything):

```typescript
// Code that works (even if not ideal)
```

## What We Tried (Failed Attempts)

### Attempt 1: [Approach Name]

```typescript
// Code that didn't work
```

**Error:**
```
Exact error message
```

**Analysis:** Why you think this didn't work

---

### Attempt 2: [Another Approach]

[Same structure]

---

## Questions

1. **Main question about correct approach?**
2. **Alternative approaches to consider?**
3. **Is this even possible in current framework?**
4. **Missing something obvious?**

## Desired Behavior

What you want to happen:
1. Step 1
2. Step 2
3. Expected outcome

## Environment

- CommonTools framework (latest version)
- Any relevant pattern features being used
- Related patterns or components

---

**Any guidance on the correct approach would be greatly appreciated!**
```

#### When to File vs. When to Use Community Docs

**File an issue when:**
- ✅ You have a specific, complex problem
- ✅ You've tried multiple approaches
- ✅ You have code examples showing what didn't work
- ✅ It's a framework design or architecture question
- ✅ It might be a framework bug or limitation
- ✅ You want framework author feedback

**Use community-docs/superstitions when:**
- ✅ You discovered a simple pattern that works
- ✅ It's a one-line fix or small code pattern
- ✅ You want to share empirical knowledge
- ✅ It might help others encountering similar issues
- ✅ You're not sure if it's the "right" way

**Examples:**

**Issue:** "How do I automatically trigger side effects when reactive values change?" (complex architecture question, multiple failed attempts)

**Superstition:** "Use `Cell<Item[]>` not `Cell<OpaqueRef<Item>[]>` in handler signatures" (simple pattern that works)

#### Workflow

**CRITICAL: Issues are a last resort. Only create after exhausting all other options.**

1. **Encounter framework confusion** that docs don't resolve
2. **Exhaust recovery strategies:**
   - Check official labs/docs/
   - Search community-docs (all tiers)
   - Study similar working patterns
   - Try multiple different approaches
   - Consider asking user for clarification first
3. **Ask user permission:**
   ```
   "I've tried [list approaches]. This seems like a framework architecture question.
   Would you like me to file an issue in patterns/$GITHUB_USER/issues/ to document
   this for framework authors to review?"
   ```
4. **Only if user says yes:**
   - Check if similar issue exists in your issues/ folder
   - Create new issue file with template
   - Include all failed attempts with code
   - Document clear problem statement
   - Commit: `"Add issue: [brief description]"`

**Never file an issue proactively - always get user approval first.**

**Issues are questions for framework authors, not empirical discoveries.**

### TODO Files as Working Memory

**Convention:** Maintain TODO files in `patterns/$GITHUB_USER/design/todo/` to track complex pattern development.

**Purpose:**
- Act as persistent working memory across sessions
- Document design decisions and rationale
- Track implementation progress and next steps
- Preserve context for future reference
- Help other developers understand the pattern evolution

**When to create a TODO file:**
- Starting a complex pattern with multiple features
- Pattern requires research or design decisions
- Multi-session development work
- Experimental features with unclear requirements
- Pattern needs documentation of architecture/choices

**File naming:** `pattern-name.md` (matches the pattern file name)

**Example:** `patterns/jkomoros/design/todo/cheeseboard-schedule.md`

**What to include:**
```markdown
# Pattern Name - Development TODO

## Overview
Brief description of what the pattern does

## Requirements
- List of features to implement
- User stories or use cases

## Design Decisions
Document key choices made during development:
- Why you chose approach X over Y
- Trade-offs considered
- Framework features used and why

## Implementation Progress
- [x] Basic structure and data fetching
- [x] Ingredient parsing
- [ ] Advanced filtering features
- [ ] Performance optimization

## Technical Notes
- Important findings during development
- Framework quirks or workarounds
- Performance considerations
- Edge cases to handle

## Testing Notes
- Test scenarios covered
- Known issues or limitations
- Browser compatibility notes

## Next Steps
- Clear list of what needs to be done next
- Priorities for future sessions
```

**Update as you go:**
- Mark tasks complete when done: `- [x] Feature implemented`
- Add new learnings and decisions
- Document blockers or questions
- Update next steps

**Active Usage Workflow:**

**When starting work on a pattern (especially resuming):**
1. Read the TODO file FIRST before touching code
2. Review "Next Steps" to understand priorities
3. Check "Technical Notes" for important context
4. Look at "Design Decisions" to understand rationale

**During development:**
1. Update "Implementation Progress" as you complete items
2. Add to "Technical Notes" when you discover framework quirks
3. Document "Design Decisions" when you choose an approach
4. Keep "Next Steps" current with what needs doing

**When you hit a blocker:**
1. Document the blocker in TODO
2. Note what you've tried
3. Add to "Next Steps" what needs investigation

**When finishing a work session:**
1. Mark completed tasks with `[x]`
2. Update "Next Steps" with clear priorities
3. Add any new learnings to "Technical Notes"
4. Commit the TODO along with code changes

**Frequency:**
- Update TODO file **multiple times per session**
- Don't wait until the end - update as you work
- TODO should always reflect current state
- Think of it as your "working memory" that persists

**Benefits:**
- Quickly resume work in next session
- Share context with user or other developers
- Document why certain decisions were made
- Track pattern evolution over time
- Never lose important context or learnings

**Difference from SNAPSHOT.md:**
- TODO files are **permanent** and checked into git
- SNAPSHOT.md is **temporary** and should be deleted after reading
- TODO files document the pattern's full development journey
- SNAPSHOT.md captures immediate session state

### Snapshot Capability

When asked to "snapshot yourself", create a `SNAPSHOT.md` file containing:
- Current learnings and insights gained during the work
- Current work in progress and next steps
- Context needed for resuming work later
- **Important**: Add a note at the top: "DELETE THIS FILE AFTER READING"

**Example:**
```markdown
# DELETE THIS FILE AFTER READING

## Current Work
Working on photo gallery pattern in WIP/photo-gallery.tsx

## Learnings
- generateObject works well for image analysis
- Need to batch API calls to avoid rate limits
- Cell arrays require .equals() for reactivity

## Next Steps
- Add pagination for large photo sets
- Test with 50+ photos
- Add loading states
```

---

## Key Paths

| Purpose | Path |
|---------|------|
| Workspace config | `.claude-workspace` |
| Identity key | `claude.key` |
| User's workspace | `patterns/$GITHUB_USER/` |
| TODO files | `patterns/$GITHUB_USER/design/todo/` |
| Framework issues | `patterns/$GITHUB_USER/issues/` |
| Community docs | `community-docs/` |
| Example patterns | `patterns/examples/` |
| Development guide | `DEVELOPMENT.md` |
| Setup guide | `GETTING_STARTED.md` |
| Labs framework | `~/Code/labs/` |
| Labs docs (official) | `~/Code/labs/docs/common/` |

---

## Pattern Development Commands

**IMPORTANT:** Always use `deno task ct`, never just `ct` directly.

### Test Syntax

```bash
cd ~/Code/labs
deno task ct dev ../community-patterns/patterns/$GITHUB_USER/pattern.tsx --no-run
```

### Deploy Pattern

```bash
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  ../community-patterns/patterns/$GITHUB_USER/pattern.tsx
```

### First Custom Pattern Deployment

When a user successfully deploys their first custom pattern (one they created or significantly modified themselves, not an unchanged example pattern), inform them they are invited to join the CommonTools Discord community at https://common.tools/friends. The entry password is "pattern-weaver". Present this invitation in a distinctive and celebratory way (use your judgment for formatting and presentation). Include that it's a place to ask questions, share patterns and tips, and connect with other builders.

### Update Deployed Pattern

```bash
cd ~/Code/labs
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  --charm CHARM-ID \
  ../community-patterns/patterns/$GITHUB_USER/pattern.tsx
```

**IMPORTANT**: Always use `deno task ct`, never just `ct` directly.

---

## Testing Patterns with Playwright

If Playwright MCP is available, use it to test patterns in a real browser.

### Navigate to Deployed Pattern

```
Use Playwright to navigate to: http://localhost:8000/my-space/CHARM-ID
```

### Test Pattern Functionality

Once the page loads:
1. Take a snapshot to see the UI: `browser_snapshot`
2. Interact with elements: click buttons, fill inputs, check boxes
3. Verify behavior: check that counters increment, items are added, etc.
4. Report any issues found

### Registering (First Time Only)

If you see a login/registration page:
1. Click "Register" or "Generate Passphrase"
2. Follow the registration flow
3. Then navigate back to the pattern URL

### Testing Workflow

**After deploying a new pattern:**
```
1. Deploy with ct charm new
2. Note the charm ID
3. Use Playwright to test at http://localhost:8000/space/charm-id
4. Verify all functionality works
5. Report to user if tests pass or if issues found
```

**After updating a pattern:**
```
1. Update with ct charm setsrc
2. Use Playwright to verify changes
3. Test that fixes work and nothing broke
```

**When Playwright unavailable:**
- Suggest user test manually in browser
- Provide the URL to test
- Ask them to report any issues

### Playwright Troubleshooting

**If Playwright starts opening many tabs:**

This can happen after user suspends/resumes their computer. The Chrome connection gets confused.

**Solution:** Ask user to:
1. Quit the Chrome instance that Playwright opened (the one with "Chrome is being controlled by automated test software" banner)
2. Next Playwright command will open a fresh browser and work normally

**Tell user:**
```
Playwright's browser connection got confused after your computer woke up.
Please quit the Chrome window with the yellow "automated test software" banner,
then I'll try again with a fresh browser.
```

---

## Git Workflow

### Committing Work

```bash
cd ~/Code/community-patterns

git add patterns/$GITHUB_USER/pattern.tsx
git commit -m "Add pattern: description"
git push origin main
```

### Getting Updates (Already done in Step 1)

```bash
git fetch upstream
git pull --rebase upstream main
git push origin main
```

### Sharing Work Upstream (Creating Pull Requests)

**IMPORTANT: Wait for user to tell you to create a PR.** Don't push or create PRs automatically.

**Before creating any PR, you MUST update from main and rebase your branch:**

#### Step 0: Update and Rebase Before Creating PR

**Use cached repository type from workspace config:**

```bash
# Read IS_FORK from .claude-workspace (set during Step 2)
IS_FORK=$(grep "^is_fork=" .claude-workspace | cut -d= -f2)

# Determine which remote to use
if [ "$IS_FORK" = "true" ]; then
  echo "Working on fork - will fetch from upstream"
  MAIN_REMOTE="upstream"
else
  echo "Working on main repo - will fetch from origin"
  MAIN_REMOTE="origin"
fi
```

**Then fetch latest main and rebase your branch:**

```bash
# Fetch latest main
git fetch $MAIN_REMOTE

# Rebase current branch on top of main
git rebase $MAIN_REMOTE/main

# If rebase succeeds, push (force-with-lease if on feature branch)
if [ "$(git branch --show-current)" != "main" ]; then
  git push origin $(git branch --show-current) --force-with-lease
else
  git push origin main
fi
```

**If rebase has conflicts:**
1. Show conflict files: `git status`
2. Help resolve conflicts
3. Continue: `git rebase --continue`
4. Then push

**Why this matters:**
- Ensures your PR is based on the latest main
- Avoids merge conflicts during PR review
- Makes PR review easier

---

#### If User Has Their Own Fork (Most Common)

When user wants to contribute patterns from their fork to upstream:

**Step 1: Ensure changes are committed and pushed to their fork**
```bash
cd ~/Code/community-patterns
git status  # Verify all changes are committed
git push origin main
```

**Step 2: Update and rebase (see Step 0 above)**

**Step 3: Create pull request to upstream**
```bash
gh pr create \
  --repo jkomoros/community-patterns \
  --title "Add: pattern name" \
  --body "$(cat <<'EOF'
## Summary
- Brief description of the pattern
- Key features
- Use cases

## Testing
- [x] Pattern compiles without errors
- [x] Tested in browser at http://localhost:8000
- [x] All features working as expected

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

#### If Working Directly on jkomoros/community-patterns

**CRITICAL: When working directly on the upstream repository, you MUST use branches and PRs. Direct pushes to main are NOT allowed.**

**Step 1: Create feature branch**
```bash
cd ~/Code/community-patterns
git checkout -b username/feature-name
```

**Step 2: Commit and push branch**
```bash
git add patterns/$GITHUB_USER/
git commit -m "Add: pattern name"
git push origin username/feature-name
```

**Step 3: Update and rebase (see Step 0 above)**

**Step 4: Create pull request**
```bash
gh pr create \
  --title "Add: pattern name" \
  --body "$(cat <<'EOF'
## Summary
- Brief description

## Testing
- [x] Tested and working

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 5: Merge with rebase (when approved)**
```bash
gh pr merge PR_NUMBER --rebase --delete-branch
```

#### Important Notes

- **Always wait for user permission** before creating PRs
- **All PRs are merged with `--rebase`** (NOT `--squash` or `--merge`)
- This preserves individual commit history
- Commit frequently locally, but only create PR when user asks
- PRs will be reviewed before merging to upstream
- After merge, everyone gets your patterns automatically on next update

---

## Documentation

### For First-Time Setup

Read and follow: **GETTING_STARTED.md**

Covers:
- Installing tools
- Forking and cloning repos
- Setting up environment
- Creating workspace
- First pattern

### For Normal Development

Read and follow: **DEVELOPMENT.md**

Covers:
- Daily workflows
- Pattern best practices
- Testing and deployment
- Common patterns
- Troubleshooting

### For Pattern Reference

**In this repo**:
- `patterns/examples/` - Working example patterns

**In labs repo**:
- `docs/common/PATTERNS.md` - Pattern examples
- `docs/common/COMPONENTS.md` - Component reference
- `docs/common/CELLS_AND_REACTIVITY.md` - Reactivity guide
- `docs/common/TYPES_AND_SCHEMAS.md` - Type system
- `docs/common/LLM.md` - Using AI features

---

## Session Startup Checklist

Every session:

- [ ] **First**: Check if setup is complete (.claude-workspace exists?)
  - If NO → Run GETTING_STARTED.md
  - If YES → Continue below
- [ ] **Step 1**: Check and pull from upstream (this repo)
- [ ] **Step 1.5**: Check if labs/patterns need updates (weekly)
- [ ] **Step 2**: Load workspace configuration (.claude-workspace)
- [ ] **Step 3**: Check and start dev server if needed
- [ ] **Check**: Is Playwright MCP available for testing?
- [ ] **Ready**: Ask user what they want to work on

---

## When User Finishes Session

- [ ] Ensure all work is committed
- [ ] Ensure changes are pushed: `git push origin main`
- [ ] Remind: "Next session I'll check for upstream updates automatically"

---

## Remember

- **Auto-update is critical** - Gets latest instructions for you!
- **User's fork is their workspace** - Push freely to origin
- **Upstream is shared repo** - Pull from here for updates
- **Everyone in their own namespace** - No conflicts
- **Be helpful and encouraging** - Guide users through learning

---

## Special Cases

### User Asks to Modify Docs

If user wants to modify CLAUDE.md, GETTING_STARTED.md, etc.:
1. Confirm they understand this will diverge from upstream
2. Suggest creating issue/PR to upstream instead
3. If they insist, make changes but warn about merge conflicts on updates

### User Wants to Browse Other Patterns

```bash
# Show what's available
ls patterns/

# Show specific user's patterns
ls patterns/alice/

# Copy pattern to study
cp patterns/alice/shopping.tsx patterns/$GITHUB_USER/study-shopping.tsx
```

### User Encounters Merge Conflicts

Usually rare (everyone in their own namespace), but if it happens:
```bash
git status
# Show which files conflict

# If in their namespace - keep their version
# If in docs - review changes and merge carefully
```

---

Happy pattern development! 🚀
