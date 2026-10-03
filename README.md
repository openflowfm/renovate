# renovate

Self-hosted [Renovate](https://docs.renovatebot.com/) for the openflowfm organisation, run by GitHub Actions in this repo. No GitHub App is installed on the org: a scheduled workflow runs Renovate with a fine-grained personal access token and opens dependency PRs in every openflowfm repo.

This repo holds two things:

| File | What it is |
| --- | --- |
| `default.json` | The shared preset. Every repo's `renovate.json` extends it as `github>openflowfm/renovate`. |
| `config.js` | The self-hosted runner config: which repos to scan and what onboarding PRs contain. |
| `.github/workflows/renovate.yml` | Runs Renovate hourly, by hand, and when a library release asks for it. |
| `.github/workflows/validate.yml` | Checks `config.js`, `default.json` and `renovate.json` with Renovate's config validator on every PR. |
| `renovate.json` | This repo's own config, so Renovate also keeps the pinned actions and Renovate version here current. |

## What the preset does

- Starts from `config:recommended`, with the dependency dashboard on (one "Dependency Dashboard" issue per repo).
- **`@openflow/*` packages**: every update goes into one PR, "Update openflow modules", raised as soon as a version is published (no schedule). Patch and minor updates automerge once CI passes, except minor updates of a package still below 1.0.0 (0.1 to 0.2 is breaking under semver), which wait for a human. Patch updates on 0.x still automerge. Major updates get their own "openflow modules (major)" PR that waits for a human.
- **Everything else** (third-party dependencies, GitHub Actions, and so on): raised weekly, before 6am UTC on Monday. Nothing third-party automerges.

A repo can add its own rules after the `extends` line in its `renovate.json`; they apply on top of the preset.

### Onboarding

Renovate scans every repo in `openflowfm` (this one included). A repo with no Renovate config gets an onboarding PR adding:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>openflowfm/renovate"]
}
```

Renovate does nothing else in that repo until the onboarding PR is merged. Close it to opt the repo out.

## Setup

These steps are done once, by an org owner.

### 1. Allow fine-grained tokens in the org

Organisation **Settings → Personal access tokens → Settings**: allow access via fine-grained personal access tokens. If the org requires approval, the token in step 2 stays pending until an owner approves it under **Pending requests**.

### 2. `RENOVATE_TOKEN`: the token Renovate runs as

Create a fine-grained personal access token (**Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**) as an org owner, or better, as a machine user that is an org member. Renovate's commits, PRs and comments appear as this account.

- **Resource owner:** `openflowfm`
- **Repository access:** All repositories (so new repos are picked up without editing the token)
- **Expiration:** the longest the org allows (at most a year unless the org permits no expiry). Put a reminder in a calendar: when it expires, the Renovate workflow fails on every run until the secret is replaced.
- **Repository permissions:**

| Permission | Access | Why |
| --- | --- | --- |
| Metadata | Read | Mandatory; lists and reads repos for autodiscovery. |
| Contents | Read and write | Clones repos, pushes `renovate/*` branches, merges automerged PRs. |
| Pull requests | Read and write | Opens, updates, labels and automerges dependency PRs. |
| Issues | Read and write | Creates and updates the Dependency Dashboard issue. |
| Workflows | Read and write | Pushes branches that change files under `.github/workflows/` (GitHub Actions updates). |
| Commit statuses | Read and write | Reads CI results before automerging; sets Renovate's own status checks. |
| Checks | Read | Reads check-run results (GitHub Actions CI) before automerging. |
| Dependabot alerts | Read | Raises security updates for known vulnerabilities right away. |
| Administration | Read | Reads repo settings such as whether auto-merge is allowed and branch protection. |

- **Organization permissions:** Members: Read (lets Renovate resolve team reviewers and assignees if a repo configures them).

Add it to this repo: **openflowfm/renovate → Settings → Secrets and variables → Actions → New repository secret**, name `RENOVATE_TOKEN`.

A personal token is used instead of the workflow's built-in `GITHUB_TOKEN` because `GITHUB_TOKEN` can't reach other repos and PRs it opens don't trigger CI, which automerge depends on.

### 3. `RENOVATE_DISPATCH_TOKEN`: lets a library release trigger a run

Library repos (protocol, core, widgets, ...) send a `repository_dispatch` event with type `renovate` to this repo after publishing to npm, so apps get the new version within minutes instead of at the next hourly run. That needs a second, minimal token:

- **Resource owner:** `openflowfm`
- **Repository access:** Only select repositories → `openflowfm/renovate`
- **Repository permissions:** Contents: Read and write (the permission GitHub requires to create a repository dispatch event). Metadata: Read is added automatically. Nothing else.
- **Expiration:** as above, with a reminder. If it expires, releases still publish but the dispatch step fails and apps wait for the hourly run.

Add it as an Actions secret named `RENOVATE_DISPATCH_TOKEN` in each library repo, or once as an organisation secret limited to the library repos. A release workflow step looks like:

```yaml
- name: Ask Renovate to pick up this release
  run: gh api repos/openflowfm/renovate/dispatches -f event_type=renovate
  env:
    GH_TOKEN: ${{ secrets.RENOVATE_DISPATCH_TOKEN }}
```

### 4. Enable "Allow auto-merge" in each repo

For automerge to use GitHub's own auto-merge, each repo needs **Settings → General → Pull Requests → Allow auto-merge** turned on. Renovate then enables auto-merge on the PR and GitHub merges it the moment the required checks pass.

Without it (or when the branch has no required status checks, which GitHub's auto-merge needs), Renovate merges the PR itself on a later run, once every check on the branch is green. That works too, just up to an hour later. Either way:

- Each repo needs CI that runs on PRs before automerge is safe. Renovate treats a branch with no checks as passing, so in a repo without PR CI it automerges untested updates.
- If branch protection requires an approving review, automerge can't happen; Renovate leaves the PR open for a human.

## Running it by hand

- **From the web:** Actions → Renovate → Run workflow (pick `debug` log level for more detail).
- **From a terminal:** `gh workflow run renovate.yml --repo openflowfm/renovate` (add `-f log_level=debug` for more detail).
- **Per repo:** tick a checkbox in that repo's Dependency Dashboard issue to request a specific update; it is acted on at the next run.

Only one run happens at a time. A trigger that arrives during a run waits and starts when the current one finishes.

## Changing the config

Edit `default.json` or `config.js` in a PR. The Validate config workflow runs Renovate's validator; to run it locally:

```sh
npx --yes --package renovate -- renovate-config-validator --strict config.js
npx --yes --package renovate -- renovate-config-validator --strict --no-global default.json renovate.json
```

Changes to `default.json` take effect in every repo at the next run after merging to `main`.
