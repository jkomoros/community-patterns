# jkomoros Common Tools Patterns

This is a personal collection of Common Tools patterns demonstrating various framework features and real-world use cases.

## Table of Contents

- [Stable Patterns](#stable-patterns)
  - [Meal Planning](#meal-planning)
  - [Family & Parenting](#family--parenting)
  - [Productivity & Organization](#productivity--organization)
  - [Google Integration](#google-integration)
  - [Security & Privacy](#security--privacy)
  - [Developer Tools](#developer-tools)
- [WIP Patterns](#wip-patterns)
- [Library Patterns (lib/)](#library-patterns-lib)
- [Utilities (utils/)](#utilities-utils)

---

## Stable Patterns

### Meal Planning

#### `food-recipe.tsx`
Full-featured recipe management with ingredient tracking, step groups, dietary analysis, and LLM-powered extraction from images/text.

**Interesting features:**
- LLM extraction from uploaded recipe images or pasted text
- Step groups with timing constraints (prep time, cook time, rest time, hold time)
- Oven requirements tracking (temperature, rack positions, duration)
- Dietary compatibility analysis with warnings
- Diff view for comparing LLM suggestions vs current values

#### `prepared-food.tsx`
For tracking store-bought, guest-brought, or takeout foods. Companion to food-recipe for meal planning.

**Interesting features:**
- Dietary tags and primary ingredients for compatibility checking
- Source tracking (store, person, restaurant)
- Integrates with meal-orchestrator for comprehensive meal planning

#### `meal-orchestrator.tsx`
Plan multi-recipe meals with equipment scheduling and dietary analysis. Links to food-recipe and prepared-food charms.

**Interesting features:**
- LLM-powered recipe linking from free-form planning notes
- Equipment tracking (multiple ovens, stovetop burners)
- Guest dietary requirements with per-guest profiles
- Oven timeline visualization with conflict detection
- Meal balance analysis (category breakdown, serving calculations)
- Creates new recipe/prepared-food charms from planning notes

#### `food-recipe-viewer.tsx`
Simplified read-only viewer for food recipes. Used for displaying recipe details in other contexts.

#### `recipe-analyzer.tsx`
LLM-powered recipe extraction component. Takes raw text/image and extracts structured recipe data.

---

### Family & Parenting

#### `star-chart.tsx`
A reward calendar for children learning daily habits. Shows a rolling 30-day timeline with gold stars for successful days.

**Interesting features:**
- Stars appear as magical stickers with random tilts and shimmer effects
- Streak tracking with milestone celebrations (3 days, 1 week, 2 weeks, 1 month)
- Streak protection for "off" days
- Parent correction mode for fixing mistakes
- Debug mode with linkable date picker for testing

#### `reward-spinner.tsx`
A fun prize spinner for kids with adjustable odds.

**Interesting features:**
- Three prize types: 3 jelly beans, 1 jelly bean, or a hug
- Adjustable "generosity" slider (0 = mostly hugs, 10 = lots of candy)
- Slot machine animation with smooth spin sequence
- Spin history tracking with timestamp and generosity level
- Weighted random selection with configurable probabilities

---

### Productivity & Organization

#### `story-weaver.tsx` (formerly spindle-board)
Brainstorm and weave story ideas using AI prompts. Generate options, pin favorites, and vote on directions.

**Interesting features:**
- Multiple prompt levels (story level vs spindle/detail level)
- Option generation with LLM using customizable system prompts
- Pinnable options with voting system
- Rich markdown rendering for story content
- Editable story board title

#### `page-creator.tsx`
Launcher/home screen for creating new charms. Uses factory functions to instantiate patterns.

**Interesting features:**
- Demonstrates factory function idiom for pattern instantiation
- Clean navigation between pattern types

#### `shopping-list.tsx`
Simple shopping list pattern. Basic item management.

#### `shopping-list-launcher.tsx`
Shopping list with grocery store integration. Creates and links to store maps for optimized shopping routes.

**Interesting features:**
- LLM-powered item categorization by store aisle
- Store map integration for visual shopping optimization
- Cross-off items as you shop

#### `store-mapper.tsx`
Map and memorize grocery store layouts. Configure aisles, departments, and entrances.

**Interesting features:**
- Visual store map with draggable departments
- Aisle naming and organization
- LLM-powered suggestions for aisle contents
- Multiple entrance support
- Learning from corrections (item location feedback improves future suggestions)

#### `cozy-poll.tsx`
Multi-voter anonymous polling system. Create polls and share with friends.

**Interesting features:**
- Anonymous voting with voter name collection
- Results visualization
- Multiple choice support

#### `cozy-poll-ballot.tsx` / `cozy-poll-lobby.tsx`
Supporting patterns for the cozy-poll voting system.

#### `person.tsx`
Contact/person management with structured fields and LLM enrichment.

**Interesting features:**
- Structured contact info (emails, phones, social links)
- LLM-powered suggestions for extracting data from notes
- Diff view for comparing LLM suggestions
- Mentionable for linking from other patterns

#### `meta-analyzer.tsx`
Analyzes patterns across person charms to suggest new custom fields.

**Interesting features:**
- Scans all person charms via wish/mentionable
- Identifies common unstructured data patterns
- Suggests field standardization

---

### Google Integration

#### `google-auth.tsx`
OAuth2 authentication flow for Google APIs. Provides auth tokens for other patterns.

**Interesting features:**
- OAuth2 PKCE flow implementation
- Token refresh handling
- Scope-based permission model
- Reusable auth component for Gmail, Calendar, etc.

#### `gmail-importer.tsx`
Import emails from Gmail using authenticated queries.

**Interesting features:**
- Gmail API integration with search queries
- Email content extraction (subject, body, attachments)
- Incremental sync support

#### `google-calendar-importer.tsx`
Import calendar events from Google Calendar.

**Interesting features:**
- Calendar API integration
- Event listing and filtering
- Date range queries

---

### Security & Privacy

#### `prompt-injection-tracker.tsx`
Track and analyze security reports about prompt injection and LLM vulnerabilities.

**Interesting features:**
- Five-level caching pipeline with deduplication
- Gmail integration for security newsletter parsing
- LLM-powered URL extraction and classification
- Web content fetching and analysis
- Report deduplication by canonical URL
- Read/unread tracking
- Extensive inline documentation about framework caching behavior

#### `hotel-membership-extractor.tsx`
Extract hotel loyalty membership numbers from Gmail using LLM analysis.

**Interesting features:**
- Gmail search with effective query hints
- LLM-powered membership number extraction
- Multi-brand support (Hilton, Marriott, Hyatt, IHG, Accor)
- Confidence scoring for extractions

#### `redactor.tsx`
Redact sensitive information from text using pattern-based detection.

**Interesting features:**
- Pattern-based PII detection
- Customizable redaction rules
- Preview before redaction

#### `redactor-with-vault.tsx`
Extended redactor with secure PII vault storage.

**Interesting features:**
- Separates redacted content from original PII
- Vault pattern for secure storage
- Reversible redaction with vault access

#### `simple-pii-vault.tsx`
Secure storage for sensitive personal information.

---

### Developer Tools

#### `space-setup.tsx`
AI-powered space setup wizard. Guides users through creating an initial set of charms.

**Interesting features:**
- LLM dialog for guided setup
- Creates notes, people, store maps, recipes via tool calls
- Demonstrates patternTool for LLM-callable handlers

#### `substack-summarizer.tsx`
Summarize Substack newsletter content.

#### `debug-date-picker.tsx`
Helper pattern for testing date-dependent patterns like star-chart.

#### `favorites-viewer.tsx`
Debug view for examining favorited/wish system.

#### `demo-setup.tsx`
Demo initialization helper.

#### `cheeseboard-schedule.tsx`
Fetch and display Cheeseboard pizza schedule with ingredient preferences.

**Interesting features:**
- External data fetching with fetchData
- Ingredient preference tracking (thumbs up/down)
- Pizza ranking based on liked/disliked ingredients
- Historical tracking of pizzas eaten

---

## WIP Patterns

Work-in-progress patterns in active development. May be incomplete or experimental.

#### `WIP/codenames-helper.tsx`
Helper for the Codenames board game. Includes PRD document.

#### `WIP/smart-rubric.tsx`
AI-powered grading rubric system.

#### `WIP/reduce-experiment.tsx`
Framework experiments with reduce operations.

#### `WIP/map-test-100-items.tsx`
Performance testing pattern for mapping over large arrays.

#### `WIP/favorites-debug.tsx`
Debugging utilities for the favorites system.

#### Various test patterns
- `test-ct-components.tsx` - Component testing
- `test-generateobject.tsx` - generateObject testing
- `test-toschema-nested-arrays.tsx` - Schema testing
- `wish-auth-test.tsx` / `wish-debug.tsx` - Wish system testing

---

## Library Patterns (lib/)

Reference patterns copied from upstream. **Do not modify directly** - copy to WIP or root if changes needed.

#### `lib/counter.tsx`
Basic counter pattern demonstrating handlers and state.

#### `lib/counter-handlers.ts`
Extracted handlers for counter pattern (demonstrates code organization).

#### `lib/note.tsx`
Simple note-taking pattern with title and content.

#### `lib/backlinks-index.tsx`
Utilities for working with mentionable charms and backlinks.

See `lib/README.md` for more details on library patterns.

---

## Utilities (utils/)

Shared utility functions used across patterns.

#### `utils/diff-utils.ts`
Word-level diff computation for comparing LLM suggestions with current values.

---

## Design Documents

The `design/` folder contains design documents, TODOs, and planning materials for complex patterns.

The `issues/` folder contains documented framework questions and architecture issues.

The `planning/` folder contains planning materials for future features.

---

## Pattern Development Notes

### Factory Function Idiom

Many patterns export a `create<PatternName>` factory function for clean instantiation:

```typescript
// Good: Use factory function
import { createPerson } from "./person.tsx";
navigateTo(createPerson({ givenName: "Alice" }));

// Avoid: Manual field enumeration
navigateTo(Person({ givenName: "", familyName: "", emails: [], ... }));
```

### Framework Caching

Patterns like `prompt-injection-tracker.tsx` demonstrate the framework's automatic caching:
- `generateObject` results cached by prompt + schema + model
- `fetchData` results cached by URL + method + body
- Multiple caching levels compose automatically

See the inline documentation in those patterns for detailed caching behavior.
