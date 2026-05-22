# L3 — Plugin Scanner Binary Components

> Components inside the plugin-scanner macOS CLI binary.

```mermaid
graph LR
    subgraph scanner ["plugin-scanner binary"]
        main["CLI Entry"]
        scannerpkg["Scanner"]
        extractor["Metadata Extractor"]
        apiclient["API Client"]
        config["Config"]
    end

    backend(["FastAPI Backend"])
    filesystem(["macOS Filesystem"])

    main --> scannerpkg
    main --> apiclient
    main --> config
    scannerpkg -->|"WalkDir"| filesystem
    scannerpkg --> extractor
    apiclient -->|"POST /scanner/scan — Bearer psc_..."| backend
```

| Component | Technology | Role |
|---|---|---|
| CLI Entry | Go / Cobra | Root command — `scan`, `auth`, `version`, `config` subcommands |
| Scanner | Go | Concurrent directory walk per root; detects `.vst3`, `.component`, `.vst` |
| Metadata Extractor | Go | Reads `moduleinfo.json` (VST3), `Info.plist` (AU), bundle name (VST2) |
| API Client | Go / net/http | POSTs scan payload; Bearer API key; `X-Idempotency-Key`; 3-attempt backoff |
| Config | Go / YAML | Loads `~/.plugin-scanner.yml` — `api_key`, `server_url`, `machine_name`, `scan_paths` |
