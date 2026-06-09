# Agenomic in five minutes

Agenomic is an **open standard** for describing, hashing, replaying,
and attesting AI agents. This page is the shortest path to the core
ideas.

## 1. An agent is more than code

Source code captures **how** an agent processes inputs. It does not
capture **what an agent is**. To compare two agent versions
meaningfully, you also need to know:

- the prompts and skills active for that version,
- the model and inference settings actually used,
- the tools reachable, with their schemas and permission scopes,
- the policies and approval rules in force,
- the memory schema the agent expected,
- the evaluations and replay evidence supporting the release,
- the signed release decision.

Agenomic packages all of those into a single artifact: an
**agent bundle** (RFC 0001).

## 2. Bundles are hashed canonically

Two producers with different `tar` versions can ship the same bundle
content as different bytes. Agenomic specifies a canonical Merkle
hash (RFC 0002) that depends only on file paths and contents — not on
archive format, compression level, or filesystem details.

The hash, identified as `blake3-merkle-v1`, is what release
attestations sign.

## 3. Replay is statistical, not deterministic

LLMs are non-deterministic by construction. Even at temperature 0, two
calls can disagree across providers, hardware revisions, and
checkpoints sharing a name.

Agenomic takes this seriously (RFC 0005). It defines two replay
modes:

- **deterministic-offline**, which replays cached model outputs to
  verify the non-LLM parts of the agent reproduce;
- **statistical**, which re-invokes the model `N` times per trace and
  reports confidence intervals.

A replay report (`schemas/v0.1/replay-report.schema.json`) declares
its mode. A behavior contract
(`schemas/v0.1/behavior-contract.schema.json`) carries deterministic
rules and probabilistic rules with `min_pass_rate` and `confidence`.

## 4. Attestations are the trust layer

A release attestation
(`schemas/v0.1/release-attestation.schema.json`) signs the bundle
hash, optionally the replay report hash, optionally the ATEP root
hash, the approval log, and the issuer's identity. Verification is
offline and reproducible (RFC 0008).

Unsigned attestations are explicitly **not for production**.

## 5. ATEP captures causal history

The Agentic Trajectory Event Protocol (RFC 0003) is an event-sourced,
hash-linked, signed log of an agent's life: identity, capabilities,
knowledge, policies, runtime pinnings, interactions, governance.
Where Git versions files, ATEP versions **causal trajectories of
behavior**.

Each event carries a Hybrid Logical Clock, references its parent
events by causal hash, and is signed over its hash (not its body) to
make the chain transitively tamper-evident.

## 6. Memory is split: design vs runtime

Design memory is bundled and versioned. Runtime memory (per-user,
PII) is not bundled — only its **schema** is referenced (RFC 0006).
This is the only safe way to reconcile reproducibility with GDPR.

## 7. Rollback is compatibility-aware

Releases declare `compatible_memory_schemas` and `incompatible_with`
(RFC 0007). A controller composes these into a graph; safe rollback
is a connectivity question, not a wish.

## 8. Agents compose: workflows and systems

Production agents rarely run alone. v0.2 (RFC 0009) adds two manifest
kinds on top of the genome:

- a **workflow** (`workflow.yaml`) declares an ordered, possibly
  branching, possibly long-running composition of agent calls,
  deterministic tool steps, human gates, signal waits, loops, and
  sub-workflows;
- a **system** (`system.yaml`) declares a multi-agent system: the
  member agents and their roles, the orchestration topology
  (pipeline, graph, supervisor, swarm, custom), shared state and
  signals, and the system-wide autonomy, guardrail, and escalation
  envelope.

Both are ordinary bundle files: hashed by RFC 0002, attested by
RFC 0008, and referencing schemas only — never runtime state
(RFC 0006). Re-wiring a system changes its hash exactly like editing
a prompt changes an agent's.

## What to read next

- [`rfcs/0001-agent-bundle-format.md`](../rfcs/0001-agent-bundle-format.md)
- [`docs/bundle-format.md`](bundle-format.md)
- [`examples/claims-agent/genome.yaml`](../examples/claims-agent/genome.yaml)
- [`docs/orchestration.md`](orchestration.md) — workflows and
  multi-agent systems (v0.2).
- Then the RFCs in order: 0002 → 0009.
