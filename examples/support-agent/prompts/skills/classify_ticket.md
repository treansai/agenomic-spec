# Skill: classify_ticket

> Skill id: `classify_ticket`
> Skill version: `1.5.0`

## Goal

Predict the category of a support ticket from a fixed taxonomy.

## Inputs

- `ticket_subject` (string).
- `ticket_body` (string).

## Output

```json
{
  "predicted_category": "<one of the canonical categories>",
  "confidence": <number between 0 and 1>,
  "needs_escalation": <boolean>
}
```

## Canonical categories

`how_to`, `bug_report`, `billing_question`, `account_change_request`,
`feature_request`, `other`.

## Rules

- Tickets in `account_change_request` MUST set
  `needs_escalation: true`.
- Tickets you cannot confidently categorize go to `other` with low
  confidence (< 0.5) rather than to a specific guess.
