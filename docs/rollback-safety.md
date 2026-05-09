# Rollback safety

Tutorial companion to RFC 0007.

## The premise

Rolling back is a **normal** operation, not an emergency-only escape.
If you treat it as exotic, you'll fear it, you won't practice it,
and it will fail when you need it most.

Agenomic makes rollback compatibility-aware so the controller — not
the operator under stress — decides whether a given transition is
safe.

## Two declarations per release

In `agent.lock.yaml`:

```yaml
compatible_memory_schemas:
  - 1.4.0
  - 1.5.0
incompatible_with:
  - rel://acme/claims-bot@v2.9.0
```

`compatible_memory_schemas` lists the runtime memory schemas this
release can read and write without migration. The release's own
schema MUST be in the list.

`incompatible_with` lists earlier releases this release explicitly
forbids transitioning to. Use it to block known-bad downgrade paths.

## The compatibility graph

Releases form a directed graph:

- node per release;
- edge `Ri → Rj` iff `Ri.compatible_memory_schemas` contains
  `Rj.memory.schema_version` **and** `Rj` is not in
  `Ri.incompatible_with`.

A controller may transition a user session from `Ri` to `Rj` iff
there is a path in this graph from `Ri` to `Rj`.

## Worked example

| Release  | memory schema | compatible        | incompatible_with |
|----------|---------------|-------------------|-------------------|
| v2.9.0   | 1.4.0         | [1.4.0]           | []                |
| v3.0.0   | 1.5.0         | [1.4.0, 1.5.0]    | []                |
| v3.1.0   | 1.5.0         | [1.5.0]           | [v2.9.0]          |

- `v3.0.0 → v2.9.0`: allowed.
- `v3.1.0 → v2.9.0`: forbidden directly (`v2.9.0` ∈
  `incompatible_with(v3.1.0)`).
- `v3.1.0 → v3.0.0 → v2.9.0`: each edge holds; the controller can
  transit through `v3.0.0`.

Operators should always check the **path**, not just the direct edge.

## Migration shims

When direct rollback is unsafe but reversibility is desired, ship a
**shim release** whose only role is to convert memory backwards:

```text
v3.2.0 (1.5.0)
    ↓
v3.1.0-shim   (compatible: 1.4.0, 1.5.0; converts state on transit)
    ↓
v2.9.0 (1.4.0)
```

A shim is a real release with its own bundle and attestation. It is
the safest way to introduce a one-way memory change while preserving
the option to revert.

## When to set `incompatible_with`

When you have **discovered** a rollback hazard in a previously
released version — not as a default. Setting it pre-emptively
disconnects your graph and makes your release pipeline stricter than
necessary.

## When NOT to roll back at all

Sometimes the right answer is forward, not backward:

- You shipped a model fingerprint change you didn't expect, and
  rolling back changes the fingerprint again. Forward fix.
- A policy change is the source of truth; rolling it back loses
  legal effect that newer attestations relied on. Issue a corrective
  release.

The spec doesn't prevent any of this; it gives you the data to make
the decision.

## Recording a rollback

Treat the rollback as a first-class event:

- Issue an attestation with `attestation_type: rollback`.
- Reference the source and target release ids in
  `approvals[*].comment` or producer-specific extension fields.
- Emit a `governance.rollback` ATEP event.

A future spec revision (RFC v0.2) may standardize the rollback
attestation shape further.
