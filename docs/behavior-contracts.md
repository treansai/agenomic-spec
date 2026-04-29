# Behavior Contracts

Behavior contracts define what "acceptable behavior" means for a release.

## Deterministic Checks

Deterministic checks should be exact and reproducible. Common examples:

- schema validity
- tool allowlist enforcement
- mandatory approval gates
- output format conformance
- runtime-memory boundary checks
- dependency version constraints

A deterministic release gate often requires a `100%` pass rate.

## Probabilistic Checks

Probabilistic checks are for qualities that cannot be reduced to exact equality:

- tone
- hallucination risk
- answer quality
- policy interpretation
- escalation judgment

These checks depend on sampling, judging, and thresholds. They should be reported statistically, not as false claims of determinism.

## Release Gates

A behavior contract should define:

- minimum deterministic pass rate
- minimum probabilistic pass rate
- maximum allowed unresolved severity

Different bundles may choose stricter gates depending on criticality.

## Replay Relationship

Behavior contracts and replay manifests work together:

- the contract defines what matters
- the replay manifest defines how to test it
