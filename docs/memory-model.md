# Memory Model

AgentLock distinguishes design memory from runtime memory.

## Design Memory

Design memory is versioned material that shapes the agent's behavior:

- playbooks
- rubrics
- taxonomies
- procedural notes
- curated knowledge assets

This content may be bundled and locked by digest.

## Runtime Memory

Runtime memory is session, user, or environment state generated during execution.

`v0.1` does not allow runtime memory content to be bundled as release content. Only these should be versioned:

- runtime-memory schema reference
- access policy reference
- compatibility metadata

## Why The Distinction Matters

This boundary prevents a release bundle from silently carrying user state while still allowing implementations to reason about compatibility, migrations, and replay assumptions.
