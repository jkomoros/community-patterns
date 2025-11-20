# Getting Started with Pattern Development

**Note:** This guide is for Claude Code to use when guiding new users through workspace setup. Users should complete the pre-setup steps in SETUP.md first.

---

## Workspace Setup

User has already completed Phase 1 (in SETUP.md):
- ✅ Installed Claude Code
- ✅ Installed tools (deno, gh, nvm/node) and verified git is available
- ✅ Cloned their fork of community-patterns (includes `.mcp.json` for Playwright)
- ✅ Restarted Claude Code (MCP auto-configured from `.mcp.json`)

Now guide them through cloning dependencies, getting API keys, and creating their workspace.

---

## Set Up Path Variables

**Set these variables once at the beginning - you'll use them throughout setup:**

```bash
# Set base directory paths (only need to do this once)
COMMUNITY_PATTERNS_DIR="$(git rev-parse --show-toplevel)"
PARENT_DIR="$COMMUNITY_PATTERNS_DIR/.."
LABS_DIR="$PARENT_DIR/labs"

echo "Working directory: $COMMUNITY_PATTERNS_DIR"
```

**Tell the user:** "I've set up the working directories. Now let's clone the dependencies."

---

## Step 1: Clone Required Repositories

Clone the labs repository (required) and recipes repository (optional, if accessible) as peers to community-patterns.

```bash
# Go to parent directory of community-patterns (clone as peers)
cd "$PARENT_DIR"

# Clone labs (framework - REQUIRED, READ ONLY)
gh repo clone commontoolsinc/labs

# Try to clone recipes (optional - don't worry if this fails)
gh repo clone commontoolsinc/recipes 2>/dev/null || echo "Note: recipes repo not accessible (this is fine)"
```

**Tell the user:** "I've cloned the Common Tools framework repository (labs) as a peer to your community-patterns directory. The recipes repository is optional and may not be accessible depending on your permissions."

---

## Step 2: Get API Keys

**Guide user to get their API keys.**

**Anthropic API Key** (REQUIRED):
1. Visit: https://console.anthropic.com/
2. Navigate to "API Keys" → Create new key
3. Save it securely - they'll need it in the next step
4. **This is the only required key to get started**

**Optional keys** (only needed for specific features):

**Jina AI** (for web search in patterns):
1. Visit: https://jina.ai/
2. Sign up/login → API Keys → Create key
3. Save it securely

**Google OAuth** (for Gmail patterns):
1. Visit: https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add redirect URI: `http://localhost:8000/api/integrations/google-oauth/callback`
4. Save Client ID and Client Secret

Tell user: "You can skip the optional keys for now and add them later if needed."

---

## Step 3: Create .env File

Guide user to create `.env` file in `labs/packages/toolshed` with their API keys.

```bash
cd "$LABS_DIR/packages/toolshed"

cat > .env << 'EOF'
ENV=development
PORT=8000
LOG_LEVEL=info

# Shell frontend URL for local development
SHELL_URL=http://localhost:5173

## OpenTelemetry Configuration (disabled for local dev)
OTEL_ENABLED=false

## REQUIRED: Anthropic API Key
# Get from: https://console.anthropic.com/
CTTS_AI_LLM_ANTHROPIC_API_KEY=sk-ant-xxxx-their-actual-key-here

## OPTIONAL: Jina AI web reader API key (only needed for web search in patterns)
# Get from: https://jina.ai/
# JINA_API_KEY=jina_xxxx-their-actual-key-here

## OPTIONAL: Google OAuth Credentials (only needed for Gmail patterns)
## Get from: https://console.cloud.google.com/apis/credentials
## Add redirect URI: http://localhost:8000/api/integrations/google-oauth/callback
# GOOGLE_CLIENT_ID=your-client-id-here
# GOOGLE_CLIENT_SECRET=your-client-secret-here
EOF

chmod 600 .env
```

**Ask user for their Anthropic API key** and replace `sk-ant-xxxx-their-actual-key-here` with it.

---

## Step 4: Create Pattern Namespace

Create the user's pattern directory:

```bash
cd "$COMMUNITY_PATTERNS_DIR"

# Get username from git origin
GITHUB_USER=$(git remote get-url origin | sed -E 's/.*[:/]([^/]+)\/community-patterns.*/\1/')

# Create their directory
mkdir -p patterns/$GITHUB_USER

# Create README
cat > patterns/$GITHUB_USER/README.md << 'EOF'
# My Patterns

Personal collection of patterns.

## Patterns

- (patterns will be listed here as you create them)
EOF

# Commit and push
git add patterns/$GITHUB_USER/
git commit -m "Create my pattern namespace"
git push origin main
```

---

## Step 5: Create Identity Key and Workspace Config

```bash
cd "$COMMUNITY_PATTERNS_DIR"

# Create identity key (at repo root)
deno task -c "$LABS_DIR/deno.json" ct id new > claude.key
chmod 600 claude.key

# Get username
GITHUB_USER=$(git remote get-url origin | sed -E 's/.*[:/]([^/]+)\/community-patterns.*/\1/')

# Detect if this is a fork (has upstream remote)
if git remote get-url upstream >/dev/null 2>&1; then
  IS_FORK=true
else
  IS_FORK=false
fi

# Create workspace config
cat > .claude-workspace << EOF
username=$GITHUB_USER
is_fork=$IS_FORK
setup_complete=true
EOF

echo "Created workspace for: $GITHUB_USER"
echo "Repository type: $([ "$IS_FORK" = "true" ] && echo "fork" || echo "upstream")"
```

