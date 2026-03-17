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
| **ADMIN** | Backup & Restore, Users *(admin role only)* |

The ADMIN section is hidden for users with the `user` role.

Your username and a sign-out button appear at the top of the sidebar.

---

## Table views

Each table opens as a full-page data table with:

- **Search bar** — filters rows in real time (debounced)
- **Sortable columns** — click any column header to sort ascending/descending
- **Resizable columns** — drag column borders to resize
- **Row virtualization** — large tables (Effects, Instruments, Libraries, Models) render only visible rows for performance
- **Record count** — shown below the table title

Click any row to open the record in a modal.

### Add button

Admins see an **Add** button in the top-right corner of every table. Click it to open a blank create form.

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
- Lookup fields (types, formats, tags) become multi-select dropdowns populated from the CONFIG tables
- `model_ids` and `parent_ids` are searchable multi-selects resolved by name
- `attributes` is a freeform JSON field
- The **Brand** field is read-only in edit mode (shown as a link)

Click **Save** to apply changes. Click **Cancel** to discard.

### Deleting (admin only)

In edit mode, a **Delete** button appears in the bottom-left of the footer. Clicking it once shows an "Are you sure?" confirmation — click **Confirm Delete** to proceed. This prevents accidental deletions.

If the record is referenced by other records in the database, the delete will be rejected with an explanatory error message.

---

## CONFIG tables

The CONFIG section manages the lookup values used throughout the app — effect types, tag types, plugin formats, etc. These are the values that appear in multi-select dropdowns when editing records.

Each config table works the same way as a regular table: browse, add, edit, delete. Changes take effect immediately in all dropdowns across the app.

---

## ADMIN section

### Backup & Restore

Download a full SQL dump of the `controlroomdb` database, or restore from a previously downloaded backup file.

- **Download Backup** — fetches a `.sql` dump and saves it to your downloads folder
- **Choose File** — select a `.sql` backup file from your machine
- **Restore Database** — uploads the selected file and restores the database (destructive — overwrites all current data)

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
