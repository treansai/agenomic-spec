# Changelog

All notable changes to this specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches v1.0. While at v0.x, breaking changes are allowed and are
documented here.

## [Unreleased]

### Added
- Initial public scaffolding of the AgentLock specification.
- JSON Schemas (Draft 2020-12) for `genome`, `agent-lock`, `behavior-contract`,
  `trace-event`, `replay-report`, `release-attestation`, and `atep-event` under
  `schemas/v0.1/`.
- RFCs 0001 through 0008 covering bundle format, canonical Merkle hashing,
  the Agentic Trajectory Event Protocol (ATEP), MCP-native tool references,
  statistical vs deterministic replay, the design/runtime memory split,
  rollback safety, and release attestations.
- Synthetic example agent bundles: `claims-agent`, `support-agent`,
  `trading-risk-agent`.
- Conformance suite under `conformance/` with positive and negative fixtures.
- `scripts/validate.sh` and `scripts/lint-rfcs.sh` enforcement.
- GitHub Actions CI workflow.
- Documentation tutorials under `docs/`.
