# Issue: restart-dev-servers May Load Wrong .env from Wrong Directory

**Status:** Under Investigation
**Date:** 2024-11-27
**Reported behavior:** Gmail-auth charms break when restart-dev-servers is run from "the wrong location"

## The Problem

User reports that running `restart-local-dev.sh` from the wrong directory causes Gmail OAuth to break, suspected to be due to loading the wrong `.env` file.

## Confirmed: The Bug Scenario IS Real

If toolshed starts from the wrong directory, it loads the wrong `.env`:

| Start Directory | `.env` Loaded | `GOOGLE_CLIENT_ID` |
|-----------------|---------------|-------------------|
| `packages/toolshed` (correct) | `packages/toolshed/.env` | **LOADED** |
| `labs/` root (wrong) | `labs/.env` | **EMPTY** |

The root `labs/.env` only contains:
```
UPSTREAM="localhost:5173"
```

While `packages/toolshed/.env` contains:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
(and other secrets)
```

## Investigation: How Could This Happen?

### Scripts Tested

Both scripts use SCRIPT_DIR pattern:
```bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."
```

### Scenarios Tested (All Worked Correctly)

1. **Running from community-patterns:** `../labs/scripts/restart-local-dev.sh` - WORKS
2. **Running with absolute path:** `/Users/.../labs/scripts/restart-local-dev.sh` - WORKS
3. **Running with `../` in path:** Resolves correctly - WORKS
4. **Claude's invocation:** `$LABS_DIR/scripts/restart-local-dev.sh` - WORKS
5. **Missing shebang in start-local-dev.sh:** macOS still uses bash, WORKS

### One Scenario That WOULD Break

**Sourcing instead of executing:**
```bash
# This would break!
source ../labs/scripts/restart-local-dev.sh

# vs this (correct)
../labs/scripts/restart-local-dev.sh
```

When sourcing, `BASH_SOURCE[0]` refers to the current shell context, not the script file, causing SCRIPT_DIR to resolve to the current directory instead of the script's directory.

## Code Flow

```
restart-local-dev.sh
├── SCRIPT_DIR = dirname of script → /labs/scripts
├── cd $SCRIPT_DIR/.. → /labs
├── ./scripts/stop-local-dev.sh
└── ./scripts/start-local-dev.sh
    ├── SCRIPT_DIR = dirname of script → /labs/scripts
    ├── cd $SCRIPT_DIR/.. → /labs
    ├── cd packages/shell → deno task dev-local
    └── cd ../toolshed → deno task dev (loads .env from HERE)
```

The `deno task dev` command uses `--env-file=.env` which is **relative to CWD**.

## Reproduction Steps Needed

To continue debugging, need answers to:

1. **Exact command run:** What command triggers the bug?
2. **Working directory:** What directory are you in when it breaks?
3. **How invoked:** Terminal directly? Claude automation? Alias?
4. **Error messages:** Any output when it fails?
5. **How detected:** How do you know Gmail auth is broken? (error message, OAuth redirect fails, etc.)

## Potential Fixes (If Bug Confirmed)

1. **Add shebang to start-local-dev.sh:**
   ```bash
   #!/usr/bin/env bash
   ```
   (Currently missing, though this doesn't seem to cause issues on macOS)

2. **Use absolute path for .env in deno.json:**
   ```json
   "dev": "deno run ... --env-file=$(dirname $0)/.env index.ts"
   ```
   (Would require script wrapper)

3. **Validate GOOGLE_CLIENT_ID on startup:**
   Add check in toolshed that warns/errors if Google creds are empty when expected.

4. **Add directory validation to restart script:**
   ```bash
   if [ ! -f packages/toolshed/.env ]; then
     echo "ERROR: Not in labs root directory!"
     exit 1
   fi
   ```

## Files Involved

- `/labs/scripts/restart-local-dev.sh` - Has shebang
- `/labs/scripts/start-local-dev.sh` - NO shebang (potential issue?)
- `/labs/scripts/stop-local-dev.sh` - NO shebang
- `/labs/.env` - Root env (minimal)
- `/labs/packages/toolshed/.env` - Full env with secrets
- `/labs/packages/toolshed/deno.json` - Uses `--env-file=.env` (relative)
- `/labs/packages/toolshed/env.ts` - Parses env, defaults to empty strings

## Related

- Gmail OAuth code: `packages/toolshed/routes/integrations/google-oauth/`
- Env parsing: `packages/toolshed/env.ts` lines 98-99
