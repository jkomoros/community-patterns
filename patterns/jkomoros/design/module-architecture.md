# Module Architecture: Data-Up, Not App-Down

A design document for Common Fabric's composable module system

---

## Part 1: Foundation

### Philosophy: Data-Up vs App-Down

The traditional approach to personal software is **app-down**: you choose an app (Contacts, Calendar, Recipe Manager), and it dictates what data you can store and how you must structure it. The app is the center. Your data conforms to its schema.

Common Fabric inverts this: **data-up**. You have data—a person's name, a recipe you love, a thought you captured. Structure emerges organically as you accumulate context. You don't choose "Contact App" upfront. You start with a note about someone, and gradually that note gains a phone number, a birthday, relationships. The data is the center. Structure emerges from use.

This is the difference between:
- **App-down**: "I need a contact manager. Let me create a Contact record with these 20 empty fields."
- **Data-up**: "Here's a note about Sarah. Oh, I should add her email. And her birthday. Wait, she's Alice's sister—let me link them."

The structure **becomes** what it needs to be, shaped by the data itself.

### Connection to Common Fabric Vision

In "[Common Fabric: Personal Computing, Reclaimed](https://jkomoros.com/essays/common-fabric/)", patterns are described as **living units of software**—not static apps, but responsive organisms that evolve with your needs. The module architecture is how this vision manifests:

- **Patterns as organisms**: Each pattern is a container that can grow new capabilities
- **Composability as evolution**: Patterns don't have fixed schemas—they compose modules as needed
- **Resonance through emergence**: The right structure emerges from interaction, not prescription

A recipe pattern doesn't need a "dietary restrictions" module until you care about that. A person record doesn't need a "relationship" module until you want to track it. The software resonates with your actual needs, not anticipated ones.

### Record.tsx as Meta-Container

`record.tsx` is the **meta-container** where this philosophy lives. It's not a specific app—it's a framework for data to accumulate structure:

```typescript
// record.tsx is a container that hosts modules
interface RecordCharm {
  title: string;              // Human label
  modules: ModuleInstance[];  // Composable capabilities
  data: Map<string, any>;     // Module data storage
}

// A "person" is just a record with person-related modules
const sarah = {
  title: "Sarah Chen",
  modules: [
    { type: "identity", data: { name: "Sarah Chen" } },
    { type: "contact", data: { email: "sarah@example.com" } },
    { type: "birthday", data: { date: "1990-03-15" } },
    { type: "relationship", data: { relatedTo: "alice", type: "sister" } }
  ]
}

// A "recipe" is just a record with recipe-related modules
const paella = {
  title: "Paella",
  modules: [
    { type: "ingredients", data: { items: [...] } },
    { type: "steps", data: { instructions: [...] } },
    { type: "dietary", data: { glutenFree: true } }
  ]
}
```

The beauty: `record.tsx` doesn't know about "people" or "recipes". It just provides a container. The modules bring the semantics.

---

## Part 2: Module Taxonomy

Modules fall into five conceptual categories, each serving a different role in the organic growth of records.

### 1. DATA Modules (Simple Typed Fields)

**Purpose**: Capture simple, structured facts.

These are the atomic building blocks—typed fields with validation but no complex logic.

| Module | Schema | Purpose |
|--------|--------|---------|
| `identity` | `{ name: string, pronouns?: string }` | Core identity |
| `contact` | `{ email?: string, phone?: string }` | Contact methods |
| `address` | `{ street: string, city: string, ... }` | Physical location |
| `tags` | `{ tags: string[] }` | Freeform categorization |
| `birthday` | `{ date: string, remindDaysBefore?: number }` | Birth date and reminders |
| `rating` | `{ value: 1..5, notes?: string }` | Subjective quality |
| `url` | `{ url: string, label?: string }` | Web links |
| `social-links` | `{ github?: string, twitter?: string, ... }` | Social profiles |

**Example**: A person record might have `identity`, `contact`, `birthday`, and `social-links`. A restaurant might have `identity`, `address`, `rating`, and `url`.

### 2. CONTENT Modules (Rich Structured Content)

**Purpose**: Capture complex, multi-part content.

These modules hold structured content that's more than a single field—lists, nested objects, rich text.

| Module | Schema | Purpose |
|--------|--------|---------|
| `notes` | `{ content: string, format: "markdown" \| "text" }` | Freeform notes |
| `ingredients` | `{ items: Ingredient[], servings?: number }` | Recipe ingredients |
| `steps` | `{ steps: Step[], estimatedTime?: number }` | Sequential instructions |
| `timeline` | `{ events: TimelineEvent[] }` | Chronological events |
| `family-members` | `{ members: FamilyMember[] }` | Family relationships |
| `checklist` | `{ items: CheckItem[], completed?: number }` | Task lists |

**Example**: A recipe has `ingredients` and `steps`. A project has `timeline` and `checklist`. A family has `family-members`.

### 3. EXTRACTION Modules (LLM-Powered Derivation)

**Purpose**: Derive structured data from unstructured input.

These modules use LLMs to extract or transform data—turning prose into structure, analyzing content, enriching records.

| Module | Input | Output | Purpose |
|--------|-------|--------|---------|
| `recipe-analyzer` | Raw recipe text | Ingredients, steps, timing | Parse recipes from web/notes |
| `dietary-analyzer` | Ingredients list | Dietary flags | Detect allergens, restrictions |
| `item-categorizer` | Item list | Categories | Auto-categorize items |
| `entity-extractor` | Freeform text | Entity references | Find people, places, things |
| `sentiment-analyzer` | Text content | Sentiment score | Gauge emotional tone |

