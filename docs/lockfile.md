# Lockfile

`agent.lock.yaml` records the resolved form of an agent bundle.

## Why It Exists

The genome says what the author intended. The lockfile says what the release actually depends on.

That includes:

- resolved digests for prompts and knowledge assets
- concrete MCP server versions and schema hashes
- design-memory digests
- memory compatibility metadata
- rollback constraints
- generation provenance

## Compatibility Metadata

Rollback is not a Git checkout problem. It is a compatibility problem.

The lockfile should record:

- runtime-memory schema version
- versions still compatible with the current runtime schema
- known breaking changes
- dependency constraints that block downgrade or upgrade

## Verifier Guidance

A verifier should treat the lockfile as the integrity baseline for:

- bundle validation
- replay selection
- attestation subject digests
- rollback eligibility

If a genome and lockfile disagree, the lockfile should win for verification and the release should be treated as suspect until reconciled.
