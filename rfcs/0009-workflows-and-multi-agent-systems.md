# RFC 0009: Workflows and Multi-Agent Systems

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Draft                                                       |
| Created      | 2026-06-09                                                  |
| Author(s)    | Agenomic maintainers \<spec@agenomic.dev\>                |
| Spec version | v0.2                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0002, RFC 0003, RFC 0006                      |

## Summary

This RFC extends Agenomic beyond the single agent. It introduces two new
manifest kinds under `schemas/v0.2/`:

- **`workflow.yaml`** (`workflow.schema.json`) — a declarative description
  of a workflow: an ordered, possibly branching, possibly long-running
  composition of agent calls, deterministic tool steps, human gates,
  signal waits, loops, and sub-workflows.
- **`system.yaml`** (`system.schema.json`) — a declarative description of
  a multi-agent system: the member agents, the orchestration topology that
  connects them, the shared state and signals they exchange, and the
  system-wide autonomy, guardrail, and escalation envelope.

It also publishes a **v0.2 genome** (`genome.schema.json`) that adds
optional orchestration-facing fields to the agent genome: `triggers`,
`autonomy`, `guardrails`, `escalation_rules`, and `collaboration`.

All three artifacts reuse the bundle conventions of RFC 0001, the
canonical hashing of RFC 0002, and the design/runtime split of RFC 0006.

## Motivation

v0.1 describes one agent at a time. Production systems are rarely one
agent. Two recurring shapes, drawn from real claims-processing systems,
motivate this RFC:

**Shape 1 — the staged LLM pipeline.** A customer-claims service runs a
fixed five-step pipeline: LLM extraction → LLM categorization →
deterministic routing and compensation rules → conditional LLM response
generation (one or two messages depending on the distribution channel) →
LLM validation with auto-correction. The pipeline exits early to a human
queue when routing decides the case needs review. Today none of that is
declarable: the genome can describe each model call's *capability*, but
not the order, the guard conditions, the deterministic steps between LLM
calls, or the early human exit.

