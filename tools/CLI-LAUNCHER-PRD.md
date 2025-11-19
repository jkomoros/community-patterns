# Pattern Launcher CLI - Product Requirements Document

## Overview
A simple, interactive CLI tool to quickly deploy CommonTools patterns without typing long bash commands.

## Problem Statement
Currently deploying a pattern requires:
```bash
read -p "Space name: " SPACE && \
export CT_IDENTITY="/Users/alex/Code/labs/claude.key" && \
export CT_API_URL="http://localhost:8000/" && \
(cd /Users/alex/Code/labs && deno task ct charm new --space "$SPACE" /path/to/pattern.tsx)
```

**Pain points:**
- Command is too long to type repeatedly
- Difficult to change pattern path
- Must be in shell history to reuse
- No memory of previously used patterns
- No memory of last space name used

## Goals
1. **Quick launch**: Single command to deploy any pattern
2. **Pattern history**: Remember and quickly reuse patterns you've deployed before
3. **Space memory**: Remember last space name used
4. **Easy discovery**: Browse filesystem for new patterns
5. **Simple & scrappy**: Start basic, add features incrementally

## User Experience

### Launch Command
```bash
./launch.ts
# or with deno:
deno run --allow-all launch.ts
# or with production:
deno run --allow-all launch.ts --prod
```

### Interactive Flow

**Step 1: Space Name**
```
Enter space name [last: test-alex-5]: █
```
- Press Enter → uses last space (shown in brackets)
- Type new name → uses that space

**Step 2: Pattern Selection**
```
Select a pattern:
  [Recent Patterns]
  1. patterns/jkomoros/WIP/cozy-poll.tsx (2 min ago)
  2. patterns/jkomoros/WIP/group-voter.tsx (1 hour ago)
  3. patterns/jkomoros/reward-spinner.tsx (yesterday)

  [Actions]
  b. Browse for a new pattern
  q. Quit

Enter selection: █
```

**If browsing (option 'b'):**
```
Browse for pattern (enter absolute path):
/Users/alex/Code/community-patterns/patterns/jkomoros/WIP/█
```
- Simple text input
- Tab completion handled by shell
- Validates file exists and is .tsx

**Step 3: Deployment**
```
Deploying...
  Pattern: patterns/jkomoros/WIP/cozy-poll.tsx
  Space: test-alex-5
  API: http://localhost:8000
  Identity: /Users/alex/Code/labs/claude.key

Running: deno task ct charm new --space test-alex-5 ...
[output from deployment command]

✓ Deployed successfully!
Charm URL: http://localhost:8000/test-alex-5/baedrei...

Press Enter to continue...
```

## Technical Design

### File Structure
```
community-patterns/
├── launch.ts           # Main CLI script
└── .launcher-config    # Config file (gitignored)
```

### Config File Format (.launcher-config)
```json
{
  "lastSpace": "test-alex-5",
  "patterns": [
    {
      "path": "/Users/alex/Code/community-patterns/patterns/jkomoros/WIP/cozy-poll.tsx",
      "lastUsed": "2025-11-19T22:30:00Z"
    },
    {
      "path": "/Users/alex/Code/community-patterns/patterns/jkomoros/WIP/group-voter.tsx",
      "lastUsed": "2025-11-19T21:15:00Z"
    }
  ]
}
```

### Environment Variables
```typescript
// Default values
const API_URL = prod ? "https://api.commontools.io" : "http://localhost:8000/";
const IDENTITY_PATH = "/Users/alex/Code/labs/claude.key";
const LABS_DIR = "/Users/alex/Code/labs";
```

### Core Functions

1. **loadConfig()** - Load config from file or create default
2. **saveConfig()** - Save config to file
3. **promptForSpace()** - Get space name from user (with default)
4. **promptForPattern()** - Show recent patterns menu
5. **browseForPattern()** - Prompt for absolute path
6. **deployPattern()** - Run the deployment command
7. **recordUsage()** - Update pattern usage in config

### Implementation Strategy

**Phase 1: MVP (Start here)**
- Basic interactive prompts using Deno.stdin
- Config file with JSON
- Recent patterns list (last 10)
- Simple deployment command execution

**Phase 2: Polish**
- Better error handling
- Colored output
- Relative time display ("2 min ago")
- Input validation

**Phase 3: Nice-to-haves**
- Auto-complete for pattern paths
- Pattern favorites/pinning
- Multiple identity file support
- Pattern metadata (description, tags)

## Non-Requirements (V1)
- ❌ GUI interface
- ❌ Pattern editing
- ❌ Deployment history beyond "last used"
- ❌ Multi-user support
- ❌ Pattern search/filtering (just recency sort)

## Success Criteria
1. Can deploy a pattern in < 10 seconds
2. Don't need to remember bash command anymore
3. Can switch between patterns easily
4. Never lose track of which patterns you've used

## Open Questions
1. Should we support relative paths or only absolute?
   - **Decision**: Absolute paths for now (simpler, no ambiguity)

2. Should config be committed or gitignored?
   - **Decision**: Gitignored (.launcher-config in .gitignore)

3. Should we allow customizing identity/labs paths?
   - **Decision**: Hardcode for now, can add config later

4. What should the script be called?
   - **Decision**: `launch.ts` (simple and memorable)

## Implementation Notes

### Deno Permissions Required
```bash
deno run \
  --allow-read \    # Read config file and pattern files
  --allow-write \   # Write config file
  --allow-run \     # Run deno task ct command
  --allow-env \     # Set environment variables
  launch.ts
```

Or just: `deno run --allow-all launch.ts`

### Key Deno APIs
- `Deno.stdin.readable` - For interactive input
- `Deno.readTextFile()` - Read config
- `Deno.writeTextFile()` - Write config
- `new Deno.Command()` - Run deployment command
- `Deno.env.set()` - Set environment variables

## Example Session
```bash
$ deno run --allow-all launch.ts

Pattern Launcher 🚀

Enter space name [test-alex-5]: test-new-space

Select a pattern:
  [Recent]
  1. cozy-poll.tsx (5 min ago)
  2. group-voter.tsx (2 hours ago)

  b. Browse for new pattern
  q. Quit

> 1

Deploying cozy-poll.tsx to test-new-space...
✓ Success! http://localhost:8000/test-new-space/baedrei...
```

---

**End of PRD**
