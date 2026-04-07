/// <cts-enable />
// STUBBED during the commonfabric port. The original implementation hits a
// silent cf compiler crash that's hard to bisect. Owner needs to refactor
// against the new framework.
//
// Original preserved as hosting-tracker.tsx.broken for restoration.
import { NAME, pattern, UI } from "commonfabric";

const Stub = pattern<
  Record<string, never>,
  { [NAME]: string }
>(() => ({
  [NAME]: "Hosting Tracker (stub)",
  [UI]: <div>This pattern is temporarily stubbed during the commonfabric framework rename.</div>,
}));

export default Stub;
