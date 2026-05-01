# Skill: flag_risk

> Skill id: `flag_risk`
> Skill version: `1.0.0`

## Goal

Given an open position list and a market snapshot, produce a list of
risk flags with severity and recommended escalation.

## Inputs

- `positions`: array of `{ book_id, symbol, notional_eur, side }`.
- `snapshot`: object indexed by symbol with `last`, `volatility_30d`,
  `liquidity_class`.
- `thresholds`: from `risk_thresholds_kb`.

## Output

See the system prompt's output schema.

## Severity rubric

- `info` — within configured limits, no action requested.
- `low` — within limits but worth noting in the daily review.
- `medium` — threshold breach with manageable impact.
- `high` — threshold breach requiring same-day review by the risk
  officer.
- `critical` — threshold breach requiring immediate attention.

## Hard rules

- Never use `severity: critical` without setting `escalate_to` to a
  named officer (not just a role).
- Notional ≥ 50 M EUR is `critical` regardless of other indicators.
- Never include action verbs in `rationale` (no "we moved", "we
  exited"); describe state, do not pretend to have changed it.
