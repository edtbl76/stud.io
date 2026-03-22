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
| **ADMIN** | Stats, Change Review, Backup & Restore, Users *(admin role only)* |

The ADMIN section is hidden for users with the `user` role.

Your username and a sign-out button appear at the top of the sidebar.

---

## Table views

Each table opens as a full-page data table with:

- **Search bar** — filters rows in real time (debounced)
- **Sort controls** — a sort dropdown and direction toggle in the toolbar (see below)
- **Resizable columns** — drag column borders to resize
- **Column picker** — the **Columns** button toggles individual columns on/off
- **Row virtualization** — large tables (Effects, Instruments, Libraries, Models) render only visible rows for performance
- **Record count** — shown below the table title

Click any row to open the record in a modal.

### Sorting

The toolbar contains two sort controls:

- **Direction toggle** — the arrow button (↑/↓) switches between ascending and descending order. The arrow reflects the current direction.
- **Sort field dropdown** — the button showing the current field name opens a menu of available sort fields. Select any field to sort by it. You can sort by fields that are not displayed as columns (for example, sort instruments by brand name even though only the full instrument name appears in the table).

Non-paginated tables (Brands, Workstations, and all Tools tables) sort client-side. Paginated tables (Effects, Instruments, Libraries, Models) re-fetch from the server whenever the sort changes.

### Add button

Admins see an **Add** button in the top-right corner of every table. Click it to open a blank create form.

### Bulk edit (admin only)

Content tables (Brands, Models, Effects, Instruments, Libraries, Workstations, and the five Tool tables) show a checkbox column. Select one or more rows to open the bulk edit bar at the top of the table.

The bulk edit bar lets you set a single field to the same value across all selected records:

1. Pick a field from the **Set field** dropdown — only fields appropriate for bulk editing are offered (never names or descriptions)
2. Enter or select the new value
3. Click **Apply to N** — the change is applied to each selected record via individual PATCH requests

For **multiselect fields** (tags, types), the new value is merged into each record's existing values — existing values are preserved and duplicates are deduplicated.

For **single-select fields** (entity type, model type, etc.), the selected value replaces the existing value.

For **text fields** (version, collection, etc.), the typed value replaces the existing value.

### Bulk delete (admin only)

A **Delete N** button appears on the right side of the bulk edit bar. Clicking it shows an "Are you sure?" confirmation — click **Confirm Delete N** to proceed. Records are deleted concurrently; if any individual delete fails (e.g. the record is still referenced elsewhere), the rest continue and a summary of failures is shown.

Click the **×** next to the count to clear the selection without applying changes.

CONFIG tables do not have a checkbox column — bulk edit and bulk delete are not available there.

---

## Record modal

Clicking a row opens a read-only modal showing all fields for that record.

- **Lookup fields** (types, formats, tags) display as labeled badges
- **Parent references** show the table name and record name
- **Dates** are formatted to local time

### Editing (admin only)

Admins see an **Edit** button in the modal footer. Click it to switch to edit mode.

In edit mode:
- Text fields become inputs
- **Brand** — typeahead search field: start typing to search existing brands and select one. If the brand doesn't exist yet, a **Create "..."** option appears. Clicking it opens an inline form to create the brand on the spot.
- Lookup fields (types, formats, tags) become multi-select dropdowns populated from the CONFIG tables
- `model_ids` and `parent_ids` are searchable multi-selects resolved by name
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
| `user` | Read-only — can browse and search all tables; no Add/Edit/Delete controls; no ADMIN section |

Role enforcement happens at both the API layer and the UI layer.
