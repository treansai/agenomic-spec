# Skill: compensation_reasoning

> Skill id: `compensation_reasoning`
> Skill version: `2.0.4`

## Goal

Draft a compensation reasoning note for a human adjuster. **You do not
authorize compensation.** You produce a draft that the adjuster will
review, edit if needed, and approve.

## Inputs

- The classified `category` (output of `classify_claim`).
- The `policy_summary` retrieved via `lookup_policy`.
- The relevant fields from `get_claim_details`.

## Output

A JSON object:

```json
{
  "draft": "<plain-language note, 80-200 words, marked DRAFT>",
  "amount_band": "<one of: low, medium, high, requires_specialist>",
  "policy_sections_cited": ["<section_name>", ...],
  "open_questions": ["<question for the adjuster>", ...]
}
```

`draft` MUST begin with the literal string `DRAFT — human approval
required.`.

## Constraints

- Cite policy sections by **name**, never quote raw text.
- Express the amount as a **band**, never a precise figure. The
  adjuster sets the figure.
- If the case has any feature the policy summary does not address,
  add an entry under `open_questions` rather than inventing a basis.
