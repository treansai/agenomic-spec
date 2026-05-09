# `genome.yaml` field by field

Tutorial companion to
[`schemas/v0.1/genome.schema.json`](../schemas/v0.1/genome.schema.json).

The genome declares what the agent **is**: identity, runtime,
capabilities, knowledge references, policies, and memory references.
Think of it as the design document the rest of the bundle pins.

## Top-level shape

```yaml
spec_version: agenomic/v0.1     # constant for v0.1 bundles
agent: {...}                     # identity, criticality
runtime: {...}                   # model + inference settings
tools: [{...}]                   # external capabilities
skills: [{...}]                  # prompt-driven sub-procedures
knowledge: [{...}]               # external index references
policies: [{...}]                # rule references
memory: {...}                    # design + runtime refs
forbidden_decisions: [...]       # optional: decisions never to take
labels: {...}                    # optional: free-form labels
```

## `agent`

```yaml
agent:
  id: agent://<org>/<name>
  name: Human-readable name
  domain: claims | support | trading-risk | …
  criticality: standard | sensitive | regulated_customer_facing | life_critical
```

`id` MUST match the URI pattern. `criticality` is consumed by your
governance tooling to decide review depth, replay sample sizes, and
who must sign release attestations.

## `runtime`

```yaml
runtime:
  model_provider: example-llm
  model_id: example-llm-large-2026-01
  temperature: 0.2
```

The genome carries the **declared** runtime; the lockfile carries the
**pinned** runtime including `provider_fingerprint` and `top_p`. They
should agree at lock time.

## `tools`

```yaml
tools:
  - name: get_claim_details
    protocol: mcp
    server: mcp://acme/claims-mcp
    version: 2.4.1
```

The genome describes which tools the agent *intends* to use. The
lockfile pins their `schema_hash`, `permissions`, and
`requires_human_approval`. See RFC 0004.

## `skills`

```yaml
skills:
  - id: classify_claim
    version: 3.1.0
    prompt_path: prompts/skills/classify_claim.md
```

`prompt_path` MUST resolve relative to the bundle root. Versioning is
producer-defined; semver is recommended.

## `knowledge`

```yaml
knowledge:
  - name: claim_categories_kb
    snapshot_hash: blake3:9b0a4c…
    source_uri: s3://acme-knowledge/claim_categories/2026-04-15.jsonl
```

The hash pins a frozen view of the index. The bundle does NOT include
the index contents.

## `policies`

```yaml
policies:
  - id: never_auto_authorize_payout
    path: policies/compensation_policy.md
    severity: critical
```

The genome references which policies apply. The lockfile pins their
content hash so a policy file change between releases is visible in
the diff.

## `memory`

```yaml
memory:
  design_memory: memory/memory.schema.yaml
  runtime_memory_schema_version: 1.4.0
```

Design memory is a path inside the bundle. Runtime memory is
referenced **by schema version only** — actual user data lives
outside the bundle. See RFC 0006.

## `forbidden_decisions` (optional)

```yaml
forbidden_decisions:
  - authorize_payout_without_human_review
  - share_full_policy_text_with_customer
```

A producer-defined list of "never do this" outcomes. Behavior
contracts often reference these as deterministic rules.

## `labels` (optional)

Free-form `string -> string` map. Useful for ownership, data
classification, audit tags. No semantic meaning to the spec.

## Validation

Run `npm run validate` from the repo root. The validator binds
`genome.yaml` against `schemas/v0.1/genome.schema.json`.

## Forward compatibility

Inside arrays of objects, schemas are intentionally permissive
(`additionalProperties: true`) so producers can add operational
metadata (e.g. `last_reviewed_at`, `team_owner`). Tooling that does
not understand a field MUST ignore it.
