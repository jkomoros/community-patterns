# Pattern Launcher - Product Requirements Document

## Overview

A meta-launcher pattern that can dynamically instantiate other patterns by fetching them from URLs (GitHub or local filesystem), without requiring them to be compiled into the launcher itself.

## Problem Statement

Currently, to launch multiple patterns, you need to:
1. Import all patterns at the top of the file (like `page-creator.tsx`)
2. Bundle them into the launcher pattern
3. Rebuild the launcher when adding new patterns

This is limiting because:
- Cannot dynamically add new patterns without rebuilding
- Cannot launch patterns that haven't been pushed to GitHub yet (local development)
- Requires managing imports and keeping launcher in sync with available patterns

## Solution

Use the `fetchProgram` built-in to dynamically fetch and instantiate patterns at runtime.

## Core Capabilities

### 1. Pattern Source Management

**Remote URLs (GitHub)**
- Support GitHub raw URLs: `https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{branch}/{path}`
- Default to several common pattern locations:
  - `https://raw.githubusercontent.com/jkomoros/community-patterns/refs/heads/main/patterns/jkomoros/`
  - `https://raw.githubusercontent.com/commontoolsinc/labs/main/packages/patterns/`
- Allow users to add custom GitHub directories
- Track which .tsx files exist in each directory

**Local Filesystem (for development)**
- Support local file paths: `/Users/alex/Code/community-patterns-2/patterns/jkomoros/pattern.tsx`
- This is critical for the "working on a pattern locally that is not yet pushed" use case
- Question: How does fetchProgram handle local file:// URLs? Or does it need a different mechanism?

### 2. Pattern Discovery

**Directory Scanning**
- For each configured source (GitHub URL or local path), discover available .tsx files
- Cache the list of discovered patterns so users don't have to re-enter them
- Allow manual refresh to re-scan directories
- Display pattern names (derived from filenames or pattern metadata)

**Pattern Metadata**
- Store for each pattern:
  - Name (display name)
  - Source URL or path
  - Last discovered timestamp
  - Optional: icon/emoji
  - Optional: description

### 3. Pattern Instantiation

**Launch Flow**
1. User selects a pattern from the list
2. Use `fetchProgram({ url })` to fetch the pattern
3. Show loading state while fetching
4. Use `compileAndRun({ files, main, input })` to compile and instantiate
5. Navigate to the newly created pattern instance using `navigateTo()`

**Input Handling**
- Some patterns need initial state (like counter needs `{ value: 0 }`)
- Question: How to handle different input requirements for different patterns?
  - Option A: Always pass empty object `{}`
  - Option B: Store default inputs per pattern
  - Option C: Prompt user for inputs before launching
  - Option D: Launch with empty state, let pattern handle defaults

**Error Handling**
- Show errors if fetch fails (network, 404, etc.)
- Show errors if compile fails (syntax errors, etc.)
- Allow retry

## User Interface

### Main Screen

```
┌─────────────────────────────────┐
│ Pattern Launcher                │
├─────────────────────────────────┤
│                                 │
│ [+ Add Pattern Source]          │
│                                 │
│ Sources:                        │
│ • jkomoros/community-patterns   │
│   └─ patterns/jkomoros/         │
│ • commontoolsinc/labs           │
│   └─ packages/patterns/         │
│                                 │
│ Available Patterns:             │
│                                 │
│ [🎰 Reward Spinner]             │
│ [🗳️  Group Voter]                │
│ [🔢 Counter]                    │
│ [📝 Shopping List]              │
│                                 │
│ [↻ Refresh Pattern List]        │
└─────────────────────────────────┘
```

### Add Source Dialog

```
┌─────────────────────────────────┐
│ Add Pattern Source              │
├─────────────────────────────────┤
│                                 │
│ Source Type:                    │
│ ○ GitHub Repository             │
│ ○ Local Directory               │
│                                 │
│ [For GitHub]                    │
│ Owner:    [jkomoros]            │
│ Repo:     [community-patterns]  │
│ Branch:   [main]                │
│ Path:     [patterns/jkomoros/]  │
│                                 │
│ [For Local]                     │
│ Path: [Browse...] or enter path │
│                                 │
│ [Cancel]  [Add Source]          │
└─────────────────────────────────┘
```

## Data Model

