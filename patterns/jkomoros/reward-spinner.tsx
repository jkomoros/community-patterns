/// <cts-enable />
import { Cell, computed, Default, handler, NAME, pattern, str, UI } from "commontools";

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

interface SpinRecord {
  timestamp: number;
  generosity: number;
  result: string;
}

interface SpinnerInput {
  currentEmoji: Cell<Default<string, "🎁">>;
  isSpinning: Cell<Default<boolean, false>>;
  // Generosity level: 0 = mostly hugs (95%), 10 = lots of candy (95%)
  generosity: Cell<Default<number, 10>>;
  // Sequence of emojis for slot machine animation
  spinSequence: Cell<Default<string[], []>>;
  // Counter to force animation restart
  spinCount: Cell<Default<number, 0>>;
  // Counter to force payout animation restart
  payoutAnimationCount: Cell<Default<number, 0>>;
  // History of all spins (timestamp, generosity level, result)
  spinHistory: Cell<Default<SpinRecord[], []>>;
}

interface SpinnerOutput {
  currentEmoji: Cell<Default<string, "🎁">>;
  isSpinning: Cell<Default<boolean, false>>;
  generosity: Cell<Default<number, 10>>;
  spinSequence: Cell<Default<string[], []>>;
  spinCount: Cell<Default<number, 0>>;
  payoutAnimationCount: Cell<Default<number, 0>>;
  spinHistory: Cell<Default<SpinRecord[], []>>;
}

/**
 * Calculate prize weights based on generosity level
 * @param generosity - Level from 0 to 10 (0 = mostly hugs, 10 = lots of candy)
 * @returns Array of [weightThreeBeans, weightOneBean, hugWeight]
 */
function calculatePrizeWeights(generosity: number): [number, number, number] {
  // Use linear curve for smooth transition
  // At gen=0: hugWeight=21, candyWeight=1 → 95% hugs, 5% candy
  // At gen=5: hugWeight=11, candyWeight=11 → 50% hugs, 50% candy
  // At gen=10: hugWeight=1, candyWeight=21 → 5% hugs, 95% candy
  const hugWeight = 1 + ((10 - generosity) * 2.0); // 21.0 to 1.0
  const candyWeight = 1 + (generosity * 2.0); // 1.0 to 21.0

  // Split candy between 3 beans and 1 bean
  // Three beans is rare: only 15% of candy payouts
  const weightThreeBeans = candyWeight * 0.15;
  const weightOneBean = candyWeight * 0.85;

  return [weightThreeBeans, weightOneBean, hugWeight];
}

const spin = handler<
  unknown,
  {
    currentEmoji: Cell<string>;
    isSpinning: Cell<boolean>;
    generosity: Cell<number>;
    spinSequence: Cell<string[]>;
    spinCount: Cell<number>;
    spinHistory: Cell<SpinRecord[]>;
  }
>(
  (_, { currentEmoji, isSpinning, generosity, spinSequence, spinCount, spinHistory }) => {
    const gen = generosity.get();
    const weights = calculatePrizeWeights(gen);

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

    // Build slot machine sequence: start with last result (or default) to avoid visual discontinuity,
    // then random items, then final result at the end
    // Total of 32 items, with final result at position 30 (animation shows positions 0-30)
    // Animation translates -6000px (30 items × 200px) to center item 30 in the viewport window
    const existingHistory = spinHistory.get();
    const previousResult = existingHistory.length > 0
      ? existingHistory[existingHistory.length - 1].result
      : currentEmoji.get();

    const sequence: string[] = [];
    for (let i = 0; i < 32; i++) {
      if (i === 0) {
        // First item is previous result (avoids visual jump)
        sequence.push(previousResult);
      } else if (i === 30) {
        // Final result at position 30 (will be visible after animation stops)
        sequence.push(finalEmoji);
      } else {
        // Random prize
        const randomPrize = prizeOptions[Math.floor(Math.random() * prizeOptions.length)];
        sequence.push(randomPrize.emoji);
      }
    }

    // Set the sequence to trigger animation BEFORE updating currentEmoji
    // This prevents visual hitch where final emoji flashes before animation starts
    spinSequence.set(sequence);
    spinCount.set(spinCount.get() + 1);

    // Record this spin in history
    const history = spinHistory.get();
    const newRecord: SpinRecord = {
      timestamp: Date.now(),
      generosity: gen,
      result: finalEmoji,
    };
    spinHistory.set([...history, newRecord]);

    // NOTE: We intentionally do NOT update currentEmoji here.
    // The animation shows the final result at position 30, and
    // shouldShowAnimation will be true for 10 seconds after the spin.
    // When shouldShowAnimation becomes false, the static display will
    // show currentEmoji - but we want it to show the RESULT, so we
    // need to update it. However, updating it HERE causes a flash
    // because for one frame the static display might show before
    // the animation kicks in. Instead, we'll derive the display emoji
    // from the last spin result when not animating.
  }
);

