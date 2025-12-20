/// <cts-enable />
import { handler, NAME, navigateTo, pattern, UI } from "commontools";

// Demo data for extraction demos
import { DEMO_PERSON_NOTES, DEMO_RECIPE_NOTES } from "./demo-constants.ts";

// Import patterns directly - optional defaults make {} work for all fields
import Person from "./person.tsx";
import Counter from "./lib/counter.tsx";
import ShoppingListLauncher from "./shopping-list-launcher.tsx";
import StoreMapper from "./store-mapper.tsx";
import MetaAnalyzer from "./meta-analyzer.tsx";
import FoodRecipe from "./food-recipe.tsx";
import PromptInjectionTracker from "./prompt-injection-tracker.tsx";
import SubstackSummarizer from "./substack-summarizer.tsx";
import CozyPoll from "./cozy-poll.tsx";
import RewardSpinner from "./reward-spinner.tsx";
import CheeseboardSchedule from "./cheeseboard-schedule.tsx";
import MealOrchestrator from "./meal-orchestrator.tsx";
import PreparedFood from "./prepared-food.tsx";
import HotelMembershipExtractor from "./hotel-membership-gmail-agent.tsx";
import GoogleCalendarImporter from "./google-calendar-importer.tsx";
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
const handleCreatePersonDemo = handler<void, void>(() => navigateTo(Person({ notes: DEMO_PERSON_NOTES })));
const handleCreateCounter = handler<void, void>(() => navigateTo(Counter({})));
const handleCreateShoppingList = handler<void, void>(() => navigateTo(ShoppingListLauncher({})));
const handleCreateStoreMapper = handler<void, void>(() => navigateTo(StoreMapper({})));
const handleCreateFoodRecipe = handler<void, void>(() => navigateTo(FoodRecipe({})));
const handleCreateFoodRecipeDemo = handler<void, void>(() => navigateTo(FoodRecipe({ notes: DEMO_RECIPE_NOTES })));
const handleCreateMetaAnalyzer = handler<void, void>(() => navigateTo(MetaAnalyzer({})));
const handleCreatePromptInjectionTracker = handler<void, void>(() => navigateTo(PromptInjectionTracker({})));
const handleCreateSubstackSummarizer = handler<void, void>(() => navigateTo(SubstackSummarizer({})));
const handleCreateCozyPoll = handler<void, void>(() => navigateTo(CozyPoll({})));
const handleCreateRewardSpinner = handler<void, void>(() => navigateTo(RewardSpinner({})));
const handleCreateCheeseboardSchedule = handler<void, void>(() => navigateTo(CheeseboardSchedule({})));
const handleCreateMealOrchestrator = handler<void, void>(() => navigateTo(MealOrchestrator({})));
const handleCreatePreparedFood = handler<void, void>(() => navigateTo(PreparedFood({})));
const handleCreateHotelMembershipExtractor = handler<void, void>(() => navigateTo(HotelMembershipExtractor({})));
const handleCreateGoogleCalendarImporter = handler<void, void>(() => navigateTo(GoogleCalendarImporter({})));
const handleCreateSmartRubric = handler<void, void>(() => navigateTo(SmartRubric({})));
const handleCreateFavoritesViewer = handler<void, void>(() => navigateTo(FavoritesViewer({})));
const handleCreateStarChart = handler<void, void>(() => navigateTo(StarChart({})));
const handleCreateStoryWeaver = handler<void, void>(() => navigateTo(StoryWeaver({})));
const handleCreateCodenamesHelper = handler<void, void>(() => navigateTo(CodenamesHelper({})));

export default pattern<Input, Output>(
  (_) => {
    return {
      [NAME]: "Page Creator",
      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2 style="margin: 0; fontSize: 18px;">Create New Page</h2>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack style="padding: 16px; gap: 12px;">
              <p style="margin: 0; fontSize: 13px; color: #666;">Select a page type to create:</p>

              <ct-vstack style="gap: 8px;">
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <ct-button onClick={handleCreatePerson()} size="lg">
                    👤 New Person
                  </ct-button>
                  <ct-button onClick={handleCreatePersonDemo()} variant="secondary" size="sm">
                    Demo
                  </ct-button>
                </div>

                <ct-button onClick={handleCreateCounter()} size="lg">
                  🔢 New Counter
                </ct-button>

                <ct-button onClick={handleCreateShoppingList()} size="lg">
                  🛒 Shopping List
                </ct-button>

                <ct-button onClick={handleCreateStoreMapper()} size="lg">
                  🗺️ Store Mapper
                </ct-button>

                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <ct-button onClick={handleCreateFoodRecipe()} size="lg">
                    🍳 New Recipe
                  </ct-button>
                  <ct-button onClick={handleCreateFoodRecipeDemo()} variant="secondary" size="sm">
                    Demo
                  </ct-button>
                </div>

                <ct-button onClick={handleCreateMetaAnalyzer()} size="lg">
                  ⚡ Field Suggestions (Meta Analyzer)
                </ct-button>

                <ct-button onClick={handleCreatePromptInjectionTracker()} size="lg">
                  🔒 Prompt Injection Tracker
                </ct-button>

                <ct-button onClick={handleCreateSubstackSummarizer()} size="lg">
                  📧 Substack Summarizer
                </ct-button>

                <ct-button onClick={handleCreateCozyPoll()} size="lg">
                  🗳️ Cozy Poll
                </ct-button>

                <ct-button onClick={handleCreateRewardSpinner()} size="lg">
                  🎰 Reward Spinner
                </ct-button>

                <ct-button onClick={handleCreateCheeseboardSchedule()} size="lg">
                  🍕 Cheeseboard Schedule
                </ct-button>

                <ct-button onClick={handleCreateMealOrchestrator()} size="lg">
                  🍽️ Meal Orchestrator
                </ct-button>

                <ct-button onClick={handleCreatePreparedFood()} size="lg">
                  🛒 Prepared Food
                </ct-button>

                <ct-button onClick={handleCreateHotelMembershipExtractor()} size="lg">
                  🏨 Hotel Membership Extractor
                </ct-button>

                <ct-button onClick={handleCreateGoogleCalendarImporter()} size="lg">
                  📅 Google Calendar Importer
                </ct-button>

                <ct-button onClick={handleCreateSmartRubric()} size="lg">
                  📊 Smart Rubric
                </ct-button>

                <ct-button onClick={handleCreateFavoritesViewer()} size="lg">
                  ⭐ Favorites Viewer
                </ct-button>

                <ct-button onClick={handleCreateStarChart()} size="lg">
                  ⭐ Star Chart
                </ct-button>

                <ct-button onClick={handleCreateStoryWeaver()} size="lg">
                  🧵 Story Weaver
                </ct-button>

                <ct-button onClick={handleCreateCodenamesHelper()} size="lg">
                  🕵️ Codenames Helper
                </ct-button>
              </ct-vstack>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
    };
  },
);
