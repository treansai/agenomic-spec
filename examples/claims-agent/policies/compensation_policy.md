# Compensation Policy (synthetic)

> Identifier: `never_auto_authorize_payout`
> Severity: critical
> Identifier: `pii_minimization`
> Severity: high

This policy file is **synthetic**, intended for spec demonstration. It
encodes two policy rules used by the claims-bot.

## Rule 1 — Never auto-authorize a payout

Identifier: `never_auto_authorize_payout`. Severity: `critical`.

The agent MUST NOT call `propose_compensation` such that the call
returns `success` without an attached human approval. Any such
condition is a `critical` policy violation and MUST emit a
`policy.violation` event into ATEP.

Implementations enforce this through the
`requires_human_approval: true` flag on the `propose_compensation`
tool in the agent lockfile.

## Rule 2 — PII minimization

Identifier: `pii_minimization`. Severity: `high`.

The agent SHOULD prefer tokenized identifiers to direct PII (names,
addresses, policy numbers). When PII must be referenced, the agent
SHOULD redact or shorten:

- redact full names beyond the first letter of the surname,
- never echo full addresses,
- never repeat full policy numbers in the final output.

Replay-time enforcement is via the `tone_is_empathetic` rule
(qualitative signal) and policy review at human approval time.

## Review

This policy is reviewed quarterly by the Claims Platform team.
