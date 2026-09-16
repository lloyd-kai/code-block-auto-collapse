# Contributing

Thanks for taking the time to help. This document covers the branch model, commit
message format, versioning policy, and issue conventions used in this repository.

- [Branch model (GitFlow)](#branch-model-gitflow)
- [Commit messages](#commit-messages)
- [Versioning](#versioning)
- [Issues](#issues)
- [Pull requests](#pull-requests)
- [Publishing to the community directory](#publishing-to-the-community-directory)
- [Local checks](#local-checks)

## Branch model (GitFlow)

This repository follows [GitFlow](https://nvie.com/posts/a-successful-git-branching-model/).

Two long-lived branches:

| Branch | Purpose | Direct pushes |
|---|---|---|
| `main` | The released state. Every commit here is a published version and carries a matching tag. | Never |
| `develop` | Integration branch. Finished work that has not been released yet lands here. | Only `docs` / `chore` |

Short-lived branches. All of them are merged back with `--no-ff` so the branch
topology survives in the history:

| Pattern | Branches from | Merges into | Example |
|---|---|---|---|
| `feature/<topic>` | `develop` | `develop` | `feature/minimap-zoom` |
| `bugfix/<topic>` | `develop` | `develop` | `bugfix/fold-flicker-on-theme-change` |
| `release/<version>` | `develop` | `main` + `develop` | `release/3.1.0` |
| `hotfix/<version>` | `main` | `main` + `develop` | `hotfix/3.0.1` |
| `support/<version>` | `main` | — | `support/2.x` |

Naming rules:

- Lowercase, words separated by a single `-`.
- The prefix is exactly one of `feature/`, `bugfix/`, `release/`, `hotfix/`,
  `support/`. One slash, never two — `feature/minimap-zoom`, not
  `feature/minimap/zoom`.
- `<topic>` describes the change, not the effort. `feature/minimap-zoom`, not
  `feature/work` or `feature/stuff`.
- When the change comes from an issue, append the number to a readable topic:
  `bugfix/12-fold-flicker`. The number is a suffix, never the whole name.
- `<version>` is the version that branch will produce: `release/3.1.0`.

`main` is the **default branch on GitHub**, not `develop`. This is deliberate:
Obsidian resolves a plugin from the repository root, and `develop` carries the
*next* version in `manifest.json` while no matching release exists yet. That
combination produces the "No release matches your manifest version" failure. Keep
the released state on the default branch.

## Commit messages

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type** — one of:

| Type | Use for | Version impact |
|---|---|---|
| `feat` | A new user-visible capability | MINOR |
| `fix` | A bug fix | PATCH |
| `perf` | A change that only improves speed or memory | PATCH |
| `refactor` | Behaviour-preserving restructure | — |
| `docs` | README, comments, `PLUGIN_DEVELOPMENT.md` | — |
| `style` | Formatting or CSS with no logic change | — |
| `test` | `tools/smoke-test.mjs` | — |
| `build` | esbuild, tsconfig, npm scripts | — |
| `ci` | GitHub Actions | — |
| `chore` | Everything else, including dependencies | — |
| `revert` | Revert a previous commit | — |

**scope** — optional, and taken from the module layout: `code-block`, `minimap`,
`render`, `preview`, `settings`, `i18n`, `styles`, `build`, `release`, `deps`.

**subject** — imperative mood ("add", not "added" or "adds"), lowercase, no
trailing period, at most 72 characters.

**body** — optional. Explain *why*, not *what*; the diff already says what.
Wrap at 72 columns.

**footer** — `Closes #12` or `Refs #34` to link issues. A breaking change goes in
the footer as `BREAKING CHANGE: <what breaks and what to do about it>`, and the
type line must also carry a `!`.

```
feat(minimap): add drag-to-resize gutter

The gutter was fixed at 8px, which made the minimap unusable in a narrow
sidebar. Pointer capture keeps the drag alive when the pointer leaves the
container.

Closes #18
```

```
fix(settings): stop rebuilding the whole document on every slider input

Closes #21
```

```
feat(settings)!: rename the maxLines setting to foldLines

BREAKING CHANGE: existing data.json files are migrated on load, but any
snippet or theme that reads --cbac-max-lines must be updated to
--cbac-fold-lines.
```

## Versioning

[Semantic Versioning](https://semver.org/), with one hard Obsidian constraint:

> `manifest.version` may contain **only digits and periods**. Obsidian requires
> `x.y.z`, and the GitHub release tag must match the manifest version exactly.

Pre-release identifiers such as `3.1.0-beta.1` are therefore **not** valid in
`manifest.json`. A beta is not a suffix, it is a release cycle: ship it as
`3.1.0` from a `release/3.1.0` branch, tag it `3.1.0`, and mark the GitHub
release as a pre-release.

Which number to bump:

| Change | Bump |
|---|---|
| A setting is renamed or removed, a CSS variable is renamed, or DOM structure that other code depends on changes | MAJOR |
| A new setting, a new interaction, or new behaviour the user can see | MINOR |
| A bug fix, a performance fix, or a wording fix | PATCH |

`minAppVersion` is bumped only when the code actually starts using a newer
Obsidian API. It is a real minimum, not a safety margin — see
[PLUGIN_DEVELOPMENT.md § 13.2](PLUGIN_DEVELOPMENT.md).

A version number lives in five places, and all five must agree:

1. `manifest.json` → `version`
2. `package.json` → `version`
3. `versions.json` → the new key
4. The Git tag
5. The GitHub release

`npm run release` takes the version from `manifest.json`, and `npm run validate`
asserts that the first three agree. The tag and the release are yours to get
right.

Version bumps happen on the `release/*` branch, never on `develop` directly.

## Issues

Use the issue forms. A blank issue will be closed and redirected to them.

**Bug reports** must include the Obsidian version, the plugin version, the
operating system, what you did, what you expected, what actually happened, and
any console output (`Ctrl`/`Cmd` + `Shift` + `I` → Console). A minimal code block
that reproduces the problem is worth more than a paragraph of description.

**Feature requests** must state the problem before the solution. "I want to
compare two long functions side by side and scrolling breaks my focus" is a
usable request. "Add a split view" is not — it is one possible answer to a
problem you have not described.

**Titles** — the form prefixes them, so write the summary only:
`Fold flickers when the theme changes`, not `[BUG] Fold flickers`.

**Labels** are set by maintainers:

| Label | Meaning |
|---|---|
| `bug` | Confirmed defect |
| `enhancement` | Accepted feature request |
| `documentation` | README or in-app text |
| `good first issue` | Scoped, low risk, no prior knowledge needed |
| `needs info` | Waiting on the reporter — stale after 30 days, then closed |
| `duplicate` | Already tracked elsewhere |
| `wontfix` | Out of scope; the reasoning is always in the thread |

## Pull requests

Pull requests here are **internal** — they move work between branches in this
repository. They are not how the plugin is published; that happens through the
community directory, described in the next section.

1. Branch off `develop` following the naming rules above.
2. Keep the pull request focused on one thing. Two unrelated changes are two
   pull requests.
3. `npm run preflight` must pass locally before you open it.
4. Fill in the pull request template and link the issue with `Closes #12`.
5. Merge with `--no-ff`. Squashing is not used — the branch topology is the
   point of GitFlow.

A pull request into `main` (from `release/*` or `hotfix/*`) must also update
`versions.json` and `CHANGELOG.md`.

## Publishing to the community directory

Listing in the [Obsidian community directory](https://community.obsidian.md) is
done through a **web form**, not a pull request. The older process — appending
an entry to `community-plugins.json` in `obsidianmd/obsidian-releases` and
waiting for a `Ready for review` label — has been retired and is no longer
mentioned anywhere in the official developer docs.

The short version, once a `release/*` branch has landed on `main`:

1. Tag `main` with the exact `manifest.version`, no `v` prefix:
   `git tag -a 1.0.1 -m "1.0.1" && git push origin 1.0.1`.
2. `.github/workflows/release.yml` builds, runs lint and tests, generates a
   build provenance attestation, and opens a **draft** release with the three
   runtime files attached. Add the notes and publish it.
3. Sign in at [community.obsidian.md](https://community.obsidian.md) with an
   Obsidian account, connect GitHub under **Profile → GitHub**, and submit the
   repository URL under **Plugins → New plugin**.

Only the initial submission needs the form. After that, a new release is all it
takes — the directory detects it on its own schedule.

Before submitting, run `npm run validate`. It asserts the manifest constraints,
the five-way version agreement, the artifact hashes, and the rules the
directory scanner applies (`main.js` must not be tracked by Git, the README must
carry a disclosures section, `package.json` must expose a build script the
scanner can find).

The full walkthrough — scanner result groups, listing metadata, screenshot
specs, private source repositories — is in
[PLUGIN_DEVELOPMENT.md § 13](PLUGIN_DEVELOPMENT.md).

## Local checks

```bash
npm run preflight   # lint → test → release → validate
```

Individually: `npm run lint`, `npm test`, `npm run build`, `npm run release`,
`npm run validate`.

`npm run lint` currently reports two warnings. They are a deliberate trade-off,
not an oversight — read
[PLUGIN_DEVELOPMENT.md § 13.5](PLUGIN_DEVELOPMENT.md) before trying to "fix"
them.
