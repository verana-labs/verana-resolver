# GitHub Rules

This document summarizes the GitHub workflow rules and conventions for the **verana-resolver** project.

## Repository

- **Repo**: `verana-labs/verana-resolver`
- **GitHub MCP account**: `mjcascade` (all GitHub operations are performed via MCP tools)
- **DO NOT** use local `git` commands or `gh` CLI for GitHub operations — use MCP tools exclusively (`mcp0_create_branch`, `mcp0_push_files`, `mcp0_create_pull_request`, etc.)
- **Local workspace**: work only in `~/git/github/mjcascade/verana-resolver/` — never edit or read files in `~/git/github/verana-labs/verana-resolver/`

## Issues

- Create issues with type **"Feature"** (not labels); use dependencies when applicable.
- Each issue must clearly explain what must be done.
- A **repository maintainer** assigns issues — do NOT start work until assigned.

## Branching

- Each issue maps to **one branch** using the following prefixes:
  - `feat/` — new features
  - `fix/` — bug fixes
  - `ci/` — CI/CD and infrastructure
  - `docs/` — documentation
  - `chore/` — maintenance / cleanup
  - `test/` — test-only changes
  - `refactor/` — code restructuring
- **ALWAYS branch from `main`** — never from another feature branch.

## Commits

- Commit messages and PR titles follow **Conventional Commits** syntax.
- Valid types (enforced by `lint-pr.yml`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Examples:
  - `feat: add DISABLE_DIGEST_SRI_VERIFICATION env variable`
  - `fix: correct indexer response shape`
  - `ci: add Docker build workflow`
  - `docs: update README environment variables`
  - `chore: remove old/ directory`

## Pull Requests

- Create a PR when the work is ready.
- A **PR reviewer** reviews and approves.
- When the reviewer says **"approved"**, it means they have **merged** the PR to `main`.
- **ALWAYS check if a PR is still open** before pushing additional commits to its branch. If the PR has been merged or closed, create a **new branch from `main`** and a **new PR**. Never reuse a merged PR's branch.

## Pre-Push Checklist

Before pushing any code to GitHub via MCP tools, **always**:

1. Pull / checkout the branch locally.
2. Run `npm install` to install dependencies.
3. Run `npm run build` (or `tsc --noEmit`) to verify TypeScript compiles.
4. Run `npm test` to verify all unit tests pass.
5. Only then push to GitHub and create the PR.

> **Exception**: documentation-only changes (`.md` files) do not require build/test verification.
