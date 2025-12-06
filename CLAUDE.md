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

**At the start of every session, use the `session-startup` skill.**

The session-startup skill handles:
- Checking for upstream updates in this repo
- Updating labs and patterns repositories
- Loading workspace configuration
- Checking and starting dev servers if needed

This is critical to do at the start of every session to get latest instructions and ensure the environment is ready.

---

## ⚠️ WHEN STUCK - READ THIS FIRST

**CRITICAL: If you encounter ANY of these situations, IMMEDIATELY use the `community-docs` skill:**

- ❓ Something doesn't work as expected
- ❓ An error you don't understand
- ❓ Unsure how to implement something
- ❓ A pattern that should work but doesn't
- ❓ Behavior that seems like a bug
- ❓ Confused about framework conventions
- ❓ Tried something twice and it failed both times

**DO NOT spin your wheels. Community docs contain hard-won knowledge from other developers who hit the same issues.**

```
STUCK? → Use `community-docs` skill IMMEDIATELY
        ↓
Still stuck? → Check official labs docs
        ↓
Still stuck? → Use `recovery-strategies` skill
        ↓
Still stuck? → Ask user for help
```

**The community-docs skill is your FIRST LINE OF DEFENSE when anything goes wrong.**

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
✅ **Use `community-docs` skill IMMEDIATELY when stuck** - don't spin wheels!
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

**Use the labs restart script to manage dev servers:**

```bash
# Get labs directory (adjust LABS_DIR if needed based on your setup)
LABS_DIR="../labs"

# Restart both dev servers (recommended)
$LABS_DIR/scripts/restart-local-dev.sh

# With options:
$LABS_DIR/scripts/restart-local-dev.sh --force       # Kill existing processes first
$LABS_DIR/scripts/restart-local-dev.sh --clear-cache # Clear toolshed cache
$LABS_DIR/scripts/restart-local-dev.sh --force --clear-cache  # Both
```

**When to restart:**
- After pulling labs updates
- If patterns aren't deploying correctly
- If you see connection errors to localhost:8000 or localhost:5173
- User reports something not working

**Both servers run in background** - session can continue while they start

**Check server logs if issues occur:**
- Toolshed: `$LABS_DIR/packages/toolshed/local-dev-toolshed.log`
- Shell: `$LABS_DIR/packages/shell/local-dev-shell.log`

---

## Development Best Practices

**For day-to-day pattern development, use the `pattern-development` skill.**

The pattern-development skill covers:
- Always using `deno task ct` (never `ct` directly)
- Space naming conventions for testing
- Communication guidelines
- Incremental development and commit practices
- Managing dev servers
- Working with the labs repository

**When stuck on pattern development:**

**FIRST: Use the `community-docs` skill!** This contains solutions to common problems.

**THEN: Use the `recovery-strategies` skill** which provides a 4-step escalation path:
1. Re-read documentation (pattern-dev skill)
2. Study similar working patterns
3. Reset and try again with new approach
4. Ask user for guidance

Use these aggressively - don't spin your wheels!

### Community Docs (Folk Knowledge System)

**⚠️ USE THIS WHEN STUCK! Use the `community-docs` skill.**

**This is your secret weapon.** Community docs contain hard-won knowledge from developers who already solved the problems you're hitting.

The community-docs skill covers:
- Three tiers: blessed (author-approved), folk_wisdom (multiple confirmations), superstitions (single observation)
- Solutions to common errors and gotchas
- Workarounds for framework quirks
- Patterns that work vs patterns that don't

**When to use:**
- IMMEDIATELY when something doesn't work
- When you see an error you don't recognize
- When behavior is unexpected
- BEFORE spending more than 2 minutes debugging

**Note:** Community docs complement official docs (`~/Code/labs/docs/common/`). Check both when stuck!

### Filing Issues

**For filing framework issues, use the `issue-filing` skill.**

