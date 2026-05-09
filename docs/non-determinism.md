# Non-determinism: managing user expectations

This page is the friendly companion to RFC 0005. The single most
important thing to internalize:

> **LLM-driven agents are non-deterministic by construction. Even at
> temperature 0, two calls can disagree.**

Pretending otherwise builds fragile pipelines. Agenomic is honest
about this and gives you the machinery to gate releases statistically.

## Why temperature 0 isn't enough

Identical inputs at temperature 0 can still produce different outputs
because:

- providers periodically update model checkpoints under the same
  `model_id`,
- inference engines (vLLM, TensorRT-LLM, others) tie-break differently
  on equal-probability tokens,
- batch composition changes numerical paths,
- KV-cache state and attention precision can vary across hardware,
- "deterministic mode" knobs (where they exist) often don't apply to
  speculative decoding, system prompts, or tool routing.

Empirically, the `system_fingerprint` returned by some providers
changes silently across days even when the public model id is fixed.

## Two replay modes

Agenomic declares the mode in every replay report:

### `deterministic_offline`

Replay reuses cached model outputs from a sealed snapshot. Bit-exact.

- **Cheap:** no LLM calls.
- **Honest scope:** verifies the **agent harness** (skills, policies,
  tool routing, memory updates) reproduces.
- **Limited:** does not catch model behavior changes — the LLM is
  pinned by playback.

Use it for: daily CI on the non-LLM parts of the agent.

### `statistical`

Replay re-invokes the model live for each trace `N` times and
compares distributions.

- **Expensive:** real LLM calls.
- **Honest scope:** observes actual model behavior; detects drift.
- **Probabilistic:** results are confidence-bounded, not exact.

Use it for: per-release fingerprints; weekly drift checks.

## Sample sizes (Hoeffding's inequality)

For a bounded per-run pass/fail metric and a target ε (looseness)
and δ (1 − confidence):

```text
n >= ln(2/δ) / (2 ε²)
```

Examples:

- ε = 0.05, δ = 0.05 → n ≈ 738
- ε = 0.02, δ = 0.05 → n ≈ 4 612
- ε = 0.01, δ = 0.05 → n ≈ 18 445

Pick the looseness you can pay for; don't pretend you can certify
ε = 0.001.

## Detecting silent provider drift

The replay report's `model_fingerprints_observed` aggregates the
`fingerprint` values of every model call across the job. A change
between two release fingerprints, with no other configuration
change, is silent provider drift. Treat it as an incident.

## Sentinel set + full set

A practical pattern:

- A small **sentinel set** (~50 traces) is replayed daily under
  `statistical` mode, cheap enough to run unattended. Use it for
  early-warning drift detection.
- A larger **full set** is replayed once per release, with enough
  runs to certify probabilistic rules.

The spec doesn't prescribe selection; it standardizes the report
shape so dashboards and audits can compare across runs.

## Things to avoid telling stakeholders

- "Replay is exact." It isn't.
- "We promise the agent will behave identically across releases."
  You can't.
- "Temperature 0 means deterministic." It doesn't.

## Things to tell stakeholders

- "We measure behavior across N runs, with confidence intervals.
  Releases ship only when those intervals meet our contract."
- "We track provider drift via fingerprint snapshots and trigger an
  incident if it changes silently."
- "Deterministic checks bound the harness; statistical checks bound
  the model layer."
