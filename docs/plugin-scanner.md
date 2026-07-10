# Plugin Scanner — Setup Guide

The plugin-scanner binary scans macOS plugin directories and uploads your plugin inventory to ControlRoom.

## Prerequisites

- A running ControlRoom instance accessible on your local network
- An admin account in StudioManagement
- macOS (Apple Silicon or Intel)

## 1. Generate an API Key

1. Log in to StudioManagement as an admin
2. Navigate to **Admin → Plugin Scanner**
3. Click **Generate API Key**
4. Copy the key immediately — it is shown once and cannot be retrieved again

## 2. Download and Install

From the same page, click **Download** to get the latest release zip.

Extract the zip and run the installer from the extracted directory:

```bash
unzip plugin-scanner-*.zip
cd plugin-scanner-*/
bash install.sh
```

The installer will:
- Detect your Mac architecture (Apple Silicon or Intel) and install the correct binary
- Add the install directory to your PATH
- Configure shell completion (zsh, bash, or fish)
- Print a `source` command to activate changes without restarting your shell

To remove the binary:

```bash
bash install.sh --uninstall
```

## 3. Configure the Binary

Set your API key:

```bash
plugin-scanner auth set-key <your-api-key>
```

If ControlRoom is not running on the same machine, set the server URL:

```bash
plugin-scanner config set server_url https://<controlroom-host>:5150
```

Verify your configuration:

```bash
plugin-scanner config show
```

## 4. Run Your First Scan

```bash
plugin-scanner scan
```

To preview what will be scanned without uploading:

```bash
plugin-scanner scan --dry-run
```

The scanner walks all default macOS plugin paths (VST3, AU, VST2 — user and system) and uploads results to ControlRoom. A progress indicator updates in place during the upload.

## 5. Exclusion Pre-filter

Before uploading, the binary fetches your exclusion list from ControlRoom and removes matching plugins from the upload payload. When the exclusion fetch succeeds, excluded plugins are not sent to the server. If the fetch fails (network error or HTTP 4xx/5xx), the binary falls back to uploading the full discovered list and the server applies exclusions during ingest (see **Failure behaviour** below).

**Matching** is exact and case-sensitive on both vendor and name. A plugin is only excluded when both fields match an exclusion entry exactly.

**Terminal output** shows an `Excluded (pre-upload)` line below "Total on disk":

```text
─────────────────────────────
  Total on disk            12
  Excluded (pre-upload)     3
```

This line is always shown, even when the count is 0.

**Dry-run behaviour**:
- If `server_url` and `api_key` are configured, exclusions are fetched and the filter is applied — the terminal output shows what would have been excluded without uploading anything.
- If `server_url` or `api_key` is empty (offline dry-run), the exclusion fetch is skipped and `Excluded (pre-upload)` shows 0.

**Failure behaviour**: The pre-filter is an optimization, not a correctness requirement — the server applies exclusions during ingest regardless. If the exclusion fetch fails (network error, 4xx, 5xx), the binary prints a warning to stderr and uploads the full discovered list. Excluded plugins are still filtered server-side, so the scan completes normally.

## 6. JSON Output

Pass `--json` to receive machine-readable output instead of the terminal report:

```bash
plugin-scanner scan --json
```

The top-level object contains `discovered`, `skipped_paths`, `pre_filter_excluded`, and `summary`. The `summary` field mirrors the `POST /api/scanner/scan` response and uses the same field names:

| Field | JSON key | Description |
|---|---|---|
| Discovered | `discovered` | All plugins found on disk |
| Pre-filter excluded | `pre_filter_excluded` | Plugins removed before upload (full objects); always an array, empty when none |
| Known | `summary.known` | Fully resolved entries |
| Unlinked | `summary.unlinked` | Disk entries with no catalog match |
| Orphaned | `summary.orphaned` | Catalog records with no disk entry in this scan |
| Needs Review | `summary.needs_review` | Matches requiring user action |
| Excluded | `summary.excluded` | Explicitly ignored disk entries (server bucket) |

Fields are emitted in this order. Zero-count buckets are always included.

## 6. Review Results

Open **ControlRoom → Plugin Scanner** to review the scan report. Results are grouped into five sections:

