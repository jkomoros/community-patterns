// Stub: the original shopping-list-launcher pattern was deleted but
// page-creator.tsx still imports it. This stub keeps the importer
// type-checking until the dead reference is dropped.
import { NAME, pattern, UI } from "commonfabric";

const ShoppingListLauncher = pattern<
  Record<string, never>,
  { [NAME]: string }
>(() => ({
  [NAME]: "Shopping List Launcher (stub)",
  [UI]: <div>Shopping List Launcher has been removed.</div>,
}));

export default ShoppingListLauncher;
