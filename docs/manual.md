# User Manual

## Logging in

Navigate to `https://localhost:2112`. You'll be presented with a username/password form.

Default credentials: `admin` / `admin` (seeded automatically on first startup).

**Google Sign-In** is available if `GOOGLE_CLIENT_ID` is configured in `docker-compose.yml`. Click the Google button to authenticate via your Google account. You can also link a Google account to an existing username/password account from the Users admin page.

---

## Navigation

The sidebar on the left organizes the app into five sections. Each section is collapsible — click the section header to expand or collapse it.

| Section | Tables |
|---|---|
| **CATALOG** | Brands, Models |
| **SESSION** | Effects, Instruments, Libraries, Workstations |
| **TOOLS** | Admin, Composition, Measurement, Reference, Workflow |
| **CONFIG** | Effect Types, Entity Types, Instrument Types, Model Types, Plugin Formats, Tag Types, Tool Types |
| **ADMIN** | Stats, Change Review, Import / Export, Backup & Restore, Users *(admin role only)* |

The ADMIN section is hidden for users with the `user` role.

A **Global search** input sits at the top of the sidebar, above the navigation sections. Type a query and press Enter to navigate to the search results page.

Your username and a sign-out button appear at the top of the sidebar.

---

## Global search

Type any query (minimum 2 characters) into the search box in the sidebar and press Enter. The app navigates to `/search?q=<query>` and shows matching records from all 11 content tables (Brands, Models, Effects, Instruments, Libraries, Workstations, and all five Tool tables).

Results are ranked by relevance. Each result shows the record name, brand (where applicable), and the source table. Click any result to navigate to that table and open the record in a modal.

**Tabs** — the results page shows an **All** tab and one tab per table that has matches. Click a tab to narrow results to that table only.

**Include notes & descriptions** — a toggle at the top of the results page extends the search to include description, notes, and reference fields. Off by default to keep results focused on names.

---

## Table views

Each table opens as a full-page data table with:

- **Per-column filters** — a filter input appears beneath each column header. Type at least 2 characters to filter (debounced 350 ms). Wrap a value in double quotes (e.g. `"ab"`) to bypass the 2-character minimum. Click the **×** inside a filter input to clear that column. The **Clear filters** button in the toolbar removes all active filters at once.
- **Sort controls** — a sort dropdown and direction toggle in the toolbar (see below)
- **Resizable columns** — drag column borders to resize
- **Column picker** — the **Columns** button toggles individual columns on/off. Some columns (e.g. **Parents**) are hidden by default to keep the table uncluttered — enable them here when needed for bulk work or sorting
- **Row virtualization** — all content tables render only visible rows for performance
- **Record count** — shown below the table title

Click any row to open the record in a modal.

### Sorting

The toolbar displays active sort levels as **sort pills**. Each pill shows the field name and a direction arrow (↑/↓).

- **Direction toggle** — click the arrow on any pill to flip it between ascending and descending.
- **Remove** — click the **×** on a pill to remove that sort level.
- **Add sort level** — click the **+** button to open a dropdown of available fields and add a secondary (or tertiary) sort level. Up to 3 sort levels are supported. The dropdown only shows fields not already active.

All content tables (Brands, Models, Effects, Instruments, Libraries, Workstations, and the five Tool tables) fetch data from the server and re-fetch whenever sort values change. CONFIG lookup tables sort client-side.

Every content table supports **Updated** (sort by last edit date) and **Added** (sort by creation date) as sort options. Use these to quickly surface records that were recently changed or imported.

### Add button (admin only)

An **Add** button appears to the right of the table title and record count. Click it to open a blank create form for that table.

### Bulk edit (admin only)

Content tables (Brands, Models, Effects, Instruments, Libraries, Workstations, and the five Tool tables) show a checkbox column. Select one or more rows to open the bulk edit bar at the top of the table.

The bulk edit bar lets you set a single field to the same value across all selected records:

1. Pick a field from the **Set field** dropdown — only fields appropriate for bulk editing are offered (never names or descriptions)
2. Enter or select the new value
3. Click **Apply to N** — the change is applied to each selected record via individual PATCH requests

For **multiselect fields** (tags, types), the new value is merged into each record's existing values — existing values are preserved and duplicates are deduplicated.

For **single-select fields** (entity type, model type, etc.), the selected value replaces the existing value.

For **text fields** (version, collection, etc.), the typed value replaces the existing value.

For **Parents**, a search box appears. Existing parents across all selected records are shown as chips — remove a chip to unassign that parent from all selected records, or search to add a new parent to all of them. Apply merges additions and applies removals per-record non-destructively (parents unique to one record and not shown in the union are left untouched).

### Bulk delete (admin only)

A **Delete N** button appears on the right side of the bulk edit bar. Clicking it shows an "Are you sure?" confirmation — click **Confirm Delete N** to proceed. Records are deleted concurrently; if any individual delete fails (e.g. the record is still referenced elsewhere), the rest continue and a summary of failures is shown.

Click the **×** next to the count to clear the selection without applying changes.

CONFIG tables do not have a checkbox column — bulk edit and bulk delete are not available there.

---

## Record modal

Clicking a row opens a read-only modal showing all fields for that record.

- **Lookup fields** (types, formats, tags) display as labeled badges
- **Models** (Effects, Instruments, Libraries) — associated hardware models display as clickable chips. Click any chip to open that model's full detail modal as an overlay — no page navigation.
- **Parents** (Effects, Instruments, Libraries) — parent records display with their table name and record name
- **Dates** are formatted to local time

### Editing (admin only)

Admins see an **Edit** button in the modal footer. Click it to switch to edit mode.

