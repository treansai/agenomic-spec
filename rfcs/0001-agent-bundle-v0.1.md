# RFC 0001: Agent Bundle v0.1

Status: Draft

## Summary

This RFC introduces the first public AgentLock bundle format, `v0.1`.

The format defines a portable unit for packaging, versioning, replaying, and attesting AI agents. The bundle is centered on:

- `genome.yaml`
- `agent.lock.yaml`
- `behavior.contract.yaml`

Optional companion artifacts include replay manifests, trace events, and release attestations.

## Motivation

Software versioning alone is not enough for agent systems.

An agent release depends on more than source code:

- prompts
- model configuration
- tool contracts and permission scopes
- policy defaults
- memory schema
- knowledge references
- replay criteria
- signed release evidence

Without an explicit artifact model, teams cannot reliably answer basic questions such as:

- What exactly changed between two agent versions?
- Is rollback safe?
- Which tool permissions were active?
- Which replay evidence supported the release?

## Goals

- Define a public, implementation-neutral specification for agent bundles.
- Make tool, prompt, policy, and memory dependencies first-class versioned artifacts.
- Support replay and comparison without claiming deterministic model behavior.
- Support signed release attestations.

## Non-Goals

- Defining a hosted execution platform
- Standardizing one prompt registry or MCP registry
- Guaranteeing deterministic LLM output
- Bundling runtime or user memory content

## Bundle Semantics

### Genome

The genome is the authored declaration of the agent. It should describe intended behavior and declared dependencies.

### Lockfile

The lockfile is the resolved release record. It should pin digests, dependency versions, and compatibility constraints.

### Behavior Contract

The behavior contract should define release gates with both deterministic and probabilistic checks.

### Trace Events

Trace events are runtime evidence. They should support replay, comparison, and audit reconstruction.

### Replay Manifest

A replay manifest should define how to execute and compare historical or synthetic cases against a candidate bundle.

### Release Attestation

A release attestation should summarize replay outcome, approval outcome, and final release status in a signed artifact.

## Memory Boundary

`v0.1` makes a strict distinction between:

- design memory, which may be versioned and bundled
- runtime memory, which may not be bundled as content

Runtime-memory schema and access policy are part of the bundle because they affect compatibility and governance.

## MCP-Native Tools

`v0.1` treats MCP as the default tool contract model. Tool declarations and lockfile entries should preserve:

- server reference
- server version
- contract or schema hash
- permission scopes

## Rollback

Rollback is compatibility-aware in `v0.1`. A compliant implementation should not treat rollback as a blind pointer move.

Rollback decisions should consider:

- runtime-memory schema compatibility
- dependency version constraints
- approval-policy compatibility
- replay evidence freshness

## Experimental Scope

`v0.1` is intentionally narrow. It defines enough structure for interoperable bundle production and verification while leaving room for future standardization around:

- conformance suites
- richer replay result formats
- stricter attestation envelopes
- memory migration descriptors

## Open Questions For Later RFCs

- Should a future version standardize a canonical replay report schema?
- Should tool contract hashing be fully normalized across MCP transports?
- Should attestation payloads adopt DSSE or in-toto profiles by default?
