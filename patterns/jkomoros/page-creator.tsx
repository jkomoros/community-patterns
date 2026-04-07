/// <cts-enable />
import { handler, NAME, navigateTo, pattern, UI } from "commonfabric";

// Demo data for extraction demos
import { DEMO_PERSON_NOTES, DEMO_RECIPE_NOTES } from "./demo-constants.ts";

// Import patterns directly - optional defaults make {} work for all fields
import Person from "./person.tsx";
import Counter from "../../../labs/packages/patterns/counter/counter.tsx";
import ShoppingListLauncher from "./shopping-list-launcher.tsx";
import { createStoreMapper } from "./store-mapper.tsx";
import MetaAnalyzer from "./meta-analyzer.tsx";
import FoodRecipe from "./food-recipe.tsx";
import PromptInjectionTracker from "./prompt-injection-tracker.tsx";
import SubstackSummarizer from "./substack-summarizer.tsx";
import CozyPoll from "./cozy-poll.tsx";
import RewardSpinner from "./reward-spinner.tsx";
import CheeseboardSchedule from "./cheeseboard-schedule.tsx";
import MealOrchestrator from "./meal-orchestrator.tsx";
import PreparedFood from "./prepared-food.tsx";
// HotelMembershipExtractor import temporarily removed: labs's
// hotel-membership-gmail-agent.tsx uses defineItemSchema() at module scope,
// which the new SES verifier rejects with
// "Top-level call results must be wrapped in __ct_data() in SES mode".
// Re-add once that labs pattern is patched upstream.
import GoogleCalendarImporter from "../../../labs/packages/patterns/google/core/google-calendar-importer.tsx";
import SmartRubric from "./smart-rubric.tsx";
import FavoritesViewer from "./favorites-viewer.tsx";
import StarChart from "./star-chart.tsx";
import StoryWeaver from "./story-weaver.tsx";
import CodenamesHelper from "./codenames-helper.tsx";

type Input = void;
type Output = {
  [NAME]: string;
  [UI]: unknown;
};

// Handlers call patterns directly with {} - optional defaults handle all fields
const handleCreatePerson = handler<void, void>(() => navigateTo(Person({})));
const handleCreatePersonDemo = handler<void, void>(() =>
  navigateTo(Person({ notes: DEMO_PERSON_NOTES }))
);
const handleCreateCounter = handler<void, void>(() => navigateTo(Counter({})));
const handleCreateShoppingList = handler<void, void>(() =>
  navigateTo(ShoppingListLauncher({}))
);
const handleCreateStoreMapper = handler<void, void>(() =>
  navigateTo(createStoreMapper({}))
);
const handleCreateFoodRecipe = handler<void, void>(() =>
  navigateTo(FoodRecipe({}))
);
const handleCreateFoodRecipeDemo = handler<void, void>(() =>
  navigateTo(FoodRecipe({ notes: DEMO_RECIPE_NOTES }))
);
const handleCreateMetaAnalyzer = handler<void, void>(() =>
  navigateTo(MetaAnalyzer({}))
);
const handleCreatePromptInjectionTracker = handler<void, void>(() =>
  navigateTo(PromptInjectionTracker({}))
);
const handleCreateSubstackSummarizer = handler<void, void>(() =>
  navigateTo(SubstackSummarizer({}))
);
const handleCreateCozyPoll = handler<void, void>(() =>
  navigateTo(CozyPoll({}))
);
const handleCreateRewardSpinner = handler<void, void>(() =>
  navigateTo(RewardSpinner({}))
);
const handleCreateCheeseboardSchedule = handler<void, void>(() =>
  navigateTo(CheeseboardSchedule({}))
);
const handleCreateMealOrchestrator = handler<void, void>(() =>
  navigateTo(MealOrchestrator({}))
);
const handleCreatePreparedFood = handler<void, void>(() =>
  navigateTo(PreparedFood({}))
);
// handleCreateHotelMembershipExtractor removed (see import block above).
const handleCreateGoogleCalendarImporter = handler<void, void>(() =>
  navigateTo(GoogleCalendarImporter({}))
);
const handleCreateSmartRubric = handler<void, void>(() =>
  navigateTo(SmartRubric({}))
);
const handleCreateFavoritesViewer = handler<void, void>(() =>
  navigateTo(FavoritesViewer({}))
);
const handleCreateStarChart = handler<void, void>(() =>
  navigateTo(StarChart({}))
);
const handleCreateStoryWeaver = handler<void, void>(() =>
  navigateTo(StoryWeaver({}))
);
const handleCreateCodenamesHelper = handler<void, void>(() =>
  navigateTo(CodenamesHelper({}))
);

