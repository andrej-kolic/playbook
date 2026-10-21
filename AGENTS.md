# Agent conventions

- **Commit straight to `main`.** No feature branch or PR: this is a solo repo, and other projects get a rule only once it is on `main`, since `pnpm rules:update` pulls the default branch.
- **Exception: unfinished multi-step work goes on a branch**, such as a skill built one piece at a time. CI runs on every branch, and nothing reaches other projects until it merges into `main`.
- Add or change rules and skills as [CONTRIBUTING.md](CONTRIBUTING.md) says, including its version-line rules.
