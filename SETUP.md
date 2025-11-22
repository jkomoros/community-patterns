# Community Patterns

A community-driven repository for sharing patterns. Each developer works in their own namespace under `patterns/YOUR-USERNAME/`.

## Already Set Up?

If you've already completed the first-time setup:

```bash
cd ~/Code/community-patterns  # Or wherever your Code repo is
claude
```

That's it! Claude auto-starts dev servers and guides you.

---

## First-Time Setup

Complete these steps BEFORE launching Claude Code for the first time. This takes about 30 minutes.

### Step 1: Install Claude Code

**First, install Claude Code itself:**

- Visit: https://claude.com/code
- Download and install Claude Code for your platform
- Launch it once to verify it works

### Step 2: Install Tools

**Check what you already have first:**

```bash
# Check which tools are already installed
git --version 2>/dev/null && echo "✓ git installed" || echo "✗ git not found"
deno --version 2>/dev/null && echo "✓ deno installed" || echo "✗ deno not found"
gh --version 2>/dev/null && echo "✓ gh installed" || echo "✗ gh not found"
node --version 2>/dev/null && echo "✓ node installed" || echo "✗ node not found"
```

**Install only what you need:**

```bash
# 1. Git (ships with macOS)
# If git is not installed, run this to trigger Command Line Tools installation:
git --version
# Click "Install" when prompted

# 2. Install Deno (only if not already installed)
# Following guidance from https://docs.deno.com/runtime/getting_started/installation/
curl -fsSL https://deno.land/x/install/install.sh | sh

# 3. Install Homebrew (only if not already installed - needed for gh)
# Skip if you already have brew
which brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 4. Install GitHub CLI (only if not already installed)
# Following guidance from https://github.com/cli/cli
which gh || brew install gh

# 5. Install NVM and Node.js (only if you don't have node)
# Following guidance from https://github.com/nvm-sh/nvm
if ! command -v node &> /dev/null; then
  # Install NVM
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

  # Load NVM and install Node.js LTS
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
fi

# 6. Verify installations
deno --version
git --version
gh --version
node --version
npm --version

# 7. Authenticate with GitHub (if not already authenticated)
gh auth status || gh auth login
# Choose: GitHub.com → HTTPS → Yes → Login with browser
```

### Step 3: Clone Your Fork

```bash
cd ~/Code

# 1. Fork this repo on GitHub first
# Go to: https://github.com/jkomoros/community-patterns
# Click "Fork"

# 2. Clone your fork
gh repo clone YOUR-USERNAME/community-patterns
cd community-patterns
```

### Step 4: Restart Claude Code

**CRITICAL:** Quit Claude Code completely (Cmd+Q on macOS) and relaunch it.

This repository includes `.mcp.json` which configures Playwright MCP automatically. After restarting, you should see a small "🔌" icon indicating MCP is connected.

---

## ✅ Setup Complete!

Now launch Claude Code and let it guide you through the rest:

```bash
cd ~/Code/community-patterns  # Or wherever your Code repo is
claude
```

**When Claude launches, say:** "Help me get started"

**Note:** Claude will request permissions for various operations (reading files, running commands, etc.). These prompts are normal and expected - approve them to allow Claude to help you set up your environment.

Claude will help you:
- Get your API keys (Anthropic required, others optional)
- Create `.env` file with your API keys
- Create your pattern namespace
- Create identity key
- Build your first pattern

## Repository Structure

```
community-patterns/
├── README.md              # Quick overview with warnings
├── SETUP.md               # This file - setup guide
├── CLAUDE.md              # Claude Code instructions
├── GETTING_STARTED.md     # First-time setup guide
├── DEVELOPMENT.md         # Development workflows
└── patterns/
    ├── examples/          # Community-maintained examples
    │   ├── counter.tsx
    │   └── todo-list.tsx
    └── YOUR-USERNAME/     # Your patterns
        ├── WIP/           # Work in progress
        ├── lib/           # Reference patterns (unchanged)
        └── *.tsx          # Stable patterns
```

## Key Features

✅ **Namespace Isolation** - Everyone works in `patterns/YOUR-USERNAME/`
✅ **Auto-Updates** - Claude pulls latest docs automatically on launch
✅ **Zero Conflicts** - Your namespace is yours alone
✅ **Discover Patterns** - Browse other users' work for inspiration
✅ **Optional Sharing** - Create PRs to contribute back

## Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Complete setup guide for new users
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Daily workflows and best practices
- **[CLAUDE.md](CLAUDE.md)** - Instructions for Claude Code (read automatically)

## Resources

- [Labs Framework](https://github.com/commontoolsinc/labs) - Framework repository
- [Pattern Documentation](https://github.com/commontoolsinc/labs/blob/main/docs/common/PATTERNS.md) - Pattern examples
- [Component Reference](https://github.com/commontoolsinc/labs/blob/main/docs/common/COMPONENTS.md) - UI components

## How It Works

1. **Fork and clone** this repository
2. **Add upstream** remote to get updates
3. **Launch Claude Code** from the repo directory
4. **Claude auto-updates** from upstream and guides you
5. **Create patterns** in your `patterns/USERNAME/` namespace
6. **Commit and push** to your fork
7. **Optional**: Create PR to share patterns with community

## Community Guidelines

- Work only in your `patterns/USERNAME/` directory
- Don't modify other users' patterns
- Keep `lib/` folder for reference patterns (unchanged)
- Use `WIP/` folder for work in progress
- Share your best patterns via PR!

## Getting Help

**Stuck?**
- Check [GETTING_STARTED.md](GETTING_STARTED.md) for setup help
- Check [DEVELOPMENT.md](DEVELOPMENT.md) for workflow help
- Ask Claude Code - it has access to all documentation
- Browse example patterns in `patterns/examples/`

## Concept Guide

For a comprehensive overview of the framework concepts and design:

**[Framework Concept Overview](https://docs.google.com/document/d/13gJ5akQQId9pz1Z2sjzkkTUmHKrHFZaaIMNqm5YsBFU/edit?tab=t.0)**

*Note: If you don't have access to this document, you may need to request access.*

---

## Optional: Workflow Improvement with Happy

**[Happy](https://happy.engineering/)** is a free, open-source mobile app that lets you control Claude Code from your phone or desktop. It's completely optional but can improve your workflow.

### What Happy Provides

- **Voice-to-action** - Execute Claude Code commands hands-free with voice
- **Multiple sessions** - Run several Claude Code instances across different projects simultaneously
- **Mobile access** - Control Claude Code from iOS, Android, or web app
- **End-to-end encryption** - Your code and sessions remain private
- **Real-time notifications** - Stay updated on Claude Code activity from anywhere

### Installation

Requires Node.js 20.0.0 or higher:

```bash
# Install Happy CLI globally
npm install -g happy-coder

# Start Happy (displays QR code to connect your mobile device)
happy

# Scan QR code with mobile app from:
# - iOS: App Store
# - Android: Google Play
# - Web: app.happy.engineering
```

### Useful Commands

```bash
happy            # Start session and show QR code
happy auth       # Manage authentication
happy notify     # Send notifications to your devices
happy doctor     # Run diagnostics if you have issues
```

For more information: [Happy CLI GitHub](https://github.com/slopus/happy-cli)

---

Happy pattern building! 🚀
