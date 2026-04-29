# Concepts

AgentLock treats an agent release as a bundle of behavioral dependencies, not just code.

## Agent Bundle

An agent bundle is the versionable unit described by this specification. At minimum it carries:

- a genome that describes intent and declared dependencies
- a lockfile with resolved digests and compatibility metadata
- a behavior contract with release gates

Optional artifacts include replay manifests, attestations, prompt files, policy files, tool contracts, and design-memory assets.

## Genome

The genome is the authored definition of the agent:

- prompts and operating principles
- model configuration
- MCP-native tool declarations
- policy defaults
- design-memory and runtime-memory references
- knowledge references
- replay profile

It describes the desired agent, not the fully resolved release.

## Lockfile

The lockfile records the resolved release inputs:

- digests for the genome and behavior contract
- prompt digests
- tool server versions and schema hashes
- knowledge digests
- design-memory digests
- rollback and memory compatibility constraints

## Behavior Contract

Behavior contracts express what must hold for a release to be considered acceptable.

- Deterministic checks are exact and reproducible.
- Probabilistic checks are sampled and judged against thresholds.

## Trace Events

Trace events are runtime records. They capture what happened during an execution:

- prompts applied
- tools requested and completed
- approvals requested and resolved
- policy decisions
- outputs and failures

Trace events support replay, audit, and statistical comparison.

## Replay Manifest

A replay manifest defines how historical or synthetic cases should be re-executed and compared:

- which bundle is under test
- which trace set or dataset is the source
- what variance budget is acceptable
- which metrics are compared

## Release Attestation

A release attestation is a signed summary of:

- the subject bundle
- replay evidence
- approval results
- final release status

It is not a substitute for raw evidence. It is the signed index over that evidence.

## Memory Boundary

AgentLock distinguishes:

- design memory: versionable and bundleable
- runtime memory: user or session state that is not bundled

Only runtime-memory schema and access policy belong in the bundle.
