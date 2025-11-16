/// <cts-enable />
import { Cell, computed, Default, handler, NAME, recipe, str, UI } from "commontools";

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
  // Sequence of emojis for slot machine animation
  spinSequence: Default<string[], []>;
  // Counter to force animation restart
  spinCount: Default<number, 0>;
}

interface SpinnerOutput {
  currentEmoji: Default<string, "🎁">;
  isSpinning: Default<boolean, false>;
  generosity: Default<number, 0>;
  spinSequence: Default<string[], []>;
  spinCount: Default<number, 0>;
}

const spin = handler<
  unknown,
  {
    currentEmoji: Cell<string>;
    isSpinning: Cell<boolean>;
    generosity: Cell<number>;
    spinSequence: Cell<string[]>;
    spinCount: Cell<number>;
  }
>(
  (_, { currentEmoji, isSpinning, generosity, spinSequence, spinCount }) => {
    // Convert generosity (0-10) to weights
    // At 0: mostly hugs (99%), At 10: mostly candy (99%)
    const gen = generosity.get();
    const hugWeight = 11 - gen; // 11 to 1 (high gen = few hugs)
    const candyWeight = 1 + (gen * 10); // 1 to 101 (high gen = lots of candy)

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

    // Update the final emoji first
    currentEmoji.set(finalEmoji);

    // Build slot machine sequence: random items, then final result at the end
    // Total of 15 items, with final result at position 14 (will be visible after animation)
    const sequence: string[] = [];
    for (let i = 0; i < 15; i++) {
      if (i === 14) {
        // Final result at the last position
        sequence.push(finalEmoji);
      } else {
        // Random prize
        const randomPrize = prizeOptions[Math.floor(Math.random() * prizeOptions.length)];
        sequence.push(randomPrize.emoji);
      }
    }

    // Set the sequence to trigger animation
    spinSequence.set(sequence);
    spinCount.set(spinCount.get() + 1);
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
  ({ currentEmoji, isSpinning, generosity, spinSequence, spinCount }) => {
    // Compute the TADA emoji display from generosity level (0-10 emojis, one per level)
    const tadaDisplay = computed(() =>
      "🎉".repeat(generosity)
    );

    // Compute whether buttons should be disabled
    const minusDisabled = computed(() => generosity <= 0);
    const plusDisabled = computed(() => generosity >= 10);

    // Check if spinCount is even or odd to alternate animations
    const isEvenSpin = computed(() => spinCount % 2 === 0);

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
          {/* Slot Machine Display */}
          <div
            style={{
              width: "min(300px, 90vw)",
              height: "200px",
              overflow: "hidden",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              maskImage: "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
            }}
          >
            {spinSequence.length > 0 ? (
              isEvenSpin ? (
                // Animated sequence (even spins)
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    animation: "slotSpin1 6s cubic-bezier(0.25, 0.1, 0.25, 1)",
                    animationFillMode: "forwards",
                    position: "absolute",
                    top: "0",
                    left: "0",
                    width: "100%",
                  }}
                >
                  {spinSequence.map((emoji, index) => (
                    <div
                      key={index}
                      style={{
                        fontSize: "150px",
                        lineHeight: "200px",
                        height: "200px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        flexShrink: "0",
                        position: "relative",
                      }}
                    >
                      {emoji === "🍬🍬🍬" ? (
                        <>
                          {/* Left candy - behind and up-left */}
                          <span style={{
                            position: "absolute",
                            fontSize: "150px",
                            left: "calc(50% - 60px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Right candy - behind and up-right */}
                          <span style={{
                            position: "absolute",
                            fontSize: "150px",
                            left: "calc(50% + 60px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Middle candy - in front, centered */}
                          <span style={{
                            position: "absolute",
                            fontSize: "150px",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 2,
                          }}>🍬</span>
                        </>
                      ) : (
                        <span style={{
                          position: "absolute",
                          fontSize: "150px",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                        }}>{emoji}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                // Animated sequence (odd spins)
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    animation: "slotSpin2 6s cubic-bezier(0.25, 0.1, 0.25, 1)",
                    animationFillMode: "forwards",
                    position: "absolute",
                    top: "0",
                    left: "0",
                    width: "100%",
                  }}
                >
                  {spinSequence.map((emoji, index) => (
                    <div
                      key={index}
                      style={{
                        fontSize: "150px",
                        lineHeight: "200px",
                        height: "200px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        flexShrink: "0",
                        position: "relative",
                      }}
                    >
                      {emoji === "🍬🍬🍬" ? (
                        <>
                          {/* Left candy - behind and up-left */}
                          <span style={{
                            position: "absolute",
                            fontSize: "150px",
                            left: "calc(50% - 60px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Right candy - behind and up-right */}
                          <span style={{
                            position: "absolute",
                            fontSize: "150px",
                            left: "calc(50% + 60px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Middle candy - in front, centered */}
                          <span style={{
                            position: "absolute",
                            fontSize: "150px",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 2,
                          }}>🍬</span>
                        </>
                      ) : (
                        <span style={{
                          position: "absolute",
                          fontSize: "150px",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                        }}>{emoji}</span>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              // Initial static display
              <div
                style={{
                  fontSize: "150px",
                  lineHeight: "1",
                  height: "200px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  position: "relative",
                }}
              >
                {currentEmoji === "🍬🍬🍬" ? (
                  <>
                    {/* Left candy - behind and up-left */}
                    <span style={{
                      position: "absolute",
                      fontSize: "150px",
                      left: "calc(50% - 60px)",
                      top: "calc(50% - 15px)",
                      transform: "translate(-50%, -50%)",
                      zIndex: 1,
                    }}>🍬</span>
                    {/* Right candy - behind and up-right */}
                    <span style={{
                      position: "absolute",
                      fontSize: "150px",
                      left: "calc(50% + 60px)",
                      top: "calc(50% - 15px)",
                      transform: "translate(-50%, -50%)",
                      zIndex: 1,
                    }}>🍬</span>
                    {/* Middle candy - in front, centered */}
                    <span style={{
                      position: "absolute",
                      fontSize: "150px",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      zIndex: 2,
                    }}>🍬</span>
                  </>
                ) : (
                  <span style={{
                    position: "absolute",
                    fontSize: "150px",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                  }}>{currentEmoji}</span>
                )}
              </div>
            )}
          </div>

          {/* CSS Animations */}
          <style>{`
            @keyframes slotSpin1 {
              0% {
                transform: translateY(0);
              }
              100% {
                transform: translateY(-2800px);
              }
            }
            @keyframes slotSpin2 {
              0% {
                transform: translateY(0);
              }
              100% {
                transform: translateY(-2800px);
              }
            }
          `}</style>

          {/* Spin Button */}
          <ct-button
            onClick={spin({
              currentEmoji,
              isSpinning,
              generosity,
              spinSequence,
              spinCount,
            })}
            style={{
              fontSize: "32px",
              padding: "20px 40px",
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
            {/* Visual readout: TADA emojis based on generosity level */}
            <div style={{ fontSize: "12px", minHeight: "16px", lineHeight: "1" }}>
              {tadaDisplay}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={decrementGenerosity({ generosity })}
                disabled={minusDisabled}
                style={{
                  fontSize: "14px",
                  padding: "2px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "2px",
                  background: "white",
                  cursor: minusDisabled ? "not-allowed" : "pointer",
                  opacity: minusDisabled ? 0.5 : 1,
                }}
              >
                −
              </button>
              <button
                onClick={incrementGenerosity({ generosity })}
                disabled={plusDisabled}
                style={{
                  fontSize: "14px",
                  padding: "2px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "2px",
                  background: "white",
                  cursor: plusDisabled ? "not-allowed" : "pointer",
                  opacity: plusDisabled ? 0.5 : 1,
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
      spinSequence,
      spinCount,
    };
  }
);
