/// <cts-enable />
import {
  Cell,
  computed,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

// Import Google Auth utility
import {
  createGoogleAuth,
  type ScopeKey,
} from "../util/google-auth-manager.tsx";

// Import markdown conversion utilities
import {
  convertDocToMarkdown,
  extractDocTitle,
  type GoogleDocsDocument,
  type GoogleComment,
} from "../util/google-docs-markdown.ts";

// Import Note pattern for "Save as Note" feature
import Note from "../lib/note.tsx";

// =============================================================================
// SETUP REQUIREMENTS
// =============================================================================
//
// This pattern requires Google OAuth with specific scopes and APIs enabled:
//
// 1. GOOGLE AUTH CHARM
//    - Create and favorite a Google Auth charm with these scopes enabled:
//      - Drive (read/write files & comments) - for fetching comments
//      - Docs (read document content) - for fetching document content
//
// 2. GOOGLE CLOUD CONSOLE
//    The OAuth project must have these APIs enabled:
//    - Google Drive API (usually enabled by default)
//    - Google Docs API (must be explicitly enabled)
//
// =============================================================================

// =============================================================================
// Types
// =============================================================================

interface Input {
  docUrl?: Cell<Default<string, "">>;
  markdown?: Cell<Default<string, "">>;
  docTitle?: Cell<Default<string, "">>;
  isFetching?: Cell<Default<boolean, false>>;
  lastError?: Cell<Default<string | null, null>>;
  includeComments?: Cell<Default<boolean, true>>;
}

/** Google Docs Markdown Importer. Import Google Docs as Markdown with comments. #googleDocsImporter */
interface Output {
  docUrl: string;
  markdown: string;
  docTitle: string;
}

// =============================================================================
// API Client (adapted from google-docs-comment-orchestrator.tsx)
// =============================================================================

class GoogleDocsClient {
  private token: string;
  private delay = 0;
  private delayIncrement = 1000;

  constructor(token: string) {
    this.token = token;
  }

  private async request(
    url: URL,
    options?: RequestInit,
    retries = 3
  ): Promise<Response> {
    const token = this.token;
    if (!token) throw new Error("No authorization token");

    const opts = options ?? {};
    opts.headers = new Headers(opts.headers);
    opts.headers.set("Authorization", `Bearer ${token}`);

    // Add delay if we've been rate limited
    if (this.delay > 0) {
      await new Promise((r) => setTimeout(r, this.delay));
    }

    const res = await fetch(url, opts);
    const status = res.status;

    // Handle 401 (expired token) - tell user to refresh auth
    if (status === 401) {
      throw new Error(
        "Token expired. Please re-authenticate in your Google Auth charm."
      );
    }

    // Handle 429 (rate limit) - exponential backoff
    if (status === 429 && retries > 0) {
      this.delay += this.delayIncrement;
      console.log(`[GoogleDocsClient] Rate limited, waiting ${this.delay}ms...`);
      await new Promise((r) => setTimeout(r, this.delay));
      return this.request(url, options, retries - 1);
    }

    // Reset delay on success
    if (res.ok) {
      this.delay = 0;
    }

    return res;
  }

  async listComments(fileId: string): Promise<GoogleComment[]> {
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${fileId}/comments`
    );
    url.searchParams.set(
      "fields",
      "comments(id,author,content,htmlContent,createdTime,modifiedTime,resolved,quotedFileContent,anchor,replies)"
    );
    url.searchParams.set("pageSize", "100");

    const res = await this.request(url);
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 403) {
        throw new Error(
          `Access denied (403). This could mean:\n` +
            `- The document is not shared with your Google account\n` +
            `- Your account doesn't have access to this document\n` +
            `- The document has restricted sharing settings\n\n` +
            `Make sure you're signed in with an account that has access to this document.`
        );
      }
      throw new Error(`Failed to list comments: ${res.status} - ${text}`);
    }

    const json = await res.json();
    return json.comments || [];
  }

  async getDocument(docId: string): Promise<GoogleDocsDocument> {
    const url = new URL(`https://docs.googleapis.com/v1/documents/${docId}`);

    const res = await this.request(url);
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 403) {
        throw new Error(
          `Access denied to document (403). Make sure:\n` +
            `- The Google Docs API is enabled in your Google Cloud project\n` +
            `- You have access to this document\n` +
            `- Your Google Auth charm has the 'Docs' scope enabled`
        );
      }
      throw new Error(`Failed to get document: ${res.status} - ${text}`);
    }

    return await res.json();
  }
}

