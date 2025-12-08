#!/usr/bin/env -S deno run --allow-all
/// <reference lib="deno.ns" />

/**
 * Pattern Launcher CLI
 * Quick interactive tool to deploy CommonTools patterns
 */

// ===== CONFIGURATION =====

// Get repo root (one level up from tools/)
const REPO_ROOT = new URL("..", import.meta.url).pathname;
const CONFIG_FILE = `${REPO_ROOT}.launcher-history`;
const DEFAULT_LABS_DIR = `${REPO_ROOT}../labs`;
const IDENTITY_PATH = `${REPO_ROOT}claude.key`;

interface PatternRecord {
  path: string;
  lastUsed: string; // ISO timestamp
}

interface RecentCharm {
  space: string;
  charmId: string;
  name?: string;
  recipeName?: string;
  patternPath?: string;  // Original pattern file path
  deployedAt: string;    // ISO timestamp
  apiUrl: string;
}

interface Config {
  lastSpaceLocal?: string;       // Last space for localhost deployments
  lastSpaceProd?: string;        // Last space for production deployments
  lastDeploymentTarget?: "local" | "prod";  // Last deployment target chosen
  labsDir?: string;              // Optional: override default labs location
  patterns: PatternRecord[];
  recentCharms: RecentCharm[];   // Recently deployed charms for linking
}

// ===== CHARM LINKING TYPES =====

interface CharmField {
  path: string[];           // e.g., ["users", "0", "email"]
  fullPath: string;         // e.g., "users/0/email"
  type: string;             // e.g., "string", "number", "object", "array"
  value?: unknown;          // Current value (for display)
  schema?: ObjectSchema;    // For objects/arrays, the structural schema
}

interface ObjectSchema {
  type: "object" | "array" | "primitive";
  fields?: Record<string, ObjectSchema>;  // For objects: field name → schema
  elementSchema?: ObjectSchema;           // For arrays: element schema
  primitiveType?: string;                 // For primitives: "string", "number", etc.
}

interface CharmSchema {
  charmId: string;
  name?: string;
  space: string;
  apiUrl: string;
  inputs: CharmField[];     // Flattened input fields (from "source")
  outputs: CharmField[];    // Flattened output fields (from "result")
}

interface LinkSuggestion {
  source: {
    charm: RecentCharm;
    field: CharmField;
  };
  target: {
    charm: RecentCharm;
    field: CharmField;
  };
  compatibility: "compatible" | "maybe" | "incompatible";
  score: number;            // Higher = better suggestion
}

// ===== UTILITY FUNCTIONS =====

async function loadConfig(): Promise<Config> {
  try {
    const content = await Deno.readTextFile(CONFIG_FILE);
    const parsed = JSON.parse(content);

    // Backward compatibility: migrate old lastSpace to lastSpaceLocal
    if (parsed.lastSpace && !parsed.lastSpaceLocal) {
      parsed.lastSpaceLocal = parsed.lastSpace;
      delete parsed.lastSpace;
    }

    // Backward compatibility: initialize recentCharms if missing
    if (!parsed.recentCharms) {
      parsed.recentCharms = [];
    }

    return parsed;
  } catch {
    // File doesn't exist or is invalid, return default
    return {
      patterns: [],
      recentCharms: [],
    };
  }
}

async function saveConfig(config: Config): Promise<void> {
  await Deno.writeTextFile(
    CONFIG_FILE,
    JSON.stringify(config, null, 2)
  );
}

function formatTimeSince(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

function getShortPath(absolutePath: string): string {
  // Parse path to extract: filename, repo, username, WIP status
  // Example: /Users/alex/Code/community-patterns/patterns/jkomoros/WIP/cozy-poll.tsx
  // Result: "cozy-poll.tsx  (community-patterns/jkomoros/WIP)"

  const parts = absolutePath.split("/");
  const filename = parts[parts.length - 1];

  // Find the repo directory (look for common repo names)
  let repoIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (
      part === "labs" ||
      part === "recipes" ||
      part.startsWith("community-patterns")
    ) {
      repoIndex = i;
      break;
    }
  }

  if (repoIndex === -1) {
    // Can't determine repo structure, just return filename
    return filename;
  }

  const repo = parts[repoIndex];

  // Look for patterns directory after repo
  const patternsIndex = parts.indexOf("patterns", repoIndex);
  if (patternsIndex === -1 || patternsIndex + 1 >= parts.length) {
    // No patterns directory found, just return filename
    return filename;
  }

  // Username is right after patterns/
  const username = parts[patternsIndex + 1];

  // Check if WIP is in the path
  const isWIP = parts.includes("WIP");

  // Build the tag
  const tags = [repo, username];
  if (isWIP) {
    tags.push("WIP");
  }

  return `${filename}  (${tags.join("/")})`;
}

async function prompt(message: string, defaultValue?: string): Promise<string> {
  const displayDefault = defaultValue ? ` [${defaultValue}]` : "";
  console.log(`${message}${displayDefault}: `);

  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);

  if (n === null) {
    return defaultValue || "";
  }

  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();
  return input || defaultValue || "";
}

// ANSI escape codes
const CURSOR_UP = "\x1b[A";
const CURSOR_DOWN = "\x1b[B";
const CLEAR_LINE = "\x1b[2K";
const CURSOR_TO_START = "\x1b[0G";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

interface SelectOption {
  label: string;
  value: string;
  icon?: string;
}

