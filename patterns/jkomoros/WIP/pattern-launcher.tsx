/// <cts-enable />
import {
  Cell,
  compileAndRun,
  computed,
  derive,
  fetchData,
  fetchProgram,
  handler,
  NAME,
  navigateTo,
  recipe,
  UI,
} from "commontools";

interface PatternSource {
  name: string;
  path: string;
  icon?: string;
  description?: string;
}

interface PatternManifest {
  patterns: PatternSource[];
}

export default recipe("Pattern Launcher", () => {
  // Manual list of patterns to start with
  const manualPatterns = Cell.of<PatternSource[]>([
    {
      name: "Counter",
      path: "https://raw.githubusercontent.com/commontoolsinc/labs/refs/heads/main/packages/patterns/counter.tsx",
      icon: "🔢",
      description: "Simple counter demo from labs",
    },
    {
      name: "Chatbot",
      path: "https://raw.githubusercontent.com/commontoolsinc/labs/refs/heads/main/packages/patterns/chatbot.tsx",
      icon: "💬",
      description: "AI chatbot from labs",
    },
    {
      name: "Note",
      path: "https://raw.githubusercontent.com/commontoolsinc/labs/refs/heads/main/packages/patterns/note.tsx",
      icon: "📝",
      description: "Note-taking pattern from labs",
    },
  ]);

  // Try to fetch local patterns from dev server
  const localManifestUrl = Cell.of(
    "http://localhost:8765/community-patterns-2/LOCAL_ENDPOINTS.json",
  );

  const {
    pending: localPending,
    result: localManifest,
    error: localError,
  } = fetchData<PatternManifest>({
    url: localManifestUrl,
    mode: "json",
  });

  // Combine manual and local patterns
  const allPatterns = computed(() => {
    const manual = manualPatterns.get();
    const local = localManifest;
    const combined: PatternSource[] = [...manual];

    if (local?.patterns && Array.isArray(local.patterns)) {
      // Convert local pattern paths to full URLs
      local.patterns.forEach((p: PatternSource) => {
        if (p && p.path) {
          combined.push({
            ...p,
            path: `http://localhost:8765/${p.path}`,
          });
        }
      });
    }
    return combined;
  });

  // Currently selected pattern URL
  const selectedPatternUrl = Cell.of<string | undefined>(undefined);

  // Fetch the selected pattern
  const fetchParams = derive(selectedPatternUrl, (url) => ({
    url: url || "",
  }));
  const {
    pending: fetchPending,
    result: program,
    error: fetchError,
  } = fetchProgram(fetchParams);

  // Compile and run the fetched pattern
  const compileParams = derive(program, (p) => ({
    files: p?.files ?? [],
    main: p?.main ?? "",
    input: {}, // Always pass empty object, patterns handle their own defaults
  }));

  const {
    pending: compilePending,
    result: charmId,
    error: compileError,
  } = compileAndRun(compileParams);

  // When charm is created, navigate to it
  const navigateResult = derive(charmId, (id) => {
    if (id) {
      return navigateTo(id);
    }
    return undefined;
  });

  return {
    [NAME]: "Pattern Launcher",
    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2 style="margin: 0; fontSize: 18px;">Pattern Launcher</h2>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 16px;">
            {/* Header info */}
            <ct-vstack style="gap: 8px;">
              <p style="margin: 0; fontSize: 14px; color: #666;">
                Launch patterns from GitHub or your local workspace
              </p>
            </ct-vstack>

            {/* Local patterns status */}
            {localPending && (
              <div style="padding: 12px; backgroundColor: #f0f9ff; border: 1px solid #0ea5e9; borderRadius: 4px; fontSize: 13px;">
                ⏳ Loading local patterns...
              </div>
            )}

            {localError && (
              <div style="padding: 12px; backgroundColor: #fef2f2; border: 1px solid #ef4444; borderRadius: 4px; fontSize: 13px;">
                ⚠️ Local dev server not available (patterns will still work from GitHub)
              </div>
            )}

            {/* Available patterns */}
            <ct-vstack style="gap: 12px;">
              <h3 style="margin: 0; fontSize: 15px; fontWeight: 600;">
                Available Patterns
              </h3>

              {derive(allPatterns, (patterns: PatternSource[]) => (
                <ct-vstack style="gap: 8px;">
                  {patterns.map((pattern: PatternSource) => (
                      <ct-button
                        onClick={handler(() => selectedPatternUrl.set(pattern.path))}
                        size="lg"
                        style="textAlign: left; justifyContent: flex-start;"
                      >
                      <ct-hstack style="gap: 12px; width: 100%; alignItems: center;">
                        <span style="fontSize: 24px;">{pattern.icon || "📦"}</span>
                        <ct-vstack style="gap: 2px; flex: 1; alignItems: flex-start;">
                          <span style="fontWeight: 600; fontSize: 14px;">
                            {pattern.name}
                          </span>
                          {pattern.description && (
                            <span style="fontSize: 12px; color: #666; fontWeight: normal;">
                              {pattern.description}
                            </span>
                          )}
                        </ct-vstack>
                      </ct-hstack>
                    </ct-button>
                  ))}
                </ct-vstack>
              ))}
            </ct-vstack>

            {/* Status display */}
            {selectedPatternUrl && (
              <ct-vstack style="gap: 12px; padding: 12px; backgroundColor: #f5f5f5; borderRadius: 4px;">
                <h4 style="margin: 0; fontSize: 13px; fontWeight: 600;">
                  Launch Status
                </h4>

                <ct-vstack style="gap: 8px; fontSize: 13px;">
                  <div>
                    Pattern: {derive(selectedPatternUrl, (url: string | undefined) => {
                      if (!url) return "None";
                      // Extract filename from URL
                      const parts = url.split("/");
                      return parts[parts.length - 1];
                    })}
                  </div>

                  {fetchPending && (
                    <div style="color: #0066cc;">⏳ Fetching pattern...</div>
                  )}

                  {fetchError && (
                    <div style="color: #cc0000;">
                      ❌ Fetch error: {derive(fetchError, (e) => String(e))}
                    </div>
                  )}

                  {program && !fetchPending && (
                    <div style="color: #00aa00;">
                      ✅ Pattern fetched ({derive(program, (p) => p?.files?.length ?? 0)} files)
                    </div>
                  )}

                  {compilePending && (
                    <div style="color: #0066cc;">⏳ Compiling and instantiating...</div>
                  )}

                  {compileError && (
                    <div style="color: #cc0000;">
                      ❌ Compile error: {derive(compileError, (e) => String(e))}
                    </div>
                  )}

                  {charmId && !compilePending && (
                    <div style="color: #00aa00;">
                      ✅ Pattern launched! Navigating...
                    </div>
                  )}
                </ct-vstack>
              </ct-vstack>
            )}
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
    allPatterns,
    selectedPatternUrl,
    navigateResult,
  };
});
