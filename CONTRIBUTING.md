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
| `main` | Default branch for releases and repository maintenance that preserves the published build. | Never |
| `develop` | Integration branch. Finished work that has not been released yet lands here. | Only changes that cannot alter the shipped plugin: `docs`, `chore`, `build`, `ci`, and doc-only `fix` |

Direct pushes to `develop` are reserved for maintenance that has no runtime
effect. Open a PR for changes to plugin behavior, source or styles.

Short-lived branches. All of them are merged back with `--no-ff` so the branch
topology survives in the history:

| Pattern | Branches from | Merges into | Example |
|---|---|---|---|
| `feature/<topic>` | `develop` | `develop` | `feature/minimap-zoom` |
| `bugfix/<topic>` | `develop` | `develop` | `bugfix/fold-flicker-on-theme-change` |
| `release/<version>` | `develop` | `main` + `develop` | `release/3.1.0` |
| `hotfix/<version>` | `main` | `main` + `develop` | `hotfix/3.0.1` |
| `chore/<topic>` | `main` | `main` | `chore/github-contribution-workflow` |
| `support/<version>` | `main` | — | `support/2.x` |

Naming rules:

- Lowercase, words separated by a single `-`.
- Use a prefix from the table and a single slash. Choose a topic that describes
  the change, such as `feature/minimap-zoom`.
- Include the issue number when it helps identify the work, as in
  `bugfix/12-fold-flicker`.
- Use the intended release version in release and hotfix branch names, as in
  `release/1.1.0`.

Obsidian reads the manifest from the default branch. Keep `main` aligned with
the published release so its manifest points to the corresponding GitHub
Release and its build reproduces the published files.

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
| `docs` | README, CHANGELOG, comments | — |
| `style` | Formatting or CSS with no logic change | — |
| `test` | `tools/smoke-test.mjs` | — |
| `build` | esbuild, tsconfig, npm scripts | — |
| `ci` | GitHub Actions | — |
| `chore` | Everything else, including dependencies | — |
| `revert` | Revert a previous commit | — |

**scope** — optional, and either a module (`code-block`, `minimap`, `render`,
`preview`, `settings`, `i18n`, `styles`) or the area of the repository that is not
a module (`build`, `release`, `validate`, `deps`, `docs`, `changelog`,
`submission`).

**subject** — imperative mood ("add", not "added" or "adds"), lowercase, no
trailing period, at most 72 characters.

**body** — optional. Explain *why*, not *what*; the diff already says what.
Wrap at 72 columns.

**footer** — use `Refs #34` to reference an issue. A breaking change goes in the
footer as `BREAKING CHANGE: <what breaks and what to do about it>`, and the type
line must also carry a `!`.

```
feat(minimap): add drag-to-resize gutter

The gutter was fixed at 8px, which made the minimap unusable in a narrow
sidebar. Pointer capture keeps the drag alive when the pointer leaves the
container.

Refs #18
```

```
fix(settings): stop rebuilding the whole document on every slider input

Refs #21
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
Obsidian API. It is a real minimum, not a safety margin — the 1.13.0 bump and the
two lint warnings it cleared are recorded in [CHANGELOG.md](CHANGELOG.md).

A version number lives in five places, and all five must agree:

1. `manifest.json` → `version`
2. `package.json` → `version`
3. `versions.json` → the new key
4. The Git tag
5. The GitHub release

`npm run release` takes the version from `manifest.json`, and `npm run validate`
asserts that the first three agree. The tag and the release are yours to get
right.

Apply version bumps on the `release/*` or `hotfix/*` branch.

## Issues

Search for an existing report, then choose the appropriate [issue form](https://github.com/lloyd-kai/code-block-auto-collapse/issues/new/choose). Add a short summary after the form's title prefix.

- **Bug reports** need the plugin and Obsidian versions, platform, steps to
  reproduce, expected behavior and actual behavior. A minimal code block,
  relevant settings, logs and screenshots are welcome.
- **Feature requests** need a use case and the behavior you want.
- **Security reports** go through the private channel described in
  [SECURITY.md](.github/SECURITY.md).

Maintainers add `needs info` when they need more details from the reporter.

## Pull requests

1. Branch from the original repository's `develop` for features and fixes.
   You can push the branch to a fork and open the PR against
   `lloyd-kai/code-block-auto-collapse:develop`.
2. Keep the PR focused on one change. Include the summary, the related issue
   if there is one, and the checks you ran with their results. Include platform
   details for platform-specific changes and screenshots for visible changes.
3. Run `npm run preflight` before opening the PR and check that CI passes.
   Use `Refs #123` on `develop`. Use `Closes #123` on a PR that targets
   `main` and resolves the issue.
4. Merge with a merge commit to preserve the branch history.

Release and hotfix PRs into `main` follow the versioning rules above and
update [CHANGELOG.md](CHANGELOG.md). Maintainers can also open a `chore/*` PR
from `main` for repository policy, templates or documentation. Before merging
one, rebuild the plugin and compare the SHA-256 hashes of `main.js`,
`manifest.json` and `styles.css` with the current GitHub Release attachments.
If the files differ, use the release or hotfix workflow.

Dependabot PRs are reserved for security updates. Review them with the advisory
and validate changes on a maintenance branch. A dependency change that affects
the published build goes through the release or hotfix workflow. Propose
routine dependency updates through a PR to `develop`.

Commit source, tests and public project files relevant to the change. Keep local
notes, vaults, dependencies and build output out of commits. The release
workflow uploads the runtime files as GitHub Release attachments.

## Publishing to the community directory

1. Run `npm run preflight` and confirm that the version in `main`'s
   `manifest.json` matches the tag of a published GitHub Release. For a new
   version, tag the release commit on `main` with the version number and push
   that tag to the canonical repository. The release workflow builds and tests
   the plugin, attests the three runtime files and attaches them to a draft.
   Add release notes and publish it.
2. Sign in to the [Obsidian community directory](https://community.obsidian.md)
   and connect the GitHub account that owns this repository. Check **Plugins**
   for an existing entry. Use **New plugin** for the first submission.
3. Review the manifest, release assets, source code and build results. Resolve
   errors before publishing the listing. On an existing entry, **Review branch**
   can preview a scan before a new release. The directory detects subsequent
   GitHub releases.

See the official [submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
and [review instructions](https://docs.obsidian.md/community-directory/manage-entry).

## Local checks

```bash
npm run preflight   # lint → test → release → validate
```

Individually: `npm run lint`, `npm test`, `npm run build`, `npm run release`,
`npm run validate`.

`npm run lint` currently reports zero errors and zero warnings, and it should stay
that way. If a new warning appears, fix it rather than silencing the rule —
Obsidian's reviewers run the same rule set. The two warnings this repository used
to carry, and why raising `minAppVersion` to 1.13.0 cleared them, are recorded in
[CHANGELOG.md](CHANGELOG.md).
