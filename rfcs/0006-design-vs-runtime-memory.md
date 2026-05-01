# RFC 0006: Design vs Runtime Memory

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | AgentLock maintainers \<spec@agentlock.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0007                                          |

## Summary

AgentLock distinguishes **design memory** (versionable agent
knowledge: examples, few-shot cases, glossaries) from **runtime
memory** (per-user history, conversational state, PII). The bundle
versions design memory as a first-class artifact. It versions only
the **schema** of runtime memory, never its contents.

## Motivation

A common antipattern is to ship "the agent and its memory" as one
unit. This conflates two very different things:

- **Design memory** is information the producer authored: canonical
  examples, system prompts, in-context-learning corpora, decision
  rubrics. It belongs to the agent's design and SHOULD be versioned
  with it.
- **Runtime memory** is data the agent accumulates while serving real
  users: conversation history, derived user preferences, session
  state. It contains PII, is subject to GDPR access and deletion
  rights, and belongs to the user, not to the agent's release
  artifact.

Bundling user memory creates four serious problems:

1. **Data protection failure.** Each release artifact becomes a copy
   of personal data, subject to retention and deletion controls that
   bundles are not designed to satisfy.
2. **Reproducibility failure.** The "same" release behaves
   differently when reinstalled on a different population of users.
3. **Rollback hazard.** Reverting the bundle reverts user memory to
   the state at release time, potentially erasing data the user has
   the right to keep.
4. **Hash instability.** Bundle hashes change every time a user is
   added.

## Detailed design

### Design memory

`genome.yaml` declares a design memory reference:

```yaml
memory:
  design_memory: ./memory/design_examples.yaml
  runtime_memory_schema_version: 1.4.0
```

Design memory contents are **inside the bundle**. They are hashed by
the bundle's Merkle root (RFC 0002). They are part of every replay,
attestation, and audit.

### Runtime memory

The bundle does **not** include runtime memory contents. It includes:

1. The **schema** of runtime memory in `memory/memory.schema.yaml`
   (recommended layout, not normatively required by v0.1 schema —
   producers MAY use any schema language).
2. The **schema version** referenced by
   `genome.memory.runtime_memory_schema_version` and
   `agent.lock.yaml#memory.schema_version`.
3. The **access policy** declared in `agent.lock.yaml#memory`:
    - `stores_user_specific_data`
    - `retention_days`
    - `gdpr_exportable`
    - `deletion_supported`

Implementations MUST enforce that runtime memory is stored in a
distinct system (database, key-value store, vector index) that
implements export and deletion APIs in line with the declared
policy.

### Boundary rules

- An agent run's input MAY load runtime memory by user identifier.
- The runtime MUST validate the loaded memory blob against the
  pinned schema version.
- A schema version mismatch is a hard failure: the runtime MUST
  refuse to invoke the agent and emit a `policy.violation` event.
- Runtime memory MUST NOT appear in trace events as
  `payload_inline`. It MAY appear as `payload_ref` to an
  out-of-band store.

### Migration

When a release changes the runtime memory schema version, it MUST
declare in `agent.lock.yaml`:

```yaml
memory:
  schema_version: 1.5.0
compatible_memory_schemas:
  - 1.4.0
  - 1.5.0
```

`compatible_memory_schemas` is the set of versions a runtime
controller MAY route through this release without reshaping memory.
Versions outside the list require an explicit migration step before
the release is admitted.

See RFC 0007 for how this interacts with rollback.

### Worked example

A claims agent at release `v3.2.0` uses memory schema `1.4.0` and
holds 10 redacted few-shot examples in `memory/design_examples.yaml`.
The bundle Merkle root depends on the design examples but is
independent of any user's claim history. Rolling out the agent to a
new tenant produces the same `bundle_logical_hash`; only the runtime
store is fresh.

A later release `v3.3.0` adds a new claim category and ships a memory
schema `1.5.0`. Its lockfile declares
`compatible_memory_schemas: [1.4.0, 1.5.0]` so the controller can
route both schema versions through `v3.3.0` without migration.

## Alternatives considered

### Bundle runtime memory as encrypted blobs

Rejected. The encryption key would have to live somewhere; if it lives
with the bundle the encryption is theatre, and if it doesn't, the
bundle is no longer self-contained. Either way, the data-protection
problem remains: a release artifact contains user data.

### Use a single "memory" object that flips a `bundled` flag

Rejected. A flag is too easy to flip wrong and creates two
incompatible meanings for the same field name. The hard split
between design and runtime is the safer interface.

### Defer runtime memory entirely to implementations

Rejected. Without standardizing the schema-version boundary and the
access-policy fields, rollback (RFC 0007) cannot be made safe across
implementations.

## Open questions

- Whether to standardize a runtime-memory schema dialect (JSON Schema,
  Avro, Protobuf) at v0.2. v0.1 is dialect-agnostic.
- Whether `retention_days` should be expressed as ISO-8601 durations
  for sub-day granularity. Current shape is integer days.

## Security considerations

- The split is the security-relevant property. Implementations that
  ignore it and bundle user memory are non-conforming.
- `deletion_supported` is a declarative claim; conformance test
  suites for **runtimes** (out of scope for this repo) should
  exercise the deletion path.

## Compatibility

This RFC introduces no breaking changes; the schemas already carry
the necessary fields. Follow-ups: RFC 0007 (rollback) builds on
`compatible_memory_schemas`.

## References

- [GDPR Article 17 — Right to erasure](https://gdpr-info.eu/art-17-gdpr/).
- [GDPR Article 20 — Right to data portability](https://gdpr-info.eu/art-20-gdpr/).
- RFC 0001 — Agent Bundle Format.
- RFC 0007 — Rollback Safety.