```typescript
interface PatternSource {
  id: string;
  type: "github" | "local";

  // For GitHub sources
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;

  // For local sources
  localPath?: string;

  // Computed
  baseUrl: string; // Full base URL for fetching

  // Metadata
  displayName: string;
  lastScanned?: number;
}

interface DiscoveredPattern {
  id: string;
  sourceId: string; // Which source this came from
  filename: string; // e.g., "reward-spinner.tsx"
  displayName: string; // e.g., "Reward Spinner"
  url: string; // Full URL to fetch
  icon?: string;
  description?: string;
}

interface PatternLauncherState {
  sources: PatternSource[];
  patterns: DiscoveredPattern[];
  selectedSourceId?: string;
  isRefreshing: boolean;
  error?: string;
}
```

## RESOLVED: Local File Access

**✅ SOLUTION IMPLEMENTED:**

We run a local static HTTP server on port 8765 in the parent directory of all repos (e.g., `~/Code/`).

**Implementation:**
- Python's `http.server` with CORS headers
- Port: 8765 (distinctive, unlikely to conflict)
- Root: Parent directory of repos
- Auto-started by Claude Code during session startup
- Shared across all agents/sessions

**URLs:**
```
http://localhost:8765/community-patterns-2/patterns/jkomoros/WIP/demo.tsx
http://localhost:8765/labs/packages/patterns/counter.tsx
http://localhost:8765/recipes/recipes/alex/my-pattern.tsx
```

**Testing Results:**
- ✅ `file://` URLs do NOT work (browser security blocks them)
- ✅ HTTP via localhost works perfectly
- ✅ `fetchProgram` runs server-side in toolshed, so CORS is needed
- ✅ CORS headers successfully added via Python wrapper

**Documentation:** See LOCAL_DEV_SERVER.md

### 2. Pattern Discovery

**✅ DECISION:**

**Phase 1 (MVP):** Manual entry - User manually maintains LOCAL_ENDPOINTS.json
**Phase 2:** Automatic discovery via manifest files

**Manifest Files:**
- `LOCAL_ENDPOINTS.json` in community-patterns (gitignored, developer-specific)
- `index.md` in labs/packages/patterns/ (already exists)
- Future: GitHub Action to generate manifest files automatically

**Format:**
```json
{
  "patterns": [
    {
      "name": "Pattern Name",
      "path": "repo/path/to/pattern.tsx",
      "icon": "🎯",
      "description": "Optional description"
    }
  ]
}
```

### 3. Pattern Inputs

**✅ DECISION:** Option A - Always pass `{}`

Patterns should handle their own defaults. This keeps the launcher simple and delegates responsibility to individual patterns.

### 4. Space Management

**✅ DECISION:** Always in the same space as the launcher

Keeps things simple. User can organize their own spaces as needed.

### 5. Caching and Performance

**✅ DECISION:** Let `fetchProgram` handle caching

The framework already has caching logic built in. No need to duplicate it.

## Implementation Phases

### Phase 1: MVP (Minimal Viable Product)
- Single hardcoded GitHub directory (jkomoros/community-patterns)
- Manual list of pattern filenames
- Simple launch with empty input `{}`
- Basic error handling

### Phase 2: Multiple Sources
- Add/remove pattern sources
- Both GitHub and local (if possible)
- Persist sources list

### Phase 3: Pattern Discovery
- Automatic discovery via GitHub API or manifest files
- Refresh pattern list

### Phase 4: Enhanced UX
- Pattern icons and descriptions
- Input templates for patterns that need them
- Recent patterns list
- Search/filter patterns

## Success Criteria

1. Can launch patterns from GitHub URLs without bundling them
2. Can add new pattern sources without rebuilding
3. Works for local development workflow (if local file access is supported)
4. Clear error messages when patterns fail to fetch or compile
5. Intuitive UI for managing sources and launching patterns

## Technical Notes

**fetchProgram API:**
```typescript
fetchProgram({ url: string }) => {
  pending: boolean,
  result: { files: Array<{name, contents}>, main: string } | undefined,
  error: any
}
```

**compileAndRun API:**
```typescript
compileAndRun({ files, main, input? }) => {
  pending: boolean,
  result?: CharmId,
  error?: any,
  errors?: Array<CompileError>
}
```

**Workflow:**
```typescript
const { pending: fetchPending, result: program, error: fetchError } =
  fetchProgram({ url });

const { pending: compilePending, result: charmId, error: compileError } =
  compileAndRun({
    files: program?.files ?? [],
    main: program?.main ?? "",
    input: {} // or pattern-specific initial state
  });

// Navigate to the new charm
navigateTo(charmId);
```
