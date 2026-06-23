# RFC 0011: Behavioral Contracts and the Policy DSL

| Field        | Value                                      |
|--------------|--------------------------------------------|
| Status       | Draft                                      |
| Created      | 2026-06-23                                 |
| Author(s)    | Agenomic maintainers <spec@agenomic.dev>   |
| Spec version | v0.3                                       |
| Related      | RFC 0005, RFC 0010                         |

## Summary

[FONDATION + SOURCÉ] RFC 0011 defines a **behavioral contract** as the **ABC**
tuple `C = (P, I, G, R)` — Preconditions, Invariants, Guarantees/obligations,
and Recovery — together with a probabilistic `(p, δ, k)` satisfaction relation
and a drift bound `D* = α/γ`. The contract is expressed in a small policy DSL
published at
[`schemas/v0.3/policy.schema.json`](../schemas/v0.3/policy.schema.json), and is
evaluated against a run's append-only event trajectory (RFC 0010), making it a
**post-hoc / online monitoring** instrument rather than a generative one.

## Detailed design

### The contract DSL

A contract document is:

```yaml
policy_id: pii-egress-guard
type: deontic_temporal_contract
scope: { agent_id: "agent://acme/support" }
rules:
  - id: no-self-mod                # I — invariant / circuit breaker
    modality: forbidden
    aspect: invariant
    when: { event: tool.call.proposed,
            predicate: { field: tool, op: eq, value: set_system_prompt } }
    enforce: block
    severity: critical
  - id: risk-precondition          # P — precondition: Pre(T) ⟹ RiskScore < τ
    modality: obligation
    aspect: precondition
    when: { event: tool.call.proposed }
    then: { field: risk_score, op: lt, value: 0.8 }
    enforce: escalate
  - id: delete-needs-approval      # I — past-time temporal invariant
    modality: temporal_invariant
    formula: "G(delete_record -> once(human_approved))"
    enforce: block
recovery:                          # R — applied on violation
  - on_violation: [no-self-mod, delete-needs-approval]
    actions: [block_tool, escalate_to_human]
satisfaction: { p: 0.95, delta: 0.05, k: 100, alpha: 0.5, gamma: 2.0 }
```

### Deontic modalities

| `modality`           | Meaning                                                            |
|----------------------|-------------------------------------------------------------------|
| `forbidden`          | When `when` fires, `then` must **not** hold (omitted `then` ⇒ the trigger itself is forbidden). |
| `obligation`         | When `when` fires, `then` **must** hold.                           |
| `permission`         | Documents an allowance; never a violation.                        |
| `temporal_invariant` | The PLTL `formula` must hold over the trajectory.                  |

The ABC `aspect` (`precondition` / `invariant` / `guarantee`) records which of
`P`, `I`, `G` a rule belongs to.

### PLTL (past), not LTL (future)

[FONDATION + SOURCÉ Agent-C] The temporal layer is **past-time** Linear Temporal
Logic. Operators reach *backward* over the already-observed prefix:

- `G(φ)` / `H(φ)` — *historically*: `φ` held at every past position;
- `once(φ)` / `previously(φ)` — `φ` held at some past position;
- `since(φ, ψ)` — `φ` held continuously since the last `ψ`.

This is exactly what monitoring needs: `G(delete_record → once(human_approved))`
asks "did approval already happen?" and is decidable against a finished or
streaming trace with no lookahead.

It is deliberately **not** future LTL (`X`, `F`, `U`). Future-time operators
describe what a run *will* do and belong to the **generative** side —
enforcement at decode time (Agent-C: FOL→SMT interleaved with backtrack /
resample). That is **out of scope for the server** and lives in the runtime
adapter (P3-3); the server audits the past, it does not steer the future.

### (p, δ, k) satisfaction and the drift bound

[SOURCÉ] A single run is non-deterministic, so satisfaction is **probabilistic**.
Over `k` trajectories, a trajectory is a *success* when it is clean **or fully
recovered** (every violation had a declared `recovery`). The contract is
satisfied iff the empirical success proportion `p̂ ≥ p − δ`. A conservative
Hoeffding lower bound on the true rate is reported alongside.

The **drift bound** `D* = α/γ` (master document §4.6–4.8) bounds stationary
behavioral drift: `α` is the per-step perturbation rate, `γ` the restoring rate.
The **Predictive Alignment Score** combines `p̂` and `D*` into a single
alignment signal in `[0,1]`.

### AlignmentScore

[EXTRAPOLATION] The run-level `AlignmentScore` (master document §10.2) is a
weighted aggregate of six components — PolicyAdherence (0.30),
HumanOversightCorrectness (0.20), ToolBoundarySafety (0.15), MemoryIntegrity
(0.15), Controllability (0.10), ExplanationSupport (0.10). **The weights are
arbitrary and to be calibrated.** It is exposed at
`GET /v1/runs/:run_id/alignment`. The reference engine lives in `agenomic-cloud`
(`crates/agenomic-contract`, `crates/agenomic-metrics`).

## Alternatives considered

- **Future-time LTL on the server.** Rejected: future operators require
  lookahead/steering and belong to decode-time generation (Agent-C), not to a
  monitor over an immutable trajectory.
- **Rego/OPA for temporal properties.** Rego is excellent for stateless
  authorization (and is reused at the tool boundary, P3-2) but expresses
  "happened-before" properties awkwardly; a dedicated PLTL form is clearer.
- **A general predicate AST instead of a `formula` string.** Deferred: the
  string form matches the master document §10.1 and reads naturally; payload
  predicates remain available via `forbidden`/`obligation` rules.

## Open questions

- Calibration of the AlignmentScore weights and of `(α, γ)` from observed runs.
- A richer atom language for PLTL (currently atoms match event types).
- Whether `permission` rules should contribute positive evidence to scoring.

## Security considerations

Contracts are a **monitoring** layer: a satisfied contract is evidence, not a
guarantee that an effect was prevented. Hard prevention at the tool boundary is
the Tool Boundary Gate's job (P3-2). The `temporal_invariant` evaluator is
fail-closed — an unparseable `formula` is treated as a violation, never ignored.
Recovery actions (`block_tool`, `redact_sensitive_data`, `escalate_to_human`,
`create_incident`) are emitted as ledger events so an interruption is auditable.

## Compatibility

Additive. `policy.schema.json` is a new v0.3 artifact; no existing schema
changes. The legacy fixed contract check is retained for the replay worker, so
existing runs validate unchanged. Documents carrying no `spec_version` validate
against v0.3 by default.

## References

- [`schemas/v0.3/policy.schema.json`](../schemas/v0.3/policy.schema.json)
- RFC 0010 — Canonical Run Trace (the event trajectory monitored here)
- RFC 0005 — Statistical vs Deterministic Replay (the `(p, δ, k)` lineage)
- Master document §4.6–4.8 (PLTL / deontic / ABC), §10 (alignment)
