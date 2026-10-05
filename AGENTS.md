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
  `DOCUMENT_SCHEMAS` maps its type. The import plan document of D025 has no
  schema yet; its schema is added with the discovery and import documents.
- Vector expectations are written once and must stay stable: they are the
  parity contract that the Rust, Python and TypeScript implementations vendor.
  Change a vector only together with those implementations.
- Some vector inputs need exact JSON lexemes (`3.0`, `-0`, `100.0`, a lone
  surrogate escape in R060). Edit those files by hand or with a writer that
  keeps the lexeme; a plain `JSON.stringify` round trip changes them.
