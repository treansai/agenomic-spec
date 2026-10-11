# Knowledge bases

This guide explains how knowledge bases are referenced, versioned, bound to
agents and verified. The normative text is
[RFC 0014](../rfcs/0014-knowledge-bases.md); the schemas are in
[`schemas/v0.4/`](../schemas/v0.4/) and the cross-language conformance
vectors in
[`conformance/vectors/knowledge/`](../conformance/vectors/knowledge/README.md).

A knowledge base (KB) is a governed collection of documents. Its documents
change in a mutable working set; publishing knowledge means snapshotting the
working set into an immutable, digest-addressed **version** and pointing
agents at it. An agent's knowledge is a manifest of pinned versions whose
digest enters its genome, so a knowledge change is a visible change of the
agent, exactly like a prompt change under [managed prompts](prompts.md).

## The documents at a glance

| Document | Schema | Hashed | Role |
|---|---|---|---|
| `agenomic.knowledge_section/v1` | `knowledge-common.schema.json#/$defs/sectionContent` | yes, whole | the input of a section `content_digest`: heading path and own text |
| `agenomic.knowledge_document_content/v1` | `knowledge-common.schema.json#/$defs/documentContent` | yes, whole | the input of a document `content_digest`: title and section list |
| `agenomic.knowledge_chunking_config/v1` | `knowledge-index-config.schema.json#/$defs/chunkingConfig` | yes, whole | how documents are cut into chunks |
| `agenomic.knowledge_embedding_config/v1` | `knowledge-index-config.schema.json#/$defs/embeddingSpace` | yes, whole | the embedding space: provider, model, model version, dimensions, normalization |
| `agenomic.knowledge_index_config/v1` | `knowledge-index-config.schema.json` | without `chunking` and `embedding` | the index configuration of a version |
| `agenomic.knowledge_version_manifest/v1` | `knowledge-version-manifest.schema.json` | yes, whole | one immutable KB version: every document revision by digest |
| `agenomic.agent_knowledge_manifest/v1` | `agent-knowledge-manifest.schema.json` | yes, whole | the knowledge identity of an agent: pinned versions, collections, ceilings, retrieval settings |
| `agenomic.knowledge_retrieval_params/v1` | `knowledge-common.schema.json#/$defs/retrievalParams` | yes, whole | the parameters of one retrieval |
| `agenomic.knowledge_retrieval_event/v1` | `knowledge-retrieval-event.schema.json` | as the `payload_hash` of a trace event | the `knowledge.retrieve` payload: refs and digests, never text |

Every hashed document follows the rules of RFC 0012: a `schema` member that
names its type, every member always present, unknown members refused, and
integers only. Thresholds and scores are integers in parts per million
(`min_evidence_score_ppm: 250000` means 0.25); there is never a fraction in a
hashed document.

## Referencing knowledge

| You write | Meaning |
|---|---|
| `kb://0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f/kb_customer_support` | the knowledge base |
| `kb://0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f/kb_customer_support@v4` | its immutable version 4 |
| `kb://0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f/kb_customer_support/documents/kdoc_01hzy8m6k2v9qf7c3n5t0r4wxa` | one document of the working set |
| `kb://0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f/kb_customer_support/documents/kdoc_01hzy8m6k2v9qf7c3n5t0r4wxa@v7` | revision 7 of that document |

The workspace is always explicit, and a reference to another workspace is
refused (`knowledge_ref_cross_workspace`) and never resolved. References are
never trimmed, case-folded or percent-decoded. `kb://<ws>/kb_x/`,
`kb://<ws>/kb_x@4`, `KB://<ws>/kb_x` and `kb://<ws>/kb_x@v1/documents/...`
are all refused, each with a precise reason (`trailing_slash`,
`invalid_version`, `unsupported_scheme`, `invalid_path`). Kb ids are chosen by
their creator (`kb_customer_support`); document ids are server-made
(`kdoc_` plus a lowercase ULID).

## Documents, sections and stable ids

Each document revision is parsed into a tree of sections: the root carries
the document title, and every heading opens a section under the nearest
shallower heading. A section's content is its own text, not its children's.
The Markdown document of vector KS001 gives:

