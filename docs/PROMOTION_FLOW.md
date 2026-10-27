# Branch promotion — dev → hml → main

## Policies

- `dev` stores PNG source artwork under `imagedata/` and the optimized WebPs.
- `hml` and `main` must contain **only optimized WebP files**; `imagedata/` is excluded from both.
- **No workflow merges into `hml` or `main`**: only human-reviewed PRs do.
- Any merge conflict outside `imagedata/`, stale WebP, empty/missing catalog, unexpected files or failing build/E2E blocks a promotion.

## Running a promotion

1. After editing PNGs in `dev`, wait for **Optimize WebP artwork** to commit the corresponding optimized assets. The promotion verifies each PNG hash using `python scripts/optimize-images.py --check`.
2. In GitHub **Actions > Prepare dev to hml promotion > Run workflow**, start the workflow (after the workflow exists on `main`).
3. The workflow merges `origin/dev` into a temporary branch created from `origin/hml`, resolves **only** conflicts in `imagedata/` by removing the masters, and verifies that its entire `assets/webp/` tree exactly matches `dev`.
4. It checks the WebP catalog and container signatures, runs localization/lint/unit/build/E2E, and creates a PR `promotion/dev-to-hml → hml` for **manual review**. It never pushes directly to `hml` or `main`.
5. After you approve and merge that PR into `hml`, **Propose hml to production** automatically opens a PR `hml → main` for separate approval (it does not merge).
6. After approving and merging that PR, existing GitHub Pages CI deploys `main`.

## Bootstrap and permissions

The `workflow_dispatch` promotion menu is available **only after** `.github/workflows/promote-dev-to-hml.yml` has reached the default branch `main`. On first adoption, merge this change into `dev`, promote it to `hml` while maintaining the no-PNG rule, then review/promote it to `main` as usual. Subsequent promotions use the workflow.

Under **Settings > Actions > General > Workflow permissions**, ensure **Allow GitHub Actions to create and approve pull requests** is enabled, and the repository allows `GITHUB_TOKEN` write permissions. If disabled, the workflow fails explicitly and provides a manual recovery path; it never bypasses branch protection.

Automated PR creation through `GITHUB_TOKEN` does not trigger the normal `pull_request` workflow. Each promotion explicitly dispatches the existing `ci.yml` workflow on its source branch, in addition to the promotion's pre-PR checks. Always review CI and PR diffs before approving.

A single outstanding `promotion/dev-to-hml` PR is allowed: reruns do not rewrite a pending review branch. When the previous PR is finished, the automation may reuse the same branch name with a guarded force-with-lease update restricted to that automation-owned branch.

## Running safety tests locally

- `node --test scripts/verify-webp-assets.test.mjs scripts/prepare-hml-promotion.test.mjs`
- `node scripts/verify-webp-assets.mjs` validates the existing optimized image set.
- `node scripts/verify-webp-assets.mjs --release` also verifies that no original PNGs are tracked and that `imagedata/` is ignored (run this on `hml` or the promotion branch, not `dev`).
