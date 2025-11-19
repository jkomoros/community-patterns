/// <cts-enable />
import { Cell, Default, derive, ifElse, NAME, pattern, str, UI } from "commontools";

/**
 * Group Voter View Pattern
 *
 * Voter interface for collaborative voting system.
 * Receives shared poll data (options, votes) via cell references from admin pattern.
 * Each voter has their own local name stored in myName cell.
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

interface VoterInput {
  question: Default<string, "">;            // Read-only from admin
  options: Cell<Default<Option[], []>>;     // Shared from admin
  votes: Cell<Default<Vote[], []>>;         // Shared from admin
  myName: Cell<Default<string, "">>;        // Local to this voter
}

interface VoterOutput {
  myName: Cell<Default<string, "">>;
}

export default pattern<VoterInput, VoterOutput>(
  ({ question, options, votes, myName }) => {

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

    // Derived: Map option IDs to their rank numbers
    const optionRanks = derive({ votes, options }, ({ votes: allVotes, options: currentOptions }: { votes: Vote[], options: Option[] }) => {
      // Count votes for each option
      const voteCounts = currentOptions.map(option => {
        const optionVotes = allVotes.filter(v => v.optionId === option.id);
        const reds = optionVotes.filter(v => v.voteType === "red").length;
        const greens = optionVotes.filter(v => v.voteType === "green").length;

        return { option, reds, greens };
      });

      // Sort same way as rankedOptions
      const sorted = voteCounts.sort((a, b) => {
        if (a.reds !== b.reds) {
          return a.reds - b.reds;
        }
        return b.greens - a.greens;
      });

      // Create map of option ID to rank (1-indexed)
      const ranks: Record<string, number> = {};
      sorted.forEach((item, index) => {
        ranks[item.option.id] = index + 1;
      });

      return ranks;
    });

    // Derived: Map option IDs to current user's vote
    const myVoteByOption = derive({ votes, myName }, ({ votes: allVotes, myName: currentName }: { votes: Vote[], myName: string }) => {
      const myVotes: Record<string, "green" | "yellow" | "red"> = {};

      for (const vote of allVotes) {
        if (vote.voterName === currentName) {
          myVotes[vote.optionId] = vote.voteType;
        }
      }

      return myVotes;
    });

    return {
      [NAME]: ifElse(
        derive(myName, (n: string) => n && n.trim().length > 0),
        str`${myName} - ${question} - Voter`,
        str`${question} - Voter`
      ),
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1rem" }}>
            {question || "Group Decision Maker"}
          </h2>

          {/* Name Entry/Display */}
          <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#f0f9ff", borderRadius: "4px", border: "1px solid #bae6fd" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: "600", marginBottom: "0.5rem", color: "#0369a1" }}>
              Voting as: <strong style={{ fontSize: "1rem", color: "#0c4a6e" }}>{myName || "(not set)"}</strong>
            </div>
            <ct-message-input
              placeholder="Enter your name to start voting..."
              onct-send={(e: { detail: { message: string } }) => {
                const name = e.detail?.message?.trim();
                if (name) {
                  myName.set(name);
                }
              }}
            />
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

          {/* Summary View - All Options */}
          {rankedOptions.length > 0 && (
            <div style={{
              marginBottom: "1.5rem",
              padding: "1rem",
              backgroundColor: "#f9fafb",
              borderRadius: "8px",
              border: "1px solid #e5e7eb"
            }}>
              <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6b7280", marginBottom: "0.75rem" }}>
                ALL OPTIONS
              </div>
              {rankedOptions.map((ranked) => (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem",
                  marginBottom: "0.25rem",
                  backgroundColor: "white",
                  borderRadius: "4px",
                  border: "1px solid #e5e7eb"
                }}>
                  <div style={{ flex: 1, fontWeight: "500", fontSize: "0.875rem" }}>
                    {ranked.option.title}
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem", fontSize: "0.75rem", flexWrap: "wrap" }}>
                    {votesByOption[ranked.option.id]?.green?.map((voterName) => (
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
                    {votesByOption[ranked.option.id]?.yellow?.map((voterName) => (
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
                    {votesByOption[ranked.option.id]?.red?.map((voterName) => (
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
                </div>
              ))}
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
                    <div style={{ fontWeight: "500", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>{option.title}</span>
                      {optionRanks[option.id] && (
                        <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: "600" }}>
                          [RANK {optionRanks[option.id]}]
                        </span>
                      )}
                    </div>

                    {/* Vote dots display */}
                    {votesByOption[option.id] && (
                      <div style={{ display: "flex", gap: "0.25rem", fontSize: "0.75rem", flexWrap: "wrap" }}>
                        {votesByOption[option.id]?.green?.map((voterName) => (
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
                        {votesByOption[option.id]?.yellow?.map((voterName) => (
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
                        {votesByOption[option.id]?.red?.map((voterName) => (
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

                  {/* Vote buttons */}
                  <ct-button
                    style={myVoteByOption[option.id] === "green" ? "background-color: #22c55e; color: white; font-weight: bold;" : ""}
                    onClick={() => {
                      const currentName = myName.get();
                      const allVotes = votes.get();
                      const filtered = allVotes.filter(v => !(v.voterName === currentName && v.optionId === option.id));
                      votes.set([...filtered, { voterName: currentName, optionId: option.id, voteType: "green" }]);
                    }}
                  >
                    🟢
                  </ct-button>
                  <ct-button
                    style={myVoteByOption[option.id] === "yellow" ? "background-color: #eab308; color: white; font-weight: bold;" : ""}
                    onClick={() => {
                      const currentName = myName.get();
                      const allVotes = votes.get();
                      const filtered = allVotes.filter(v => !(v.voterName === currentName && v.optionId === option.id));
                      votes.set([...filtered, { voterName: currentName, optionId: option.id, voteType: "yellow" }]);
                    }}
                  >
                    🟡
                  </ct-button>
                  <ct-button
                    style={myVoteByOption[option.id] === "red" ? "background-color: #ef4444; color: white; font-weight: bold;" : ""}
                    onClick={() => {
                      const currentName = myName.get();
                      const allVotes = votes.get();
                      const filtered = allVotes.filter(v => !(v.voterName === currentName && v.optionId === option.id));
                      votes.set([...filtered, { voterName: currentName, optionId: option.id, voteType: "red" }]);
                    }}
                  >
                    🔴
                  </ct-button>
                  <ct-button onClick={() => {
                    const currentName = myName.get();
                    const allVotes = votes.get();
                    const filtered = allVotes.filter(v => !(v.voterName === currentName && v.optionId === option.id));
                    votes.set(filtered);
                  }}>
                    Clear
                  </ct-button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "4px", fontSize: "0.875rem", color: "#78350f" }}>
            <strong>Voter View:</strong> You can vote on options. The poll admin manages options and controls.
          </div>
        </div>
      ),
      myName,
    };
  }
);