**Example**: You paste a recipe from a website. The `recipe-analyzer` module extracts structured ingredients and steps. The `dietary-analyzer` then flags it as "gluten-free, dairy-free".

### 4. SOURCE Modules (External Data Connectors)

**Purpose**: Bring external data INTO records.

These modules connect to external APIs and services, making outside data available within the fabric.

| Module | External Source | Data Provided | Methods |
|--------|----------------|---------------|---------|
| `gmail-source` | Gmail API | Emails matching query | `searchEmails(query)`, `getThread(id)` |
| `calendar-source` | Google Calendar | Events in date range | `eventsInRange(start, end)` |
| `github-source` | GitHub API | Repo activity, PRs | `getActivity()`, `getPRs()` |
| `weather-source` | Weather API | Current/forecast data | `getCurrentWeather()` |
| `location-source` | Device GPS | Current location | `getCurrentLocation()` |

**Authentication**: Source modules use the discovery pattern:

```typescript
// Source modules discover auth via wishes
const auth = await wish("#googleAuth");
const gmail = new GmailSource(auth);
const emails = await gmail.searchEmails("from:sarah@example.com");
```

**Example**: A person record with `gmail-source` can show recent emails with that person. A place record with `weather-source` shows current weather there.

### 5. ORCHESTRATOR Modules (Composition and Coordination)

**Purpose**: Coordinate multiple modules to create higher-level patterns.

Orchestrators don't hold data themselves—they compose other modules into coherent wholes.

| Module | Composes | Purpose |
|--------|----------|---------|
| `person-record` | identity, contact, birthday, relationship, notes | Standard person structure |
| `meal-coordinator` | Multiple recipes, dietary constraints | Plan meals for groups |
| `project-manager` | timeline, checklist, notes | Project structure |
| `event-planner` | calendar-source, location, people | Event organization |

**Example**: The `meal-coordinator` orchestrator:
1. Takes a list of recipe records
2. Aggregates dietary constraints from person records
3. Filters recipes by constraints
4. Generates shopping list from ingredients
5. Coordinates timing across multiple recipes

```typescript
interface MealCoordinatorModule {
  moduleType: "meal-coordinator";

  // Composed modules
  recipes: RecordReference[];
  diners: RecordReference[];

  // Methods
  getSuggestedRecipes(): Recipe[];
  generateShoppingList(): ShoppingList;
  getTimingPlan(): TimingPlan;
}
```

---

## Part 3: Module Contract

Every module, regardless of type, adheres to a common contract. This is what makes them composable.

### Core Module Interface

```typescript
interface Module {
  // ===== IDENTITY =====
  // What is this module?
  moduleType: string;           // e.g., "contact", "ingredients", "gmail-source"
  moduleLabel: string;          // Human-readable: "Contact Info"
  moduleIcon: string;           // Emoji or icon: "📧"
  moduleCategory: "data" | "content" | "extraction" | "source" | "orchestrator";

  // ===== SCHEMA =====
  // What data does this module hold?
  dataSchema: z.ZodType;        // Zod schema for data validation
  extractionSchema?: z.ZodType; // Schema for extraction modules
  defaults: Partial<z.infer<typeof dataSchema>>; // Default values

  // ===== UI RENDERING =====
  // How does this module appear?
  renderCompact(): VNode;       // Inline/summary view (1 line)
  renderFull(): VNode;          // Full detail view (expanded)
  renderEdit(): VNode;          // Edit mode with form controls

  // ===== LIFECYCLE HOOKS =====
  // How does this module integrate with record?
  attach?(record: RecordCharm): void;      // Called when module added
  detach?(record: RecordCharm): void;      // Called when module removed
  onDataChange?(newData: any, oldData: any): void; // Called when data updates

  // ===== CROSS-MODULE AWARENESS =====
  // What other modules does this interact with?
  dependencies?: string[];      // Required modules: ["identity"]
  suggestions?: ModuleSuggestion[]; // Suggest adding related modules

  // ===== VALIDATION =====
  // Is the data valid?
  validate?(data: any): ValidationResult;
}

interface ModuleSuggestion {
  moduleType: string;
  reason: string;
  confidence: number; // 0-1
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}
```

### Example: Contact Module

```typescript
const contactModule: Module = {
  // Identity
  moduleType: "contact",
  moduleLabel: "Contact Info",
  moduleIcon: "📧",
  moduleCategory: "data",

  // Schema
  dataSchema: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    preferredMethod: z.enum(["email", "phone"]).optional()
  }),
  defaults: {},

  // UI
  renderCompact() {
    return html`
      <span class="contact-compact">
        ${this.data.email && html`<a href="mailto:${this.data.email}">${this.data.email}</a>`}
        ${this.data.phone && html`<span>${this.data.phone}</span>`}
      </span>
    `;
  },

  renderFull() {
    return html`
      <div class="contact-full">
        ${this.data.email && html`
          <div class="field">
            <label>Email</label>
            <a href="mailto:${this.data.email}">${this.data.email}</a>
          </div>
        `}
        ${this.data.phone && html`
          <div class="field">
            <label>Phone</label>
            <span>${this.data.phone}</span>
          </div>
        `}
      </div>
    `;
  },

  renderEdit() {
    return html`
      <div class="contact-edit">
        <input
          type="email"
          placeholder="Email"
          value=${this.data.email || ""}
          onChange=${(e) => this.updateData({ email: e.target.value })}
        />
        <input
          type="tel"
          placeholder="Phone"
          value=${this.data.phone || ""}
          onChange=${(e) => this.updateData({ phone: e.target.value })}
        />
      </div>
    `;
  },

  // Lifecycle
  attach(record) {
    // Suggest adding identity if not present
    if (!record.hasModule("identity")) {
      this.suggestions = [{
        moduleType: "identity",
        reason: "Contact info usually needs a name",
        confidence: 0.9
      }];
    }
  },

  // Validation
  validate(data) {
    if (!data.email && !data.phone) {
      return {
        valid: false,
        errors: ["At least one contact method required"]
      };
    }
    return { valid: true };
  }
};
```

