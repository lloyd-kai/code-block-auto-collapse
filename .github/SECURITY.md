# Security policy

## Supported versions

Only the latest release is supported. Fixes ship as a new release rather than as
a patch to an older one, because Obsidian resolves a plugin version by matching
the Git tag against `manifest.json`, and the community directory only serves the
newest release.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability):
open the **Security** tab of this repository and select **Report a vulnerability**.
That keeps the report private until a fix is out.

Please do not open a public issue for anything exploitable.

Include what you can of the following — it is usually the difference between a
report that can be acted on and one that cannot:

- the Obsidian version and the plugin version,
- the operating system and whether it is desktop or mobile,
- what an attacker would need to be able to do for the issue to be reachable,
- a minimal note or code block that reproduces it.

## What is in scope

The plugin is a Reading view post-processor. It reads the DOM Obsidian has
already rendered and decorates it. It makes no network requests, writes nothing
to disk, ships no third-party runtime code, and does not touch any file outside
the vault. See the Disclosures section of the [README](README.md) for the full
list.

Reports that are therefore most useful:

- a way to execute script or inject markup through a crafted note,
- a way to make the plugin read or transmit vault content,
- a denial of service triggered by a note (for example a code block that hangs
  the renderer),
- a way to escape the plugin's DOM subtree and affect the rest of Obsidian.