async function interactiveSelect(
  options: SelectOption[],
  title?: string
): Promise<string | null> {
  if (options.length === 0) {
    return null;
  }

  if (title) {
    console.log(`\n${title}\n`);
  }

  let selectedIndex = 0;
  let filterText = "";
  let filteredOptions = options;
  let lastRenderedLineCount = 0;

  // Enable raw mode to capture arrow keys
  Deno.stdin.setRaw(true);

  // Hide cursor
  await Deno.stdout.write(new TextEncoder().encode(HIDE_CURSOR));

  // Filter options based on current filter text
  const updateFilteredOptions = () => {
    if (filterText === "") {
      filteredOptions = options;
    } else {
      const lowerFilter = filterText.toLowerCase();
      filteredOptions = options.filter((opt) =>
        opt.label.toLowerCase().includes(lowerFilter)
      );
    }
    // Reset selection to first item when filter changes
    selectedIndex = 0;
  };

  // Render the current state
  const render = () => {
    const lines: string[] = [];

    // Filter line (always show, even if empty, for consistent layout)
    if (filterText) {
      lines.push(`🔍 Filter: ${filterText}`);
    } else {
      lines.push("\x1b[90m(type to filter)\x1b[0m"); // Dim hint
    }

    // Options
    if (filteredOptions.length === 0) {
      lines.push("  \x1b[90m(no matches)\x1b[0m");
    } else {
      for (let i = 0; i < filteredOptions.length; i++) {
        const option = filteredOptions[i];
        const icon = option.icon || "";
        const prefix = i === selectedIndex ? "→ " : "  ";
        const style = i === selectedIndex ? "\x1b[7m" : ""; // Reverse video for selected
        const reset = i === selectedIndex ? "\x1b[0m" : "";
        lines.push(`${prefix}${style}${icon}${option.label}${reset}`);
      }
    }

    return lines;
  };

  // Clear previous render and output new lines
  const rerender = async () => {
    // Move cursor up to clear previous output
    for (let i = 0; i < lastRenderedLineCount; i++) {
      await Deno.stdout.write(new TextEncoder().encode(CURSOR_UP));
    }

    // Clear all previous lines
    for (let i = 0; i < lastRenderedLineCount; i++) {
      await Deno.stdout.write(
        new TextEncoder().encode(CLEAR_LINE + CURSOR_TO_START)
      );
      if (i < lastRenderedLineCount - 1) {
        await Deno.stdout.write(new TextEncoder().encode(CURSOR_DOWN));
      }
    }

    // Move back to start
    if (lastRenderedLineCount > 1) {
      for (let i = 0; i < lastRenderedLineCount - 1; i++) {
        await Deno.stdout.write(new TextEncoder().encode(CURSOR_UP));
      }
    }
    await Deno.stdout.write(new TextEncoder().encode(CURSOR_TO_START));

    // Render new content
    const lines = render();
    for (const line of lines) {
      console.log(line);
    }
    lastRenderedLineCount = lines.length;
  };

  // Initial render
  const initialLines = render();
  for (const line of initialLines) {
    console.log(line);
  }
  lastRenderedLineCount = initialLines.length;

  // Listen for input
  const buf = new Uint8Array(3);

  while (true) {
    const n = await Deno.stdin.read(buf);

    if (n === null) break;

    const input = buf.slice(0, n);

    // Check for escape sequences (arrow keys, etc.)
    if (input[0] === 0x1b && input[1] === 0x5b) {
      if (input[2] === 0x41) {
        // Up arrow
        if (filteredOptions.length > 0) {
          selectedIndex =
            (selectedIndex - 1 + filteredOptions.length) %
            filteredOptions.length;
          await rerender();
        }
      } else if (input[2] === 0x42) {
        // Down arrow
        if (filteredOptions.length > 0) {
          selectedIndex = (selectedIndex + 1) % filteredOptions.length;
          await rerender();
        }
      }
      // Ignore other escape sequences
    } else if (input[0] === 0x1b) {
      // Escape key alone - clear filter
      if (filterText !== "") {
        filterText = "";
        updateFilteredOptions();
        await rerender();
      }
    } else if (input[0] === 0x0d || input[0] === 0x0a) {
      // Enter key
      Deno.stdin.setRaw(false);
      await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR + "\n"));
      if (filteredOptions.length > 0) {
        return filteredOptions[selectedIndex].value;
      }
      return null;
    } else if (input[0] === 0x7f || input[0] === 0x08) {
      // Backspace (0x7f on macOS, 0x08 on some systems)
      if (filterText.length > 0) {
        filterText = filterText.slice(0, -1);
        updateFilteredOptions();
        await rerender();
      }
    } else if (input[0] === 0x03) {
      // Ctrl-C
      Deno.stdin.setRaw(false);
      await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR + "\n"));
      console.log("\n👋 Cancelled");
      Deno.exit(0);
    } else if (input[0] >= 0x20 && input[0] < 0x7f) {
      // Printable ASCII character (space through ~)
      const char = String.fromCharCode(input[0]);

      // Special case: 'q' or 'Q' when no filter is active exits
      if ((char === "q" || char === "Q") && filterText === "") {
        Deno.stdin.setRaw(false);
        await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR + "\n"));
        return null;
      }

      // Add character to filter
      filterText += char;
      updateFilteredOptions();
      await rerender();
    }
  }

  Deno.stdin.setRaw(false);
  await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR));
  return null;
}

// ===== CHARM LINKING FUNCTIONS =====

function inferSchema(value: unknown): ObjectSchema {
  if (value === null || value === undefined) {
    return { type: "primitive", primitiveType: "any" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", elementSchema: { type: "primitive", primitiveType: "any" } };
    }
    return { type: "array", elementSchema: inferSchema(value[0]) };
  }

  if (typeof value === "object") {
    const fields: Record<string, ObjectSchema> = {};
    for (const [key, val] of Object.entries(value)) {
      // Skip UI and internal keys
      if (key === "UI" || key === "$UI" || key.startsWith("_")) continue;
      fields[key] = inferSchema(val);
    }
    return { type: "object", fields };
  }

  return { type: "primitive", primitiveType: typeof value };
}

function schemaToTypeString(schema: ObjectSchema): string {
  if (schema.type === "primitive") {
    return schema.primitiveType || "any";
  }
  if (schema.type === "array") {
    const elementType = schema.elementSchema ? schemaToTypeString(schema.elementSchema) : "any";
    return `${elementType}[]`;
  }
  if (schema.type === "object") {
    const fields = schema.fields || {};
    const keys = Object.keys(fields);
    if (keys.length === 0) return "{}";
    if (keys.length <= 3) {
      return `{${keys.join(", ")}}`;
    }
    return `{${keys.slice(0, 2).join(", ")}, +${keys.length - 2}}`;
  }
  return "unknown";
}

function inferType(value: unknown): string {
  return schemaToTypeString(inferSchema(value));
}

