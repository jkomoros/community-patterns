# Cross-Repository Pattern Deployment

## The Problem

When you have multiple checkouts of the labs repository (e.g., `labs` and `labs-4`), you may want to:
- Run the server from one checkout (e.g., `labs` on main branch)
- Deploy patterns from another checkout (e.g., `labs-4` with development changes)

Simply running `deno task ct charm new` from the development repo can cause version mismatch errors like:
- `TypeError: Cannot read properties of undefined (reading 'src')`
- `TypeError: createModule is not a function`

## The Solution

Use the `ct` binary from the same repo as the running server, but point it to patterns in your development repo using absolute paths and the `--root` flag.

### Command Pattern

```bash
cd /path/to/labs  # The repo running the server

deno task ct charm new \
  --root /path/to/labs-4/packages/patterns \
  /path/to/labs-4/packages/patterns/your-pattern.tsx \
  -i /path/to/labs-4/claude.key \
  -a http://localhost:8000 \
  -s YOUR_SPACE_NAME
```

### Example: Deploying record.tsx from labs-4 using labs server

```bash
cd ~/Code/labs

SPACE="test-$(date +%s)"

deno task ct charm new \
  --root ~/Code/labs-4/packages/patterns \
  ~/Code/labs-4/packages/patterns/record.tsx \
  -i ~/Code/labs-4/claude.key \
  -a http://localhost:8000 \
  -s "$SPACE"

echo "Navigate to: http://localhost:8000/$SPACE"
```

## Why This Works

1. **`--root` flag**: Sets the import resolution base directory to your development patterns folder. All relative imports (e.g., `./record/registry.ts`) resolve within that directory tree.

2. **Absolute paths**: The `absPath()` function in the ct CLI correctly handles absolute paths without mangling them.

3. **Same runtime**: Using `deno task ct` from the server's repo ensures the compiler and runtime APIs match.

## Key Flags

| Flag | Purpose |
|------|---------|
| `--root <path>` | Sets the base directory for import resolution. Required when deploying patterns with relative imports from a different repo. |
| `-i, --identity <path>` | Path to identity key file. Can be in any location. |
| `-a, --api-url <url>` | Server URL (usually `http://localhost:8000` for local dev) |
| `-s, --space <name>` | Space name to deploy into |

## Common Issues

### "Cannot read properties of undefined (reading 'src')"
This usually means you're running `ct` from the development repo instead of the server repo. Switch to the server repo and use the cross-repo deployment pattern above.

### Imports failing to resolve
Make sure `--root` points to the directory that contains all imported files. For `record.tsx`, this should be `packages/patterns` since it imports from `./record/*`, `./notes/*`, etc.

## Alternative: Single Repo Workflow

If cross-repo deployment is too complex, consider:

1. **Merge your changes to main** and work from a single repo
2. **Run the server from your dev repo** using `./scripts/start-local-dev.sh`
3. **Cherry-pick specific fixes** to avoid large divergence
