# Vendored Univer packages (RTL/bidi build)

## What
7 × `@univerjs/*@0.25.1` tarballs built from Univer source at tag `v0.25.1`
(`c9c8607`) with upstream
PR [dream-num/univer#7011](https://github.com/dream-num/univer/pull/7011)
(`cc65c8d`, "feat(rtl): end-to-end RTL and bidirectional text support")
applied on top. That PR was closed unmerged and exists in no release,
so it is vendored here instead of invented locally.

## Why
Univer 0.25.1 (and 1.0.0-rc.0) has no bidi text layout: Arabic inside the
cell editor renders disconnected/reversed, and the grid never mirrors.
The PR adds bidi reordering (bidi-js), the Arabic language ruler,
sub-glyph caret metrics, RTL line adjustment, caret/selection geometry
and cell-edit alignment — exactly our symptoms.

## Reproduce
1. `git clone --depth 1 --branch v0.25.1 https://github.com/dream-num/univer.git`
2. Download `https://github.com/dream-num/univer/pull/7011.patch` and
   `git apply` it (applies cleanly on v0.25.1).
3. `pnpm install`, then build the 7 packages
   (`core engine-render docs-ui sheets-ui sheets-formula-ui sheets ui`).
   NOTE (Windows only): `common/shared/tsdown/index.ts` needs a temporary
   `pathToFileURL()` around the `--config` dynamic import
   (ERR_UNSUPPORTED_ESM_URL_SCHEME); revert it after building — it is NOT
   part of these tarballs.
4. `pnpm --filter <pkg> pack` → the 7 `.tgz` files here.
5. Upstream unit tests pass: bidi-reorder (9), language-ruler-arabic (7),
   line-adjustment-rtl (5), text-direction (8), worksheet (12).

## Wiring
`package.json` → `overrides` pins these 7 packages to `./vendor/univer-rtl/*.tgz`.
All other `@univerjs/*` stay on npm 0.25.1 (same base, no drift).
`bidi-js@^1.0.3` is fetched from the registry as a normal dependency of
the vendored engine-render.

## Maintenance
Re-check upstream releases periodically: if an official release ever
ships end-to-end bidi (grep the bundle for `bidi-reorder`), delete this
directory and drop the overrides.
