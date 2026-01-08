/// <cts-enable />
import { computed, Default, handler, NAME, navigateTo, pattern, str, UI, Writable } from "commontools";
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
  options: Writable<Default<Option[], []>>;
  votes: Writable<Default<Vote[], []>>;
  voterCharms: Writable<Default<VoterCharmRef[], []>>;
}

/** Public poll lobby with live results. #cozyPollLobby */
interface ViewerOutput {
  question: Default<string, "">;
  options: Writable<Default<Option[], []>>;
  votes: Writable<Default<Vote[], []>>;
  voterCharms: Writable<Default<VoterCharmRef[], []>>;
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

// Handler to create a new voter ballot charm
const createBallot = handler<
  {},
  {
    question: string;
    options: Writable<Option[]>;
    votes: Writable<Vote[]>;
    voterCharms: Writable<VoterCharmRef[]>;
  }
>(
  (_event, { question, options, votes, voterCharms }) => {
    console.log("[Handler] Creating new voter ballot...");

    // Create new voter charm with empty name
    // Voter will be prompted to enter their name in the ballot
    const voterInstance = CozyPollBallot({
      question: question,
      options,
      votes,
      voterCharms,
      myName: Writable.of(""),  // Empty name - voter will fill it in
    });

    console.log("[Handler] Navigating to voter ballot...");
    console.log("[Handler] Note: Bookmark your ballot URL to return later");

    return navigateTo(voterInstance);
  }
);

export default pattern<ViewerInput, ViewerOutput>(
  ({ question, options, votes, voterCharms }) => {

    // Derived: Organize all votes by option ID and vote type
    const votesByOption = computed(() => {
      const organized: Record<string, { green: string[], yellow: string[], red: string[] }> = {};
      const allVotes = votes.get();

      for (const vote of allVotes) {
        if (!organized[vote.optionId]) {
          organized[vote.optionId] = { green: [], yellow: [], red: [] };
        }
        organized[vote.optionId][vote.voteType].push(vote.voterName);
      }

      return organized;
    });

    // Derived: Ranked options (fewest reds, then most greens)
    const rankedOptions = computed(() => {
      const allVotes = votes.get();
      const currentOptions = options.get();
      const voteCounts = currentOptions.map(option => {
        const optionVotes = allVotes.filter(v => v.optionId === option.id);
        const reds = optionVotes.filter(v => v.voteType === "red").length;
        const greens = optionVotes.filter(v => v.voteType === "green").length;
        const yellows = optionVotes.filter(v => v.voteType === "yellow").length;

        // Extract plain values to avoid reactive proxy in render
        return { option: { id: option.id, title: option.title }, reds, greens, yellows, totalVotes: optionVotes.length };
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
          {computed(() => {
            const ranked = rankedOptions;
            if (!ranked || ranked.length === 0 || ranked[0].totalVotes === 0) return null;
            const top = ranked[0];
            const parts: string[] = [];
            if (top.greens > 0) parts.push(`${top.greens} love it`);
            if (top.yellows > 0) parts.push(`${top.yellows} okay with it`);
            if (top.reds > 0) parts.push(`${top.reds} can't accept`);
            return (
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
                  {top.option.title}
                </div>
                <div style={{ fontSize: "0.875rem", color: top.reds > 0 ? "#dc2626" : "#059669" }}>
                  {parts.join(", ")}
                </div>
              </div>
            );
          })}

          {/* Summary View - All Options */}
          {computed(() => {
            const ranked = rankedOptions;
            const votesData = votesByOption;
            if (!ranked || ranked.length === 0) return null;
            return (
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
                {ranked.map((item) => (
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
                      {item.option.title}
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem", fontSize: "0.75rem", flexWrap: "wrap" }}>
                      {votesData[item.option.id]?.green?.map((voterName: string) => (
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
                      {votesData[item.option.id]?.yellow?.map((voterName: string) => (
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
                      {votesData[item.option.id]?.red?.map((voterName: string) => (
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
            );
          })}

          {/* Create Ballot - Prominent Call to Action */}
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
              Create your personal ballot and enter your name. Bookmark your ballot URL to return later!
            </div>
            <ct-button
              style="background-color: #3b82f6; color: white; font-weight: 600; padding: 0.75rem 1.5rem; font-size: 1rem; border-radius: 6px;"
              onClick={createBallot({ question, options, votes, voterCharms })}
            >
              Create My Ballot
            </ct-button>
          </div>

          <div style={{ padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "4px", fontSize: "0.875rem", color: "#78350f", textAlign: "center" }}>
            <strong>Poll Lobby:</strong> Click the button above to create your personal ballot and vote. Results update in real-time.
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
