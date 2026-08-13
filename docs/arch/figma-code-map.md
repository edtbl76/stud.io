# Figma ↔ Code Map

Manual mapping between the **STUD.io Control Room — Design System** Figma file and the frontend code. This is the free stand-in for Figma Code Connect (which needs an Organization/Enterprise plan). It gives developers and codegen agents the same design↔code correspondence — just without the in-Dev-Mode popup.

- **Figma file:** `6hIFn4zcB1qBwwetAlDRGa` — open a component with `https://www.figma.com/design/6hIFn4zcB1qBwwetAlDRGa/?node-id=<NODE-ID>` (replace the `:` in the node id with `-`, e.g. `6017:1391` → `6017-1391`).
- **Code root:** `app/studio_frontend/`
- **Palette note:** the Figma file uses a Matrix black/green re-skin (the `ux-redesign` initiative); the code is still blue (`--primary 217 91% 60%`). Structure maps 1:1; color is the intended redesign delta.

## Legend
- **✅ exists** — the Figma component maps to a real code component today.
- **🆕 proposed** — the Figma component is a *new shared primitive* the redesign introduces; no code equivalent yet (these are the audit's "missing shared primitives", RC-2). Build these in code as part of the redesign.

---

## Chrome / layout

| Figma component | Node ID | Code source | Export | Status |
|---|---|---|---|---|
| TopBar | `6017:1391` | `components/layout/TopBar.tsx` | `TopBar` | ✅ |
| Sidebar — ControlRoom | `6017:1398` | `components/layout/Sidebar.tsx` (+ `SidebarShell.tsx`, `SidebarNav.tsx`) | `Sidebar` | ✅ |
| Sidebar — Studio Management | `6073:2` | `components/layout/UsersSidebar.tsx` | `UsersSidebar` | ✅ |
| Sidebar — GearList | `6073:69` | `components/layout/GearListSidebar.tsx` | `GearListSidebar` | ✅ |
| (Sidebar footer, in every sidebar) | — | `components/layout/ModuleSwitcher.tsx` | `ModuleSwitcher` | ✅ |
| PageHeader | `6003:1392` | header block inline in `components/TablePage.tsx` | — | 🆕 (extract as `<PageHeader>`, audit move 2) |

## Data table stack

The Figma screens build the table inline; these are the code components that back that structure.

| Figma element | Node / location | Code source | Export | Status |
|---|---|---|---|---|
| Data table shell | RAVN `210:6034`; built inline on screens | `components/DataTable.tsx` | `DataTable` | ✅ |
| Toolbar (sort chips / add-sort / Columns) | inline `DataTableToolbar` frame | `components/DataTableToolbar.tsx` | `DataTableToolbar` | ✅ |
| Header + filter row | inline `HeaderRow`/`FilterRow` | `components/DataTableHeader.tsx` | `DataTableHeader` | ✅ |
| Body / rows | inline `Row` frames | `components/DataTableBody.tsx` | `DataTableBody` | ✅ |
| Per-column filter cell | inline `inp` in filter row | `components/FilterCell.tsx` | `FilterCell` | ✅ |
| Bulk edit bar | inline `BulkBar` (workbench) | `components/BulkEditBar.tsx` | `BulkEditBar` | ✅ |
| Field row (view mode) | inside RecordModal `FieldRow` | `components/FieldRow.tsx` | `FieldRow` | ✅ |
| Type badges | inline `badge` frames | `components/TypeBadges.tsx` | `TypeBadges` | ✅ |

## Modals & dialogs

| Figma component | Node ID | Code source | Export | Status |
|---|---|---|---|---|
| RecordModal | `6005:1391` | `components/RecordModal.tsx` (+ `lib/useRecordModal.ts`) | `RecordModal` | ✅ |
| CollisionModal | `6006:1391` | `components/tables/scanner/modals/CollisionModal.tsx` | `CollisionModal` | ✅ |
| SingleResolutionModal | `6014:1391` | `components/tables/scanner/modals/SingleResolutionModal.tsx` | `SingleResolutionModal` | ✅ |
| FindLinkModal | `6014:1411` | `components/tables/scanner/modals/FindLinkModal.tsx` | `FindLinkModal` | ✅ |
| BulkConfirmDialog | `6016:1391` | `components/tables/scanner/workbench/BulkConfirmDialog.tsx` | `BulkConfirmDialog` | ✅ |
| HardResetDialog | `6016:1404` | `components/tables/scanner/modals/HardResetDialog.tsx` | `HardResetDialog` | ✅ |
| NewKeyModal | `6016:1419` | `components/tables/scanner/NewKeyModal.tsx` | `NewKeyModal` | ✅ |
| RuleCreationForm (pattern) | `6141:20` | `components/tables/scanner/rules/RuleCreationForm.tsx` (`ruleType=pattern`) | `RuleCreationForm` | ✅ |
| AddRuleMapping (vendor/name) | `6141:2` | `components/tables/scanner/rules/RuleCreationForm.tsx` (`ruleType=vendor` \| `name`) | `RuleCreationForm` | ✅ |
| _(no Figma yet)_ CreateRecordModal | — | `components/tables/scanner/modals/CreateRecordModal.tsx` | `CreateRecordModal` | build Figma composite |
| _(no Figma yet)_ RevokeConfirmModal | — | `components/tables/scanner/RevokeConfirmModal.tsx` | `RevokeConfirmModal` | build Figma composite |
| _(no Figma yet)_ DiffModal | — | `components/DiffModal.tsx` | `DiffModal` | build Figma composite |
| ConfirmDialog | `6013:1401` | — | — | 🆕 (one shared confirm, gates user-delete; audit move 4) |
| FormField | `6012:1391` | — | — | 🆕 (audit RC-2 / move 5) |
| ErrorBanner | `6012:1395` | — | — | 🆕 (copy-pasted 10×, audit C4) |
| StatusMessage | `6012:1398` | — | — | 🆕 (copy-pasted, audit Fn11) |
| EmptyState | `6013:1391` | — | — | 🆕 (8 variants today, audit C9) |
| LoadingState | `6013:1397` | — | — | 🆕 (Loader2 vs Skeleton split, audit C10) |

### Entity modals — one Figma component, many code files
The Figma **RecordModal** (`6005:1391`) represents all 9 catalog entity modals (they share the `RecordModal` shell + `useRecordModal`):

`components/tables/{effects/EffectModal, instruments/InstrumentModal, libraries/LibraryModal, workstations/WorkstationModal, tools/ToolModal, brands/BrandModal, models/ModelModal, config/ConfigModal, gear/GearModal}.tsx`

## UI primitives (RAVN shadcn kit → code)

| Figma component | Node ID | Code source | Export | Status |
|---|---|---|---|---|
| Button | `139:288` | `components/ui/button.tsx` | `Button` | ✅ |
| Badge | `96:527` | `components/ui/badge.tsx` | `Badge` | ✅ |
| Input | `172:990` | `components/ui/input.tsx` | `Input` | ✅ |
| Textarea | `210:6057` | `components/ui/textarea.tsx` | `Textarea` | ✅ |
| Dialog | `210:6035` | `components/ui/dialog.tsx` | `Dialog` (+ parts) | ✅ |
| Select | `210:6048` | `components/ui/NativeSelect.tsx`, `MultiSelect.tsx` | `NativeSelect` / `MultiSelect` | ✅ |
| Skeleton | `210:6051` | `components/ui/skeleton.tsx` | `Skeleton` | ✅ |
| Separator | `210:6049` | `components/ui/separator.tsx` | `Separator` | ✅ |
| Label | `210:6042` | `components/ui/label.tsx` | `Label` | ✅ |
| Checkbox | `210:6025` | native `<input type="checkbox" className="accent-primary">` (no `ui/checkbox.tsx`) | — | ✅ (native) |

Async search-selects (no dedicated Figma variants; use the Select mapping): `components/ui/{BrandSelect, ModelSelect, ModelSelectSingle, ParentSelect}.tsx`.

## Design tokens

Figma `Tokens` collection (Dark mode `21:0`) ↔ `app/globals.css` CSS custom properties. 13 semantic tokens: `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`, `--ring`, `--sidebar-bg`, `--sidebar-border`, `--card`. (The redesign also proposes spacing/radius/type/status token scales — audit move 1.)

---

## How to use this without Code Connect
- **Design → code (works on pro plan):** point the Figma MCP `get_design_context` at a screen/component node; generated code is more useful when you tell it to reuse the code component from the table above.
- **Keeping it current:** when you add/rename a Figma component or a code component, update the matching row here. Treat this file as the source of truth for the correspondence.
- **If you upgrade to Organization/Enterprise:** these rows convert directly into Code Connect `.figma.ts` templates (node id + source + component are exactly what Code Connect needs).
