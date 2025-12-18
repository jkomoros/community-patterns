/// <cts-enable />
// birthday-module.tsx - Birthday sub-charm for record pattern
import { Cell, type Default, handler, NAME, recipe, UI } from "commontools";

interface BirthdayInput {
  birthDate: Default<string, "">;
  birthYear: Default<number | null, null>;
}

interface BirthdayOutput {
  birthDate: Default<string, "">;
  birthYear: Default<number | null, null>;
  subCharmType: "birthday";
}

const BirthdayModule = recipe<BirthdayInput, BirthdayOutput>(
  "BirthdayModule",
  ({ birthDate, birthYear }) => {
    // Handler for year input (number conversion)
    const updateYear = handler<
      { detail: { value: string } },
      { birthYear: Cell<number | null> }
    >(({ detail }, { birthYear }) => {
      const val = detail?.value;
      birthYear.set(val ? parseInt(val, 10) : null);
    });

    return {
      [NAME]: "Birthday",
      [UI]: (
        <ct-vstack style={{ padding: "16px", gap: "16px" }}>
          <ct-vstack style={{ gap: "4px" }}>
            <label style={{ fontWeight: "600", fontSize: "14px" }}>
              Birth Date
            </label>
            <ct-input
              $value={birthDate}
              placeholder="YYYY-MM-DD (e.g., 1990-03-15)"
            />
            <span style={{ fontSize: "12px", color: "#6b7280" }}>
              Enter the full date if known
            </span>
          </ct-vstack>

          <ct-vstack style={{ gap: "4px" }}>
            <label style={{ fontWeight: "600", fontSize: "14px" }}>
              Birth Year
            </label>
            <ct-input
              type="number"
              value={birthYear ?? ""}
              onct-input={updateYear({ birthYear })}
              placeholder="1990"
            />
            <span style={{ fontSize: "12px", color: "#6b7280" }}>
              Used for age calculation
            </span>
          </ct-vstack>
        </ct-vstack>
      ),
      birthDate,
      birthYear,
      subCharmType: "birthday" as const,
    };
  },
);

export default BirthdayModule;
