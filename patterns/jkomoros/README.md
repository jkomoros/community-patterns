# jkomoros Common Tools Patterns

Personal collection of Common Tools patterns demonstrating various framework features and real-world use cases.

## Stable Patterns

#### `cheeseboard-schedule.tsx`
Fetch and display Cheeseboard pizza schedule with ingredient preferences.

![cheeseboard-schedule](screenshots/cheeseboard-schedule.png)

**Interesting features:**
- External data fetching with fetchData
- **Idempotent side effects in computed** - auto-syncs fetched pizzas to history (reference implementation for `blessed/reactivity.md`)
- Ingredient preference tracking (thumbs up/down)
- Pizza ranking based on liked/disliked ingredients
- Historical tracking with object keys for efficient updates

#### `cozy-poll.tsx`
Multi-voter anonymous polling system. Create polls and share with friends.

![cozy-poll](screenshots/cozy-poll.png)

**Interesting features:**
- Anonymous voting with voter name collection
- Results visualization
- Multiple choice support

#### `cozy-poll-ballot.tsx` / `cozy-poll-lobby.tsx`
Supporting patterns for the cozy-poll voting system.

#### `debug-date-picker.tsx`
Helper pattern for testing date-dependent patterns like star-chart.

#### `demo-setup.tsx`
Demo initialization helper.

#### `favorites-viewer.tsx`
Debug view for examining favorited/wish system.

#### `food-recipe.tsx`
Full-featured recipe management with ingredient tracking, step groups, dietary analysis, and LLM-powered extraction from images/text.

![food-recipe](screenshots/food-recipe.png)

**Interesting features:**
- LLM extraction from uploaded recipe images or pasted text
- Step groups with timing constraints (prep time, cook time, rest time, hold time)
- Oven requirements tracking (temperature, rack positions, duration)
- Dietary compatibility analysis with warnings
- Diff view for comparing LLM suggestions vs current values

#### `food-recipe-viewer.tsx`
Simplified read-only viewer for food recipes. Used for displaying recipe details in other contexts.

#### `gmail-importer.tsx`
Import emails from Gmail using authenticated queries.

**Interesting features:**
- Gmail API integration with search queries
- Email content extraction (subject, body, attachments)
- Incremental sync support

#### `google-auth.tsx`
OAuth2 authentication flow for Google APIs. Provides auth tokens for other patterns.

**Interesting features:**
- OAuth2 PKCE flow implementation
- Token refresh handling
- Scope-based permission model
- Reusable auth component for Gmail, Calendar, etc.

#### `google-calendar-importer.tsx`
Import calendar events from Google Calendar.

**Interesting features:**
- Calendar API integration
- Event listing and filtering
- Date range queries

#### `hotel-membership-gmail-agent.tsx`
Extract hotel loyalty membership numbers from Gmail using LLM analysis.
Composes the `gmail-agentic-search.tsx` base pattern.

![hotel-membership-gmail-agent](screenshots/hotel-membership-gmail-agent.png)

**Interesting features:**
- Pattern composition using GmailAgenticSearch base pattern
- Agentic LLM-driven Gmail search with tool use
- Multi-brand support (Hilton, Marriott, Hyatt, IHG, Accor)
- Quick Scan (full search) and Check Recent (7-day) modes
- Shared Google Auth via wish("#googleAuth")

#### `meal-orchestrator.tsx`
Plan multi-recipe meals with equipment scheduling and dietary analysis. Links to food-recipe and prepared-food charms.

![meal-orchestrator](screenshots/meal-orchestrator.png)

**Interesting features:**
- LLM-powered recipe linking from free-form planning notes
- Equipment tracking (multiple ovens, stovetop burners)
- Guest dietary requirements with per-guest profiles
- Oven timeline visualization with conflict detection
- Meal balance analysis (category breakdown, serving calculations)
- Creates new recipe/prepared-food charms from planning notes

#### `meta-analyzer.tsx`
Analyzes patterns across person charms to suggest new custom fields.

**Interesting features:**
- Scans all person charms via wish/mentionable
- Identifies common unstructured data patterns
- Suggests field standardization

#### `page-creator.tsx`
Launcher/home screen for creating new charms. Imports patterns directly and uses optional defaults.

