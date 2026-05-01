# RFC 0005: Statistical vs Deterministic Replay

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | AgentLock maintainers \<spec@agentlock.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0003, RFC 0008                                |

## Summary

LLM-driven agents are **non-deterministic by construction**, even at
temperature 0. AgentLock therefore defines two replay modes —
**deterministic-offline** and **statistical** — and standardizes the
shape of their output (`replay-report.schema.json`) without mandating
which mode an implementation must use. A conformant implementation
declares its mode explicitly per replay job.

## Motivation

A common failure of agent governance is to promise determinism that
does not hold:

- temperature 0 does **not** guarantee identical outputs across
  providers, hardware revisions, batch sizes, and inference engine
  versions;
- providers periodically update model checkpoints under the same name,
  changing behavior without changing the model id;
- token sampling tie-breaks differ across servers.

Pretending replay is exact creates fragile pipelines that fail
unhelpfully on benign drift. AgentLock's posture is to be **honest**
about non-determinism and to provide a statistical machinery that
gives meaningful release decisions despite it.

## Detailed design

### Two modes

A `replay-report` declares its mode in the `mode` field:

| Mode                     | Meaning                                                                     |
|--------------------------|-----------------------------------------------------------------------------|
| `deterministic_offline`  | Replay reuses cached model outputs from a sealed snapshot. Bit-exact.       |
| `statistical`            | Replay re-invokes the model `N` times per trace and compares distributions. |

### Deterministic-offline replay

The producer captures, at trace time, every model and tool call's
**input hash and output hash** plus the model output content addressed
by `output_hash`. Replay deterministically re-feeds those outputs into
the agent and verifies that downstream state, tool calls, and final
output match.

Properties:

- **Cheap:** no LLM calls.
- **Honest scope:** verifies that the **agent harness** (skills,
  policies, tool routing, memory updates) reproduces.
- **Limited:** does not catch model behavior changes — the LLM is
  pinned by playback.

This is the right mode for daily CI and for regression tests on the
non-LLM parts of the agent.

### Statistical replay

The producer re-invokes the model live for each trace `N` times, where
`N >= contract.minimum_replay_runs_per_trace`. For each trace:

- compute per-run outcomes for every contract rule;
- aggregate to per-trace pass rate;
- aggregate across traces to a population pass rate.

For probabilistic rules, the contract specifies `min_pass_rate` and
`confidence`. The job passes the rule iff the population lower
confidence bound exceeds `min_pass_rate`.

#### Sample size

For a bounded metric (a per-run pass/fail), Hoeffding's inequality
gives:

```text
n >= ln(2/δ) / (2 ε²)
```

For ε = 0.05 (5 percentage points), δ = 0.05 (95 % confidence), this
yields `n ≈ 738`. Implementations SHOULD pre-compute the required
`n` from the contract's `confidence` and from the looseness producers
are willing to accept; the spec does not mandate a specific bound,
only that the mode be `statistical` and the report record `count`,
`mean`, `std`, `ci_low`, `ci_high` per metric where applicable.

### Sentinel set + full set

Producers SHOULD maintain two trace selections:

- a **sentinel set** of ~50 carefully chosen traces, suitable for
  cheap daily statistical replay;
- a **full set** of representative production traffic, used per
  release for the canonical fingerprint.

The spec does not prescribe selection; it standardizes the shape of
the report so consumers can compare across runs.

### Provider fingerprint tracking

Every model call MAY record a provider-reported fingerprint
(e.g. OpenAI's `system_fingerprint`). The replay report aggregates
distinct fingerprints in `model_fingerprints_observed`. A change here
between two release fingerprints, with no other configuration change,
is **silent provider drift** and warrants investigation.

### Failing the contract

A contract fails if any rule fails. Specifically:

- A `deterministic` rule fails if its violation rate exceeds
  `max_violation_rate` (typically 0).
- A `probabilistic` rule fails if the population `ci_low` does not
  meet `min_pass_rate` at the requested `confidence`.

The replay report's top-level `contract_passed` is the AND of these.

### Conformance

A conformant implementation MAY support either mode or both. It MUST:

- declare `mode` in every report;
- conform to the report schema for that mode;
- not silently switch modes between runs of the same release pipeline.

## Alternatives considered

### Mandate temperature 0 as "deterministic"

Rejected. The premise is empirically false across providers and over
time. Promising determinism we cannot deliver erodes trust in the
spec.

### Single mode with implementation-defined semantics

Rejected. The two modes have very different cost and meaning;
collapsing them hides the distinction operators must reason about.

### Bayesian credible intervals instead of frequentist confidence intervals

Considered. Either is acceptable in practice; the field of agent
evaluation is unsettled. v0.1 picks frequentist for familiarity and
because Hoeffding offers a one-line sample-size derivation. v0.2 may
add explicit Bayesian shape support.

## Open questions

- Whether to standardize a built-in metric list (latency, cost, output
  similarity, classifier scores). v0.1 leaves the metric set to the
  domain.
- Whether to standardize a content-similarity metric (BLEU, embedding
  cosine, LLM-as-judge with calibration). All have known weaknesses.

## Security considerations

- A statistical replay does not bound an adversarial model's worst
  case; it bounds the **average** behavior under benign conditions.
  Adversarial robustness is out of scope for this RFC.
- Caches used in deterministic replay must be content-addressed and
  signed; otherwise a tampered cache could replay an inflated success
  rate.

## Compatibility

This RFC defines the v0.1 replay contract. Mode names are stable.
Adding new modes (e.g. `causal_replay` for ATEP-driven replay) is a
future RFC.

## References

- [Hoeffding 1963 — Probability Inequalities](https://www.jstor.org/stable/2282952).
- OpenAI provider fingerprinting (community-documented behavior).
- RFC 0001, RFC 0008.
