<!--
One thing per pull request. Two unrelated changes are two pull requests.
Target `develop`, not `main` — unless this is a release/* or hotfix/* branch.
-->

## What this changes

<!-- One or two sentences. -->

## Why

<!-- The problem being solved. -->

Closes #

## Type

- [ ] `feat` — new user-visible capability
- [ ] `fix` — bug fix
- [ ] `perf` — performance only
- [ ] `refactor` — no behaviour change
- [ ] `docs` / `build` / `ci` / `chore`

## Checks

- [ ] `npm run preflight` passes locally
- [ ] Tested in a clean vault on desktop and mobile, in light and dark theme
- [ ] `minAppVersion` raised only if a newer Obsidian API is now required
- [ ] Version bumped in `manifest.json`, `package.json`, and `versions.json` (release/hotfix PRs only)
- [ ] `CHANGELOG.md` updated (release/hotfix PRs only)

## Screenshots

<!-- For anything visible. Before and after, if the change is visual. -->
