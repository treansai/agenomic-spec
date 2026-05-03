# Skill: classify_claim

> Skill id: `classify_claim`
> Skill version: `3.1.0`

## Goal

Given a claim narrative and minimal metadata, predict the **claim
category** from a fixed taxonomy.

## Inputs

- `claim_narrative` (string, free-form, may contain PII).
- `claim_metadata` (object): `policy_type`, `region`, `submission_channel`.

## Output

A JSON object:

```json
{
  "predicted_category": "<one of the canonical categories>",
  "confidence": <number between 0 and 1>,
  "rationale": "<short, customer-safe rationale>"
}
```

## Canonical categories

`property_damage`, `personal_injury`, `theft`, `liability`,
`fraud_suspected`, `other`. The category `fraud_suspected` requires
also setting `requires_human_review: true` in the rationale.

## Instructions to the model

- Read the narrative carefully but never quote it verbatim in the
  rationale.
- If the narrative is ambiguous, prefer `other` with a confidence
  below 0.6 over an arbitrary specific guess.
- Tokenize names and addresses if you must reference them; prefer not
  to reference them at all.
