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

## 5. JSON Output

Pass `--json` to receive machine-readable output instead of the terminal report:

```bash
plugin-scanner scan --json
```

The top-level object contains `discovered`, `skipped_paths`, and `summary`. The `summary` field mirrors the `POST /api/scanner/scan` response and uses the same field names:

| Field | JSON key | Description |
|---|---|---|
| Known | `known` | Fully resolved entries |
| Unlinked | `unlinked` | Disk entries with no catalog match |
| Orphaned | `orphaned` | Catalog records with no disk entry in this scan |
| Needs Review | `needs_review` | Matches requiring user action |
| Excluded | `excluded` | Explicitly ignored disk entries |

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
| **Bulk Update** | Needs Review section header | Updates the catalog version for all user-selected rows in the Needs Review section to match the disk version. |
| **Confirm / Reject** | Needs Review | Confirm accepts the match; Reject returns the plugin to Unlinked. |
| **Create Record** | Unlinked | Creates a new catalog record from the scanned plugin data. |

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
