# WebP art pipeline

Card art, backs, boards and UI are served as WebP. Original PNGs remain in
`imagedata/` as editable masters; optimized files live in version-controlled
`assets/webp/`. Neither dev nor production builds recompress images.

On a workstation, install `python -m pip install -r requirements-assets.txt`
then execute `python scripts/optimize-images.py` when artwork changes.
Only changed images (SHA-256 checksum + conversion parameters) are encoded.
`python scripts/optimize-images.py --check` validates the cache without
recompressing. Commit the optimized files and `catalog.json`.

GitHub Actions runs the optimizer when art inputs change on dev, committing
WebP outputs back to that branch after lint, tests and build checks. This
feature branch's first push also seeds the binaries. WebP commits don't trigger
the workflow again. Homologation/production simply deploy the committed WebPs.

`public/generated/` is ignored/untracked; Vite creates manifests and copies
optimized files into it. PNG masters are still tracked to make encoding
reproducible but are not packaged into `dist/`. Archiving original PNGs outside
Git or moving them to Git LFS is a separate later migration.

Card encoder quality 86, backs 90, boards 87; UI uses lossless WebP.

The manifest generator prunes old files from generated asset directories,
preventing leftover PNGs from being deployed. The optimization workflow also
runs the Playwright end-to-end suite before committing converted assets.
