/// <cts-enable />
import { Cell, Default, handler, NAME, recipe, str, UI } from "commontools";

/**
 * Reward Spinner Pattern
 *
 * A fun spinner for kids with adjustable odds for each prize.
 * Prizes: 3 jelly beans, 1 jelly bean, or a hug
 *
 * The weights can be adjusted to change the likelihood of each prize
 * without changing the UI or behavior.
 */

const prizeOptions = [
  { emoji: "🍬🍬🍬", label: "Three Jelly Beans!" },
  { emoji: "🍬", label: "One Jelly Bean!" },
  { emoji: "🤗", label: "Big Hug!" },
] as const;

interface SpinnerInput {
  currentEmoji: Default<string, "🎁">;
  isSpinning: Default<boolean, false>;
  // Weights for each prize (can be adjusted to change odds)
  weightThreeBeans: Default<number, 1>;
  weightOneBean: Default<number, 1>;
  weightHug: Default<number, 1>;
}

interface SpinnerOutput {
  currentEmoji: Default<string, "🎁">;
  isSpinning: Default<boolean, false>;
  weightThreeBeans: Default<number, 1>;
  weightOneBean: Default<number, 1>;
  weightHug: Default<number, 1>;
}

const spin = handler<
  unknown,
  {
    currentEmoji: Cell<string>;
    isSpinning: Cell<boolean>;
    weightThreeBeans: Cell<number>;
    weightOneBean: Cell<number>;
    weightHug: Cell<number>;
  }
>(
  (_, { currentEmoji, isSpinning, weightThreeBeans, weightOneBean, weightHug }) => {
    // Get the weights
    const weights = [
      weightThreeBeans.get(),
      weightOneBean.get(),
      weightHug.get(),
    ];

    // Calculate total weight
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Pick a random number between 0 and totalWeight to determine final result
    const random = Math.random() * totalWeight;

    // Find which prize was selected
    let cumulativeWeight = 0;
    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      cumulativeWeight += weights[i];
      if (random < cumulativeWeight) {
        selectedIndex = i;
        break;
      }
    }

    const finalEmoji = prizeOptions[selectedIndex].emoji;

    // Show the result immediately (no animation for now - setTimeout doesn't work with framework)
    currentEmoji.set(finalEmoji);
  }
);

export default recipe<SpinnerInput, SpinnerOutput>(
  ({ currentEmoji, isSpinning, weightThreeBeans, weightOneBean, weightHug }) => {
    return {
      [NAME]: str`Reward Spinner`,
      [UI]: (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            backgroundColor: "#f0f9ff",
            fontFamily: "system-ui, sans-serif",
            padding: "20px",
            gap: "40px",
          }}
        >
          {/* Big Emoji Display */}
          <div
            style={{
              fontSize: "200px",
              lineHeight: "1",
              textAlign: "center",
              minHeight: "200px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {currentEmoji}
          </div>

          {/* Spin Button */}
          <ct-button
            onClick={spin({
              currentEmoji,
              isSpinning,
              weightThreeBeans,
              weightOneBean,
              weightHug,
            })}
            style={{
              fontSize: "48px",
              padding: "30px 60px",
              fontWeight: "bold",
            }}
          >
            🎰 SPIN!
          </ct-button>
        </div>
      ),
      currentEmoji,
      isSpinning,
      weightThreeBeans,
      weightOneBean,
      weightHug,
    };
  }
);