### Module Data Flow

```
User Interaction
       ↓
  renderEdit() → User changes data
       ↓
  updateData() → Validates via schema
       ↓
  onDataChange() → Module reacts to change
       ↓
  Record updates → Other modules notified
       ↓
  renderFull() → UI reflects new state
```

---

## Part 4: Core Modules (Extracted from Existing Patterns)

We can decompose existing monolithic patterns into composable modules. This shows how the architecture works in practice.

### Person Pattern Decomposition

**Current**: `person.tsx` is a monolithic pattern with hardcoded fields.

**Future**: `person.tsx` becomes a record with composable modules.

| Current Field | Becomes Module | Module Type | Schema |
|---------------|----------------|-------------|--------|
| `name` | `identity` | DATA | `{ name: string, pronouns?: string }` |
| `email`, `phone` | `contact` | DATA | `{ email?: string, phone?: string }` |
| `github`, `twitter` | `social-links` | DATA | `{ github?: string, twitter?: string, ... }` |
| `relationship` | `relationship` | DATA | `{ relatedTo: RecordRef, type: string }` |
| `notes` | `notes` | CONTENT | `{ content: string, format: "markdown" }` |
| `birthday` | `birthday` | DATA | `{ date: string, remindDaysBefore: number }` |

**Migration**:

```typescript
// BEFORE: Monolithic person.tsx
const sarah = createPerson({
  name: "Sarah Chen",
  email: "sarah@example.com",
  birthday: "1990-03-15",
  notes: "Alice's sister. Works at Google."
});

// AFTER: Modular record
const sarah = createRecord({
  title: "Sarah Chen",
  modules: [
    { type: "identity", data: { name: "Sarah Chen" } },
    { type: "contact", data: { email: "sarah@example.com" } },
    { type: "birthday", data: { date: "1990-03-15" } },
    { type: "relationship", data: { relatedTo: "alice", type: "sister" } },
    { type: "notes", data: { content: "Works at Google.", format: "markdown" } }
  ]
});

// User can add modules later:
sarah.addModule({ type: "social-links", data: { github: "schen" } });
```

### Recipe Pattern Decomposition

**Current**: `food-recipe.tsx` is a monolithic pattern.

**Future**: Recipe is a record with modules.

| Current Field | Becomes Module | Module Type | Schema |
|---------------|----------------|-------------|--------|
| `title` | Record title | — | (built-in) |
| `ingredients` | `ingredients` | CONTENT | `{ items: Ingredient[], servings: number }` |
| `steps` | `steps` | CONTENT | `{ steps: Step[], estimatedTime: number }` |
| `prepTime`, `cookTime` | `timing` | DATA | `{ prep: number, cook: number, total: number }` |
| `ovenTemp`, `ovenMode` | `oven` | DATA | `{ temp: number, mode: string }` |
| `isVegetarian`, `isGlutenFree` | `dietary` | DATA | `{ vegetarian: bool, glutenFree: bool, ... }` |
| `notes` | `notes` | CONTENT | `{ content: string }` |
| `source` | `source-url` | DATA | `{ url: string, author?: string }` |

**With extraction**:

```typescript
// User pastes recipe text
const paellaText = `
Paella Recipe
Ingredients: 2 cups rice, 1 lb chicken, saffron...
Instructions: 1. Heat oil... 2. Add chicken...
`;

// Recipe-analyzer extraction module converts text → structure
const paella = await createRecordFromText(paellaText, {
  extractors: ["recipe-analyzer", "dietary-analyzer"]
});

// Result: Record with extracted modules
paella.modules:
  - ingredients: { items: [...], servings: 4 }
  - steps: { steps: [...], estimatedTime: 45 }
  - timing: { prep: 15, cook: 30, total: 45 }
  - dietary: { glutenFree: true, dairyFree: false }
  - notes: { content: "Original recipe from..." }
```

### Family Pattern Decomposition

**Current**: `family.tsx` is monolithic.

**Future**: Family is a record with modules.

| Current Field | Becomes Module | Module Type | Schema |
|---------------|----------------|-------------|--------|
| `familyName` | Record title | — | (built-in) |
| `address` | `address` | DATA | `{ street: string, city: string, ... }` |
| `members` | `family-members` | CONTENT | `{ members: FamilyMember[] }` |
| `dietaryNeeds` | `dietary-aggregate` | ORCHESTRATOR | Pulls from member records |

**Cross-record orchestration**:

