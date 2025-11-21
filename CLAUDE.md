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

**For day-to-day pattern development, use the `pattern-development` skill.**

The pattern-development skill covers:
- Always using `deno task ct` (never `ct` directly)
- Space naming conventions for testing
- Communication guidelines
- Incremental development and commit practices
- Managing dev servers
- Working with the labs repository

**When stuck on pattern development, use the `recovery-strategies` skill.**

The recovery-strategies skill provides a 4-step escalation path:
1. Re-read documentation (pattern-dev skill)
2. Study similar working patterns
3. Reset and try again with new approach
4. Ask user for guidance

Use this aggressively - don't spin your wheels!

### Community Docs (Folk Knowledge System)

**For community folk knowledge, use the `community-docs` skill.**

The community-docs skill covers:
- Three tiers: blessed (author-approved), folk_wisdom (multiple confirmations), superstitions (single observation)
- When to consult community docs (after checking official docs)
- Searching across tiers
- Promoting superstitions to folk wisdom
- Creating new superstitions
- Important skepticism guidelines

**CRITICAL:** Community docs are NOT official documentation. Always check `~/Code/labs/docs/common/` first!

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

**For deploying and updating patterns, use the `deployment` skill.**

The deployment skill covers:
- Testing syntax before deployment
- Deploying new patterns with `charm new`
- Updating deployed patterns with `charm setsrc`
- Deployment troubleshooting

Always use `deno task ct`, never just `ct` directly.

---

## Testing Patterns with Playwright

**For testing patterns in the browser, use the `testing` skill.**

The testing skill covers:
- Navigating to deployed patterns
- Testing pattern functionality with Playwright
- Registration workflow (first time only)
- Testing workflows for new and updated patterns
- Playwright troubleshooting (multiple tabs issue)

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
