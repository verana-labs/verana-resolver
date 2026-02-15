# GitHub Rules

This document summarizes the GitHub workflow rules and conventions for the **verana-resolver** project.

## Repository

- **Repo**: `verana-labs/verana-resolver`
- **GitHub MCP account**: `mjcascade` (all GitHub operations are performed via MCP tools)
- **DO NOT** use local `git` commands or `gh` CLI for GitHub operations — use MCP tools exclusively (`mcp0_create_branch`, `mcp0_push_files`, `mcp0_create_pull_request`, etc.)

## Issues

- Create issues with type **"Feature"** (not labels); use dependencies when applicable.
- Each issue must clearly explain what must be done.
- **User (mj) assigns issues** — do NOT start work until told.

## Branching

- Each issue maps to **one branch** using the following prefixes:
  - `feat/` — new features
  - `fix/` — bug fixes
  - `ops/` — operations / infrastructure
  - `docs/` — documentation
- **ALWAYS branch from `main`** — never from another feature branch.

## Commits

- Commit messages follow **Conventional Commits** syntax:
  - `feat: <description>`
  - `fix: <description>`
  - `ops: <description>`
  - `docs: <description>`

## Pull Requests

- Create a PR when the work is ready.
- User (mj) reviews and approves.
- When the user says **"approved"**, it means they have **merged** the PR to `main`.

## Pre-Push Checklist

Before pushing any code to GitHub via MCP tools, **always**:

1. Pull / checkout the branch locally.
2. Run `npm install` to install dependencies.
3. Run `npm run build` (or `tsc --noEmit`) to verify TypeScript compiles.
4. Run `npm test` to verify all unit tests pass.
5. Only then push to GitHub and create the PR.

> **Exception**: documentation-only changes (`.md` files) do not require build/test verification.