The issue-filing skill covers:
- Prerequisites before filing (check docs, community-docs, try multiple approaches)
- When to file an issue
- Issue template with full structure
- File vs community docs decision framework
- Complete workflow requiring user permission

**IMPORTANT:** Never file issues without explicit user permission. Issues are a last resort after exhausting all other approaches.

### TODO Files as Working Memory

**For managing TODO files, use the `todo-files` skill.**

The todo-files skill covers:
- Purpose and when to create TODO files
- What to include (template structure)
- Active usage workflow (starting, during, finishing work sessions)
- Update frequency (multiple times per session)
- Benefits of persistent working memory
- Difference from SNAPSHOT.md

TODO files in `patterns/$GITHUB_USER/design/todo/` act as persistent working memory for complex patterns across sessions.

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

## Pattern Deployment

**⚠️ CRITICAL: ALWAYS read the `deployment` skill BEFORE deploying patterns!**

**DO NOT attempt to deploy without reading the deployment skill first.**

Common mistakes when deploying without reading the skill:
- ❌ Using `http://localhost:5173` (WRONG - that's the frontend)
- ❌ Forgetting required parameters (--api-url, --identity, --space)
- ❌ Missing space name in URL
- ❌ Using `ct` directly instead of `deno task ct`

**The deployment skill contains CRITICAL deployment rules that MUST be followed.**

Use the deployment skill to learn:
- Testing syntax before deployment
- Deploying new patterns with `charm new`
- Updating deployed patterns (DON'T use `charm setsrc`)
- All required parameters and correct URLs
- Deployment troubleshooting

**When user asks to deploy or test a pattern, IMMEDIATELY use the `/deployment` skill.**

---

## Testing Patterns with Playwright

**⚠️ CRITICAL: ALWAYS read the `testing` skill BEFORE testing patterns!**

**DO NOT attempt to navigate to patterns without reading the testing skill first.**

Common mistakes when testing without reading the skill:
- ❌ Using wrong URL format (missing space name or wrong port)
- ❌ Not knowing the correct URL structure from deployment
- ❌ Opening multiple tabs causing conflicts

**The testing skill contains CRITICAL URL formats and testing workflows.**

Use the testing skill to learn:
- Correct URL format for deployed patterns
- Navigating to deployed patterns with Playwright
- Testing pattern functionality
- Registration workflow (first time only)
- Testing workflows for new and updated patterns
- Playwright troubleshooting

**When user asks to test a pattern, IMMEDIATELY use the `/testing` skill.**

---

## Git Workflow

**For git operations and pull requests, use the `git-workflow` skill.**

The git-workflow skill covers:
- Committing work and pushing changes
- Getting updates from upstream (already done in Step 1)
- Creating pull requests to upstream
- Update and rebase workflow before PRs
- Fork vs direct repository workflows
- Merge strategies and important notes

**For landing feature branches, use the `land-branch` skill.**

The land-branch skill provides a streamlined flow to:
- Pull latest main and rebase the branch
- Create a PR (or use existing one)
- Merge via rebase and delete the branch
- Return to main with latest changes

**IMPORTANT:** Always wait for user permission before creating PRs.

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

## ⚠️ BEFORE Deploying or Testing

**Every time user asks to deploy or test a pattern:**

- [ ] **CRITICAL**: Use `/deployment` skill if deploying
- [ ] **CRITICAL**: Use `/testing` skill if testing with Playwright
- [ ] **DO NOT** guess deployment commands or URLs
- [ ] **DO NOT** use localhost:5173 (use localhost:8000)
- [ ] **DO NOT** forget required parameters (--api-url, --identity, --space)

---

## When User Finishes Session

- [ ] Ensure all work is committed
- [ ] Ensure changes are pushed: `git push origin main`
- [ ] Remind: "Next session I'll check for upstream updates automatically"

---

## Remember

- **Auto-update is critical** - Gets latest instructions for you!
- **STUCK? Use `community-docs` skill IMMEDIATELY** - Don't waste time spinning!
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
