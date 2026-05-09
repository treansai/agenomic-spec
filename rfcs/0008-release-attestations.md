# RFC 0008: Release Attestations

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | Agenomic maintainers \<spec@agenomic.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0002, RFC 0003, RFC 0005, RFC 0007            |

## Summary

A **release attestation** is a signed statement that a specific
agent bundle was reviewed, replayed, approved, and released. This RFC
specifies what an attestation proves, how it is canonically signed,
how it relates to the ATEP causal log, how key rotation affects
verification, and what it does **not** prove.

## Detailed design

### What an attestation contains

The schema is
[`schemas/v0.1/release-attestation.schema.json`](../schemas/v0.1/release-attestation.schema.json).
Required fields:

- `schema_version` — currently `1`.
- `attestation_type` — `release | replay | compliance | drift | rollback`.
- `agent_id`, `release_id`.
- `bundle_logical_hash` — the Merkle root from RFC 0002.
- `bundle_archive_hash` — BLAKE3 of the `tar.zst` archive (when
  applicable).
- `bundle_hash_algorithm` — `blake3-merkle-v1` for v0.1.
- `approval_status`, `approvals[]` — a list of approver decisions.
- `issued_at`, `issuer.{key_id, algorithm}`.

Optional but recommended:

- `replay_job_id`, `replay_report_hash` — bind the attestation to a
  specific replay-report instance.
- `atep_root_hash` — bind the attestation to the agent's causal
  history at release time (see "ATEP-anchored attestations" below).
- `contract_passed` — boolean from the linked replay report.
- `signature` — required for production use; optional in the schema
  to permit unsigned drafts during development.

### Canonical signing

The signing input is the **JSON Canonicalization Scheme** (JCS,
RFC 8785) of the attestation **without** the `signature` field, then
BLAKE3, then the chosen signature algorithm:

```text
to_sign = JCS( attestation_minus_signature )
digest  = BLAKE3( to_sign )
sig     = sign( private_key, digest )
```

`signature.value` carries the signature as base64. `signature.algorithm`
matches the algorithm used. `signature.public_key_pem` carries the
corresponding public key in PEM for offline verification.

Supported algorithms: `ed25519` (default), `ecdsa-p256`,
`rsa-pss-sha256`. Verifiers MUST refuse unknown algorithms.

### ATEP-anchored attestations

When `atep_root_hash` is present, the attestation pins the entire
ATEP causal history (RFC 0003) up to release time. A consumer can:

1. recompute the bundle Merkle root from the unpacked bundle and
   verify it matches `bundle_logical_hash`;
2. recompute the ATEP segment Merkle root and verify it matches
   `atep_root_hash`;
3. verify the signature.

If all three checks pass, the attestation seals not only the
artifact but also the journey that produced it.

### Verification semantics

A verifier accepts an attestation iff **all** of the following hold:

- the bundle exists and its logical hash recomputes to
  `bundle_logical_hash`;
- when `replay_report_hash` is present, the report exists and hashes
  to that value;
- when `atep_root_hash` is present, the ATEP segment(s) exist and
  recompute to that value;
- the signature, computed against `JCS(attestation \ signature)` and
  hashed by BLAKE3, verifies under the declared algorithm with the
  public key referenced by `issuer.key_id`;
- the issuer's `key_id` is present in the verifier's key directory and
  was valid at `issued_at`.

### Key rotation

Old keys MUST remain valid for **verifying** historical attestations.
A key directory entry has at minimum:

- `key_id`, `public_key_pem`, `algorithm`,
- `valid_from`, `valid_to` (optional; absent means open-ended).

Verifiers MUST refuse to use a key outside its validity window. Key
revocation requires either rotating the key directory and re-issuing
attestations under the new key, or accepting that revoked keys'
historical attestations remain verifiable but flagged.

### Out of scope: KMS

The spec does not prescribe how producers protect their signing keys.
Hardware security modules, cloud KMS, and offline keys are all
acceptable, as long as the signature on the wire conforms.

### Multiple attestations per release

A release MAY carry multiple attestations of different types. A
common pattern is:

- one `replay` attestation produced by the replay system,
- one `release` attestation produced by the governance system after
  human approval,
- later, a `compliance` attestation produced by a periodic auditor.

Consumers correlate them by `agent_id` + `release_id`.

### Worked example

A `release` attestation referencing a `replay` attestation and the
ATEP root:

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
    {
      "approver_role": "release_manager",
      "status": "approved",
      "user_id": "u_8842",
      "comment": "All sentinel-set checks green; full-set CI low > 0.95.",
      "at": "2026-05-01T13:42:11Z"
    }
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

## Alternatives considered

### in-toto / SLSA provenance

Considered. `in-toto` and SLSA provenance attestations are
well-known. We stay close in spirit (canonical signing, hash
binding) while specializing to the agent domain (replay reports,
ATEP roots, approval flows). v0.2 may define an in-toto profile
mapping for interoperability.

### Sign the archive bytes

Rejected, see RFC 0002. Archive bytes are non-canonical; logical
hash is the right binding target.

### Cosign / Sigstore key management

Out of scope at the spec level. Producers MAY use Cosign to manage
signing key material; the on-the-wire format remains the
spec-defined attestation.

## Open questions

- Whether to add a normative `revocations` list to the spec for
  attestations that have been retracted. Current guidance is that
  retraction is a new, superseding attestation rather than a
  delete operation.
- DSSE envelope as an alternative carrier. v0.2 may add it as an
  optional encoding.

## Security considerations

- An unsigned attestation provides no security guarantees and MUST
  NOT be used to authorize a production release.
- Verifiers MUST fetch keys from a trusted directory, not from the
  attestation itself, to avoid trust-on-first-use vulnerabilities.
  `signature.public_key_pem` is convenience for offline verification
  cross-checked against the directory; it is not itself a trust
  anchor.
- Replay-attack resistance: `issued_at` plus `release_id` make
  duplicates detectable; consumers SHOULD reject attestations whose
  `issued_at` is outside an acceptable skew window.
- Compromise of a producer key: rotate, re-issue attestations under
  the new key for releases that remain in service, and add the old
  key to a revocation list within the verifier directory.

## Compatibility

Additive within v0.1. `signature` is optional in the schema for
development; production deployments MUST require it through
verifier policy. A future v2 attestation schema may require
`atep_root_hash` and elevate the signature requirement to schema-
level.

## References

- [RFC 8785 — JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785).
- [SLSA Provenance Specification](https://slsa.dev/provenance/v1).
- [in-toto attestation framework](https://github.com/in-toto/attestation).
- RFC 0001, RFC 0002, RFC 0003, RFC 0005, RFC 0007.