const decrementGenerosity = handler<
  unknown,
  { generosity: Cell<number>; payoutAnimationCount: Cell<number> }
>(
  (_, { generosity, payoutAnimationCount }) => {
    const current = generosity.get();
    if (current > 0) {
      generosity.set(current - 1);
      payoutAnimationCount.set(payoutAnimationCount.get() + 1);
    }
  }
);

const incrementGenerosity = handler<
  unknown,
  { generosity: Cell<number>; payoutAnimationCount: Cell<number> }
>(
  (_, { generosity, payoutAnimationCount }) => {
    const current = generosity.get();
    if (current < 10) {
      generosity.set(current + 1);
      payoutAnimationCount.set(payoutAnimationCount.get() + 1);
    }
  }
);

export default pattern<SpinnerInput, SpinnerOutput>(
  ({ currentEmoji, isSpinning, generosity, spinSequence, spinCount, payoutAnimationCount, spinHistory }) => {
    // Compute the TADA emoji display from generosity level (0-10 emojis, one per level)
    const tadaDisplay = computed(() =>
      "🎉".repeat(generosity.get())
    );

    // Compute whether buttons should be disabled
    const minusDisabled = computed(() => generosity.get() <= 0);
    const plusDisabled = computed(() => generosity.get() >= 10);

    // Check if spinCount is even or odd to alternate animations
    const isEvenSpin = computed(() => spinCount.get() % 2 === 0);

    // Only show animation if the last spin was very recent (within 10 seconds)
    // This prevents auto-spin when navigating back to the page later
    const shouldShowAnimation = computed(() => {
      const sequence = spinSequence.get();
      const history = spinHistory.get();
      if (sequence.length === 0) return false;
      if (history.length === 0) return false;

      const lastSpin = history[history.length - 1];
      const timeSinceLastSpin = Date.now() - lastSpin.timestamp;
      return timeSinceLastSpin < 10000; // 10 seconds
    });

    // Compute which payout animation variant to show (toggles to restart animation)
    const showPayoutAnimationVariant0 = computed(() => payoutAnimationCount.get() % 2 === 0);

    // Calculate payout display as a computed JSX element (avoids mapping over computed array)
    const payoutDisplay = computed(() => {
      const gen = generosity.get();
      const [weightThreeBeans, weightOneBean, hugWeight] = calculatePrizeWeights(gen);
      const totalWeight = weightThreeBeans + weightOneBean + hugWeight;

      const threeBeansPct = Math.round((weightThreeBeans / totalWeight) * 100);
      const oneBeanPct = Math.round((weightOneBean / totalWeight) * 100);
      const hugPct = Math.round((hugWeight / totalWeight) * 100);

      // Convert percentages to number of dots (out of 10)
      const threeBeansDots = Math.round(threeBeansPct / 10);
      const oneBeanDots = Math.round(oneBeanPct / 10);
      const hugDots = Math.round(hugPct / 10);

      const prizes = [
        { emoji: "🍬🍬🍬", dots: "🟢".repeat(threeBeansDots), percent: threeBeansPct },
        { emoji: "🍬", dots: "🟢".repeat(oneBeanDots), percent: oneBeanPct },
        { emoji: "🤗", dots: "🔴".repeat(hugDots), percent: hugPct },
      ];

      return prizes.map((prize, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "10px",
          }}
        >
          <span style={{ fontSize: "14px", minWidth: "42px", textAlign: "right" }}>{prize.emoji}</span>
          <span style={{ fontSize: "12px", letterSpacing: "1px" }}>{prize.dots}</span>
          <span style={{ fontSize: "9px", minWidth: "30px" }}>
            {prize.percent}%
          </span>
        </div>
      ));
    });

    // Get the display emoji - use last spin result if available, otherwise currentEmoji default
    const displayEmoji = computed(() => {
      const history = spinHistory.get();
      if (history.length > 0) {
        return history[history.length - 1].result;
      }
      return currentEmoji.get();
    });

    // Check if display emoji is three candies (for special rendering)
    const isThreeCandies = computed(() => {
      const history = spinHistory.get();
      if (history.length > 0) {
        return history[history.length - 1].result === "🍬🍬🍬";
      }
      return currentEmoji.get() === "🍬🍬🍬";
    });

    return {
      [NAME]: str`Reward Spinner`,
      [UI]: (
        <ct-screen style="background-color: white; font-family: system-ui, sans-serif;">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              padding: "0",
              gap: "0",
            }}
          >
          {/* Wrapper for emoji and sparkles */}
          <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* "Tap to spin" message - shows on every page load */}
            <div
              style={{
                position: "absolute",
                top: "20%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: "16px",
                color: "#64748b",
                letterSpacing: "0.5px",
                opacity: 0,
                animation: "tapToSpinFade 3s ease-in-out forwards",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              Tap to spin
            </div>
            {/* Slot Machine Display */}
            <div
              onClick={spin({
                currentEmoji,
                isSpinning,
                generosity,
                spinSequence,
                spinCount,
                spinHistory,
              })}
              style={{
                width: "300px",
                height: "200px",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                maskImage: "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
                cursor: "pointer",
                transform: "scale(2.0)",
              }}
            >
            {shouldShowAnimation ? (
              isEvenSpin ? (
                // Animated sequence (even spins)
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    animation: "slotSpin1 6s cubic-bezier(0.05, 0.7, 0.3, 1)",
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
                        fontSize: "105px",
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
                            left: "calc(50% - 40px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Right candy - behind and up-right */}
                          <span style={{
                            position: "absolute",
                            left: "calc(50% + 40px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Middle candy - in front, centered */}
                          <span style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 2,
                          }}>🍬</span>
                        </>
                      ) : (
                        <span style={{
                          position: "absolute",
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
                    animation: "slotSpin2 6s cubic-bezier(0.05, 0.7, 0.3, 1)",
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
                        fontSize: "105px",
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
                            left: "calc(50% - 40px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Right candy - behind and up-right */}
                          <span style={{
                            position: "absolute",
                            left: "calc(50% + 40px)",
                            top: "calc(50% - 15px)",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                          }}>🍬</span>
                          {/* Middle candy - in front, centered */}
                          <span style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 2,
                          }}>🍬</span>
                        </>
                      ) : (
                        <span style={{
                          position: "absolute",
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
                  fontSize: "105px",
                  lineHeight: "1",
                  height: "200px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  position: "relative",
                }}
              >
                {isThreeCandies ? (
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
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                  }}>{displayEmoji}</span>
                )}
              </div>
            )}
            </div>

            {/* Sparkle Burst - alternates between two animation sets to restart on each spin */}
            {shouldShowAnimation && (
              (spinCount.get() % 2 === 0) ? (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "0",
                    height: "0",
                    pointerEvents: "none",
                    zIndex: 1000,
                  }}
                >
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "42px", opacity: 0, animation: "sparkleBurst0 1.2s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "75px", opacity: 0, animation: "sparkleBurst1 3.5s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "45px", opacity: 0, animation: "sparkleBurst2 0.9s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "38px", opacity: 0, animation: "sparkleBurst3 2.8s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "90px", opacity: 0, animation: "sparkleBurst4 1.4s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "35px", opacity: 0, animation: "sparkleBurst5 3.2s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "52px", opacity: 0, animation: "sparkleBurst6 1.1s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "68px", opacity: 0, animation: "sparkleBurst7 2.6s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "40px", opacity: 0, animation: "sparkleBurst8 0.8s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "80px", opacity: 0, animation: "sparkleBurst9 3.0s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "36px", opacity: 0, animation: "sparkleBurst10 2.4s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "48px", opacity: 0, animation: "sparkleBurst11 1.3s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "95px", opacity: 0, animation: "sparkleBurst12 1.6s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "32px", opacity: 0, animation: "sparkleBurst13 0.95s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "62px", opacity: 0, animation: "sparkleBurst14 3.3s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "44px", opacity: 0, animation: "sparkleBurst15 1.5s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "85px", opacity: 0, animation: "sparkleBurst16 2.2s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "38px", opacity: 0, animation: "sparkleBurst17 3.6s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "70px", opacity: 0, animation: "sparkleBurst18 1.0s ease-out 6s" }}>⭐</div>
              <div style={{ position: "absolute", left: "0", top: "0", fontSize: "40px", opacity: 0, animation: "sparkleBurst19 2.9s ease-out 6s" }}>⭐</div>
                </div>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "0",
                    height: "0",
                    pointerEvents: "none",
                    zIndex: 1000,
                  }}
                >
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "42px", opacity: 0, animation: "sparkleBurst0Alt 1.2s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "75px", opacity: 0, animation: "sparkleBurst1Alt 3.5s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "45px", opacity: 0, animation: "sparkleBurst2Alt 0.9s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "38px", opacity: 0, animation: "sparkleBurst3Alt 2.8s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "90px", opacity: 0, animation: "sparkleBurst4Alt 1.4s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "35px", opacity: 0, animation: "sparkleBurst5Alt 3.2s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "52px", opacity: 0, animation: "sparkleBurst6Alt 1.1s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "68px", opacity: 0, animation: "sparkleBurst7Alt 2.6s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "40px", opacity: 0, animation: "sparkleBurst8Alt 0.8s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "80px", opacity: 0, animation: "sparkleBurst9Alt 3.0s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "36px", opacity: 0, animation: "sparkleBurst10Alt 2.4s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "48px", opacity: 0, animation: "sparkleBurst11Alt 1.3s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "95px", opacity: 0, animation: "sparkleBurst12Alt 1.6s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "32px", opacity: 0, animation: "sparkleBurst13Alt 0.95s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "62px", opacity: 0, animation: "sparkleBurst14Alt 3.3s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "44px", opacity: 0, animation: "sparkleBurst15Alt 1.5s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "85px", opacity: 0, animation: "sparkleBurst16Alt 2.2s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "38px", opacity: 0, animation: "sparkleBurst17Alt 3.6s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "70px", opacity: 0, animation: "sparkleBurst18Alt 1.0s ease-out 6s" }}>⭐</div>
                <div style={{ position: "absolute", left: "0", top: "0", fontSize: "40px", opacity: 0, animation: "sparkleBurst19Alt 2.9s ease-out 6s" }}>⭐</div>
                </div>
              )
            )}
          </div>

          {/* CSS Animations */}
          <style>{`
            /* Tap to spin fade animation */
            @keyframes tapToSpinFade {
              0% { opacity: 0; }
              10% { opacity: 1; }
              50% { opacity: 1; }
              100% { opacity: 0; }
            }

            /* Sparkle burst animations - varied sizes, speeds, huge stars fade faster */
            @keyframes sparkleBurst0  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 45% { opacity: 1; } 100% { transform: translate(320px, -15px) rotate(840deg) scale(1.8); opacity: 0; } }
            @keyframes sparkleBurst1  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 0.6; } 25% { opacity: 0.6; } 100% { transform: translate(265px, 110px) rotate(620deg) scale(2.5); opacity: 0; } }
            @keyframes sparkleBurst2  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.1); opacity: 0; } 1% { opacity: 1; } 35% { opacity: 1; } 100% { transform: translate(195px, 215px) rotate(920deg) scale(2.1); opacity: 0; } }
            @keyframes sparkleBurst3  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 1; } 52% { opacity: 1; } 100% { transform: translate(115px, 280px) rotate(710deg) scale(1.5); opacity: 0; } }
            @keyframes sparkleBurst4  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.15); opacity: 0; } 1% { opacity: 0.5; } 20% { opacity: 0.5; } 100% { transform: translate(25px, 315px) rotate(865deg) scale(3.2); opacity: 0; } }
            @keyframes sparkleBurst5  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.35); opacity: 0; } 1% { opacity: 1; } 47% { opacity: 1; } 100% { transform: translate(-85px, 285px) rotate(590deg) scale(1.2); opacity: 0; } }
            @keyframes sparkleBurst6  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 38% { opacity: 1; } 100% { transform: translate(-195px, 235px) rotate(780deg) scale(1.7); opacity: 0; } }
            @keyframes sparkleBurst7  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 0.65; } 28% { opacity: 0.65; } 100% { transform: translate(-270px, 155px) rotate(650deg) scale(2.8); opacity: 0; } }
            @keyframes sparkleBurst8  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 1; } 40% { opacity: 1; } 100% { transform: translate(-310px, 55px) rotate(890deg) scale(2.0); opacity: 0; } }
            @keyframes sparkleBurst9  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.15); opacity: 0; } 1% { opacity: 0.55; } 22% { opacity: 0.55; } 100% { transform: translate(-295px, -40px) rotate(735deg) scale(3.0); opacity: 0; } }
            @keyframes sparkleBurst10 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 54% { opacity: 1; } 100% { transform: translate(-265px, -135px) rotate(810deg) scale(1.3); opacity: 0; } }
            @keyframes sparkleBurst11 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 1; } 42% { opacity: 1; } 100% { transform: translate(-205px, -220px) rotate(670deg) scale(1.8); opacity: 0; } }
            @keyframes sparkleBurst12 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 0.6; } 24% { opacity: 0.6; } 100% { transform: translate(-120px, -285px) rotate(940deg) scale(3.4); opacity: 0; } }
            @keyframes sparkleBurst13 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.1); opacity: 0; } 1% { opacity: 1; } 36% { opacity: 1; } 100% { transform: translate(-20px, -320px) rotate(690deg) scale(2.2); opacity: 0; } }
            @keyframes sparkleBurst14 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.35); opacity: 0; } 1% { opacity: 0.7; } 30% { opacity: 0.7; } 100% { transform: translate(95px, -310px) rotate(820deg) scale(2.6); opacity: 0; } }
            @keyframes sparkleBurst15 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 48% { opacity: 1; } 100% { transform: translate(185px, -265px) rotate(610deg) scale(1.6); opacity: 0; } }
            @keyframes sparkleBurst16 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.15); opacity: 0; } 1% { opacity: 0.55; } 26% { opacity: 0.55; } 100% { transform: translate(275px, -190px) rotate(880deg) scale(3.1); opacity: 0; } }
            @keyframes sparkleBurst17 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 1; } 51% { opacity: 1; } 100% { transform: translate(310px, -105px) rotate(640deg) scale(1.3); opacity: 0; } }
            @keyframes sparkleBurst18 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 0.6; } 32% { opacity: 0.6; } 100% { transform: translate(315px, 35px) rotate(760deg) scale(2.9); opacity: 0; } }
            @keyframes sparkleBurst19 { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 50% { opacity: 1; } 100% { transform: translate(280px, 125px) rotate(900deg) scale(2.0); opacity: 0; } }

            /* Alt sparkle burst animations - identical to above but different names to force restart */
            @keyframes sparkleBurst0Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 45% { opacity: 1; } 100% { transform: translate(320px, -15px) rotate(840deg) scale(1.8); opacity: 0; } }
            @keyframes sparkleBurst1Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 0.6; } 25% { opacity: 0.6; } 100% { transform: translate(265px, 110px) rotate(620deg) scale(2.5); opacity: 0; } }
            @keyframes sparkleBurst2Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.1); opacity: 0; } 1% { opacity: 1; } 35% { opacity: 1; } 100% { transform: translate(195px, 215px) rotate(920deg) scale(2.1); opacity: 0; } }
            @keyframes sparkleBurst3Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 1; } 52% { opacity: 1; } 100% { transform: translate(115px, 280px) rotate(710deg) scale(1.5); opacity: 0; } }
            @keyframes sparkleBurst4Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.15); opacity: 0; } 1% { opacity: 0.5; } 20% { opacity: 0.5; } 100% { transform: translate(25px, 315px) rotate(865deg) scale(3.2); opacity: 0; } }
            @keyframes sparkleBurst5Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.35); opacity: 0; } 1% { opacity: 1; } 47% { opacity: 1; } 100% { transform: translate(-85px, 285px) rotate(590deg) scale(1.2); opacity: 0; } }
            @keyframes sparkleBurst6Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 38% { opacity: 1; } 100% { transform: translate(-195px, 235px) rotate(780deg) scale(1.7); opacity: 0; } }
            @keyframes sparkleBurst7Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 0.65; } 28% { opacity: 0.65; } 100% { transform: translate(-270px, 155px) rotate(650deg) scale(2.8); opacity: 0; } }
            @keyframes sparkleBurst8Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 1; } 40% { opacity: 1; } 100% { transform: translate(-310px, 55px) rotate(890deg) scale(2.0); opacity: 0; } }
            @keyframes sparkleBurst9Alt  { 0% { transform: translate(0, 0) rotate(0deg) scale(0.15); opacity: 0; } 1% { opacity: 0.55; } 22% { opacity: 0.55; } 100% { transform: translate(-295px, -40px) rotate(735deg) scale(3.0); opacity: 0; } }
            @keyframes sparkleBurst10Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 54% { opacity: 1; } 100% { transform: translate(-265px, -135px) rotate(810deg) scale(1.3); opacity: 0; } }
            @keyframes sparkleBurst11Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 1; } 42% { opacity: 1; } 100% { transform: translate(-205px, -220px) rotate(670deg) scale(1.8); opacity: 0; } }
            @keyframes sparkleBurst12Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 0.6; } 24% { opacity: 0.6; } 100% { transform: translate(-120px, -285px) rotate(940deg) scale(3.4); opacity: 0; } }
            @keyframes sparkleBurst13Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.1); opacity: 0; } 1% { opacity: 1; } 36% { opacity: 1; } 100% { transform: translate(-20px, -320px) rotate(690deg) scale(2.2); opacity: 0; } }
            @keyframes sparkleBurst14Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.35); opacity: 0; } 1% { opacity: 0.7; } 30% { opacity: 0.7; } 100% { transform: translate(95px, -310px) rotate(820deg) scale(2.6); opacity: 0; } }
            @keyframes sparkleBurst15Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 48% { opacity: 1; } 100% { transform: translate(185px, -265px) rotate(610deg) scale(1.6); opacity: 0; } }
            @keyframes sparkleBurst16Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.15); opacity: 0; } 1% { opacity: 0.55; } 26% { opacity: 0.55; } 100% { transform: translate(275px, -190px) rotate(880deg) scale(3.1); opacity: 0; } }
            @keyframes sparkleBurst17Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.25); opacity: 0; } 1% { opacity: 1; } 51% { opacity: 1; } 100% { transform: translate(310px, -105px) rotate(640deg) scale(1.3); opacity: 0; } }
            @keyframes sparkleBurst18Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.3); opacity: 0; } 1% { opacity: 0.6; } 32% { opacity: 0.6; } 100% { transform: translate(315px, 35px) rotate(760deg) scale(2.9); opacity: 0; } }
            @keyframes sparkleBurst19Alt { 0% { transform: translate(0, 0) rotate(0deg) scale(0.2); opacity: 0; } 1% { opacity: 1; } 50% { opacity: 1; } 100% { transform: translate(280px, 125px) rotate(900deg) scale(2.0); opacity: 0; } }

            @keyframes slotSpin1 {
              0% {
                transform: translateY(0);
              }
              100% {
                transform: translateY(-3000px);
              }
            }
            @keyframes slotSpin2 {
              0% {
                transform: translateY(0);
              }
              100% {
                transform: translateY(-3000px);
              }
            }
            @keyframes payoutFade0 {
              0% {
                transform: translateY(0);
                opacity: 1;
              }
              85% {
                transform: translateY(0);
                opacity: 1;
              }
              100% {
                transform: translateY(-10px);
                opacity: 0;
              }
            }
            @keyframes payoutFade1 {
              0% {
                transform: translateY(0);
                opacity: 1;
              }
              85% {
                transform: translateY(0);
                opacity: 1;
              }
              100% {
                transform: translateY(-10px);
                opacity: 0;
              }
            }
          `}</style>

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
              padding: "6px 10px",
            }}
          >
            {/* Payout visualization - auto-fades after 3s */}
            {showPayoutAnimationVariant0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                  marginBottom: "6px",
                  animation: "payoutFade0 3.5s ease-out forwards",
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                  padding: "6px 10px",
                  borderRadius: "3px",
                  backdropFilter: "blur(4px)",
                }}
              >
                {payoutDisplay}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                  marginBottom: "6px",
                  animation: "payoutFade1 3.5s ease-out forwards",
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                  padding: "6px 10px",
                  borderRadius: "3px",
                  backdropFilter: "blur(4px)",
                }}
              >
                {payoutDisplay}
              </div>
            )}

            {/* Visual readout: TADA emojis based on generosity level */}
            <div style={{ fontSize: "12px", minHeight: "16px", lineHeight: "1" }}>
              {tadaDisplay}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={decrementGenerosity({ generosity, payoutAnimationCount })}
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
                onClick={incrementGenerosity({ generosity, payoutAnimationCount })}
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
        </ct-screen>
      ),
      currentEmoji,
      isSpinning,
      generosity,
      spinSequence,
      spinCount,
      payoutAnimationCount,
      spinHistory,
    };
  }
);
