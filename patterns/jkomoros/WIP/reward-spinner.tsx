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

interface SpinRecord {
  timestamp: number;
  generosity: number;
  result: string;
}

interface SpinnerInput {
  currentEmoji: Cell<Default<string, "🎁">>;
  isSpinning: Cell<Default<boolean, false>>;
  // Generosity level: 0 = lots of candy (5% hugs), 10 = mostly hugs (99%)
  generosity: Cell<Default<number, 0>>;
  // Sequence of emojis for slot machine animation
  spinSequence: Cell<Default<string[], []>>;
  // Counter to force animation restart
  spinCount: Cell<Default<number, 0>>;
  // Show payout visualization
  showPayouts: Cell<Default<boolean, false>>;
  // History of all spins (timestamp, generosity level, result)
  spinHistory: Cell<Default<SpinRecord[], []>>;
}

interface SpinnerOutput {
  currentEmoji: Cell<Default<string, "🎁">>;
  isSpinning: Cell<Default<boolean, false>>;
  generosity: Cell<Default<number, 0>>;
  spinSequence: Cell<Default<string[], []>>;
  spinCount: Cell<Default<number, 0>>;
  showPayouts: Cell<Default<boolean, false>>;
  spinHistory: Cell<Default<SpinRecord[], []>>;
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
    // Convert generosity (0-10) to weights
    // At 0: lots of candy, At 10: mostly hugs
    const gen = generosity.get();
    const hugWeight = 1 + (gen * 10); // 1 to 101 (high gen = lots of hugs)
    const candyWeight = 11 - gen; // 11 to 1 (high gen = few candy)

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

    // Build slot machine sequence: start with current emoji to avoid visual discontinuity,
    // then random items, then final result at the end
    // Total of 15 items, with final result at position 13 (animation shows positions 0-13)
    // Animation translates -2800px over 15 items of 200px each, ending at position 13 visible
    const sequence: string[] = [];
    for (let i = 0; i < 15; i++) {
      if (i === 0) {
        // First item is current emoji (avoids visual jump)
        sequence.push(currentEmoji.get());
      } else if (i === 13) {
        // Final result at position 13 (will be visible after animation stops)
        sequence.push(finalEmoji);
      } else {
        // Random prize
        const randomPrize = prizeOptions[Math.floor(Math.random() * prizeOptions.length)];
        sequence.push(randomPrize.emoji);
      }
    }

    // Update the final emoji after building sequence
    currentEmoji.set(finalEmoji);

    // Set the sequence to trigger animation
    spinSequence.set(sequence);
    spinCount.set(spinCount.get() + 1);

    // Clear the sequence after animation completes (6s) to show static display
    setTimeout(() => {
      spinSequence.set([]);
    }, 6000);

    // Record this spin in history
    const history = spinHistory.get();
    const newRecord: SpinRecord = {
      timestamp: Date.now(),
      generosity: gen,
      result: finalEmoji,
    };
    spinHistory.set([...history, newRecord]);
  }
);

const decrementGenerosity = handler<
  unknown,
  { generosity: Cell<number>; showPayouts: Cell<boolean> }
>(
  (_, { generosity, showPayouts }) => {
    const current = generosity.get();
    if (current > 0) {
      generosity.set(current - 1);
      showPayouts.set(true);
      setTimeout(() => showPayouts.set(false), 2000);
    }
  }
);

const incrementGenerosity = handler<
  unknown,
  { generosity: Cell<number>; showPayouts: Cell<boolean> }
>(
  (_, { generosity, showPayouts }) => {
    const current = generosity.get();
    if (current < 10) {
      generosity.set(current + 1);
      showPayouts.set(true);
      setTimeout(() => showPayouts.set(false), 2000);
    }
  }
);

const closePayouts = handler<
  unknown,
  { showPayouts: Cell<boolean> }
>(
  (_, { showPayouts }) => {
    showPayouts.set(false);
  }
);

export default recipe<SpinnerInput, SpinnerOutput>(
  "Reward Spinner",
  ({ currentEmoji, isSpinning, generosity, spinSequence, spinCount, showPayouts, spinHistory }) => {
    // Compute the TADA emoji display from generosity level (0-10 emojis, one per level)
    const tadaDisplay = computed(() =>
      "🎉".repeat(generosity.get())
    );

    // Compute whether buttons should be disabled
    const minusDisabled = computed(() => generosity.get() <= 0);
    const plusDisabled = computed(() => generosity.get() >= 10);

    // Check if spinCount is even or odd to alternate animations
    const isEvenSpin = computed(() => spinCount.get() % 2 === 0);

    // Calculate payout percentages
    const payoutPercentages = computed(() => {
      const gen = generosity.get();
      const hugWeight = 1 + (gen * 10); // 1 to 101 (high gen = lots of hugs)
      const candyWeight = 11 - gen; // 11 to 1 (high gen = few candy)
      const weightThreeBeans = candyWeight * 0.45;
      const weightOneBean = candyWeight * 0.55;
      const totalWeight = weightThreeBeans + weightOneBean + hugWeight;

      return [
        { emoji: "🍬🍬🍬", percent: (weightThreeBeans / totalWeight) * 100 },
        { emoji: "🍬", percent: (weightOneBean / totalWeight) * 100 },
        { emoji: "🤗", percent: (hugWeight / totalWeight) * 100 },
      ];
    });

    // Check if current emoji is three candies (for special rendering)
    const isThreeCandies = computed(() => currentEmoji.get() === "🍬🍬🍬");

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
          {/* Wrapper for emoji and sparkles */}
          <div style={{ position: "relative" }}>
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
                width: "min(300px, 90vw)",
                height: "200px",
                overflow: "hidden",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                maskImage: "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
                cursor: "pointer",
                transform: "scale(1.8)",
              }}
            >
            {spinSequence.get().length > 0 ? (
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
                    fontSize: "150px",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                  }}>{currentEmoji}</span>
                )}
              </div>
            )}
            </div>

            {/* Sparkle Burst - alternates between two animation sets to restart on each spin */}
            {spinCount.get() > 0 && (
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
            @keyframes slideUp {
              0% {
                transform: translateY(20px);
                opacity: 0;
              }
              100% {
                transform: translateY(0);
                opacity: 1;
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
              spinHistory,
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
            {/* Payout visualization - appears above TADA */}
            {showPayouts ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                  marginBottom: "6px",
                  animation: "slideUp 0.3s ease-out",
                  position: "relative",
                }}
              >
                {/* Close button */}
                <button
                  onClick={closePayouts({ showPayouts })}
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "-8px",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "white",
                    fontSize: "10px",
                    lineHeight: "1",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0",
                    color: "#64748b",
                  }}
                >
                  ×
                </button>

                {payoutPercentages.map((prize, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "10px",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>{prize.emoji}</span>
                    <div
                      style={{
                        width: "100px",
                        height: "12px",
                        backgroundColor: "#e2e8f0",
                        borderRadius: "2px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${prize.percent}%`,
                          height: "100%",
                          backgroundColor: i === 2 ? "#f87171" : "#4ade80",
                          transition: "width 0.3s ease-out",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "9px", minWidth: "30px" }}>
                      {Math.round(prize.percent)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Visual readout: TADA emojis based on generosity level */}
            <div style={{ fontSize: "12px", minHeight: "16px", lineHeight: "1" }}>
              {tadaDisplay}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={decrementGenerosity({ generosity, showPayouts })}
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
                onClick={incrementGenerosity({ generosity, showPayouts })}
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
      showPayouts,
      spinHistory,
    };
  }
);
