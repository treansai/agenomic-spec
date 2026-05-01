# Contributing to AgentLock Spec

Thank you for considering a contribution. AgentLock is an open standard;
its long-term value depends on careful, explicit changes that the wider
community can review.

This repository contains **specification artifacts only**: schemas, RFCs,
documentation, examples, and a conformance suite. **No implementation code**
is accepted here. Implementations live in separate repositories.

## Code of Conduct

By participating, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## What is in scope

- Bug reports against the schemas, RFCs, examples, or conformance fixtures.
- New synthetic example bundles.
- New conformance fixtures (positive or negative).
- Documentation improvements.
- New RFCs proposing additive or replacement design.
- Editorial fixes to RFCs (typos, broken links).

## What is out of scope

- Implementation code (Rust, Python, TypeScript, Go, etc.).
- Vendor-specific extensions or branding.
- Substantive edits to an Accepted RFC. Open a new RFC that supersedes it.

## How to propose an RFC

1. Copy [`rfcs/0000-template.md`](rfcs/0000-template.md) to
   `rfcs/NNNN-short-title.md`. Choose `NNNN` as the next unused number,
   four digits, zero-padded.
2. Fill in the front-matter table and all required sections.
3. Open a pull request titled `RFC NNNN: <short title>`.
4. The PR description should summarize the motivation in 3–5 sentences and
   link to any prior discussion.
5. RFCs land in `Status: Draft`. They become `Accepted` once at least one
   maintainer approves and there is no unresolved blocking objection for
   seven calendar days.

## How to propose a schema change

Schema changes require an accompanying RFC explaining the rationale.

- **Additive change** (new optional field): permitted within the current
  schema directory if it does not invalidate existing examples. Bump the
  CHANGELOG `Unreleased` section.
- **Breaking change**: requires a new schema directory
  (`schemas/v0.2/`, etc.). Old schemas are never modified once tagged.

Every schema PR must:

- Update or add fixtures under `conformance/` covering the new behavior.
- Update or add examples that exercise the new field.
- Pass `npm run validate` and `npm run lint` locally.

## How to add an example bundle

Examples must:

- Be entirely synthetic — no real company names, no real customer data,
  no real model API keys or endpoints.
- Validate against the schemas in `schemas/v0.1/` (or the version they
  declare).
- Include a short `README.md` explaining what the example illustrates.

## Local validation

```bash
npm ci
npm run validate     # validates examples + conformance fixtures
npm run lint         # markdownlint + RFC front-matter lint
bash scripts/lint-rfcs.sh
```

All three must exit 0 before opening a PR.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
Examples:

- `feat(schemas): add atep-event v0.1`
- `docs(rfc-0003): clarify HLC tick algorithm`
- `test(conformance): add invalid fixture for unknown tool protocol`
- `fix(example/claims-agent): correct snapshot_hash format`

## Review and merge

- Two maintainer approvals are required for an RFC to move from Draft to
  Accepted.
- One maintainer approval is sufficient for documentation, fixtures, and
  example bundles.
- CI must be green.
- Squash-merge by default; preserve the Conventional Commit subject as
  the merge commit subject.

## Reporting security issues

See [`SECURITY.md`](SECURITY.md). Do not file public issues for
vulnerabilities.
