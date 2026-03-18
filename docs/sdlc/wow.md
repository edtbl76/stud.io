# Workflow, Versioning, and Release (WoW) Guidelines

Everything here applies to [roadmap.md](roadmap.md) and any future planning files. 
This is the source of truth for how we plan, execute, and release work.

## Workflow Rules

* Backlog is the source of truth
* Order is preserved unless explicitly changed
* Work is pulled into In Progress intentionally
* Only a small number of items should be In Progress at once

---

## Versioning

Format: MAJOR.MINOR.PATCH

* PATCH (x.x.THIS)

    * Every item moved to Done

* MINOR (x.THIS.x)

    * Meaningful feature completion (e.g. v0.3.0)

* MAJOR (THIS.x.x)

    * Large milestone / phase shift

---

## Release Process

1. Complete tasks → move to Done → increment PATCH
2. When release scope is satisfied → bump MINOR
3. Archive Done into release notes (optional file)
4. Clear Done
5. Set next release target

---

## Notes

* Priority is encoded via tags (#P0 → #P3)
* P0 defines current focus
* Epics are not started until foundation is stable
* This file is the control surface for planning and execution