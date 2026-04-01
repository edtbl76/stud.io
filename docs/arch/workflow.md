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
