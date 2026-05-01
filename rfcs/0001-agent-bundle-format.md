# RFC 0001: Agent Bundle Format

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | AgentLock maintainers \<spec@agentlock.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0002, RFC 0003, RFC 0006, RFC 0008                      |

## Summary

This RFC defines the **agent bundle**, the canonical packaging unit of
AgentLock. A bundle is a directory tree with a fixed set of named files
and folders, identified by a logical Merkle root (RFC 0002), and
optionally distributed as a single `tar.zst` archive.

## Motivation

A Git commit identifies a tree of files; an agent's behavior depends on
many things a Git tree cannot fully capture in a stable, locatable way:

- the inference settings actually used at run time,
- the resolved version and schema of every external tool,
- the exact knowledge index snapshots referenced,
- the runtime memory schema the agent expects (without bundling user data),
- the policy and approval rules in force,
- the evaluation contract and its replay evidence,
- the signed release decision.

A Git repository can carry these artifacts, but they have no agreed names,
no agreed layout, and no cross-tool hash. Two repositories that both
"contain an agent" cannot be compared without ad-hoc tooling.

The bundle format fixes layout and naming so that any conformant tool can
read, hash, replay, and verify the same artifact.

## Detailed design

### File layout

A bundle is a directory tree with the following layout. Required entries
MUST be present. Optional entries MAY be present. Unknown top-level
entries are tolerated but trigger a warning during validation.

```text
<bundle-root>/
├── genome.yaml                  (required)
├── agent.lock.yaml              (required)
├── behavior.contract.yaml       (required)
├── prompts/
│   ├── system.md                (recommended)
│   └── skills/
│       └── <skill_id>.md        (one per skill referenced in genome.yaml)
├── tools/
│   └── mcp.lock.yaml            (optional, RFC 0004)
├── policies/
│   └── <policy_id>.md|yaml      (one per policy referenced in genome.yaml)
├── knowledge/
│   └── snapshots.yaml           (optional; index references)
├── memory/
│   └── memory.schema.yaml       (required if memory.runtime_memory_schema_version is set)
├── evals/
│   └── replay_manifest.yaml     (optional; selection of traces for replay)
└── attestations/
    └── <release_id>.json        (zero or more signed release attestations)
```

### Required files

- **`genome.yaml`** — declarative agent design; validated by
  [`schemas/v0.1/genome.schema.json`](../schemas/v0.1/genome.schema.json).
- **`agent.lock.yaml`** — pinned, reproducible dependencies; validated by
  [`schemas/v0.1/agent-lock.schema.json`](../schemas/v0.1/agent-lock.schema.json).
- **`behavior.contract.yaml`** — verifiable invariants; validated by
  [`schemas/v0.1/behavior-contract.schema.json`](../schemas/v0.1/behavior-contract.schema.json).

### Optional files

Everything under `prompts/`, `policies/`, `knowledge/`, `memory/`,
`evals/`, and `attestations/` is optional from the spec's standpoint, but
strongly recommended for any production bundle. Cross-references in
`genome.yaml` (e.g. `skills[*].prompt_path`) MUST resolve relative to the
bundle root.

### Exclusion rules

Bundle hashing (RFC 0002) and archive packing exclude:

- `.git/`, `.DS_Store`, `Thumbs.db`, `target/`, `node_modules/`,
  `__pycache__/`, `.agentlock/`,
- security-sensitive patterns: `.env`, `.env.*`, `*.pem`, `*.key`,
  `id_rsa`, `id_ed25519`, `*.p12`, `*.pfx`.

Implementations MAY add patterns; they MUST NOT remove any of the above.

### Archive format

Bundles MAY be distributed as a single archive. The canonical archive
format for v0.1 is **`tar.zst`** (POSIX `ustar` tar inside Zstandard).

Rationale:

- A single file distributes cleanly through HTTP, OCI registries, object
  storage, and air-gapped transport.
- POSIX tar is the most broadly supported tree format.
- Zstandard compresses text-heavy content (YAML, Markdown, prompts) more
  effectively than gzip at comparable speeds, with a clean spec
  (RFC 8478) and broad library support.

The archive's hash (`bundle_archive_hash`) is BLAKE3 of the archive
bytes. It is **not** the value that release attestations sign — that is
the **logical** Merkle root from RFC 0002. The archive hash exists to
support download integrity checks where signed attestations are
unavailable.

### Versioning and forward compatibility

`genome.yaml` MUST set `spec_version: agentlock/v0.1`. The major-minor
pair selects the schema directory used for validation
(`schemas/v0.1/`). Tooling encountering an unknown `spec_version` MUST
refuse to validate and SHOULD report which versions it understands.

Within a given `spec_version`:

- Unknown top-level fields in objects whose schemas declare
  `additionalProperties: true` are **warnings**, not errors. This allows
  additive minor revisions without breaking older readers.
- Unknown top-level fields in objects whose schemas declare
  `additionalProperties: false` are **errors**.

### Worked example

A minimal valid bundle for a fictional `support-agent`:

```text
support-agent/
├── genome.yaml
├── agent.lock.yaml
├── behavior.contract.yaml
└── prompts/
    └── system.md
```

See [`examples/support-agent/`](../examples/support-agent/) for the
full content.

## Alternatives considered

### Use a Git repo as the bundle

Rejected. A Git tree has no agreed file naming, and Git's content hash
covers all files including ignored ones in a way that depends on the
client's filter and packfile choices. Two equivalent bundles could yield
different Git tree hashes.

### Use OCI image layout

Considered. OCI offers excellent registry tooling and signing
(cosign/sigstore). However, OCI's manifest model is layered around
filesystem snapshots; agents are not filesystems and the layering
provides no benefit. We expose `bundle_archive_hash` on the bundle so
tooling that wishes to host the archive in an OCI registry can do so
without changing the spec.

### Use ZIP

Rejected. ZIP's central directory format encodes file ordering
nondeterministically across implementations. tar in sorted-leaf order
plus Zstandard gives reproducible, smaller archives.

### Bundle runtime memory inline

Rejected; see RFC 0006. Runtime memory contains user data and is the
wrong granularity to version with the bundle.

## Open questions

- Whether to define an OCI `mediaType` for ATEP-anchored bundles. (RFC
  0003 is the prerequisite; the OCI mapping is left to v0.2 or a
  separate RFC.)
- Whether `evals/replay_manifest.yaml` should have its own normative
  schema in v0.1 or remain implementation-defined until field experience
  accrues. Currently the latter.

## Security considerations

- The exclusion rule list intentionally drops common credential file
  patterns. A producer that accidentally checks in `.env` will not have
  it included in the bundle hash, but it will be present in the source
  repository. Defense in depth is the responsibility of the producer's
  CI; the spec's role is to ensure the bundle hash never accidentally
  binds secrets.
- The archive hash is **not** sufficient evidence of release; only the
  logical hash (RFC 0002) signed in a release attestation (RFC 0008) is.
- Tooling MUST refuse to follow symbolic links outside the bundle root
  during hashing or unpacking.

## Compatibility

This is the foundational format RFC. Future RFCs that change the bundle
layout MUST bump the schema directory.

## References

- [RFC 8478](https://www.rfc-editor.org/rfc/rfc8478) — Zstandard.
- [POSIX 1003.1 Issue 7, ustar](https://pubs.opengroup.org/onlinepubs/9699919799/utilities/pax.html).
- RFC 0002 — Canonical Merkle Hashing.
- RFC 0006 — Design vs Runtime Memory.
- RFC 0008 — Release Attestations.
