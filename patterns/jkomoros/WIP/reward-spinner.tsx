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
  // Generosity level: 0 = lots of candy (5% hugs), 10 = mostly hugs (99%)
  generosity: Default<number, 0>;
}

interface SpinnerOutput {
  currentEmoji: Default<string, "🎁">;
  isSpinning: Default<boolean, false>;
  generosity: Default<number, 0>;
}

const spin = handler<
  unknown,
  {
    currentEmoji: Cell<string>;
    isSpinning: Cell<boolean>;
    generosity: Cell<number>;
  }
>(
  (_, { currentEmoji, isSpinning, generosity }) => {
    // Convert generosity (0-10) to weights
    // At 0: mostly candy (5% hugs), At 10: mostly hugs (99%)
    const gen = generosity.get();
    const hugWeight = 1 + (gen * 10); // 1 to 101
    const candyWeight = 11 - gen; // 11 to 1

    // Split candy between 3 beans and 1 bean
    const weightThreeBeans = candyWeight * 0.45;
    const weightOneBean = candyWeight * 0.55;

    const weights = [weightThreeBeans, weightOneBean, hugWeight];

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

const decrementGenerosity = handler<
  unknown,
  { generosity: Cell<number> }
>(
  (_, { generosity }) => {
    const current = generosity.get();
    if (current > 0) generosity.set(current - 1);
  }
);

const incrementGenerosity = handler<
  unknown,
  { generosity: Cell<number> }
>(
  (_, { generosity }) => {
    const current = generosity.get();
    if (current < 10) generosity.set(current + 1);
  }
);

export default recipe<SpinnerInput, SpinnerOutput>(
  ({ currentEmoji, isSpinning, generosity }) => {
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
              generosity,
            })}
            style={{
              fontSize: "48px",
              padding: "30px 60px",
              fontWeight: "bold",
            }}
          >
            🎰 SPIN!
          </ct-button>

          {/* Subtle controls at bottom - not obvious to kids */}
          <div
            style={{
              position: "fixed",
              bottom: "10px",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              fontSize: "9px",
              color: "#94a3b8",
              backgroundColor: "rgba(255, 255, 255, 0.6)",
              padding: "6px 10px",
              borderRadius: "3px",
              backdropFilter: "blur(4px)",
            }}
          >
            {/* Visual readout: 0-5 TADA emojis based on generosity */}
            <div style={{ fontSize: "14px", minHeight: "18px" }}>
              {"🎉".repeat(Math.floor(generosity / 2))}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={decrementGenerosity({ generosity })}
                style={{
                  fontSize: "14px",
                  padding: "2px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "2px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                −
              </button>
              <button
                onClick={incrementGenerosity({ generosity })}
                style={{
                  fontSize: "14px",
                  padding: "2px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "2px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      ),
      currentEmoji,
      isSpinning,
      generosity,
    };
  }
);
