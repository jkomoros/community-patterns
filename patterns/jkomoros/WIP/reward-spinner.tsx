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
    if (isSpinning.get()) return; // Already spinning

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

    // Generate sequence: 20 random emojis, then end with the selected prize
    const sequence: string[] = [];
    for (let i = 0; i < 20; i++) {
      const randomIdx = Math.floor(Math.random() * prizeOptions.length);
      sequence.push(prizeOptions[randomIdx].emoji);
    }
    sequence.push(prizeOptions[selectedIndex].emoji);

    // Set spinning state
    isSpinning.set(true);

    // Animate through the sequence with increasing delays
    let index = 0;
    const animate = () => {
      if (index >= sequence.length) {
        // Done spinning
        isSpinning.set(false);
        return;
      }

      currentEmoji.set(sequence[index]);

      // Calculate delay: start fast, get slower
      // First 10: 100ms, next 5: 200ms, next 3: 300ms, last 3: 500ms
      let delay = 100;
      if (index >= 10) delay = 200;
      if (index >= 15) delay = 300;
      if (index >= 18) delay = 500;

      index++;
      setTimeout(animate, delay);
    };

    animate();
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
            disabled={isSpinning}
            style={{
              fontSize: "48px",
              padding: "30px 60px",
              fontWeight: "bold",
            }}
          >
            {isSpinning ? "Spinning..." : "🎰 SPIN!"}
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
