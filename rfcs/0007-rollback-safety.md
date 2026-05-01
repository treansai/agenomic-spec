# RFC 0007: Rollback Safety

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | AgentLock maintainers \<spec@agentlock.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0006                                          |

## Summary

Rolling back an agent to an earlier release is a normal operational
action, not an emergency-only escape. AgentLock makes rollback
**compatibility-aware**: every release declares the memory schemas it
supports and the prior releases it explicitly forbids rolling back to.
A controller composes these declarations into a directed
**compatibility graph**; safe rollback is a connectivity question.

## Motivation

Three classes of bug are common in agent rollouts:

1. The new release is bad and must be reverted.
2. The new release is good for one tenant and bad for another (and
   only that tenant should be reverted).
3. A release is fine functionally but writes new shapes into runtime
   memory that earlier releases cannot read.

Without explicit compatibility metadata, case (3) silently corrupts
user data when a controller "just" reverts the deployed version.
Operators learn about it from support tickets.

## Detailed design

### Per-release declarations

Two optional fields in `agent.lock.yaml` carry the rollback metadata:

```yaml
compatible_memory_schemas:
  - 1.4.0
  - 1.5.0
incompatible_with:
  - rel://acme/claims-bot@v2.9.0
```

- `compatible_memory_schemas`: the set of memory schema versions that
  this release can read and write without migration. The release's
  own `memory.schema_version` MUST be a member.
- `incompatible_with`: an explicit list of release identifiers that
  this release MUST NOT route through. Use it to block rollbacks
  known to corrupt newer state — e.g. `v3.x` introduces a non-
  reversible field, so it explicitly forbids rolling back to `v2.x`
  while serving any user touched by `v3.x`.

### Compatibility graph

Given a population of releases `{R1, …, Rn}`, the compatibility graph
has:

- a node for each release;
- a directed edge from `Ri` to `Rj` if and only if:
  - `memory.schema_version(Rj)` ∈ `compatible_memory_schemas(Ri)`,
    **and**
  - `Rj ∉ incompatible_with(Ri)`.

A controller may switch the agent from `Ri` to `Rj` for a given user
session iff there is a path `Ri → … → Rj` in the graph.

### Migration shims

When direct rollback is unsafe, producers MAY ship a **migration shim
release**: a release whose only role is to convert memory from
`schema_version_new` back to `schema_version_old`, declaring both as
compatible. Shims are first-class releases with their own bundle and
attestation.

Example:

```text
v3.2.0 (memory schema 1.5.0)
  └─→  v3.1.0-shim   (compatible: 1.4.0, 1.5.0; declares migration rules)
        └─→  v2.9.0  (memory schema 1.4.0)
```

The controller composes the path: serve `v3.2.0` → if rollback to
`v2.9.0` requested, route through `v3.1.0-shim` once to convert
state, then serve `v2.9.0`.

### Connectedness as a safety property

The compatibility graph SHOULD remain **connected** for releases the
operator may want to revert to. A release that introduces a breaking
memory change without an accompanying shim deliberately disconnects
its predecessors and represents a one-way door.

A release pipeline SHOULD reject promotions that would disconnect the
graph unless an operator explicitly approves the one-way decision.

### Rollback attestation

A rollback action SHOULD be recorded as a `rollback` attestation
(`release-attestation.schema.json#attestation_type = rollback`) and
as a `governance.rollback` event in ATEP. The attestation references
both the source and the target release ids in
`approvals[*].comment` or in producer-specific extension fields.

### Worked example

State at start:

| Release  | memory schema | compatible        | incompatible_with |
|----------|---------------|-------------------|-------------------|
| v2.9.0   | 1.4.0         | [1.4.0]           | []                |
| v3.0.0   | 1.5.0         | [1.4.0, 1.5.0]    | []                |
| v3.1.0   | 1.5.0         | [1.5.0]           | [v2.9.0]          |

- v3.0.0 → v2.9.0 is allowed (v2.9.0's schema 1.4.0 ∈
  `compatible_memory_schemas(v3.0.0)`; v2.9.0 not in
  `incompatible_with(v3.0.0)`).
- v3.1.0 → v2.9.0 is disallowed (v2.9.0 ∈
  `incompatible_with(v3.1.0)`).
- v3.1.0 → v3.0.0 → v2.9.0 is disallowed (v3.0.0 → v2.9.0 is fine,
  but the controller would still need to first transit v3.1.0 →
  v3.0.0; that edge requires schema 1.5.0 ∈ compatible(v3.1.0),
  which it is, so the path **is** allowed). The point of the
  example is that operators MUST evaluate the full path, not just
  the direct edge.

### Skill rollback (illustrative)

A typical rollback rolls back the bundle as a whole, not a single
skill. The schema does not at v0.1 model "partial" rollback to a
specific prior skill version; producers wishing to do that issue a
new release pinning the older skill ids.

Consider a release `v5` whose `claims-classifier` skill at version
`5.x` performs poorly. Roll back by:

1. Issuing release `v5.1` whose `genome.skills[*].version` for
   `claims-classifier` is `3.2.0` (the last good version).
2. Keeping all other skills at their `v5` versions.
3. Validating that `compatible_memory_schemas(v5.1)` covers the
   currently deployed schema.
4. Recording a `rollback` attestation tying `v5.1` to `v5`.

## Alternatives considered

### Allow any rollback by default; warn on memory mismatch

Rejected. Defaults must be safe. Operators routinely click through
warnings during incidents.

### Compute compatibility at runtime by inspecting memory

Rejected. Runtime inspection is too late; by the time the runtime
reads memory, traffic has already arrived. Declarative compatibility
allows the controller to refuse the rollback before any user is
served.

### Use semver ranges for `compatible_memory_schemas`

Considered. Explicit lists are unambiguous and small; ranges become
ambiguous when memory schemas diverge from semver semantics. v0.1
keeps explicit lists.

## Open questions

- Whether to extend the controller-side connectedness check into a
  spec-mandated CI check. Currently advisory.
- Whether to standardize migration shim discovery (e.g. naming
  convention, attestation type) at v0.2.

## Security considerations

- A maliciously crafted release could declare unrealistic
  compatibility to force a controller into a downgrade path.
  Attestations on every release (RFC 0008) are the mitigation:
  controllers MUST verify the signature before consulting the
  metadata.
- `incompatible_with` is a publisher commitment. Operators should
  monitor that producers update it honestly when they discover
  rollback hazards in already-released versions.

## Compatibility

Additive. Both fields are optional; existing bundles without them
default to "compatible only with their own schema, no explicit
blocks", which is the conservative interpretation.

## References

- RFC 0001 — Agent Bundle Format.
- RFC 0006 — Design vs Runtime Memory.
- RFC 0008 — Release Attestations.
