# Attestations

An attestation is the signed release summary for an agent bundle.

## What It Should Say

A release attestation should identify:

- the subject bundle name and version
- digests for the genome, lockfile, and behavior contract
- replay outcome
- approval outcome
- release status
- signatures

## What It Should Not Replace

An attestation is not the raw replay report, raw trace set, or approval record. Instead, it should point to those materials by digest.

## Release Status

`v0.1` models these states:

- `candidate`
- `approved`
- `rejected`
- `rolled_back`

Implementations may add richer internal states, but public interchange should remain mappable to these values.

## Signing

The specification intentionally stays light on envelope choice in `v0.1`. What matters for interoperability is that:

- the signed subject is clear
- evidence digests are stable
- the signature algorithm and key id are explicit

Future versions may define stricter DSSE or in-toto profiles.
