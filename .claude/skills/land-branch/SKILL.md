---
name: land-branch
description: >
  Land a feature branch: pull from main, rebase the branch, create a PR,
  and merge it via rebase with automatic branch deletion. Use when ready
  to land a completed feature branch.
---

# Land Branch Workflow

**Use this skill to land a feature branch in one smooth flow.**

## Prerequisites

- You're on a feature branch (not `main`)
- All changes are committed
- The feature is ready to merge

## Step 1: Verify Branch State

```bash
# Confirm we're on a feature branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ]; then
  echo "ERROR: You're on main. Switch to a feature branch first."
  echo ""
  echo "If you accidentally committed to main, see 'Recovering from Commits on Main' below."
  exit 1
fi

# Verify clean working directory
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Uncommitted changes. Commit or stash them first."
  git status --short
  exit 1
fi

echo "Ready to land branch: $CURRENT_BRANCH"
```

### Recovering from Commits on Main

If you accidentally made commits directly on `main` instead of a feature branch:

```bash
# Check how many commits you're ahead of origin/main
git log --oneline origin/main..HEAD

# Create a new branch with your commits (pick a descriptive name)
git branch my-feature-branch

# Reset main back to match origin/main
git reset --hard origin/main

# Switch to your new branch
git checkout my-feature-branch

# Verify: your commits should now be on the feature branch
git log --oneline -5
```

**Why this works:**
- `git branch` creates a new branch pointing to your current commit
- `git reset --hard origin/main` moves main back to where it should be
- Your commits are preserved on the new branch

Now continue with the land-branch workflow from Step 2.

## Step 2: Pull and Rebase onto Main

```bash
# Determine which remote has main (fork vs direct)
IS_FORK=$(grep "^is_fork=" .claude-workspace 2>/dev/null | cut -d= -f2)
if [ "$IS_FORK" = "true" ]; then
  MAIN_REMOTE="upstream"
else
  MAIN_REMOTE="origin"
fi

# Fetch latest main
git fetch $MAIN_REMOTE

# Rebase current branch onto main
git rebase $MAIN_REMOTE/main

# If rebase fails, stop and help resolve conflicts
if [ $? -ne 0 ]; then
  echo "Rebase has conflicts. Resolve them, then run:"
  echo "  git rebase --continue"
  echo "  # Then re-run this skill"
  exit 1
fi

# Push rebased branch (force needed after rebase)
git push origin $CURRENT_BRANCH --force-with-lease
```

## Step 2.5: Check for Downstream Dependencies

**IMPORTANT:** If your changes modified any pattern's input type (the type parameter to `pattern<Input>`), you MUST check if other patterns import and use that pattern.

```bash
# Get list of changed .tsx files
CHANGED_PATTERNS=$(git diff --name-only $MAIN_REMOTE/main...HEAD -- '*.tsx')

if [ -n "$CHANGED_PATTERNS" ]; then
  echo "Changed patterns:"
  echo "$CHANGED_PATTERNS"
  echo ""
  echo "Checking for downstream dependencies..."

  for file in $CHANGED_PATTERNS; do
    # Extract the pattern name from the file path
    PATTERN_NAME=$(basename "$file" .tsx)

    # Search for imports of this pattern in other files
    IMPORTERS=$(grep -l "from.*['\"].*${PATTERN_NAME}['\"]" patterns/**/*.tsx 2>/dev/null | grep -v "$file" || true)

    if [ -n "$IMPORTERS" ]; then
      echo ""
      echo "⚠️  $PATTERN_NAME is imported by:"
      echo "$IMPORTERS"
      echo "   → Check if input type changes require updates to these files!"
    fi
  done
fi
```

**What to check:**
- If you changed a pattern's input type (added/removed/renamed fields)
- Find all patterns that import and instantiate that pattern
- Update their instantiation calls to match the new type
- Common case: `page-creator.tsx` imports many patterns for its launcher buttons

**Example:** If `hotel-membership-extractor.tsx` input changes from 10 fields to 3 fields, `page-creator.tsx` must be updated to only pass the 3 valid fields.

### Verify Importing Patterns Deploy Successfully

After updating any importing patterns, **you MUST verify they compile and deploy**:

