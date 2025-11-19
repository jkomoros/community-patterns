# Pattern Launcher CLI

Quick interactive tool to deploy CommonTools patterns without typing long bash commands.

## Quick Start

```bash
cd ~/Code/community-patterns
./tools/launch.ts
```

## Features

- 🚀 **One-command deployment** - No more long bash commands
- 📝 **Remembers your last space** - Quick repeat deployments
- 📋 **Pattern history** - Recently used patterns at your fingertips
- 📁 **Interactive directory browser** - Navigate and pick patterns visually
- 🔗 **Full URL output** - Get clickable charm URL immediately
- ⚙️ **Auto-configuration** - Detects labs directory automatically
- 🌐 **Production support** - Deploy to production with `--prod` flag

## Usage

### Basic Usage

```bash
./tools/launch.ts
```

This will:
1. Prompt for space name (defaults to last used)
2. Show recent patterns or let you browse
3. Deploy the pattern
4. Print the full URL with charm ID
5. Exit immediately

### Deploy to Production

```bash
./tools/launch.ts --prod
```

Uses `https://api.commontools.io` instead of `http://localhost:8000`.

## Interactive Flow

### Main Menu

```
🚀 Pattern Launcher

Enter space name [test-space]: my-space

📋 Select a pattern:

  [Recent Patterns]
  1. cozy-poll.tsx (5 min ago)
  2. group-voter.tsx (yesterday)
  3. shopping-list.tsx (3 days ago)

  [Actions]
  b. Browse for a new pattern
  q. Quit

Enter selection:
```

### Directory Browser

Select `b` to browse:

```
📁 /path/to/community-patterns/patterns/

  1. 📁 examples
  2. 📁 jkomoros
  3. 📁 yourname

  [Actions]
  .. Go up one directory
  p. Enter absolute path manually
  q. Cancel

Enter selection: 3
```

Navigate into directories:

```
📁 /path/to/community-patterns/patterns/yourname/

  1. 📁 WIP
  2. 📄 my-stable-pattern.tsx

  [Actions]
  .. Go up one directory
  p. Enter absolute path manually
  q. Cancel

Enter selection: 1
```

Pick a pattern:

```
📁 /path/to/community-patterns/patterns/yourname/WIP/

  1. 📄 cozy-poll.tsx
  2. 📄 experimental-chat.tsx

  [Actions]
  .. Go up one directory
  p. Enter absolute path manually
  q. Cancel

Enter selection: 1
```

### Deployment Output

```
🚀 Deploying...
  Pattern: cozy-poll.tsx
  Space: my-space
  API: http://localhost:8000
  Identity: /path/to/claude.key

[deployment output...]

✅ Deployed successfully!

🔗 http://localhost:8000/my-space/abc123-def456-ghi789

[exits immediately - copy/paste URL to browser]
```

## Configuration

The tool stores its configuration in `.launcher-config` at the repository root (gitignored).

**Config file structure:**
```json
{
  "lastSpace": "my-space",
  "labsDir": "/custom/path/to/labs",
  "patterns": [
    {
      "path": "/path/to/pattern.tsx",
      "lastUsed": "2025-01-19T12:34:56.789Z"
    }
  ]
}
```

### Labs Directory Detection

The tool automatically detects your labs directory:

1. **First try:** `../labs` (relative to community-patterns)
2. **If not found:** Prompts you to enter the path
3. **Saves it:** Stores custom path in config for future runs

### Identity Key

Uses `claude.key` from the community-patterns root directory.

If you need a different identity key location, you'll need to modify `IDENTITY_PATH` in `launch.ts`.

## Pattern History

- **Stores:** Last 50 patterns used
- **Shows:** Most recent 10 in the main menu
- **Sorts:** Most recently used first
- **Format:** Relative path with time ago (e.g., "5 min ago", "yesterday")

## Tips

- **Quick re-deploy:** Just hit Enter on space name, then pick from recent list
- **Navigate with numbers:** Type 1, 2, 3, etc. to select items
- **Go up:** Type `..` to navigate to parent directory
- **Manual path:** Type `p` to enter an absolute path if needed
- **Quit anytime:** Type `q` to cancel

## Troubleshooting

### "Could not find labs directory"

The tool couldn't find labs at the default location (`../labs`). You'll be prompted to enter the path manually.

### "❌ Deployment failed"

Check that:
- Dev servers are running (toolshed on port 8000)
- Identity key exists at repository root
- Pattern file is valid TypeScript/TSX

### "❌ File not found"

The pattern file path doesn't exist. Double-check the path when browsing manually.

## Files

- `launch.ts` - Main CLI script (executable)
- `CLI-LAUNCHER-PRD.md` - Product requirements document
- `.launcher-config` - User configuration (gitignored, auto-generated)

## Development

Want to modify the launcher? The code is well-commented and organized:

- **Configuration** - Lines 9-26: Paths and interfaces
- **Utility Functions** - Lines 28-87: Helpers for formatting and prompts
- **Main Functions** - Lines 89-358: Core logic for pattern selection and deployment
- **Entry Point** - Lines 383-424: Main flow

## Contributing

This tool lives in the community-patterns repository. Improvements welcome!

1. Make changes to `tools/launch.ts`
2. Test thoroughly
3. Update this README if needed
4. Submit PR

---

**Generated with [Claude Code](https://claude.ai/code) via [Happy](https://happy.engineering)**