**Interesting features:**
- Demonstrates optional defaults idiom: `Pattern({})` works with all defaults
- Clean navigation between pattern types

#### `person.tsx`
Contact/person management with structured fields and LLM enrichment.

![person](screenshots/person.png)

**Interesting features:**
- Structured contact info (emails, phones, social links)
- LLM-powered suggestions for extracting data from notes
- Diff view for comparing LLM suggestions
- Mentionable for linking from other patterns

#### `prepared-food.tsx`
For tracking store-bought, guest-brought, or takeout foods. Companion to food-recipe for meal planning.

**Interesting features:**
- Dietary tags and primary ingredients for compatibility checking
- Source tracking (store, person, restaurant)
- Integrates with meal-orchestrator for comprehensive meal planning

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

#### `recipe-analyzer.tsx`
LLM-powered recipe extraction component. Takes raw text/image and extracts structured recipe data.

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

#### `reward-spinner.tsx`
A fun prize spinner for kids with adjustable odds.

![reward-spinner](screenshots/reward-spinner.png)

**Interesting features:**
- Three prize types: 3 jelly beans, 1 jelly bean, or a hug
- Adjustable "generosity" slider (0 = mostly hugs, 10 = lots of candy)
- Slot machine animation with smooth spin sequence
- Spin history tracking with timestamp and generosity level
- Weighted random selection with configurable probabilities

#### `shopping-list.tsx`
Simple shopping list pattern. Basic item management.

#### `shopping-list-launcher.tsx`
Shopping list with grocery store integration. Creates and links to store maps for optimized shopping routes.

**Interesting features:**
- LLM-powered item categorization by store aisle
- Store map integration for visual shopping optimization
- Cross-off items as you shop

#### `simple-pii-vault.tsx`
Secure storage for sensitive personal information.

#### `space-setup.tsx`
AI-powered space setup wizard. Guides users through creating an initial set of charms.

**Interesting features:**
- LLM dialog for guided setup
- Creates notes, people, store maps, recipes via tool calls
- Demonstrates patternTool for LLM-callable handlers

#### `star-chart.tsx`
A reward calendar for children learning daily habits. Shows a rolling 30-day timeline with gold stars for successful days.

![star-chart](screenshots/star-chart.png)

**Interesting features:**
- Stars appear as magical stickers with random tilts and shimmer effects
- Streak tracking with milestone celebrations (3 days, 1 week, 2 weeks, 1 month)
- Streak protection for "off" days
- Parent correction mode for fixing mistakes
- Debug mode with linkable date picker for testing

#### `store-mapper.tsx`
Map and memorize grocery store layouts. Configure aisles, departments, and entrances.

![store-mapper](screenshots/store-mapper.png)

**Interesting features:**
- Visual store map with draggable departments
- Aisle naming and organization
- LLM-powered suggestions for aisle contents
- Multiple entrance support
- Learning from corrections (item location feedback improves future suggestions)

#### `story-weaver.tsx` (formerly spindle-board)
Brainstorm and weave story ideas using AI prompts. Generate options, pin favorites, and vote on directions.

![story-weaver](screenshots/story-weaver.png)

**Interesting features:**
- Multiple prompt levels (story level vs spindle/detail level)
- Option generation with LLM using customizable system prompts
- Pinnable options with voting system
- Rich markdown rendering for story content
- Editable story board title

#### `substack-summarizer.tsx`
Summarize Substack newsletter content.

![substack-summarizer](screenshots/substack-summarizer.png)

#### `assumption-surfacer.tsx`
LLM chat that surfaces and tracks assumptions in conversation.

![assumption-surfacer](screenshots/assumption-surfacer.png)

**Interesting features:**
- Analyzes each assistant response for hidden assumptions
- Shows alternatives for each assumption with selection UI
- Tracks user corrections to build persistent context
- Avoids CPU loops using direct display of generateObject results

#### `calendar-event-manager.tsx`
Create, update, delete, and RSVP to Google Calendar events with mandatory user confirmation.

![calendar-event-manager](screenshots/calendar-event-manager.png)

**Interesting features:**
- Full CRUD operations for calendar events
- Mandatory user confirmation before any modification
- Security gate pattern for sensitive operations
- Supports event creation, updates, deletion, and RSVP responses

