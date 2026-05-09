# RFC 0003: ATEP — Agentic Trajectory Event Protocol

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | Agenomic maintainers \<spec@agenomic.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0002, RFC 0008                                |

## Summary

ATEP — the **Agentic Trajectory Event Protocol** — is an event-sourced,
hash-linked, signed log of an agent's life: identity assignments,
capability changes, knowledge updates, policy changes, runtime pinnings,
production interactions, and governance decisions. Where Git versions
files, ATEP versions **causal trajectories of behavior**.

ATEP defines:

- a canonical CBOR encoding for individual events (used for hashing
  and signing),
- a binary segment file format `.atep` for storage,
- a Hybrid Logical Clock (HLC) for ordering across distributed
  producers,
- a DAG of causal hashes that makes the log transitively
  tamper-evident.

## Motivation

A single bundle hash (RFC 0002) tells you what an agent **was** at
release. It does not tell you how it got there. For governance,
forensics, and AI-Act-style record-keeping, we need a hash-linked
journal of every change that contributed to the agent's current state:
which prompt was added when, who approved a policy change, which
knowledge index was rotated, which incident triggered a rollback.

Plain audit logs do not provide tamper-evidence; signed logs that sign
each entry independently do not provide ordering or causal proof.
Git-style chains do, but they are file-oriented, not event-oriented,
and their commit objects are not designed for high-frequency runtime
events.

ATEP borrows from Git (chained hashes), CRDT research (HLC), and
event-sourced systems (streams, replay), and adapts them to the agent
domain.

## Detailed design

### Event structure (logical)

Every ATEP event has four parts:

```text
┌────────────────────────────────────────────┐
│ header                                     │
│   schema_version, event_id, agent_id,      │
│   stream, stream_seq, clock(HLC),          │
│   parents[], event_type,                   │
│   payload_schema_uri                       │
├────────────────────────────────────────────┤
│ payload                                    │
│   event-type-specific content              │
├────────────────────────────────────────────┤
│ causal_hash                                │
│   BLAKE3 over canonical body + parents     │
├────────────────────────────────────────────┤
│ attestation                                │
│   signer_key_id, algorithm, signature      │
└────────────────────────────────────────────┘
```

A JSON projection is normatively defined in
[`schemas/v0.1/atep-event.schema.json`](../schemas/v0.1/atep-event.schema.json).
The canonical wire format is CBOR; see "Canonical body" below.

### Streams

Every event belongs to exactly one stream:

| Stream         | Purpose                                                     |
|----------------|-------------------------------------------------------------|
| `identity`     | Agent identity assignments, ownership, deprecation.          |
| `capability`   | Skills, tools, prompts added/removed/modified.               |
| `knowledge`    | Knowledge index snapshots and rotations.                     |
| `policy`       | Policy and approval rule changes.                            |
| `runtime`      | Model pin, inference settings, provider fingerprint changes. |
| `interaction`  | Production runs (typically referenced by trace_id).          |
| `governance`   | Releases, rollbacks, audits, incident decisions.             |

The 7-stream structure scales access control and indexing. Most
governance actors only need to read `governance` and `policy`; runtime
operators only need `runtime` and `interaction`.

### Hybrid Logical Clock

Each event carries an HLC:

```text
clock = (physical_ms, logical, node_id)
```

- `physical_ms`: UNIX millisecond timestamp at the producing node.
- `logical`: monotonic counter scoped to a single node.
- `node_id`: opaque producer identifier (e.g. instance UUID).

**HLC tick algorithm** at a producer (pseudo-code):

```text
on event_creation():
    now = wall_clock_ms()
    if now > local_hlc.physical_ms:
        local_hlc.physical_ms = now
        local_hlc.logical = 0
    else:
        local_hlc.logical += 1
    return local_hlc

on receive(remote_hlc):
    now = wall_clock_ms()
    new_phys = max(local_hlc.physical_ms, remote_hlc.physical_ms, now)
    if new_phys == local_hlc.physical_ms == remote_hlc.physical_ms:
        new_logical = max(local_hlc.logical, remote_hlc.logical) + 1
    elif new_phys == local_hlc.physical_ms:
        new_logical = local_hlc.logical + 1
    elif new_phys == remote_hlc.physical_ms:
        new_logical = remote_hlc.logical + 1
    else:
        new_logical = 0
    local_hlc = (new_phys, new_logical, local_hlc.node_id)
```

