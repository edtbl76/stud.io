# Code-Review Stack

The AI code-review layer that runs on every STUD.io pull request. It sits **on top of** the static/test lane
(roadie's `test unit·pbt·scan·perf` + SonarQube on the weyland farm) — its job is **LLM contextual review**
(diff-aware, cross-file, natural-language) plus behavioral code-health, which SAST alone can't do. STUD.io is a
**public** GitHub repo (`edtbl76/stud.io`), so every tool here is on a free OSS/public tier.

This is the STUD.io side of the lab-wide review stack adopted in weyland **B106 / B118**; the weyland runbook is
`docs/runbooks/code-review-stack.md` in the weyland-lab repo. Both public repos run the same set.

## The two lanes

| Lane | Runs where | Tools | Why it works here |
|---|---|---|---|
| **PR / cloud** | Vendor infra, against the **public `edtbl76/stud.io`** repo | DeepSource · CodeScene · Sourcery · CodeRabbit · Qodo Merge · Greptile | Cloud GitHub Apps — GitHub pushes events *out* to them, so nothing needs to reach the LAN. $0 on a public repo. |
| **Local / interactive** | Claude Code session (working tree) | CodeScene (CodeHealth MCP) | Pre-PR hygiene against the working tree; complements the CI check. |

All six cloud Apps are **installed** on the repo (Greptile's GitHub-App access confirmed alongside `weyland-lab` +
`emangini-tailwind`). See [Greptile — installed, verify on next PR](#greptile--installed-verify-on-next-pr) for the one still to be observed reviewing.

## Live on every PR (verified — PR #121, 2026-08-19)

`gh pr checks 121 --repo edtbl76/stud.io` shows the stack posting checks:

| Tool | Config (committed) | What it posts | Evidence |
|---|---|---|---|
| **DeepSource** | `.deepsource.toml` | 7 analyzer checks — Python · JavaScript · Go · SQL · Secrets · Shell · Docker | `app.deepsource.com/gh/edtbl76/stud.io` |
| **CodeScene** | dashboard-config (project **78184**) | **Code Health Review** delta check (CI gate) | `codescene.io/projects/78184` |
| **Sourcery** | `.sourcery.yaml`† | Sourcery review check | `sourcery.ai` |
| **CodeRabbit** | `.coderabbit.yaml` | Summary + line-by-line review comments (`profile: chill`) | PR conversation |
| **Qodo Merge** (PR-Agent) | `.pr_agent.toml` + `best_practices.md` | `/describe` · `/review` · `/improve` | PR conversation |

† `.sourcery.yaml` may be absent while the App still reviews with defaults — add the file to pin rules if desired.

## CI → Port reliability signal (weyland B63)

Separately from review, each STUD.io Woodpecker run's terminal status reports to the weyland Port catalog's
`ci_pipeline` blueprint → the `weyland_ci_reliability` dashboard. This is wired in `.woodpecker/main.yml`
(`notify-port-pass` / `notify-port-fail`). See the weyland `runbooks/woodpecker.md` for the mechanism.

## CodeScene — two surfaces

CodeScene runs in **both** places, and they're complementary:

- **CI (SaaS):** the repo is registered as CodeScene **project 78184**; it posts a **Code Health Review** delta
  check on each PR (a real CI gate — it appears in `gh pr checks`).
- **Interactive (MCP):** the **CodeHealth MCP** (`codescene/codescene-mcp`) is wired in `.mcp.json` for Claude Code
  sessions (`code_health_review` / `analyze_change_set` / `pre_commit_code_health_safeguard`) against the working
  tree — a pre-PR check before the CI one runs. `CS_ACCESS_TOKEN` is in the environment.

> **Security note:** `.mcp.json` committed the CodeScene PAT (baselined in `.secrets.baseline`, flagged for
> rotation in `docs/arch/security.md`). Rotate it and switch to an env-referenced `${CS_ACCESS_TOKEN}` — the weyland
> repo took that approach deliberately.

## Greptile — installed, verify on next PR

- **Greptile** (codebase-aware LLM PR review, PR-native) is **installed** — its GitHub App has access to
  `edtbl76/stud.io` (alongside `weyland-lab` + `emangini-tailwind`). It was **absent from PR #121's check-runs**, and
  no Greptile comment/review appears on the recent PRs (#117–#121): it reviews via a **PR comment (not a check-run)**
  and typically activates only on **new PRs opened after install** (it may index the repo first). Nothing to install —
  **confirm it posts a review on the next human PR** (Dependabot/bot PRs like #121 are commonly skipped). App-only, no
  repo config file.

## Pointers
- Configs (repo root): `.deepsource.toml` · `.coderabbit.yaml` · `.pr_agent.toml` · `best_practices.md` · `.mcp.json`
- Standards source of truth: `best_practices.md` (mirrored into `CLAUDE.md` + the tool configs)
- GitHub/branch-protection: `docs/arch/github.md` · PR workflow: `docs/arch/workflow.md`
- Lab-wide stack + eval rationale: weyland-lab `docs/runbooks/code-review-stack.md` + `docs/backlog.md` B106/B118
