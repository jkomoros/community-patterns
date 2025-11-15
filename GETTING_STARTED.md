# Getting Started with Common Tools Pattern Development

Welcome! This guide will help you set up your development environment for building Common Tools patterns.

## The 5-Minute Setup

**Brand new?** Here's the fastest path:

1. **Fork the repo**: Visit [commontools-patterns](https://github.com/commontools-labs/commontools-patterns) → Click "Fork"
2. **Clone it**:
   ```bash
   cd ~/Code
   gh repo clone YOUR-USERNAME/commontools-patterns
   cd commontools-patterns
   ```
3. **Clone labs** (framework):
   ```bash
   cd ~/Code
   gh repo clone commontools-labs/labs
   ```
4. **Start server**: `cd labs && deno task dev`
5. **Launch Claude Code** in the `commontools-patterns` directory:
   ```
   Read CLAUDE.md and help me set up my workspace
   ```

Claude will guide you through creating your pattern namespace and building your first pattern!

---

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Repository Structure](#repository-structure)
3. [Environment Configuration](#environment-configuration)
4. [Your Pattern Workspace](#your-pattern-workspace)
5. [Daily Workflow](#daily-workflow)
6. [Your First Pattern](#your-first-pattern)
7. [Getting Updates](#getting-updates)
8. [Sharing Your Work](#sharing-your-work)

---

## Initial Setup

### Install Required Tools

```bash
# 1. Install Homebrew (macOS)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install required tools
brew install deno git gh

# 3. Verify installations
deno --version
git --version
gh --version

# 4. Authenticate with GitHub
gh auth login
# Choose: GitHub.com → HTTPS → Yes → Login with browser
```

### Get API Keys

You'll need API keys for AI features:

**Anthropic API Key** (required):
- Visit: https://console.anthropic.com/
- Navigate to "API Keys" → Create new key
- Save it securely

**OpenAI API Key** (optional):
- Visit: https://platform.openai.com/
- Navigate to "API Keys" → Create new key
- Save it securely

---

## Repository Structure

You'll work with two repositories:

```
~/Code/
├── labs/                    # Framework (READ-ONLY)
│   └── ...                  # Dev server runs here
└── commontools-patterns/    # Your fork (WRITABLE)
    ├── CLAUDE.md
    ├── GETTING_STARTED.md
    └── patterns/
        ├── examples/        # Shared examples
        ├── alice/           # Alice's patterns
        ├── bob/             # Bob's patterns
        └── YOUR-USERNAME/   # YOUR patterns
```

**Key principle**: Everyone works in `patterns/YOUR-USERNAME/` - no conflicts!

### Clone the Repositories

```bash
cd ~/Code

# 1. Fork and clone commontools-patterns
# Go to: https://github.com/commontools-labs/commontools-patterns
# Click "Fork" to create your fork
gh repo clone YOUR-USERNAME/commontools-patterns
cd commontools-patterns

# 2. Add upstream remote (to get updates)
git remote add upstream https://github.com/commontools-labs/commontools-patterns.git
git fetch upstream

# 3. Clone labs (framework - READ ONLY)
cd ~/Code
gh repo clone commontools-labs/labs
```

---

## Environment Configuration

### Set Up Dev Server

Create `.env` file in the `labs` directory:

```bash
cd ~/Code/labs

cat > .env << 'EOF'
# Anthropic API Key (required for Claude models)
ANTHROPIC_API_KEY=sk-ant-xxxx-your-actual-key-here

# OpenAI API Key (optional, for GPT models)
OPENAI_API_KEY=sk-xxxx-your-actual-key-here

# Server configuration
PORT=8000
HOST=localhost
EOF

chmod 600 .env
```

### Test Your Setup

```bash
cd ~/Code/labs
deno task dev

# You should see: "Server running at http://localhost:8000"
# Open browser to verify: http://localhost:8000
```

Keep this terminal running - you'll need the server for development.

---

## Your Pattern Workspace

### Create Your Namespace

```bash
cd ~/Code/commontools-patterns

# Create your directory (use your GitHub username)
mkdir -p patterns/YOUR-USERNAME
cd patterns/YOUR-USERNAME

# Create a README (optional but recommended)
cat > README.md << 'EOF'
# My Common Tools Patterns

Personal collection of Common Tools patterns.

## Patterns

- (patterns will be listed here as you create them)
EOF

# Commit and push
cd ~/Code/commontools-patterns
git add patterns/YOUR-USERNAME/
git commit -m "Create my pattern namespace"
git push origin main
```

### Store Your Identity Key

```bash
cd ~/Code/commontools-patterns/patterns/YOUR-USERNAME

# Create identity key for deploying patterns
deno task -c ~/Code/labs/deno.json ct id new > claude.key
chmod 600 claude.key

# This file is gitignored - never committed
```

---

## Daily Workflow

### Morning Boot-Up

```bash
# Terminal 1: Start dev server
cd ~/Code/labs
deno task dev
# Leave running

# Terminal 2: Your workspace
cd ~/Code/commontools-patterns

# Launch Claude Code from here
```

### Development Cycle

**1. Create a Pattern**

```bash
cd ~/Code/commontools-patterns/patterns/YOUR-USERNAME
# Create your pattern file: my-pattern.tsx
```

**2. Test Syntax**

```bash
cd ~/Code/labs
deno task ct dev ../commontools-patterns/patterns/YOUR-USERNAME/my-pattern.tsx --no-run
```

**3. Deploy Locally**

```bash
cd ~/Code/labs

deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../commontools-patterns/patterns/YOUR-USERNAME/claude.key \
  --space my-space \
  ../commontools-patterns/patterns/YOUR-USERNAME/my-pattern.tsx

# Note the charm ID from output
```

**4. Test in Browser**

Open: `http://localhost:8000/my-space/CHARM-ID`

**5. Update Pattern**

```bash
# Make changes to your pattern

# Update deployed charm (faster than deploying new)
cd ~/Code/labs
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../commontools-patterns/patterns/YOUR-USERNAME/claude.key \
  --space my-space \
  --charm CHARM-ID \
  ../commontools-patterns/patterns/YOUR-USERNAME/my-pattern.tsx
```

**6. Commit Your Work**

```bash
cd ~/Code/commontools-patterns

git status
git add patterns/YOUR-USERNAME/my-pattern.tsx
git commit -m "Add my pattern"
git push origin main
```

---

## Your First Pattern

Let's build a simple counter:

### Step 1: Create the File

```bash
cd ~/Code/commontools-patterns/patterns/YOUR-USERNAME
touch counter.tsx
```

### Step 2: Write the Pattern

```typescript
/// <cts-enable />
import { Cell, NAME, pattern, UI } from "commontools";

interface CounterInput {
  count: Cell<number>;
}

interface CounterOutput {
  count: Cell<number>;
}

export default pattern<CounterInput, CounterOutput>(
  "Counter",
  ({ count }) => {
    return {
      [NAME]: "My Counter",
      [UI]: (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1>Count: {count}</h1>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button onClick={() => count.set(count.get() - 1)}>-</button>
            <button onClick={() => count.set(0)}>Reset</button>
            <button onClick={() => count.set(count.get() + 1)}>+</button>
          </div>
        </div>
      ),
      count,
    };
  }
);
```

### Step 3: Deploy and Test

```bash
# Test syntax
cd ~/Code/labs
deno task ct dev ../commontools-patterns/patterns/YOUR-USERNAME/counter.tsx --no-run

# Deploy
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../commontools-patterns/patterns/YOUR-USERNAME/claude.key \
  --space my-space \
  ../commontools-patterns/patterns/YOUR-USERNAME/counter.tsx

# Open in browser: http://localhost:8000/my-space/CHARM-ID
```

### Step 4: Commit

```bash
cd ~/Code/commontools-patterns
git add patterns/YOUR-USERNAME/counter.tsx
git commit -m "Add counter pattern"
git push origin main
```

Congratulations! You've built your first pattern!

---

## Getting Updates

### Pull Latest Docs and Examples

```bash
cd ~/Code/commontools-patterns

# Get updates from upstream
git fetch upstream
git merge upstream/main

# Or use rebase
git pull --rebase upstream main

# Push merged changes to your fork
git push origin main
```

This updates:
- ✅ CLAUDE.md with latest instructions
- ✅ GETTING_STARTED.md with improvements
- ✅ New example patterns in `patterns/examples/`
- ✅ Other people's patterns (if they contributed)

### Browse Other Patterns

```bash
cd ~/Code/commontools-patterns/patterns

# See what others have built
ls -la

# Look at specific user's patterns
ls alice/
ls bob/

# Copy an interesting pattern to study
cp alice/shopping-list.tsx YOUR-USERNAME/study-shopping-list.tsx
```

---

## Sharing Your Work

### Option 1: Keep Private

Just push to your fork:
```bash
git push origin main
# Your fork is private - only you can see it
```

### Option 2: Share Publicly

Make your fork public:
1. Go to your fork on GitHub
2. Settings → Danger Zone → Change visibility → Public

### Option 3: Contribute Upstream

Create a PR to share with everyone:
```bash
# Push your changes
git push origin main

# Create PR
gh pr create \
  --repo commontools-labs/commontools-patterns \
  --title "Add shopping list pattern" \
  --body "New shopping list pattern with categories"
```

Your patterns will be reviewed and merged, making them available to everyone!

---

## Learning Resources

### Documentation

In the `commontools-patterns` repo:
- `CLAUDE.md` - Claude Code session guide
- `GETTING_STARTED.md` - This guide
- `patterns/examples/` - Working example patterns

In the `labs` repo:
- `docs/common/PATTERNS.md` - Pattern examples and best practices
- `docs/common/COMPONENTS.md` - UI components reference
- `docs/common/CELLS_AND_REACTIVITY.md` - How reactivity works

### Ask Claude Code

Claude Code has access to all documentation:
```
"Show me example patterns that use generateObject"
"How do I work with arrays in patterns?"
"Explain the pattern in patterns/examples/todo-list.tsx"
"What's wrong with this error: [paste error]"
```

### Study Examples

```bash
# Copy example to study
cd ~/Code/commontools-patterns
cp patterns/examples/todo-list.tsx patterns/YOUR-USERNAME/study-todo.tsx

# Ask Claude to explain it
# In Claude Code: "Explain how study-todo.tsx works"
```

---

## Troubleshooting

### Server Won't Start

```bash
# Check what's using port 8000
lsof -i :8000

# Kill it or use different port
PORT=8001 deno task dev
```

### Pattern Won't Deploy

1. Is dev server running?
2. Check syntax: `ct dev pattern.tsx --no-run`
3. Verify identity key exists: `ls patterns/YOUR-USERNAME/claude.key`

### Can't Pull from Upstream

```bash
# Verify remotes
git remote -v

# Should show:
# origin    (your fork)
# upstream  (commontools-labs)

# Add upstream if missing
git remote add upstream https://github.com/commontools-labs/commontools-patterns.git
```

### Changes Not Showing in Browser

1. Did you run `charm setsrc` after changes?
2. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
3. Check you're at the right URL

---

## Quick Reference

### Daily Commands

```bash
# Start dev server (Terminal 1)
cd ~/Code/labs && deno task dev

# Your workspace (Terminal 2)
cd ~/Code/commontools-patterns/patterns/YOUR-USERNAME

# Test syntax
cd ~/Code/labs
deno task ct dev ../commontools-patterns/patterns/YOUR-USERNAME/PATTERN.tsx --no-run

# Deploy
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../commontools-patterns/patterns/YOUR-USERNAME/claude.key \
  --space my-space \
  ../commontools-patterns/patterns/YOUR-USERNAME/PATTERN.tsx

# Update existing charm
cd ~/Code/labs
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../commontools-patterns/patterns/YOUR-USERNAME/claude.key \
  --space my-space \
  --charm CHARM-ID \
  ../commontools-patterns/patterns/YOUR-USERNAME/PATTERN.tsx
```

### Git Commands

```bash
# Commit your work
cd ~/Code/commontools-patterns
git add patterns/YOUR-USERNAME/
git commit -m "Add new pattern"
git push origin main

# Get updates
git fetch upstream
git merge upstream/main
git push origin main
```

---

## Next Steps

1. **Build more patterns**: Try todo lists, shopping lists, note-takers
2. **Use LLMs**: Explore `generateObject` for AI features
3. **Study examples**: Look in `patterns/examples/`
4. **Browse others' work**: Check `patterns/alice/`, `patterns/bob/`, etc.
5. **Share your patterns**: Create PRs to contribute back

Happy pattern building! 🚀