Encoding (binary segment, see below):

```text
HLC_v1 = u64 little-endian physical_ms
       || u32 little-endian logical
       || u32 little-endian node_id_truncated_or_hash
```

Total: 16 bytes.

### Causal DAG (parents)

Each event references zero or more `parents`. Parents are the **causal
hashes** of the immediate predecessors that caused, enabled, or were
overwritten by this event. Multi-parent events are common — a release
event may reference its bundle event, the most recent replay-passed
event, and the last governance approval.

Genesis events (the first event for a new agent on a given stream)
have an empty `parents` array.

### Canonical body and `causal_hash`

The canonical body is the **CBOR deterministic encoding** (RFC 8949
§4.2) of the event excluding `causal_hash` and `attestation`:

```text
canonical_body = CBOR-deterministic-encode( { header, payload } )
```

CBOR deterministic encoding (RFC 8949 §4.2) requires:

- map keys in canonical (length, then byte-wise) order,
- shortest integer encoding,
- definite-length items,
- no semantic tags unless required.

The causal hash is then:

```text
sorted_parents = lex-sort( parents )    // sort the hex strings as bytes
parent_blob    = concat( sorted_parents )

causal_hash = BLAKE3(
    "ATEP-v1\0"
    || u32_le(len(canonical_body))
    || canonical_body
    || u32_le(len(sorted_parents))      // number of parents
    || parent_blob                       // 32-byte hashes concatenated
)
```

`u32_le` is the unsigned 32-bit little-endian length prefix. Including
explicit length prefixes prevents canonicalization ambiguity between
`canonical_body` and the parent list.

### Attestation: sign the hash, not the body

Signatures are computed over **`causal_hash`**, not over the body:

```text
signature = sign(private_key, causal_hash)
```

This is the most important design choice in ATEP. Signing the hash
(not the body) gives **transitive tamper-evidence**: if any historical
event's body is altered, every descendant's `causal_hash` becomes
invalid because the parent reference no longer matches. A verifier
that checks one event's signature transitively guarantees the
integrity of every ancestor.

Supported algorithms in v0.1: `ed25519` (default), `ecdsa-p256`,
`rsa-pss-sha256`. Verifiers MUST refuse unknown algorithms.

### Segment file (`.atep`)

For storage, events are concatenated into a binary segment file with
the following layout:

```text
┌──────────────────────────── 76 bytes ───────────────────────────────┐
│ MAGIC          4 bytes  ASCII "ATEP"                                │
│ VERSION        2 bytes  u16 LE, currently 1                         │
│ FLAGS          2 bytes  u16 LE bitfield (reserved; MUST be 0 in v1) │
│ EVENT_COUNT    4 bytes  u32 LE                                      │
│ FIRST_HLC      16 bytes (physical_ms u64 LE | logical u32 LE | node)│
│ LAST_HLC       16 bytes                                             │
│ MERKLE_ROOT    32 bytes BLAKE3 over event causal_hashes in order    │
└──────────────────────────────────────────────────────────────────────┘

[ FRAME ]+   one per event:
  u32_le frame_len             // bytes of canonical_body
  u32_le parent_count
  parent_count × 32 bytes      // raw BLAKE3 parents
  canonical_body bytes
  32 bytes causal_hash         // recomputed; consumers MUST verify
  attestation:
    u8 algo_id   (1=ed25519, 2=ecdsa-p256, 3=rsa-pss-sha256)
    u16_le signature_len
    signature_len bytes signature
    u16_le key_id_len
    key_id_len bytes key_id (UTF-8)

[ INDEX ]    optional, MAY be present if FLAGS bit 0 is set in v2+
             (ignored in v1; readers MUST scan frames sequentially)

[ TAIL ]     12 bytes:
  u32_le crc32 of all frames + index
  4 bytes ASCII "PETA"   (reverse of MAGIC; tail magic)
  u32_le total_file_size
```

The 76-byte header lets a reader index a segment without parsing
events. The CRC32 detects corruption; the duplicated tail magic detects
truncation.

### Replay semantics

State is recovered by folding events in HLC order:

```text
state(t) = fold( genesis_state, [ e for e in events if hlc(e) <= t ] )
```

