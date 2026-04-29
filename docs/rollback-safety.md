# Rollback Safety

Rollback is only safe when the older bundle can still interpret the current environment.

## Compatibility Checks

Before rollback, an implementation should evaluate:

- runtime-memory schema compatibility
- MCP server version constraints
- permission-scope compatibility
- behavior contract changes
- approval policy changes

## Common Blockers

Rollback should be blocked when:

- runtime memory has been migrated to a newer incompatible schema
- a prior bundle expects tool contracts that are no longer available
- approval semantics became stricter and the older bundle would weaken them
- replay evidence for the rollback target is stale or missing

## Operational Guidance

Safe rollback is a policy decision informed by technical evidence. AgentLock provides the fields required to make that decision explicit instead of implicit.