function flattenObject(
  obj: unknown,
  basePath: string[] = [],
  maxDepth: number = 3
): CharmField[] {
  const fields: CharmField[] = [];

  if (obj === null || obj === undefined) {
    return fields;
  }

  if (typeof obj !== "object") {
    // Primitive at root level
    const schema = inferSchema(obj);
    fields.push({
      path: basePath,
      fullPath: basePath.join("/"),
      type: schemaToTypeString(schema),
      value: obj,
      schema,
    });
    return fields;
  }

  if (Array.isArray(obj)) {
    // Add the array itself as a field
    const schema = inferSchema(obj);
    fields.push({
      path: basePath,
      fullPath: basePath.join("/"),
      type: schemaToTypeString(schema),
      value: `[${obj.length} items]`,
      schema,
    });
    return fields;
  }

  // Object - iterate keys
  for (const [key, value] of Object.entries(obj)) {
    // Skip UI and internal keys
    if (key === "UI" || key === "$UI" || key.startsWith("_")) continue;

    const currentPath = [...basePath, key];
    const schema = inferSchema(value);
    const type = schemaToTypeString(schema);

    // Add this field
    fields.push({
      path: currentPath,
      fullPath: currentPath.join("/"),
      type,
      value: schema.type === "object" ? "{...}" : schema.type === "array" ? `[${(value as unknown[]).length}]` : value,
      schema,
    });

    // Recurse into objects (but not too deep)
    if (schema.type === "object" && basePath.length < maxDepth) {
      const nested = flattenObject(value, currentPath, maxDepth);
      fields.push(...nested);
    }
  }

  return fields;
}

// Check if target schema is compatible with source schema
// Returns "compatible" if target's fields are a subset of source's fields with matching types
// Returns "maybe" if there's partial overlap or any types involved
// Returns "incompatible" if types don't match
function checkSchemaCompatibility(
  source: ObjectSchema | undefined,
  target: ObjectSchema | undefined
): "compatible" | "maybe" | "incompatible" {
  // If either is missing, can't determine
  if (!source || !target) return "maybe";

  // Primitives: must match exactly (or any)
  if (source.type === "primitive" && target.type === "primitive") {
    if (source.primitiveType === target.primitiveType) return "compatible";
    if (source.primitiveType === "any" || target.primitiveType === "any") return "maybe";
    return "incompatible";
  }

  // Mixed types (primitive vs object/array)
  if (source.type !== target.type) {
    // Any can match anything
    if (source.type === "primitive" && source.primitiveType === "any") return "maybe";
    if (target.type === "primitive" && target.primitiveType === "any") return "maybe";
    return "incompatible";
  }

  // Arrays: check element compatibility
  if (source.type === "array" && target.type === "array") {
    return checkSchemaCompatibility(source.elementSchema, target.elementSchema);
  }

  // Objects: check if target's fields are subset of source's fields
  if (source.type === "object" && target.type === "object") {
    const sourceFields = source.fields || {};
    const targetFields = target.fields || {};

    const sourceKeys = Object.keys(sourceFields);
    const targetKeys = Object.keys(targetFields);

    // Empty objects are compatible
    if (targetKeys.length === 0) return "compatible";
    if (sourceKeys.length === 0) return "maybe"; // Source has no fields, target expects some

    // Check if all target fields exist in source with compatible types
    let allMatch = true;
    let anyMatch = false;

    for (const targetKey of targetKeys) {
      const targetFieldSchema = targetFields[targetKey];

      // Look for exact key match first
      if (sourceFields[targetKey]) {
        const compat = checkSchemaCompatibility(sourceFields[targetKey], targetFieldSchema);
        if (compat === "compatible") {
          anyMatch = true;
        } else if (compat === "incompatible") {
          allMatch = false;
        } else {
          anyMatch = true;
          allMatch = false;
        }
        continue;
      }

      // Look for similar key names (fuzzy match)
      const similarKey = sourceKeys.find(sk =>
        sk.toLowerCase() === targetKey.toLowerCase() ||
        sk.toLowerCase().includes(targetKey.toLowerCase()) ||
        targetKey.toLowerCase().includes(sk.toLowerCase())
      );

      if (similarKey) {
        const compat = checkSchemaCompatibility(sourceFields[similarKey], targetFieldSchema);
        if (compat !== "incompatible") {
          anyMatch = true;
        }
        allMatch = false; // Not exact match
      } else {
        allMatch = false; // Field not found
      }
    }

    if (allMatch) return "compatible";
    if (anyMatch) return "maybe";
    return "incompatible";
  }

  return "incompatible";
}

function checkTypeCompatibility(
  sourceType: string,
  targetType: string,
  sourceSchema?: ObjectSchema,
  targetSchema?: ObjectSchema
): "compatible" | "maybe" | "incompatible" {
  // If we have schemas, use structural comparison
  if (sourceSchema && targetSchema) {
    return checkSchemaCompatibility(sourceSchema, targetSchema);
  }

  // Fallback to string-based comparison
  // Exact match
  if (sourceType === targetType) return "compatible";

  // Any matches anything
  if (sourceType === "any" || targetType === "any") return "maybe";
  if (sourceType.startsWith("any") || targetType.startsWith("any")) return "maybe";

  // Array compatibility (check element types)
  if (sourceType.endsWith("[]") && targetType.endsWith("[]")) {
    const sourceElement = sourceType.slice(0, -2);
    const targetElement = targetType.slice(0, -2);
    return checkTypeCompatibility(sourceElement, targetElement);
  }

  // Object to object - can't determine without schema
  if (sourceType.startsWith("{") && targetType.startsWith("{")) return "maybe";

  // Different types
  return "incompatible";
}

