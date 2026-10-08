---
name: x-issue-to-pr
description: Run a GitHub issue through issue → branch → PR with the gh CLI — file a labeled issue, start work on one (assign to me, set project Status to In progress, check out a linked branch), or finish it (push, open a PR assigned to me that closes the issue, set Status to In review). Use when asked to create an issue, start or pick up an issue, or open a PR for the current issue branch.
targets: ["claudecode", "cursor"]
---

<!-- playbook:x-issue-to-pr v2 (2026-10-08) — PR body carries an evidence line -->
<!-- source: andrej-kolic/playbook .rulesync/skills/x-issue-to-pr/SKILL.md; edits elsewhere are overwritten -->

The agent-side half of a GitHub issue workflow. Repo config covers what happens without an agent — issue forms label new issues, a project's "Auto-add" workflow adds them to the backlog, Dependabot bumps versions. This skill covers what config can't: GitHub has no built-in way to assign an issue when work starts, and issues or PRs created from the CLI skip the issue forms, so they get no label unless one is passed.

Needs any coding agent with shell access, `gh` authenticated, and the `project` token scope for the Status steps (`gh auth status` lists scopes; add it with `gh auth refresh -s project`). Without that scope, do everything else and say Status was skipped.

## Arguments

From `ARGUMENTS`, or from the request:
- `new "<title>"` — file an issue.
- `start <N>` — start work on issue N.
- `finish [N]` — open the PR for issue N; without N, use the issue linked to the current branch.

## Shared lookups

- **Labels.** Only labels that exist: `gh label list`. Never create one. When choosing a label, prefer the one the repo's issue form for that kind of issue sets (`.github/ISSUE_TEMPLATE/`, or the owner's `.github` repo), else `bug`, `enhancement`, `documentation` or `question` by content.
- **Project and Status.** The issue's projects, with owner and number:
  ```bash
  gh api graphql -F n=<N> -f owner=<owner> -f repo=<repo> -f query='query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){issue(number:$n){projectItems(first:10){nodes{project{number title owner{... on User{login} ... on Organization{login}}}}}}}}'
  ```
  For each project, read its Status options with `gh project field-list <number> --owner <login> --format json`, and match the target option case-insensitively ("In progress", "In Progress"). Set it with `gh project item-edit <number> --owner <login> --url <issue-url> --field Status --value "<option name as listed>"` (gh 2.102 or later; older gh needs the ID-based flags in `gh project item-edit --help`). No project, or no matching option → skip and say so. Never add the issue to a project: that's the project's Auto-add workflow's job.
- **Titles and bodies.** Never put them inside double quotes: the shell runs backticks and `$(...)` there, and Markdown is full of backticks. Single-quote the title (write a `'` in it as `'\''`), and pass the body on stdin with a quoted heredoc, which the shell leaves untouched. Use the delimiter `GH_BODY_END`, not `EOF`: a body line that is exactly the delimiter ends the heredoc early and runs the rest as shell, and a body may well mention `EOF`.
  ```bash
  gh issue create --title '<title>' --label '<label>' --body-file - <<'GH_BODY_END'
  <body>
  GH_BODY_END
  ```

## new

1. Write a body that states the problem or request in a few lines.
2. `gh issue create` as in the shared lookup, with one label from the shared lookup.
3. Don't assign it — assignment means someone started work, which is `start`.

## start N

1. `gh issue view N --json number,title,state,labels,assignees,url`. Closed → stop and say so.
2. Working tree not clean (`git status --porcelain`) → stop and ask: checking out a new branch would carry those changes along.
3. Branch first, so a stop here leaves the issue untouched. `gh issue develop N --list` prints one `<branch><TAB><url>` line per linked branch. More than one → ask which. One → `git fetch origin`, check it out, and `git merge --ff-only origin/<branch>` so a local copy isn't stale; if it can't fast-forward, stop and say so. None → `git fetch origin` and `gh issue develop N --base <default branch> --checkout` (default branch: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`). Keep gh's branch name unless the repo states a branch naming convention (`CONTRIBUTING.md`, `AGENTS.md`).
4. `gh issue edit N --add-assignee @me`.
5. No labels → add one per the shared lookup, and name it in the report.
6. Set Status to "In progress".

## finish [N]

1. Find N if not given: the current branch's leading number (gh names linked branches `<N>-<title>`), confirmed by the branch appearing in `gh issue develop N --list`. Not found → ask.
2. `gh issue view N --json title,labels,url`. No labels → add one per the shared lookup (`gh issue edit N --add-label '<name>'`) and name it in the report. The steps below use this title and label list, including a label just added.
3. `git fetch origin`, then stop and say why if any holds: the current branch is the default branch; there are uncommitted changes (committing is the user's call, not this skill's); `git rev-list --count origin/<default branch>..HEAD` is 0.
4. `gh pr view --json number,url,state,body,assignees,labels,closingIssuesReferences` (exits 1 with "no pull requests found" when the branch has none).
   - `MERGED` → stop and ask. After a squash merge the branch still counts as ahead, so opening a PR here would duplicate merged work. If the user says to open a new PR anyway, continue as for no PR.
   - `OPEN` → don't open another. `git push -u origin HEAD` so it gets the new commits. If no `closingIssuesReferences[].number` equals N, write the current `body` back with `Closes #N` appended, via `gh pr edit --body-file` as in the shared lookup: it replaces the whole body. Add each issue label whose `name` isn't among the PR's `labels[].name` (`--add-label '<name>'`), and `--add-assignee @me` if it has none. Go to step 6.
   - No PR, or a `CLOSED` one that wasn't merged → `git push -u origin HEAD`, then step 5.

   A rejected push (the remote branch has commits this one lacks) → stop and report. Never force-push.
5. `gh pr create --assignee @me --title '<title>' --body-file - <<'GH_BODY_END' …`, as in the shared lookup, plus `--label '<name>'` for each of the issue's labels. Title and body follow the repo's PR conventions and template (`.github/pull_request_template.md`) where they exist; the title follows its commit convention when the PR is one commit. The body must contain `Closes #N`, which closes the issue when the PR merges. It also carries one evidence line: the check that shows the change works, as before → after — a test that failed and now passes, a command and its output, a screenshot. A change with nothing to run, such as docs, says how it was checked instead.
6. Set the issue's Status to "In review".

## Report

The issue or PR URL, what was set (assignee, label, Status, branch), and anything skipped with its reason. After `new`, say the issue was not added to a project and that this is left to the project's Auto-add workflow, so a repo without one doesn't look finished.
