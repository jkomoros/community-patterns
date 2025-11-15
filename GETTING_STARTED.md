# Getting Started with Common Tools Pattern Development

Welcome! This guide will help you set up your development environment for building Common Tools patterns.

## Setup Overview

**IMPORTANT:** Setup is split into two phases to avoid interruptions:

**Phase 1: Pre-Setup** (30 minutes - do this BEFORE launching Claude Code)
- Install all tools
- Configure MCP servers
- Get API keys
- Clone repositories
- **Restart Claude Code** (required for MCP to load)

**Phase 2: Workspace Setup** (10 minutes - Claude Code will help)
- Configure environment
- Create your pattern workspace
- Build your first pattern

This split prevents confusing intermediate states when you need to restart Claude Code.

---

## Table of Contents

1. [Phase 1: Pre-Setup (Do First)](#phase-1-pre-setup-do-first)
2. [Phase 2: Workspace Setup (Claude Helps)](#phase-2-workspace-setup-claude-helps)
3. [Daily Workflow](#daily-workflow)
4. [Your First Pattern](#your-first-pattern)
5. [Getting Updates](#getting-updates)
6. [Sharing Your Work](#sharing-your-work)

---

## Phase 1: Pre-Setup (Do First)

**Complete all these steps BEFORE launching Claude Code for the first time.**

This phase includes everything that requires restarts or manual configuration. Do all of these steps, then restart Claude Code at the end.

### Step 1: Install Required Tools

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

### Step 2: Get API Keys

**Anthropic API Key** (REQUIRED):
- Visit: https://console.anthropic.com/
- Navigate to "API Keys" → Create new key
- Save it securely
- **This is the only required key to get started**

**Optional keys** (only needed for specific features):

**Jina AI API Key** (optional - for web search in patterns):
- Visit: https://jina.ai/
- Sign up/login → Navigate to API Keys
- Create new key
- Only needed if your patterns use web search features

**Google OAuth Credentials** (optional - for Gmail patterns):
- Visit: https://console.cloud.google.com/apis/credentials
- Create OAuth 2.0 Client ID
- Only needed if you want to use patterns that import Gmail

### Step 3: Clone Repositories

You'll work with two repositories:

```
~/Code/
├── labs/                    # Framework (READ-ONLY)
│   └── ...                  # Dev server runs here
└── community-patterns/    # Your fork (WRITABLE)
    ├── CLAUDE.md
    ├── GETTING_STARTED.md
    └── patterns/
        ├── examples/        # Shared examples
        ├── alice/           # Alice's patterns
        ├── bob/             # Bob's patterns
        └── YOUR-USERNAME/   # YOUR patterns
```

**Key principle**: Everyone works in `patterns/YOUR-USERNAME/` - no conflicts!

```bash
cd ~/Code

# 1. Fork and clone community-patterns
# Go to: https://github.com/commontoolsinc/community-patterns
# Click "Fork" to create your fork
gh repo clone YOUR-USERNAME/community-patterns
cd community-patterns

# 2. Add upstream remote (to get updates)
git remote add upstream https://github.com/commontoolsinc/community-patterns.git
git fetch upstream

# 3. Clone labs (framework - READ ONLY)
cd ~/Code
gh repo clone commontoolsinc/labs
```

### Step 4: Install and Configure Playwright MCP (Optional but Recommended)

MCP (Model Context Protocol) servers extend Claude Code's capabilities. The Playwright MCP enables automated browser testing of your patterns.

**Install Playwright MCP:**

```bash
npm install -g @modelcontextprotocol/server-playwright
```

**Configure Claude Code** (do this manually):

Create or edit your Claude Code MCP configuration:

**On macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**On Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**On Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-playwright"
      ]
    }
  }
}
```

### Step 5: Restart Claude Code

**CRITICAL:** You must restart Claude Code for MCP to load.

After updating the config:
1. Quit Claude Code completely (Cmd+Q on macOS, Alt+F4 on Windows)
2. Relaunch Claude Code
3. You should see a small "🔌" icon indicating MCP servers are connected

**To verify**: Ask Claude Code "Can you use Playwright?" and it should confirm.

**Why use Playwright?**
- Test your patterns automatically in a real browser
- Claude can navigate, click, fill forms, and verify behavior
- Catch bugs before manually testing
- Document expected behavior

---

## ✅ Phase 1 Complete!

You've installed all tools, cloned repositories, and configured MCP. Now Claude Code can help with the rest!

---

## Phase 2: Workspace Setup (Claude Helps)

**Launch Claude Code from the `community-patterns` directory:**

```bash
cd ~/Code/community-patterns
# Launch Claude Code here
```

Tell Claude: "Help me complete Phase 2 setup"

Claude will now guide you through:
- Creating `.env` file with your API keys
- Creating your pattern namespace
- Creating identity key and workspace config
- Building your first pattern

Claude will guide you through creating:

**1. .env File**
- Location: `labs/packages/toolshed/.env`
- Includes your Anthropic API key
- Optional: Jina and Google OAuth keys

**2. Your Pattern Namespace**
- Directory: `patterns/YOUR-USERNAME/`
- README file for your patterns

**3. Identity Key and Workspace Config**
- Identity key: `claude.key` (at repo root)
- Workspace config: `.claude-workspace`
- Both files are gitignored

**4. Your First Pattern**
- Claude will walk you through creating a simple counter pattern
- Test it in the browser
- Commit it to your repository

That's it! Claude handles all the details.

---

## Daily Workflow

### Morning Boot-Up

**Note:** Claude Code will auto-start the dev servers, but if you want to run them manually:

```bash
# Terminal 1: Toolshed (backend)
cd ~/Code/labs/packages/toolshed
deno task dev
# Leave running

# Terminal 2: Shell (frontend)
cd ~/Code/labs/packages/shell
deno task dev-local
# Leave running

# Terminal 3: Your workspace
cd ~/Code/community-patterns
# Launch Claude Code from here
```

**Or just launch Claude Code** - it will start both servers automatically if needed.

### Development Cycle

**1. Create a Pattern**

```bash
cd ~/Code/community-patterns/patterns/YOUR-USERNAME
# Create your pattern file: my-pattern.tsx
```

**2. Test Syntax**

```bash
cd ~/Code/labs
deno task ct dev ../community-patterns/patterns/YOUR-USERNAME/my-pattern.tsx --no-run
```

**3. Deploy Locally**

```bash
cd ~/Code/labs

deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  ../community-patterns/patterns/YOUR-USERNAME/my-pattern.tsx

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
  --identity ../community-patterns/claude.key \
  --space my-space \
  --charm CHARM-ID \
  ../community-patterns/patterns/YOUR-USERNAME/my-pattern.tsx
```

**6. Commit Your Work**

```bash
cd ~/Code/community-patterns

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
cd ~/Code/community-patterns/patterns/YOUR-USERNAME
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
deno task ct dev ../community-patterns/patterns/YOUR-USERNAME/counter.tsx --no-run

# Deploy
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  ../community-patterns/patterns/YOUR-USERNAME/counter.tsx

# Open in browser: http://localhost:8000/my-space/CHARM-ID
```

### Step 4: Commit

```bash
cd ~/Code/community-patterns
git add patterns/YOUR-USERNAME/counter.tsx
git commit -m "Add counter pattern"
git push origin main
```

Congratulations! You've built your first pattern!

---

## Getting Updates

### Pull Latest Docs and Examples

```bash
cd ~/Code/community-patterns

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
cd ~/Code/community-patterns/patterns

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
  --repo commontoolsinc/community-patterns \
  --title "Add shopping list pattern" \
  --body "New shopping list pattern with categories"
```

Your patterns will be reviewed and merged, making them available to everyone!

---

## Learning Resources

### Documentation

In the `community-patterns` repo:
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
cd ~/Code/community-patterns
cp patterns/examples/todo-list.tsx patterns/YOUR-USERNAME/study-todo.tsx

# Ask Claude to explain it
# In Claude Code: "Explain how study-todo.tsx works"
```

---

## Troubleshooting

### Server Won't Start

```bash
# Check what's using port 8000 (toolshed)
lsof -i :8000

# Check what's using port 5173 (shell)
lsof -i :5173

# Kill conflicting processes
kill $(lsof -ti:8000)
kill $(lsof -ti:5173)

# Restart both servers
cd ~/Code/labs/packages/toolshed && deno task dev &
cd ~/Code/labs/packages/shell && deno task dev-local &
```

### Pattern Won't Deploy

1. Are both dev servers running? (Check ports 8000 and 5173)
2. Check syntax: `ct dev pattern.tsx --no-run`
3. Verify identity key exists: `ls claude.key`

### Can't Pull from Upstream

```bash
# Verify remotes
git remote -v

# Should show:
# origin    (your fork)
# upstream  (commontoolsinc)

# Add upstream if missing
git remote add upstream https://github.com/commontoolsinc/community-patterns.git
```

### Changes Not Showing in Browser

1. Did you run `charm setsrc` after changes?
2. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
3. Check you're at the right URL

---

## Quick Reference

### Daily Commands

```bash
# Start dev servers (Claude Code does this automatically, but if manual:)
# Terminal 1: Toolshed
cd ~/Code/labs/packages/toolshed && deno task dev

# Terminal 2: Shell
cd ~/Code/labs/packages/shell && deno task dev-local

# Your workspace (Terminal 3 or just let Claude Code handle servers)
cd ~/Code/community-patterns/patterns/YOUR-USERNAME

# Test syntax
cd ~/Code/labs
deno task ct dev ../community-patterns/patterns/YOUR-USERNAME/PATTERN.tsx --no-run

# Deploy
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  ../community-patterns/patterns/YOUR-USERNAME/PATTERN.tsx

# Update existing charm
cd ~/Code/labs
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  --charm CHARM-ID \
  ../community-patterns/patterns/YOUR-USERNAME/PATTERN.tsx
```

### Git Commands

```bash
# Commit your work
cd ~/Code/community-patterns
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
