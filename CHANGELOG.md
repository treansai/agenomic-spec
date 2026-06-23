# Changelog

All notable changes to this specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches v1.0. While at v0.x, breaking changes are allowed and are
documented here.

## [Unreleased]

### Added

- **v0.3 (RFC 0011): behavioral contracts / policy DSL.** Adds `schemas/v0.3/policy.schema.json` encoding an ABC contract `C=(P,I,G,R)`: `policy_id`, `type`, `scope`, `rules[]` with `modality ∈ {forbidden, obligation, permission, temporal_invariant}` and ABC `aspect ∈ {precondition, invariant, guarantee}`, `when`/`then` predicates, a past-time PLTL `formula`, an `enforce` action, a `recovery` block (R), and `(p,δ,k)` `satisfaction` with drift parameters `α,γ` (`D*=α/γ`). Conformance fixtures under `conformance/{valid,invalid}/policy/`.
- **v0.3 (RFC 0010): canonical run traces.** Adds intra-run event hash chaining, causal execution graph, evidence package, event registry, replay taxonomy, conformance fixtures, and a trace-chain verifier.

- **v0.2 (RFC 0009): workflows and multi-agent systems.** New schema
  overlay directory `schemas/v0.2/` with:
  - `workflow.schema.json` — declarative workflows: agent/tool/human/
    wait/sub-workflow/loop steps, `depends_on` DAG, `when` guards,
    retries, timeouts, signals, triggers, escalation rules;
  - `system.schema.json` — multi-agent systems: member roles with
    autonomy envelopes, orchestration styles (pipeline, graph,
    supervisor, swarm, custom) with engine hints, shared state, signals,
    owned workflows, communication guardrails, escalation rules,
    `forbidden_autonomy`;
  - `genome.schema.json` (v0.2) — v0.1 genome plus optional `triggers`,
    `autonomy`, `guardrails`, `escalation_rules`, and `collaboration`.
- RFC 0009 (Draft) — Workflows and Multi-Agent Systems.
- Example bundles `claims-orchestra` (multi-agent system) and
  `guest-claims-pipeline` (staged LLM workflow).
- Conformance fixtures for `workflow`, `system`, and the v0.2 genome;
  the runner now selects the schema directory from each document's
  `spec_version`.
- `docs/orchestration.md` tutorial.
- Initial public scaffolding of the Agenomic specification.
- JSON Schemas (Draft 2020-12) for `genome`, `agenomic`, `behavior-contract`,
  `trace-event`, `replay-report`, `release-attestation`, and `atep-event` under
  `schemas/v0.1/`.
- RFCs 0001 through 0008 covering bundle format, canonical Merkle hashing,
  the Agentic Trajectory Event Protocol (ATEP), MCP-native tool references,
  statistical vs deterministic replay, the design/runtime memory split,
  rollback safety, and release attestations.
- Synthetic example agent bundles: `claims-agent`, `support-agent`,
  `trading-risk-agent`.
- Conformance suite under `conformance/` with positive and negative fixtures.
- `scripts/validate.sh` and `scripts/lint-rfcs.sh` enforcement.
- GitHub Actions CI workflow.
- Documentation tutorials under `docs/`.
