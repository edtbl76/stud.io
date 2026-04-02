# Development Workflow

## Model: Trunk-Based Development with PR Gates

All work targets `main` directly — there is no long-lived `develop` or `release` branch. Each unit of work lives in a **short-lived feature branch** (hours to 1–2 days) that merges to `main` via pull request.

This preserves TBD discipline (frequent integration, always-shippable trunk) while adding a review and gate point before code lands on main.

---

## Branch Naming

| Prefix | Use |
|---|---|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `chore/` | Dependency updates, tooling, config |
| `docs/` | Documentation only |
| `refactor/` | Refactoring with no behavior change |

Examples: `feat/reverb-unit`, `fix/auth-timeout`, `chore/upgrade-next`.

Keep branch names short and lowercase with hyphens.

---

## Workflow Step by Step

```bash
# 1. Branch off main
git checkout -b feat/my-change

# 2. Implement + test
./scripts/test-unit.sh
./scripts/test-e2e.sh

# 3. Commit
git add <files>
git commit -m "feat: my change"

# 4. Push and open PR
git push -u origin feat/my-change
gh pr create --title "feat: my change" --fill

# 5. Watch checks and AI reviews
# CodeRabbit and Qodo Merge post reviews automatically — no action needed.
gh pr checks --watch

# 6. Merge (squash)
gh pr merge --squash --delete-branch

# 7. Pull main
git checkout main && git pull
```

---

## Pre-Merge Checklist

Before opening a PR, run locally:

```bash
./scripts/test-unit.sh   # tsc + jest + pytest
./scripts/test-e2e.sh    # Playwright shards
```

For security-sensitive changes or before a release:

```bash
./scripts/test-scan.sh   # Sonar, Trivy, detect-secrets, headers
./build.sh --release     # full release gate
```

---

## Merge Strategy

**Squash merge only.** Every PR squashes to a single commit on `main`. Keeps trunk history linear — one commit per feature or fix.

Squash commit message format (present tense, no period):
```
feat: add reverb unit search
fix: auth session timeout on idle tabs
chore: upgrade Next.js to 16.x
```

---

## Bazel + CI

The project uses Bazel (via bazelisk, pinned in `.bazelversion`) as the build system. A self-hosted GitHub Actions runner (co-located with the Docker stack) executes the `.github/workflows/pr-gate.yml` workflow on every PR.

### Target quick reference

| Command | What runs |
|---|---|
| `bazel test //:unit` | Hermetic checks only — tsc, jest, ruff, bandit (no infrastructure needed) |
| `bazel test //app/controlroom_backend/tests:pytest` | pytest (requires live PostgreSQL) |
| `bazel test //app/controlroom_frontend/e2e:playwright` | Playwright E2E (requires Docker stack) |
| `bazel test //tests:scan_sonar` | SonarQube scan + quality gate |
| `bazel test //tests:scan_trivy` | Trivy image scan |
| `bazel test //tests:scan_secrets` | detect-secrets audit |
| `bazel test //tests:perf` | Full performance suite |
| `bazel run //:buildifier` | Format all BUILD files |

Use `--config=dev` locally for disk caching: `bazel test --config=dev //:unit`.

### PR gate jobs (5 jobs)

```
hermetic (tsc · jest · ruff · bandit)
  ├── backend-tests (pytest)      ─┐
  └── security-scans (sonar·trivy·secrets) ─┘  → e2e → perf (main only)
```

Jobs 2 and 3 run in parallel after Job 1 passes. Job 4 (E2E) is gated on both.
Job 5 (perf) runs only on push to `main` and is non-blocking.

### Self-hosted runner prerequisites

The runner is on the same machine as the Docker stack. One-time setup before registering:
- `./scripts/reset-test-db.sh` — provision `controlroomdb_test` once
- `npx playwright install chromium` — install Playwright browsers once
- `SONAR_TOKEN` GitHub secret — contents of `.sonar-token` (used in security-scans job)

The workflow calls `./roadie.sh start` or `./roadie.sh start --dev` at the start of each infra job, so the Docker stack does not need to be manually kept running — CI restarts it after reboots automatically.

Runner label: `self-hosted, linux, controlroom-runner`

---

## GitHub-side tooling

On every PR, two AI reviewers run automatically alongside CI:

- **CodeRabbit** — line-by-line review against project standards (config: `.coderabbit.yaml`)
- **Qodo Merge** — review, code suggestions, and PR description generation (config: `.pr_agent.toml`)

Both review against the same standards defined in `best_practices.md`. Neither requires a local command — they trigger on PR open/update via GitHub Apps.

Full GitHub configuration (repo settings, branch protection, installed apps): `docs/arch/github.md`.

---

## CodeScene (local, interactive)

CodeScene is available as an MCP tool inside Claude Code sessions. It analyzes code health and technical debt directly from the working tree — no project setup on codescene.io required for the tools below.

**When to use:**

| Situation | Tool |
|---|---|
| Before opening a PR — check if changed files degraded code health | `pre_commit_code_health_safeguard` |
| Reviewing a diff or change set for complexity/hotspot risk | `analyze_change_set` |
| Spot-checking a specific file's health score | `code_health_score` |
| Getting a detailed review of a file (complexity, duplication, coupling) | `code_health_review` |

**How to invoke (in a Claude Code session):**

Ask Claude to run a CodeScene check — for example:
- "Run a CodeScene health check on the files I just changed"
- "Check the code health of `app/controlroom_frontend/lib/auth.tsx`"
- "Analyze the change set for this PR"

Claude will call the appropriate MCP tool and surface the results inline.

**Not a CI gate.** These tools run interactively in Claude Code and are not wired into `test-scan.sh`. Use them as a pre-PR hygiene check, not a blocking step. If a file consistently scores low, treat it as a refactor candidate.

**Credentials:** `CS_ACCESS_TOKEN` is configured in the environment. No additional setup needed.

---

## Release Tagging

When `main` is ready to ship:

```bash
./build.sh --release   # full gate: unit + E2E + security + perf
git tag v1.x.y
git push origin v1.x.y
```
