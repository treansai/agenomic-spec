# RFC 0002: Canonical Merkle Hashing

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | AgentLock maintainers \<spec@agentlock.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0003, RFC 0008                                |

## Summary

This RFC specifies how to compute the **logical bundle hash** — a stable,
reproducible Merkle root over the bundle directory. The logical hash is
the value signed by release attestations. It is independent of archive
format, compression level, and host filesystem details.

The algorithm identifier is **`blake3-merkle-v1`**.

## Motivation

Release attestations need to bind a release decision to a specific
bundle content. They cannot bind to the archive bytes, because two
producers with different `tar` or `zstd` versions would produce
materially different archives for the same content. They cannot bind to
a Git tree hash, because Git tree hashes depend on the producer's
filter, ignore, and packfile choices.

A directory-content hash, computed from a fixed canonical encoding, is
the right primitive. We adopt a Merkle tree so that future tooling can
serve subtree proofs without hashing the entire bundle.

## Detailed design

### Inputs

The algorithm operates on a **bundle root** — a directory tree on a
local filesystem.

### Step 1 — File enumeration

1. Walk the bundle root recursively.
2. Exclude any path matching a default exclusion pattern:
    - `.git/`, `.DS_Store`, `Thumbs.db`, `target/`, `node_modules/`,
      `__pycache__/`, `.agentlock/`,
    - security-sensitive patterns: `.env`, `.env.*`, `*.pem`, `*.key`,
      `id_rsa`, `id_ed25519`, `*.p12`, `*.pfx`.
3. Implementations MAY add to the exclusion list; they MUST NOT remove
   from it.
4. Symbolic links MUST be resolved; if the target leaves the bundle root,
   the implementation MUST abort with an error.
5. Empty directories are ignored (the algorithm hashes files, not
   directories).

### Step 2 — Canonical paths

For each surviving file, compute its **canonical path** as:

- Relative to the bundle root.
- Encoded as UTF-8 bytes.
- POSIX form (forward slashes only); on Windows, backslashes are
  converted before hashing.
- No leading `./` or `/`.

Sort all canonical paths **lexicographically by their UTF-8 byte
representation**. This is independent of locale.

### Step 3 — Leaf hashes

For each `(path, content)` pair, compute the leaf hash:

```text
leaf_i = BLAKE3( "AGENTLOCK-LEAF-v1\0" || path_bytes || 0x00 || file_content )
```

Where:

- `"AGENTLOCK-LEAF-v1"` is the literal 17-byte ASCII string.
- `\0` is a single zero byte (domain separator + path/content separator).
- `path_bytes` is the canonical-path UTF-8 encoding from step 2.
- `file_content` is the raw file bytes — no normalization.

The double zero-byte structure (domain separator after the label, and
`0x00` between path and content) prevents path-content boundary
ambiguity.

### Step 4 — Tree construction

Build a binary Merkle tree over the leaves in the sorted order from
step 2.

For each layer above the leaves:

```text
parent = BLAKE3( "AGENTLOCK-NODE-v1\0" || left || right )
```

If a layer has an odd number of nodes, the **last node is duplicated**
(used as both left and right input for the synthetic parent). This
unbalanced-tree convention is the same as Bitcoin's; it is simple,
deterministic, and broadly understood.

The recursion ends when a single root remains.

### Step 5 — Root and algorithm identifier

The 32-byte root output is the **logical bundle hash**.

The algorithm identifier string is `"blake3-merkle-v1"`. Hash values
SHOULD be carried in fields with this prefix where the schema permits,
e.g. `bundle_logical_hash: "blake3-merkle-v1:abcd…"`.

### Domain separation rationale

Leaf and node hashes use distinct domain prefixes
(`AGENTLOCK-LEAF-v1` vs `AGENTLOCK-NODE-v1`) so that no internal node
hash can ever collide with a leaf hash. Without this, an attacker could
in principle construct a leaf whose content hashes to a value that
later appears as an inner node, enabling a second-preimage attack on
proofs.

The `\0` byte after each label disambiguates labels of different
lengths.

### Distinction from the archive hash

The bundle MAY also be distributed as a single `tar.zst` archive. The
archive's BLAKE3 hash is exposed as `bundle_archive_hash`. It is **not**
the value attestations sign. Two valid `tar.zst` encodings of the same
bundle (different compression levels, different tar implementations)
have different `bundle_archive_hash` values but the same
`bundle_logical_hash`.

