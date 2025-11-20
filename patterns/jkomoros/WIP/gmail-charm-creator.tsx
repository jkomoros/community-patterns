/// <cts-enable />
import {
  Cell,
  cell,
  Default,
  derive,
  handler,
  ID,
  lift,
  NAME,
  OpaqueRef,
  pattern,
  toSchema,
  UI,
} from "commontools";

import GmailAuth from "./gmail-auth.tsx";
import GmailImporter from "./gmail-importer.tsx";

type ImporterEntry = {
  [ID]: string;
  local_id: string;
  charm: any;
};

type Input = {
  authCharm: Default<any, undefined>;
  importersList: Default<ImporterEntry[], []>;
  selectedImporter: Default<{ charm: any }, { charm: undefined }>;
};

type Output = {
  authCharm: any;
  importersList: ImporterEntry[];
  selectedImporter: Default<{ charm: any }, { charm: undefined }>;
};

// ✅ CORRECT: Use lift to store the auth instance
const storeAuth = lift(
  toSchema<{
    auth: any;
    authCharm: Cell<any>;
  }>(),
  undefined,
  ({ auth, authCharm }) => {
    console.log("storeAuth: storing auth charm");
    // ✅ CORRECT: .set() happens inside lift, not handler
    authCharm.set(auth);
    return auth;
  },
);

// ✅ CORRECT: Use lift to store the importer instance
const storeImporter = lift(
  toSchema<{
    charm: any;
    importersList: Cell<ImporterEntry[]>;
    selectedImporter: Cell<{ charm: any }>;
    isInitialized: Cell<boolean>;
  }>(),
  undefined,
  ({ charm, importersList, selectedImporter, isInitialized }) => {
    if (!isInitialized.get()) {
      console.log("storeImporter: storing importer charm");

      // ✅ CORRECT: .push() happens inside lift, not handler
      const randomId = Math.random().toString(36).substring(2, 10);
      importersList.push({
        [ID]: randomId,
        local_id: randomId,
        charm,
      });

      selectedImporter.set({ charm });
      isInitialized.set(true);

      return charm;
    } else {
      console.log("storeImporter: already initialized");
    }
    return undefined;
  },
);

// Handler that creates a new importer, ensuring auth exists first
const createGmailImporter = handler<
  unknown,
  {
    authCharm: Cell<any>;
    importersList: Cell<ImporterEntry[]>;
    selectedImporter: Cell<{ charm: any }>;
  }
>(
  (_, { authCharm, importersList, selectedImporter }) => {
    console.log("Creating new Gmail Importer...");

    // Create auth if it doesn't exist
    let auth = authCharm.get();
    if (!auth) {
      console.log("No auth exists, creating Gmail Auth...");
      const newAuth = GmailAuth({
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

      // ✅ CORRECT: Use lift to store the auth pattern instance
      auth = storeAuth({
        auth: newAuth,
        authCharm,
      });
    }

    // Create the importer with the shared auth
    const isInitialized = cell(false);
    const importer = GmailImporter({
      settings: {
        gmailFilterQuery: "in:INBOX",
        limit: 100,
        historyId: "",
      },
      authCharm: auth,
    });

    console.log("Importer created, storing with lift...");

    // ✅ CORRECT: Return the lift function call
    return storeImporter({
      charm: importer,
      importersList: importersList as unknown as OpaqueRef<ImporterEntry[]>,
      selectedImporter,
      isInitialized: isInitialized as unknown as Cell<boolean>,
    });
  },
);

const selectImporter = handler<
  unknown,
  { selectedImporter: Cell<{ charm: any }>; charm: any }
>(
  (_, { selectedImporter, charm }) => {
    console.log("selectImporter: updating selection");
    selectedImporter.set({ charm });
  },
);

export default pattern<Input, Output>(
  ({ authCharm, importersList, selectedImporter }) => {
    const selected = selectedImporter.charm;
    const importersCount = derive(importersList, (list) => list?.length || 0);

    return {
      [NAME]: "Gmail Charm Creator",
      [UI]: (
        <ct-screen>
          <ct-toolbar slot="header" sticky>
            <div slot="start">
              <ct-button
                onClick={createGmailImporter({
                  authCharm,
                  importersList: importersList as unknown as OpaqueRef<
                    ImporterEntry[]
                  >,
                  selectedImporter,
                })}
              >
                📧 Create Gmail Importer
              </ct-button>
            </div>
          </ct-toolbar>

          <ct-autolayout leftOpen rightOpen={false}>
            <ct-screen>
              {selected ? <ct-render $cell={selected} /> : (
                <div
                  style={{
                    padding: "25px",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  <p>
                    No importer selected. Click "Create Gmail Importer" to get
                    started.
                  </p>
                </div>
              )}
            </ct-screen>

            <aside slot="left">
              <div style={{ padding: "15px" }}>
                <ct-heading level={3}>Gmail Importers</ct-heading>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    marginBottom: "15px",
                  }}
                >
                  {importersCount} importer(s) created
                </p>
              </div>
              <div role="list">
                {importersList.map((entry) => (
                  <ct-list-item
                    onct-activate={selectImporter({
                      selectedImporter,
                      charm: entry.charm,
                    })}
                  >
                    <span>Importer {entry.local_id}</span>
                  </ct-list-item>
                ))}
              </div>
            </aside>
          </ct-autolayout>
        </ct-screen>
      ),
      authCharm,
      importersList,
      selectedImporter,
    };
  },
);
