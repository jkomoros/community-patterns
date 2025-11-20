/**
 * Diff utilities for LLM extraction preview
 *
 * Provides word-level diff computation and rendering for showing
 * changes before applying extracted data.
 *
 * ## Usage
 *
 * These utilities are used in person.tsx and food-recipe.tsx to show
 * field-by-field diffs when extracting data from unstructured notes.
 *
 * Example pattern:
 * ```typescript
 * import { compareFields, computeWordDiff } from "./utils/diff-utils.tsx";
 *
 * // 1. Derive changes from extraction result
 * const changesPreview = derive({ extractionResult, ...currentFields }, (data) => {
 *   return compareFields(data.extractionResult, {
 *     name: { current: data.currentName, label: "Name" },
 *     email: { current: data.currentEmail, label: "Email" }
 *   });
 * });
 *
 * // 2. Render in modal with word-level diffs
 * {changesPreview.map(change => (
 *   <div>
 *     <strong>{change.field}</strong>
 *     {computeWordDiff(change.from, change.to).map(part => {
 *       if (part.type === "removed") {
 *         return <span style={{color: "red", textDecoration: "line-through"}}>{part.word}</span>;
 *       }
 *       if (part.type === "added") {
 *         return <span style={{color: "green"}}>{part.word}</span>;
 *       }
 *       return <span>{part.word}</span>;
 *     })}
 *   </div>
 * ))}
 * ```
 *
 * ## Future Improvements
 *
 * ### Option A: Pattern-Based Modal Component (Higher Abstraction)
 *
 * Could create `lib/diff-preview-modal.tsx` as a reusable pattern:
 * - Takes: changes array, onApply handler stream, onCancel handler stream
 * - Returns: Complete modal UI with all styling
 * - Pros: Maximum code reuse (~60-70 lines), guaranteed consistency
 * - Cons: Less flexible, harder to customize, handler complexity
 * - Trade-off: Worth it if you have 5+ patterns using extraction
 *
 * ### Option B: Micro-Recipe for Diff Rendering (Medium Abstraction)
 *
 * Could create `lib/diff-text.tsx` as a tiny recipe just for rendering:
 * - Takes: from/to strings
 * - Returns: Styled diff JSX
 * - Pros: Reusable rendering logic (~20 lines saved)
 * - Cons: Recipe overhead for simple task, mixing utilities with patterns
 * - Trade-off: Current inline approach is clearer
 *
 * ### Option C: Current Approach (Utilities Only) ✅ RECOMMENDED
 *
 * Keep current utilities-only approach:
 * - Utilities: Pure functions (computeWordDiff, compareFields)
 * - Patterns: Inline JSX for rendering
 * - Pros: Simple, clear, flexible, no indirection
 * - Cons: ~60 lines of JSX per pattern
 * - Trade-off: 60 lines of straightforward JSX is acceptable cost
 *
 * **Recommendation**: Current approach is correct. The utilities capture the
 * complex logic (diff algorithm, field comparison). The rendering JSX is
 * simple enough that indirection would add more complexity than value.
 *
 * **When to reconsider**: If you have 5+ patterns with identical extraction
 * modals, Option A (pattern-based) becomes worth the abstraction cost.
 */

/// <cts-enable />

export type DiffChunk = {
  type: "removed" | "added" | "unchanged";
  word: string;
};

/**
 * Compute word-level diff between two strings
 *
 * Uses a simple word-by-word comparison with lookahead to handle
 * insertions and deletions intelligently.
 *
 * @param from - Original text
 * @param to - New text
 * @returns Array of diff chunks with type and word
 *
 * @example
 * ```typescript
 * const diff = computeWordDiff("Hello world", "Hello there world");
 * // Returns:
 * // [
 * //   { type: "unchanged", word: "Hello" },
 * //   { type: "unchanged", word: " " },
 * //   { type: "added", word: "there" },
 * //   { type: "added", word: " " },
 * //   { type: "unchanged", word: "world" }
 * // ]
 * ```
 */
export function computeWordDiff(from: string, to: string): DiffChunk[] {
  // Handle undefined/null values
  const fromStr = from || "";
  const toStr = to || "";

  const fromWords = fromStr.split(/(\s+)/);
  const toWords = toStr.split(/(\s+)/);

  const result: DiffChunk[] = [];

  // Simple word-by-word diff
  let i = 0, j = 0;

  while (i < fromWords.length || j < toWords.length) {
    if (i >= fromWords.length) {
      // Rest are additions
      result.push({ type: "added", word: toWords[j] });
      j++;
    } else if (j >= toWords.length) {
      // Rest are removals
      result.push({ type: "removed", word: fromWords[i] });
      i++;
    } else if (fromWords[i] === toWords[j]) {
      // Same word
      result.push({ type: "unchanged", word: fromWords[i] });
      i++;
      j++;
    } else {
      // Check if we can find a match ahead
      const fromLookAhead = toWords.slice(j).indexOf(fromWords[i]);
      const toLookAhead = fromWords.slice(i).indexOf(toWords[j]);

      if (
        fromLookAhead !== -1 &&
        (toLookAhead === -1 || fromLookAhead <= toLookAhead)
      ) {
        // Word from 'from' appears later in 'to', so words before it are additions
        for (let k = 0; k < fromLookAhead; k++) {
          result.push({ type: "added", word: toWords[j] });
          j++;
        }
      } else if (toLookAhead !== -1) {
        // Word from 'to' appears later in 'from', so words before it are removals
        for (let k = 0; k < toLookAhead; k++) {
          result.push({ type: "removed", word: fromWords[i] });
          i++;
        }
      } else {
        // No match found, treat as removal + addition
        result.push({ type: "removed", word: fromWords[i] });
        result.push({ type: "added", word: toWords[j] });
        i++;
        j++;
      }
    }
  }

  return result;
}

/**
 * Compare extracted data fields against current values
 *
 * Generic utility for building a list of changes when comparing
 * LLM-extracted data against current field values.
 *
 * @param extracted - Object containing extracted field values
 * @param fieldMappings - Map of extracted field names to current values and display labels
 * @returns Array of changes with field label, from value, and to value
 *
 * @example
 * ```typescript
 * const changes = compareFields(
 *   extractionResult,
 *   {
 *     givenName: { current: currentFirstName, label: "First Name" },
 *     familyName: { current: currentLastName, label: "Last Name" },
 *     email: { current: currentEmail, label: "Email" }
 *   }
 * );
 * // Returns: [
 * //   { field: "First Name", from: "John", to: "Jonathan" },
 * //   { field: "Email", from: "(empty)", to: "john@example.com" }
 * // ]
 * ```
 */
export function compareFields<T extends Record<string, any>>(
  extracted: Partial<T> | null | undefined,
  fieldMappings: {
    [K in keyof T]?: {
      current: string;
      label: string;
    };
  },
): Array<{ field: string; from: string; to: string }> {
  if (!extracted || Object.keys(extracted).length === 0) {
    return [];
  }

  const changes: Array<{ field: string; from: string; to: string }> = [];

  for (const key in fieldMappings) {
    const mapping = fieldMappings[key];
    if (!mapping) continue;

    const extractedValue = extracted[key];
    const currentValue = mapping.current;

    // Only add change if extracted value exists and differs from current
    if (extractedValue && extractedValue !== currentValue) {
      changes.push({
        field: mapping.label,
        from: currentValue || "(empty)",
        to: String(extractedValue), // Ensure value is converted to string
      });
    }
  }

  return changes;
}
