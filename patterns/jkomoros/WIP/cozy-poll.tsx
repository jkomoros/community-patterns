/// <cts-enable />
import { Cell, cell, Default, derive, handler, ifElse, lift, NAME, navigateTo, OpaqueRef, pattern, str, toSchema, UI } from "commontools";
import CozyPollBallot from "./cozy-poll-ballot.tsx";
import CozyPollLobby from "./cozy-poll-lobby.tsx";

/**
 * Cozy Poll Pattern
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

interface VoterCharmRef {
  id: string;
  charm: any;
  voterName: string;
}

interface PollInput {
  question: Cell<Default<string, "">>;
  options: Cell<Default<Option[], []>>;
  votes: Cell<Default<Vote[], []>>;
  voterCharms: Cell<Default<VoterCharmRef[], []>>;
  nextOptionId: Cell<Default<number, 1>>;
}

interface PollOutput {
  question: Cell<Default<string, "">>;
  options: Cell<Default<Option[], []>>;
  votes: Cell<Default<Vote[], []>>;
  voterCharms: Cell<Default<VoterCharmRef[], []>>;
  nextOptionId: Cell<Default<number, 1>>;
}

// Lift function to store voter charm instance
const storeVoter = lift(
  toSchema<{
    charm: any;
    voterCharms: Cell<VoterCharmRef[]>;
    isInitialized: Cell<boolean>;
  }>(),
  undefined,
  ({ charm, voterCharms, isInitialized }) => {
    if (!isInitialized.get()) {
      console.log("storeVoter: storing voter charm");

      // Generate random ID for this voter
      const randomId = Math.random().toString(36).substring(2, 10);
      voterCharms.push({
        id: randomId,
        charm,
        voterName: "(pending)",  // Will be updated when voter enters their name
      });

      isInitialized.set(true);
      return charm;
    } else {
      console.log("storeVoter: already initialized");
    }
    return undefined;
  },
);

// Handler to create a new voter charm (DEPRECATED - use viewer instead)
const createVoter = handler<
  unknown,
  {
    question: Cell<string>;
    options: Cell<Option[]>;
    votes: Cell<Vote[]>;
    voterCharms: Cell<VoterCharmRef[]>;
  }
>(
  (_, { question, options, votes, voterCharms }) => {
    console.log("Creating new Voter charm...");

    // Create the voter instance with cell references
    const isInitialized = cell(false);
    const voterInstance = CozyPollBallot({
      question: question.get(),  // Pass as plain value
      options,  // Pass as cell reference (shared)
      votes,    // Pass as cell reference (shared)
      myName: Cell.of(""),  // New local cell for this voter
    });

    console.log("Voter created, storing with lift...");

    // Store the voter instance and navigate to it
    const storedCharm = storeVoter({
      charm: voterInstance,
      voterCharms: voterCharms as unknown as OpaqueRef<VoterCharmRef[]>,
      isInitialized: isInitialized as unknown as Cell<boolean>,
    });

    console.log("Navigating to voter charm...");

    // Navigate the user to their new voter charm
    return navigateTo(storedCharm || voterInstance);
  },
);

// Handler to create the public viewer charm (poll lobby)
const createViewer = handler<
  unknown,
  {
    question: Cell<string>;
    options: Cell<Option[]>;
    votes: Cell<Vote[]>;
    voterCharms: Cell<VoterCharmRef[]>;
  }
>(
  (_, { question, options, votes, voterCharms }) => {
    console.log("Creating Viewer charm (public lobby)...");

    // Create the viewer instance with cell references
    const viewerInstance = CozyPollLobby({
      question: question.get(),  // Pass as plain value
      options,  // Pass as cell reference (shared)
      votes,    // Pass as cell reference (shared)
      voterCharms,  // Pass as cell reference (shared)
    });

    console.log("Viewer created, navigating...");

    // Navigate to the viewer charm
    return navigateTo(viewerInstance);
  },
);

export default pattern<PollInput, PollOutput>(
  ({ question, options, votes, voterCharms, nextOptionId }) => {

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


    return {
      [NAME]: ifElse(
        derive(question, (q: string) => q && q.trim().length > 0),
        str`Poll - ${question}`,
        str`Poll`
      ),
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1rem" }}>Cozy Poll</h2>

          {/* Question Input */}
          <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#fef3c7", borderRadius: "4px", border: "1px solid #fde68a" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: "600", marginBottom: "0.5rem", color: "#92400e" }}>
              Poll Question: <strong style={{ fontSize: "1rem", color: "#78350f" }}>{question || "(not set)"}</strong>
            </div>
            <ct-message-input
              placeholder="Enter poll question (e.g., Where should we go for lunch?)..."
              onct-send={(e: { detail: { message: string } }) => {
                const q = e.detail?.message?.trim();
                if (q) {
                  question.set(q);
                }
              }}
            />
          </div>

          {/* Create Public Lobby Button */}
          <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "#dbeafe", borderRadius: "8px", border: "2px solid #3b82f6" }}>
            <div style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem", color: "#1e40af" }}>
              📢 Share Your Poll
            </div>
            <div style={{ fontSize: "0.875rem", marginBottom: "0.75rem", color: "#1e3a8a" }}>
              Create a public lobby page where your team can enter their names and vote. Share that URL with your team.
            </div>
            <ct-button
              onClick={createViewer({
                question,
                options,
                votes,
                voterCharms: voterCharms as unknown as OpaqueRef<VoterCharmRef[]>,
              })}
              style="background-color: #3b82f6; color: white; font-weight: 600; font-size: 1rem; padding: 0.75rem 1.5rem;"
            >
              🚀 Create Public Lobby
            </ct-button>
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

          {/* Admin Controls */}
          <div style={{
            marginTop: "2rem",
            paddingTop: "1rem",
            borderTop: "1px solid #e5e7eb"
          }}>
            <div style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              color: "#6b7280",
              marginBottom: "0.75rem"
            }}>
              Admin Controls
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <ct-button
                onClick={() => {
                  votes.set([]);
                }}
              >
                Reset Votes
              </ct-button>
              <ct-button
                onClick={() => {
                  options.set([]);
                  votes.set([]);
                }}
              >
                Clear All Options
              </ct-button>
            </div>
          </div>
        </div>
      ),
      question,
      options,
      votes,
      voterCharms,
      nextOptionId,
    };
  }
);