```typescript
// Family record with family-members module
const chenFamily = createRecord({
  title: "Chen Family",
  modules: [
    {
      type: "family-members",
      data: {
        members: [
          { personRef: "sarah", role: "parent" },
          { personRef: "mike", role: "parent" },
          { personRef: "emma", role: "child" }
        ]
      }
    },
    { type: "address", data: { street: "123 Main St", city: "SF" } }
  ]
});

// Dietary-aggregate orchestrator pulls from person records
const dietary = chenFamily.getModule("dietary-aggregate");
dietary.getAggregatedNeeds();
// → { glutenFree: true (from Emma), dairyFree: false, vegetarian: false }
```

---

## Part 5: Source Modules (External Data)

Source modules bring the **outside world** into the fabric. They're bidirectional bridges—data flows in, actions flow out.

### Design Principles

1. **Lazy Loading**: Don't fetch until needed
2. **Caching**: Cache responses with TTL
3. **Authentication Discovery**: Use `wish()` pattern to find auth
4. **Rate Limiting**: Respect API limits
5. **Offline Resilience**: Degrade gracefully when offline

### Gmail Source Module

```typescript
interface GmailSourceModule extends Module {
  moduleType: "gmail-source";
  moduleCategory: "source";

  // Configuration
  config: {
    query?: string;        // Gmail search query
    maxResults?: number;   // Limit results
    autoSync?: boolean;    // Auto-refresh
    syncInterval?: number; // Minutes between syncs
  };

  // State
  state: {
    emails: Email[];
    lastSync: Date;
    syncStatus: "idle" | "syncing" | "error";
  };

  // Methods
  searchEmails(query: string): Promise<Email[]>;
  getThread(threadId: string): Promise<EmailThread>;
  sync(): Promise<void>;
}

// Usage in a person record
const sarah = createRecord({
  title: "Sarah Chen",
  modules: [
    { type: "identity", data: { name: "Sarah Chen" } },
    { type: "contact", data: { email: "sarah@example.com" } },
    {
      type: "gmail-source",
      config: {
        query: "from:sarah@example.com OR to:sarah@example.com",
        maxResults: 50,
        autoSync: true,
        syncInterval: 60
      }
    }
  ]
});

// Now the record shows recent emails with Sarah
const recentEmails = sarah.getModule("gmail-source").state.emails;
```

### Calendar Source Module

```typescript
interface CalendarSourceModule extends Module {
  moduleType: "calendar-source";

  config: {
    calendarId?: string;   // Specific calendar or "primary"
    daysAhead?: number;    // How far to look ahead
    daysBack?: number;     // How far to look back
  };

  state: {
    events: CalendarEvent[];
    lastSync: Date;
  };

  // Methods
  eventsInRange(start: Date, end: Date): Promise<CalendarEvent[]>;
  getUpcomingEvents(): Promise<CalendarEvent[]>;
  createEvent(event: CalendarEvent): Promise<void>;
}

// Usage in a place record (conference venue)
const venue = createRecord({
  title: "Moscone Center",
  modules: [
    { type: "address", data: { street: "747 Howard St", city: "SF" } },
    {
      type: "calendar-source",
      config: {
        query: "location:Moscone Center",
        daysAhead: 90
      }
    }
  ]
});

// Shows upcoming events at this venue
const upcomingEvents = venue.getModule("calendar-source").getUpcomingEvents();
```

### GitHub Source Module

```typescript
interface GitHubSourceModule extends Module {
  moduleType: "github-source";

  config: {
    username?: string;
    repo?: string;         // "owner/repo" format
    includeActivity?: boolean;
  };

  state: {
    repos: Repository[];
    pullRequests: PullRequest[];
    activity: ActivityEvent[];
    lastSync: Date;
  };

  // Methods
  getRepositories(): Promise<Repository[]>;
  getPullRequests(): Promise<PullRequest[]>;
  getActivity(): Promise<ActivityEvent[]>;
}

// Usage in a project record
const project = createRecord({
  title: "Common Fabric",
  modules: [
    { type: "url", data: { url: "https://github.com/jkomoros/labs" } },
    {
      type: "github-source",
      config: {
        repo: "jkomoros/labs",
        includeActivity: true
      }
    },
    { type: "notes", data: { content: "Next-gen personal computing" } }
  ]
});

// Live data from GitHub
const prs = project.getModule("github-source").state.pullRequests;
const activity = project.getModule("github-source").state.activity;
```

### Authentication via Discovery

Source modules don't hardcode auth—they discover it via the `wish()` pattern:

```typescript
// Source module discovers Google auth
async attach(record: RecordCharm) {
  // Request auth with required scopes
  const auth = await wish("#googleAuth", {
    scopes: ["gmail.readonly", "calendar.readonly"]
  });

  if (!auth) {
    this.state.syncStatus = "error";
    this.state.error = "Authentication required";
    return;
  }

  this.auth = auth;
  await this.sync();
}

// The pattern framework provides auth via GoogleAuth component
// User grants permission once, all source modules use it
```

---

## Part 6: Meta-Modules (Fabric Intelligence)

Meta-modules don't belong to individual records—they operate **across** the fabric, providing intelligence and coordination.

### 1. Schema Suggester

**Purpose**: Auto-detect what modules a record should have based on its content.