### Empty bundle

A bundle with zero included files yields an explicit empty-tree root:

```text
empty_root = BLAKE3( "AGENTLOCK-EMPTY-v1\0" )
```

Implementations MUST refuse to package an empty bundle in production,
but the empty-tree root is defined for completeness and for testing.

### Worked example (3-file bundle)

Consider a bundle with three files:

```text
genome.yaml         (content: "spec_version: agentlock/v0.1\n")
prompts/system.md   (content: "you are a helpful agent\n")
agent.lock.yaml     (content: "lock_version: agentlock-lock/v0.1\n")
```

Sorted canonical paths:

1. `agent.lock.yaml`
2. `genome.yaml`
3. `prompts/system.md`

Leaf hash inputs (each prefixed with `"AGENTLOCK-LEAF-v1\0"`):

```text
leaf_0 = BLAKE3( 0x41 0x47 0x45 0x4e ... 0x00 || "agent.lock.yaml"
                 || 0x00 || "lock_version: agentlock-lock/v0.1\n" )
leaf_1 = BLAKE3( 0x41 0x47 0x45 0x4e ... 0x00 || "genome.yaml"
                 || 0x00 || "spec_version: agentlock/v0.1\n" )
leaf_2 = BLAKE3( 0x41 0x47 0x45 0x4e ... 0x00 || "prompts/system.md"
                 || 0x00 || "you are a helpful agent\n" )
```

Layer 1 (3 leaves → odd; duplicate last):

```text
n01 = BLAKE3( "AGENTLOCK-NODE-v1\0" || leaf_0 || leaf_1 )
n22 = BLAKE3( "AGENTLOCK-NODE-v1\0" || leaf_2 || leaf_2 )
```

Root:

```text
root = BLAKE3( "AGENTLOCK-NODE-v1\0" || n01 || n22 )
```

A reference vector with concrete hex values is included in the
conformance suite (`conformance/vectors/merkle-3file.json`) so that any
implementation can verify byte-level agreement.

## Alternatives considered

### SHA-256 instead of BLAKE3

Considered. SHA-256 is universally available. BLAKE3 is significantly
faster on commodity hardware, supports parallel hashing of large files,
and has a clean tree mode. We chose BLAKE3 for performance and because
the spec also uses BLAKE3 in ATEP causal hashes (RFC 0003); a single
primitive simplifies implementations. SHA-256 hashes remain accepted in
schema fields prefixed `sha256:` for interoperability with content
provided by external systems (e.g. tool schema hashes), but they are
not used to compute the bundle root.

### Sort by Unicode code point order

Equivalent to UTF-8 byte order for valid UTF-8 input, but slower to
specify. We standardize on the byte-order phrasing.

### Sorted-tar root (e.g. `tar -t | sort | sha256sum`)

Rejected. Tar headers carry uid/gid, mtime, mode bits, and extension
records that vary across hosts. Producing a deterministic tar requires
zeroing those fields; once zeroed, the tar is just a transport
container and the spec might as well operate on the directory directly.

### Bao verified streaming

Considered for v0.2. BLAKE3 has a verified-streaming format (`bao`)
that carries Merkle proofs alongside data. Useful for serving partial
bundle verifications, but out of scope for v0.1.

## Open questions

- Whether to publish a small reference implementation as a separate
  repository so producers can validate their hash output without writing
  one. Tracked outside the spec.

## Security considerations

- **Domain separators are mandatory.** Any implementation that omits
  them is non-conforming and exposes consumers to second-preimage
  attacks on Merkle proofs.
- **Symlink escape:** see step 1. Hashing a symlink that points outside
  the bundle would let an attacker poison the hash with content the
  consumer does not see.
- **Path normalization:** the spec does not normalize Unicode (no NFC
  pass) on file content. Two visually identical paths encoded
  differently (NFC vs NFD) hash to different leaves; this is the
  conservative choice and matches Git's behavior.
- **Empty files** still hash, with `file_content` being the empty
  byte string after the separator.

## Compatibility

This RFC defines `blake3-merkle-v1`. A future RFC introducing
`blake3-merkle-v2` MUST keep `v1` valid for all existing attestations
indefinitely (verifiers must be able to recompute historical hashes).

## References

- [BLAKE3 specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- RFC 0001 — Agent Bundle Format.
- RFC 0008 — Release Attestations.
