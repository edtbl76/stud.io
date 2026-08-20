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

`main` branch protection is active. Configured via `gh api`:

```bash
gh api repos/edtbl76/stud.io/branches/main/protection \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["ci/woodpecker/pr/main"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "restrictions": null
}
EOF
```

| Setting | Value |
|---|---|
| Required status check | `ci/woodpecker/pr/main` |
| Enforce admins | No (solo project) |
| Required approving reviews | 0 |
| Dismiss stale reviews | ✓ |
| Restrict push access | None |

- The required check `ci/woodpecker/pr/main` is posted by the Woodpecker CI server when the `.woodpecker/main.yml` pipeline completes on a PR.
- `ci/woodpecker/pr/roadie` is NOT required — that pipeline is path-filtered to `roadie/**` and won't run on most PRs.
- Squash-only is enforced via repo settings above — branch protection does not need to restate it.
- Re-run the `gh api` command above if protection is ever reset.

---

## AI code review

The full cloud review stack runs automatically on every PR — **DeepSource** (7 analyzers: Python · JavaScript · Go ·
SQL · Secrets · Shell · Docker), **CodeScene** (Code Health Review, project 78184), **Sourcery**, **CodeRabbit**, and
**Qodo Merge** — verified on PR #121. The two LLM reviewers with committed config in this repo (CodeRabbit + Qodo) are
detailed below; the SAST/behavioral tools (DeepSource/CodeScene/Sourcery) are covered in
[`code-review-stack.md`](code-review-stack.md), which is the full-stack reference. **Greptile** is the one member not
yet installed here.

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
