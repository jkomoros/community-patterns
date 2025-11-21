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
