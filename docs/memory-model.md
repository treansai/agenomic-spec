# The memory model: design vs runtime

Tutorial companion to RFC 0006.

## The split

```text
┌────────────────────────────────────────┐
│  Inside the bundle                     │
│  ───────────────────                   │
│  • Design memory (examples, glossaries,│
│    rubrics) — versioned with the agent │
│  • Runtime memory SCHEMA               │
│    (memory.schema.yaml)                │
└────────────────────────────────────────┘
                  │
                  │   (referenced by version)
                  ▼
┌────────────────────────────────────────┐
│  Outside the bundle                    │
│  ────────────────────                  │
│  Runtime memory CONTENTS               │
│  (per-user history, PII, state)        │
│                                        │
│  Stored in a system that supports:     │
│   - export_for_user                    │
│   - delete_for_user                    │
│   - schema_version                     │
└────────────────────────────────────────┘
```

## Why the split matters

If you bundle runtime memory, you create four problems:

1. **Data protection failure.** Your release artifacts become copies
   of personal data, with retention controls bundles aren't designed
   to satisfy.
2. **Reproducibility failure.** The "same" release behaves
   differently per user population.
3. **Rollback hazard.** Reverting the bundle reverts memory, possibly
   erasing data the user has the right to keep.
4. **Hash instability.** Bundle hashes change every time a user is
   added.

Splitting eliminates all four.

## Declarative claims in `agent.lock.yaml`

```yaml
memory:
  schema_version: 1.4.0
  stores_user_specific_data: true
  retention_days: 365
  gdpr_exportable: true
  deletion_supported: true
```

These are claims about your runtime store. They appear in the lock
so:

- governance can audit them at release time,
- replay attestations capture the policy at the time of the release,
- compatibility checks (RFC 0007) can reason about safe rollback.

## What goes into `memory/memory.schema.yaml`

The spec doesn't standardize a dialect at v0.1. A reasonable shape
(used by the example bundles) lists each field:

```yaml
memory_schema_version: 1.4.0
description: Per-customer state for the claims-bot session.
fields:
  - name: customer_token
    type: opaque-string
    pii: false
  - name: recent_interactions
    type: array<interaction_summary>
    pii: indirect
    retention_days: 365
apis_required:
  - export_for_user(customer_token) -> archive
  - delete_for_user(customer_token) -> deletion_receipt
  - schema_version() -> string
```

You may use any schema language (JSON Schema, Avro, Protobuf) so long
as the version string in `memory_schema_version` matches the
lockfile.

## Boundary rules at runtime

- A run's input MAY load runtime memory by user identifier.
- The runtime MUST validate the loaded blob against the pinned
  schema version.
- A schema mismatch is a hard failure: the runtime refuses to invoke
  the agent and emits a `policy.violation` event in ATEP.
- Runtime memory MUST NOT appear inline in trace events. Use
  `payload_ref` to point to a redacted blob in your retention-
  controlled store.

## Migration

When you change the runtime memory schema, update the lockfile:

```yaml
memory:
  schema_version: 1.5.0
compatible_memory_schemas:
  - 1.4.0
  - 1.5.0
```

The compatibility list is what makes rollback (RFC 0007) safe.

## Anti-patterns

- **Treating memory as part of "the model".** It isn't. The model is
  the inference engine. Memory is your application's state.
- **Storing memory in object stores keyed by trace_id.** That couples
  memory to runs, not to users. Per-user identity is the right key.
- **Skipping `deletion_supported: true` "for now".** Add it from day
  one, or you'll write a migration later under deadline.
