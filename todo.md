# TODO

## High Priority

- [x] Finish the worker story so the implementation matches the API and docs.
  - Files: `src/utils/compressionWorker.ts`, `src/compressEnhanced.ts`, `docs/performance-optimization-guide.md`
  - Done: kept worker disabled by default and updated docs/examples to describe it as experimental until real worker-side compression exists.

- [x] Stop `jsquash` from reporting fake success outside browser runtimes.
  - Files: `src/tools/compressWithJsquash.ts`, `src/compress.ts`, `src/compressWithTools.ts`
  - Done: non-browser `jsquash` now throws explicitly so multi-tool comparisons fall back honestly.

- [x] Implement real `fit: 'cover'` behavior in preprocessing.
  - Files: `src/utils/resize.ts`, `src/utils/preprocessImage.ts`
  - Done: cover resizing now computes crop-fill dimensions correctly and has focused regression tests.

## Product / Docs Alignment

- [ ] Align README/package claims with the actual package contents.
  - Files: `README.md`, `package.json`, `docs/*`
  - Plan: remove or soften claims around zero dependencies, worker readiness, bundle size, and conversion completeness unless the code really supports them.

- [ ] Align versioning and release metadata.
  - Files: `README.md`, `package.json`, release docs
  - Plan: make changelog/version references consistent and document the current release state accurately.

## Build / CI

- [ ] Fix the CI size-check mismatch.
  - Files: `.github/workflows/ci.yml`, `package.json`
  - Plan: add a real `size` script or remove the CI step until the bundle-size check is wired up.

- [ ] Fix the publish script toolchain mismatch.
  - Files: `package.json`
  - Plan: replace `nr build` with a declared tool/script, or add the missing dependency that provides `nr`.

- [ ] Revisit `sideEffects: false` versus eager singleton initialization.
  - Files: `package.json`, `src/index.ts`, `src/utils/compressionQueue.ts`, `src/utils/compressionWorker.ts`, `src/utils/memoryManager.ts`
  - Plan: either defer singleton setup until first use, or remove the side-effect-free claim.

## Conversion Follow-ups

- [ ] Decide whether conversion-level `encodeWithJsquash` should be real or clearly marked fallback-only.
  - Files: `src/conversion/encoders.ts`, docs
  - Plan: wire actual JSQuash encoders for conversion, or document that this path currently falls back to canvas.

- [ ] Revisit the simplified ICO encoder beyond metadata correctness.
  - Files: `src/conversion/encoders.ts`
  - Plan: either keep the current lightweight encoder and document its limits, or switch to a more complete ICO implementation.

## Test Debt

- [ ] Fix the browser-path test setup that passes `Promise<File>` as `File`.
  - Files: `test/features.test.ts`
  - Plan: await file creation in the browser branch and make the test exercise the intended path.

- [ ] Replace random-byte image fixtures with valid image samples where decoder behavior matters.
  - Files: `test/new-features.test.ts`, related helpers
  - Plan: use small valid PNG/JPEG/GIF fixtures so adapter failures are caught by tests.

- [ ] Add export smoke tests for the package entrypoints.
  - Files: test suite, possibly a tiny fixture package
  - Plan: verify `import` / `require` behavior for the advertised entrypoints before tightening bundle/docs claims.
