# AI Act evidence mapping

> **Scope.** The European Union's AI Act sets record-keeping and
> oversight obligations for high-risk AI systems. This page maps
> AgentLock artifacts to the obligations most often cited in
> implementation discussions. It is **vendor-neutral**: any
> AgentLock-compatible implementation can produce the artifacts
> listed below. This page does **not** mention any specific
> commercial product.

> **Disclaimer.** This is a technical mapping, not legal advice.
> Conformance with the AI Act depends on facts, deployment context,
> and competent authorities' interpretations. Use this as a starting
> point for conversations with your legal and compliance teams.

## Articles covered

| Article | Title (informally)                                      |
|---------|---------------------------------------------------------|
| 9       | Risk management system                                  |
| 11      | Technical documentation                                 |
| 12      | Record-keeping (logging)                                |
| 13      | Transparency and provision of information to users      |
| 14      | Human oversight                                         |

## Article 9 — Risk management

A risk management system must identify, evaluate, and mitigate risks
across the AI system's lifecycle.

| Obligation (informal)                              | Where AgentLock helps                             |
|----------------------------------------------------|---------------------------------------------------|
| Identify foreseeable risks of the agent's use      | `genome.yaml#agent.criticality`, `forbidden_decisions` |
| Evaluate risks empirically                         | `behavior.contract.yaml` (deterministic + probabilistic rules); `replay-report` |
| Test under conditions reflecting intended use      | Statistical replay over production traces (RFC 0005) |
| Document residual risks                            | `replay-report#violations` and `aggregates`; ATEP `governance` events |
| Continuously update risk management               | ATEP `policy` and `governance` streams (RFC 0003) |

## Article 11 — Technical documentation

Technical documentation must enable competent authorities to assess
conformity.

| Obligation                                         | Where AgentLock helps                            |
|----------------------------------------------------|--------------------------------------------------|
| General description of the system                  | `genome.yaml#agent`, `domain`, `runtime`         |
| Detailed description of elements and development   | The full bundle: prompts, tools, policies, knowledge refs, memory schema |
| Information on data and data governance            | `agent.lock.yaml#memory` claims; knowledge `snapshot_hash` and `source_uri` |
| Validation and testing procedures                  | `behavior.contract.yaml`; `replay-report.schema.json` |
| Cybersecurity                                      | RFC 0002 (canonical hashing), RFC 0003 (signed events), RFC 0008 (signed attestations) |

## Article 12 — Record-keeping

High-risk AI systems must automatically record events ("logs") to a
level appropriate to risk.

| Obligation                                         | Where AgentLock helps                            |
|----------------------------------------------------|--------------------------------------------------|
| Automatic recording of events                      | Trace events (`schemas/v0.1/trace-event.schema.json`); ATEP `interaction` stream |
| Logs traceable to the AI system version            | `release` field in trace events; ATEP causal hash chain to release attestation |
| Tamper-evident retention                           | ATEP signs `causal_hash`; chain is transitively tamper-evident (RFC 0003) |
| Aggregation for monitoring                         | `replay-report.schema.json` aggregates; ATEP segment Merkle root |

## Article 13 — Transparency

Users must be informed of relevant characteristics of the AI system.

| Obligation                                         | Where AgentLock helps                            |
|----------------------------------------------------|--------------------------------------------------|
| Identify the AI system to users                    | `agent.id` derived from `genome.yaml`             |
| Information on the system's intended purpose       | `genome.yaml#agent.domain`; bundle README        |
| Limitations and accuracy under intended use        | `behavior.contract.yaml#rules` with confidence; `replay-report#aggregates` |
| Risks to natural persons                           | `genome.yaml#agent.criticality`; `forbidden_decisions` |

## Article 14 — Human oversight

Effective human oversight measures must be designed and implemented.

| Obligation                                         | Where AgentLock helps                            |
|----------------------------------------------------|--------------------------------------------------|
| Ability to intervene or interrupt                  | `requires_human_approval` flag on tools (RFC 0004) |
| Approval gates before consequential actions        | `approvals[]` in attestations; `governance` ATEP events; deterministic rules in the contract |
| Decision aids without over-reliance                | Bundles MAY include `forbidden_decisions`; agents may emit "DRAFT — human approval required" outputs (see claims-agent example) |
| Audit trail of who approved what                   | `approvals[].user_id`, `at`; ATEP `governance` events |

## How to assemble an evidence pack

For a single release, a typical evidence pack contains:

1. The bundle (or its `bundle_logical_hash` and the algorithm).
2. The `replay-report` and its hash.
3. The chain of `governance` ATEP events from genesis to release,
   with their causal hashes.
4. The signed `release-attestation` referencing the bundle, the
   replay-report hash, and (recommended) the `atep_root_hash`.
5. The verifier key directory entry valid at `issued_at`.

A reviewer with a conformant verifier can recompute every hash
offline and confirm the release is what the attestation says it is.

## What this mapping is not

- It is **not** legal certification. Authorities decide.
- It is **not** a guarantee that an AgentLock-compatible deployment
  satisfies all AI Act obligations — for example, public-facing
  transparency notices, conformity assessments, and post-market
  monitoring obligations live partly outside the technical artifacts
  this spec defines.
- It is **not** a substitute for an actual risk assessment performed
  by competent personnel.

It **is** a way to ensure your technical evidence is structured,
hashable, signed, and reproducible — the foundation any defensible
compliance posture needs.