export default pattern<Input, Output>(
  (_) => {
    return {
      [NAME]: "Page Creator",
      [UI]: (
        <cf-screen>
          <div slot="header">
            <h2 style="margin: 0; fontSize: 18px;">Create New Page</h2>
          </div>

          <cf-vscroll flex showScrollbar>
            <cf-vstack style="padding: 16px; gap: 12px;">
              <p style="margin: 0; fontSize: 13px; color: #666;">
                Select a page type to create:
              </p>

              <cf-vstack style="gap: 8px;">
                <div
                  style={{ display: "flex", gap: "4px", alignItems: "center" }}
                >
                  <cf-button onClick={handleCreatePerson()} size="lg">
                    👤 New Person
                  </cf-button>
                  <cf-button
                    onClick={handleCreatePersonDemo()}
                    variant="secondary"
                    size="sm"
                  >
                    Demo
                  </cf-button>
                </div>

                <cf-button onClick={handleCreateCounter()} size="lg">
                  🔢 New Counter
                </cf-button>

                <cf-button onClick={handleCreateShoppingList()} size="lg">
                  🛒 Shopping List
                </cf-button>

                <cf-button onClick={handleCreateStoreMapper()} size="lg">
                  🗺️ Store Mapper
                </cf-button>

                <div
                  style={{ display: "flex", gap: "4px", alignItems: "center" }}
                >
                  <cf-button onClick={handleCreateFoodRecipe()} size="lg">
                    🍳 New Recipe
                  </cf-button>
                  <cf-button
                    onClick={handleCreateFoodRecipeDemo()}
                    variant="secondary"
                    size="sm"
                  >
                    Demo
                  </cf-button>
                </div>

                <cf-button onClick={handleCreateMetaAnalyzer()} size="lg">
                  ⚡ Field Suggestions (Meta Analyzer)
                </cf-button>

                <cf-button
                  onClick={handleCreatePromptInjectionTracker()}
                  size="lg"
                >
                  🔒 Prompt Injection Tracker
                </cf-button>

                <cf-button onClick={handleCreateSubstackSummarizer()} size="lg">
                  📧 Substack Summarizer
                </cf-button>

                <cf-button onClick={handleCreateCozyPoll()} size="lg">
                  🗳️ Cozy Poll
                </cf-button>

                <cf-button onClick={handleCreateRewardSpinner()} size="lg">
                  🎰 Reward Spinner
                </cf-button>

                <cf-button
                  onClick={handleCreateCheeseboardSchedule()}
                  size="lg"
                >
                  🍕 Cheeseboard Schedule
                </cf-button>

                <cf-button onClick={handleCreateMealOrchestrator()} size="lg">
                  🍽️ Meal Orchestrator
                </cf-button>

                <cf-button onClick={handleCreatePreparedFood()} size="lg">
                  🛒 Prepared Food
                </cf-button>

                {
                  /* Hotel Membership Extractor button removed during commonfabric port —
                    see import block at top of file for details. */
                }

                <cf-button
                  onClick={handleCreateGoogleCalendarImporter()}
                  size="lg"
                >
                  📅 Google Calendar Importer
                </cf-button>

                <cf-button onClick={handleCreateSmartRubric()} size="lg">
                  📊 Smart Rubric
                </cf-button>

                <cf-button onClick={handleCreateFavoritesViewer()} size="lg">
                  ⭐ Favorites Viewer
                </cf-button>

                <cf-button onClick={handleCreateStarChart()} size="lg">
                  ⭐ Star Chart
                </cf-button>

                <cf-button onClick={handleCreateStoryWeaver()} size="lg">
                  🧵 Story Weaver
                </cf-button>

                <cf-button onClick={handleCreateCodenamesHelper()} size="lg">
                  🕵️ Codenames Helper
                </cf-button>
              </cf-vstack>
            </cf-vstack>
          </cf-vscroll>
        </cf-screen>
      ),
    };
  },
);