```typescript
interface SchemaSuggesterModule {
  // Analyze record content and suggest modules
  suggestModules(record: RecordCharm): ModuleSuggestion[];
}

// Usage
const note = createRecord({
  title: "Sarah Chen",
  modules: [
    {
      type: "notes",
      data: {
        content: "Met Sarah at the conference. Email: sarah@example.com. Birthday is March 15."
      }
    }
  ]
});

const suggestions = schemaSuggester.suggestModules(note);
// → [
//     { moduleType: "identity", reason: "Name detected in title", confidence: 0.95 },
//     { moduleType: "contact", reason: "Email found in notes", confidence: 0.9 },
//     { moduleType: "birthday", reason: "Date pattern matches birthday", confidence: 0.7 }
//   ]

// UI shows: "Add Contact Info module? (email detected)" [Add] [Dismiss]
```

**Implementation**: Uses LLM to analyze content:

```typescript
async suggestModules(record: RecordCharm): Promise<ModuleSuggestion[]> {
  const content = record.getAllText(); // Aggregate all text content

  const result = await generateObject({
    model: "claude-sonnet-4",
    prompt: `Analyze this content and suggest data modules that would structure it:

    Title: ${record.title}
    Content: ${content}

    Available modules: ${AVAILABLE_MODULES.map(m => m.moduleType).join(", ")}

    What modules would help structure this data?`,
    schema: z.object({
      suggestions: z.array(z.object({
        moduleType: z.string(),
        reason: z.string(),
        confidence: z.number(),
        extractedData: z.any().optional()
      }))
    })
  });

  return result.suggestions;
}
```

### 2. Entity Linker

**Purpose**: Connect text mentions to existing records.

```typescript
interface EntityLinkerModule {
  // Find entity references in text
  findEntities(text: string): EntityReference[];

  // Link entity to record
  linkEntity(entity: EntityReference, record: RecordCharm): void;
}

// Usage
const email = `
  Had lunch with Sarah and Mike yesterday.
  Sarah mentioned she's working on the new design for Project Phoenix.
`;

const entities = entityLinker.findEntities(email);
// → [
//     { text: "Sarah", type: "person", recordRef: "sarah-chen", confidence: 0.9 },
//     { text: "Mike", type: "person", recordRef: "mike-jones", confidence: 0.85 },
//     { text: "Project Phoenix", type: "project", recordRef: "phoenix", confidence: 0.8 }
//   ]

// UI renders text with entity links:
// "Had lunch with [Sarah](→sarah-chen) and [Mike](→mike-jones) yesterday.
//  Sarah mentioned she's working on the new design for [Project Phoenix](→phoenix)."
```

**Graph building**: Entity linking creates the relationship graph automatically.

### 3. Extraction Coordinator

**Purpose**: Coordinate LLM extraction across multiple modules efficiently.

Instead of each extraction module calling the LLM separately, the coordinator batches requests:

```typescript
interface ExtractionCoordinatorModule {
  // Run multiple extractions in one LLM call
  coordinateExtraction(
    text: string,
    extractors: string[]
  ): Promise<Map<string, any>>;
}

// Usage
const recipeText = "Paella recipe: 2 cups rice, 1 lb chicken...";

// Without coordinator: 3 separate LLM calls
const ingredients = await extractIngredients(recipeText); // LLM call 1
const steps = await extractSteps(recipeText);             // LLM call 2
const dietary = await extractDietary(recipeText);         // LLM call 3

// With coordinator: 1 LLM call
const extracted = await extractionCoordinator.coordinateExtraction(recipeText, [
  "ingredients",
  "steps",
  "dietary"
]);
// → {
//     ingredients: { items: [...], servings: 4 },
//     steps: { steps: [...] },
//     dietary: { glutenFree: true, vegetarian: false }
//   }
```

**Implementation**: Single prompt with structured output:

```typescript
async coordinateExtraction(text: string, extractors: string[]) {
  // Build combined schema from all extractors
  const combinedSchema = z.object(
    Object.fromEntries(
      extractors.map(e => [e, EXTRACTOR_SCHEMAS[e]])
    )
  );

  const result = await generateObject({
    model: "claude-sonnet-4",
    prompt: `Extract structured data from this text:

    ${text}

    Extract: ${extractors.join(", ")}`,
    schema: combinedSchema
  });

  return result;
}
```

### 4. Module Registry

**Purpose**: Track available module types for the [+] module picker.

```typescript
interface ModuleRegistryModule {
  // Get all available modules
  getAvailableModules(): ModuleDescriptor[];

  // Get modules relevant to current record
  getRelevantModules(record: RecordCharm): ModuleDescriptor[];

  // Search modules
  searchModules(query: string): ModuleDescriptor[];
}

// Usage in UI
function ModulePicker({ record }: { record: RecordCharm }) {
  const [query, setQuery] = useState("");
  const modules = query
    ? moduleRegistry.searchModules(query)
    : moduleRegistry.getRelevantModules(record);

  return html`
    <div class="module-picker">
      <input
        type="search"
        placeholder="Add module..."
        value=${query}
        onChange=${e => setQuery(e.target.value)}
      />
      <div class="module-list">
        ${modules.map(m => html`
          <button onClick=${() => record.addModule(m)}>
            ${m.moduleIcon} ${m.moduleLabel}
          </button>
        `)}
      </div>
    </div>
  `;
}
```

---

## Part 7: Aggregation Views

Records with modules enable **cross-charm aggregate views**—perspectives that span your entire fabric.

### Birthday Calendar

