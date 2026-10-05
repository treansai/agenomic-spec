# RFC 0012: Coding Sessions

| Field        | Value                                      |
|--------------|--------------------------------------------|
| Status       | Draft                                      |
| Created      | 2026-10-05                                 |
| Author(s)    | Agenomic maintainers <spec@agenomic.dev>   |
| Spec version | v0.3                                       |
| Supersedes   | —                                          |
| Related      | RFC 0003, RFC 0004, RFC 0010, RFC 0011     |

## Summary

RFC 0012 defines the portable artifacts Agenomic uses to supervise
**coding agents** such as Claude Code and Codex: a session object, an
event envelope (`agenomic.coding.event/v1`), a runtime capability
manifest, and a classified, decided coding action. Together they let a
governance layer observe, shadow-evaluate or enforce policy on a coding
agent's tool calls **without replacing the agent's own loop**. The RFC
fixes the semantics a conforming producer and consumer MUST share:
observed vs controllable vs imported sessions, governance modes that are
never silently downgraded, ordered at-least-once events whose request,
decision, start and result are distinct facts, validated capabilities in
which `unknown` never counts as protected, a closed action vocabulary,
a command lifecycle, approval binding, and metadata-only privacy
defaults. Schemas:

- [`schemas/v0.3/coding-session.schema.json`](../schemas/v0.3/coding-session.schema.json)
- [`schemas/v0.3/coding-event.schema.json`](../schemas/v0.3/coding-event.schema.json)
- [`schemas/v0.3/coding-capability-manifest.schema.json`](../schemas/v0.3/coding-capability-manifest.schema.json)
- [`schemas/v0.3/coding-action.schema.json`](../schemas/v0.3/coding-action.schema.json)

## Motivation

Coding agents now run shell commands, edit files, install dependencies,
push branches and call MCP servers on developer machines and CI runners.
Each runtime ships its own permission prompts, hooks and SDK, and each
evolves quickly. Organizations want one place to see what these agents
did, to require approval for risky actions, and to prove afterwards what
was allowed and what actually ran.

Two tempting designs fail:

- **Wrapping or re-implementing the agent loop.** A governance product
  that replaces the runtime's loop loses the runtime's features, breaks
  on every release, and makes the governance layer responsible for model
  behavior it does not own.
- **Logging only.** A log without a decision point cannot prevent a
  `git push --force`, and a log that does not distinguish "allowed" from
  "executed" overstates what is known.

Agenomic therefore acts as a **control plane** next to the runtime: it
classifies native tool calls into a stable vocabulary, answers a
decision at the runtime's own pre-tool or approval hook, records what
was observed afterwards, and says honestly which protections hold for a
given runtime version. Without a shared specification, every connector
would invent its own meaning for "protected", "approved" and
"executed", and evidence would not be comparable across runtimes.

## Detailed design

Key words MUST, SHOULD and MAY are to be read as in RFC 2119.

### Sessions: observed, controllable, imported

A coding session is one runtime session (native id
`runtime_session_id`) known to Agenomic. Its `origin` fixes its
`control` level; the schema enforces the pairing.

| `origin`          | `control`      | Meaning |
|-------------------|----------------|---------|
| `launched`        | `controllable` | Started by Agenomic through a connector. Agenomic may send commands (message, answer, interrupt, stop, resume) subject to the validated capability manifest. |
| `local_connected` | `observed`     | A developer's own terminal or IDE session reported by runtime hooks. Agenomic sees events and MAY answer pre-tool hooks (policy), but MUST NOT send conversational or lifecycle commands. |
| `imported`        | `imported`     | A historical transcript. Never controllable; consumers MUST NOT display a control affordance for it. |

The same native session MUST NOT create two Agenomic sessions:
registration is idempotent on `(runner_id, runtime, runtime_session_id)`.

`status` is one of `requested`, `starting`, `running`, `idle`,
`waiting_approval`, `waiting_input`, `interrupting`, `stopping`,
`stopped`, `failed`, `lost`. `lost` means no heartbeat arrived within
the lease: the process **may still be running**, and consumers MUST NOT
present `lost` as `stopped`.

### Governance modes

`mode_requested` is `observe`, `shadow` or `enforce`:

