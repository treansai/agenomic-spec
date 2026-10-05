# Agent notes

## Managed prompts

Reasons behind the RFC 0012 tooling, kept here because new code carries no
comments.

- `scripts/validate.js` adds every `schemas/v0.4/*.schema.json` file to AJV
  before using any of them, then takes the validator with `ajv.getSchema($id)`.
  The v0.4 schemas reference each other (`prompt-bundle` uses the manifest,
  content and artifact set schemas), and `ajv.compile` on a schema whose `$id`
  was already added throws.
- `scripts/validate.js` does not walk `conformance/vectors/`; it only walks
  `conformance/valid` and `conformance/invalid`. `scripts/vectors.js` owns the
  vectors and `scripts/validate.sh` runs it after `validate.js`.
- `scripts/vectors.js` reuses `canonicalJson` from `scripts/trace-crypto.js`
  and checks the Agenomic JSON Subset first: inside the subset that function
  is byte-identical to the canonical form of RFC 0012 (UTF-16 key order,
  `JSON.stringify` escapes, `-0` printed as `0`), outside it the output is not
  portable.
- `MANIFEST.json` hashes raw file bytes, not canonical JSON, because vendoring
  integrity is about bytes. Any edit under `conformance/vectors/prompts/`,
  README included, needs `node scripts/vectors.js --write-manifest`.
- Digest vectors validate `input.document` against its v0.4 schema only when
  `DOCUMENT_SCHEMAS` maps its type. A `without_plan_digest` projection hashes
  a plan without its required `plan_digest` member, so only its
  `projection.from` (the full plan) is validated against
  `prompt-import-plan.schema.json` (vector D025).
- `scripts/validate.js` picks the release attestation schema from
  `schema_version`, not `spec_version`: attestations carry no `spec_version`,
  so the default rule would validate a version 2 attestation against v0.1,
  whose `schema_version` is the constant 1. Version 2 selects v0.4, anything
  else v0.1, so existing attestations validate exactly as before. The v0.4
  schema keeps `additionalProperties: true` and defines `genome_version` and
  `prompt_manifest_digest` only inside the version 2 branch, so it accepts
  every v0.1 attestation too.
- An import plan computed from a prompts file is not stored, and the apply
  call recomputes it and compares `plan_digest`. Its `plan_id` and
  `created_at` are therefore `null`: a per-call id or timestamp inside the
  hashed plan would make the recomputed digest differ every time. A plan from a
  discovery report is stored and keeps both.
- In a prompts file plan, `item_id` is `cand_` plus the first 16 hex digits of
  sha256 over the UTF-8 bytes of the `prompt_id` (not over its canonical JSON
  string).
- The `prompts-file-yaml` vectors assert only the error code, not the line or
  column, because those come from parser internals. Their only consumer is
  Python: the `agm` CLI reads JSON prompts files only.
- Vector expectations are written once and must stay stable: they are the
  parity contract that the Rust, Python and TypeScript implementations vendor.
  Change a vector only together with those implementations.
- Some vector inputs need exact JSON lexemes (`3.0`, `-0`, `100.0`, a lone
  surrogate escape in R060). Edit those files by hand or with a writer that
  keeps the lexeme; a plain `JSON.stringify` round trip changes them.