// Helper to extract file ID from Google Docs URL
function extractFileId(url: string): string | null {
  // Handle various Google Docs URL formats:
  // https://docs.google.com/document/d/FILE_ID/edit
  // https://docs.google.com/document/d/FILE_ID/edit?...
  // https://drive.google.com/file/d/FILE_ID/view
  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ];

  for (const p of patterns) {
    const match = url.match(p);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// =============================================================================
// Handlers
// =============================================================================

// Fetch document and convert to markdown
const importDocument = handler<
  unknown,
  {
    docUrl: Cell<string>;
    auth: Cell<unknown>;
    markdown: Cell<string>;
    docTitle: Cell<string>;
    isFetching: Cell<boolean>;
    lastError: Cell<string | null>;
    includeComments: Cell<boolean>;
  }
>(
  async (
    _,
    { docUrl, auth, markdown, docTitle, isFetching, lastError, includeComments }
  ) => {
    const url = docUrl.get();
    if (!url) {
      lastError.set("Please enter a Google Doc URL");
      return;
    }

    const fileId = extractFileId(url);
    if (!fileId) {
      lastError.set("Could not extract file ID from URL");
      return;
    }

    const authData = auth.get() as { token?: string } | null;
    const token = authData?.token;
    if (!token) {
      lastError.set("Please authenticate with Google first");
      return;
    }

    isFetching.set(true);
    lastError.set(null);

    try {
      const client = new GoogleDocsClient(token);

      // Fetch document content
      const doc = await client.getDocument(fileId);
      const title = extractDocTitle(doc);
      docTitle.set(title);

      // Fetch comments if enabled
      let comments: GoogleComment[] = [];
      if (includeComments.get()) {
        try {
          const allComments = await client.listComments(fileId);
          // Filter to only unresolved comments
          comments = allComments.filter((c) => !c.resolved);
        } catch (e) {
          console.warn("[importDocument] Could not fetch comments:", e);
          // Non-fatal - we can still convert without comments
        }
      }

      // Convert to markdown
      const md = await convertDocToMarkdown(doc, comments, {
        includeComments: includeComments.get(),
        embedImages: true,
        token,
      });

      markdown.set(md);
    } catch (e: unknown) {
      console.error("[importDocument] Error:", e);
      const errorMessage =
        e instanceof Error ? e.message : "Failed to import document";
      lastError.set(errorMessage);
    } finally {
      isFetching.set(false);
    }
  }
);

// Copy markdown to clipboard - show notification since clipboard API isn't available in patterns
const copyToClipboard = handler<
  unknown,
  { markdown: Cell<string>; lastError: Cell<string | null> }
>((_, { markdown, lastError }) => {
  const md = markdown.get();
  if (!md) {
    lastError.set("No markdown to copy");
    return;
  }

  // Clipboard API not available in pattern sandbox - guide user to select manually
  lastError.set("Select the markdown text above and use Cmd/Ctrl+C to copy");
});

// Save as Note charm
const saveAsNote = handler<
  unknown,
  { markdown: Cell<string>; docTitle: Cell<string> }
>((_, { markdown, docTitle }) => {
  const md = markdown.get();
  const title = docTitle.get() || "Imported Document";

  if (!md) {
    return;
  }

  // Create and navigate to a new Note charm with the imported content
  return navigateTo(Note({ title, content: md }));
});

// Toggle include comments
const toggleComments = handler<unknown, { includeComments: Cell<boolean> }>(
  (_, { includeComments }) => {
    includeComments.set(!includeComments.get());
  }
);

// =============================================================================
// Pattern
// =============================================================================

export default pattern<Input, Output>(
  ({ docUrl, markdown, docTitle, isFetching, lastError, includeComments }) => {
    // Save cell references
    const docUrlCell = docUrl;
    const markdownCell = markdown;
    const docTitleCell = docTitle;
    const isFetchingCell = isFetching;
    const lastErrorCell = lastError;
    const includeCommentsCell = includeComments;

    // Auth via createGoogleAuth utility (requires Drive and Docs scopes)
    const {
      auth,
      authInfo,
      fullUI: authFullUI,
      isReady: isAuthenticated,
    } = createGoogleAuth({
      requiredScopes: ["drive", "docs"] as ScopeKey[],
    });

    // Has markdown content
    const hasMarkdown = computed(() => {
      const md = markdownCell.get();
      return md && md.trim().length > 0;
    });

    // Has error
    const hasError = computed(() => !!lastErrorCell.get());

    // Computed name based on doc title
    const charmName = computed(() => {
      const title = docTitleCell.get();
      return title ? `Import: ${title}` : "Google Docs Importer";
    });

    return {
      [NAME]: charmName,
      [UI]: (
        <ct-screen>
          {/* Header */}
          <ct-vstack slot="header" gap={1}>
            <ct-hstack align="center" justify="between">
              <ct-heading level={4}>Google Docs Markdown Importer</ct-heading>
              <ct-hstack align="center" gap={1}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: authInfo.statusDotColor,
                  }}
                />
                <span style={{ fontSize: "12px", color: "#666" }}>
                  {authInfo.statusText}
                </span>
              </ct-hstack>
            </ct-hstack>
          </ct-vstack>

          {/* Main content */}
          <ct-vstack gap="1" style="padding: 16px;">
            {/* Auth UI */}
            {authFullUI}

            {/* Document URL input */}
            <ct-card>
              <ct-vstack gap={1}>
                <label style={{ fontSize: "13px", fontWeight: 500 }}>
                  Google Doc URL
                </label>
                <ct-hstack gap={1}>
                  <ct-input
                    $value={docUrl}
                    placeholder="https://docs.google.com/document/d/..."
                    style="flex: 1;"
                  />
                  {ifElse(
                    isAuthenticated,
                    <ct-button
                      variant="primary"
                      type="button"
                      disabled={isFetchingCell}
                      onClick={importDocument({
                        docUrl: docUrlCell,
                        auth,
                        markdown: markdownCell,
                        docTitle: docTitleCell,
                        isFetching: isFetchingCell,
                        lastError: lastErrorCell,
                        includeComments: includeCommentsCell,
                      })}
                    >
                      {ifElse(
                        isFetchingCell,
                        <ct-hstack align="center" gap={1}>
                          <ct-loader />
                          <span>Importing...</span>
                        </ct-hstack>,
                        "Import"
                      )}
                    </ct-button>,
                    null
                  )}
                </ct-hstack>

                {/* Options */}
                <ct-hstack gap={2} style={{ marginTop: "8px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                    onClick={toggleComments({
                      includeComments: includeCommentsCell,
                    })}
                  >
                    <input
                      type="checkbox"
                      checked={includeCommentsCell}
                      style={{ cursor: "pointer" }}
                    />
                    Include open comments
                  </label>
                </ct-hstack>

                {/* Error display */}
                {ifElse(
                  hasError,
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "8px 12px",
                      backgroundColor: "var(--ct-color-red-50, #fef2f2)",
                      border: "1px solid var(--ct-color-red-200, #fecaca)",
                      borderRadius: "6px",
                      fontSize: "12px",
                      color: "var(--ct-color-red-700, #b91c1c)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {lastErrorCell}
                  </div>,
                  null
                )}
              </ct-vstack>
            </ct-card>

            {/* Markdown preview */}
            {ifElse(
              hasMarkdown,
              <ct-card style="flex: 1; display: flex; flex-direction: column;">
                <ct-hstack
                  align="center"
                  justify="between"
                  style={{ marginBottom: "12px" }}
                >
                  <span style={{ fontWeight: 600 }}>
                    Preview: {docTitleCell}
                  </span>
                  <ct-hstack gap={1}>
                    <ct-button
                      variant="secondary"
                      type="button"
                      onClick={copyToClipboard({
                        markdown: markdownCell,
                        lastError: lastErrorCell,
                      })}
                    >
                      Copy to Clipboard
                    </ct-button>
                    <ct-button
                      variant="primary"
                      type="button"
                      onClick={saveAsNote({
                        markdown: markdownCell,
                        docTitle: docTitleCell,
                      })}
                    >
                      Save as Note
                    </ct-button>
                  </ct-hstack>
                </ct-hstack>

                <ct-vscroll flex showScrollbar fadeEdges>
                  <div
                    style={{
                      padding: "16px",
                      backgroundColor:
                        "var(--ct-color-surface-secondary, #f9fafb)",
                      borderRadius: "8px",
                      fontFamily: "monospace",
                      fontSize: "13px",
                      whiteSpace: "pre-wrap",
                      lineHeight: "1.5",
                    }}
                  >
                    {markdownCell}
                  </div>
                </ct-vscroll>
              </ct-card>,
              <ct-card>
                <div
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    color: "#888",
                    fontSize: "14px",
                  }}
                >
                  {ifElse(
                    isAuthenticated,
                    "Enter a Google Doc URL and click Import to convert it to Markdown",
                    "Please authenticate with Google to import documents"
                  )}
                </div>
              </ct-card>
            )}
          </ct-vstack>
        </ct-screen>
      ),
      docUrl,
      markdown,
      docTitle,
    };
  }
);
