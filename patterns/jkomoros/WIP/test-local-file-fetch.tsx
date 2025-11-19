/// <cts-enable />
import {
  cell,
  compileAndRun,
  derive,
  fetchProgram,
  NAME,
  recipe,
  UI,
} from "commontools";

/**
 * Test pattern to verify if fetchProgram works with file:// URLs.
 * This will help us understand if we can fetch local patterns for development.
 */
export default recipe("Test Local File Fetch", () => {
  // Try to fetch the counter pattern from the local labs directory
  const localFilePath = cell(
    "file:///Users/alex/Code/labs/packages/patterns/counter.tsx",
  );

  // Try to fetch it
  const { pending: fetchPending, result: program, error: fetchError } =
    fetchProgram({ url: localFilePath });

  // If successful, compile and run it
  const compileParams = derive(program, (p) => ({
    files: p?.files ?? [],
    main: p?.main ?? "",
    input: { value: 42 },
  }));

  const { pending: compilePending, result, error: compileError } =
    compileAndRun(compileParams);

  return {
    [NAME]: "Test Local File Fetch",
    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2 style="margin: 0; fontSize: 18px;">Test Local File Fetch</h2>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 12px;">
            <ct-vstack style="gap: 8px;">
              <h3 style="margin: 0; fontSize: 14px; fontWeight: 600;">
                Testing file:// URL Support
              </h3>
              <p style="margin: 0; fontSize: 13px; color: #666;">
                Attempting to fetch: {localFilePath}
              </p>
            </ct-vstack>

            <ct-vstack style="gap: 8px; padding: 12px; backgroundColor: #f5f5f5; borderRadius: 4px;">
              <h4 style="margin: 0; fontSize: 13px; fontWeight: 600;">Fetch Status:</h4>

              {fetchPending && (
                <div style="color: #0066cc;">⏳ Fetching program...</div>
              )}

              {fetchError && (
                <div style="color: #cc0000; fontFamily: monospace; fontSize: 12px; whiteSpace: pre-wrap;">
                  ❌ Fetch Error: {derive(fetchError, (e) => String(e))}
                </div>
              )}

              {program && !fetchPending && (
                <div style="color: #00aa00;">
                  ✅ Fetch succeeded!
                  <div style="fontSize: 12px; marginTop: 4px;">
                    Files: {derive(program, (p) => p?.files?.length ?? 0)}
                  </div>
                  <div style="fontSize: 12px;">
                    Main: {derive(program, (p) => p?.main ?? "N/A")}
                  </div>
                </div>
              )}
            </ct-vstack>

            <ct-vstack style="gap: 8px; padding: 12px; backgroundColor: #f5f5f5; borderRadius: 4px;">
              <h4 style="margin: 0; fontSize: 13px; fontWeight: 600;">Compile Status:</h4>

              {compilePending && (
                <div style="color: #0066cc;">⏳ Compiling...</div>
              )}

              {compileError && (
                <div style="color: #cc0000; fontFamily: monospace; fontSize: 12px; whiteSpace: pre-wrap;">
                  ❌ Compile Error: {derive(compileError, (e) => String(e))}
                </div>
              )}

              {result && !compilePending && (
                <div style="color: #00aa00;">
                  ✅ Compile succeeded!
                  <div style="fontSize: 12px; marginTop: 4px;">
                    Result: {derive(result, (r) => JSON.stringify(r, null, 2))}
                  </div>
                </div>
              )}
            </ct-vstack>

            <ct-vstack style="gap: 8px; marginTop: 8px;">
              <h4 style="margin: 0; fontSize: 13px; fontWeight: 600;">Test Different URLs:</h4>
              <ct-button
                onClick={() => localFilePath.set("file:///Users/alex/Code/labs/packages/patterns/counter.tsx")}
                size="sm"
              >
                Try counter.tsx (local file://)
              </ct-button>
              <ct-button
                onClick={() => localFilePath.set("http://localhost:8000/api/patterns/counter.tsx")}
                size="sm"
              >
                Try counter.tsx (localhost HTTP)
              </ct-button>
              <ct-button
                onClick={() => localFilePath.set("https://raw.githubusercontent.com/commontoolsinc/labs/refs/heads/main/packages/patterns/counter.tsx")}
                size="sm"
              >
                Try counter.tsx (GitHub)
              </ct-button>
            </ct-vstack>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});