**Shape 2 — the orchestrated multi-agent platform.** An insurance claims
platform runs about a dozen specialized agents (intake, document,
completeness, coverage, triage, liability, decision, settlement,
communication, …), each its own graph, composed by a durable workflow
engine. The composition has conditional edges (an *expertise gate* stops
automated analysis until a human expert's report arrives as a signal),
loops (request missing documents, wait, re-score completeness), per-agent
allowed-action lists, system-wide forbidden actions (never send a refusal
letter autonomously, never trigger a payment), communication guardrails,
and an escalation table (bodily injury → senior handler, suspected fraud
→ fraud team).

Without a manifest for these shapes:

- the *behavioral identity* of the composition is unversioned — two
  releases can wire the same agents differently and hash identically;
- governance reviews the parts but never the whole: who may hand off to
  whom, where humans gate the flow, what the system as a whole must never
  do;
- replay and attestation stop at the single-agent boundary, although most
  incidents in composed systems are routing and hand-off incidents.

Git has the same blind spot for orchestration that it has for agents:
the code that wires agents together changes behavior without changing
any single agent's bundle.

## Detailed design

### New artifact: `workflow.yaml`

Validated by
[`schemas/v0.2/workflow.schema.json`](../schemas/v0.2/workflow.schema.json).

Top-level fields:

| Field              | Req. | Meaning                                                |
|--------------------|------|--------------------------------------------------------|
| `spec_version`     | yes  | `agenomic/v0.2`                                        |
| `workflow`         | yes  | Identity: `id` (`workflow://<org>/<name>`), `name`, `domain`, `criticality`, optional `version`, `description` |
| `steps`            | yes  | The step list (see below)                              |
| `engine`           | no   | Non-normative runtime hint (`temporal`, `langgraph`, `crewai`, `custom`, …) |
| `triggers`         | no   | How a run starts: `api`, `event`, `schedule`, `signal`, `manual` |
| `inputs`/`outputs` | no   | Declared workflow I/O fields                           |
| `state`            | no   | Reference to the shared context **schema** (never data; RFC 0006) |
| `signals`          | no   | Signals a running instance can receive                 |
| `escalation_rules` | no   | `condition` → `route` table                            |
| `labels`           | no   | Free-form string labels                                |

#### Steps

A step has a unique `id` and one of six `type`s:

| Type       | Meaning                                  | Type-specific required field |
|------------|------------------------------------------|------------------------------|
| `agent`    | Invoke an Agenomic agent (optionally one `skill`) | `agent` (an `agent://` ref) |
| `tool`     | Deterministic tool/function call          | `tool` (`name` + optional `protocol`/`server`/`version`) |
| `human`    | Human gate                                | `gate` (`role`, `action`, optional `sla`, `on_timeout`, `escalation_route`) |
| `wait`     | Suspend until external signal(s)          | `wait_for` (`signals`, optional `mode`, `timeout`, `on_timeout`) |
| `workflow` | Invoke a sub-workflow                     | `uses` (path or URI of the sub-manifest) |
| `loop`     | Repeat a body of steps until a condition  | `body` (nested steps) and `until` |

Common optional step fields: `depends_on` (DAG edges), `when` (guard
expression; a false guard skips the step — this is how conditional
routing and early exit are expressed), `inputs`/`outputs` (state fields
read/written), `retry` (`max_attempts`, `backoff`, `initial_interval`),
`timeout`, `on_error` (`fail` | `continue` | `escalate`).

Execution order is the DAG induced by `depends_on`. Steps whose
dependencies are identical MAY run in parallel; a separate `parallel`
construct is deliberately not introduced. Durations are plain literals
(`30s`, `15m`, `2h`, `90d`).

`when` and `until` expressions are **opaque strings** in v0.2. They are
hashed and diffed like any other field, but their evaluation semantics
are runtime-defined. Standardizing an expression grammar is an open
question below.

#### Worked example (Shape 1, abbreviated)

```yaml
spec_version: agenomic/v0.2
workflow:
  id: workflow://acme/guest-claims-pipeline
  name: Guest Claims Pipeline
  domain: claims
  criticality: regulated_customer_facing
steps:
  - id: extraction
    type: agent
    agent: agent://acme/claims-extractor
  - id: categorization
    type: agent
    agent: agent://acme/claims-categorizer
    depends_on: [extraction]
  - id: routing
    type: tool
    tool: { name: compensation_rules, protocol: local }
    depends_on: [categorization]
    outputs: [flow_type, requires_human]
  - id: human_review
    type: human
    gate: { role: claims_handler, action: review }
    depends_on: [routing]
    when: "requires_human == true"
  - id: generation
    type: agent
    agent: agent://acme/claims-responder
    depends_on: [routing]
    when: "requires_human == false"
```

### New artifact: `system.yaml`

Validated by
[`schemas/v0.2/system.schema.json`](../schemas/v0.2/system.schema.json).

Top-level fields:

| Field                      | Req. | Meaning                                        |
|----------------------------|------|------------------------------------------------|
| `spec_version`             | yes  | `agenomic/v0.2`                                |
| `system`                   | yes  | Identity: `id` (`system://<org>/<name>`), `name`, `domain`, `criticality`, optional `version`, `description` |
| `agents`                   | yes  | Member list: `role` (system-local, unique), `id` (`agent://` ref), optional `genome` path/URI, optional per-member `autonomy` (`allowed_actions`, `forbidden_actions`) |
| `orchestration`            | yes  | `style` ∈ `pipeline` \| `graph` \| `supervisor` \| `swarm` \| `custom`; optional `engine` hint, `entrypoint`, `supervisor`, `edges` (`from`/`to`/`when`, with `END` as the reserved terminal vertex) |
| `shared_state`             | no   | Reference to the shared state **schema** (RFC 0006) |
| `signals`                  | no   | Signals the system can receive while running   |
| `workflows`                | no   | Workflow manifests owned by the system (`id` + bundle-relative `path`) |
| `communication_guardrails` | no   | Named guardrails for all outward communication |
| `escalation_rules`         | no   | System-wide `condition` → `route` table        |
| `forbidden_autonomy`       | no   | Actions **no member** may take autonomously, overriding per-member `allowed_actions` |
| `labels`                   | no   | Free-form string labels                        |

The orchestration `style` values cover the topologies observed in
practice: linear pipelines, explicit conditional graphs, supervisor
routing, free-form peer hand-offs (swarm), and an explicit escape hatch
(`custom`). The `engine` field is a **hint**, never a requirement: a
conformant validator MUST accept a system manifest regardless of which
runtime executes it.

Precedence rule for autonomy: an action listed in the system's
`forbidden_autonomy` is forbidden for every member, even if that member's
`autonomy.allowed_actions` lists it. Validators SHOULD warn on such
shadowed entries.

#### Worked example (Shape 2, abbreviated)

```yaml
spec_version: agenomic/v0.2
system:
  id: system://acme/claims-orchestra
  name: Claims Orchestra
  domain: claims
  criticality: regulated_customer_facing
agents:
  - { role: intake,    id: agent://acme/claims-intake }
  - { role: coverage,  id: agent://acme/claims-coverage }
  - { role: triage,    id: agent://acme/claims-triage }
  - { role: decision,  id: agent://acme/claims-decision }
orchestration:
  style: graph
  engine: { kind: temporal }
  entrypoint: intake
  edges:
    - { from: intake,   to: coverage }
    - { from: coverage, to: triage }
    - { from: triage,   to: decision, when: "expertise_required == false" }
    - { from: triage,   to: END,      when: "expertise_required == true" }
signals:
  - { name: expert_report_received }
forbidden_autonomy:
  - send_refusal_letter
  - trigger_payment
```

### Genome v0.2 additions

[`schemas/v0.2/genome.schema.json`](../schemas/v0.2/genome.schema.json)
is the v0.1 genome plus five **optional** fields:

- `triggers` — how the agent is invoked (`api`, `event`, `schedule`,
  `signal`, `manual`);
- `autonomy` — `allowed_actions` / `forbidden_actions` envelope;
- `guardrails` — named output guardrails (e.g. `formal_address`,
  `no_payment_commitment`), resolved by policies and behavior contracts;
- `escalation_rules` — `condition` → `route` table;
- `collaboration` — `member_of` (`system://` refs), `hand_off_to`,
  `accepts_handoffs_from` (`agent://` refs).

A valid v0.1 genome becomes a valid v0.2 genome by changing only its
`spec_version`.

### Bundle layout

Two deployment shapes are supported.

**Embedded** — a workflow that belongs to one agent ships inside that
agent's bundle (RFC 0001 layout unchanged, one optional entry):

```text
<bundle-root>/
├── genome.yaml
├── …
└── workflows/
    └── <workflow_id>.yaml
```

**System bundle** — a multi-agent system is its own bundle:

```text
<system-bundle-root>/
├── system.yaml                  (required)
├── workflows/
│   └── <workflow_id>.yaml       (one per entry in system.workflows)
├── state/
│   └── state.schema.yaml        (required if shared_state.schema_path is set)
└── attestations/
    └── <release_id>.json        (zero or more)
```

Member genomes are **referenced, not embedded** (`agents[].genome` is a
path or URI). This keeps each agent's release lifecycle independent and
mirrors how lockfiles pin tools rather than vendoring them.

### Hashing, lockfiles, ATEP, replay

- **Hashing.** `system.yaml`, `workflows/**`, and `state/**` are ordinary
  bundle files; the canonical Merkle hash of RFC 0002 covers them with no
  algorithm change. A system release therefore has a stable
  `bundle_logical_hash` exactly like an agent release.
- **Lockfile.** A future `system.lock.yaml` pinning each member's
  resolved `bundle_logical_hash` is deferred (open question). Until then,
  attestations of a system SHOULD enumerate member bundle hashes in their
  payload.
- **ATEP.** Hand-offs, signal receipts, human gate decisions, and
  escalations are *interaction* and *governance* events; RFC 0003 streams
  carry them unchanged. The `agent_id` URN slot of an ATEP event MAY
  carry a `system://` or `workflow://` identifier when the subject is a
  composition rather than a single agent. A dedicated `orchestration`
  stream is deferred until event volume justifies it.
- **Replay.** Deterministic-offline replay (RFC 0005) of a workflow
  replays cached step outputs to verify routing: with the same step
  outputs, do `when` guards route the same way? Statistical replay
  re-invokes member agents per their own contracts. Workflow-level
  behavior contracts (e.g. "no path reaches `trigger_payment` without
  passing a `human` step") are deferred to a follow-up RFC.

### Validation rules

Beyond JSON Schema, conformant validators MUST check:

1. step `id`s are unique within a workflow (including loop bodies);
2. every `depends_on` entry names an existing step at the same nesting
   level;
3. member `role`s are unique within a system;
4. every `edges[].from`/`edges[].to` and `entrypoint`/`supervisor` names
   a declared role (`to: END` allowed);
5. every `workflows[].path` exists in the bundle and validates against
   `workflow.schema.json`.

Validators SHOULD warn when: a step is unreachable from the DAG roots, a
member's `allowed_actions` is shadowed by system `forbidden_autonomy`, or
a declared signal is never referenced by a `wait` step or trigger.

## Alternatives considered

**Extend the genome with a `workflow:`/`agents:` section instead of new
artifacts.** Rejected: it conflates units with different release
lifecycles. A system re-wires more often than its members change, and a
member is promoted independently of the systems using it. Separate
manifests give each its own hash, diff, and attestation — the entire
point of Agenomic.

**Adopt an existing workflow language (BPMN, Serverless Workflow, Argo,
Step Functions).** Rejected for v0.2. These languages are
execution-oriented and runtime-coupled; Agenomic needs a
*governance-oriented* description: who may act, where humans gate, what
is forbidden — concerns those languages do not model. They also lack the
agent/skill/criticality vocabulary of the genome. The `engine` hint keeps
the bridge open: a bundle can carry both an Agenomic workflow manifest
and a runtime-native definition.

**Model multi-agent systems purely as edges in each genome
(`collaboration` only, no `system.yaml`).** Rejected as the only
mechanism: pairwise declarations cannot express system-wide invariants
(`forbidden_autonomy`, shared guardrails, one escalation table) and the
topology would be scattered across N bundles with no single hashable
identity. The genome `collaboration` field is kept as a *complement* so
a single agent can declare its memberships.

**A single `composition.yaml` covering both workflows and systems.**
Rejected: the two answer different questions ("what happens in what
order" vs "who exists and who may talk to whom") and are versioned at
different cadences. Real deployments need either one without the other.

## Open questions

- Should v0.2 standardize a minimal expression grammar for
  `when`/`until` guards (e.g. a CEL subset), or stay opaque until ≥2
  implementations exist?
- `system.lock.yaml`: pin member genomes by `bundle_logical_hash` at
  system release time? Strawman shape exists but needs implementer
  feedback.
- Should workflow-level behavior contracts (path-reachability rules such
  as "no route to `trigger_payment` bypasses a human gate") extend
  `behavior-contract.schema.json` or be a new artifact?
- Does ATEP need a dedicated `orchestration` stream, or do the
  `interaction` and `governance` streams suffice at realistic event
  volumes?
- Cross-org systems: may `agents[].id` reference an agent owned by a
  different org than the system, and what does attestation mean then?

## Security considerations

- **Forgery and tamper-evidence.** Both new manifests are covered by the
  RFC 0002 Merkle hash and RFC 0008 attestations; re-wiring a system or
  re-routing a workflow changes the bundle hash and invalidates prior
  attestations. This *closes* a gap: today orchestration changes are
  invisible to attestation.
- **Privilege escalation via composition.** A low-criticality agent
  composed into a high-criticality system could gain reach. Mitigations:
  per-member `autonomy` envelopes, system `forbidden_autonomy` with the
  precedence rule above, and validators warning when a member genome's
  `criticality` is lower than the system's.
- **Confused-deputy hand-offs.** `collaboration.accepts_handoffs_from`
  lets an agent allowlist its callers; runtimes SHOULD enforce it.
- **Human gate bypass.** Gates are declared in the hashed manifest, so
  removing one is a visible, attestable diff — review processes can key
  on it.
- **Downgrade attacks.** A producer could keep shipping `agenomic/v0.1`
  genomes to avoid declaring autonomy fields. v0.1 remains valid by
  design; organizations that need the new envelope MUST require
  `agenomic/v0.2` at intake (CI policy), not rely on the spec.
- **Replay and freshness, key compromise.** Unchanged from RFC 0003 /
  RFC 0008; the new artifacts introduce no new signing surface.
- **Privacy / PII.** Workflow `state` and system `shared_state` reference
  **schemas only**; runtime state never enters the bundle (RFC 0006).
  Signal *payload schemas* are referenced, signal payloads are not.

## Compatibility

- **Additive.** No v0.1 schema, RFC, bundle, or fixture changes.
  `schemas/v0.1/` remains immutable per the versioning policy.
- **New schema directory.** This RFC introduces `schemas/v0.2/` with
  `genome.schema.json`, `workflow.schema.json`, and `system.schema.json`.
  Artifact kinds not redefined in v0.2 (lockfile, behavior contract,
  trace event, replay report, release attestation, ATEP event) continue
  to validate against their v0.1 schemas; v0.2 is an overlay, not a full
  re-publication.
- **Genome migration.** A valid v0.1 genome becomes a valid v0.2 genome
  by changing `spec_version` to `agenomic/v0.2`; all new fields are
  optional.
- **Tooling.** Validators select the schema directory from the document's
  `spec_version`. Tools that only understand v0.1 reject v0.2 documents
  cleanly on the `spec_version` const.

## References

- RFC 0001 — Agent Bundle Format (layout conventions reused here).
- RFC 0002 — Canonical Merkle Hashing (covers the new files unchanged).
- RFC 0003 — ATEP (event streams carrying orchestration events).
- RFC 0006 — Design vs Runtime Memory (schema-only state references).
- Temporal workflows — durable execution with signals,
  <https://docs.temporal.io/workflows>.
- LangGraph — graph orchestration with conditional edges,
  <https://langchain-ai.github.io/langgraph/>.
- CrewAI — role-based agent crews, <https://docs.crewai.com/>.
- Serverless Workflow specification (prior art, execution-oriented),
  <https://serverlessworkflow.io/>.
- BPMN 2.0 (prior art for human tasks and gateways),
  <https://www.omg.org/spec/BPMN/2.0/>.
