/// <cts-enable />
import { cell, Cell, Default, derive, handler, NAME, navigateTo, OpaqueRef, pattern, str, UI } from "commontools";
import CozyPollBallot from "./cozy-poll-ballot.tsx";

/**
 * Cozy Poll Lobby Pattern
 *
 * This is the PUBLIC URL that the admin shares with the team.
 * - Shows poll question and live results (read-only)
 * - Prompts for name entry
 * - Creates or navigates to voter charm based on name
 * - No admin controls visible
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
  voterName: string;
  charm: any;
}

interface ViewerInput {
  question: Default<string, "">;
  options: Cell<Default<Option[], []>>;
  votes: Cell<Default<Vote[], []>>;
  voterCharms: Cell<Default<VoterCharmRef[], []>>;
}

interface ViewerOutput {
  question: Default<string, "">;
  options: Cell<Default<Option[], []>>;
  votes: Cell<Default<Vote[], []>>;
  voterCharms: Cell<Default<VoterCharmRef[], []>>;
}

// Utility function to get initials from a name
function getInitials(name: string): string {
  if (!name || typeof name !== 'string') return '?';
  return name
    .trim()
    .split(/\s+/)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 3); // Max 3 initials
}

// Handler to find or create voter charm
const findOrCreateVoter = handler<
  { detail: { message: string } },
  {
    question: string;
    options: Cell<Option[]>;
    votes: Cell<Vote[]>;
    voterCharms: Cell<VoterCharmRef[]>;
  }
>(
  (event, { question, options, votes, voterCharms }) => {
    const name = event.detail?.message?.trim();

    if (!name) {
      console.log("[Handler] No name provided");
      return;
    }

    console.log(`[Handler] Finding or creating voter charm for: ${name}`);

    console.log(`[Handler] Creating voter charm for ${name}...`);

    // Create new voter charm with name pre-filled
    const voterInstance = CozyPollBallot({
      question: question,  // Already a plain value
      options,
      votes,
      voterCharms,
      myName: Cell.of(name),  // Pre-populate the name
    });

    console.log(`[Handler] Navigating to voter charm...`);
    console.log(`[Handler] Note: Use browser back button to return to lobby`);

    // Navigate directly - this works!
    // Note: We can't track/store voter charms during handler execution
    // as it blocks navigation. Users should bookmark their voter URLs.
    return navigateTo(voterInstance);
  }
);

export default pattern<ViewerInput, ViewerOutput>(
  ({ question, options, votes, voterCharms }) => {

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
      const voteCounts = currentOptions.map(option => {
        const optionVotes = allVotes.filter(v => v.optionId === option.id);
        const reds = optionVotes.filter(v => v.voteType === "red").length;
        const greens = optionVotes.filter(v => v.voteType === "green").length;
        const yellows = optionVotes.filter(v => v.voteType === "yellow").length;

        return { option, reds, greens, yellows, totalVotes: optionVotes.length };
      });

      return voteCounts.sort((a, b) => {
        if (a.reds !== b.reds) {
          return a.reds - b.reds;
        }
        return b.greens - a.greens;
      });
    });

    // Create output object
    return {
      [NAME]: str`Poll Lobby - ${question}`,
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1rem", textAlign: "center" }}>
            {question || "Cozy Poll"}
          </h2>

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
                      <span
                        title={voterName}
                        style={{
                          backgroundColor: "#22c55e",
                          color: "white",
                          padding: "0.125rem 0.375rem",
                          borderRadius: "9999px",
                          fontWeight: "600",
                          cursor: "default"
                        }}>
                        {getInitials(voterName)}
                      </span>
                    ))}
                    {votesByOption[ranked.option.id]?.yellow?.map((voterName) => (
                      <span
                        title={voterName}
                        style={{
                          backgroundColor: "#eab308",
                          color: "white",
                          padding: "0.125rem 0.375rem",
                          borderRadius: "9999px",
                          fontWeight: "600",
                          cursor: "default"
                        }}>
                        {getInitials(voterName)}
                      </span>
                    ))}
                    {votesByOption[ranked.option.id]?.red?.map((voterName) => (
                      <span
                        title={voterName}
                        style={{
                          backgroundColor: "#ef4444",
                          color: "white",
                          padding: "0.125rem 0.375rem",
                          borderRadius: "9999px",
                          fontWeight: "600",
                          cursor: "default"
                        }}>
                        {getInitials(voterName)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Name Entry - Prominent Call to Action */}
          <div style={{
            marginBottom: "2rem",
            padding: "1.5rem",
            backgroundColor: "#dbeafe",
            borderRadius: "8px",
            border: "2px solid #3b82f6",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "0.75rem", color: "#1e40af" }}>
              Ready to vote?
            </div>
            <div style={{ fontSize: "0.875rem", marginBottom: "1rem", color: "#1e3a8a" }}>
              Enter your name to create your personal ballot. Bookmark the page to return later!
            </div>
            <ct-message-input
              placeholder="Your name..."
              button-text="Join Poll"
              onct-send={findOrCreateVoter({ question, options, votes, voterCharms })}
            />
          </div>

          <div style={{ padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "4px", fontSize: "0.875rem", color: "#78350f", textAlign: "center" }}>
            <strong>Poll Lobby:</strong> Enter your name below to cast your vote. Results update in real-time.
          </div>
        </div>
      ),
      question,
      options,
      votes,
      voterCharms,
    };
  }
);
