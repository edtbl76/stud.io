# Plugin Scanner — Setup Guide

The plugin-scanner binary scans macOS plugin directories and uploads your plugin inventory to ControlRoom.

## Prerequisites

- A running ControlRoom instance
- An admin account in StudioManagement
- macOS (Apple Silicon)

## 1. Generate an API Key

1. Log in to StudioManagement as an admin
2. Navigate to **Admin → Plugin Scanner**
3. Click **Generate API Key**
4. Copy the key immediately — it is shown once and cannot be retrieved again

## 2. Download the Binary

From the same page, click **Download (macOS Apple Silicon)** to get the latest release.

Move the binary to a directory on your PATH:

```bash
mv plugin-scanner /usr/local/bin/plugin-scanner
chmod +x /usr/local/bin/plugin-scanner
plugin-scanner --version
```

## 3. Configure the Binary

```bash
plugin-scanner auth set-key <your-api-key>
```

This stores the key in `~/.plugin-scanner.yml`. To configure the ControlRoom server URL:

```bash
plugin-scanner config set server_url https://your-controlroom-host
```

## 4. Run Your First Scan

```bash
plugin-scanner scan
```

The scanner walks all default macOS plugin paths (VST3, AU, VST2 — user and system) and uploads results to ControlRoom. A progress indicator updates in place during the upload.

## 5. Review Results

Open **ControlRoom → Plugin Scanner** to review the scan report. Results are grouped by status:

| Section | Description |
|---|---|
| Matched | Plugins confirmed against a ControlRoom record |
| Version Mismatches | Matched but disk version differs from catalog |
| Unconfirmed | Fuzzy matches awaiting review |
| Untracked | No match found — create a record or ignore |
| Orphaned | In ControlRoom but no longer on disk |

## Custom Scan Paths

Add paths to `~/.plugin-scanner.yml` under `scan_paths`:

```yaml
scan_paths:
  - /Library/Audio/Plug-Ins/VST3
  - ~/Library/Audio/Plug-Ins/Components
  - /Volumes/ExternalDrive/Plugins
```

If `scan_paths` is set, defaults are not auto-appended.

## Troubleshooting

**401 Unauthorized** — API key is invalid or revoked. Generate a new key in StudioManagement.

**Missing path warning** — A configured path does not exist on disk. Check your `scan_paths` config.

**Scan in progress indicator** — The ControlRoom report page polls every 5 seconds and refreshes automatically when the scan completes.