| Section | Heading path | Section id |
|---|---|---|
| root | `[]` | `sec_cf6009ddaf9a166f` |
| Agent Security | `["Agent Security"]` | `sec_8d08fbbc21fd3832` |
| Authentication | `["Agent Security", "Authentication"]` | `sec_d32fd5630e9b0281` |
| Authorization | `["Agent Security", "Authorization"]` | `sec_edecbad169c8cf42` |
| Tool Permissions | `["Agent Security", "Authorization", "Tool Permissions"]` | `sec_41672fa1b7ad29af` |
| Audit | `["Agent Security", "Audit"]` | `sec_e958882299f2bcf0` |

A section id is derived from the document id, the lowercase,
white-space-collapsed heading path and the number of earlier siblings with
the same heading. It does not depend on any body text or on unrelated
sections: editing the Audit text changes the Audit section digest and the
document digest and nothing else, and
inserting a new section between Authentication and Authorization keeps every
existing id. Two sibling `FAQ` sections get distinct ids, and so do the
`Linux` sections nested under each of them (vector KS002).

Each section has a `content_digest` over its heading path and its text, and
the document has a `content_digest` over its title and the list of its
sections. Any client can recompute both from the sections a server returns.
Tags come from the front matter `tags`, from heading classes (`{.ops}`) and
from front matter `sections` entries keyed by heading or heading path:

```markdown
---
tags: [security, agents]
sections:
  Audit: [compliance]
  Guide/Keys: [secrets]
---
# Guide

## Keys {#key-rotation .ops}
```

## Chunks and the index configuration

Retrieval works on chunks cut from sections. A chunk id is derived from the
document content digest, the chunking configuration digest and the chunk
ordinal, and its `content_digest` is the sha256 of its text, so chunks and
their embeddings are shared by every version that contains the same document
revision under the same configuration.

The index configuration of a version names:

- the chunking configuration (`heading_aware` by default, 512 tokens with a
  64 token overlap), counted with the `approx-v1` token counter: a run of
  letters and digits counts one token per four characters, every other
  character one, white space nothing;
- the embedding space: `local-hash` (the community default, 384 dimensions,
  lexical rather than semantic) or an `openai-compatible` model with its
  version, dimensions and normalization. Endpoints, connections and
  credentials are never part of the space, so moving an endpoint keeps every
  digest, while changing the model or its dimensions creates a new space whose
  vectors are never compared with the old ones;
- the text search configuration (`simple` by default).

Changing the index configuration of a KB re-indexes its working set; existing
versions keep their own configuration.

## Versions

A version manifest lists every member document revision with its path,
revision, content digest, original bytes digest, collection, classification
and tags, plus the index configuration digest:

```json
{
  "schema": "agenomic.knowledge_version_manifest/v1",
  "workspace_id": "0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f",
  "kb_id": "kb_customer_support",
  "version": 1,
  "parent_version": null,
  "index_config_digest": "sha256:2823980736a4f48c65abb3edd93d8a13741f9f7dc160f3b8ee5c090afcd1c4e6",
  "documents": {
    "kdoc_01hzy8m6k2v9qf7c3n5t0r4wxd": {
      "path": "policies/refund-policy.md",
      "revision": 1,
      "content_digest": "sha256:daf65ccc2a5c00f106872d4368319b2a0f4cc01ab23b5a63e15412f626d31b23",
      "blob_digest": "sha256:1cfb123f99d8477a1803cf37d1678f9de4169ae42ebb00cf23b5d7026f4b65f6",
      "collection": "faq",
      "classification": "public",
      "tags": ["billing", "refunds"]
    }
  }
}
```

Nothing edits a version. Uploads, edits and synchronizations change the
working set, and a new version snapshots it. Publication is a pointer to a
version; rolling back moves the pointer back; a retracted version is never
served again, and agents pinned to it fail closed.

## Agents and the genome

An agent reads knowledge through bindings that name a version number or
`published`, collections and a classification ceiling. Resolving them gives
the agent knowledge manifest, where `published` has become the version
published at that moment. The manifest digest is the agent's knowledge
identity: an agent genome carries it as the optional
`knowledge_manifest_digest` component, so moving the published pointer of a
KB that an agent follows produces a new agent version. An execution keeps the
manifest frozen at its first retrieval, so a publication never changes the
knowledge of a running execution.

