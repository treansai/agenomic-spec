# Writing behavior contracts

Tutorial companion to
[`schemas/v0.1/behavior-contract.schema.json`](../schemas/v0.1/behavior-contract.schema.json)
and to RFC 0005.

A behavior contract is the **release-readiness gate**. The replay
system evaluates each rule against recorded traces; the contract
passes only if every rule passes.

## Two rule types

| Type            | Use when…                                                  |
|-----------------|------------------------------------------------------------|
| `deterministic` | The assertion must hold in **every** run (e.g. invariants). |
| `probabilistic` | The assertion must hold in **most** runs at a given confidence (e.g. accuracy, helpfulness). |

A deterministic rule uses `max_violation_rate` (typically `0.0`).
A probabilistic rule uses `min_pass_rate` and `confidence`.

## Severity guidance

| Severity   | Typical use                                                       |
|------------|-------------------------------------------------------------------|
| `info`     | Observability only. A failure here surfaces a warning but does not block. |
| `low`      | Soft bound (e.g. latency budget).                                 |
| `medium`   | Quality bound; failure delays release pending review.             |
| `high`     | Material harm risk; failure blocks release.                       |
| `critical` | Safety / regulatory invariant; failure is a hard stop.            |

The spec does not enforce a mapping between severity and gating —
that's a producer/runtime decision — but the convention is widely
useful.

## Writing a deterministic rule

```yaml
- id: never_auto_payout
  type: deterministic
  severity: critical
  assertion: |
    no tool_call where tool == "propose_compensation"
      has status == "success"
      unless approvals[*].status == "approved"
  max_violation_rate: 0.0
  description: >
    Compensation must never be finalized without recorded human approval.
```

Tips:

- Phrase the assertion as a **negative invariant** ("no run …", "must
  never …"). They are easier to reason about than positive ones.
- Keep the assertion close to fields actually present in
  `trace-event.schema.json` (model_calls, tool_calls, final_output).
  The spec leaves the assertion language to the runtime, so be
  consistent within an organization.

## Writing a probabilistic rule

```yaml
- id: classification_accuracy
  type: probabilistic
  severity: high
  assertion: labels.expected_category == labels.predicted_category
  min_pass_rate: 0.92
  confidence: 0.95
  description: >
    Classification accuracy ≥ 92 % at 95 % confidence on gold-labeled traces.
```

How `min_pass_rate` and `confidence` interact: replay produces a
sample mean. The runtime's contract evaluator computes the lower
confidence bound at the requested `confidence`; the rule passes iff
the lower bound ≥ `min_pass_rate`. RFC 0005 sketches the Hoeffding
sample size derivation.

## Picking sample sizes

`contract.minimum_replay_runs_per_trace` declares the minimum. A
typical setting is 20–50 for daily statistical replay and several
hundred for per-release fingerprints.

If you set `min_pass_rate: 0.99` with `confidence: 0.95`, expect to
need many runs — Hoeffding gives `n ≈ ln(2/0.05)/(2·0.005²) ≈ 73 778`
to bound at ε=0.005. Be realistic about what you can afford.

## Common rule patterns

### Tone / safety filters

```yaml
- id: tone_is_empathetic
  type: probabilistic
  severity: medium
  assertion: tone_classifier(final_output) in {"empathetic","neutral"}
  min_pass_rate: 0.95
  confidence: 0.95
```

### Tool whitelisting

```yaml
- id: never_call_writeable_tools
  type: deterministic
  severity: critical
  assertion: |
    no tool_call has tool in {"place_order","cancel_order","move_funds"}
  max_violation_rate: 0.0
```

### Latency / cost informational bounds

```yaml
- id: latency_budget
  type: probabilistic
  severity: low
  assertion: sum(model_calls[*].latency_ms) < 9000
  min_pass_rate: 0.90
  confidence: 0.90
```

## What a contract does NOT prove

A contract bounds **average** behavior under benign conditions on the
sampled trace set. It does not bound adversarial worst-case behavior
or emergent harms not modeled by your assertions. Treat the contract
as a **guardrail layer**, not a complete safety case.
