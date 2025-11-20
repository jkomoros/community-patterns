/// <cts-enable />
import { Default, derive, NAME, pattern, UI } from "commontools";
import GmailAuth from "./gmail-auth.tsx";
import GmailImporter from "./gmail-importer.tsx";

interface SubstackInput {
  gmailFilterQuery: Default<string, "label:demo">;
  limit: Default<number, 50>;
}

export default pattern<SubstackInput>(({ gmailFilterQuery, limit }) => {
  // Gmail authentication
  const auth = GmailAuth({
    auth: {
      token: "",
      tokenType: "",
      scope: [],
      expiresIn: 0,
      expiresAt: 0,
      refreshToken: "",
      user: { email: "", name: "", picture: "" },
    },
  });

  // Import emails from Substack
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery,
      limit,
      historyId: "",
    },
    authCharm: auth,
  });

  const emails = importer.emails;

  // Group emails by newsletter (extract from 'from' field)
  const groupedByNewsletter = derive(emails, (emailList: any[]) => {
    const groups: Record<string, Array<{ subject: string; date: string; from: string }>> = {};

    for (const email of emailList) {
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

  const newsletterCount = derive(groupedByNewsletter, (groups) => Object.keys(groups).length);
  const totalEmails = derive(emails, (list) => list.length);

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
              {derive(groupedByNewsletter, (groups) => {
                const newsletters = Object.keys(groups).sort();
                if (newsletters.length === 0) {
                  return <div style={{ padding: "1rem", textAlign: "center", color: "#999" }}>
                    No emails yet. Import emails above.
                  </div>;
                }

                return newsletters.map((newsletter) => {
                  const emails = groups[newsletter];
                  return (
                    <details open style={{ borderBottom: "1px solid #ddd", marginBottom: "0.5rem" }}>
                      <summary style={{ cursor: "pointer", padding: "0.5rem", fontWeight: "600", fontSize: "14px" }}>
                        {newsletter} <span style={{ color: "#666", fontWeight: "normal" }}>({emails.length})</span>
                      </summary>
                      <div style={{ paddingLeft: "1.5rem", paddingBottom: "0.5rem" }}>
                        {emails.map((email) => (
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

            {/* Auth + Import Settings - at bottom, side by side */}
            <details style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", padding: "0.5rem", background: "#f8f9fa", border: "1px solid #e0e0e0", borderRadius: "4px", fontSize: "13px" }}>
                ⚙️ Settings & Import
              </summary>
              <ct-hstack gap={4} style="padding: 0.75rem; margin-top: 0.5rem; align-items: flex-start;">
                <div style={{ flex: 1, minWidth: 0 }}>
                  {auth}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {importer}
                </div>
              </ct-hstack>
            </details>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
    groupedByNewsletter,
  };
});
