# Reading and verifying attestations

Tutorial companion to RFC 0008 and to
[`schemas/v0.1/release-attestation.schema.json`](../schemas/v0.1/release-attestation.schema.json),
and, for `schema_version: 2`, to RFC 0012 and
[`schemas/v0.4/release-attestation.schema.json`](../schemas/v0.4/release-attestation.schema.json).

A release attestation is a signed statement that a specific bundle
was reviewed, replayed, approved, and released. Verifiers can pick
up an attestation, recompute the bundle hash, recompute the linked
replay report and ATEP root (if present), and re-check the
signature, fully offline.

## What an attestation looks like

```json
{
  "schema_version": 1,
  "attestation_type": "release",
  "agent_id": "agent://acme/claims-bot",
  "release_id": "v3.2.0",
  "bundle_logical_hash": "blake3-merkle-v1:b9c0…",
  "bundle_archive_hash": "blake3:7f1d…",
  "bundle_hash_algorithm": "blake3-merkle-v1",
  "replay_job_id": "rj-2026-04-30-1721",
  "replay_report_hash": "blake3:1aa3…",
  "atep_root_hash": "blake3:0ce2…",
  "contract_passed": true,
  "approval_status": "approved",
  "approvals": [
    { "approver_role": "release_manager",
      "status": "approved",
      "user_id": "u_8842",
      "comment": "All sentinel-set checks green.",
      "at": "2026-05-01T13:42:11Z" }
  ],
  "issued_at": "2026-05-01T13:45:00Z",
  "issuer": { "key_id": "k_acme_2026q2", "algorithm": "ed25519" },
  "signature": {
    "algorithm": "ed25519",
    "value": "3T5d…",
    "public_key_pem": "-----BEGIN PUBLIC KEY-----\n…"
  }
}
```

## Version 2: agent versions linked to a genome

An issuer emits `schema_version: 2` for a release that is an agent
version linked to a genome (RFC 0012). Version 2 adds two required
members to the version 1 document:

- `genome_version`: the content address of the agent genome, which
  is the agent version digest (`sha256:` plus 64 lowercase hex);
- `prompt_manifest_digest`: the digest of the agent version's
  `agenomic.prompt_manifest/v1` document, computed as RFC 0012
  describes (`sha256:` plus 64 lowercase hex).

Releases without a genome keep `schema_version: 1` and carry neither
member, and every version 1 attestation stays valid. The fixture
[`conformance/valid/release-attestation/v2-candidate.json`](../conformance/valid/release-attestation/v2-candidate.json)
is a version 2 attestation. Like the version 1 fixture it is unsigned:

```json
{
  "schema_version": 2,
  "attestation_type": "release",
  "agent_id": "agent://acme/support-agent",
  "release_id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "bundle_logical_hash": "blake3-merkle-v1:7c85dd31441e2f8c976b48647b0b8741911ad90f5644e5796bf49876cf67ece7",
  "bundle_archive_hash": "blake3:cacd387607b4f9938d9f0e8aee8a817833475d03ad062dea12b5311832ef48c9",
  "bundle_hash_algorithm": "blake3-merkle-v1",
  "genome_version": "sha256:e6083c135fa1a9419b150615393fc03bc4aa9bcaa5db57836ca44feb0025e9a5",
  "prompt_manifest_digest": "sha256:9e60d2cfae4ec4a42006cdb0e1034ca56361bc24c066ce0d408b3dbe0b01d968",
  "approval_status": "approved",
  "approvals": [
    {
      "approver_role": "maintainer",
      "status": "approved",
      "user_id": "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
      "at": "2026-10-04T21:05:00Z"
    }
  ],
  "issued_at": "2026-10-04T21:06:00Z",
  "issuer": {
    "key_id": "orgkey_2026_09",
    "algorithm": "ed25519"
  }
}
```

The signature scheme does not change. It is computed over the whole
document without `signature`, so the two new members are signed like
every other member, and changing either one breaks the signature.

Pick the schema from `schema_version`: version 2 validates against
the v0.4 schema, every other value against v0.1. The v0.4 schema also
accepts version 1 unchanged. A verifier that knows only version 1
refuses a version 2 attestation; it never drops the members it does
not know.

## Signed vs unsigned

The `signature` field is optional in the schema **only** to allow
unsigned drafts during local development. Unsigned attestations
provide no security guarantees and MUST NOT be used to authorize a
production release. Verifier policy SHOULD reject unsigned
attestations outside development environments.

## How verification works

A conformant verifier accepts an attestation iff:

1. The bundle exists and its **logical hash** recomputes to
   `bundle_logical_hash` under the declared
   `bundle_hash_algorithm`.
2. If `replay_report_hash` is present, the report exists and hashes
   to that value.
3. If `atep_root_hash` is present, the ATEP segment(s) exist and
   their Merkle root recomputes to that value.
4. The signature, computed against
   `BLAKE3(JCS(attestation \ signature))`, verifies under the
   declared algorithm with the public key referenced by
   `issuer.key_id`.
5. The issuer's `key_id` is present in the verifier's trusted key
   directory and was valid at `issued_at`.

The order is deliberate: cheap content checks first, key directory
lookup last.

A version 2 attestation adds content checks that run with the others,
before the key lookup:

- If you hold the agent version's prompt manifest (for example the
  `manifest` member of an RFC 0012 prompt bundle), its digest
  recomputes to `prompt_manifest_digest`.
- If you hold a prompt bundle or an execution binding of the same
  release, its `genome_version` and `prompt_manifest_digest` equal
  the attestation's. `genome_version` is an address the issuer
  assigned to the genome: compare it, never recompute it.

## Reading the approval log

`approvals[]` is a free-form audit log of who approved what. The
schema requires `approver_role`, `status`, `user_id`, and `at`;
`comment` is optional but encouraged for audit trails. Replay
attestations typically have approvals with role `replay_system`;
release attestations typically have role `release_manager`,
`compliance`, or `risk_officer`.

A pattern that works well: emit a separate `replay` attestation
covering `contract_passed` and reference its `replay_report_hash`
from the `release` attestation, rather than collapsing both into
one document.

## ATEP-anchored attestations

When `atep_root_hash` is present, the attestation seals not only the
bundle but the agent's causal history at release time (RFC 0003).
This is the strongest available form of provenance: a verifier can
walk back from the release to identity creation and prove every
intermediate decision was recorded and signed.

## Key rotation

Old keys remain valid for **verifying** historical attestations.
Verifier directories store at minimum:

- `key_id`, `public_key_pem`, `algorithm`,
- `valid_from`, `valid_to` (optional).

Rotation is straightforward: issue future attestations under a new
key. Revocation is the harder case; see RFC 0008.

## A reading checklist

When you're handed an attestation:

- [ ] Does `bundle_logical_hash` recompute from the bundle directory?
- [ ] Does `bundle_hash_algorithm` say `blake3-merkle-v1`?
- [ ] If `replay_report_hash` is set, does the report hash match?
- [ ] If `atep_root_hash` is set, does the ATEP root recompute?
- [ ] Is the signature valid?
- [ ] Was `issuer.key_id` valid at `issued_at`?
- [ ] Is `approval_status` what you expect (`approved`, not `pending`)?
- [ ] If `schema_version` is 2, are `genome_version` and
      `prompt_manifest_digest` present, and do they match the
      manifest, bundle or binding you hold?

If every box is checked, the attestation is sound: version 1 under
v0.1, version 2 under v0.4.