---

## Step 6: Start Dev Servers (If Needed)

**First, check if the user has already started the dev servers:**

```bash
# Check both ports
TOOLSHED_RUNNING=$(lsof -ti:8000 > /dev/null 2>&1 && echo "yes" || echo "no")
SHELL_RUNNING=$(lsof -ti:5173 > /dev/null 2>&1 && echo "yes" || echo "no")

if [ "$TOOLSHED_RUNNING" = "yes" ] && [ "$SHELL_RUNNING" = "yes" ]; then
  echo "✓ Both dev servers already running - skipping startup"
  echo "  - Toolshed: http://localhost:8000"
  echo "  - Shell: http://localhost:5173"
elif [ "$TOOLSHED_RUNNING" = "yes" ]; then
  echo "✓ Toolshed already running on port 8000"
  echo "Starting shell on port 5173..."
  cd "$LABS_DIR/packages/shell" && deno task dev-local > /tmp/shell-dev.log 2>&1 &
  sleep 3
  echo "Shell server started"
elif [ "$SHELL_RUNNING" = "yes" ]; then
  echo "✓ Shell already running on port 5173"
  echo "Starting toolshed on port 8000..."
  cd "$LABS_DIR/packages/toolshed" && deno task dev > /tmp/toolshed-dev.log 2>&1 &
  sleep 3
  echo "Toolshed server started"
else
  echo "Starting both dev servers..."
  cd "$LABS_DIR/packages/toolshed" && deno task dev > /tmp/toolshed-dev.log 2>&1 &
  cd "$LABS_DIR/packages/shell" && deno task dev-local > /tmp/shell-dev.log 2>&1 &
  sleep 3
  echo "Dev servers started"
fi

echo ""
echo "Dev servers ready at http://localhost:8000"
```

**Tell the user:** If both servers were already running, inform them: "Your dev servers are already running, so I've skipped starting them."

---

## Step 7: Register User and Save Passphrase

Open the test space in Playwright to register the user.

**Tell the user:** "I'm going to open a browser so you can register. You'll need to click 'Register', then 'Generate Passphrase', and paste it back to me so I can save it for future use."

```bash
# Open browser with Playwright MCP
# Use playwright mcp to navigate to http://localhost:8000
```

**Wait for user to:**
1. Click "Register" button in the browser
2. Click "Generate Passphrase" button
3. Copy the passphrase

**Ask user:** "Please paste the passphrase you generated:"

**After receiving passphrase, save it:**

```bash
cd "$COMMUNITY_PATTERNS_DIR"

# Save passphrase to file (will be gitignored)
cat > .passphrase << EOF
# User Passphrase
# Keep this safe - you'll need it to access your spaces
# Generated: $(date)

PASSPHRASE_GOES_HERE
EOF

chmod 600 .passphrase

echo "Passphrase saved to .passphrase (this file is gitignored)"
```

---

## Step 8: Create First Pattern

Copy the example counter pattern to the user's directory:

```bash
cd "$COMMUNITY_PATTERNS_DIR"

# Copy the working example counter
cp patterns/examples/counter.tsx patterns/$GITHUB_USER/counter.tsx

echo "Created test pattern at patterns/$GITHUB_USER/counter.tsx"
```

**Tell the user:** "I've copied a working counter pattern to your directory. Let's deploy it to make sure everything is working."

---

## Step 9: Test Pattern

Deploy and test the counter:

```bash
# Test syntax
cd "$LABS_DIR"
deno task ct dev "$COMMUNITY_PATTERNS_DIR/patterns/$GITHUB_USER/counter.tsx" --no-run

# Deploy (if syntax check passes)
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity "$COMMUNITY_PATTERNS_DIR/claude.key" \
  --space test-$GITHUB_USER-1 \
  "$COMMUNITY_PATTERNS_DIR/patterns/$GITHUB_USER/counter.tsx"

# Note the charm ID from output
```

**Open in Playwright to verify it works:**

Use Playwright MCP to navigate to: `http://localhost:8000/test-$GITHUB_USER-1/CHARM-ID`

**Once you see the counter rendering on screen, STOP HERE.**

---

## ✅ Setup Complete!

**Tell the user:** "Great! Your test pattern is working. The setup is now complete. What would you like to build next?"

**Do NOT commit the test pattern - it was just for verification.**

User is now ready to build patterns. When they're ready, remind them:
- Patterns go in `patterns/$GITHUB_USER/WIP/` while developing
- Move to root level when stable and tested
- Claude auto-starts dev servers on future sessions
- Check DEVELOPMENT.md for daily workflows

---

## Daily Workflow Reference

For future sessions, user just needs to:

```bash
cd /path/to/community-patterns  # Wherever they cloned it
claude
```

Claude will:
- Auto-start both dev servers if needed
- Check for upstream updates
- Guide pattern development
