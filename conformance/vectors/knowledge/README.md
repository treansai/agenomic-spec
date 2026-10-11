# Knowledge base conformance vectors

These vectors are the parity contract for every implementation of RFC 0014
(knowledge bases). They pin, byte for byte, the section ids and digests of
the section algorithm, the digests of every hashed knowledge document, chunk
ids, the query digest, the `kb://` reference grammar and the `approx-v1` token
counter. Two informative suites pin the lexical tokenizer and BM25 scoring for
the implementations that implement them. The directory is separate from
`conformance/vectors/prompts/`: the two sets are vendored and locked
independently.

## Suites

| Suite | Directory | Ids | Vectors | What it pins |
|---|---|---|---|---|
| section | `section/` | KS001 to KS012 | 12 | section tree, section ids, anchors, tags, section and document content digests, token counts |
| digest | `digest/` | KD001 to KD036 | 36 | canonical JSON and digests of the chunking, embedding space, index, version manifest, agent manifest, retrieval parameters, section and document content documents; chunk ids; chunk content digests; query normalization and digest; AJS failures |
| ref | `ref/` | KR001 to KR042 | 42 | `kb://` parsing with every failure reason, the cross-workspace refusal and formatting |
| tokens | `tokens/` | KT001 to KT017 | 17 | the `approx-v1` token counter |
| lexical | `lexical/` | KL001 to KL013 | 13 | the lexical tokenizer (informative algorithm) |
| bm25 | `bm25/` | KM001 to KM009 | 9 | BM25 ranking and scores (informative algorithm) |

`MANIFEST.json` lists every other file of this directory with the sha256 of its
raw bytes, keys sorted. Its header names the token counter the vectors pin,
`approx-v1`. Regenerate the vectors and the manifest with
`node scripts/knowledge-vectors.js --write`; after an edit of this README alone,
`node scripts/knowledge-vectors.js --write-manifest` is enough.

## Consuming the vectors

Copy this directory into the implementation repository and record a
`SPEC_VECTORS.lock` next to it:

```json
{ "spec_commit": "<40 hex>", "manifest_sha256": "sha256:<hex of the MANIFEST.json bytes>" }
```

Every harness:

1. checks that sha256 of the vendored `MANIFEST.json` bytes equals the lock;
2. checks that the vendored file set and every file hash equal the manifest;
3. runs every vector whose `consumers` includes it (`rust-cloud`, `rust-cli`,
   `python`, `typescript`);
4. fails on an unknown suite.

An implementation that does not implement an informative algorithm (the
`lexical` and `bm25` suites) skips that suite explicitly and says so in its
harness; it never skips a normative suite.

## File format

Every file is one `agenomic.conformance_vector/v1` document, validated by
`schemas/v0.4/knowledge-conformance-vector.schema.json`. The envelope is the
one of the prompt vectors; the suites differ.

```json
{
  "schema": "agenomic.conformance_vector/v1",
  "suite": "ref",
  "id": "KR002",
  "intent": "a pinned knowledge base version",
  "consumers": ["rust-cloud", "python", "typescript"],
  "input": { "ref": "kb://0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f/kb_customer_support@v4", "workspace_id": "0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f" },
  "expected": { "ok": true, "...": "..." }
}
```

The file name is `<id>-<kebab-slug>.json`, `id` is unique and its two-letter
prefix matches the suite: `KS` section, `KD` digest, `KR` ref, `KT` tokens,
`KL` lexical, `KM` bm25.

## Matching rule

A harness asserts exact equality on every member present in `expected`, and on
nothing else:

- `expected.ok` says whether the operation succeeds.
- Success members are compared with deep JSON equality. Lists keep their order.
- On failure, `expected.error` holds the members to assert: `code` (the
  top-level error code), `reason` (the closed reason of a reference or query
  refusal) and `item` (an AJS failure, `{ code, value_path }`).

## Suite forms

### section

Input `{ operation: "sections", document_id, fallback_title, source?, outline }`.

