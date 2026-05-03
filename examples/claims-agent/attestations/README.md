# Attestations directory

Release attestations for this agent live here as JSON files named
`<release_id>.json`. Each file conforms to
[`schemas/v0.1/release-attestation.schema.json`](../../../schemas/v0.1/release-attestation.schema.json).

This directory is intentionally empty in the example bundle: attestations
are produced by the release pipeline at release time, signed by the
producer's keys, and published alongside the bundle. Including a
sample signed attestation here would either require shipping a real
private key (unsafe) or shipping a knowingly invalid signature
(misleading). See `conformance/valid/` for a minimal *unsigned*
attestation suitable for schema-validation.