**View**: All birthdays across all records with `birthday` modules.

```typescript
// Aggregate query
const birthdays = fabric.query({
  hasModule: "birthday",
  sortBy: (a, b) => {
    const dateA = a.getModule("birthday").data.date;
    const dateB = b.getModule("birthday").data.date;
    return nextOccurrence(dateA) - nextOccurrence(dateB);
  }
});

// Render calendar view
function BirthdayCalendar() {
  const upcoming = birthdays.filter(b =>
    nextOccurrence(b.birthday) < daysFromNow(90)
  );

  return html`
    <div class="birthday-calendar">
      <h2>Upcoming Birthdays</h2>
      ${upcoming.map(record => {
        const birthday = record.getModule("birthday");
        const identity = record.getModule("identity");

        return html`
          <div class="birthday-item">
            <span class="date">${formatDate(birthday.data.date)}</span>
            <a href=${record.url}>${identity?.data.name || record.title}</a>
            <span class="age">(turning ${calculateAge(birthday.data.date)})</span>
          </div>
        `;
      })}
    </div>
  `;
}
```

### Relationship Graph

**View**: Visual network of all relationship modules.

```
      Alice ──sister── Sarah
        │                │
     works with      married to
        │                │
      Bob ──────────── Mike
                         │
                    colleague of
                         │
                       David
```

```typescript
// Build graph from relationship modules
const graph = fabric.buildGraph({
  nodes: fabric.query({ hasModule: "identity" }),
  edges: fabric.query({ hasModule: "relationship" }).flatMap(record =>
    record.getModule("relationship").data.relationships.map(rel => ({
      from: record.id,
      to: rel.relatedTo,
      label: rel.type
    }))
  )
});

// Render with force-directed layout
function RelationshipGraph() {
  return html`
    <svg class="relationship-graph">
      ${graph.nodes.map(node => html`
        <circle cx=${node.x} cy=${node.y} r="30" />
        <text x=${node.x} y=${node.y}>${node.record.title}</text>
      `)}
      ${graph.edges.map(edge => html`
        <line x1=${edge.from.x} y1=${edge.from.y} x2=${edge.to.x} y2=${edge.to.y} />
        <text class="edge-label">${edge.label}</text>
      `)}
    </svg>
  `;
}
```

### Dietary Aggregate

**View**: Combined dietary requirements from multiple people.

Use case: Planning a dinner party.

```typescript
// Select people attending dinner
const attendees = [sarah, mike, emma, david];

// Aggregate dietary modules
const dietaryAggregate = fabric.aggregate(attendees, {
  module: "dietary",
  combine: (constraints) => ({
    vegetarian: constraints.some(c => c.vegetarian),
    vegan: constraints.some(c => c.vegan),
    glutenFree: constraints.some(c => c.glutenFree),
    dairyFree: constraints.some(c => c.dairyFree),
    allergens: [...new Set(constraints.flatMap(c => c.allergens || []))]
  })
});

// Result: { glutenFree: true, allergens: ["peanuts", "shellfish"] }

// Filter recipes by aggregate constraints
const suitableRecipes = fabric.query({
  hasModule: "dietary",
  where: recipe => {
    const dietary = recipe.getModule("dietary").data;
    return dietary.glutenFree === true
      && !dietary.allergens.some(a => dietaryAggregate.allergens.includes(a));
  }
});
```

### Shopping Aggregator

**View**: Combined shopping list from multiple recipe records.

```typescript
// Select recipes for the week
const weekRecipes = [paella, roastChicken, stirFry];

// Aggregate ingredients
const shoppingList = fabric.aggregate(weekRecipes, {
  module: "ingredients",
  combine: (ingredientLists) => {
    const combined = new Map();

    for (const list of ingredientLists) {
      for (const item of list.items) {
        const key = `${item.name}-${item.unit}`;
        const existing = combined.get(key);

        if (existing) {
          existing.quantity += item.quantity;
        } else {
          combined.set(key, { ...item });
        }
      }
    }

    return Array.from(combined.values());
  }
});

// Result: [
//   { name: "chicken", quantity: 3, unit: "lbs" },
//   { name: "rice", quantity: 4, unit: "cups" },
//   ...
// ]
```

**Categorization**: Use `item-categorizer` extraction module to group by store section:

```typescript
const categorized = await itemCategorizer.categorize(shoppingList);
// → {
//     produce: ["onions", "garlic", "peppers"],
//     meat: ["chicken", "chorizo"],
//     pantry: ["rice", "olive oil"],
//     dairy: ["butter"]
//   }
```

---

## Part 8: Living Structure

This is where the vision gets radical: **records don't have types**. They **become** types through accumulated modules.

### The Traditional Way (App-Down)

Traditional software forces you to choose upfront:

```
User: "I want to save this info about Sarah."
App: "Is this a CONTACT or a NOTE?"
User: "Uh... both? She's a person, but I also have notes..."
App: "Choose one. I'll give you contact fields OR a note field."
```

You're forced into a box before you know what shape your data wants to be.

### The Fabric Way (Data-Up)

Common Fabric lets structure emerge:

