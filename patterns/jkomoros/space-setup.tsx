/// <cts-enable />
// STUBBED during the commonfabric port. The original implementation hits a
// silent cf compiler crash that's hard to bisect. Owner needs to refactor
// against the new framework.
//
// Original preserved as space-setup.tsx.broken for restoration.
import { NAME, pattern, UI } from "commonfabric";

// deno-lint-ignore no-explicit-any
const Stub = pattern<any, { [NAME]: string }>(() => ({
  [NAME]: "Space Setup (stub)",
  [UI]: <div>This pattern is temporarily stubbed during the commonfabric framework rename.</div>,
}));

export default Stub;