#### `calendar-viewer.tsx`
View calendar events synced via the apple-sync CLI tool.

**Interesting features:**
- Displays events from Apple Calendar synced locally
- Timeline view with date grouping
- Works with local SQLite database from CLI sync

#### `codenames-helper.tsx`
Helper for the Codenames board game. Upload photos of the board and keycard for AI-assisted clue generation.

![codenames-helper](screenshots/codenames-helper.png)

**Interesting features:**
- Photo extraction of game board (5x5 word grid)
- Keycard color extraction (red/blue/neutral/assassin)
- AI-powered clue suggestions with reasoning
- Manual JSON schema workaround for nested arrays

#### `family.tsx`
Family unit pattern for tracking reciprocal hosting relationships.

**Interesting features:**
- Links to person.tsx charms for family members
- Address storage for location matching
- Discoverable via wish("#family") when favorited
- Part of the hosting-tracker ecosystem

#### `favorite-foods-gmail-agent.tsx`
Gmail agent that extracts food preferences from emails using agentic search.

**Interesting features:**
- Uses gmail-agentic-search base pattern
- Searches delivery orders, reservations, recipes
- Uses elegant defineItemSchema + listTool API (eliminates 3x redundancy)
- Extracts cuisine, dishes, restaurants with confidence scores

#### `github-auth.tsx`
GitHub Personal Access Token authentication for GitHub API access.

**Interesting features:**
- PAT-based auth (classic tokens, no scopes for read-only)
- Token validation with user info display
- Rate limit tracking
- Discoverable via wish("#githubAuth") when favorited

#### `github-repo-card.tsx`
Display stats for a single GitHub repository.

**Interesting features:**
- Repo metadata (stars, forks, language, description)
- Star growth sparkline via API sampling
- Commit activity bar chart
- Momentum indicator (accelerating/steady/decelerating)
- Designed for composition via ct-render

#### `gmail-agentic-search.tsx`
Base pattern for building Gmail-based agentic searchers. Handles auth and provides tools for LLM agents.

**Interesting features:**
- Reusable composition pattern for Gmail agents
- Provides searchGmail tool for LLM agent use
- Manages Google Auth via wish
- Supports custom result schemas and suggested queries
- Used by hotel-membership, favorite-foods, person-research agents

#### `gmail-label-manager.tsx`
Add or remove labels from emails with mandatory user confirmation.

**Interesting features:**
- Batch label operations on multiple messages
- Shows available labels for selection
- Mandatory confirmation before any modification
- Security gate pattern for Gmail modifications

#### `gmail-search-registry.tsx`
Community query database for sharing effective Gmail search queries.

**Interesting features:**
- Centralized registry for Gmail search patterns
- Queries grouped by agent type (identified by source URL)
- Upvote/downvote system for query quality
- Discoverable via wish("#gmailSearchRegistry")

#### `gmail-sender.tsx`
Send emails via Gmail API with mandatory user confirmation.

**Interesting features:**
- Compose emails with to/cc/bcc, subject, body
- Thread reply support via message/thread IDs
- Mandatory confirmation showing exact email content
- Security gate pattern for email sending

#### `google-auth-personal.tsx` / `google-auth-work.tsx`
Google Auth wrapper patterns that add account type tags.

**Interesting features:**
- Wraps base google-auth pattern
- Adds #googleAuthPersonal or #googleAuthWork tags
- Enables multi-account discovery via wish

#### `google-auth-switcher.tsx`
Post-hoc Google account classification after login.

**Interesting features:**
- Log in first, classify account type after seeing email
- Better UX than pre-hoc account selection
- Creates appropriate wrapper pattern and navigates to it

#### `hosting-tracker.tsx`
Track reciprocal hosting between families to maintain balanced relationships.

![hosting-tracker](screenshots/hosting-tracker.png)

**Interesting features:**
- Dashboard showing overdue/balanced families
- Manual and calendar-based event entry
- Rule-based event classification with LLM suggestions
- Integrates with family.tsx and calendar patterns

#### `person-research-gmail-agent.tsx`
Gmail agent that researches information about a person from your email history.