```
User: "I met someone interesting. Her name is Sarah Chen."
Fabric: *creates record with title "Sarah Chen"*

User: "Oh, I should save her email: sarah@example.com"
Fabric: *suggests contact module* "Add contact info?"
User: "Yes."
Fabric: *adds contact module*

User: "Her birthday is March 15."
Fabric: *suggests birthday module* "Add birthday tracking?"
User: "Sure."
Fabric: *adds birthday module, offers calendar reminder*

User: "She's Alice's sister."
Fabric: *suggests relationship module* "Link to Alice?"
User: "Yes."
Fabric: *adds relationship module, updates relationship graph*
```

At no point did you declare "this is a Person record". It **became** a person record by accumulating person-related modules.

### Speculative Patterns

Here's where it gets wild: patterns can **test their own usefulness** without user involvement.

```typescript
// A pattern can speculatively try enrichment
async function speculativeEnrich(record: RecordCharm) {
  // If record has contact module with email...
  const contact = record.getModule("contact");
  if (!contact?.data.email) return;

  // Try to find social profiles
  const socialData = await findSocialProfiles(contact.data.email);

  if (socialData.confidence > 0.7) {
    // Don't add module automatically—suggest it
    record.suggestModule({
      type: "social-links",
      data: socialData.profiles,
      reason: `Found ${socialData.profiles.length} social profiles`,
      preview: true  // Show preview without committing
    });
  }
}
```

The pattern **tries things**, shows you what it found, and you decide if it's useful.

### Auto-Suggestion Examples

**Birthday Detection**:
```typescript
// User types in notes: "Her birthday is March 15"
notesModule.onDataChange((newContent) => {
  const dates = extractDates(newContent);
  const birthdayPatterns = dates.filter(d =>
    d.context.includes("birthday") || d.context.includes("born")
  );

  if (birthdayPatterns.length > 0) {
    record.suggestModule({
      type: "birthday",
      data: { date: birthdayPatterns[0].date },
      reason: "Birthday date detected in notes",
      confidence: 0.8
    });
  }
});

// UI shows: "Add Birthday module? (March 15 detected)" [Add] [Dismiss]
```

**Entity Linking**:
```typescript
// User types: "Had coffee with Alice yesterday"
const entities = await entityLinker.findEntities("Had coffee with Alice yesterday");
// → [{ text: "Alice", recordRef: "alice-smith", type: "person", confidence: 0.9 }]

// UI renders: "Had coffee with [Alice](→alice-smith) yesterday"
// Hovering shows Alice's record preview
// Clicking navigates to Alice's record
```

**Recipe Detection**:
```typescript
// User pastes URL: "https://cooking.nytimes.com/recipes/12345-paella"
urlModule.onDataChange(async (newUrl) => {
  if (isRecipeUrl(newUrl)) {
    const recipeData = await scrapeRecipe(newUrl);

    record.suggestModules([
      { type: "ingredients", data: recipeData.ingredients },
      { type: "steps", data: recipeData.steps },
      { type: "timing", data: recipeData.timing }
    ], {
      reason: "Recipe detected from URL",
      autoApply: false  // Let user review first
    });
  }
});
```

### Organic Growth: Records "Become" Types

A record's "type" is **emergent**, not declared:

```typescript
// Start: Just a title and notes
const record = createRecord({
  title: "Sarah Chen",
  modules: [
    { type: "notes", data: { content: "Met at conference" } }
  ]
});

record.inferredType(); // → "note"

// Add contact info
record.addModule({ type: "contact", data: { email: "sarah@example.com" } });
record.inferredType(); // → "contact"

// Add birthday
record.addModule({ type: "birthday", data: { date: "1990-03-15" } });
record.inferredType(); // → "person"

// Add relationship
record.addModule({ type: "relationship", data: { relatedTo: "alice", type: "sister" } });
record.inferredType(); // → "person" (stronger signal)

// The record IS what its modules make it
```

**Type inference logic**:

```typescript
function inferredType(record: RecordCharm): string {
  const modules = record.modules.map(m => m.moduleType);

  // Match against known patterns
  if (modules.includes("ingredients") && modules.includes("steps")) {
    return "recipe";
  }

  if (modules.includes("identity") && modules.includes("contact")) {
    return "person";
  }

  if (modules.includes("family-members")) {
    return "family";
  }

  if (modules.includes("address") && !modules.includes("family-members")) {
    return "place";
  }

  if (modules.length === 1 && modules[0] === "notes") {
    return "note";
  }

  return "record"; // Generic
}
```

UI shows inferred type as icon:

```
👤 Sarah Chen        (person)
📝 Meeting notes     (note)
🍳 Paella           (recipe)
🏠 Chen Family      (family)
```

### Temporal Intelligence

Modules can have **freshness** and **decay** properties:

```typescript
interface TemporalModule extends Module {
  temporal: {
    freshness: number;      // 0-1, how "fresh" is this data?
    decayRate: number;      // How fast does it decay?
    lastUpdated: Date;
    expiresAt?: Date;       // Hard expiration
  };

  calculateFreshness(): number;
  needsRefresh(): boolean;
}

// Gmail source module decays over time
gmailSource.temporal = {
  freshness: 1.0,
  decayRate: 0.1,  // 10% per day
  lastUpdated: new Date("2025-12-19"),
  expiresAt: undefined
};

// After 5 days
gmailSource.calculateFreshness(); // → 0.5
gmailSource.needsRefresh(); // → true

// UI shows staleness: "Email data from 5 days ago [Refresh]"
```

**Access patterns** influence priority:

