# GitHub Configuration

## Repo settings

Configured via `gh api` / GitHub UI. Current state:

| Setting | Value |
|---|---|
| Default branch | `main` |
| Visibility | Public |
| Allow squash merge | ✓ |
| Allow merge commits | ✗ |
| Allow rebase merge | ✗ |
| Auto-delete branches on merge | ✗ (manual cleanup via `--delete-branch`) |

---

## Branch protection

`main` branch protection is not yet configured. Recommended settings once CI is stable:

```bash
gh api repos/edtbl76/stud.io/branches/main/protection \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  --field required_status_checks='{"strict":true,"contexts":["CI / lint-and-test"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":0,"dismiss_stale_reviews":true}' \
  --field restrictions=null
```

- No required reviewer count (solo project)
- CI must pass before merge
- Squash-only enforced via repo settings above

---

## AI code review

Two AI reviewers are configured to run automatically on every PR.

### CodeRabbit

**Config:** `.coderabbit.yaml` (repo root)

Install the GitHub App at [coderabbit.ai](https://coderabbit.ai). Triggers on PR open/update and posts:
- A high-level summary of changes
- Line-by-line review comments against the project's code quality standards
- Walkthrough per file

Key config decisions:
- Excludes `package-lock.json`, shadcn/ui primitives, build artifacts, and generated files
- Path-specific instructions for Python (FastAPI) and TypeScript (Next.js) files mirror the standards in `CLAUDE.md`
- Router instructions remind it to check for RBAC test coverage on new routes
- `profile: chill` — flags real issues without nitpicking style already covered by ruff/tsc

### Qodo Merge

**Config:** `.pr_agent.toml` (repo root), `best_practices.md` (repo root)

Install the GitHub App at [qodo.ai](https://qodo.ai). Auto-runs three commands on every PR:
- `/describe` — generates PR description from diff
- `/review` — full review against `best_practices.md` and `extra_instructions`
- `/improve` — focused code suggestions (problems only, score threshold 6)

`best_practices.md` is the shared source of truth for coding standards. Both Qodo and any contributor can read it. Update it when standards change — the TOML `extra_instructions` mirrors it for redundancy.

---

## Coding standards

**`best_practices.md`** (repo root) — single source of truth for code quality rules. Referenced by:
- Qodo Merge — rules are duplicated into `extra_instructions` in `.pr_agent.toml`; the `[best_practices]` section exists but `content = ""` so Qodo does not inject the file directly. The duplication is a known maintenance trap — `extra_instructions` will drift from `best_practices.md` over time. This is accepted: CodeRabbit is the primary review tool and Qodo is not a priority.
- CodeRabbit path instructions (`.coderabbit.yaml`)
- Claude Code (`CLAUDE.md` Code Quality Standards section)

When standards change, update `best_practices.md` first, then sync `CLAUDE.md` and the review tool configs.
