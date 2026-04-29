# AgentLock Specification

AgentLock is an open standard for packaging, versioning, replaying, and attesting AI agents.

An AgentLock bundle captures more than source code. It describes the full agent artifact set required to reason about behavior over time: prompts, model configuration, MCP-native tools, policies, memory schema, evaluation contracts, replay manifests, and signed release attestations.

Status: experimental `v0.1`

## Why Git Is Not Enough For Agents

Git is effective at tracking code and text files, but an agent release is not only code.

For a meaningful agent version you also need to know:

- which prompts were active
- which model and inference settings were used
- which tools were reachable, with what schema hashes and permission scopes
- which policy and approval rules applied
- which memory schema the agent expected
- which evaluations and replay evidence supported the release
- which attestation summarized the release decision

Without those artifacts, two commits can refer to materially different agents.

## Why Agent Bundles Exist

An `agent-bundle` gives teams a portable unit for:

- packaging an agent definition
- locking resolved dependencies and compatibility constraints
- replaying historical traces against later versions
- comparing behavior statistically instead of promising determinism
- attaching signed release evidence

AgentLock does **not** claim deterministic LLM behavior. The standard is designed to record, replay, and compare behavior with deterministic checks plus probabilistic judgments.

## Repository Layout

This repository defines the public specification and reference artifacts for the `v0.1` bundle format.

```text
.
├── README.md
├── LICENSE
├── schemas/
│   ├── genome.schema.json
│   ├── agent-lock.schema.json
│   ├── behavior-contract.schema.json
│   ├── trace-event.schema.json
│   ├── replay-manifest.schema.json
│   └── release-attestation.schema.json
├── examples/
│   ├── claims-agent/
│   ├── support-agent/
│   └── trading-risk-agent/
├── docs/
│   ├── concepts.md
│   ├── bundle-format.md
│   ├── genome.md
│   ├── lockfile.md
│   ├── behavior-contracts.md
│   ├── trace-events.md
│   ├── attestations.md
│   ├── non-determinism.md
│   ├── mcp-native-tools.md
│   ├── memory-model.md
│   ├── rollback-safety.md
│   └── ai-act-evidence-mapping.md
└── rfcs/
    └── 0001-agent-bundle-v0.1.md
```

## Core Concepts

- A versioned agent includes prompts, tools, policies, model configuration, memory schema, knowledge references, eval contracts, and attestations.
- Design memory is bundleable and versionable. Runtime or user memory is not bundled; only its schema and access policy are versioned.
- MCP-native tools are first-class dependencies. Bundles record server references, versions, schema hashes, and permission scopes.
- Behavior contracts include deterministic checks and probabilistic checks.
- Rollback is compatibility-aware. Reverting an agent must consider memory schema compatibility and dependency constraints.
- Attestations are signed summaries of replay results, approvals, and release status.

## How To Implement The Spec

Implementers can adopt AgentLock without using any specific runtime or SaaS product.

1. Produce a `genome.yaml` that describes the intended agent.
2. Resolve the bundle into `agent.lock.yaml` with digests and compatibility metadata.
3. Define release criteria in `behavior.contract.yaml`.
4. Emit trace events during execution.
5. Build replay manifests from recorded traces and evaluation suites.
6. Generate a signed release attestation once replay and approval policies complete.

Projects can implement the spec in any language. The JSON Schemas in [`schemas/`](schemas/) are intended as the validation baseline; the docs describe the semantics that a conforming implementation should preserve.

## What This Repository Is

This repository contains:

- format definitions
- reference schemas
- synthetic examples
- specification docs
- an initial RFC for `v0.1`

This repository does **not** implement the AgentLock control plane, hosted execution environment, or any SaaS product.

## Roadmap

Potential `v0.2` work includes:

- a canonical JSON replay report format
- stronger interoperability rules for MCP tool contract hashing
- explicit memory migration descriptors and compatibility levels
- a conformance test suite for bundle producers and verifiers
- DSSE or in-toto attestation profiles
- signed trace chunk manifests for large replay sets

## Contributing

The format is experimental. Issues and RFCs that tighten semantics, improve interoperability, or contribute additional synthetic examples are in scope.
