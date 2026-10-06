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
- A `bundle_scope_mismatch` vector (D029, D030) asserts only the code:
  RFC 0012 defines no details for it, and the implementations report none. Its
  bundle matches its digest pin and its root manifest names the bundle's
  agent, so only the scope check (offline load step 7) can refuse it, and only
  because of the caller's expected workspace or agent.
- The `timestamp` definition keeps its pattern and adds `format: date-time`.
  The pattern fixes the representation (UTC, `Z`, whole seconds) that
  `date-time` alone lets vary, and the format checks the calendar, which a
  pattern cannot. JSON Schema 2020-12 treats `format` as an annotation unless
  the validator asserts it, as AJV does with `ajv-formats`.
- Some vector inputs need exact JSON lexemes (`3.0`, `-0`, `100.0`, a lone
  surrogate escape in R060). Edit those files by hand or with a writer that
  keeps the lexeme; a plain `JSON.stringify` round trip changes them.
- `experiment-case.schema.json` leaves `input` and `expected` as any JSON
  instead of the Agenomic JSON Subset: experiment cases may carry user floats,
  whose canonical form differs across languages. Case and dataset digests are
  therefore computed by the server only, and no vector recomputes them.
  `schema` is optional because dataset upload lines omit it; the hash input
  always includes it.
- `experiment-spec.schema.json` uses two decimal string definitions:
  `decimal` (unsigned) for alpha, coverages, rates and gaps, and
  `signedDecimal` only for metric margins, the one value that may be negative.
- The frozen spec carries `tool_mode.tool_config_digest`, not the inline tool
  execution configuration. That configuration holds free JSON values that may
  contain floats, which would break the integer-only rule and make
  `spec_digest` non-portable; the digest binds it instead.
- `aa_test` and `arms[].runtime_digest_source` are spec members although the
  design example omits them: the promotion gate reads `aa_test` from the
  frozen spec, and `runtime_digest_source` labels the runtime digest that the
  runner declares and Agenomic cannot verify.
- Confounder `axis` is a pattern, not an enum: genome components can grow,
  and an enum would refuse a new axis in an otherwise valid spec.
- `rmp_session_id` accepts mixed-case alphanumerics after `rmp_`, because RMP
  session ids are uppercase ULIDs, unlike the lowercase wire ids of RFC 0012.
- The spec schema checks shape and single-member bounds only. Rules that
  relate several members (stage and candidate count, `entry_point` exactly
  when `level` is `node`, profile and repetitions, the held-out dataset of an
  exploration, the bootstrap minimum of 20 paired cases) belong to the
  service, which validates the spec at preflight.
- RFC 0012 stays `Draft` although its text covers every v0.4 document.
  `GOVERNANCE.md` makes acceptance a maintainer and BDFL decision after a
  7-day comment period, and `docs/versioning.md` freezes the substantive
  content of an Accepted RFC, so implementation work completes the text and
  never changes the status.
- RFC 0012 Detailed design, the schema descriptions, `docs/prompts.md` and
  `conformance/README.md` describe the same v0.4 documents at different
  depths, and the committed schemas are the reference. A schema change updates
  all four in the same commit.
- Documentation passes leave `conformance/vectors/prompts/` alone, README
  included: any byte change there changes `MANIFEST.json` and therefore every
  vendored `SPEC_VECTORS.lock`. Prose about the vectors goes in RFC 0012 or
  `docs/prompts.md`.