**Interesting features:**
- Links to person.tsx via wish("#person") or manual name input
- Builds dynamic queries based on name and email
- Outputs markdown "agentic notes" with footnoted sources
- Uses gmail-agentic-search base pattern

#### `smart-rubric.tsx`
Decision making tool with weighted multi-dimensional scoring.

![smart-rubric](screenshots/smart-rubric.png)

**Interesting features:**
- Dynamic dimension management (categorical and numeric types)
- Reactive score calculation with derive()
- Manual ranking override with up/down buttons
- LLM-powered "Quick Add" extracts dimension values from descriptions
- Cell.equals() for Cell identity comparison

---

## WIP Patterns

Work-in-progress patterns in active development. May be incomplete or experimental.

#### `WIP/extracurricular-selector.tsx` ⚠️ KNOWN ISSUES
First attempt at extracurricular class scheduling. **Deprecated in favor of extracurricular-v2**.

#### `WIP/extracurricular-v2.tsx` ⚠️ KNOWN ISSUES
Multi-step extracurricular class scheduling for children. Paste schedule text, extract with LLM, review/triage classes, and build weekly schedule with conflict detection.

**Status:** Has a known unresolved issue with "one-shot population from LLM results" pattern.
See `issues/ISSUE-one-shot-population-from-llm.md` for details.

**Interesting features:**
- LLM extraction from pasted schedule text via `generateObject`
- Auto-triage: keeps grade-appropriate, discards age-inappropriate classes
- Checkbox selection with triage status indicators
- Weekly schedule view with conflict detection
- File/image upload with OCR for schedule text
- "Pinned sets" feature for different schedule configurations

**Known issue:** During LLM extraction, checkboxes thrash wildly (100% CPU). After extraction settles, checkbox clicks may not persist properly. The core problem is the "initialize from derived data, then allow mutation" pattern which appears to conflict with the reactive model. Seeking framework author guidance.

#### `WIP/autocomplete-value-demo.tsx`
Demo pattern for ct-autocomplete $value binding in single-select and multi-select modes.

**Interesting features:**
- Single-select mode: shows selected label in input, backspace to clear
- Multi-select mode: adds to array, filters already-selected items
- "Already added" items shown at bottom with remove functionality
- Custom values with "Add X" option

#### `WIP/favorites-debug.tsx`
Debugging utilities for the favorites system.

#### `WIP/github-momentum-tracker.tsx`
Track GitHub repo momentum across multiple repos (in development).

#### `WIP/imessage-viewer.tsx`
View iMessage conversations synced via apple-sync CLI.

#### `WIP/notes-viewer.tsx`
View Apple Notes synced via apple-sync CLI.

#### `WIP/reminders-viewer.tsx`
View Apple Reminders synced via apple-sync CLI.

#### `WIP/map-test-100-items.tsx`
Performance testing pattern for mapping over large arrays.

#### `WIP/reduce-experiment.tsx`
Framework experiments with reduce operations.

#### `WIP/test-*.tsx` and `WIP/wish-*.tsx`
Various test and reproduction patterns for framework features and bug reports.

---

## Library Patterns (lib/)

Reference patterns copied from upstream. **Do not modify directly** - copy to WIP or root if changes needed.

- `lib/backlinks-index.tsx` - Utilities for mentionable charms and backlinks
- `lib/counter.tsx` - Basic counter pattern
- `lib/counter-handlers.ts` - Extracted handlers (code organization demo)
- `lib/note.tsx` - Simple note-taking pattern

See `lib/README.md` for details.

---

## Utilities (utils/)

- `utils/diff-utils.ts` - Word-level diff computation for LLM suggestion comparison

---

## Supporting Folders

- `design/` - Design documents and TODOs for complex patterns
- `issues/` - Framework questions and architecture issues
- `planning/` - Planning materials for future features

---

## Development Notes

### Optional Defaults Idiom

Patterns use `field?: Default<T, V>` to make fields optional for callers:

```typescript
import Person from "./person.tsx";
navigateTo(Person({}));                          // All defaults
navigateTo(Person({ givenName: "Alice" }));      // Override one field
```

### Framework Caching

Patterns like `prompt-injection-tracker.tsx` demonstrate automatic caching:
- `generateObject` cached by prompt + schema + model
- `fetchData` cached by URL + method + body
