/// <cts-enable />
import { Writable, Default, handler, NAME, pattern, str, UI } from "commonfabric";

/**
 * Test pattern for ct-tabs with $value cell binding
 *
 * Tests:
 * 1. Initial tab selection from cell value
 * 2. Tab switching updates cell
 * 3. Programmatic cell update changes selected tab (two-way binding)
 * 4. oncf-change event fires with value and oldValue
 */

interface TabsTestInput {
  activeTab: Default<string, "tab1">;
  changeCount: Default<number, 0>;
}

interface TabsTestOutput {
  activeTab: Default<string, "tab1">;
  changeCount: Default<number, 0>;
}

// Handler for tab change event - increment change counter
const onTabChange = handler<
  { value: string; oldValue: string },
  { changeCount: Writable<number> }
>((_, { changeCount }) => {
  changeCount.set((changeCount.get() || 0) + 1);
});

// Handler to programmatically switch to Tab 1
const switchToTab1 = handler<unknown, { activeTab: Writable<string> }>(
  (_, { activeTab }) => {
    activeTab.set("tab1");
  }
);

// Handler to programmatically switch to Tab 2
const switchToTab2 = handler<unknown, { activeTab: Writable<string> }>(
  (_, { activeTab }) => {
    activeTab.set("tab2");
  }
);

export default pattern<TabsTestInput, TabsTestOutput>(
  ({ activeTab, changeCount }) => {
    return {
      [NAME]: str`ct-tabs Test (${activeTab})`,
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h1>ct-tabs $value Test</h1>

          <div
            style={{
              marginBottom: "20px",
              padding: "10px",
              background: "#f0f0f0",
              borderRadius: "4px",
            }}
          >
            <strong>Debug Info:</strong>
            <div>
              Active Tab Cell Value: <code>{activeTab}</code>
            </div>
            <div>
              Change Count: <code>{changeCount}</code>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <strong>Programmatic Control (tests two-way binding):</strong>
            <div
              style={{ display: "flex", gap: "10px", marginTop: "8px" }}
            >
              <cf-button
                variant="outline"
                onClick={switchToTab1({ activeTab })}
              >
                Switch to Tab 1
              </cf-button>
              <cf-button
                variant="outline"
                onClick={switchToTab2({ activeTab })}
              >
                Switch to Tab 2
              </cf-button>
            </div>
          </div>

          <cf-tabs $value={activeTab} oncf-change={onTabChange({ changeCount })}>
            <cf-tab-list>
              <cf-tab value="tab1">Tab 1</cf-tab>
              <cf-tab value="tab2">Tab 2</cf-tab>
              <cf-tab value="tab3" disabled>
                Tab 3 (Disabled)
              </cf-tab>
            </cf-tab-list>
            <cf-tab-panel value="tab1">
              <cf-card>
                <h2>Tab 1 Content</h2>
                <p>This is the content for Tab 1. Click Tab 2 to switch.</p>
              </cf-card>
            </cf-tab-panel>
            <cf-tab-panel value="tab2">
              <cf-card>
                <h2>Tab 2 Content</h2>
                <p>
                  This is the content for Tab 2. The tab should be selected and
                  this panel visible.
                </p>
              </cf-card>
            </cf-tab-panel>
            <cf-tab-panel value="tab3">
              <cf-card>
                <h2>Tab 3 Content</h2>
                <p>This tab is disabled, so you shouldn't see this.</p>
              </cf-card>
            </cf-tab-panel>
          </cf-tabs>

          <div
            style={{
              marginTop: "20px",
              padding: "10px",
              background: "#e8f4e8",
              borderRadius: "4px",
            }}
          >
            <strong>Test Checklist:</strong>
            <ol>
              <li>
                Tab 1 should be selected by default (active cell starts as
                "tab1")
              </li>
              <li>
                Clicking Tab 2 should show Tab 2 content and update debug info
              </li>
              <li>"Switch to Tab 2" button should change tabs programmatically</li>
              <li>Tab 3 should be disabled and not clickable</li>
              <li>oncf-change should fire with value and oldValue</li>
            </ol>
          </div>
        </div>
      ),
      activeTab,
      changeCount,
    };
  }
);
