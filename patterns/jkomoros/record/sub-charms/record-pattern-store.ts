// record-pattern-store.ts - Isolated storage for Record pattern
// This file has NO imports to avoid circular dependencies
//
// Flow:
// 1. record.tsx imports setRecordPattern and calls it after definition
// 2. notes-module.tsx imports getRecordPatternJson to use for backlinks
// 3. Neither creates a dependency cycle because this file is standalone

// deno-lint-ignore no-explicit-any
let _recordPattern: any = null;

/**
 * Register the Record pattern for backlink creation.
 * Called by record.tsx after pattern definition.
 */
// deno-lint-ignore no-explicit-any
export function setRecordPattern(pattern: any): void {
  _recordPattern = pattern;
}

/**
 * Get the Record pattern as JSON string for ct-code-editor's $pattern prop.
 * Returns null if not registered (NotesModule will fall back to self-creation).
 */
export function getRecordPatternJson(): string | null {
  return _recordPattern ? JSON.stringify(_recordPattern) : null;
}