async function fetchCharmSchema(
  charm: RecentCharm,
  labsDir: string
): Promise<CharmSchema | null> {
  try {
    const command = new Deno.Command("deno", {
      args: [
        "task",
        "ct",
        "charm",
        "inspect",
        "--space", charm.space,
        "--charm", charm.charmId,
        "--json",
      ],
      cwd: labsDir,
      env: {
        ...Deno.env.toObject(),
        CT_API_URL: charm.apiUrl,
        CT_IDENTITY: IDENTITY_PATH,
      },
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout } = await command.output();

    if (code !== 0) {
      return null;
    }

    const output = new TextDecoder().decode(stdout);
    const data = JSON.parse(output);

    // Flatten source (inputs) and result (outputs)
    const inputs = flattenObject(data.source || {});
    const outputs = flattenObject(data.result || {});

    return {
      charmId: charm.charmId,
      name: data.name || charm.name,
      space: charm.space,
      apiUrl: charm.apiUrl,
      inputs,
      outputs,
    };
  } catch {
    return null;
  }
}

async function generateLinkSuggestions(
  recentCharms: RecentCharm[],
  labsDir: string,
  maxSuggestions: number = 10
): Promise<LinkSuggestion[]> {
  const suggestions: LinkSuggestion[] = [];

  // Fetch schemas for recent charms (limit to avoid too many API calls)
  const charmsToCheck = recentCharms.slice(0, 10);
  const schemas: Map<string, CharmSchema> = new Map();

  console.log("  Analyzing charms...");

  for (const charm of charmsToCheck) {
    const schema = await fetchCharmSchema(charm, labsDir);
    if (schema) {
      schemas.set(charm.charmId, schema);
    }
  }

  if (schemas.size < 2) {
    return []; // Need at least 2 charms to suggest links
  }

  // Compare all pairs of charms
  const schemaArray = Array.from(schemas.values());

  for (let i = 0; i < schemaArray.length; i++) {
    const sourceSchema = schemaArray[i];
    const sourceCharm = charmsToCheck.find(c => c.charmId === sourceSchema.charmId)!;

    for (let j = 0; j < schemaArray.length; j++) {
      if (i === j) continue; // Skip self-linking for suggestions

      const targetSchema = schemaArray[j];
      const targetCharm = charmsToCheck.find(c => c.charmId === targetSchema.charmId)!;

      // Compare outputs from source to inputs of target
      for (const outputField of sourceSchema.outputs) {
        for (const inputField of targetSchema.inputs) {
          const compatibility = checkTypeCompatibility(
            outputField.type,
            inputField.type,
            outputField.schema,
            inputField.schema
          );

          if (compatibility === "incompatible") continue;

          // Calculate score
          let score = 0;

          // Exact type match bonus
          if (compatibility === "compatible") score += 100;
          else if (compatibility === "maybe") score += 50;

          // Name similarity bonus
          const outputName = outputField.path[outputField.path.length - 1]?.toLowerCase() || "";
          const inputName = inputField.path[inputField.path.length - 1]?.toLowerCase() || "";
          if (outputName === inputName) score += 50;
          else if (outputName.includes(inputName) || inputName.includes(outputName)) score += 25;

          // Recency bonus (more recent charms get higher scores)
          const sourceIndex = charmsToCheck.indexOf(sourceCharm);
          const targetIndex = charmsToCheck.indexOf(targetCharm);
          score += (10 - sourceIndex) * 2;
          score += (10 - targetIndex) * 2;

          // Top-level field bonus
          if (outputField.path.length === 1) score += 10;
          if (inputField.path.length === 1) score += 10;

          suggestions.push({
            source: { charm: sourceCharm, field: outputField },
            target: { charm: targetCharm, field: inputField },
            compatibility,
            score,
          });
        }
      }
    }
  }

  // Sort by score and return top suggestions
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, maxSuggestions);
}

