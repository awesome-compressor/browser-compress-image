Release checklist for @awesome-compressor/browser-compress-image

Use this checklist before publishing a new release to npm. These are automated and manual sanity checks that help avoid common release mistakes.

1. Update version
   - Update version in package.json (or use the repo's bump tool, e.g. `pnpm run release` which uses `bumpp`).

2. Run tests and typecheck
   - pnpm typecheck
   - pnpm test

3. Build
   - pnpm build
   - Verify `dist/index.js` and `dist/index.d.ts` exist

4. Size check (optional)
   - pnpm run size

5. Verify exports & sideEffects
   - Ensure `package.json` `exports` points to the correct dist entries
   - Ensure `sideEffects` is correct (false if no side-effectful modules)

6. Smoke test in a sample project (recommended)
   - Create a temporary dir and `npm link` or `pnpm pack` the built package
   - Import core API to validate runtime behavior, e.g.:
     ```js
     import { compress } from '@awesome-compressor/browser-compress-image'
     import { compressWithCanvas } from '@awesome-compressor/browser-compress-image/tools'
     ```

7. Publish
   - Use the repository's release process, for example:
     - pnpm run release (this repo's script uses `bumpp` and `npm publish`)

8. Post-publish
   - Verify npm package page and test installation in a clean environment

Notes/Tips

- If you add new subpath exports, ensure the build generates matching `dist` paths or map them to the root `dist/index.js` as a fallback.
- Keep `sideEffects` conservative. If you introduce modules that perform side effects during import, remove them from `sideEffects: false` or list exceptions.
