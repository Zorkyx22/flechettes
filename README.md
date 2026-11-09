# Flechettes

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
