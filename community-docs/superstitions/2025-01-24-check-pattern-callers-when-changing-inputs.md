# ⚠️ SUPERSTITION: Check Pattern Callers When Changing Input Parameters

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

When modifying a pattern's input parameters (adding/removing/renaming fields), checking for other patterns that instantiate it.

## Problem

When you add or remove required parameters from a pattern's input type, other patterns that instantiate your pattern will break with TypeScript compilation errors. These errors only surface when you try to deploy or compile those calling patterns.

### What Didn't Work

**Just modifying the pattern without checking callers:**
```typescript
// In food-recipe.tsx - you change the input
interface RecipeInput {
  name: string;
  // ... existing fields ...
  stepGroups: StepGroup[];  // Changed from 'steps'
  restTime: number;         // Added new required field
  holdTime: number;         // Added new required field
  category: string;         // Added new required field
}
```

**Result:** Other patterns that create FoodRecipe instances (like space-setup.tsx, page-creator.tsx) break with compilation errors when they try to deploy.

## Solution That Seemed to Work

**After changing a pattern's input parameters:**

1. **Search for all callers** - Find patterns that instantiate your pattern:
   ```bash
   grep -r "navigateTo(YourPattern({" patterns/
   # OR
   grep -r "YourPattern({" patterns/
   ```

2. **Update each caller** - For each file found, update the instantiation to match the new input type:
   ```typescript
   // Before
   navigateTo(FoodRecipe({
     name: "",
     steps: [],  // Old parameter
   }))

   // After
   navigateTo(FoodRecipe({
     name: "",
     stepGroups: [],  // Updated parameter
     restTime: 0,     // Added required field
     holdTime: 0,     // Added required field
     category: "other", // Added required field
   }))
   ```

3. **Test each updated caller** - Deploy each calling pattern to verify it compiles:
   ```bash
   deno task ct charm new --space test-space patterns/user/calling-pattern.tsx
   ```

**Result:** All patterns compile successfully, no runtime type errors.

## Context

- **Patterns affected:** food-recipe.tsx, space-setup.tsx, page-creator.tsx, cheeseboard-schedule.tsx
- **Use case:** Adding new timing fields (restTime, holdTime) and changing steps → stepGroups
- **Framework:** CommonTools pattern system with TypeScript type checking
- **Error type:** `CompilerError: Property 'X' does not exist in type 'Y'` OR `Property 'Z' is missing in type but required`

## Theory / Hypothesis

CommonTools patterns are TypeScript functions with strict type checking. When you:
1. Change a pattern's input interface
2. Other patterns that call `navigateTo(YourPattern({...}))` have the old signature
3. TypeScript compilation fails when those calling patterns are compiled

The build system doesn't compile all patterns at once - each pattern is compiled when it's deployed. So you won't see errors in caller patterns until you try to deploy them.

## Detection

**Symptoms that indicate this problem:**
- You successfully deploy a pattern after changing its inputs
- But later, other patterns start failing with "Property missing" or "Property does not exist" errors
- The errors mention your pattern's name in the type
- The errors occur during compilation, not runtime

**How to verify:**
```bash
# Search for patterns that instantiate your pattern
grep -r "PatternName({" patterns/your-user/

# Look at git diff to see what you changed
git diff HEAD~1 patterns/your-user/your-pattern.tsx
```

## Workflow

1. **Before changing a pattern's input type:**
   ```bash
   # Find all callers first
   grep -r "MyPattern({" patterns/
   # Make note of which files call your pattern
   ```

2. **Change the pattern's input type**

3. **Immediately update all callers:**
   - Go through each file from step 1
   - Update the instantiation calls to match new signature
   - Add new required fields with sensible defaults

4. **Test each caller pattern:**
   ```bash
   deno task ct charm new --space test-space patterns/user/caller1.tsx
   deno task ct charm new --space test-space patterns/user/caller2.tsx
   ```

5. **Commit all changes together** so the repo stays consistent

## Alternative Patterns

**Make new fields optional with defaults:**
```typescript
interface RecipeInput {
  // ... existing fields ...
  restTime: Default<number, 0>;   // Optional with default
  holdTime: Default<number, 0>;   // Optional with default
}
```

This allows callers to omit the new fields, but you lose the type safety of requiring them.

## Related Patterns

- **Pattern Dependencies** - Understanding which patterns call which
- **TypeScript Strict Mode** - Why the type checker catches these errors
- **Refactoring Patterns** - Safe ways to change pattern interfaces

## Tools

**Search commands:**
```bash
# Find all patterns that instantiate YourPattern
grep -rn "YourPattern({" patterns/

# Find all imports of YourPattern
grep -rn "import.*YourPattern" patterns/

# Check recent changes to your pattern
git log -p --all -S "interface YourPatternInput" -- patterns/
```

## Formula / Rule of Thumb

```
Changed pattern input? → Search for callers → Update all callers → Test each one
```

**Never change just the pattern - always update callers in the same commit.**

## Metadata

```yaml
topic: patterns, typescript, refactoring, type-safety, dependencies
discovered: 2025-01-24
confirmed_count: 1
last_confirmed: 2025-01-24
sessions: [demo-setup-fix]
related_patterns: food-recipe, space-setup, page-creator, cheeseboard-schedule
status: superstition
stars: ⭐⭐
```

## Guestbook

- ⭐⭐ 2025-01-24 - Changed FoodRecipe input (steps → stepGroups, added restTime/holdTime/category). Deployed successfully. Then tried to deploy demo-setup.tsx which calls space-setup.tsx which creates FoodRecipe instances. Got compilation error about missing 'steps' property. Had to search for all FoodRecipe instantiations and update them. Also found page-creator.tsx had outdated CheeseboardSchedule call missing 'history' parameter. Would have saved time if I'd searched for callers first! (demo-setup-fix)

---

**Remember: This is just one observation. Test thoroughly in your own context!**

**IMPORTANT:** This superstition is about **proactive checking**, not reactive fixing. Don't wait for errors - search for callers BEFORE you commit the pattern changes!