async function createCharmLink(
  sourceCharmId: string,
  sourcePath: string[],
  targetCharmId: string,
  targetPath: string[],
  space: string,
  apiUrl: string,
  labsDir: string
): Promise<boolean> {
  const sourceRef = `${sourceCharmId}/${sourcePath.join("/")}`;
  const targetRef = `${targetCharmId}/${targetPath.join("/")}`;

  const command = new Deno.Command("deno", {
    args: [
      "task",
      "ct",
      "charm",
      "link",
      "--space", space,
      sourceRef,
      targetRef,
    ],
    cwd: labsDir,
    env: {
      ...Deno.env.toObject(),
      CT_API_URL: apiUrl,
      CT_IDENTITY: IDENTITY_PATH,
    },
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code === 0) {
    const output = new TextDecoder().decode(stdout);
    console.log(output);
    return true;
  } else {
    const errorOutput = new TextDecoder().decode(stderr);
    console.error("Link failed:", errorOutput);
    return false;
  }
}

// ===== MAIN FUNCTIONS =====

async function handleOtherActions(labsDir: string): Promise<boolean> {
  const options: SelectOption[] = [
    {
      label: "Clear LLM cache",
      value: "clear-llm-cache",
      icon: "🗑️  ",
    },
    {
      label: "Clear local SQLite database",
      value: "clear-sqlite",
      icon: "⚠️  ",
    },
    {
      label: "Back to main menu",
      value: "back",
      icon: "⬅️  ",
    },
  ];

  const selection = await interactiveSelect(
    options,
    "⚙️  Other Actions\n\n(↑/↓ to move, Enter to select, Q to cancel):"
  );

  if (selection === "back" || selection === null) {
    return false; // Return to main menu
  }

  if (selection === "clear-llm-cache") {
    return await clearLLMCache(labsDir);
  }

  if (selection === "clear-sqlite") {
    return await clearSQLiteDatabase(labsDir);
  }

  return false;
}

async function handleLinkCharms(config: Config, labsDir: string): Promise<void> {
  console.log("\n🔗 Charm Linker\n");

  if (config.recentCharms.length === 0) {
    console.log("No recently deployed charms found.");
    console.log("Deploy some patterns first, then come back to link them.\n");
    console.log("💡 Tip: Deploy patterns using this launcher to track them automatically.\n");
    return;
  }

  if (config.recentCharms.length < 2) {
    console.log("Need at least 2 charms to create links.");
    console.log("Deploy another pattern, then come back to link them.\n");
    return;
  }

  // Generate suggestions
  console.log("Scanning recent charms for compatible links...\n");
  const suggestions = await generateLinkSuggestions(config.recentCharms, labsDir);

  if (suggestions.length === 0) {
    console.log("\n⚠️  No compatible links found between recent charms.");
    console.log("   This could mean:");
    console.log("   • Charms don't have matching field types");
    console.log("   • Charms are no longer accessible");
    console.log("   • Fields are already linked\n");

    // Show what we have
    console.log("Recent charms:");
    for (const charm of config.recentCharms.slice(0, 5)) {
      const timeAgo = formatTimeSince(charm.deployedAt);
      console.log(`  • ${charm.name || "unnamed"} in ${charm.space} (${timeAgo})`);
    }
    console.log("\n💡 Manual linking will be available soon.\n");
    return;
  }

  // Build selection options from suggestions
  const options: SelectOption[] = [];

  for (const suggestion of suggestions) {
    const compatIcon = suggestion.compatibility === "compatible" ? "✅" : "⚠️";
    const sourceName = suggestion.source.charm.name || "unnamed";
    const targetName = suggestion.target.charm.name || "unnamed";
    const sourceField = suggestion.source.field.fullPath;
    const targetField = suggestion.target.field.fullPath;
    const types = `${suggestion.source.field.type} → ${suggestion.target.field.type}`;

    // Cross-space indicator
    const crossSpace = suggestion.source.charm.space !== suggestion.target.charm.space
      ? " 🌐"
      : "";

    options.push({
      label: `${sourceName}/${sourceField} → ${targetName}/${targetField} (${types})${crossSpace}`,
      value: JSON.stringify({
        sourceCharmId: suggestion.source.charm.charmId,
        sourcePath: suggestion.source.field.path,
        targetCharmId: suggestion.target.charm.charmId,
        targetPath: suggestion.target.field.path,
        space: suggestion.target.charm.space,
        apiUrl: suggestion.target.charm.apiUrl,
      }),
      icon: `${compatIcon} `,
    });
  }

  // Add manual selection option
  options.push({
    label: "Manual selection...",
    value: "__manual__",
    icon: "🔧 ",
  });

  // Show selection
  const selection = await interactiveSelect(
    options,
    "🔗 Suggested Links\n\nSelect a link to create (↑/↓ to move, Enter to select, Q to quit):"
  );

  if (!selection) {
    console.log("👋 Cancelled\n");
    return;
  }

  if (selection === "__manual__") {
    console.log("\n⏳ Manual selection UI coming soon!");
    console.log("   This will let you browse charms and fields interactively.\n");
    return;
  }

  // Parse selection and create link
  try {
    const linkData = JSON.parse(selection);

    console.log("\n🔗 Creating link...");
    console.log(`   Source: ${linkData.sourceCharmId.slice(0, 16)}.../${linkData.sourcePath.join("/")}`);
    console.log(`   Target: ${linkData.targetCharmId.slice(0, 16)}.../${linkData.targetPath.join("/")}`);
    console.log(`   Space: ${linkData.space}\n`);

    const success = await createCharmLink(
      linkData.sourceCharmId,
      linkData.sourcePath,
      linkData.targetCharmId,
      linkData.targetPath,
      linkData.space,
      linkData.apiUrl,
      labsDir
    );

    if (success) {
      console.log("\n✅ Link created successfully!\n");
    } else {
      console.log("\n❌ Failed to create link. Check the error above.\n");
    }
  } catch (e) {
    console.error("Error creating link:", e);
  }
}

async function clearLLMCache(labsDir: string): Promise<boolean> {
  console.log("\n🗑️  Clear LLM Cache\n");
  console.log("This will delete all cached LLM responses.");
  console.log("You will need to regenerate any AI-generated content.\n");

  const confirm = await prompt("Type 'yes' to confirm");

  if (confirm.toLowerCase() !== "yes") {
    console.log("❌ Cancelled\n");
    return false;
  }

  try {
    // Run deno task to clear LLM cache
    const command = new Deno.Command("deno", {
      args: ["task", "ct", "cache", "clear"],
      cwd: labsDir,
      stdout: "inherit",
      stderr: "inherit",
    });

    const { code } = await command.output();

    if (code === 0) {
      console.log("\n✅ LLM cache cleared successfully\n");
      return true;
    } else {
      console.log("\n❌ Failed to clear LLM cache\n");
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ Error: ${message}\n`);
    return false;
  }
}

async function clearSQLiteDatabase(labsDir: string): Promise<boolean> {
  console.log("\n⚠️  ⚠️  ⚠️  DANGER: Clear Local SQLite Database ⚠️  ⚠️  ⚠️\n");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                                                           ║");
  console.log("║  THIS WILL PERMANENTLY DELETE ALL LOCAL DATA             ║");
  console.log("║                                                           ║");
  console.log("║  You will lose:                                           ║");
  console.log("║  • All patterns deployed to localhost                     ║");
  console.log("║  • All local spaces                                       ║");
  console.log("║  • All local charms                                       ║");
  console.log("║  • All local data and state                               ║");
  console.log("║                                                           ║");
  console.log("║  THIS CANNOT BE UNDONE!                                   ║");
  console.log("║                                                           ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const confirm1 = await prompt("Type 'DELETE' (in caps) to proceed");

  if (confirm1 !== "DELETE") {
    console.log("❌ Cancelled - no data was deleted\n");
    return false;
  }

  console.log("\n⚠️  Final confirmation required\n");
  const confirm2 = await prompt("Type 'I understand this is permanent' to confirm");

  if (confirm2 !== "I understand this is permanent") {
    console.log("❌ Cancelled - no data was deleted\n");
    return false;
  }

  try {
    // SQLite files are stored in cache/memory directories as per-space .sqlite files
    const sqliteDir = `${labsDir}/packages/toolshed/cache/memory`;

    let deletedCount = 0;

    try {
      for await (const entry of Deno.readDir(sqliteDir)) {
        if (entry.isFile && entry.name.endsWith(".sqlite")) {
          await Deno.remove(`${sqliteDir}/${entry.name}`);
          deletedCount++;
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    if (deletedCount > 0) {
      console.log(`\n✅ Deleted ${deletedCount} SQLite database file${deletedCount > 1 ? 's' : ''} from:`);
      console.log(`   ${sqliteDir}\n`);
      console.log("   Restart your dev server to initialize fresh databases.\n");
      return true;
    } else {
      console.log("\n⚠️  No SQLite database files found\n");
      console.log(`   Checked: ${sqliteDir}/*.sqlite\n`);
      console.log("   The database may already be clean.\n");
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ Error: ${message}\n`);
    return false;
  }
}

async function promptForDeploymentTarget(config: Config): Promise<"local" | "prod" | "link" | "other"> {
  const options: SelectOption[] = [];

  // Get last used target
  const lastTarget = config.lastDeploymentTarget || "local";

  // Add both options, with last used first
  if (lastTarget === "local") {
    options.push({
      label: "localhost:8000 (last used)",
      value: "local",
      icon: "💻 ",
    });
    options.push({
      label: "production (toolshed.saga-castor.ts.net)",
      value: "prod",
      icon: "🌐 ",
    });
  } else {
    options.push({
      label: "production (toolshed.saga-castor.ts.net) (last used)",
      value: "prod",
      icon: "🌐 ",
    });
    options.push({
      label: "localhost:8000",
      value: "local",
      icon: "💻 ",
    });
  }

  // Add "link charms" option
  const recentCharmsCount = config.recentCharms.length;
  const linkLabel = recentCharmsCount > 0
    ? `Link charms... (${recentCharmsCount} recent)`
    : "Link charms...";
  options.push({
    label: linkLabel,
    value: "link",
    icon: "🔗 ",
  });

  // Add "other actions" option at the end
  options.push({
    label: "Take other actions...",
    value: "other",
    icon: "⚙️  ",
  });

  const selection = await interactiveSelect(
    options,
    "🚀 Pattern Launcher\n\nSelect deployment target (↑/↓ to move, Enter to select):"
  );

  return (selection as "local" | "prod" | "link" | "other") || lastTarget;
}

async function promptForSpace(config: Config, isProd: boolean): Promise<string> {
  const options: SelectOption[] = [];

  // Get the appropriate last space based on deployment target
  const lastSpace = isProd ? config.lastSpaceProd : config.lastSpaceLocal;
  const defaultSpace = isProd ? "prod-space" : "test-space";

  // Add last used space if available
  if (lastSpace) {
    options.push({
      label: `${lastSpace} (last used)`,
      value: lastSpace,
      icon: "🔄 ",
    });

    // Check if we should suggest a new date-based space
    const todaySpace = getTodayDateSpace(lastSpace);
    if (todaySpace) {
      options.push({
        label: `${todaySpace} (today)`,
        value: todaySpace,
        icon: "📅 ",
      });
    }

    // Generate incremented space name
    const nextSpace = getNextSpaceName(lastSpace);
    options.push({
      label: `${nextSpace} (next)`,
      value: nextSpace,
      icon: "➡️  ",
    });
  }

  // Add "new space" option
  options.push({
    label: "Enter new space name...",
    value: "__new__",
    icon: "✨ ",
  });

  const selection = await interactiveSelect(
    options,
    "Select space (↑/↓ to move, Enter to select):"
  );

  if (selection === "__new__") {
    return await prompt("Enter space name", lastSpace || defaultSpace);
  }

  return selection || lastSpace || defaultSpace;
}

function getNextSpaceName(lastSpace: string): string {
  // Check if the space ends with "-<number>"
  const match = lastSpace.match(/^(.+)-(\d+)$/);

  if (match) {
    // Has a trailing number, increment it
    // e.g., "alex-1119-1" → "alex-1119-2"
    const base = match[1];
    const num = parseInt(match[2], 10);
    return `${base}-${num + 1}`;
  } else {
    // No trailing number, append "-1"
    // e.g., "alex-1119" → "alex-1119-1"
    return `${lastSpace}-1`;
  }
}

function getTodayDateSpace(lastSpace: string): string | null {
  // Try to detect date pattern (MMDD format): prefix-MMDD-counter
  // Example: alex-1119-1 → alex-1120-1 (if today is Nov 20)
  const pattern = /^(.+)-(\d{4})-(\d+)$/;
  const match = lastSpace.match(pattern);

  if (!match) {
    return null; // No date pattern detected
  }

  const prefix = match[1];
  const dateStr = match[2];

  // Try to parse as MMDD
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);

  // Validate it's a reasonable date
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null; // Not a valid date
  }

  // Get today's date
  const today = new Date();
  const todayMonth = today.getMonth() + 1; // 0-indexed
  const todayDay = today.getDate();

  // Check if it's a different day
  if (month === todayMonth && day === todayDay) {
    return null; // Same day, don't suggest
  }

  // Format today's date as MMDD
  const todayMMDD = String(todayMonth).padStart(2, '0') + String(todayDay).padStart(2, '0');

  // Return new space name with today's date, counter reset to 1
  return `${prefix}-${todayMMDD}-1`;
}

async function selectPattern(config: Config): Promise<string | null> {
  const options: SelectOption[] = [];

  // Add recent patterns
  if (config.patterns.length > 0) {
    config.patterns.slice(0, 10).forEach((p) => {
      const shortPath = getShortPath(p.path);
      options.push({
        label: shortPath,
        value: p.path,
        icon: "📄 ",
      });
    });
  }

  // Add browse action
  options.push({
    label: "Browse for a new pattern...",
    value: "__browse__",
    icon: "📁 ",
  });

  const selection = await interactiveSelect(
    options,
    "📋 Select a pattern (↑/↓ to move, Enter to select, Q to quit):"
  );

  if (selection === "__browse__") {
    return await browseForPattern(config);
  }

  return selection;
}

async function browseForPattern(config: Config): Promise<string | null> {
  // Extract unique directories from pattern history
  const recentDirs = new Set<string>();

  for (const pattern of config.patterns) {
    // Get the directory containing this pattern
    const dir = pattern.path.substring(0, pattern.path.lastIndexOf("/") + 1);
    if (dir) {
      recentDirs.add(dir);
    }
  }

  const dirArray = Array.from(recentDirs).slice(0, 10); // Show up to 10 recent dirs

  // Build options
  const options: SelectOption[] = [];

  // Add recent directories
  if (dirArray.length > 0) {
    dirArray.forEach((dir) => {
      const shortDir = dir.replace(Deno.env.get("HOME") || "", "~");
      options.push({
        label: shortDir,
        value: dir,
        icon: "📁 ",
      });
    });
  }

  // Add browse option
  options.push({
    label: "Browse from patterns/ directory...",
    value: "__browse__",
    icon: "🔍 ",
  });

  const selection = await interactiveSelect(
    options,
    "📂 Quick navigate to a recent folder, or browse:\n(↑/↓ to move, Enter to select, Q to cancel)"
  );

  if (selection === "__browse__") {
    // Start in the patterns directory
    const startDir = `${REPO_ROOT}patterns/`;
    return await navigateDirectory(startDir);
  } else if (selection) {
    // Navigate to the selected directory
    return await navigateDirectory(selection);
  } else {
    return null;
  }
}

async function navigateDirectory(currentPath: string): Promise<string | null> {
  // Read directory contents
  const entries: { name: string; isDir: boolean; isPattern: boolean }[] = [];

  try {
    for await (const entry of Deno.readDir(currentPath)) {
      const isPattern = entry.isFile && entry.name.endsWith(".tsx");
      // Show directories and .tsx files only
      if (entry.isDirectory || isPattern) {
        entries.push({
          name: entry.name,
          isDir: entry.isDirectory,
          isPattern,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`❌ Cannot read directory: ${message}`);
    return null;
  }

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Build options for interactive selection
  const options: SelectOption[] = [];

  // Add "up" navigation first
  if (currentPath !== "/") {
    options.push({
      label: ".. (Go up one directory)",
      value: "__up__",
      icon: "⬆️  ",
    });
  }

  // Add entries (directories and files)
  entries.forEach((entry) => {
    const icon = entry.isDir ? "📁 " : "📄 ";
    options.push({
      label: entry.name,
      value: entry.name,
      icon,
    });
  });

  // Add manual path entry at the end
  options.push({
    label: "Enter absolute path manually...",
    value: "__manual__",
    icon: "✏️  ",
  });

  const title = `📁 ${currentPath}\n(↑/↓ to move, Enter to select, Q to cancel)`;
  const selection = await interactiveSelect(options, title);

  if (selection === null) {
    return null;
  }

  if (selection === "__up__") {
    // Go up one directory
    const parentPath = currentPath.split("/").slice(0, -2).join("/") + "/";
    if (parentPath.length > 0) {
      return await navigateDirectory(parentPath);
    }
    return await navigateDirectory("/");
  }

  if (selection === "__manual__") {
    return await enterPathManually();
  }

  // Check if it's a directory or file
  const selectedEntry = entries.find((e) => e.name === selection);
  if (!selectedEntry) return null;

  const fullPath = `${currentPath}${selectedEntry.name}`;

  if (selectedEntry.isDir) {
    // Navigate into directory
    return await navigateDirectory(`${fullPath}/`);
  } else {
    // Selected a file
    return fullPath;
  }
}

async function enterPathManually(): Promise<string | null> {
  console.log("\n📁 Enter absolute path to pattern file:");
  const path = await prompt("Path");

  if (!path) {
    return null;
  }

  // Check if file exists
  try {
    const stat = await Deno.stat(path);
    if (!stat.isFile) {
      console.log("❌ Path is not a file");
      return await enterPathManually();
    }
    if (!path.endsWith(".tsx")) {
      console.log("⚠️  Warning: File doesn't end with .tsx");
    }
    return path;
  } catch {
    console.log("❌ File not found");
    return await enterPathManually();
  }
}

async function getLabsDir(config: Config): Promise<string> {
  // Use configured labs dir if available
  if (config.labsDir) {
    return config.labsDir;
  }

  // Try default location
  try {
    const stat = await Deno.stat(DEFAULT_LABS_DIR);
    if (stat.isDirectory) {
      return DEFAULT_LABS_DIR;
    }
  } catch {
    // Default doesn't exist
  }

  // Prompt user for labs location
  console.log("\n⚠️  Could not find labs directory at default location:");
  console.log(`   ${DEFAULT_LABS_DIR}`);
  console.log("\nPlease enter the path to your labs repository:");

  const labsPath = await prompt("Labs directory path");

  // Verify it exists
  try {
    const stat = await Deno.stat(labsPath);
    if (!stat.isDirectory) {
      console.log("❌ Not a directory");
      Deno.exit(1);
    }
    return labsPath;
  } catch {
    console.log("❌ Directory not found");
    Deno.exit(1);
  }
}

async function openInBrowser(url: string): Promise<void> {
  // Detect platform and use appropriate command
  const platform = Deno.build.os;
  let command: string[];

  switch (platform) {
    case "darwin":
      command = ["open", url];
      break;
    case "linux":
      command = ["xdg-open", url];
      break;
    case "windows":
      command = ["cmd", "/c", "start", url];
      break;
    default:
      console.log(`⚠️  Unknown platform: ${platform}`);
      return;
  }

  try {
    await new Deno.Command(command[0], {
      args: command.slice(1),
      stdout: "null",
      stderr: "null",
    }).output();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`⚠️  Could not open browser: ${message}`);
  }
}

async function promptOpenBrowser(url: string): Promise<void> {
  console.log("Press Enter to open in browser, or Q to quit...");
  console.log("(Auto-closing in 10 seconds)");

  // Set up raw mode to capture single keypress
  Deno.stdin.setRaw(true);

  // Countdown animation
  let secondsLeft = 10;
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      // Move cursor up one line, clear it, and rewrite the countdown
      Deno.stdout.writeSync(new TextEncoder().encode(CURSOR_UP + CLEAR_LINE + CURSOR_TO_START));
      console.log(`(Auto-closing in ${secondsLeft} second${secondsLeft !== 1 ? 's' : ''})`);
    }
  }, 1000);

  // Set up timeout
  const timeoutId = setTimeout(() => {
    clearInterval(countdownInterval);
    Deno.stdin.setRaw(false);
    console.log("\n👋 Timed out, closing...\n");
    Deno.exit(0);
  }, 10000);

  try {
    const buf = new Uint8Array(1);
    const n = await Deno.stdin.read(buf);

    // Clear timeout and countdown interval
    clearTimeout(timeoutId);
    clearInterval(countdownInterval);
    Deno.stdin.setRaw(false);

    if (n === null) {
      console.log("\n👋 Closing...\n");
      return;
    }

    const key = buf[0];

    // Check for Enter (0x0d or 0x0a)
    if (key === 0x0d || key === 0x0a) {
      console.log("\n🌐 Opening in browser...\n");
      await openInBrowser(url);
      return;
    }

    // Check for 'q' or 'Q' (0x71 or 0x51)
    if (key === 0x71 || key === 0x51) {
      console.log("\n👋 Closing without opening browser...\n");
      return;
    }

    // Check for Ctrl-C (0x03)
    if (key === 0x03) {
      console.log("\n👋 Cancelled\n");
      Deno.exit(0);
    }

    // Any other key - just quit
    console.log("\n👋 Closing...\n");
  } catch (error) {
    clearTimeout(timeoutId);
    clearInterval(countdownInterval);
    Deno.stdin.setRaw(false);
    const message = error instanceof Error ? error.message : String(error);
    console.log(`⚠️  Error reading input: ${message}`);
  }
}

async function deployPattern(
  patternPath: string,
  space: string,
  isProd: boolean,
  labsDir: string
): Promise<string | null> {
  const apiUrl = isProd
    ? "https://toolshed.saga-castor.ts.net"
    : "http://localhost:8000";

  console.log("\n🚀 Deploying...");
  console.log(`  Pattern: ${getShortPath(patternPath)}`);
  console.log(`  Space: ${space}`);
  console.log(`  API: ${apiUrl}`);
  console.log(`  Identity: ${IDENTITY_PATH}\n`);

  // Set environment variables
  Deno.env.set("CT_IDENTITY", IDENTITY_PATH);
  Deno.env.set("CT_API_URL", apiUrl);

  // Run deployment command - capture output to extract charm ID
  const command = new Deno.Command("deno", {
    args: [
      "task",
      "ct",
      "charm",
      "new",
      "--space",
      space,
      patternPath,
    ],
    cwd: labsDir,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  // Decode output for charm ID extraction
  const output = new TextDecoder().decode(stdout);
  const errorOutput = new TextDecoder().decode(stderr);

  if (code === 0) {
    // Extract charm ID from output
    // Try multiple patterns to find the charm ID
    const patterns = [
      // Base32 encoded ID (starts with baedr, baed, etc.) - CommonTools format
      /^(ba[a-z0-9]{50,})$/m,
      // On its own line at the end
      /\n(ba[a-z0-9]{50,})\s*$/,
      // Standard UUID pattern anywhere in output
      /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
      // After "charm" or "Charm"
      /charm[:\s]+([a-f0-9-]{36})/i,
      // In a URL path
      /\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
    ];

    let charmId = null;
    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        charmId = match[1];
        break;
      }
    }

    if (charmId) {
      const fullUrl = `${apiUrl}/${space}/${charmId}`;
      console.log("\n✅ Deployed successfully!");
      console.log(`\n🔗 ${fullUrl}\n`);

      // Prompt to open in browser
      await promptOpenBrowser(fullUrl);

      return charmId;
    } else {
      // Could not extract charm ID - just show space URL
      console.log("\n✅ Deployed successfully!");
      console.log(`   View at: ${apiUrl}/${space}/`);
      console.log("\n⚠️  Could not extract charm ID from output.");
      console.log("   (Check the space to find your charm)");
      return "success";
    }
  } else {
    // Deployment failed - show output for debugging
    console.log("\n❌ Deployment failed\n");
    if (output) console.log(output);
    if (errorOutput) console.error(errorOutput);

    // If this was a production deployment, check for network-related errors
    if (isProd) {
      const combinedOutput = (output + errorOutput).toLowerCase();
      const networkErrorPatterns = [
        'connect',
        'econnrefused',
        'network',
        'timeout',
        'enotfound',
        'getaddrinfo',
        'fetch failed',
        'failed to fetch',
      ];

      const hasNetworkError = networkErrorPatterns.some(pattern =>
        combinedOutput.includes(pattern)
      );

      if (hasNetworkError) {
        console.log("\n💡 Tip: Production deployments require Tailscale to be running.");
        console.log("   Check if Tailscale is connected and try again.\n");
      }
    }

    return null;
  }
}

function recordPatternUsage(config: Config, patternPath: string): Config {
  // Remove existing entry for this pattern
  const filtered = config.patterns.filter((p) => p.path !== patternPath);

  // Add to front with current timestamp
  filtered.unshift({
    path: patternPath,
    lastUsed: new Date().toISOString(),
  });

  // Keep only last 50
  config.patterns = filtered.slice(0, 50);

  return config;
}

function recordRecentCharm(
  config: Config,
  charmId: string,
  space: string,
  apiUrl: string,
  patternPath: string
): Config {
  // Derive a name from the pattern filename
  const filename = patternPath.split("/").pop() || "";
  const name = filename.replace(/\.tsx?$/, "");

  // Remove existing entry for this charm (same charmId)
  const filtered = config.recentCharms.filter((c) => c.charmId !== charmId);

  // Add to front with current timestamp
  filtered.unshift({
    space,
    charmId,
    name,
    recipeName: filename,
    patternPath,
    deployedAt: new Date().toISOString(),
    apiUrl,
  });

  // Keep only last 100 recent charms
  config.recentCharms = filtered.slice(0, 100);

  return config;
}

async function cullNonExistentPatterns(config: Config): Promise<Config> {
  const existingPatterns: PatternRecord[] = [];

  for (const pattern of config.patterns) {
    try {
      await Deno.stat(pattern.path);
      // File exists, keep it
      existingPatterns.push(pattern);
    } catch {
      // File doesn't exist, skip it (silent removal)
    }
  }

  config.patterns = existingPatterns;
  return config;
}

// ===== MAIN =====

async function main() {
  // Load config
  let config = await loadConfig();

  // Clean up any invalid pattern entries (files that no longer exist)
  const originalPatternCount = config.patterns.length;
  config = await cullNonExistentPatterns(config);
  const removedCount = originalPatternCount - config.patterns.length;

  // Save cleaned config if anything was removed
  if (removedCount > 0) {
    await saveConfig(config);
    console.log(`🧹 Cleaned up ${removedCount} invalid pattern${removedCount > 1 ? 's' : ''} from history\n`);
  }

  // Get labs directory (may prompt user if not configured)
  const labsDir = await getLabsDir(config);

  // Save labs dir to config if it was just determined
  if (!config.labsDir && labsDir !== DEFAULT_LABS_DIR) {
    config.labsDir = labsDir;
    await saveConfig(config);
  }

  // Prompt for deployment target (first question)
  const deploymentTarget = await promptForDeploymentTarget(config);

  // Handle "link charms" menu
  if (deploymentTarget === "link") {
    await handleLinkCharms(config, labsDir);
    Deno.exit(0);
  }

  // Handle "other actions" menu
  if (deploymentTarget === "other") {
    await handleOtherActions(labsDir);
    // After handling other actions, exit (user can run the tool again)
    Deno.exit(0);
  }

  const isProd = deploymentTarget === "prod";

  // Prompt for space
  const space = await promptForSpace(config, isProd);
  if (!space) {
    console.log("❌ No space provided");
    Deno.exit(1);
  }

  // Save deployment target and space immediately (even if deployment fails)
  config.lastDeploymentTarget = deploymentTarget;
  if (isProd) {
    config.lastSpaceProd = space;
  } else {
    config.lastSpaceLocal = space;
  }
  await saveConfig(config);

  // Select pattern
  const patternPath = await selectPattern(config);
  if (!patternPath) {
    console.log("👋 Cancelled");
    Deno.exit(0);
  }

  // Save pattern usage immediately (even if deployment fails)
  config = recordPatternUsage(config, patternPath);
  await saveConfig(config);

  // Deploy
  const apiUrl = isProd
    ? "https://toolshed.saga-castor.ts.net"
    : "http://localhost:8000";
  const result = await deployPattern(patternPath, space, isProd, labsDir);

  if (!result) {
    // Deployment failed
    Deno.exit(1);
  }

  // Record the charm if we got a valid charm ID (not just "success")
  if (result !== "success" && result.startsWith("ba")) {
    config = recordRecentCharm(config, result, space, apiUrl, patternPath);
  }

  // Clean up any stale patterns after successful deployment
  config = await cullNonExistentPatterns(config);
  await saveConfig(config);
}

if (import.meta.main) {
  main();
}
