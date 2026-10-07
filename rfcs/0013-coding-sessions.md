# RFC 0013: Coding Sessions

| Field        | Value                                      |
|--------------|--------------------------------------------|
| Status       | Draft                                      |
| Created      | 2026-10-05                                 |
| Author(s)    | Agenomic maintainers <spec@agenomic.dev>   |
| Spec version | v0.3                                       |
| Supersedes   | —                                          |
| Related      | RFC 0003, RFC 0004, RFC 0010, RFC 0011     |

## Summary

RFC 0013 defines the portable artifacts Agenomic uses to supervise
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
- `shadow` — policy is evaluated but never binds: the action's
  `decision` is always `defer` (the native permission flow decides), and
  what `enforce` would have returned (`allow`, `deny` or `pending`) is
  recorded in `would_have_been`, which every shadow action MUST carry and
  which is never `null` there: without it a shadow rollout cannot tell
  what `enforce` would do. No approval is requested in shadow: a
  would-be `pending` is recorded as `would_have_been: "pending"`, with no
  `approval_id`.
- `enforce` — the policy decision (`allow`, `deny`, `pending`) is
  returned to the runtime's hook and is binding. An `enforce` action
  never answers `defer`: that would hand the call back to the native
  permission flow and bypass the policy.

`would_have_been` is shadow-only: an `observe`, `enforce` or `blocked`
action carries it `null` or omits it, so a simulated outcome is never
recorded for a call that was not evaluated in shadow.

`mode_effective` is what actually holds: one of the three modes, `none`
(not yet connected) or `blocked`. If a prerequisite of the requested
mode fails (missing capability, unreleased policy, runtime version
without pre-tool control), the session MUST become `blocked` and refuse
actions. A producer MUST NOT silently lower `mode_effective` below
`mode_requested`; the session schema rejects `mode_requested: enforce`
with `mode_effective: observe` (and likewise for `shadow`). Nor does
`mode_effective` rise above `mode_requested`: a session that requested
`observe` is `observe`, `blocked` or `none`, never `shadow` or
`enforce`, so a user who chose non-binding observation never receives
binding decisions or recorded would-be decisions. In every case
`mode_effective` is the requested mode, `blocked` or `none`. Changing a
mode, lower or higher, is a new, explicit request by a user, recorded
as such.

**Action modes.** Each coding action records in `effective_mode` the
mode that applied to that call: `observe`, `shadow`, `enforce` or
`blocked`. Its `decision` follows from it, and the action schema
enforces the pairing:

| Action `effective_mode` | `decision` | `would_have_been` | Approval |
|---|---|---|---|
| `observe` | `defer` | `null` or absent | — |
| `shadow` | `defer` | required, non-null: `allow`, `deny` or `pending` | none: `approval_id` and `approval_status` are `null` or absent |
| `enforce` | `allow`, `deny` or `pending`, never `defer` | `null` or absent | a `pending` decision references its `approval_id` |
| `blocked` | `deny` | `null` or absent | none: `approval_id` and `approval_status` are `null` or absent |

An action's mode can differ from the session's `mode_effective`. In an
`enforce` session, a call for which the policy layer evaluated every
contributing policy binding in shadow mode is a `shadow` action and
follows the shadow rules: it answers `defer` and records
`would_have_been`. This is not a downgrade of the session; its other
calls stay enforced.

A `blocked` action is a call refused because the session cannot honour
its requested mode: `mode_effective` is `blocked`, or a prerequisite of
the requested mode (a validated capability, a released policy) no
longer holds when the call is decided. The refusal is not a policy
outcome a reviewer could approve, so a `blocked` action decides `deny`
and requests no approval; its `reason_codes` name the cause (for
example `enforce_prerequisite_missing`). Calls stay blocked until the
prerequisite is restored or a user explicitly requests a lower mode.

