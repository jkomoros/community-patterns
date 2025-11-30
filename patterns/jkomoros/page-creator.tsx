/// <cts-enable />
import { handler, NAME, navigateTo, pattern, UI } from "commontools";

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
import HotelMembershipExtractor from "./hotel-membership-extractor.tsx";
import SmartRubric from "./WIP/smart-rubric.tsx";
import FavoritesViewer from "./favorites-viewer.tsx";
import RedactorWithVault from "./redactor-with-vault.tsx";

type Input = void;
type Output = {
  [NAME]: string;
  [UI]: unknown;
};

const createPerson = handler<void, void>((_, __) => {
  return navigateTo(Person({
    displayName: "",
    givenName: "",
    familyName: "",
    nickname: "",
    pronouns: "",
    emails: [],
    phones: [],
    socialLinks: [],
    birthday: "",
    tags: [],
    notes: "",
    photoUrl: "",
  }));
});

const createCounter = handler<void, void>((_, __) => {
  return navigateTo(Counter({
    value: 0,
  }));
});

const createShoppingList = handler<void, void>((_, __) => {
  return navigateTo(ShoppingListLauncher({
    items: [],
    storeData: null,
    storeName: "Andronico's on Shattuck",
  }));
});

const createStoreMapper = handler<void, void>((_, __) => {
  return navigateTo(StoreMapper({
    storeName: "",
    aisles: [],
    specialDepartments: [],
    unassignedDepartments: ["Bakery", "Deli", "Produce", "Dairy", "Frozen Foods", "Meat & Seafood", "Pharmacy"],
    entrances: [],
    notInStore: [],
    inCenterAisles: [],
    itemLocations: [],
  }));
});

const createFoodRecipe = handler<void, void>((_, __) => {
  return navigateTo(FoodRecipe({
    name: "",
    cuisine: "",
    servings: 4,
    yield: "",
    difficulty: "medium" as const,
    prepTime: 0,
    cookTime: 0,
    restTime: 0,
    holdTime: 0,
    category: "other" as const,
    ingredients: [],
    stepGroups: [],
    tags: [],
    notes: "",
    source: "",
  }));
});

const createMetaAnalyzer = handler<void, void>((_, __) => {
  return navigateTo(MetaAnalyzer({}));
});

const createPromptInjectionTracker = handler<void, void>((_, __) => {
  return navigateTo(PromptInjectionTracker({
    gmailFilterQuery: 'from:"googlealerts-noreply@google.com" subject:"prompt injection"',
    limit: 50,
    articles: [],
    authCharm: null,
  }));
});

const createSubstackSummarizer = handler<void, void>((_, __) => {
  return navigateTo(SubstackSummarizer({
    gmailFilterQuery: "label:demo",
    limit: 50,
  }));
});

const createCozyPoll = handler<void, void>((_, __) => {
  return navigateTo(CozyPoll({
    question: "",
    options: [],
    votes: [],
    voterCharms: [],
    nextOptionId: 1,
  }));
});

const createRewardSpinner = handler<void, void>((_, __) => {
  return navigateTo(RewardSpinner({
    currentEmoji: "🎁",
    isSpinning: false,
    generosity: 10,
    spinSequence: [],
    spinCount: 0,
    payoutAnimationCount: 0,
    spinHistory: [],
  }));
});

const createCheeseboardSchedule = handler<void, void>((_, __) => {
  return navigateTo(CheeseboardSchedule({
    preferences: [],
    history: [],
  }));
});

const createMealOrchestrator = handler<void, void>((_, __) => {
  return navigateTo(MealOrchestrator({
    mealName: "",
    mealDate: "",
    mealTime: "",
    guestCount: 4,
    ovens: [{
      rackPositions: 5,
      physicalRacks: 2
    }],
    stovetopBurners: 4,
    dietaryProfiles: [],
    planningNotes: "",
    recipes: [],
    preparedFoods: [],
    notes: "",
  }));
});

