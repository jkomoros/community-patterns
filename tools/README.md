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
- ⬆️⬇️ **Arrow key navigation** - Use ↑/↓ and Enter to select, no typing numbers
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

### Space Selection

```
🚀 Pattern Launcher

Select space (↑/↓ to move, Enter to select):

→ alex-1119-1 (last used)
  alex-1119-2 (next)
  ✨ Enter new space name...

[Use arrow keys, press Enter]
```

The tool intelligently suggests the next space name:
- If last space was `alex-1119-1` → suggests `alex-1119-2` (increments trailing number)
- If last space was `alex-1119` → suggests `alex-1119-1` (appends `-1`)
- If last space was `test-space` → suggests `test-space-1`

### Pattern Selection

```
📋 Select a pattern (↑/↓ to move, Enter to select, Q to quit):

→ 📄 cozy-poll.tsx  (community-patterns/jkomoros/WIP) (5 min ago)
  📄 group-voter.tsx  (recipes/alex) (yesterday)
  📄 shopping-list.tsx  (labs/examples) (3 days ago)
  📁 Browse for a new pattern...

[Use arrow keys to highlight, press Enter to select]
```

### Directory Browser

Select "Browse for a new pattern...":

```
📁 /path/to/community-patterns/patterns/
(↑/↓ to move, Enter to select, Q to cancel)

→ 📁 examples
  📁 jkomoros
  📁 yourname
  ⬆️  .. (Go up one directory)
  ✏️  Enter absolute path manually...

[Use arrow keys, press Enter when on "yourname"]
```

Navigate into directories:

```
📁 /path/to/community-patterns/patterns/yourname/
(↑/↓ to move, Enter to select, Q to cancel)

→ 📁 WIP
  📄 my-stable-pattern.tsx
  ⬆️  .. (Go up one directory)
  ✏️  Enter absolute path manually...

[Use arrow keys, press Enter when on "WIP"]
```

Pick a pattern:

```
📁 /path/to/community-patterns/patterns/yourname/WIP/
(↑/↓ to move, Enter to select, Q to cancel)

→ 📄 cozy-poll.tsx
  📄 experimental-chat.tsx
  ⬆️  .. (Go up one directory)
  ✏️  Enter absolute path manually...

[Press Enter to select cozy-poll.tsx]
```

### Deployment Output

```
🚀 Deploying...
  Pattern: cozy-poll.tsx  (community-patterns/jkomoros/WIP)
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

## Space Naming

The tool provides smart space name suggestions based on your last used space:

**Increment Logic:**
- `alex-1119-1` → `alex-1119-2` (increments last number)
- `test-space-5` → `test-space-6` (increments last number)
- `alex-1119` → `alex-1119-1` (appends `-1`, doesn't treat 1119 as an index)
- `test-space` → `test-space-1` (appends `-1`)

**Options:**
1. **Last used** - Reuse the same space (useful for quick iterations)
2. **Next** - Auto-incremented space name (useful for sequential testing)
3. **Custom** - Enter a completely new space name

This makes it fast to create numbered test spaces without typing!

## Pattern Display Format

Patterns are shown with the filename first, followed by context tags:

```
pattern-name.tsx  (repo/username/WIP) (time ago)
```

**Examples:**
- `cozy-poll.tsx  (community-patterns/jkomoros/WIP)` - Work in progress
- `group-voter.tsx  (recipes/alex)` - Stable pattern
- `shopping-list.tsx  (labs/examples)` - Example pattern

**Context tags include:**
- **Repository:** Which repo the pattern is in (labs, recipes, community-patterns, etc.)
- **Username:** Which user's namespace (patterns/username/)
- **WIP:** Only shown if pattern is in a WIP/ directory

This format lets you quickly scan pattern names while still seeing important context!

## Pattern History

- **Stores:** Last 50 patterns used
- **Shows:** Most recent 10 in the main menu
- **Sorts:** Most recently used first
- **Time format:** "5 min ago", "yesterday", "3 days ago"

## Keyboard Controls

| Key | Action |
|-----|--------|
| ↑ | Move selection up |
| ↓ | Move selection down |
| Enter | Confirm selection |
| Q | Quit/cancel current menu |
| Ctrl-C | Exit immediately |

The currently selected item is highlighted with:
- `→` arrow indicator on the left
- Reverse video (inverted colors)

## Tips

- **Quick re-deploy:** Just hit Enter on space name, then use arrow keys to pick from recent list
- **Arrow key navigation:** Use ↑/↓ to move through options, Enter to select
- **Visual feedback:** The → arrow and reverse video show your current selection
- **Go up:** Navigate to ".. (Go up one directory)" option to go back
- **Manual path:** Navigate to "Enter absolute path manually..." if you know the exact path
- **Quit anytime:** Press `Q` to cancel, or `Ctrl-C` to exit immediately

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