| Section | Description |
|---|---|
| Known | Fully resolved — plugin is matched and confirmed in the catalog |
| Unlinked | On disk but has no catalog match — create a record or exclude |
| Orphaned | In the catalog but not found on disk in this scan — may have been moved or uninstalled |
| Needs Review | Matched but requires user action (e.g. version mismatch or fuzzy match) |
| Excluded | Intentionally excluded from triage — remove here to restore active scanning |

## Triage Actions

| Action | Available on | What it does |
|---|---|---|
| **Acknowledge** | Known | Confirms you've reviewed the match and records a persistent link. |
| **Bulk Acknowledge** | Known section header | Acknowledges all results in the Known section at once. |
| **Override** | Unlinked, Needs Review | Opens a catalog search modal to manually link the plugin to any catalog record. |
| **Find Link** | Unlinked, Orphaned | Links a scan result to a catalog record. Writes a persistent per-plugin binding (`scanner_plugin_links`, keyed on the plugin fingerprint) — the same binding a Confirm writes, so the linked plugin resolves at the top ingest precedence on the next scan. The optional "Also add a normalization rule" checkbox additionally writes broad vendor/name normalization rules; it is unchecked by default, so a Find Link no longer reshapes matching for unrelated plugins unless you opt in (U-11). |
| **Bulk Update** | Needs Review section header | Updates the catalog version for all user-selected rows in the Needs Review section to match the disk version. |
| **Confirm / Reject** | Needs Review | Confirm accepts the match; Reject returns the plugin to Unlinked. |
| **Create Record** | Unlinked | Creates a new catalog record from the scanned plugin data. |
| **Set Name Alias** | Needs Review (single-row resolution) | Maps the raw disk name to the matched catalog record (`POST /scanner/aliases`), so future scans of that name resolve automatically (`confidence='exact'`). Independent of Save; the modal stays open. Re-aliasing the same name to a different record is rejected (409). This is the second direct alias-write path alongside pattern acknowledge-clean. |

### Row-click and selection (Scan Workbench)

Clicking a row on the Scan Workbench opens the appropriate action for that row's bucket, so a single click is a shortcut to the same modals reachable from the row action buttons:

| Bucket | Row click opens |
|---|---|
| Needs Review | Single-row resolution modal (editable) |
| Known | Match details (read-only inspect — no editing, no Save) |
| Collision | Collision resolution modal |
| Unlinked | Find Link modal |
| Excluded | Nothing (no resolution action) |
| Orphaned | Find Link modal (orphaned-to-unlinked; links the catalog record back to an unlinked scan result) |

Matched rows (Needs Review / Collision) surface the catalog record inline: fields that differ render as `disk → catalog` (e.g. `1.0.7 → 1.0.8`); known rows show no diff.

**Orphaned records** (catalog records not found on disk in the latest scan) are now first-class rows in the workbench with `bucket=orphaned` and empty disk fields (U-10), rather than a separate list. They sort and filter alongside every other bucket and carry the catalog record's identity; their Find Link action links them back to an unlinked scan result.

The header **Select all** checkbox toggles: clicking it selects every currently-visible (filtered) row, and clicking it again when all visible rows are already selected clears the selection.

## Custom Scan Paths

Add paths to `~/.plugin-scanner.yml` under `scan_paths`:

```yaml
scan_paths:
  - /Library/Audio/Plug-Ins/VST3
  - ~/Library/Audio/Plug-Ins/Components
  - /Volumes/ExternalDrive/Plugins
```

If `scan_paths` is set, defaults are not auto-appended.

## Shell Completion

The installer configures completion automatically. To set it up manually:

```bash
plugin-scanner completion zsh   # zsh
plugin-scanner completion bash  # bash
plugin-scanner completion fish  # fish
```

## Troubleshooting

**401 Unauthorized** — API key is invalid or revoked. Generate a new key in StudioManagement.

**Missing path warning** — A configured path does not exist on disk. Check your `scan_paths` config.

**TLS errors connecting to ControlRoom** — Your Mac may not trust the ControlRoom TLS certificate. Set `ca_cert_path` in `~/.plugin-scanner.yml` to point to the server's root CA certificate.

**Scan in progress indicator** — The ControlRoom report page polls every 5 seconds and refreshes automatically when the scan completes.
