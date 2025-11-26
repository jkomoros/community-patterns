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

## Important Notes

- **Always uses `--rebase`** for merging (preserves commit history)
- **Auto-deletes the branch** after successful merge
- **Force-with-lease** is safe - it only pushes if no one else pushed
- If the PR needs review, stop after Step 3 and wait for approval
- For self-merging (when you have write access), all steps can run automatically
