# Reading and verifying attestations

Tutorial companion to RFC 0008 and to
[`schemas/v0.1/release-attestation.schema.json`](../schemas/v0.1/release-attestation.schema.json).

A release attestation is a signed statement that a specific bundle
was reviewed, replayed, approved, and released. Verifiers can pick
up an attestation, recompute the bundle hash, recompute the linked
replay report and ATEP root (if present), and re-check the
signature — fully offline.

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
key. Revocation is the harder case — see RFC 0008.

## A reading checklist

When you're handed an attestation:

- [ ] Does `bundle_logical_hash` recompute from the bundle directory?
- [ ] Does `bundle_hash_algorithm` say `blake3-merkle-v1`?
- [ ] If `replay_report_hash` is set, does the report hash match?
- [ ] If `atep_root_hash` is set, does the ATEP root recompute?
- [ ] Is the signature valid?
- [ ] Was `issuer.key_id` valid at `issued_at`?
- [ ] Is `approval_status` what you expect (`approved`, not `pending`)?

If every box is checked, the attestation is sound for v0.1.