In edit mode:
- Text fields become inputs
- **Brand** — typeahead search field: start typing to search existing brands and select one. If the brand doesn't exist yet, a **Create "..."** option appears. Clicking it opens an inline form to create the brand on the spot.
- **Models** (Effects, Instruments, Libraries) — typeahead multi-select: start typing a model name (or brand prefix, e.g. "Universal Audio") to search. Click a result to add it; click again to remove it. Selected models appear as removable badges below the search field. To create a new model, use the Models table first.
- **Parents** (Effects, Instruments, Libraries) — typeahead multi-select: search for any effect, instrument, or library to assign as a parent. Recently used parents appear when the field is focused with an empty query. Selected parents appear as removable chips. A record cannot select itself as a parent.
- Lookup fields (types, formats, tags) become multi-select dropdowns populated from the CONFIG tables
- `attributes` is a freeform JSON field

Click **Save** to apply changes. Click **Cancel** to discard.

### Deleting (admin only)

A **Delete** button appears in the bottom-left of the modal footer in both view mode and edit mode. Clicking it once shows an "Are you sure?" confirmation — click **Confirm Delete** to proceed. This prevents accidental deletions.

If the record is referenced by other records in the database, the delete will be rejected with an explanatory error message.

### Record history

A **History** button appears in the modal footer (view mode only) for any existing record. Click it to view the full audit trail for that record.

The history view shows all changes in reverse chronological order, with:

- **Operation badge** — `CREATE`, `UPDATE`, or `DELETE`
- **Timestamp** and **user** who made the change
- **Diff** (UPDATE only) — shows only the fields that changed, with old value → new value
- **Undo button** (admin only) — reverses a change that has not yet been acknowledged or undone. On success the modal closes and the table refreshes.
- **Acknowledged** / **Undone** badge — shown when the entry has already been resolved

Close returns to the read-only view of the record.

---

## CONFIG tables

The CONFIG section manages the lookup values used throughout the app — effect types, tag types, plugin formats, etc. These are the values that appear in multi-select dropdowns when editing records.

Each config table works the same way as a regular table: browse, add, edit, delete. Changes take effect immediately in all dropdowns across the app.

---

## ADMIN section

### Stats

A dashboard showing row counts for all tables, grouped by Catalog, Session, Tools, and Config. Tables with pending changes (unacknowledged creates, updates, or deletes) show an annotation indicating how many entries await review.

### Change Review

A paginated audit log of all changes made through the app. Shows each create, update, or delete with the table, record name, operation, user, and timestamp.

- **Filters** — filter by table, operation (`CREATE`/`UPDATE`/`DELETE`), and status (`Pending`/`Acknowledged`/`Undone`/`All`)
- **Acknowledge** — mark an entry as reviewed. Does not reverse the change.
- **Undo** — reverses the original operation: hard-deletes a created record, restores the previous state for an update, or un-deletes a soft-deleted record.
- **Permanent Delete** (DELETE entries only) — hard-deletes the soft-deleted record. Irreversible.

### Import / Export

Bulk data movement via `.xlsx` files. All three operations are admin-only.

#### Export Data

Select the tables you want and click **Export Data**. The file downloads immediately with one sheet per table. Each sheet contains a header row followed by all non-deleted records. ID columns are included so exported records can be round-tripped back in as updates.

#### Download Template

Same table selector, click **Download Template**. The file has headers but no data rows. Lookup fields (Brand, Effect Types, Tags, etc.) include Excel dropdown validation populated from the current live values — this helps avoid typos that would fail import validation.

#### Import

Upload a filled template (or a previously exported file) and click **Import**.

- Rows **without** an ID column create new records.
- Rows **with** an ID column update the matching existing record.
- Lookup fields are matched by name (case-insensitive). If a name doesn't match exactly, the import fails with a validation error that includes a "did you mean?" suggestion for close matches.
- **Nothing is imported if any row has a validation error** — fix all errors first, then re-upload.
- On success, a summary table shows how many records were created and updated per sheet.
- `attributes` fields are imported/exported as raw JSON strings.

### Backup & Restore

Download a full SQL dump of the `controlroomdb` database, or restore from a previously downloaded backup file.

- **Download Backup** — fetches a `.sql` dump (filename: `controlroomdb_<timestamp>.sql`) and saves it to your downloads folder. The file includes an embedded verification manifest (row counts and content hashes per table).
- **Restore Database** — select a `.sql` backup file and click Restore to overwrite the current database. Destructive and irreversible — back up first.
- **Verify Backup** — select a backup file to confirm it is intact. The file is restored to a temporary database, content hashes are recomputed and compared against the embedded manifest, then the temporary database is dropped. Results show pass/fail per table with row counts and hash status. Only works with backups downloaded from this app (older files without a manifest return an error).

### Users *(admin role only)*

Manage application user accounts.

**Adding a user:** Enter a username and password in the form at the top and click **Add User**.

**Changing a password:** Click the key icon on any user row to expand an inline password form. Enter the new password and click **Save**.

**Toggling a role:** Click the role badge button on any user row to switch between `admin` and `user`.

**Deleting a user:** Click the trash icon on any user row.

**Google account linking:** If Google Sign-In is enabled, a Google icon appears on each user row. Click it to send the user a link flow that connects their Google account.

You cannot delete or change the role of your own account (the row is disabled to prevent accidental lockout).

---

## Roles

| Role | Capabilities |
|---|---|
| `admin` | Full read/write access — can create, edit, and delete all records; access to ADMIN section |
| `user` | Read-only — can browse, filter, and search all tables; no Add/Edit/Delete controls; no ADMIN section |

Role enforcement happens at both the API layer and the UI layer.
