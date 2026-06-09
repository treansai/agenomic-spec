# guest-claims-pipeline — a staged LLM workflow

Synthetic example of a **workflow manifest** (RFC 0009) describing a
five-stage complaint-handling pipeline:

1. `extraction` — LLM agent extracts claimant, language, and issues;
2. `categorization` — LLM agent assigns one of twelve categories;
3. `routing` — **deterministic** tool step applies routing and
   compensation rules, and may flag the case for a human;
4. `generate_customer_message` / `generate_partner_message` — guarded
   LLM steps; the partner message exists only on the indirect flow;
5. `validation` — LLM agent scores and auto-corrects the drafts.

Two things make this shape worth declaring:

- **early human exit** — when routing sets `requires_human`, the
  `human_review` gate runs and every generation step is skipped via its
  `when` guard;
- **mixed determinism** — the routing step is a plain function, so
  deterministic-offline replay (RFC 0005) can verify it exactly while the
  LLM steps are replayed statistically.

Everything here is synthetic and vendor-neutral.

## Files

| File | Validated by |
|------|--------------|
| `workflow.yaml` | `schemas/v0.2/workflow.schema.json` |
| `state/state.schema.yaml` | YAML-parse only (design state schema, RFC 0006) |
