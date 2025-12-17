/// <cts-enable />
import { Cell, Default, handler, NAME, recipe, str, UI } from "commontools";

/**
 * Test pattern for ct-tabs with $value cell binding
 *
 * Tests:
 * 1. Initial tab selection from cell value
 * 2. Tab switching updates cell
 * 3. Programmatic cell update changes selected tab (two-way binding)
 * 4. onct-change event fires with value and oldValue
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
  { changeCount: Cell<number> }
>((_, { changeCount }) => {
  changeCount.set((changeCount.get() || 0) + 1);
});

// Handler to programmatically switch to Tab 1
const switchToTab1 = handler<unknown, { activeTab: Cell<string> }>(
  (_, { activeTab }) => {
    activeTab.set("tab1");
  }
);

// Handler to programmatically switch to Tab 2
const switchToTab2 = handler<unknown, { activeTab: Cell<string> }>(
  (_, { activeTab }) => {
    activeTab.set("tab2");
  }
);

export default recipe<TabsTestInput, TabsTestOutput>(
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
              <ct-button
                variant="outline"
                onClick={switchToTab1({ activeTab })}
              >
                Switch to Tab 1
              </ct-button>
              <ct-button
                variant="outline"
                onClick={switchToTab2({ activeTab })}
              >
                Switch to Tab 2
              </ct-button>
            </div>
          </div>

          <ct-tabs $value={activeTab} onct-change={onTabChange({ changeCount })}>
            <ct-tab-list>
              <ct-tab value="tab1">Tab 1</ct-tab>
              <ct-tab value="tab2">Tab 2</ct-tab>
              <ct-tab value="tab3" disabled>
                Tab 3 (Disabled)
              </ct-tab>
            </ct-tab-list>
            <ct-tab-panel value="tab1">
              <ct-card>
                <h2>Tab 1 Content</h2>
                <p>This is the content for Tab 1. Click Tab 2 to switch.</p>
              </ct-card>
            </ct-tab-panel>
            <ct-tab-panel value="tab2">
              <ct-card>
                <h2>Tab 2 Content</h2>
                <p>
                  This is the content for Tab 2. The tab should be selected and
                  this panel visible.
                </p>
              </ct-card>
            </ct-tab-panel>
            <ct-tab-panel value="tab3">
              <ct-card>
                <h2>Tab 3 Content</h2>
                <p>This tab is disabled, so you shouldn't see this.</p>
              </ct-card>
            </ct-tab-panel>
          </ct-tabs>

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
              <li>onct-change should fire with value and oldValue</li>
            </ol>
          </div>
        </div>
      ),
      activeTab,
      changeCount,
    };
  }
);
