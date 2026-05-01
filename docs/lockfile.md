# `agent.lock.yaml` field by field

Tutorial companion to
[`schemas/v0.1/agent-lock.schema.json`](../schemas/v0.1/agent-lock.schema.json).

The lockfile pins **resolved** dependencies. It is to AgentLock what
`Cargo.lock` is to Cargo or `package-lock.json` is to npm: derived
from a higher-level declaration (`genome.yaml`), reproducible, and
the source of truth for runtime decisions.

## Top-level shape

```yaml
lock_version: agentlock-lock/v0.1
agent_id: agent://acme/claims-bot
model: {...}                       # pinned runtime (incl. fingerprint, top_p)
tools: [{...}]                     # pinned, with schema_hash + permissions
knowledge: [{...}]                 # pinned, with index_id + snapshot_hash
memory: {...}                      # schema + access policy claims
policies: [{...}]                  # pinned by hash
compatible_memory_schemas: [...]   # optional, RFC 0007
incompatible_with: [...]           # optional, RFC 0007
generated_at: "2026-04-30T18:12:00Z"
```

## `model`

```yaml
model:
  provider: example-llm
  model_id: example-llm-large-2026-01
  provider_fingerprint: fp_2026_01_lg_a1b2c3
  temperature: 0.2
  top_p: 1.0
```

`provider_fingerprint` is critical: it captures the provider-reported
fingerprint at lock time so silent provider drift is detectable in
later replay reports (`model_fingerprints_observed`).

## `tools`

```yaml
- name: propose_compensation
  protocol: mcp
  server: mcp://acme/compensation-mcp
  version: 0.9.3
  schema_hash: blake3:1f2e3d…
  permissions:
    - compensation.propose
  requires_human_approval: true
```

`schema_hash` is BLAKE3 (preferred) or SHA-256 of the canonical-
encoded tool schema (RFC 0004). Mismatch at runtime is a hard error.

`permissions` is the **closed** scope set the tool may use. Anything
else is denied.

`requires_human_approval: true` declares the tool gated. Conformant
runtimes pause for human approval and record the decision in ATEP.

## `knowledge`

```yaml
- name: claim_categories_kb
  index_id: idx-claim-categories-2026q2
  snapshot_hash: blake3:9b0a4c…
```

`index_id` lets the runtime map the snapshot back to a live store
when it serves traffic.

## `memory`

```yaml
memory:
  schema_version: 1.4.0
  stores_user_specific_data: true
  retention_days: 365
  gdpr_exportable: true
  deletion_supported: true
```

These fields are **declarative claims** about the runtime memory
store. Conformance test suites for runtimes (out of scope for this
repo) exercise them; the spec defines the shape and meaning.

## `policies`

```yaml
- id: never_auto_authorize_payout
  version: 1.2.0
  hash: blake3:aa11bb…
```

The hash pins the policy file content. Diffing two lockfiles
exposes both intent (id/version) and accidental drift (hash change
without a version bump).

## `compatible_memory_schemas` (optional)

```yaml
compatible_memory_schemas:
  - 1.3.0
  - 1.4.0
```

Read by controllers when computing rollback safety (RFC 0007). The
release's own `memory.schema_version` MUST appear in this list.

## `incompatible_with` (optional)

```yaml
incompatible_with:
  - rel://acme/claims-bot@v2.9.0
```

Producer-asserted "do not roll back to" set. Controllers refuse
transitions onto entries in this list.

## `generated_at`

ISO-8601 RFC 3339 timestamp. **Quote it** in YAML to keep parsers
from coercing it to a date type.

## Producer workflow

1. Edit `genome.yaml`.
2. Run your producer pipeline to:
    - resolve tool/server versions and fetch their schemas;
    - compute `provider_fingerprint`;
    - hash policy files and tool schemas;
    - snapshot knowledge indexes.
3. Write the resulting `agent.lock.yaml`.
4. Validate (`npm run validate`).
5. Commit both files together — they're the design and its pin.