`protection.protected` lists the coding tool ids (the closed `tool_id`
vocabulary of [Action classification](#action-classification)) whose
calls are actually gated in this session; `protection.not_covered`
lists those that are not. Each list holds an id at most once, and the
two lists are disjoint: an id gated in a session is not also reported
as not covered. (JSON Schema has no intersection keyword, so the
session schema enumerates this per `tool_id`; the conformance validator
checks that the enumeration matches the vocabulary.)
`protection.notes`, at most 32 strings of at most 300 characters each,
describes the mechanisms behind that coverage (for example a sandbox,
or runtime settings that were not loaded). Caveats about what is not
covered go to the session's `limitations`. A consumer showing a
"protected" badge MUST derive it from `mode_effective` together with a
non-empty `protection.protected`, never from `mode_requested` or
`protection.notes`.

### Event envelope

Every event is an `agenomic.coding.event/v1` envelope:

```json
{
  "event_id": "01K6Y9A1B2C3D4E5F6G7H8J9K1",
  "coding_session_id": "3f2b8c1d-6e4a-4b9f-8c7d-1a2b3c4d5e6f",
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
  "payload": {
    "native_tool": "Bash",
    "native_request_id": "toolu_example_01",
    "tool_id": "coding.shell.exec"
  }
}
```

The top level is closed (`additionalProperties: false`); type-specific
data lives in `payload`.

**Session.** `coding_session_id` (uuid) is required: it names the
Agenomic coding session (the session object's `id`) the event belongs
to, so an event stays attributable when it is stored, batched or
exported outside a session-scoped transport. Producers MUST set it. A
receiver that ingests events on a session-scoped endpoint MUST reject an
event whose `coding_session_id` names a different session, and MAY fill
an absent value from that endpoint before storing the event. Every event
a receiver stores or serves carries `coding_session_id` exactly once.

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
`(coding_session_id, source, producer_epoch, producer_seq)`, taking
`coding_session_id` from the envelope; a duplicate is acknowledged, not
stored twice.

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
`tool.failed`). They MUST NOT be collapsed. In particular, **an `allow`
is not proof of execution**: the runtime may still abort, the user may
cancel, or the hook may never return.

**Tool-call correlation.** Every `tool.requested`, `tool.started`,
`tool.completed` and `tool.failed` event MUST carry:

- `attempt_id`: the decimal string of the native call's attempt number
  (`"1"`, `"2"`, ...), equal to the coding action's `attempt`;
- `payload.native_request_id`: the runtime's id of the call, equal to
  the coding action's `native_request_id`;
- `action_id` on `tool.requested`, which is emitted with the decision.
  On `tool.started`, `tool.completed` and `tool.failed`, `action_id`
  MUST be set whenever a coding action exists for the call.

The correlation key of a tool call is `(coding_session_id,
payload.native_request_id, attempt_id)`; it matches the coding action's
`(coding_session_id, native_request_id, attempt)`. A `tool.started`,
`tool.completed` or `tool.failed` event without `action_id` observes a
call that never went through a decision (for example, hooks installed
while the call was running, or the gateway unreachable in `observe`
mode); it MUST NOT be counted as execution evidence for any action.
Evidence that an action ran requires an observed start or result event
that carries the action's `action_id` and correlation key; absent one,
the action's `status` stays `decided` or becomes `unknown`.

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
Pre-tool control is such a dependency for every `enforce` session: its
policy decision reaches the runtime through the pre-tool hook. A session
whose `mode_effective` is `enforce` therefore MUST carry
`capabilities.pre_tool_control` with `validated` `supported_tested` or
`partial` (the tool ids a `partial` hook does not gate go to
`protection.not_covered`); an absent entry counts as not validated. The
session schema rejects `enforce` otherwise, so an `enforce` request
without validated pre-tool control is `blocked`. `observe` and `shadow`
never bind and do not carry this requirement.

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

Every coding action names its session in `coding_session_id` (uuid,
required), so it stays attributable when it is stored or exported
outside a session-scoped container. Together with `native_request_id`
and `attempt` it forms the tool-call correlation key of
[Event envelope](#event-envelope); a native request id alone is
ambiguous across sessions. Every action a receiver stores or serves
carries it.

The action records its intent digest `input_digest` (required; see
[Approval binding](#approval-binding)) and, for a file change,
`patch_digest`, then `decision` (`allow`, `deny`, `pending`, `defer`),
`effective_mode`, `would_have_been` (shadow), `reason`,
`reason_codes`, the approval link, and later the observed `status`
(`requested`, `decided`, `started`, `completed`, `failed`, `unknown`)
and `outcome`. The schema enforces that a `pending` decision references
an `approval_id`, that `observe` and `shadow` modes only ever answer
`defer` while `enforce` never does, that a `shadow` action carries a
non-null `would_have_been` and references no approval, that every
other action carries `would_have_been` `null` or not at all, and that a
`blocked` action decides `deny` and references no approval (see
[Governance modes](#governance-modes)).

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

An approval authorizes one **intent**, not one tool name. Every coding
action carries the digest of its intent in `input_digest`: required,
never `null`, and of the form `blake3:` followed by 64 lowercase
hexadecimal digits (`^blake3:[0-9a-f]{64}$`). The gateway computes it
when it classifies the call and is the source of truth for its value;
a connector reports the call and its context, not the digest.

**Intent object.** The digest covers a JSON object with exactly these
twelve members. Each member is always present: an absent context value
is `null` and an absent list is `[]`, never an omitted member.

| Member | Value |
|---|---|
| `runtime` | The runtime id: `claude_code` or `codex`. |
| `native_tool` | The native tool name, as in the action's `native_tool`. |
| `input` | The native tool input as the runtime submitted it (any JSON value). |
| `cwd` | Working directory of the call, or `null`. |
| `workspace_root` | Root of the declared workspace, or `null`. |
| `base_revision` | Workspace revision the call starts from (for git, the commit id), or `null`. |
| `patch_digest` | Digest of the patch a file change applies (the action's `patch_digest`), or `null`. |
| `sandbox` | Sandbox setting of the runtime, or `null`. |
| `permission_mode` | Permission mode of the runtime, or `null`. |
| `network_scope` | Network scope of the call (any JSON value), or `null`. |
| `paths` | Array of the paths the connector resolved for the call (patch targets, changed files), relative to the workspace when inside it, in reported order; `[]` when none. |
| `symlink_escapes` | Array of the paths whose real path leaves the workspace although the lexical path does not, in reported order; `[]` when none. |

On the action itself, `patch_digest` is optional and nullable.

**Serialization.** The intent object is serialized as compact JSON and
encoded in UTF-8 (no BOM):

- no insignificant whitespace;
- object keys sorted by Unicode code point, at every level, including
  inside `input` and `network_scope`;
- arrays keep their order;
- strings escaped as JSON requires and no further: `"` as `\"`, `\` as
  `\\`, U+0008, U+0009, U+000A, U+000C and U+000D as `\b`, `\t`, `\n`,
  `\f` and `\r`, any other character below U+0020 as `\u00xx` (lowercase
  hex); every other character, `/` and non-ASCII included, is emitted as
  itself in UTF-8;
- `null`, `true` and `false` as themselves, and integers in plain
  decimal.

This is not the canonical form of RFC 0012: RFC 0012 also normalizes
numbers (`1.0`, `1e2` and `-0` become the integers `1`, `100` and `0`)
and orders keys by UTF-16 code units, while this serialization keeps
each number as the gateway's JSON encoder writes it and orders keys by
code point. A number written with a fraction or an exponent therefore
has no portable serialization across languages; a verifier recomputing
the digest of an input that holds one may disagree with the gateway,
whose value is authoritative.

**Digest.** `input_digest` is `blake3:` followed by the lowercase hex
of the 32-byte BLAKE3 hash of those bytes.

**Reference vector.** A Claude Code `Bash` call with this intent object:

```json
{
  "runtime": "claude_code",
  "native_tool": "Bash",
  "input": { "command": "git push --force origin main", "description": "push" },
  "cwd": "/work/demo",
  "workspace_root": "/work/demo",
  "base_revision": "0123456789abcdef0123456789abcdef01234567",
  "patch_digest": null,
  "sandbox": "workspace-write",
  "permission_mode": "default",
  "network_scope": null,
  "paths": [],
  "symlink_escapes": []
}
```

serializes to these 355 bytes (one line):

```text
{"base_revision":"0123456789abcdef0123456789abcdef01234567","cwd":"/work/demo","input":{"command":"git push --force origin main","description":"push"},"native_tool":"Bash","network_scope":null,"patch_digest":null,"paths":[],"permission_mode":"default","runtime":"claude_code","sandbox":"workspace-write","symlink_escapes":[],"workspace_root":"/work/demo"}
```

and its `input_digest` is
`blake3:52b6752cf5f974d3c5e9e0b4ce2b1ec2adc150a77b3e80199e5a93ec287f463c`.

**Binding.** An approval is bound to the `input_digest` of the action
that requested it. When the agent submits the same call again (same
`coding_session_id`, `native_request_id` and `attempt`), for example
after the approval was granted, the gateway recomputes the digest. If it
differs from the stored action's `input_digest`, because any member of
the intent object changed (a different command or input, another `cwd`,
a different patch or set of paths, a moved base revision, another
sandbox, permission mode or network scope), the call is a **new
intent**: the gateway MUST NOT apply the approval to it and
MUST refuse it with the reason code `input_changed`: `deny` in an
enforce session, `deny` with `effective_mode: blocked` in a blocked one,
and, since observe and shadow never refuse, `defer` in both (a shadow
session records `would_have_been: "deny"`).
The changed call needs a new request, under a new `native_request_id`
or `attempt`, which gets its own action, decision and, if required, its
own approval. An approval is consumed once: a second consume MUST answer
`deny`.

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
- **Approvals in shadow.** Letting a `shadow` session escalate to
  `pending` would make shadow binding: the call waits on a reviewer.
  Shadow therefore always answers `defer` and records a would-be
  approval as `would_have_been: "pending"`, so a team can measure how
  many approvals `enforce` would raise before switching to it.
- **Reusing the RFC 0012 canonical form for the intent digest.** RFC
  0012 hashes with SHA-256 and sorts keys by UTF-16 code units. The
  intent digest is computed by the gateway alone, which already hashes
  with BLAKE3 like RFC 0010 and sorts keys by code point; it does not
  normalize numbers the way RFC 0012 does, so the two forms differ for
  inputs holding non-integer or exponent numbers as well as in key
  order.
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
  counting; approvals are bound to the intent digest `input_digest` and
  consumed once, and a re-submitted call whose recomputed digest differs
  is refused with `input_changed`; commands expire.
- **Intent digest scope.** The digest binds only what the intent object
  holds. A change the connector does not report (for example the
  contents of a file a command reads) does not change it: an approval
  covers the reported call and context, not the state of the machine
  the call runs on.
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
