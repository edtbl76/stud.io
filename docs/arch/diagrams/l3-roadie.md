# L3 — Roadie CLI Components

> Components inside the Roadie CLI. Not a deployed service — runs on the developer's machine.

```mermaid
graph LR
    subgraph roadie ["Roadie CLI"]
        cli["CLI Entry"]
        stackcmds["Stack Commands"]
        buildcmds["Build Commands"]
        dbcmds["DB Commands"]
        testcmds["Test Commands"]
        doctorcmds["Doctor Commands"]
        stackmgr["Stack Manager"]
        pipeline["Pipeline Engine"]
        configloader["Config Loader"]
        providers["Providers"]
    end

    docker(["Docker Daemon"])

    cli --> stackcmds
    cli --> buildcmds
    cli --> dbcmds
    cli --> testcmds
    cli --> doctorcmds
    stackcmds --> stackmgr
    buildcmds --> pipeline
    buildcmds --> providers
    stackmgr --> providers
    stackmgr --> configloader
    buildcmds --> configloader
    dbcmds --> configloader
    providers -->|"docker compose"| docker
```

| Component | Technology | Role |
|---|---|---|
| CLI Entry | Go / Cobra | Root command with `--verbose`. Registers all subcommand groups. |
| Stack Commands | Go | `start`, `stop`, `restart`, `status` |
| Build Commands | Go | `build`, `release` — rebuilds images, applies schema, runs test suites |
| DB Commands | Go | `db init`, `db migrate` — first-time setup and incremental migrations |
| Test Commands | Go | `test unit/e2e/scan/perf/pbt/full` |
| Doctor Commands | Go | Prerequisite checks; automated fixes for secrets and agents |
| Stack Manager | Go | Orchestrates container lifecycle; health-polls every 2 s for up to 5 min |
| Pipeline Engine | Go | ToolStep + Pipeline; fatal-sequential and collect execution modes |
| Config Loader | Go / YAML | Reads and validates `roadie.yml` |
| Providers | Go | DockerProvider, PostgresProvider, HTTPChecker |
