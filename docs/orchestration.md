# Workflows and multi-agent systems

> Introduced in **v0.2** by
> [RFC 0009](../rfcs/0009-workflows-and-multi-agent-systems.md).
> Status: experimental, like everything in v0.x.

A genome describes **one agent**. Two more manifests describe how agents
are put to work:

| Artifact | File | Schema | Question it answers |
|----------|------|--------|---------------------|
| Workflow | `workflow.yaml` | [`schemas/v0.2/workflow.schema.json`](../schemas/v0.2/workflow.schema.json) | What happens, in what order, under which guards? |
| System   | `system.yaml`   | [`schemas/v0.2/system.schema.json`](../schemas/v0.2/system.schema.json)     | Who exists, who may talk to whom, what may never happen? |

Both are design declarations: hashed canonically (RFC 0002), attestable
(RFC 0008), and free of runtime state (RFC 0006 — only schemas are
referenced).

## Workflows

A workflow is a list of `steps` forming a DAG via `depends_on`. Six step
types cover the shapes seen in real claim, support, and back-office
pipelines:

- `agent` — invoke an Agenomic agent, optionally a single `skill`;
- `tool` — a deterministic tool or function call (the parts of a
  pipeline that deterministic replay can verify exactly);
- `human` — a human gate with a `role`, an `action`
  (approve/review/input/decide), an `sla`, and an escalation route;
- `wait` — suspend until external `signals` arrive (long-running,
  durable workflows);
- `workflow` — call a sub-workflow by path or URI;
- `loop` — repeat a `body` of steps `until` a condition holds, bounded
  by `max_iterations`.

Conditionality is uniform: any step may carry a `when` guard. Early human
exits, channel-dependent branches, and skip-on-condition all reduce to
guards, so there is no separate branch construct. Steps with identical
dependencies may run in parallel, so there is no separate parallel
construct either.

Failure handling is per step: `retry` (attempts/backoff), `timeout`,
and `on_error` (`fail` | `continue` | `escalate`).

See
[`examples/guest-claims-pipeline/workflow.yaml`](../examples/guest-claims-pipeline/workflow.yaml)
for a complete five-stage LLM pipeline with deterministic routing and an
early human exit.

## Systems

A system binds **roles** to member agents and declares the topology
connecting them:

- `agents[]` — `role` + `agent://` id, optional `genome` reference,
  optional per-member `autonomy` envelope
  (`allowed_actions`/`forbidden_actions`);
- `orchestration` — a `style` (`pipeline`, `graph`, `supervisor`,
  `swarm`, `custom`), optional conditional `edges` (with `END` as the
  terminal vertex), and a non-normative `engine` hint (`temporal`,
  `langgraph`, `crewai`, …);
- `shared_state`, `signals` — what members exchange;
- `workflows[]` — workflow manifests owned by the system;
- `communication_guardrails`, `escalation_rules`,
  `forbidden_autonomy` — the governance envelope. `forbidden_autonomy`
  overrides every member's `allowed_actions`.

See
[`examples/claims-orchestra/system.yaml`](../examples/claims-orchestra/system.yaml)
for a complete multi-agent claims platform with an expertise gate.

## Genome v0.2

The v0.2 genome adds optional orchestration-facing fields to the agent
itself: `triggers`, `autonomy`, `guardrails`, `escalation_rules`, and
`collaboration` (`member_of`, `hand_off_to`, `accepts_handoffs_from`).
A valid v0.1 genome becomes a valid v0.2 genome by changing only its
`spec_version`.

## Choosing between them

- One agent, several model calls in sequence inside one process — you
  probably need **neither**; skills already describe capabilities.
- Fixed staged pipeline, mixed LLM/deterministic steps, human exits —
  a **workflow**.
- Several independently released agents, signals, durable execution,
  system-wide forbidden actions — a **system**, owning one or more
  workflows.

## Validation beyond schemas

Conformant validators must additionally check (RFC 0009): unique step
ids, resolvable `depends_on` targets, unique member roles, edges and
entrypoints referencing declared roles, and `workflows[].path` entries
that exist and validate. Warnings cover unreachable steps, shadowed
`allowed_actions`, and unused signals.
