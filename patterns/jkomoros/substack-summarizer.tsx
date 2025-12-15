/// <cts-enable />
import { computed, Default, NAME, pattern, UI } from "commontools";
import GmailImporter from "./gmail-importer.tsx";

interface SubstackInput {
  gmailFilterQuery?: Default<string, "label:demo">;
  limit?: Default<number, 50>;
}

/** Substack newsletter summarizer with email grouping. #substackSummaries */
interface Output {
  /** Emails grouped by newsletter name */
  groupedByNewsletter: Record<string, Array<{ subject: string; date: string; from: string }>>;
  /** Number of unique newsletters found */
  newsletterCount: number;
  /** Total number of emails */
  totalEmails: number;
}

const SubstackSummarizer = pattern<SubstackInput, Output>(({ gmailFilterQuery, limit }) => {
  // Import emails from Substack
  // GmailImporter will automatically discover auth via wish({ tag: "#googleAuth" })
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery,
      limit,
      historyId: "",
      debugMode: false,
    },
    authCharm: null,  // Let importer wish for shared auth
    accountType: "default",  // Use default account type for multi-account support
  });

  const emails = importer.emails;

  // Group emails by newsletter (extract from 'from' field)
  const groupedByNewsletter = computed(() => {
    const groups: Record<string, Array<{ subject: string; date: string; from: string }>> = {};

    for (const email of emails as any[]) {
      const subject = email.subject || "No Subject";
      const date = email.date || "";
      const from = email.from || "";

      // Extract newsletter name from 'from' field
      // Format is typically: "Newsletter Name <newsletter@substack.com>" or just "newsletter@substack.com"
      let newsletter = "Unknown Newsletter";

      if (from) {
        // Try to extract name before <email>
        const nameMatch = from.match(/^([^<]+)</);
        if (nameMatch) {
          newsletter = nameMatch[1].trim();
        } else {
          // If no angle brackets, use the email but clean it up
          // Remove @substack.com suffix for readability
          newsletter = from.trim().replace(/@substack\.com$/, '');
        }
      }

      if (!groups[newsletter]) {
        groups[newsletter] = [];
      }

      groups[newsletter].push({ subject, date, from });
    }

    return groups;
  });

  const newsletterCount = computed(() => Object.keys(groupedByNewsletter).length);
  const totalEmails = computed(() => emails.length);

  return {
    [NAME]: "📧 Substack Summarizer",
    [UI]: (
      <ct-screen>
        <ct-vscroll>
          <ct-vstack gap={4} style="padding: 1rem;">
            {/* Grouped by Newsletter - at top */}
            <div>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 style={{ margin: 0, fontSize: "15px" }}>Newsletters</h3>
                <span style={{ fontSize: "13px", color: "#666" }}>📧 {totalEmails} emails · 📰 {newsletterCount} newsletters</span>
              </div>
              {computed(() => {
                const groups = groupedByNewsletter;
                const newsletters = Object.keys(groups).sort();
                if (newsletters.length === 0) {
                  return <div style={{ padding: "1rem", textAlign: "center", color: "#999" }}>
                    No emails yet. Import emails above.
                  </div>;
                }

                return newsletters.map((newsletter) => {
                  const emailsForNewsletter = groups[newsletter];
                  return (
                    <details open style={{ borderBottom: "1px solid #ddd", marginBottom: "0.5rem" }}>
                      <summary style={{ cursor: "pointer", padding: "0.5rem", fontWeight: "600", fontSize: "14px" }}>
                        {newsletter} <span style={{ color: "#666", fontWeight: "normal" }}>({emailsForNewsletter.length})</span>
                      </summary>
                      <div style={{ paddingLeft: "1.5rem", paddingBottom: "0.5rem" }}>
                        {emailsForNewsletter.map((email) => (
                          <div style={{ fontSize: "13px", padding: "4px 0", color: "#333" }}>
                            • {email.subject}
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                });
              })}
            </div>

            {/* Import Settings - Gmail Importer handles auth via wish */}
            <details style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", padding: "0.5rem", background: "#f8f9fa", border: "1px solid #e0e0e0", borderRadius: "4px", fontSize: "13px" }}>
                ⚙️ Settings & Import
              </summary>
              <div style={{ padding: "0.75rem", marginTop: "0.5rem" }}>
                {importer}
              </div>
            </details>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
    groupedByNewsletter,
    newsletterCount,
    totalEmails,
  };
});

export default SubstackSummarizer;
