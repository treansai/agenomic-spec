# Bundle Format

This specification defines an `agent-bundle` as a portable directory structure with required root artifacts and optional subdirectories.

## Required Root Artifacts

A conforming `v0.1` bundle should include:

- `genome.yaml`
- `agent.lock.yaml`
- `behavior.contract.yaml`

Replay and attestation artifacts are optional but recommended:

- `replay_manifest.yaml`
- `release_attestation.json`

## Typical Layout

```text
bundle/
├── genome.yaml
├── agent.lock.yaml
├── behavior.contract.yaml
├── prompts/
├── policies/
├── knowledge/
├── memory/
├── replays/
└── attestations/
```

The specification does not require a single prompt or policy directory naming scheme. It only requires that references inside the bundle remain stable and resolvable by the implementation.

## Naming

The canonical file names in this repository are the reference names for `v0.1`. Implementers should preserve them for interoperability.

## Packaging Rules

- The bundle should be self-describing.
- Design-memory artifacts may be packaged.
- Runtime or user memory must not be packaged as content.
- External dependencies should be represented by stable references plus digests or versions in the lockfile.

## Bundle Integrity

The lockfile is the integrity layer for the bundle. A verifier should not trust unresolved prompt, tool, or knowledge references when a lockfile is present.
