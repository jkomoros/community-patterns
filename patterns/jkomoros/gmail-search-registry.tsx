/// <cts-enable />
/**
 * Gmail Search Registry - Community Query Database
 *
 * A centralized registry for sharing effective Gmail search queries across users.
 * This pattern should be deployed to a well-known space (community-patterns-shared)
 * and tagged with #gmailSearchRegistry for discovery via wish().
 *
 * Architecture:
 * - Each agent type (identified by GitHub raw URL) has its own section
 * - Users can submit queries after PII/generalizability screening
 * - Queries can be upvoted/downvoted by other users
 *
 * Setup:
 * 1. Deploy to space: community-patterns-shared
 * 2. Favorite the charm with tag: #gmailSearchRegistry
 * 3. Other gmail-agent patterns discover via: wish({ query: "#gmailSearchRegistry" })
 *
 * TODO: Future framework enhancement will support wish() without requiring favorites
 */
import {
  cell,
  Cell,
  Default,
  derive,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

// ============================================================================
// TYPES
// ============================================================================

// A shared query in the registry
export interface SharedQuery {
  id: string;                    // Unique ID
  query: string;                 // The Gmail search string
  description?: string;          // Why it works / what it finds
  submittedBy?: string;          // Optional: user identifier
  submittedAt: number;           // Timestamp
  upvotes: number;               // Community validation count
  downvotes: number;             // Reports of ineffectiveness
  lastValidated?: number;        // Last time someone confirmed it works
}

// Registry for a specific agent type
export interface AgentTypeRegistry {
  agentTypeUrl: string;          // GitHub raw URL to pattern file
  agentTypeName?: string;        // Human-readable name (extracted from URL or provided)
  queries: SharedQuery[];
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

export interface GmailSearchRegistryInput {
  // All registries keyed by agentTypeUrl
  registries?: Default<Record<string, AgentTypeRegistry>, {}>;
}

export interface GmailSearchRegistryOutput {
  [NAME]: string;
  [UI]: JSX.Element;

  // Data
  registries: Record<string, AgentTypeRegistry>;

  // Actions for external patterns to use
  submitQuery: ReturnType<typeof handler>;
  upvoteQuery: ReturnType<typeof handler>;
  downvoteQuery: ReturnType<typeof handler>;
  getQueriesForAgent: (agentTypeUrl: string) => SharedQuery[];
}

// ============================================================================
// PATTERN
// ============================================================================

const GmailSearchRegistry = pattern<
  GmailSearchRegistryInput,
  GmailSearchRegistryOutput
>(({ registries }) => {
  // Handler to submit a new query
  const submitQuery = handler<
    {
      agentTypeUrl: string;
      query: string;
      description?: string;
      submittedBy?: string;
    },
    { registries: Cell<Record<string, AgentTypeRegistry>> }
  >((input, state) => {
    const currentRegistries = state.registries.get() || {};
    const agentRegistry = currentRegistries[input.agentTypeUrl] || {
      agentTypeUrl: input.agentTypeUrl,
      agentTypeName: extractAgentName(input.agentTypeUrl),
      queries: [],
    };

    // Check for duplicate queries (case-insensitive)
    const normalizedQuery = input.query.toLowerCase().trim();
    if (agentRegistry.queries.some((q) => q.query.toLowerCase().trim() === normalizedQuery)) {
      return { success: false, error: "Query already exists" };
    }

    // Create new query entry
    const newQuery: SharedQuery = {
      id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      query: input.query,
      description: input.description,
      submittedBy: input.submittedBy,
      submittedAt: Date.now(),
      upvotes: 0,
      downvotes: 0,
    };

    // Update registry
    const updatedRegistry: AgentTypeRegistry = {
      ...agentRegistry,
      queries: [...agentRegistry.queries, newQuery],
    };

    state.registries.set({
      ...currentRegistries,
      [input.agentTypeUrl]: updatedRegistry,
    });

    return { success: true, queryId: newQuery.id };
  });

  // Handler to upvote a query
  const upvoteQuery = handler<
    { agentTypeUrl: string; queryId: string },
    { registries: Cell<Record<string, AgentTypeRegistry>> }
  >((input, state) => {
    const currentRegistries = state.registries.get() || {};
    const agentRegistry = currentRegistries[input.agentTypeUrl];
    if (!agentRegistry) return { success: false, error: "Agent type not found" };

    const queryIdx = agentRegistry.queries.findIndex((q) => q.id === input.queryId);
    if (queryIdx < 0) return { success: false, error: "Query not found" };

    const updatedQuery = {
      ...agentRegistry.queries[queryIdx],
      upvotes: agentRegistry.queries[queryIdx].upvotes + 1,
      lastValidated: Date.now(),
    };

    const updatedQueries = [
      ...agentRegistry.queries.slice(0, queryIdx),
      updatedQuery,
      ...agentRegistry.queries.slice(queryIdx + 1),
    ];

    state.registries.set({
      ...currentRegistries,
      [input.agentTypeUrl]: { ...agentRegistry, queries: updatedQueries },
    });

    return { success: true };
  });

  // Handler to downvote a query
  const downvoteQuery = handler<
    { agentTypeUrl: string; queryId: string },
    { registries: Cell<Record<string, AgentTypeRegistry>> }
  >((input, state) => {
    const currentRegistries = state.registries.get() || {};
    const agentRegistry = currentRegistries[input.agentTypeUrl];
    if (!agentRegistry) return { success: false, error: "Agent type not found" };

    const queryIdx = agentRegistry.queries.findIndex((q) => q.id === input.queryId);
    if (queryIdx < 0) return { success: false, error: "Query not found" };

    const updatedQuery = {
      ...agentRegistry.queries[queryIdx],
      downvotes: agentRegistry.queries[queryIdx].downvotes + 1,
    };

    const updatedQueries = [
      ...agentRegistry.queries.slice(0, queryIdx),
      updatedQuery,
      ...agentRegistry.queries.slice(queryIdx + 1),
    ];

    state.registries.set({
      ...currentRegistries,
      [input.agentTypeUrl]: { ...agentRegistry, queries: updatedQueries },
    });

    return { success: true };
  });

  // Pre-bound handlers
  const boundSubmitQuery = submitQuery({ registries });
  const boundUpvoteQuery = upvoteQuery({ registries });
  const boundDownvoteQuery = downvoteQuery({ registries });

  // Helper to get queries for a specific agent type
  const getQueriesForAgent = (agentTypeUrl: string): SharedQuery[] => {
    const regs = registries.get() || {};
    const registry = regs[agentTypeUrl];
    if (!registry) return [];
    // Sort by upvotes - downvotes, then by recency
    return [...registry.queries].sort((a, b) => {
      const scoreA = a.upvotes - a.downvotes;
      const scoreB = b.upvotes - b.downvotes;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.submittedAt - a.submittedAt;
    });
  };

  // Stats
  const stats = derive(registries, (regs: Record<string, AgentTypeRegistry>) => {
    const agentTypes = Object.keys(regs || {});
    const totalQueries = agentTypes.reduce(
      (sum, key) => sum + (regs[key]?.queries?.length || 0),
      0
    );
    return { agentTypeCount: agentTypes.length, totalQueries };
  });

  // Track expanded agent types
  const expandedAgents = cell<Record<string, boolean>>({});
  const toggleAgent = handler<{ agentTypeUrl: string }, { expanded: Cell<Record<string, boolean>> }>(
    (input, state) => {
      const current = state.expanded.get() || {};
      state.expanded.set({
        ...current,
        [input.agentTypeUrl]: !current[input.agentTypeUrl],
      });
    }
  );

  return {
    [NAME]: "Gmail Search Registry",

    // Data
    registries,

    // Actions
    submitQuery: boundSubmitQuery,
    upvoteQuery: boundUpvoteQuery,
    downvoteQuery: boundDownvoteQuery,
    getQueriesForAgent,

    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2 style={{ margin: "0", fontSize: "18px" }}>Gmail Search Registry</h2>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 16px;">
            {/* Info banner */}
            <div
              style={{
                padding: "12px",
                background: "#eff6ff",
                borderRadius: "8px",
                border: "1px solid #dbeafe",
                fontSize: "13px",
                color: "#1e40af",
              }}
            >
              <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                Community Query Registry
              </div>
              <div style={{ fontSize: "12px", color: "#3b82f6" }}>
                This registry collects effective Gmail search queries shared by users.
                Other gmail-agent patterns can discover this via wish() to get community suggestions.
              </div>
            </div>

            {/* Stats */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                padding: "12px",
                background: "#f8fafc",
                borderRadius: "8px",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: "600", color: "#1e293b" }}>
                  {derive(stats, (s) => s.agentTypeCount)}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Agent Types</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: "600", color: "#1e293b" }}>
                  {derive(stats, (s) => s.totalQueries)}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Total Queries</div>
              </div>
            </div>

            {/* Registry list */}
            <div>
              {derive(registries, (regs: Record<string, AgentTypeRegistry>) => {
                const entries = Object.entries(regs || {});
                if (entries.length === 0) {
                  return (
                    <div
                      style={{
                        padding: "24px",
                        textAlign: "center",
                        color: "#64748b",
                        fontSize: "13px",
                      }}
                    >
                      No queries registered yet. Gmail-agent patterns will submit queries here.
                    </div>
                  );
                }

                return entries.map(([agentTypeUrl, registry]) => (
                  <div
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      marginBottom: "8px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Agent type header */}
                    <div
                      onClick={() => {
                        const current = expandedAgents.get() || {};
                        expandedAgents.set({
                          ...current,
                          [agentTypeUrl]: !current[agentTypeUrl],
                        });
                      }}
                      style={{
                        padding: "10px 12px",
                        background: "#f8fafc",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "500", fontSize: "13px", color: "#1e293b" }}>
                          {derive(expandedAgents, (exp: Record<string, boolean>) => exp[agentTypeUrl] ? "▼" : "▶")}{" "}
                          {registry.agentTypeName || extractAgentName(agentTypeUrl)}
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                          {registry.queries.length} {registry.queries.length === 1 ? "query" : "queries"}
                        </div>
                      </div>
                    </div>

                    {/* Queries list (when expanded) */}
                    {derive(expandedAgents, (exp: Record<string, boolean>) =>
                      exp[agentTypeUrl] ? (
                        <div style={{ padding: "8px" }}>
                          {registry.queries
                            .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
                            .map((query) => (
                              <div
                                style={{
                                  padding: "10px",
                                  background: "white",
                                  borderRadius: "6px",
                                  border: "1px solid #e2e8f0",
                                  marginBottom: "6px",
                                }}
                              >
                                <div
                                  style={{
                                    fontFamily: "monospace",
                                    fontSize: "12px",
                                    color: "#1e293b",
                                    marginBottom: "4px",
                                  }}
                                >
                                  {query.query}
                                </div>
                                {query.description && (
                                  <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
                                    {query.description}
                                  </div>
                                )}
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: "10px",
                                    color: "#94a3b8",
                                  }}
                                >
                                  <div>
                                    <span style={{ color: "#22c55e" }}>▲ {query.upvotes}</span>
                                    {" / "}
                                    <span style={{ color: "#ef4444" }}>▼ {query.downvotes}</span>
                                    {query.submittedBy && ` · by ${query.submittedBy}`}
                                  </div>
                                  <div>
                                    {new Date(query.submittedAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : null
                    )}
                  </div>
                ));
              })}
            </div>

            {/* Setup instructions */}
            <div
              style={{
                padding: "12px",
                background: "#fefce8",
                borderRadius: "8px",
                border: "1px solid #fef08a",
                fontSize: "12px",
                color: "#854d0e",
              }}
            >
              <div style={{ fontWeight: "500", marginBottom: "4px" }}>Setup Notes</div>
              <ul style={{ margin: "0", paddingLeft: "16px" }}>
                <li>This charm should be in space: <code>community-patterns-shared</code></li>
                <li>Favorite with tag: <code>#gmailSearchRegistry</code></li>
                <li>Gmail agents discover this via: <code>wish(&#123; query: "#gmailSearchRegistry" &#125;)</code></li>
              </ul>
            </div>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});

// Helper to extract a readable name from the agent type URL
function extractAgentName(url: string): string {
  // Extract filename from URL like:
  // https://raw.githubusercontent.com/.../patterns/jkomoros/hotel-membership-gmail-agent.tsx
  const match = url.match(/\/([^/]+)\.tsx$/);
  if (match) {
    return match[1]
      .replace(/-/g, " ")
      .replace(/gmail agent/i, "")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return url;
}

export default GmailSearchRegistry;
