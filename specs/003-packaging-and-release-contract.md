# 003 Packaging and Release Contract

Status: Accepted

Scope: `package.json` entry metadata, published `dist/` artifacts, public
subpath exports, and release-time smoke checks.

This document defines the current packaging contract for the published package.
It records what the repository ships today and which checks must stay aligned
before release.

## Maturity

- packaging metadata: `stable`
- published root entrypoint: `stable`
- published subpath exports: `stable`
- release smoke checks: `stable`

## Contract

### PKG-001 Published artifact surface

- The published package MUST ship from `dist/`.
- `package.json.files` MUST include `dist`.
- The build MUST emit:
  - `dist/index.js`
  - `dist/index.d.ts`
- `package.json.type` MUST remain `module`.

### PKG-002 Root entry metadata

- `package.json.main` MUST point to a built file under `dist/`.
- `package.json.module` MUST point to a built file under `dist/`.
- `package.json.types` MUST point to a built file under `dist/`.
- `package.json.exports["."]` MUST expose:
  - `types`
  - `import`
  - `require`

### PKG-003 Public export surface

The currently supported public export surface is:

- `.`
- `./tools`
- `./conversion`
- `./utils`

Current behavior:

- All current public subpath exports resolve to the root build outputs
  (`./dist/index.js` and `./dist/index.d.ts`).
- The package does NOT currently promise dedicated per-subpath build files.

Constraints:

- Every public export target MUST point to an existing built file under `dist/`.
- Adding, removing, or retargeting a public subpath export MUST update this
  spec in the same change.

### PKG-004 Runtime smoke contract

After `pnpm build`, the package MUST support self-referenced loading for the
root export and every public subpath export through:

- Node ESM `import`
- Node CommonJS `require`

The repository automation for this contract is `pnpm package:check`.

### PKG-005 Release gate

Before release, the repository MUST verify at least:

- `pnpm docs:check`
- `pnpm build`
- `pnpm package:check`

If packaging metadata or the public export surface changes, the same change MUST
also update:

- this spec
- `RELEASE_CHECKLIST.md`
- any generated status output affected by `package.json`

## Non-goals of this spec

This spec does NOT promise:

- separate tree-shaken bundles per subpath
- a CommonJS-specific build artifact
- a bundle size budget
- npm provenance or publication policy

Those can be added later as separate release or distribution contracts.

## Change policy

- Behavior changes to any `PKG-*` rule MUST update this file.
- Release automation that enforces packaging behavior SHOULD reference the
  corresponding `PKG-*` identifier in script comments or output when practical.
