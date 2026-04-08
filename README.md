# STUD.io ControlRoom

A local web application for managing studio gear, plugins, instruments, and sample libraries — with a future Python-powered recommendation engine.

---


## Quick start

```bash
# First time only
pre-commit install

# Build and test
roadie build
```

App runs at `https://localhost:2112`. Default login: `admin` / `admin`.

---

## Documentation

| Document | Contents |
|---|---|
| [Setup & Operations](docs/setup.md) | Prerequisites, first-time setup, running the app, HTTPS, SonarQube |
| [User Manual](docs/manual.md) | Features, navigation, and how to use the application |
| [Roadie CLI](docs/arch/roadie.md) | All `roadie` commands, flags, and the pipeline architecture |
| [Architecture](docs/arch/) | Stack, data model, API design, frontend structure |
| [Ways of Working](docs/sdlc/wow.md) | Workflow, testing, versioning, and release process |
| [Legacy CSV Pipeline](docs/legacy.md) | The original CSV import workflow and converter scripts |
