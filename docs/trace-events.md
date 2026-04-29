# Trace Events

Trace events are the runtime evidence layer of AgentLock.

## Purpose

A trace event stream should make it possible to reconstruct key execution decisions without requiring exact token-by-token determinism.

Useful event types include:

- run start and finish
- prompt application
- tool call request and completion
- approval request and resolution
- policy decision
- output emission
- error

## Design Notes

- Events should be append-only.
- Payloads may carry digests instead of full content when privacy or size requires it.
- Tool events should preserve server reference and permission scope.
- Approval events should preserve the fact that approval was required, even if the full approval record lives elsewhere.

## Replay Use

Trace events are a replay input, not merely logs. They help implementations compare:

- tool selection
- approval parity
- policy decisions
- output similarity

## Privacy

Runtime memory or user content should be minimized, redacted, or hashed according to policy. The spec allows digests so trace sets can remain evidence-rich without becoming a data dump.
