# Hermes Agent runtime artifacts

Hermes Agent (NousResearch) stays the runtime; an Agenomic control plane
observes it and, when configured to, admits its actions. Three artifacts make
that exchange portable. The reference implementation is agenomic-cloud
(`docs/hermes/design.md`) and agenomic-python
(`agenomic.integrations.hermes`).

## `hermes-event` (`agenomic.hermes.event/v1`)

One event about an instance. The receiver assigns `source` and `trust`:

| source | trust | produced by |
| --- | --- | --- |
| `plugin` | `declared` | the adapter loaded in the Hermes process |
| `model_gateway`, `tool_gateway`, `control_plane` | `observed` | the control plane |
| `supervisor` | `observed` | the trusted process that starts Hermes |

A decision event is not an execution proof, and a declared result is not an
external proof. Ordering across processes is by receive cursor; `seq` is only
monotonic per producer process. Content is metadata and hashes unless the
operator enables redacted previews. `usage.known: false` means unknown usage,
which a consumer must never read as zero.

## `hermes-profile` (`agenomic.hermes.profile/v1`)

Immutable, versioned control profile: models admitted at the Model Gateway,
token budget per root session, delegation limits (depth, children,
concurrency, descendants), persistence rules for skills, config and memory,
protected paths and heartbeat. It never carries a secret value; the upstream
credential is a reference.

## `hermes-action` (`agenomic.hermes.action/v1`)

The action contract a control plane admits before a tool runs. Tenant, agent,
environment and principal come from the authenticated runtime credential.
Decisions are `allow`, `deny`, `require_approval` (and `observe` when no
decision is taken); commands (`pause`, `resume`, `cancel`, `quarantine`,
`revoke`) are a separate vocabulary and never a decision outcome. Approvals
and permits bind `arguments_hash`.
