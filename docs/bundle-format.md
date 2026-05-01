# Bundle format walkthrough

This is a tutorial-style companion to RFC 0001. The RFC is normative;
this page is friendly. Use it to get oriented; consult the RFC when
you need to settle ambiguity.

## What a bundle is

A bundle is a directory tree with a known set of named files and
folders. Anyone with a conformant validator can pick up the directory,
verify it, hash it, and replay it. A bundle MAY also be distributed as
a single `tar.zst` archive, but the **logical hash** does not depend
on archive format.

## Anatomy

```text
my-agent/
├── genome.yaml                 ← required: design declaration
├── agent.lock.yaml             ← required: pinned dependencies
├── behavior.contract.yaml      ← required: verifiable invariants
├── prompts/
│   ├── system.md               ← recommended
│   └── skills/
│       └── <skill_id>.md       ← one per skill
├── tools/
│   └── mcp.lock.yaml           ← optional MCP supplement
├── policies/
│   └── <policy_id>.md|yaml     ← one per policy in genome
├── knowledge/
│   └── snapshots.yaml          ← optional knowledge index references
├── memory/
│   └── memory.schema.yaml      ← schema only; never user data (RFC 0006)
├── evals/
│   └── replay_manifest.yaml    ← which traces to replay
└── attestations/
    └── <release_id>.json       ← signed release evidence
```

## Required vs optional

Only three files are required by the spec at v0.1:

- `genome.yaml`,
- `agent.lock.yaml`,
- `behavior.contract.yaml`.

Everything else is optional from the spec's standpoint, but most
production bundles will include the recommended directories. Cross-
references in `genome.yaml` (e.g. `skills[*].prompt_path`) MUST
resolve relative to the bundle root.

## How files are hashed

The bundle root is enumerated, default-excluded patterns are removed
(see RFC 0002), file paths are sorted lexicographically by UTF-8
bytes, and a Merkle tree is built over per-file BLAKE3 hashes with
domain separators. The 32-byte root is the **logical bundle hash**.

The `tar.zst` archive is hashed separately (`bundle_archive_hash`)
for download integrity, but the value bound by signed attestations is
the logical hash.

## Versioning

`genome.yaml` MUST set `spec_version: agentlock/v0.1`. The major-minor
selects the schema directory. Unknown top-level fields in objects with
`additionalProperties: true` are warnings, not errors; this allows
additive minor revisions without breaking older readers.

## Worked examples

See:

- [`examples/claims-agent/`](../examples/claims-agent/) — a regulated
  customer-facing bundle.
- [`examples/support-agent/`](../examples/support-agent/) — a smaller
  Tier-1 SaaS bundle.
- [`examples/trading-risk-agent/`](../examples/trading-risk-agent/) —
  a high-criticality, read-only flagging bundle.

All three validate against `schemas/v0.1/`.

## Pitfalls to avoid

- **Including `.env` or signing keys.** They are exclusion-listed by
  default, but defense in depth lives in your CI. Never check secrets
  into the bundle source repo.
- **Bundling user memory.** Don't. See RFC 0006.
- **Forgetting `bundle_hash_algorithm`.** When constructing
  attestations, set it explicitly to `blake3-merkle-v1` for v0.1.
- **Hashing the archive instead of the directory.** The archive hash
  is unstable across `tar`/`zstd` versions. Sign the logical hash.
