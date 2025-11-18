/// <cts-enable />
import { Cell, Default, derive, NAME, pattern, UI } from "commontools";

/**
 * Group Voter Pattern
 *
 * A collaborative voting system for small groups to make decisions together.
 * Each person can vote Green (LOVE IT), Yellow (CAN LIVE WITH IT), or Red (CAN'T LIVE WITH IT).
 *
 * Winning option: Fewest reds (minimize opposition), then most greens (maximize enthusiasm)
 */

interface Option {
  id: string;
  title: string;
}

interface Vote {
  voterName: string;
  optionId: string;
  voteType: "green" | "yellow" | "red";
}

interface PollInput {
  options: Cell<Default<Option[], []>>;
  votes: Cell<Default<Vote[], []>>;
  nextOptionId: Cell<Default<number, 1>>;
}

interface PollOutput {
  options: Cell<Default<Option[], []>>;
  votes: Cell<Default<Vote[], []>>;
  nextOptionId: Cell<Default<number, 1>>;
}

export default pattern<PollInput, PollOutput>(
  ({ options, votes, nextOptionId }) => {
    // Local state (hardcoded name for testing)
    const myName = "Alice";

    // Derived: Organize all votes by option ID and vote type
    const votesByOption = derive(votes, (allVotes: Vote[]) => {
      const organized: Record<string, { green: string[], yellow: string[], red: string[] }> = {};

      for (const vote of allVotes) {
        if (!organized[vote.optionId]) {
          organized[vote.optionId] = { green: [], yellow: [], red: [] };
        }
        organized[vote.optionId][vote.voteType].push(vote.voterName);
      }

      return organized;
    });

    // Derived: Ranked options (fewest reds, then most greens)
    const rankedOptions = derive({ votes, options }, ({ votes: allVotes, options: currentOptions }: { votes: Vote[], options: Option[] }) => {
      // Count votes for each option
      const voteCounts = currentOptions.map(option => {
        const optionVotes = allVotes.filter(v => v.optionId === option.id);
        const reds = optionVotes.filter(v => v.voteType === "red").length;
        const greens = optionVotes.filter(v => v.voteType === "green").length;
        const yellows = optionVotes.filter(v => v.voteType === "yellow").length;

        return { option, reds, greens, yellows, totalVotes: optionVotes.length };
      });

      // Sort: fewest reds (ascending), then most greens (descending)
      return voteCounts.sort((a, b) => {
        if (a.reds !== b.reds) {
          return a.reds - b.reds; // Fewer reds is better
        }
        return b.greens - a.greens; // More greens is better
      });
    });

    return {
      [NAME]: "Group Voter",
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1rem" }}>Group Decision Maker</h2>

          <div style={{ fontSize: "0.875rem", color: "#666", marginBottom: "1rem", textAlign: "right" }}>
            Voting as: <strong>{myName}</strong>
          </div>

          {/* Top Choice Display */}
          {rankedOptions.length > 0 && rankedOptions[0].totalVotes > 0 && (
            <div style={{
              padding: "1rem",
              marginBottom: "1.5rem",
              border: "2px solid #10b981",
              borderRadius: "8px",
              backgroundColor: "#ecfdf5",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.5rem" }}>🏆</span>
                <span style={{ fontWeight: "600", fontSize: "1.125rem" }}>TOP CHOICE</span>
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "0.5rem" }}>
                {rankedOptions[0].option.title}
              </div>
              <div style={{ fontSize: "0.875rem", color: "#059669" }}>
                {rankedOptions[0].greens > 0 && <span>{rankedOptions[0].greens} love it</span>}
                {rankedOptions[0].greens > 0 && rankedOptions[0].yellows > 0 && <span>, </span>}
                {rankedOptions[0].yellows > 0 && <span>{rankedOptions[0].yellows} okay with it</span>}
                {(rankedOptions[0].greens > 0 || rankedOptions[0].yellows > 0) && rankedOptions[0].reds > 0 && <span>, </span>}
                {rankedOptions[0].reds > 0 && <span style={{ color: "#dc2626" }}>{rankedOptions[0].reds} can't accept</span>}
              </div>
            </div>
          )}

          {/* Options List */}
          <div style={{ marginBottom: "1rem" }}>
            {options.map((option) => (
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    backgroundColor: "#f9f9f9",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "500", marginBottom: "0.25rem" }}>
                      {option.title}
                    </div>

                    {/* Vote dots display */}
                    {votesByOption[option.id] && (
                      <div style={{ display: "flex", gap: "0.25rem", fontSize: "0.75rem", flexWrap: "wrap" }}>
                        {votesByOption[option.id].green.map((voterName) => (
                          <span style={{
                            backgroundColor: "#22c55e",
                            color: "white",
                            padding: "0.125rem 0.375rem",
                            borderRadius: "9999px",
                            fontWeight: "600"
                          }}>
                            {voterName}
                          </span>
                        ))}
                        {votesByOption[option.id].yellow.map((voterName) => (
                          <span style={{
                            backgroundColor: "#eab308",
                            color: "white",
                            padding: "0.125rem 0.375rem",
                            borderRadius: "9999px",
                            fontWeight: "600"
                          }}>
                            {voterName}
                          </span>
                        ))}
                        {votesByOption[option.id].red.map((voterName) => (
                          <span style={{
                            backgroundColor: "#ef4444",
                            color: "white",
                            padding: "0.125rem 0.375rem",
                            borderRadius: "9999px",
                            fontWeight: "600"
                          }}>
                            {voterName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  <ct-button
                    onClick={() => {
                      const current = options.get();
                      const index = current.findIndex((el) => Cell.equals(option, el));
                      if (index >= 0) {
                        options.set(current.toSpliced(index, 1));
                      }
                    }}
                  >
                    Remove
                  </ct-button>

                  {/* Vote buttons */}
                  <ct-button onClick={() => {
                    const allVotes = votes.get();
                    const filtered = allVotes.filter(v => !(v.voterName === myName && v.optionId === option.id));
                    votes.set([...filtered, { voterName: myName, optionId: option.id, voteType: "green" }]);
                  }}>
                    🟢
                  </ct-button>
                  <ct-button onClick={() => {
                    const allVotes = votes.get();
                    const filtered = allVotes.filter(v => !(v.voterName === myName && v.optionId === option.id));
                    votes.set([...filtered, { voterName: myName, optionId: option.id, voteType: "yellow" }]);
                  }}>
                    🟡
                  </ct-button>
                  <ct-button onClick={() => {
                    const allVotes = votes.get();
                    const filtered = allVotes.filter(v => !(v.voterName === myName && v.optionId === option.id));
                    votes.set([...filtered, { voterName: myName, optionId: option.id, voteType: "red" }]);
                  }}>
                    🔴
                  </ct-button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Option */}
          <ct-message-input
            placeholder="Add an option (e.g., restaurant name)..."
            onct-send={(e: { detail: { message: string } }) => {
              const title = e.detail?.message?.trim();
              if (title) {
                const currentId = nextOptionId.get();
                const newOption: Option = {
                  id: `option-${currentId}`,
                  title,
                };
                options.push(newOption);
                nextOptionId.set(currentId + 1);
              }
            }}
          />
        </div>
      ),
      options,
      votes,
      nextOptionId,
    };
  }
);