- `outline` is the normative input: `title` (the title the parser found, or
  `null`), `front_matter` (the parsed front matter object; only `tags` and
  `sections` are read) and `blocks`, a list of
  `{ heading: { level, text, anchor, tags } }` and `{ text }` entries in
  document order. A `text` entry is one rendered content block (a paragraph,
  a rendered list, a fenced code block, a rendered table).
- `source`, when present, is the Markdown document the outline was parsed
  from. It is informative: an implementation with a Markdown parser that
  follows RFC 0014 may also check that parsing `source` yields the same
  result, but every harness checks the outline.

Success `{ ok, title, content_digest, token_count, sections }`. Each section is
`{ ordinal, section_id, parent_section_id, depth, heading, heading_path,
anchor, content, content_digest, tags, token_count }`, root first.
`content_digest` at the top is the document content digest and `token_count`
the sum of the section counts.

### digest

- `{ operation: "digest", document, projection? }` gives
  `{ ok, document_type, canonical, digest }`. An optional `projection`
  `{ rule, from }` proves where the hashed document comes from:
  `index_identity` (`document` is the index configuration `from` without its
  `chunking` and `embedding` members, and both member digests of `from` are
  correct), `retrieval_params` (`document` is built from the search parameters
  `from`) or `embedding_space` (`document` is the embedding space of the
  embedding settings `from`, which carry a connection id or an endpoint that
  never enters the digest). A document outside the Agenomic JSON Subset fails
  with `{ ok: false, error: { item: { code, value_path } } }`, with no top-level
  code, as in the prompt digest suite.
- `{ operation: "chunk_id", document_content_digest, chunking_digest, ordinal }`
  gives `{ ok, chunk_id }`.
- `{ operation: "chunk_content_digest", text }` gives `{ ok, content_digest }`.
- `{ operation: "query_digest", query }` gives `{ ok, normalized, digest }`, or
  `{ ok: false, error: { code: "knowledge_query_invalid", reason } }` with
  reason `empty`, `control_character` or `too_long`.

KD030 keeps the JSON lexeme `4.0` on purpose: an integral number written with
a fraction is the integer 4, and the document hashes like KD012.

### ref

Input `{ ref, workspace_id }`, where `workspace_id` is the current workspace,
or `null` when an offline client does not know it. Success
`{ ok, form, workspace_id, kb_id, version, document_id, revision, canonical }`,
absent parts written `null`; `form` is `base` or `document`, and `canonical`
is the formatted reference, which equals the input. Failure
`{ ok: false, error: { code: "knowledge_ref_invalid", reason } }` or
`{ ok: false, error: { code: "knowledge_ref_cross_workspace" } }`.

### tokens

Input `{ text }`. Success `{ ok, token_count }` under `approx-v1`.

### lexical

Input `{ text }`. Success `{ ok, tokens }`, in text order, duplicates kept.

### bm25

Input `{ query, candidates, k1, b, corpus }`: `k1`, `b` and
`corpus.average_length` are decimal strings, `corpus` is `null` when the
statistics come from the candidates themselves. Success `{ ok, ranked }`, each
item `{ candidate, score }` with the candidate index and the score as a
decimal string with exactly six fractional digits, best first, ties by
candidate index. A harness formats its binary64 score with six fractional
digits and compares the strings; no vector score lies within 1e-12 of a
rounding tie, so every correct rounding mode agrees.

## Authoring

`node scripts/knowledge-vectors.js` validates every vector against its schema,
checks names, ids and the manifest, recomputes every expected value with an
independent JavaScript implementation of RFC 0014 (section tree and ids,
canonical JSON and sha256 digests with `node:crypto`, the reference parser,
the token counter, the tokenizer and BM25), validates every hashed document
against its v0.4 schema, and checks that every file is byte-identical to the
generator output. `node scripts/knowledge-vectors.js --compute <file>` prints
the recomputed `expected` of a vector, or the canonical JSON and digest of any
JSON document. A vector changes only together with the implementations that
consume it.