const createPreparedFood = handler<void, void>((_, __) => {
  return navigateTo(PreparedFood({
    name: "",
    servings: 4,
    category: "other",
    dietaryTags: [],
    primaryIngredients: [],
    description: "",
    source: "",
    prepTime: 0,
    requiresReheating: false,
    tags: [],
  }));
});

const createHotelMembershipExtractor = handler<void, void>((_, __) => {
  return navigateTo(HotelMembershipExtractor({
    auth: {
      token: "",
      tokenType: "",
      scope: [],
      expiresIn: 0,
      expiresAt: 0,
      refreshToken: "",
      user: { email: "", name: "", picture: "" },
    },
    memberships: [],
    lastScanAt: 0,
    isScanning: false,
    maxSearches: 5,
    currentScanMode: "full",
  }));
});

const createSmartRubric = handler<void, void>((_, __) => {
  return navigateTo(SmartRubric({
    title: "Decision Rubric",
    options: [],
    dimensions: [],
    selection: { value: null },
    quickAddPrompt: "",
    quickAddSubmitted: "",
  }));
});

const createFavoritesViewer = handler<void, void>((_, __) => {
  return navigateTo(FavoritesViewer({}));
});

// HACK: Combined vault + redactor pattern while wish("#pii-vault") is broken
const createRedactorWithVault = handler<void, void>((_, __) => {
  return navigateTo(RedactorWithVault({
    title: "PII Redactor",
    entries: [],
    inputText: "",
    llmResponse: "",
  }));
});

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
                <ct-button
                  onClick={createPerson()}
                  size="lg"
                >
                  👤 New Person
                </ct-button>

                <ct-button
                  onClick={createCounter()}
                  size="lg"
                >
                  🔢 New Counter
                </ct-button>

                <ct-button
                  onClick={createShoppingList()}
                  size="lg"
                >
                  🛒 Shopping List
                </ct-button>

                <ct-button
                  onClick={createStoreMapper()}
                  size="lg"
                >
                  🗺️ Store Mapper
                </ct-button>

                <ct-button
                  onClick={createFoodRecipe()}
                  size="lg"
                >
                  🍳 New Recipe
                </ct-button>

                <ct-button
                  onClick={createMetaAnalyzer()}
                  size="lg"
                >
                  ⚡ Field Suggestions (Meta Analyzer)
                </ct-button>

                <ct-button
                  onClick={createPromptInjectionTracker()}
                  size="lg"
                >
                  🔒 Prompt Injection Tracker
                </ct-button>

                <ct-button
                  onClick={createSubstackSummarizer()}
                  size="lg"
                >
                  📧 Substack Summarizer
                </ct-button>

                <ct-button
                  onClick={createCozyPoll()}
                  size="lg"
                >
                  🗳️ Cozy Poll
                </ct-button>

                <ct-button
                  onClick={createRewardSpinner()}
                  size="lg"
                >
                  🎰 Reward Spinner
                </ct-button>

                <ct-button
                  onClick={createCheeseboardSchedule()}
                  size="lg"
                >
                  🍕 Cheeseboard Schedule
                </ct-button>

                <ct-button
                  onClick={createMealOrchestrator()}
                  size="lg"
                >
                  🍽️ Meal Orchestrator
                </ct-button>

                <ct-button
                  onClick={createPreparedFood()}
                  size="lg"
                >
                  🛒 Prepared Food
                </ct-button>

                <ct-button
                  onClick={createHotelMembershipExtractor()}
                  size="lg"
                >
                  🏨 Hotel Membership Extractor
                </ct-button>

                <ct-button
                  onClick={createSmartRubric()}
                  size="lg"
                >
                  📊 Smart Rubric
                </ct-button>

                <ct-button
                  onClick={createFavoritesViewer()}
                  size="lg"
                >
                  ⭐ Favorites Viewer
                </ct-button>

                <ct-button
                  onClick={createRedactorWithVault()}
                  size="lg"
                >
                  🛡️ PII Redactor
                </ct-button>
              </ct-vstack>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
    };
  },
);
