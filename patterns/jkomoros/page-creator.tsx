/// <cts-enable />
import { handler, NAME, navigateTo, pattern, UI } from "commontools";

// Import factory functions - these use pattern defaults, avoiding manual field enumeration
// See pattern-development skill for idiom documentation
import { createPerson } from "./person.tsx";
import { createCounter } from "./lib/counter.tsx";
import { createShoppingListLauncher } from "./shopping-list-launcher.tsx";
import { createStoreMapper } from "./store-mapper.tsx";
import { createMetaAnalyzer } from "./meta-analyzer.tsx";
import { createFoodRecipe } from "./food-recipe.tsx";
import { createPromptInjectionTracker } from "./prompt-injection-tracker.tsx";
import { createSubstackSummarizer } from "./substack-summarizer.tsx";
import { createCozyPoll } from "./cozy-poll.tsx";
import { createRewardSpinner } from "./reward-spinner.tsx";
import { createCheeseboardSchedule } from "./cheeseboard-schedule.tsx";
import { createMealOrchestrator } from "./meal-orchestrator.tsx";
import { createPreparedFood } from "./prepared-food.tsx";
import { createHotelMembershipExtractor } from "./hotel-membership-extractor.tsx";
import { createGoogleCalendarImporter } from "./google-calendar-importer.tsx";
import { createSmartRubric } from "./WIP/smart-rubric.tsx";
import { createFavoritesViewer } from "./favorites-viewer.tsx";
import { createRedactorWithVault } from "./redactor-with-vault.tsx";
import { createStarChart } from "./star-chart.tsx";
import { createSpindleBoard } from "./spindle-board.tsx";

type Input = void;
type Output = {
  [NAME]: string;
  [UI]: unknown;
};

// Handlers use factory functions - no manual field enumeration needed!
// If a pattern adds new fields, the factory's defaults handle them automatically.
// If defaults are missing fields, the factory function itself fails to compile.

const handleCreatePerson = handler<void, void>(() => navigateTo(createPerson()));
const handleCreateCounter = handler<void, void>(() => navigateTo(createCounter()));
const handleCreateShoppingList = handler<void, void>(() => navigateTo(createShoppingListLauncher()));
const handleCreateStoreMapper = handler<void, void>(() => navigateTo(createStoreMapper()));
const handleCreateFoodRecipe = handler<void, void>(() => navigateTo(createFoodRecipe()));
const handleCreateMetaAnalyzer = handler<void, void>(() => navigateTo(createMetaAnalyzer()));
const handleCreatePromptInjectionTracker = handler<void, void>(() => navigateTo(createPromptInjectionTracker()));
const handleCreateSubstackSummarizer = handler<void, void>(() => navigateTo(createSubstackSummarizer()));
const handleCreateCozyPoll = handler<void, void>(() => navigateTo(createCozyPoll()));
const handleCreateRewardSpinner = handler<void, void>(() => navigateTo(createRewardSpinner()));
const handleCreateCheeseboardSchedule = handler<void, void>(() => navigateTo(createCheeseboardSchedule()));
const handleCreateMealOrchestrator = handler<void, void>(() => navigateTo(createMealOrchestrator()));
const handleCreatePreparedFood = handler<void, void>(() => navigateTo(createPreparedFood()));
const handleCreateHotelMembershipExtractor = handler<void, void>(() => navigateTo(createHotelMembershipExtractor()));
const handleCreateGoogleCalendarImporter = handler<void, void>(() => navigateTo(createGoogleCalendarImporter()));
const handleCreateSmartRubric = handler<void, void>(() => navigateTo(createSmartRubric()));
const handleCreateFavoritesViewer = handler<void, void>(() => navigateTo(createFavoritesViewer()));
// HACK: Combined vault + redactor pattern while wish("#pii-vault") is broken
const handleCreateRedactorWithVault = handler<void, void>(() => navigateTo(createRedactorWithVault()));
const handleCreateStarChart = handler<void, void>(() => navigateTo(createStarChart()));
const handleCreateSpindleBoard = handler<void, void>(() => navigateTo(createSpindleBoard()));

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
                <ct-button onClick={handleCreatePerson()} size="lg">
                  👤 New Person
                </ct-button>

                <ct-button onClick={handleCreateCounter()} size="lg">
                  🔢 New Counter
                </ct-button>

                <ct-button onClick={handleCreateShoppingList()} size="lg">
                  🛒 Shopping List
                </ct-button>

                <ct-button onClick={handleCreateStoreMapper()} size="lg">
                  🗺️ Store Mapper
                </ct-button>

                <ct-button onClick={handleCreateFoodRecipe()} size="lg">
                  🍳 New Recipe
                </ct-button>

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

                <ct-button onClick={handleCreateRedactorWithVault()} size="lg">
                  🛡️ PII Redactor
                </ct-button>

                <ct-button onClick={handleCreateStarChart()} size="lg">
                  ⭐ Star Chart
                </ct-button>

                <ct-button onClick={handleCreateSpindleBoard()} size="lg">
                  🌀 Spindle Board
                </ct-button>
              </ct-vstack>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
    };
  },
);
