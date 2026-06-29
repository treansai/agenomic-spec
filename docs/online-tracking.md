# Online Tracking

Online Tracking is real-time monitoring for **production** AI agents. Where
replay validates an agent *before* release against a stored corpus, online
tracking watches a *running* agent and raises alerts the moment its behaviour
diverges from the expected genome, replay baseline, behavior contract,
policies, or workflow constraints.

It detects:

1. **Agent drift** — prompt, model/config, tool-permission, policy, memory
   schema, workflow topology, output, intent, and tool-usage drift.
2. **Agent loops** — repeated tool/model calls, no-progress loops, cyclic
   workflows, runaway iterations or durations.
3. **Agent intent shifts** — forbidden, unclear, or off-objective intent.
4. **Runtime harness violations** — missing approval gates, unsafe tool
   access, forbidden memory writes, unexpected transitions, exceeded autonomy.
5. **Policy, security, and behavior-contract violations.**

Online tracking is usable from the **CLI**, the **Python/TypeScript SDKs**, and
**Agenomic Cloud**, and it reuses the existing Agenomic primitives rather than
inventing a parallel stack.

## Concepts

| Concept | Schema | Notes |
|---|---|---|
| Tracking session | [`tracking-session.schema.json`](../schemas/v0.3/tracking-session.schema.json) | Binds an agent release/genome to a live event stream + the alerts raised against it. Open until `status` leaves `active`. |
| Tracking event | [`tracking-event.schema.json`](../schemas/v0.3/tracking-event.schema.json) | A single live runtime event. A production-time projection of the canonical trace / ATEP event model. |
| Tracking report | [`tracking-report.schema.json`](../schemas/v0.3/tracking-report.schema.json) | The exportable, content-hashed roll-up — the tracking analogue of the replay report. |

### Session lifecycle

```text
active ──▶ completed        (stop --status completed)
      ├──▶ failed           (the agent failed / harness blocked)
      └──▶ cancelled        (operator cancelled)
```

A session carries `session_id`, `agent_id` (and/or `bundle_id`), `genome_hash`,
`release_id`, `environment`, `started_at`/`ended_at`, `status`,
`tracking_config`, a `baseline` reference, rolling `summary` metrics, and the
`alerts` generated so far.

## Event model

Tracking events deliberately reuse the canonical run-trace (RFC 0010) and ATEP
(RFC 0003) vocabularies. The `type` is a superset of the v0.3 event-type
registry plus tracking-native detector events:

```text
agent.started        agent.step.started     agent.step.completed
model.call.started   model.call.completed   tool.call.started
tool.call.completed  memory.read            memory.write
policy.evaluated     intent.detected        loop.detected
drift.detected       harness.violation      alert.created
agent.completed      agent.failed
```

Each event carries an `event_id`, `session_id`, `timestamp`, monotonic
`sequence_number`, optional `parent_event_id`, the producing `agent_id`,
optional `genome_hash` / `workflow_step_id`, optional `tool`/`model` metadata,
content `input_hash`/`output_hash`, an optional small `redacted_preview`,
optional `policy_result`, and — mirroring ATEP — a
`prev_event_hash`/`event_hash` hash-link plus an optional detached `signature`
over the `event_hash`.

```json
{
  "spec_version": "agenomic/v0.3",
  "event_id": "01J000000000000000000EVENT",
  "session_id": "01J000000000000000000SESSN",
  "timestamp": "2026-06-29T00:00:00Z",
  "sequence_number": 7,
  "type": "tool.call.completed",
  "agent_id": "agent://treans/claims-agent",
  "tool": { "name": "shell.exec", "protocol": "local" },
  "input_hash": "blake3:0000000000000000000000000000000000000000000000000000000000000000",
  "prev_event_hash": "blake3:1111111111111111111111111111111111111111111111111111111111111111",
  "event_hash": "blake3:2222222222222222222222222222222222222222222222222222222222222222"
}
```

`event_hash = "blake3:" + hex(BLAKE3(DOMAIN || canonical_json(event ∖ {event_hash, signature}) || prev_event_hash))`.
The hash excludes the signature so a detached signature can be applied over a
stable digest — exactly the ATEP `causal_hash` design. Re-ingesting an event
with an `event_id` already seen is a **no-op**, so producers can retry safely.

## Alerts

Every detector emits a uniform alert with three-level severity (`info`,
`warning`, `critical`):

```json
{
  "alert_id": "01J0000000000000000ALERT1",
  "session_id": "01J000000000000000000SESSN",
  "kind": "drift",
  "severity": "critical",
  "created_at": "2026-06-29T00:00:02Z",
  "title": "Drift detected: tool_permission",
  "message": "Tool 'shell.exec' is not in the baseline's permitted tool set.",
  "evidence_event_ids": ["01J000000000000000000EVENT"],
  "recommended_action": "Compare the running release against the baseline; roll back if unintended.",
  "blocks_release": true,
  "requires_human_review": true,
  "details": { "drift_type": "tool_permission", "mode": "deterministic" }
}
```

`kind ∈ {drift, loop, intent, harness, policy, security}`. `details` carries
kind-specific evidence: `drift_type` + `mode` for drift; `loop_type` + `count`
for loops; `intent_issue` + `expected_intent`/`observed_intent` + `confidence`
for intent.

### Determinism first

Drift, loop, and intent detection are **deterministic by default** — hashes,
schema IDs, config changes, tool names, policy IDs, workflow steps. Semantic
classification (behavioral drift, LLM-based intent inference) is isolated
behind provider interfaces and the system works fully without it.

## CLI

