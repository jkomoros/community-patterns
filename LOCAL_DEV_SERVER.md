# Local Development Server

## Overview

To enable dynamic pattern launching from local files (patterns not yet pushed to GitHub), we run a simple static file server in the parent directory of your repositories.

This allows `fetchProgram` to load patterns via HTTP URLs like:
- `http://localhost:8765/community-patterns-2/patterns/jkomoros/WIP/demo.tsx`
- `http://localhost:8765/labs/packages/patterns/counter.tsx`

## Architecture

```
~/Code/                              # Server runs here
├── community-patterns-2/
│   ├── LOCAL_ENDPOINTS.json         # Pattern discovery manifest (gitignored)
│   └── patterns/jkomoros/
│       ├── reward-spinner.tsx
│       └── WIP/
│           └── demo.tsx
├── labs/
│   └── packages/patterns/
│       └── counter.tsx
└── recipes/                         # (formerly patterns repo)
    └── recipes/alex/
        └── my-pattern.tsx
```

## Server Details

- **Port**: 8765 (distinctive, unlikely to conflict)
- **Root Directory**: Parent of repositories (e.g., `~/Code/`)
- **Implementation**: Python's built-in `http.server` (universally available)
- **CORS**: Enabled for `fetchProgram` to work from toolshed
- **Lifecycle**: Automatically started by Claude Code, shared across all sessions

## Automatic Startup

Claude Code automatically:
1. Checks if server is running on port 8765
2. If not running, starts it in the background
3. All agents across all sessions use the same server instance

You'll see a message like:
```
✓ Local dev server already running on port 8765
```

or

```
→ Starting local dev server on port 8765...
✓ Local dev server started at http://localhost:8765
```

## Pattern Discovery

The pattern-launcher reads available patterns from:
```
http://localhost:8765/community-patterns-2/LOCAL_ENDPOINTS.json
```

### LOCAL_ENDPOINTS.json Format

Create this file in your community-patterns repository root:

```json
{
  "patterns": [
    {
      "name": "Reward Spinner",
      "path": "community-patterns-2/patterns/jkomoros/reward-spinner.tsx",
      "icon": "🎰",
      "description": "A fun reward spinner pattern"
    },
    {
      "name": "Group Voter (WIP)",
      "path": "community-patterns-2/patterns/jkomoros/WIP/group-voter.tsx",
      "icon": "🗳️",
      "description": "Group voting system - in development"
    }
  ]
}
```

**Important**: This file is gitignored and developer-specific. Each developer maintains their own list of patterns they're working on.

### Pattern Discovery from Other Repos

The pattern-launcher can also discover patterns from:

**labs/** (framework patterns):
- Reads from: `http://localhost:8765/labs/packages/patterns/index.md`
- Standard instantiable patterns (counter, chatbot, note)

**recipes/** (example patterns):
- Can read from: `http://localhost:8765/recipes/LOCAL_ENDPOINTS.json` (if you create one)

## Manual Server Control

### Check if Server is Running

```bash
lsof -i:8765
```

### Stop Server

```bash
# Find the process
lsof -ti:8765

# Kill it
kill $(lsof -ti:8765)
```

### Start Server Manually

```bash
# Navigate to parent directory
cd ~/Code  # or wherever your repos live

# Start server with CORS
python3 -m http.server 8765 --bind 127.0.0.1
```

**Note**: The Python server doesn't add CORS headers by default. Claude Code uses a wrapper script that adds them.

## Troubleshooting

### Port Already in Use

If you see "Address already in use", check what's using port 8765:

```bash
lsof -i:8765
```

If it's the dev server from a previous session, that's fine - Claude Code will detect it and reuse it.

If it's something else, you'll need to either:
- Stop that process
- Choose a different port (requires updating CLAUDE.md)

### fetchProgram Failing

If `fetchProgram` can't load local patterns:

1. **Verify server is running**:
   ```bash
   curl http://localhost:8765/community-patterns-2/patterns/jkomoros/WIP/demo.tsx
   ```
   Should return the file contents.

2. **Check CORS headers**:
   ```bash
   curl -I http://localhost:8765/
   ```
   Should include `Access-Control-Allow-Origin: *`

3. **Verify path is correct**:
   - Paths are relative to server root (`~/Code/`)
   - Include repo name in path
   - Use forward slashes

### LOCAL_ENDPOINTS.json Not Found

Create the file in your repository root:

```bash
cd ~/Code/community-patterns-2
cat > LOCAL_ENDPOINTS.json << 'EOF'
{
  "patterns": []
}
EOF
```

Then add your patterns to the array.

## Security Considerations

- **Localhost only**: Server binds to `127.0.0.1` (not accessible from network)
- **Read-only**: Server only serves files, cannot modify them
- **Temporary**: Server runs only while developing, not in production
- **Gitignored**: `LOCAL_ENDPOINTS.json` is developer-specific, never committed

## Integration with Pattern-Launcher

The pattern-launcher pattern automatically:
1. Fetches `LOCAL_ENDPOINTS.json` from the dev server
2. Displays local patterns alongside GitHub patterns
3. Uses `fetchProgram` with local URLs
4. Falls back gracefully if server isn't running

Example URL in pattern-launcher:
```typescript
const url = "http://localhost:8765/community-patterns-2/patterns/jkomoros/reward-spinner.tsx";
const { result: program } = fetchProgram({ url });
```

## Comparison with Other Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **file:// URLs** | Direct access | Browser security blocks it |
| **Toolshed API endpoint** | Integrated | Only serves labs/packages/patterns |
| **Local HTTP server** ✓ | Works everywhere, serves all repos | Requires running server |

We chose the local HTTP server because:
- Works with browser security restrictions
- Serves patterns from any repo
- Shared across all agent sessions
- Simple to implement and maintain
