# claims-orchestra — a multi-agent system bundle

Synthetic example of a **system bundle** (RFC 0009): a multi-agent
claims platform described by `system.yaml`, with one owned workflow
(`workflows/claim-lifecycle.yaml`) and a shared state schema
(`state/state.schema.yaml`).

It is modeled on a production pattern: about ten specialized agents
(intake, document, completeness, coverage, triage, liability, decision,
settlement, communication) composed by a durable workflow engine, with:

- a **prequalification loop** — request missing documents, suspend on the
  `documents_received` signal, re-score completeness;
- an **expertise gate** — automated analysis stops at triage when an
  expert is required and resumes on `expert_report_received`;
- a **human decision gate** — no refusal, payment, or claim closure ever
  happens autonomously (`forbidden_autonomy`);
- per-member **autonomy envelopes** and system-wide
  **communication guardrails** and **escalation rules**.

Everything here is synthetic and vendor-neutral. The `engine` field is a
non-normative hint; the same manifests could describe an equivalent
LangGraph, CrewAI, or custom orchestration.

## Files

| File | Validated by |
|------|--------------|
| `system.yaml` | `schemas/v0.2/system.schema.json` |
| `workflows/claim-lifecycle.yaml` | `schemas/v0.2/workflow.schema.json` |
| `state/state.schema.yaml` | YAML-parse only (design state schema, RFC 0006) |
