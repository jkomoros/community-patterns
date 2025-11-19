/// <cts-enable />
import {
  Cell,
  compileAndRun,
  derive,
  fetchProgram,
  handler,
  NAME,
  navigateTo,
  recipe,
  UI,
} from "commontools";

interface HistoryItem {
  url: string;
  timestamp: number;
}

// Handler to launch a pattern from URL input
const launchFromInput = handler<
  unknown,
  { urlInput: Cell<string>; history: Cell<HistoryItem[]>; selectedPatternUrl: Cell<string | undefined>; launchCounter: Cell<number> }
>((_event, { urlInput, history, selectedPatternUrl, launchCounter }) => {
  const url = urlInput.get().trim();
  if (!url) return;

  // Determine full URL
  let fullUrl: string;
  if (url.startsWith("https://")) {
    fullUrl = url;
  } else {
    // Assume local file from dev server
    fullUrl = `http://localhost:8765/${url}`;
  }

  // Add to history
  const currentHistory = history.get();
  const newItem: HistoryItem = { url: fullUrl, timestamp: Date.now() };
  history.set([newItem, ...currentHistory.filter(h => h.url !== fullUrl)]);

  // Launch the pattern
  selectedPatternUrl.set(fullUrl);
  launchCounter.set(launchCounter.get() + 1);

  // Clear input
  urlInput.set("");
});

// Handler to launch from history
const launchFromHistory = handler<
  unknown,
  { url: string; selectedPatternUrl: Cell<string | undefined>; launchCounter: Cell<number> }
>((_event, { url, selectedPatternUrl, launchCounter }) => {
  selectedPatternUrl.set(url);
  launchCounter.set(launchCounter.get() + 1);
});

export default recipe("Pattern Launcher", () => {
  // URL input
  const urlInput = Cell.of("");

  // History of launched patterns
  const history = Cell.of<HistoryItem[]>([]);

  // Currently selected pattern URL
  const selectedPatternUrl = Cell.of<string | undefined>(undefined);

  // Launch counter to force re-evaluation even for same URL
  const launchCounter = Cell.of(0);

  // Fetch the selected pattern
  const fetchParams = derive([selectedPatternUrl, launchCounter] as const, ([url, _counter]) => ({
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
    input: {},
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
            {/* Instructions */}
            <ct-vstack style="gap: 8px;">
              <p style="margin: 0; fontSize: 14px; color: #666;">
                Paste a pattern URL to launch it:
              </p>
              <ul style="margin: 0; paddingLeft: 20px; fontSize: 13px; color: #666;">
                <li>GitHub: https://raw.githubusercontent.com/...</li>
                <li>Local: community-patterns-2/patterns/jkomoros/pattern.tsx</li>
              </ul>
            </ct-vstack>

            {/* URL Input */}
            <ct-vstack style="gap: 8px;">
              <ct-input
                $value={urlInput}
                placeholder="Paste pattern URL here..."
                style="width: 100%;"
              />
              <ct-button
                onClick={launchFromInput({ urlInput, history, selectedPatternUrl, launchCounter })}
                style="width: 100%;"
              >
                Launch Pattern
              </ct-button>
            </ct-vstack>

            {/* Launch Status */}
            {selectedPatternUrl && (
              <ct-vstack style="gap: 12px; padding: 12px; backgroundColor: #f5f5f5; borderRadius: 4px;">
                <h4 style="margin: 0; fontSize: 13px; fontWeight: 600;">
                  Launch Status
                </h4>

                <ct-vstack style="gap: 8px; fontSize: 13px;">
                  <div style="overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap;">
                    URL: {selectedPatternUrl}
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

            {/* History */}
            {derive(history, (items: HistoryItem[]) => items.length > 0 && (
              <ct-vstack style="gap: 12px;">
                <h3 style="margin: 0; fontSize: 15px; fontWeight: 600;">
                  Recent Patterns
                </h3>
              </ct-vstack>
            ))}
            <ct-vstack style="gap: 8px;">
              {history.map((item) => (
                <ct-button
                  onClick={launchFromHistory({ url: item.url, selectedPatternUrl, launchCounter })}
                  size="sm"
                  style="textAlign: left; justifyContent: flex-start; width: 100%; overflow: hidden;"
                >
                  <div style="overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap; fontSize: 12px;">
                    {item.url}
                  </div>
                </ct-button>
              ))}
            </ct-vstack>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});
