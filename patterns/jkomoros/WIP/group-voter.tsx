/// <cts-enable />
import { Cell, computed, Default, NAME, pattern, UI } from "commontools";

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

    return {
      [NAME]: "Group Voter",
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1rem" }}>Group Decision Maker</h2>

          <div style={{ fontSize: "0.875rem", color: "#666", marginBottom: "1rem", textAlign: "right" }}>
            Voting as: <strong>{myName}</strong>
          </div>

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
                  <span style={{ flex: 1, fontWeight: "500" }}>
                    {option.title}
                  </span>

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