```sh
# Start a session for a release; the genome + lockfile seed the drift baseline.
agenomic track start ./my-agent --release release_123 --env production

# Stream runtime events in (idempotent; safe to retry). `-` reads stdin.
agenomic track event --session <id> --file event.json

# Inspect.
agenomic track tail   --session <id>
agenomic track status --session <id>

# Export the JSON report (exit code 7 when the session fails).
agenomic track report --session <id> --output tracking-report.json

# Finalize: run the harness, mark terminal, persist the report.
agenomic track stop --session <id>
```

All commands accept `--format json|json-pretty|yaml` for automation and write
to a local store (`<cwd>/.agenomic/tracking` by default, override with
`--store`). Offline by default; cloud mode is used when you are logged in.
A custom `tracking_config` (loop bounds, forbidden intents, drift toggles) can
be supplied with `--config tracking.yaml`:

```yaml
loops:
  max_same_tool_calls: 3
  max_iterations: 50
  max_duration_seconds: 1800
  no_progress_window: 5
intent:
  allowed_intents: [classify_claim, verify_claim_validity]
  forbidden_intents: [exfiltrate_data]
drift:
  deterministic: true
  behavioral: false      # requires a semantic provider
fail_on: critical
```

## SDK

### Python

```python
from agenomic import Client

client = Client(api_key="...")                      # or Client() for local mode
session = client.tracking.start(
    agent="agent://treans/claims-agent",
    release_id="release_123",
    environment="production",
)

with session.step("classify_claim"):
    session.model_call(provider="openai", model="gpt-4o", input_hash="blake3:…")
    session.tool_call(tool="classify_claim", input_hash="blake3:…", output_hash="blake3:…")
    session.intent("verify_claim_validity")
    session.memory_write(schema_version="1.0.0")

for alert in session.alerts:
    print(alert.severity, alert.title)

session.stop()
report = session.report()        # TrackingReport (JSON-serializable)
```

### TypeScript

```ts
const client = new AgenomicClient({ apiKey: process.env.AGENOMIC_API_KEY });

const session = await client.tracking.start({
  agent: "agent://treans/claims-agent",
  releaseId: "release_123",
  environment: "production",
});

await session.event({
  type: "tool.call.completed",
  toolName: "claims_db.lookup",
  inputHash: "blake3:…",
  outputHash: "blake3:…",
});

await session.stop();
const report = await session.report();
```

In **local mode** the SDKs write a session directory (`session.json`,
`events.jsonl`) identical to the CLI's store; in **cloud mode** they POST to the
tracking API. There is no silent fallback from cloud to local: a misconfigured
cloud client raises rather than degrading to insecure local writes.

## The runtime harness

`stop`/`report` run the harness over the recorded session. It reuses
`agenomic-contract` (behavior-contract evaluation) and `agenomic-policy` (Rego
decisions), folds in the drift/loop/intent findings, and adds harness-specific
checks (missing human-approval gates, runtime policy denials). It produces a
pass/fail result with per-check evidence, and the report's `final_status` is
`fail` when any critical alert fired or a hard check failed, `warn` on
warnings, else `pass`.

## Report

The report is JSON first and content-addressed:

```json
{
  "report_version": "agenomic.track/v0.1",
  "session_id": "01J…",
  "agent_id": "agent://treans/claims-agent",
  "environment": "production",
  "status": "completed",
  "event_count": 12,
  "alert_counts": { "info": 0, "warning": 2, "critical": 1 },
  "alerts_by_kind": { "drift": 1, "loop": 1, "intent": 1, "harness": 0, "policy": 0, "security": 0 },
  "drift_findings": [ … ],
  "loop_findings": [ … ],
  "intent_findings": [ … ],
  "harness": { "passed": false, "checks": [ … ] },
  "recommendations": [ … ],
  "final_status": "fail",
  "report_hash": "blake3:…"
}
```

`report_hash` is BLAKE3 over the canonical report (excluding the hash itself),
so a report can be pinned in an attestation exactly like a replay report.

## Security & privacy

Online tracking is production-facing and follows the same discipline as the
rest of Agenomic:

- **Redacted previews only.** Events carry content `*_hash` values and small
  `redacted_preview` fields, never raw inputs/outputs.
- **Deterministic hashing.** Inputs/outputs are content-addressed (BLAKE3 /
  SHA-256), and the event chain is tamper-evident via `prev_event_hash`.
- **Tenant isolation.** Cloud sessions are scoped to the authenticated org;
  events are validated against the schemas above before storage.
- **Idempotency.** Ingestion deduplicates on `event_id`, so retries cannot
  corrupt the chain or double-count alerts.
- **Safe failure.** Missing/invalid signatures are surfaced, not ignored, and
  there is no silent fallback from secure cloud mode to local writes.

## How it relates to the rest of Agenomic

- **Agent genomes / lockfiles** — the *expected* behaviour. The drift baseline
  (permitted tools, model, policies, memory schema, workflow steps) is derived
  from the bundle's `genome.yaml` / `agent.lock.yaml`.
- **Replay** — pre-release validation against a stored corpus. Online tracking
  is its runtime sibling: a replay report can be the baseline a session is
  tracked against, and both share the contract/policy evaluators and severity
  scale.
- **ATEP** — the signed, hash-linked event history. Tracking events reuse the
  ATEP causal-hash and signature design so a session's event log is auditable.
- **Behavior contracts & policies** — the harness evaluates live events against
  the same contract and Rego policies used at replay time.
- **Release attestations** — a tracking report is content-hashed and can be
  pinned in an attestation, giving a release a runtime-evidence trail alongside
  its replay and bundle hashes.
