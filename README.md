# Flechettes

<p align="center">
  <a href="https://0rwx.com/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/0rwx/AI-X-dark.svg" />
      <img alt="0rwx AI:X — AI made, human guided" src="docs/0rwx/AI-X-light.svg" width="88" />
    </picture>
  </a>
</p>

> **Made with AI, guided by humans.** Under the [0rwx framework](https://0rwx.com/)
> this project is **`AI:X` — EXECUTE** ("AI made, human curates"): humans set the
> direction and review the outcomes, and the AI writes the implementation. See
> [How this project is made](#how-this-project-is-made) for what that means in
> practice.

A web text editor where French-speaking children write freely, then correct
their own text by hand using the grammar-analysis techniques taught at school.

The computer never corrects, suggests or detects: there is no autocomplete,
spellcheck, grammar check, error underlining or automatic word-type recognition.
Every arrow, label and edit comes from the child's own reasoning, so a teacher can
later read the process and not just the result. See
[`goal-and-requirements.md`](goal-and-requirements.md) for the full product intent
and [`architecture.md`](architecture.md) for how it is built.

## How it works

Two modes over one text, switchable at any time with shared undo/redo:

- **Writing mode** — free typing on a notebook sheet (a 24×32 *grand cahier*,
  lined or plain), with none of the usual editor assistance.
- **Correction mode** — a tool rail offers Identify, Arrow and Rewrite so the
  child annotates word classes, links words with arrows, and rewrites words while
  the original stays crossed out, as on paper.

Texts, overlays and corrections are stored per student on a self-contained LAN
server and auto-saved, so a student can sign in from any computer on the network
and their work follows them.

## Tech stack

- **TypeScript** web app built with **Vite**
- **vitest** for tests (jsdom + fake-indexeddb)
- Self-contained **Node** server (`tsx`) backed by **SQLite**
- No external/third-party runtime services — the server is fully self-contained

## How this project is made

This repository is written by AI and **guided** by humans. We label that with the
[0rwx framework](https://0rwx.com/), a four-level vocabulary (`AI:0` ZER0 →
`AI:R` READ → `AI:W` WRITE → `AI:X` EXECUTE) that describes *how much a human
scrutinises the generated work*, not which tool produced it.

Flechettes is **`AI:X` (EXECUTE) — "AI made, human curates."** Humans do not
hand-write the code; they steer the work and judge the results. What keeps that
honest and reviewable rather than a black box:

- **Specs come first.** Humans own the intent and the boundaries as written
  specs (see below); the AI implements against them.
- **Change flows through review.** Every change lands via a pull request a human
  curates, not a direct push to `main`.
- **The machine checks the machine.** CI runs tests, builds an SBOM, and gates
  merges on SCA (Interlynk) and SAST (Snyk Code) findings — see
  [Continuous integration](#continuous-integration).

The 0rwx badges are released into the public domain by their author; the copies
under [`docs/0rwx/`](docs/0rwx/) are vendored from the
[0rwx repository](https://github.com/NamtaoProductions/0rwx.com).

## Spec-driven development

The specs are the source of truth — the product is described before and as it is
built, and any change that alters a boundary, contract or behaviour updates the
owning spec in the same change. Each spec is a Markdown file with YAML
frontmatter (`id`, `type`, `status`, `parent`, `depends-on`) that links it into a
**spec graph**:

- A **parent** edge places a spec in the tree (module specs hang off the
  architecture; the architecture hangs off the goal).
- A **depends-on** edge records which other specs a spec relies on.

To understand the repo, read the specs top-down:

1. [`goal-and-requirements.md`](goal-and-requirements.md) — *why* and *what*:
   the product intent, principles, and non-goals.
2. [`architecture.md`](architecture.md) — *how*: system design, owned
   boundaries, and recorded decisions (`depends-on: goal-and-requirements`).
3. The module `SPEC.md` next to the code it governs — the contracts for that one
   module (`parent: architecture`).

## Repository structure

Each `src/` module carries its own spec. Read a module's `SPEC.md` before
changing its code.

| Path | Spec `id` | Owns |
| ------------------------- | --------------------- | ------------------------------------------------------- |
| `goal-and-requirements.md`| `goal-and-requirements` | Product intent, principles, non-goals |
| `architecture.md`         | `architecture`        | System design, boundaries, decisions |
| `src/model/`              | `model`               | Document model: text + overlay + history (source of truth for a text) |
| `src/overlay/`            | `overlay`             | Correction overlay: arrows and word-class labels |
| `src/storage/`            | `storage`             | Storage: server source of truth, offline cache, 7-day bin |
| `src/server/`             | `server`              | LAN server: static serving, JSON API, auth, roles |
| `src/ui/`                 | `editor-ui`           | Editor UI: list, tool rail, sheet, writing/correction modes |
| `src/net/`                | —                     | Browser API client helpers |
| `src/roster/`             | —                     | Roster types and helpers |
| `tests/`                  | —                     | vitest suites |
| `.github/workflows/`      | —                     | CI: build/test, SBOM, SCA, SAST |
| `flake.nix`, `.envrc`     | —                     | Nix dev shell (see below) |

## Getting started

Requires **Node 24** (or newer) and **npm**.

```bash
npm ci            # install dependencies
npm run dev       # start the Vite dev server (front end)
npm run server    # start the API server (watch mode)
```

## Development environment (Nix)

A [Nix flake](flake.nix) provides a pinned dev shell so local work (including
automated agents) runs the same tools as CI before opening a PR.

```bash
nix develop        # enter the shell (needs Nix with flakes enabled)
```

With [direnv](https://direnv.net/) + [nix-direnv](https://github.com/nix-community/nix-direnv)
installed, `direnv allow` auto-loads the shell on `cd` (see [`.envrc`](.envrc)).

The shell provides:

| Tool            | For                                                  |
| --------------- | ---------------------------------------------------- |
| `nodejs_24`     | `node` / `npm` / `npx`, matching the CI Node version |
| `snyk`          | `snyk code test` — the same SAST run in CI           |
| `cyclonedx-cli` | inspect / convert / validate CycloneDX SBOMs         |
| `git`, `gh`     | version control and GitHub CLI (PRs, checks)         |
| `jq`            | JSON wrangling                                        |

npm dependencies are still fetched from the npm registry by `npm ci`; the flake
only pins the tools around them. Generate an SBOM locally with
`npx @cyclonedx/cyclonedx-npm`. The Interlynk SCA tooling (`sbommv` / `pylynk`)
is not packaged in nixpkgs; CI runs it via Docker, and it needs server-side
tokens, so it is not part of the local shell.

## Common scripts

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Vite dev server for the front end            |
| `npm run server`    | API server in watch mode (`tsx watch`)       |
| `npm start`         | API server, single run                       |
| `npm run build`     | Type-check then production build (`vite build`) |
| `npm run typecheck` | `tsc --noEmit`                               |
| `npm test`          | Run the test suite (`vitest run`)            |
| `npm run preview`   | Preview the production build                  |

## Continuous integration

Every pull request, every push to `main`, and a weekly schedule run
[`.github/workflows/ci.yml`](.github/workflows/ci.yml), which:

1. **Builds & tests** — `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
2. **SBOM** — generates a CycloneDX software bill of materials with
   `@cyclonedx/cyclonedx-npm`, uploads it as a build artifact, and pushes it to
   the Interlynk platform.
3. **SCA (Interlynk)** — Interlynk performs vulnerability and license analysis on
   the uploaded SBOM and monitors it over time.
4. **SAST (Snyk Code)** — `snyk code test` scans the source; results are uploaded
   to the GitHub **Security** tab as SARIF.

The SCA and SAST steps **fail the build on high/critical findings**.

### Required repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret                      | Where to get it                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `SNYK_TOKEN`                | Snyk → **Account settings → Auth Token** (General → API token). Also enable **Snyk Code** once under Settings → Snyk Code (free, off by default). |
| `INTERLYNK_SECURITY_TOKEN`  | Interlynk → **Settings → Security Tokens** (`app.interlynk.io/vendor/settings?tab=security tokens`). |

### One-time account setup

- **Interlynk** — sign up at `app.interlynk.io`, register your organization, then
  create the security token above. The CI uploads SBOMs to a project named
  `flechettes` (created automatically on first upload under the `default`
  environment); adjust `--out-interlynk-project-name` in the workflow to rename it.
- **Snyk** — sign in, generate the auth token above, and enable Snyk Code for your
  organization so `snyk code test` (SAST) is available.
