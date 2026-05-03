# ATEP, in plain language

This page is the friendly companion to RFC 0003. The RFC is the
normative document; come back here when you want intuition.

## What problem ATEP solves

A signed bundle hash tells you what an agent **was** at release. It
does not tell you how it got there. For:

- regulatory record-keeping ("show me every change to this agent's
  policies in the last 18 months"),
- forensics ("which knowledge update happened just before the
  spike in escalations?"),
- governance proofs ("the model fingerprint changed silently three
  times last quarter; here's the audit trail"),

you need a **hash-linked, signed journal** of every change.

ATEP — the Agentic Trajectory Event Protocol — is that journal.

## Structure of one event

Every event has four parts:

```text
header
  schema_version, event_id, agent_id, stream, stream_seq, clock,
  parents[], event_type, payload_schema_uri
payload
  event-type-specific content
causal_hash
  BLAKE3 over canonical body + sorted parents
attestation
  signer_key_id, algo, signature
```

The signature signs `causal_hash`, **not** the body. This is the
single most important design choice in ATEP: signing the hash makes
the chain transitively tamper-evident.

## Streams

Every event belongs to one of seven streams:

| Stream         | Purpose                                                |
|----------------|--------------------------------------------------------|
| `identity`     | identity assignments, ownership, deprecation           |
| `capability`   | skills/tools/prompts added, removed, modified          |
| `knowledge`    | knowledge index snapshots and rotations                |
| `policy`       | policy and approval rule changes                       |
| `runtime`      | model pin, inference settings, fingerprint changes     |
| `interaction`  | production runs (typically referencing trace_id)       |
| `governance`   | releases, rollbacks, audits, incident decisions        |

Most readers only need a few streams. Auditors typically want
`governance` + `policy`; SREs want `runtime` + `interaction`.

## The DAG

Events reference parents — the immediate causes of this event. The
parent set is a **DAG**, not a tree, because some events legitimately
have multiple causes:

```text
e6 (governance.replay_pass) parents = {
  capability.skill_added,
  knowledge.snapshot,
  runtime.model_pinned,
  policy.set
}
```

A release-readiness assertion causally depends on capability,
knowledge, runtime, and policy all being in place. The DAG captures
that explicitly.

## Hybrid Logical Clocks

Each event carries `(physical_ms, logical, node_id)` — a Hybrid
Logical Clock. It anchors physical time so operators can ask "what
happened around 14:00?", but it preserves causal order even under
clock skew.

The encoding is 16 bytes per HLC in the binary segment file:

```text
u64_le physical_ms || u32_le logical || u32_le node_id
```

## A worked first-day example

```text
e0 identity.created           parents=[]
e1 governance.owners_set      parents=[h(e0)]
e2 capability.skill_added     parents=[h(e0)]
e3 knowledge.snapshot         parents=[h(e0)]
e4 runtime.model_pinned       parents=[h(e2)]
e5 policy.set                 parents=[h(e1)]
e6 governance.replay_pass     parents=[h(e2),h(e3),h(e4),h(e5)]
e7 governance.released        parents=[h(e6)]
```

`e7`'s `causal_hash` transitively depends on every prior event. If
anyone tampers with `e3`, `e6`'s parent reference is wrong and `e7`'s
parent reference is wrong, and verifying `e7`'s signature exposes the
tamper without re-checking older signatures.

## Storage

A segment file `.atep` packs many events with a 76-byte header
(magic, version, count, first/last HLC, Merkle root over event
hashes), per-event frames, an optional index, a CRC32, and a tail
magic. Producers rotate segments by time or size; v0.1 does not
define compaction (deferred to v0.2).

## When to anchor an attestation to ATEP

Always, in regulated domains. The `release-attestation.schema.json`
field `atep_root_hash` is optional, but pinning it gives verifiers
the strongest provenance available in the spec: a single signature
seals the bundle **and** the agent's complete causal history at
release time.
