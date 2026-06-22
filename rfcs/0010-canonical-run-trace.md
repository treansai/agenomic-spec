# RFC 0010: Canonical Run Trace

| Field        | Value                                      |
|--------------|--------------------------------------------|
| Status       | Draft                                      |
| Created      | 2026-06-22                                 |
| Author(s)    | Agenomic maintainers <spec@agenomic.dev>   |
| Spec version | v0.3                                       |
| Related      | RFC 0002, RFC 0003, RFC 0005, RFC 0008     |

## Summary

[FONDATION] RFC 0010 defines the v0.3 canonical run trace as a four-level record:
run metadata, an append-only event stream, a causal execution graph, and an
evidence package. The schema is published at
[`schemas/v0.3/trace-event.schema.json`](../schemas/v0.3/trace-event.schema.json).

## Model

[FONDATION] Run metadata identifies `run_id`, optional parent/replay lineage,
agent genome, runtime, LLM settings, component versions, input, and output.
Component versions are content-addressed.

[FONDATION] The event stream is append-only. Every event carries `event_id`,
registered `type`, `timestamp`, `actor`, `payload_hash`, `prev_event_hash`, and
`event_hash`, with optional provenance, side-input snapshots, risk score, policy
checks, and signature.

[FONDATION] The execution graph links events and artifacts through typed edges:
`caused_by`, `used`, `produced`, `authorized_by`, `delegated_to`, `observed`,
`violated`, `checked_by`, and `supported_by`.

[FONDATION] The evidence package records risk scores, compliance checks,
alignment checks, environment snapshot, and integrity metadata including the run
Merkle root and signature.

## Hash chain and relation to ATEP

[SOURCÉ] ATEP RFC 0003 already defines BLAKE3 causal hashes, HLC ordering, and
parents for lifecycle events. RFC 0010 does not replace ATEP. It applies the
same tamper-evidence principle inside one production run.

[FONDATION] For trace v0.3 the normative rule is:

```text
event_hash = BLAKE3(JCS(event_without_event_hash) || prev_event_hash)
run_merkle_root = blake3-merkle-v1(event_hash_0..event_hash_n)
```

[SOURCÉ] JSON canonicalization is JCS (RFC 8785). The hash algorithm is BLAKE3,
matching ATEP's choice rather than introducing a divergent digest. The run root
uses the RFC 0002 `blake3-merkle-v1` tree construction with domain-separated
leaf and node hashing and odd-node duplication.

## Event registry

[FONDATION] `schemas/v0.3/event-type-registry.json` enumerates the append-only
vocabulary. The trace schema embeds that enumeration for `events[].type` so
unknown event names fail conformance validation.

## Replay taxonomy

[FONDATION] `schemas/v0.3/replay-mode.json` defines five replay modes:

- `exact`: `event_hash_match` is boolean; it is not a continuous similarity
  score.
- `functional`: semantic similarity is greater than 0.95, side-effect diff is
  zero, and contracts pass.
- `statistical`: Jensen-Shannon divergence `JS(P_o||P_r)` is below 0.05.
- `explanatory`: causal coverage is above 0.9 and root-cause confidence above
  0.8.
- `evidentiary`: audit evidence completeness is above 0.95 and integrity is
  valid, without re-execution.

[FONDATION] A synthetic behavioral reconstruction is forbidden as probative
`evidentiary` evidence. If such reconstruction is shown beside an evidentiary
review, it MUST be labelled `simulation, non probant`.

## Detailed design

[FONDATION] The detailed design is the combination of the v0.3 schema, event
type registry, replay taxonomy, and validation runner updates. Schema validation
checks the envelope shape and vocabulary; repository conformance validation also
checks that graph edges reference declared nodes and that fixtures preserve a
consistent intra-run chain.

## Alternatives considered

[EXTRAPOLATION] Duplicating ATEP lifecycle records inside each run was rejected
because ATEP already owns cross-run and lifecycle causality. RFC 0010 instead
keeps a run-local chain and links to ATEP-level evidence when needed.

[EXTRAPOLATION] A continuous score for exact replay was rejected. Exact replay
requires a boolean hash match; approximate behavior belongs to functional or
statistical replay modes.

## Open questions

[EXTRAPOLATION] Future revisions may add cross-language fixture packs for the
BLAKE3/JCS event hash and `blake3-merkle-v1` event tree so non-JavaScript
producers can self-test against the same vectors.

## Security considerations

[FONDATION] Trace integrity depends on preserving append-only event order,
canonicalizing each event before hashing, and verifying both event hashes and the
run Merkle root. Payloads should be referenced by hash when redaction is needed.

## Compatibility

[FONDATION] v0.3 is additive. v0.1 trace fixtures continue to validate under the
v0.1 schema unless a document explicitly declares `spec_version: agenomic/v0.3`.

## References

- RFC 0002: Canonical Merkle Hashing.
- RFC 0003: ATEP — Agentic Trajectory Event Protocol.
- RFC 0005: Statistical vs Deterministic Replay.
- RFC 8785: JSON Canonicalization Scheme (JCS).