In a v0.3 run trace, `components.knowledge_version` should carry the agent
knowledge manifest digest when the agent has one. Otherwise it keeps its v0.3
meaning, an opaque digest declared by the producer, and is never the digest
of an empty agent knowledge manifest.

In a bundle, the `knowledge[]` entries of [`genome.yaml`](genome.md#knowledge)
and [`agent.lock.yaml`](lockfile.md#knowledge) pin managed KB versions without
any schema change: `source_uri` (genome) and `index_id` (lock) are the
versioned `kb://` reference, and `snapshot_hash` is the version manifest
digest.

## Retrieval

A query is NFKC normalized and white-space collapsed, and only its digest
(`knowledge_query_digest`) needs to be stored. The parameters of a retrieval
(mode, `top_k`, reranking, context budget, expansion and filters, with filter
lists sorted and deduplicated) have their own digest. Scores are rank derived
and reported in parts per million of the best attainable score; they are not
probabilities.

Every retrieval writes a `knowledge.retrieve` event whose payload holds the
query digest, the agent manifest digest and execution key for an
agent-scoped retrieval, and one ref per returned item (KB, version, version
manifest digest, document, section, chunk, content digest, rank, score). It
never holds the query text or any retrieved text: a reviewer resolves the refs
against the immutable versions, under the reviewer's own access, and
re-verifies every digest.

## Retrieved text is untrusted

Evidence handed to a model is data, never instructions. It is wrapped in
`<knowledge_evidence id="..." source="..." heading="..." risk="...">`
delimiters behind a fixed preamble, with every tag-opening `<` escaped so that
no evidence can close its delimiter. Each chunk carries an injection risk
level and flags (`instruction_override`, `role_marker`, `instruction_tag`,
`tool_call_shape`, `hidden_unicode`, `encoded_payload`, `exfiltration_url`,
`external_image`), and the injection policy decides: `annotate` (the default)
returns everything with its risk, `exclude_high` drops high-risk items and
`block` refuses a retrieval that would return one. Secrets found at ingestion
are redacted from section text, and so from every chunk, with the
`agenomic-secrets/1` patterns of RFC 0012, before any digest is computed.

## Access control

Documents are classified `public < internal < confidential < restricted`
(`internal` by default), and a collection may raise the effective
classification of its documents or restrict them to some roles. Each role has
a classification ceiling. An agent-scoped retrieval reads with the
intersection of the caller's access and the agent's binding: the lower
ceiling and the collections both allow. Naming an agent can only narrow
access. A denial of a named resource is explicit (`knowledge_access_denied`
with a reason), never a silent empty answer.

## Digests

```text
digest = "sha256:" + lowercase hex of sha256(canonical JSON of the document)
```

The canonical JSON is the one of RFC 0012. Three digests hash raw bytes
instead: the original document bytes (`blob_digest`), a chunk text and a
query (prefixed by `agenomic.knowledge_query/v1` and U+0000). Section and
chunk ids are the first 16 hex digits of a sha256 over their inputs joined by
U+0000. `index_config_digest` hashes the
index configuration without its `chunking` and `embedding` members, which it
binds through their own digests.

Verify before use: recompute the digest of every downloaded manifest and
refuse it on mismatch.

## Consuming the conformance vectors

An implementation of RFC 0014 proves parity by running the vectors:

1. Copy `conformance/vectors/knowledge/` into the implementation and record a
   `SPEC_VECTORS.lock` holding the spec commit and the sha256 of its
   `MANIFEST.json`. This lock is separate from the lock of the prompt vectors.
2. In the test harness, check the lock and every file hash against the
   manifest, then run every vector whose `consumers` names the implementation.
3. Compare only the members present in `expected`, as the
   [vector README](../conformance/vectors/knowledge/README.md) describes.

In this repository, `npm run validate` checks the schemas, the fixtures and
both vector sets; `node scripts/knowledge-vectors.js --compute <file>` prints
the recomputed expectation of a knowledge vector, or the canonical JSON and
digest of any JSON document.