```typescript
// Track module access
record.getModule("contact"); // Increment access count

// Modules you use frequently stay fresh longer
const accessWeight = module.stats.accessCount / record.stats.totalAccess;
const adjustedFreshness = module.temporal.freshness * (1 + accessWeight);

// Rarely-used modules decay faster, frequently-used stay fresh
```

This creates a **living fabric** where active data stays vibrant and stale data fades—until you need it again.

---

## Part 9: Implementation Roadmap

This vision requires **phased implementation**. Start small, prove the pattern, expand.

### Phase 0: Prove the Pattern (notes-module extraction)

**Goal**: Extract notes from existing patterns into a reusable module. Prove the contract works.

**Tasks**:
1. Define base `Module` interface
2. Create `notes` module following the contract
3. Update `record.tsx` to host modules
4. Extract notes from `person.tsx` into notes module
5. Test that it works identically

**Success criteria**: `person.tsx` uses `notes` module, behavior unchanged.

**Timeline**: 1 week

### Phase 1: Core Data Modules

**Goal**: Create foundational DATA modules.

**Modules to create**:
- `identity` (name, pronouns)
- `contact` (email, phone)
- `address` (street, city, state, zip)
- `tags` (freeform tags)
- `birthday` (date, reminders)
- `rating` (1-5 stars, notes)
- `url` (links with labels)
- `social-links` (github, twitter, linkedin)

**Success criteria**: Can compose these to recreate `person.tsx` functionality.

**Timeline**: 2 weeks

### Phase 2: Person Pattern Decomposition

**Goal**: Migrate `person.tsx` to modular architecture.

**Tasks**:
1. Create `relationship` module
2. Create migration path: old person → new person
3. Update person UI to render modules
4. Add module picker UI: [+ Add Module]
5. Test with real person records

**Success criteria**: Person pattern fully modular, can add/remove modules.

**Timeline**: 2 weeks

### Phase 3: Recipe Pattern Decomposition

**Goal**: Migrate `food-recipe.tsx` to modules.

**Modules to create**:
- `ingredients` (items, servings)
- `steps` (instructions, timing)
- `timing` (prep, cook, total)
- `oven` (temp, mode)
- `dietary` (flags: vegetarian, gluten-free, etc.)

**Tasks**:
1. Create CONTENT modules (ingredients, steps)
2. Create DATA modules (timing, oven, dietary)
3. Migrate recipe pattern
4. Add module picker for recipes

**Success criteria**: Recipe pattern fully modular.

**Timeline**: 2 weeks

### Phase 4: Extraction Modules

**Goal**: Add LLM-powered extraction.

**Modules to create**:
- `recipe-analyzer` (text → ingredients + steps)
- `dietary-analyzer` (ingredients → dietary flags)
- `entity-extractor` (text → entity references)

**Tasks**:
1. Create extraction coordinator (batch LLM calls)
2. Implement recipe-analyzer
3. Implement dietary-analyzer
4. Test: paste recipe URL → auto-extract modules

**Success criteria**: Paste recipe, get structured modules automatically.

**Timeline**: 3 weeks

### Phase 5: Source Modules

**Goal**: Connect external data sources.

**Modules to create**:
- `gmail-source`
- `calendar-source`
- `github-source`

**Tasks**:
1. Define source module contract
2. Implement auth discovery pattern
3. Create gmail-source module
4. Test: add gmail-source to person → see emails
5. Create calendar-source
6. Create github-source

**Success criteria**: Person record shows recent emails, project record shows GitHub activity.

**Timeline**: 4 weeks

### Phase 6: Meta-Modules and Intelligence

**Goal**: Add fabric-wide intelligence.

**Meta-modules to create**:
- Schema suggester (auto-suggest modules)
- Entity linker (link text → records)
- Module registry (searchable module catalog)

**Tasks**:
1. Implement schema suggester with LLM
2. Test auto-suggestions: "Add contact module? (email detected)"
3. Implement entity linker
4. Test entity linking in notes
5. Create module registry and picker

**Success criteria**: System suggests relevant modules, links entities automatically.

**Timeline**: 4 weeks

### Phase 7: Aggregation Views

**Goal**: Cross-record views.

**Views to create**:
- Birthday calendar
- Relationship graph
- Dietary aggregate
- Shopping list aggregator

**Success criteria**: Can view data across entire fabric in useful ways.

**Timeline**: 3 weeks

---

## Total Timeline: ~5 months

| Phase | Duration | Milestone |
|-------|----------|-----------|
| 0: Prove pattern | 1 week | Notes module working |
| 1: Core data modules | 2 weeks | 8 data modules created |
| 2: Person decomposition | 2 weeks | Person pattern modular |
| 3: Recipe decomposition | 2 weeks | Recipe pattern modular |
| 4: Extraction | 3 weeks | Auto-extract recipes |
| 5: Source modules | 4 weeks | External data integrated |
| 6: Meta-modules | 4 weeks | Auto-suggestions working |
| 7: Aggregation | 3 weeks | Cross-fabric views |

---

## Conclusion: The Living Fabric

This architecture realizes the Common Fabric vision: **patterns as living units of software** that grow, adapt, and resonate with your needs.

Traditional software asks: "What app do you need?"

Common Fabric asks: "What data do you have?"

The modules **emerge** from the data. Structure follows substance. The fabric becomes what you need it to be, shaped by use, not prescription.

This is computing that resonates—software that feels alive because it grows with you.

---

**The future is data-up.**

Welcome to the fabric.
