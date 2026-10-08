# Work an issue through to a PR

`x-issue-to-pr` runs a GitHub issue through issue → branch → PR with the `gh` CLI. It needs `gh` logged in; the project Status steps also need the `project` scope (`gh auth refresh -s project`).

## Use it

1. File an issue: `/x-issue-to-pr new "Install fails on pnpm 10"`, or say "file a bug: install fails on pnpm 10". It gets one label and no assignee.
2. Start work: `/x-issue-to-pr start 12`. It checks out a branch linked to #12, assigns you, labels the issue if it has none, and sets its project Status to "In progress".
3. Do the work and commit. The skill never commits for you.
4. Open the PR: `/x-issue-to-pr finish`. It pushes, opens a PR assigned to you with the issue's labels and `Closes #12`, and sets Status to "In review". If a PR is already open, it updates that one instead.

You don't have to name the skill: requests like "start issue 12" or "open a PR for this" trigger it too.

## Open different types of issues

The label is the type:

| Where | How |
|---|---|
| Browser | New issue, then pick a form; each form sets its label |
| Agent | Name the type ("file a bug: …"), or let the skill pick one from the content |
| `gh` | `gh issue create --label bug --title '…'`; without `--label` the issue gets none |

## Set up the repo

The skill covers what an agent does. These cover issues and updates made without one, and are worth adding alongside:

1. **Issue forms that set a label**, so issues opened in the browser are labeled ([syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)). To share them across all your repos, put them in a public repo named `.github` under your account ([how](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)); [andrej-kolic/.github](https://github.com/andrej-kolic/.github) is an example.
2. **The project's "Auto-add to project" workflow**, so new issues land in the backlog ([how](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically)). The skill never adds issues to a project, and skips the Status steps for an issue that isn't in one.
3. **Dependabot**, so GitHub Actions and dependencies stay current; this repo's [`.github/dependabot.yml`](../.github/dependabot.yml) is an example.
