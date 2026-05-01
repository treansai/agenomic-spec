# AgentLock Specification

> Status: **Experimental — v0.1**
>
> Open standard for packaging, versioning, replaying, and attesting AI agents.
> Apache-2.0 licensed. Vendor-neutral. Implementable by anyone.

[![ci](https://github.com/treansai/agentlock-spec/actions/workflows/ci.yml/badge.svg)](https://github.com/treansai/agentlock-spec/actions/workflows/ci.yml)

AgentLock defines:

- a portable **agent bundle** layout (genome, lockfile, contract, prompts,
  tools, policies, knowledge, memory schemas, evals, attestations);
- a **canonical hashing** scheme so the bundle has a stable logical identity
  across machines;
- a **trace event** envelope so production runs can be recorded and replayed;
- a **replay report** shape that captures both deterministic and statistical
  evaluation;
- a **release attestation** that signs the bundle hash, the replay report,
  and the causal history;
- the **Agentic Trajectory Event Protocol (ATEP)** — an event-sourced log of
  the agent's life, hash-linked and signed, suitable for governance and
  forensics.

This repository is the **specification only**. It contains schemas, RFCs,
documentation, synthetic examples, and a conformance suite. It contains
**no implementation code**. Anyone can build a compatible runtime, signer,
or verifier from this repo.

## Why this exists

Git versions files. AgentLock versions agent _behavior_:

- which prompts were active for a given run,
- which model and inference settings were used,
- which tools were reachable, with what schema hashes and permission scopes,
- which policies and approval rules applied,
- which memory schema the agent expected,
- which evaluations and replay evidence supported the release,
- which attestation summarized the release decision,
- and which causal events shaped the agent's trajectory between releases.

Two commits in a Git repo can refer to materially different agents.
AgentLock makes that difference explicit, hashable, and verifiable.

## What this repo IS

- Normative JSON Schemas (Draft 2020-12) under [`schemas/v0.1/`](schemas/v0.1/).
- RFCs describing protocol decisions and tradeoffs in [`rfcs/`](rfcs/).
- Synthetic, validating example bundles in [`examples/`](examples/).
- A conformance suite in [`conformance/`](conformance/) with positive and
  negative fixtures.
- Tutorial documentation in [`docs/`](docs/).

## What this repo IS NOT

- Not a Rust, Python, TypeScript, Go, or any-other-language implementation.
- Not tied to any commercial product, hosted service, or vendor.
- Not a stable v1 — `v0.1` is explicitly experimental and may break.

## Status table

| Version | Status        | Notes                                                                  |
|---------|---------------|------------------------------------------------------------------------|
| `v0.1`  | Experimental  | May break. Schemas and RFCs may change between minor revisions.        |
| `v1.0`  | Target        | Stable, semver applies. Frozen when 3 independent implementations pass the conformance suite. |

See [`docs/versioning.md`](docs/versioning.md) for the full policy.

## Quick start

```bash
git clone https://github.com/treansai/agentlock-spec
cd agentlock-spec
npm ci
npm run validate    # validates examples/ and conformance/ against schemas/v0.1/
npm run lint        # markdownlint + RFC front-matter lint
```

## Reading order

1. [`docs/concepts.md`](docs/concepts.md) — five-minute overview.
2. [`rfcs/0001-agent-bundle-format.md`](rfcs/0001-agent-bundle-format.md) — what a bundle is.
3. [`examples/claims-agent/genome.yaml`](examples/claims-agent/genome.yaml) — a real-shaped synthetic agent.
4. [`rfcs/0002-canonical-merkle-hashing.md`](rfcs/0002-canonical-merkle-hashing.md) — how bundles are hashed.
5. [`rfcs/0003-atep-binary-event-protocol.md`](rfcs/0003-atep-binary-event-protocol.md) — the causal event log.
6. [`rfcs/0008-release-attestations.md`](rfcs/0008-release-attestations.md) — how releases are signed.

## RFC index

| RFC | Title                                              | Status   |
|-----|----------------------------------------------------|----------|
| 0001 | Agent Bundle Format                               | Accepted |
| 0002 | Canonical Merkle Hashing                          | Accepted |
| 0003 | ATEP — Agentic Trajectory Event Protocol         | Accepted |
| 0004 | MCP-Native Tools                                  | Accepted |
| 0005 | Statistical vs Deterministic Replay              | Accepted |
| 0006 | Design vs Runtime Memory                          | Accepted |
| 0007 | Rollback Safety                                   | Accepted |
| 0008 | Release Attestations                              | Accepted |

## Schemas

| Schema                                                                   | Purpose                                  |
|--------------------------------------------------------------------------|------------------------------------------|
| [`genome.schema.json`](schemas/v0.1/genome.schema.json)                  | Agent design declaration.                |
| [`agent-lock.schema.json`](schemas/v0.1/agent-lock.schema.json)          | Pinned, reproducible dependencies.       |
| [`behavior-contract.schema.json`](schemas/v0.1/behavior-contract.schema.json) | Verifiable behavior invariants.       |
| [`trace-event.schema.json`](schemas/v0.1/trace-event.schema.json)        | Single agent run envelope.               |
| [`replay-report.schema.json`](schemas/v0.1/replay-report.schema.json)    | Output of a replay job.                  |
| [`release-attestation.schema.json`](schemas/v0.1/release-attestation.schema.json) | Signed release evidence.        |
| [`atep-event.schema.json`](schemas/v0.1/atep-event.schema.json)          | JSON projection of an ATEP event.        |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). RFCs follow the template in
[`rfcs/0000-template.md`](rfcs/0000-template.md).

## Governance

See [`GOVERNANCE.md`](GOVERNANCE.md). Currently BDFL-maintained, with a
documented path to multi-stakeholder governance once the spec stabilizes.

## Security

See [`SECURITY.md`](SECURITY.md) for how to report vulnerabilities in the
specification or in the conformance suite.

## License

[Apache License 2.0](LICENSE).
