# Non-Determinism

AgentLock does not promise deterministic LLM behavior.

## Principle

The goal is not to force exact textual replay. The goal is to make agent changes observable, comparable, and governable.

## What To Compare

Implementations should compare behavior along multiple axes:

- deterministic policy and schema checks
- tool choice and sequence
- approval parity
- semantic output similarity
- statistical quality judgments

## Variance Budgets

A replay policy may define an acceptable variance budget. This acknowledges that:

- model outputs may vary across runs
- tool data may change
- prompts may be semantically stable without being textually identical

## Anti-Pattern

Treating any text difference as a failure is usually the wrong release criterion for agent systems. AgentLock encourages explicit thresholds and sampled comparison instead.
