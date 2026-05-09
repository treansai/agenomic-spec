# Release process

## Releases of the specification itself

This repository is documentation, schemas, and conformance fixtures.
There are no compiled artifacts to publish. A "release" of the spec
is:

1. A Git tag (`vX.Y.Z`) pointing at a specific commit on `main`.
2. A GitHub Release with notes generated from `CHANGELOG.md`.
3. A documentation announcement (project blog/forum, mailing list).

## Pre-release checklist

Before tagging:

- [ ] All `Unreleased` entries in `CHANGELOG.md` are accurate.
- [ ] `npm ci && npm run validate && npm run lint` exit 0.
- [ ] `bash scripts/lint-rfcs.sh` exits 0.
- [ ] CI is green on `main`.
- [ ] If this release introduces a new schema directory, the
      previous directory is unmodified.
- [ ] No RFC accepted in this release was edited substantively
      after acceptance (only typo/link fixes, recorded by
      `docs(rfc-NNNN):` commits).
- [ ] `README.md` status table reflects the version about to be
      tagged.

## Tagging

```bash
git checkout main
git pull --ff-only
git tag -a v0.1.0 -m "agenomic-spec v0.1.0 (experimental)"
git push origin v0.1.0
```

## GitHub Release

Open the tag on GitHub and "Draft a new release" with:

- **Title:** `v0.1.0 — experimental`
- **Body:** copy the `## [0.1.0]` section from `CHANGELOG.md`,
  prefixed by a one-paragraph summary.
- **Pre-release** flag: **set** for any v0.x release. Unset only at
  v1.0.0 and later.

No artifacts are uploaded. The Git source tree is the artifact.

## Post-release tasks

- Move all `## [Unreleased]` entries into a new `## [X.Y.Z]` section
  in `CHANGELOG.md` and create a new empty `## [Unreleased]`
  section above it.
- Open a tracking issue for the next planned RFC or schema bump if
  one is known.

## Hotfix releases

If a bug warranting a patch is discovered after a release:

1. Cherry-pick the fix onto a `release/vX.Y` branch from the
   release tag.
2. Bump the patch (e.g. `v0.1.1`).
3. Tag and release as above.
4. Forward-port the fix to `main` if not already there.

We have not maintained release branches for v0.x to date because the
spec is changing fast. If a hotfix is needed during v0.x, it is
typically simpler to ship `vX.(Y+1).0` from `main`.

## Announcing a release

- Project blog / forum (URLs TBD; placeholder during v0.1).
- Mailing list (URL TBD).
- Conformance suite consumers should subscribe to GitHub Releases
  on this repo to be notified of new tags.

## What we do NOT do

- We do not publish a runtime, library, or tool from this repo.
- We do not push to npm, PyPI, crates.io, or any other package
  registry. Implementations live in separate repositories under
  their own release cycles.
- We do not embed the spec content in third-party packages without
  preserving the Apache-2.0 license and attribution.
