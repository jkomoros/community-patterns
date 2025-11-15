# Instructions for Claude Code Sessions

## First-Time Setup Check

**CRITICAL: Check this FIRST before anything else:**

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

**Tell user:**
```
Checking for updates from upstream...
[If found updates]: Pulled latest updates! This includes:
  - Updated documentation
  - New example patterns
  - [list what changed if significant]

[If no updates]: Already up to date with upstream.
```

### Step 1.5: Check Reference Repositories (Weekly)

**If it's been a while since last check, check for reference repo updates:**

```bash
# Check if labs or recipes need updating
cd ~/Code/labs && git fetch origin && git status
cd ~/Code/recipes && git fetch origin && git status 2>/dev/null
```

**If updates available, update automatically:**

```bash
# Stop dev server if running (will handle gracefully if not running)
pkill -f "deno task dev"

# Pull updates
cd ~/Code/labs && git pull origin main

# Restart dev server in background
cd ~/Code/labs && deno task dev > /tmp/labs-dev-server.log 2>&1 &

# Give it a moment to start
sleep 2

echo "Dev server restarted with latest labs updates"
```

**Important Notes:**
- **labs/** updates may include new framework features, bug fixes, or documentation
- **Dev server must be restarted** after pulling labs updates
- **recipes/** (if cloned) contains example patterns - optional to update
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
  echo "Loaded workspace: patterns/$GITHUB_USER/"
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

# Create workspace config file
cat > .claude-workspace << EOF
username=$GITHUB_USER
setup_complete=true
EOF

echo "Created .claude-workspace for: $GITHUB_USER"
```

**Confirm with user:**
```
Ready to work! Your workspace: patterns/$GITHUB_USER/

What would you like to work on today?
```

### Step 3: Check and Start Dev Server

**Check if dev server is running:**

```bash
# Check if dev server is already running
if lsof -ti:8000 > /dev/null 2>&1; then
  echo "Dev server is running on port 8000"
else
  echo "Dev server not running - starting now..."
fi
```

**If not running, start it:**

```bash
# Start dev server in background
cd ~/Code/labs && deno task dev > /tmp/labs-dev-server.log 2>&1 &

# Give it a moment to start
sleep 2

# Verify it started
if lsof -ti:8000 > /dev/null 2>&1; then
  echo "Dev server started successfully on http://localhost:8000"
else
  echo "Failed to start dev server - check /tmp/labs-dev-server.log for errors"
fi
```

**Why this matters:**
- Patterns need the dev server to deploy and test
- Claude can restart it automatically when needed
- Runs in background so session can continue

---

## Repository Structure

```
community-patterns/        # THIS REPO (user's fork)
├── .claude-workspace      # Workspace config: username, setup status (gitignored)
├── claude.key             # Identity key for deploying patterns (gitignored)
├── CLAUDE.md              # This file - Claude's instructions
├── GETTING_STARTED.md     # First-time setup guide
├── DEVELOPMENT.md         # Normal development workflows
├── README.md              # Quick overview
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
- Patterns actively being developed
- Experimental features
- Not fully tested
- Can be messy/incomplete

**lib/** - Copied reference patterns
- **CRITICAL**: NO MODIFICATIONS to files in lib/
- Copy patterns from labs or examples here for reference
- If you want to modify them, copy to WIP/ or root
- Helps differentiate your work from upstream patterns

**Root level** - Stable patterns
- Completed, tested patterns
- Ready for use or sharing
- Well-documented

**Example structure:**
```
patterns/alice/
├── README.md
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

### Managing the Dev Server

**You can restart the dev server whenever needed:**

```bash
# Stop dev server
pkill -f "deno task dev"

# Start dev server
cd ~/Code/labs && deno task dev > /tmp/labs-dev-server.log 2>&1 &
sleep 2
```

**When to restart:**
- After pulling labs updates
- If patterns aren't deploying correctly
- If you see connection errors to localhost:8000
- User reports something not working

**Dev server runs in background** - session can continue while it starts

---

## Key Paths

| Purpose | Path |
|---------|------|
| Workspace config | `.claude-workspace` |
| Identity key | `claude.key` |
| User's workspace | `patterns/$GITHUB_USER/` |
| Example patterns | `patterns/examples/` |
| Development guide | `DEVELOPMENT.md` |
| Setup guide | `GETTING_STARTED.md` |
| Labs framework | `~/Code/labs/` |
| Labs docs | `~/Code/labs/docs/common/` |

---

## Pattern Development Commands

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

### Sharing Work Upstream

If user wants to contribute patterns back:

```bash
git push origin main
gh pr create \
  --repo commontoolsinc/community-patterns \
  --title "Add: pattern name" \
  --body "Description"
```

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
- [ ] **Step 1.5**: Check if labs/recipes need updates (weekly)
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