Concurrent events (same physical_ms, different node_id) are ordered
deterministically by `(physical_ms, logical, node_id)` lexicographic
tuple. The `node_id` tie-breaker is required because two producers may
legitimately stamp the same `(physical_ms, logical)` after independent
clock skews; using `node_id` ensures every reader picks the same order.

### Compaction (deferred)

ATEP segments accumulate. v0.1 does not define compaction; producers
are expected to rotate segments by time or size. RFC v0.2 will define
compaction rules that preserve hash chains across the boundary.

### Worked example: an agent's first day

Genesis (`agent_id = agent://acme/claims-bot`):

```text
e0 (identity.created):       parents=[]                     stream=identity
e1 (governance.owners_set):  parents=[h(e0)]                stream=governance
e2 (capability.skill_added): parents=[h(e0)]                stream=capability
e3 (knowledge.snapshot):     parents=[h(e0)]                stream=knowledge
e4 (runtime.model_pinned):   parents=[h(e2)]                stream=runtime
e5 (policy.set):             parents=[h(e1)]                stream=policy
e6 (governance.replay_pass): parents=[h(e2),h(e3),h(e4),h(e5)]
e7 (governance.released):    parents=[h(e6)]                stream=governance
```

`e6` legitimately has four parents — the release-readiness assertion
**causally depends** on capability, knowledge, runtime, and policy all
being present. The DAG, not a tree, captures this.

Hex dumps of canonical bodies, causal hashes, and signatures for a
worked example are provided in `conformance/vectors/atep-genesis.json`.

## Alternatives considered

### Sign the body instead of the hash

Rejected. Signing the body still yields a per-event proof, but does not
transitively cover ancestors; an attacker who alters an old event's
body can refresh all descendant signatures (if they hold the key). By
signing the hash, an attacker who alters the body must also re-derive
every descendant hash and reissue every descendant signature — which
is detectable because consumers cache historical signatures.

### Use Git as the event store

Considered. Git commits are hash-chained and signable. They are
unwieldy for high-frequency runtime events (one commit per agent
interaction is impractical) and Git's tree-oriented model is not the
natural shape for typed event streams. Reusing the BLAKE3 primitive
gives us hash performance without the tree-object overhead.

### Lamport clocks instead of HLC

Lamport clocks lose physical-time anchoring. Operators reading the log
expect "what happened around 14:00 UTC?" to be answerable. HLC keeps
physical time near-correct while preserving causal ordering.

### Vector clocks

Considered. Vector clocks scale poorly with the number of producers
and add per-event size that compounds at high write rates. The
`(physical_ms, logical, node_id)` triple plus the `parents` DAG gives
the same causal information at a fraction of the cost.

## Open questions

- Whether to allow hash truncation in `parents` for very deep DAGs to
  control segment size. Currently full 32-byte BLAKE3 hashes only.
- Compaction semantics (deferred to v0.2).

## Security considerations

- **Signature scope:** signing `causal_hash` and not the body is a
  deliberate design choice; see "Sign the hash, not the body" above.
- **Key rotation:** old `signer_key_id` values remain valid for
  verifying historical events. Verifiers MUST consult a key directory
  that records the validity window of each key.
- **Forks:** the DAG admits forks if two producers extend the same
  parent set independently. This is expected (federation). Conflict
  resolution is governance-defined and out of scope for the protocol.
- **Replay attacks** at the wire level are mitigated by `event_id`
  uniqueness and HLC monotonicity within a stream.
- **Privacy:** payloads MAY contain PII (e.g. `interaction` events).
  Producers SHOULD include `payload_ref` rather than `payload_inline`
  for sensitive content, consistent with the trace-event schema.

## Compatibility

ATEP segment files carry an explicit `VERSION` byte pair. v0.1 of the
spec defines version 1. A future v2 segment format MUST remain readable
to v1 consumers as a "segment with unknown reserved bits" if backward
compatibility is required, or use a different MAGIC otherwise.

## References

- [RFC 8949 — CBOR](https://www.rfc-editor.org/rfc/rfc8949), §4.2
  deterministic encoding.
- [Hybrid Logical Clocks](https://cse.buffalo.edu/tech-reports/2014-04.pdf)
  — Kulkarni, Demirbas, Madappa, Avva, Leone.
- [BLAKE3](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf).
- RFC 0002 — Canonical Merkle Hashing.
- RFC 0008 — Release Attestations.
