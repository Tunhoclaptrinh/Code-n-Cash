---
name: git-conventions
description: Branch, commit and push rules for the Code-n-Cash monorepo. Use before creating a branch, writing a commit message, or pushing.
---

# Git conventions

## Branches

`<type>/<kebab-case-summary>`, type is `feat`, `fix`, `docs`, `refactor`, `test` or `chore`.
Never commit to `main`. Examples: `feat/frontend-contract-workflow-screens`, `fix/frontend-login-redirect`.

## Commits

- Conventional Commits, English, imperative: `feat(frontend): add contract list screen`.
  Scopes: `frontend`, `docs`, `tools`, `tests`.
- Subject at most 72 characters, no trailing period. Body only for the why.
- **Author is the human configured in git.** Do not add `Co-Authored-By`, "Generated with Claude Code" or any other
  AI attribution to commits, PR descriptions or files. Check with `git log -1 --format=%B` after committing.
- Stage explicit paths (`git add BangD-Case4/frontend`), never `git add -A`. Do not commit `node_modules`, `dist`,
  `.env*`, screenshots or scratch files.
- One logical change per commit; build and typecheck pass at every commit.

## Pushing

Push only when the user asks. Use `git push -u origin <branch>`. Never force-push shared branches or push to `main`.