```bash
# For each pattern that imports the changed pattern, test deployment
# Example: if page-creator.tsx imports hotel-membership-extractor.tsx

cd ../labs && deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity /path/to/community-patterns/claude.key \
  --space testing \
  /path/to/community-patterns/patterns/$USER/page-creator.tsx
```

**Why this matters:**
- TypeScript compilation happens at deploy time, not at save time
- A pattern may look fine in your editor but fail to deploy due to type mismatches
- Catching these errors before landing prevents broken patterns on main

**If deployment fails:**
1. Read the error message (usually shows the exact type mismatch)
2. Fix the instantiation call to match the new input type
3. Re-deploy to verify the fix
4. Commit the fix before proceeding

## Step 3: Create PR

```bash
# Check if PR already exists for this branch
EXISTING_PR=$(gh pr view $CURRENT_BRANCH --json number --jq '.number' 2>/dev/null)

if [ -n "$EXISTING_PR" ]; then
  echo "PR #$EXISTING_PR already exists for this branch"
  PR_NUMBER=$EXISTING_PR
else
  # Create new PR
  # Adjust --repo flag based on fork status
  if [ "$IS_FORK" = "true" ]; then
    gh pr create \
      --repo jkomoros/community-patterns \
      --title "$(git log -1 --format=%s)" \
      --body "$(cat <<'EOF'
## Summary
Auto-generated PR for branch landing.

## Testing
- [x] Tested locally

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
  else
    gh pr create \
      --title "$(git log -1 --format=%s)" \
      --body "$(cat <<'EOF'
## Summary
Auto-generated PR for branch landing.

## Testing
- [x] Tested locally

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
  fi

  # Get the PR number
  PR_NUMBER=$(gh pr view --json number --jq '.number')
fi

echo "PR #$PR_NUMBER ready"
```

## Step 4: Merge and Clean Up

```bash
# Merge with rebase strategy and delete branch
gh pr merge $PR_NUMBER --rebase --delete-branch

# Switch back to main
git checkout main

# Pull the merged changes
git pull $MAIN_REMOTE main

# Push to origin (for forks)
if [ "$IS_FORK" = "true" ]; then
  git push origin main
fi

echo "Branch $CURRENT_BRANCH landed successfully!"
```

## Complete One-Liner (For Reference)

If all steps succeed without conflicts, the full flow is:

```bash
BRANCH=$(git branch --show-current) && \
git fetch upstream && \
git rebase upstream/main && \
git push origin $BRANCH --force-with-lease && \
gh pr create --repo jkomoros/community-patterns --title "$(git log -1 --format=%s)" --body "Landing $BRANCH" && \
gh pr merge --rebase --delete-branch && \
git checkout main && \
git pull upstream main && \
git push origin main
```

## Step 4.5: Verify README is Up to Date

**IMPORTANT:** Before landing, verify that `patterns/$GITHUB_USER/README.md` is up to date.

```bash
# Check if any patterns were added/modified
CHANGED_PATTERNS=$(git diff --name-only $MAIN_REMOTE/main...HEAD -- 'patterns/$GITHUB_USER/*.tsx')

if [ -n "$CHANGED_PATTERNS" ]; then
  echo "Patterns changed in this branch:"
  echo "$CHANGED_PATTERNS"
  echo ""
  echo "⚠️  Verify README.md includes entries for any NEW patterns!"
  echo "   Check: patterns/$GITHUB_USER/README.md"
fi
```

**What to check:**
- New patterns should be added to the appropriate section in README.md
- Pattern descriptions should be accurate and up to date
- If a pattern was significantly changed, update its description
- WIP patterns should be documented in the WIP section

**If README needs updating:**
1. Edit `patterns/$GITHUB_USER/README.md` to add/update pattern entries
2. Commit the README update
3. Continue with the merge

## Important Notes

- **Always uses `--rebase`** for merging (preserves commit history)
- **Auto-deletes the branch** after successful merge
- **Force-with-lease** is safe - it only pushes if no one else pushed
- If the PR needs review, stop after Step 3 and wait for approval
- For self-merging (when you have write access), all steps can run automatically
- **Always verify README.md** is current with pattern changes