- `observe` — events are recorded; every decision is `defer` (the
  runtime's native permission flow decides).
- `shadow` — policy is evaluated and the decision that `enforce` would
  have produced is recorded in `would_have_been`, but the answer to the
  runtime is `defer`.
- `enforce` — the policy decision (`allow`, `deny`, `pending`) is
  returned to the runtime's hook and is binding.

`mode_effective` is what actually holds: one of the three modes, `none`
(not yet connected) or `blocked`. If a prerequisite of the requested
mode fails (missing capability, unreleased policy, runtime version
without pre-tool control), the session MUST become `blocked` and refuse
actions. A producer MUST NOT silently lower `mode_effective` below
`mode_requested`; the session schema rejects `mode_requested: enforce`
with `mode_effective: observe` (and likewise for `shadow`). Lowering a
mode is a new, explicit request by a user, recorded as such.

`protection.protected` lists the tool ids that are actually gated in
this session; `protection.not_covered` lists those that are not;
`limitations` carries human-readable caveats. A consumer showing a
"protected" badge MUST derive it from these fields, never from
`mode_requested`.

### Event envelope

Every event is an `agenomic.coding.event/v1` envelope:

```json
{
  "event_id": "01K6Y9A1B2C3D4E5F6G7H8J9K1",
  "schema_version": "agenomic.coding.event/v1",
  "type": "tool.requested",
  "source": "runtime",
  "trust": "native",
  "producer_epoch": "01K6Y8Z5Q3M2N4P6R8T0V2W4X6",
  "producer_seq": 17,
  "occurred_at": "2026-10-05T09:02:11.204Z",
  "runtime_turn_id": "turn-0003",
  "action_id": "0b8f3c2e-5d41-4a7b-9c1e-2f6a8d9e0b13",
  "attempt_id": "1",
  "payload": { "native_tool": "Bash", "tool_id": "coding.shell.exec" }
}
```

The top level is closed (`additionalProperties: false`); type-specific
data lives in `payload`.

**Source and trust.** `source` names the producing component:
`runtime` (the agent's own hook or SDK message), `adapter` (the
connector's translation of native signals), `gateway` (Agenomic
decisions and approvals), `supervisor` (process spawn, exit, heartbeat)
or `filesystem` (workspace observation). `trust` states how the fact is
known: `native` (reported by a documented runtime interface), `derived`
(computed by the adapter from native signals) or `observed` (inferred
from outside the runtime: process table, filesystem, git). Consumers
MUST NOT promote `derived` or `observed` facts to `native`.

**Ordering.** Events are totally ordered **per source** by
`(producer_epoch, producer_seq)`. `producer_epoch` identifies one
producer lifetime (typically the connector boot ULID); `producer_seq`
is a non-negative integer, monotonic within the epoch, restarting when
the epoch changes. There is no global producer order across sources;
the ingestion cursor assigned by the receiver is the global read order.
`occurred_at` is informative and MUST NOT be used to reorder events of
one source.

**Delivery and deduplication.** Delivery is at-least-once. A receiver
MUST deduplicate on `(coding_session_id, event_id)` and on
`(coding_session_id, source, producer_epoch, producer_seq)`; a
duplicate is acknowledged, not stored twice.

**Event types.** `session.started`, `session.ended`, `turn.started`,
`turn.completed`, `turn.interrupted`, `message.user`,
`message.assistant`, `question.asked`, `question.answered`,
`tool.requested`, `tool.started`, `tool.completed`, `tool.failed`,
`approval.requested`, `approval.resolved`, `subagent.started`,
`subagent.stopped`, `file.changed`, `diff.snapshot`, `test.result`,
`config.changed`, `permission.changed`, `protection.state`, `usage`,
`error`. The list is closed in `v1`; new types require a new
`schema_version`.

**Distinct facts.** A tool call produces up to four distinct facts:
the **request** (`tool.requested`), the **decision** (the coding
action's `decision`, plus `approval.*` events), the **observed start**
(`tool.started`) and the **observed result** (`tool.completed` or
`tool.failed`). They are linked by `action_id` and `attempt_id`, and
MUST NOT be collapsed. In particular, **an `allow` is not proof of
execution**: the runtime may still abort, the user may cancel, or the
hook may never return. Evidence that an action ran requires an observed
start or result event; absent one, the action's `status` stays
`decided` or becomes `unknown`.

### Capability manifest

A connector reports, per runtime version, a capability manifest:

```json
{
  "runtime": "claude_code",
  "version": "2.1.289",
  "surfaces": ["sdk", "cli_hooks"],
  "capabilities": {
    "pre_tool_control": { "announced": "supported_tested", "validated": "supported_tested" },
    "subagent_tracking": { "announced": "partial", "validated": "unknown",
                           "detail": "Probe did not complete on this version." }
  }
}
```

Capability names form a closed set: `observe`, `converse`,
`remote_approval`, `pre_tool_control`, `interrupt_turn`,
`stop_process`, `resume`, `file_diffs`, `user_questions`,
`subagent_tracking`. Each carries two states drawn from
`supported_tested`, `partial`, `experimental`, `unsupported`,
`unknown`:

- `announced` — what the adapter claims for this runtime version;
- `validated` — what the connector established by probing the
  installed runtime.

Only `validated` may gate behavior. Commands that need a capability
(`send_message` → `converse`, `answer_question` → `user_questions`,
`interrupt_turn` → `interrupt_turn`, `stop_process` → `stop_process`,
`resume_session` → `resume`) MUST be refused when it is not validated.
**`unknown` never counts as protected**: a tool id whose gating depends
on a capability validated as `unknown`, `unsupported` or `experimental`
MUST be listed in `protection.not_covered`, and an `enforce` request
that depends on it MUST yield `blocked`.

### Action classification

The governance layer classifies each native tool call (for example
`Bash`, `Write`, `Edit`, `exec_command`, `apply_patch`,
`mcp__srv__tool`) into a coding action with a `tool_id` from a closed
vocabulary:

| `tool_id` | Covers |
|---|---|
| `coding.fs.read` | Reading files. |
| `coding.fs.write` | Creating or modifying files, including patches. |
| `coding.fs.delete` | Deleting files or directories. |
| `coding.shell.exec` | Running a shell command not covered by a more specific id. |
| `coding.shell.interactive_input` | Writing to an interactive process's stdin. |
| `coding.git.read` | `status`, `log`, `diff` and other read-only git. |
| `coding.git.commit` | Creating commits, branches, tags locally. |
| `coding.git.push` | Publishing refs to a remote. |
| `coding.git.destructive` | `reset --hard`, `clean -fd`, history rewrites, branch deletion. |
| `coding.dependency.install` | Package manager installs and updates. |
| `coding.network.fetch` | Fetching URLs or calling network endpoints. |
| `coding.mcp.call` | Calling an MCP server tool (RFC 0004). |
| `coding.agent_config.modify` | Changing the agent's own configuration, hooks, permissions or instructions. |
| `coding.subagent.spawn` | Starting a sub-agent. |
| `coding.web.search` | Runtime-provided web search. |
| `coding.unknown` | Anything the classifier cannot place. MUST NOT be treated as low risk by default. |

`risk` is `low`, `medium`, `high` or `critical`. `flags` explain the
classification: `outside_workspace`, `secret_path`, `symlink`,
`compound_shell`, `interpreter`, `network`, `lifecycle_scripts`,
`force_push`, `agent_config`. Implementations MAY add flags prefixed
with `x_`. A compound shell command (`a && b`, pipes, subshells) or an
interpreter invocation (`python -c`, `node -e`) SHOULD be classified by
its riskiest component.

The action records `decision` (`allow`, `deny`, `pending`, `defer`),
`effective_mode`, `would_have_been` (shadow), `reason`,
`reason_codes`, the approval link, and later the observed `status`
(`requested`, `decided`, `started`, `completed`, `failed`, `unknown`)
and `outcome`. The schema enforces that a `pending` decision references
an `approval_id` and that `observe` mode only ever answers `defer`.

### Command lifecycle

Commands flow from the control plane to a connector over an outbound
long poll. A command's `status` moves through:

```text
requested ──deliver──▶ received ──▶ applied
    │                      ├──────▶ refused
    │                      └──────▶ unknown
    └──past expires_at──▶ expired
```

- `received` is set when the command is handed to the connector, not
  when it takes effect.
- `refused` means the connector declined it (capability, state).
- `unknown` means the connector lost track: the effect **may or may
  not** have happened, and consumers MUST present it that way.
- A command past `expires_at` is never delivered; it becomes `expired`.

Commands are idempotent per session on `idempotency_key`; a replay
returns the stored command. Only the holder of a short controller lease
may issue commands to a session.

### Approval binding

An approval authorizes one **intent**, not one tool name. The intent is
bound by digest to:

- for a shell action: the command, the `cwd` and the permission context
  (sandbox, permission mode, network scope);
- for a file change: the patch digest, the set of paths and the
  `base_revision` of the workspace.

When the agent retries after approval with the same
`native_request_id` and `attempt`, the governance layer recomputes the
digest. Any significant change (different command, different patch,
different paths, moved base revision, widened permissions) is a **new
intent** and MUST be denied with `approval_invalid`. An approval is
consumed once: a second consume MUST answer `deny`.

### Privacy defaults

- **Metadata only by default.** Events carry identifiers, tool ids,
  digests, paths, timings and outcomes. Content fields (`text`,
  `command`, `diff`, `output`) appear only when the session's `capture`
  settings opt in, per category (`conversation`, `commands`, `diffs`,
  `outputs`).
- **Redact before export.** Producers MUST redact secrets and
  credentials on the machine, before an event leaves it. Receivers MUST
  NOT rely on server-side redaction alone.
- **Never hidden reasoning.** Producers MUST NOT export a model's hidden
  or encrypted reasoning, even when content capture is enabled.
- Workspaces are only those the developer declared; connectors MUST NOT
  discover repositories on their own.

## Alternatives considered

- **Reuse `tracking-event` (v0.3) for coding events.** Tracking events
  describe one production agent identified by `agent://` and a single
  `sequence_number`. Coding sessions have several independent producers
  (runtime, adapter, gateway, supervisor, filesystem) with their own
  lifetimes; a single sequence would require a coordinator on the
  developer's machine. A per-source `(producer_epoch, producer_seq)` is
  simpler and survives connector restarts.
- **Hash-chained events (RFC 0010).** Hash chains assume a single
  ordered writer. They can be layered later by the receiver over the
  ingestion order; requiring them of every producer now would add cost
  without stronger guarantees on an untrusted machine.
- **Open `tool_id` strings.** Free-form ids would make policies
  runtime-specific. A closed vocabulary with `coding.unknown` and
  `x_`-prefixed flags keeps policies portable while allowing extension.
- **Falling back to `observe` when `enforce` fails.** Convenient, but it
  turns a configuration failure into silent loss of protection. `blocked`
  makes the failure visible.
- **A single capability state.** Merging announced and validated hides
  the difference between a vendor claim and a tested installation, which
  is exactly what a reviewer needs to see.

## Open questions

- Should the event payload of each `type` get its own schema in `v1`,
  or remain open until runtimes stabilize?
- Should receivers hash-chain stored events (RFC 0010) and expose the
  chain in session evidence exports?
- How should a `lost` session that later reappears be reconciled with
  actions whose status became `unknown` meanwhile?
- Should `risk` be computed only by the governance layer, or may
  connectors propose a pre-classification?
- Is a `shadow` session allowed to escalate to `pending` approvals, or
  is `defer` always the answer in shadow?

## Security considerations

- **Forgery and tamper-evidence.** Events from a developer machine are
  only as trustworthy as that machine. `trust` makes the provenance
  explicit; decisions and approvals come from the `gateway` source and
  are authoritative there. Runner credentials are short-lived and
  rotated; reuse of a revoked refresh token revokes the family.
- **Downgrade attacks.** A compromised or misconfigured connector could
  report weaker capabilities to avoid enforcement. The no-silent-downgrade
  rule turns that into `blocked`, never into `observe`. `unknown` never
  counts as protected.
- **Replay and freshness.** Event deduplication prevents double
  counting; approvals are bound to a digest of the intent and consumed
  once; commands expire.
- **Key compromise / rotation impact.** Revoking a runner revokes its
  credentials and marks its active sessions `lost`; decisions already
  recorded remain valid evidence of what was decided, not of what ran.
- **Privacy / PII exposure.** Metadata-only defaults, per-category
  content opt-in, on-machine redaction and the hidden-reasoning
  prohibition bound what leaves the machine. Paths and branch names can
  still be sensitive and SHOULD be treated as confidential.
- **Bypass.** Hooks only see what the runtime routes through them. An
  agent can act outside them (for example through an unclassified MCP
  server or a spawned process). `protection.not_covered` and
  `limitations` MUST say so rather than imply full coverage.

## Compatibility

- Additive. No existing schema, RFC or bundle changes.
- Four new schemas are added to `schemas/v0.3/`; no new schema directory
  is required.
- The event envelope is versioned independently by `schema_version`
  (`agenomic.coding.event/v1`). A breaking change to the envelope or a
  new event type requires `agenomic.coding.event/v2`.
- Session, manifest and action objects allow additional properties so
  implementations can add fields; their enums are closed and narrowing
  or extending them is a schema change recorded in `CHANGELOG.md`.
- Conformance fixtures are added under
  `conformance/{valid,invalid}/coding-{event,session,capability-manifest,action}/`.

## References

- RFC 2119 — Key words for use in RFCs to Indicate Requirement Levels.
- ULID specification — <https://github.com/ulid/spec>.
- RFC 3339 — Date and Time on the Internet: Timestamps.
- Agenomic RFC 0003 (ATEP), RFC 0004 (MCP-native tools), RFC 0010
  (canonical run traces), RFC 0011 (policy contracts).
- Claude Code hooks and Agent SDK documentation; Codex app-server
  protocol documentation.
